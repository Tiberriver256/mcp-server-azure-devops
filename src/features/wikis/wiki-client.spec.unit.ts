import { AuthenticationMethod } from '../../shared/auth';
import {
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors';
import { HttpError } from '../../shared/http/http-client';
import type { HttpRequestOptions } from '../../shared/http/http-client';
import { createAzureDevOpsSession } from '../../shared/session/azure-devops-session';
import type { ToolContext } from '../../shared/session/azure-devops-session';
import { createWiki } from './create-wiki/feature';
import { createWikiPage } from './create-wiki-page/feature';
import { WikiType } from './schemas';
import { WikiClient } from './wiki-client';

function createFakeContext(
  handler: (req: HttpRequestOptions) => Promise<{
    status: number;
    headers?: Record<string, string>;
    data: unknown;
  }>,
  overrides: { organizationUrl?: string; apiVersion?: string } = {},
): ToolContext {
  const requests: HttpRequestOptions[] = [];
  const http = {
    request: async <T = unknown>(req: HttpRequestOptions) => {
      requests.push(req);
      const res = await handler(req);
      return {
        status: res.status,
        headers: res.headers ?? {},
        data: res.data as T,
      };
    },
    get: async <T = unknown>(
      url: string,
      opts?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => http.request<T>({ ...opts, method: 'GET', url }),
    post: async <T = unknown>(
      url: string,
      body?: unknown,
      opts?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => http.request<T>({ ...opts, method: 'POST', url, body }),
    put: async <T = unknown>(
      url: string,
      body?: unknown,
      opts?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => http.request<T>({ ...opts, method: 'PUT', url, body }),
  };

  return createAzureDevOpsSession(
    {
      organizationUrl:
        overrides.organizationUrl ?? 'https://dev.azure.com/test-org',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: 'test-pat',
      defaultProject: 'test-proj',
      apiVersion: overrides.apiVersion ?? '7.1',
    },
    { httpClient: http },
  );
}

describe('WikiClient & Wiki feature operations', () => {
  it('passes raw Unicode pagePath to query params so paths are never double-encoded', async () => {
    const captured: HttpRequestOptions[] = [];
    const ctx = createFakeContext(async (req) => {
      captured.push(req);
      if (req.method === 'GET') {
        throw new HttpError({
          message: 'Not found',
          status: 404,
          statusText: 'Not Found',
          url: req.url,
        });
      }
      return {
        status: 201,
        headers: { etag: '"v1"' },
        data: { path: '/Über/Spaced Page', content: '# Hallo' },
      };
    });

    const result = await createWikiPage(
      {
        projectId: 'test-proj',
        wikiId: 'my-wiki',
        pagePath: '/Über/Spaced Page',
        content: '# Hallo',
        comment: 'Initial commit',
      },
      ctx,
    );

    expect(result).toMatchObject({
      path: '/Über/Spaced Page',
      version: 'v1',
      message: 'Page created successfully',
    });

    const putReq = captured.find((r) => r.method === 'PUT');
    expect(putReq).toBeDefined();
    expect(putReq?.query).toEqual({
      'api-version': '7.1',
      path: '/Über/Spaced Page',
      comment: 'Initial commit',
    });
    expect(putReq?.headers?.['If-Match']).toBeUndefined();
  });

  it('sends quoted If-Match ETag when updating an existing page', async () => {
    const captured: HttpRequestOptions[] = [];
    const ctx = createFakeContext(async (req) => {
      captured.push(req);
      if (req.method === 'GET') {
        return {
          status: 200,
          headers: { etag: '"etag-42"' },
          data: 'old content',
        };
      }
      return {
        status: 200,
        headers: { etag: '"etag-43"' },
        data: { path: '/Home', content: 'new content' },
      };
    });

    const client = new WikiClient(ctx);
    const result = await client.updatePage(
      { content: 'new content' },
      'test-proj',
      'my-wiki',
      '/Home',
    );

    expect(result).toMatchObject({
      version: 'etag-43',
      message: 'Page updated successfully',
    });
    const putReq = captured.find((r) => r.method === 'PUT');
    expect(putReq?.headers?.['If-Match']).toBe('"etag-42"');
  });

  it('paginates listWikiPages via continuationToken, sorts by (order, path), and guards cycles', async () => {
    let call = 0;
    const ctx = createFakeContext(async () => {
      call += 1;
      if (call === 1) {
        return {
          status: 200,
          data: {
            value: [
              { id: 3, path: '/Zeta', order: 2 },
              { id: 4, path: '/NoOrder' },
            ],
            continuationToken: 'tok-2',
          },
        };
      }
      return {
        status: 200,
        data: {
          value: [
            { id: 1, path: '/Beta', order: 1 },
            { id: 2, path: '/Alpha', order: 1 },
          ],
        },
      };
    });

    const client = new WikiClient(ctx);
    const pages = await client.listWikiPages('test-proj', 'my-wiki');
    expect(pages.map((p) => p.path)).toEqual([
      '/Alpha',
      '/Beta',
      '/Zeta',
      '/NoOrder',
    ]);

    // Cycle detection
    const cyclicCtx = createFakeContext(async () => ({
      status: 200,
      data: { value: [{ id: 1, path: '/A' }], continuationToken: 'same-token' },
    }));
    const cyclicClient = new WikiClient(cyclicCtx);
    await expect(
      cyclicClient.listWikiPages('test-proj', 'my-wiki'),
    ).rejects.toThrow(AzureDevOpsError);
  });

  it('validates codeWiki requires repositoryId and maps HTTP errors accurately', async () => {
    const ctx = createFakeContext(async (req) => {
      if (req.url.includes('/_apis/projects/')) {
        throw new HttpError({
          message: 'Forbidden',
          status: 403,
          statusText: 'Forbidden',
          url: req.url,
        });
      }
      return { status: 200, data: {} };
    });

    await expect(
      createWiki(ctx, {
        projectId: 'test-proj',
        name: 'code-wiki',
        type: WikiType.CodeWiki,
      }),
    ).rejects.toThrow(AzureDevOpsValidationError);

    await expect(
      createWiki(ctx, {
        projectId: 'test-proj',
        name: 'proj-wiki',
        type: WikiType.ProjectWiki,
      }),
    ).rejects.toThrow(AzureDevOpsPermissionError);
  });

  it('uses configured on-prem server collection URL and apiVersion', async () => {
    const captured: HttpRequestOptions[] = [];
    const ctx = createFakeContext(
      async (req) => {
        captured.push(req);
        return {
          status: 200,
          data: 'on-prem content',
          headers: { etag: '"1"' },
        };
      },
      {
        organizationUrl: 'https://ado.local:8080/tfs/DefaultCollection',
        apiVersion: '7.0',
      },
    );

    const client = new WikiClient(ctx);
    const page = await client.getPage('test-proj', 'w1', 'Guide');
    expect(page).toEqual({ content: 'on-prem content', eTag: '1' });
    expect(captured[0].url).toBe(
      'https://ado.local:8080/tfs/DefaultCollection/test-proj/_apis/wiki/wikis/w1/pages',
    );
    expect(captured[0].query).toEqual({ 'api-version': '7.0', path: '/Guide' });
  });

  it('maps 404 from getPage to AzureDevOpsResourceNotFoundError', async () => {
    const ctx = createFakeContext(async (req) => {
      throw new HttpError({
        message: 'Page not found',
        status: 404,
        statusText: 'Not Found',
        url: req.url,
      });
    });

    const client = new WikiClient(ctx);
    await expect(client.getPage('test-proj', 'w1', '/Missing')).rejects.toThrow(
      AzureDevOpsResourceNotFoundError,
    );
  });

  it('paginates listWikiPages using x-ms-continuationtoken response header when body omits token', async () => {
    let call = 0;
    const bodies: unknown[] = [];
    const ctx = createFakeContext(async (req) => {
      call += 1;
      bodies.push(req.body);
      if (call === 1) {
        const headers: Record<string, string> = {
          'x-ms-continuationtoken': 'hdr-tok-2',
        };
        return {
          status: 200,
          headers,
          data: { value: [{ id: 1, path: '/Page1', order: 1 }] },
        };
      }
      return {
        status: 200,
        data: { value: [{ id: 2, path: '/Page2', order: 2 }] },
      };
    });

    const client = new WikiClient(ctx);
    const pages = await client.listWikiPages('test-proj', 'my-wiki');
    expect(pages.map((p) => p.path)).toEqual(['/Page1', '/Page2']);
    expect(bodies[1]).toEqual({ top: 100, continuationToken: 'hdr-tok-2' });
  });

  it('encodes spaced/special-character project & wiki IDs and normalizes updatePage path', async () => {
    const captured: HttpRequestOptions[] = [];
    const ctx = createFakeContext(async (req) => {
      captured.push(req);
      if (req.method === 'GET') {
        return { status: 200, headers: { etag: '"e1"' }, data: 'old' };
      }
      return {
        status: 200,
        headers: { etag: '"e2"' },
        data: { path: '/Guide/Intro' },
      };
    });

    const client = new WikiClient(ctx);
    await client.updatePage(
      { content: 'updated' },
      'My Project',
      'My#Wiki',
      'Guide/Intro',
    );

    expect(captured[0].url).toBe(
      'https://dev.azure.com/test-org/My%20Project/_apis/wiki/wikis/My%23Wiki/pages',
    );
    expect(captured[1].url).toBe(
      'https://dev.azure.com/test-org/My%20Project/_apis/wiki/wikis/My%23Wiki/pages',
    );
    expect(captured[1].query?.path).toBe('/Guide/Intro');
  });
});
