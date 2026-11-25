import { AuthenticationMethod } from '../../../shared/auth';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import { HttpError } from '../../../shared/http/http-client';
import type { HttpRequestOptions } from '../../../shared/http/http-client';
import { createAzureDevOpsSession } from '../../../shared/session/azure-devops-session';
import { searchWorkItems } from './feature';

function makeContext(
  handler: (
    req: HttpRequestOptions,
  ) => Promise<{ status: number; data: unknown }>,
  organizationUrl = 'https://dev.azure.com/test-org',
  defaultProject?: string,
) {
  const http = {
    request: async <T = unknown>(req: HttpRequestOptions) => {
      const res = await handler(req);
      return { status: res.status, headers: {}, data: res.data as T };
    },
    get: <T = unknown>(
      url: string,
      opts?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => http.request<T>({ ...opts, method: 'GET', url }),
    post: <T = unknown>(
      url: string,
      body?: unknown,
      opts?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => http.request<T>({ ...opts, method: 'POST', url, body }),
    put: <T = unknown>(
      url: string,
      body?: unknown,
      opts?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => http.request<T>({ ...opts, method: 'PUT', url, body }),
  };

  return createAzureDevOpsSession(
    {
      organizationUrl,
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: 'test-pat',
      defaultProject,
    },
    { httpClient: http },
  );
}

describe('searchWorkItems', () => {
  it('constructs project-scoped and org-wide search requests accurately', async () => {
    let captured: HttpRequestOptions | undefined;
    const ctx = makeContext(async (req) => {
      captured = req;
      return { status: 200, data: { count: 0, results: [], facets: {} } };
    });

    await searchWorkItems(ctx, {
      searchText: 'crash',
      projectId: 'MyProj',
      filters: { 'System.State': ['Active'] },
      top: 25,
    });

    expect(captured?.url).toBe(
      'https://almsearch.dev.azure.com/test-org/MyProj/_apis/search/workitemsearchresults',
    );
    expect(captured?.body).toMatchObject({
      searchText: 'crash',
      $top: 25,
      filters: {
        'System.TeamProject': ['MyProj'],
        'System.State': ['Active'],
      },
    });
  });

  it('requires projectId on Azure DevOps Server when no defaultProject is configured', async () => {
    const ctx = makeContext(
      async () => ({ status: 200, data: {} }),
      'https://ado.local/tfs/DefaultCollection',
    );
    await expect(searchWorkItems(ctx, { searchText: 'bug' })).rejects.toThrow(
      AzureDevOpsValidationError,
    );
  });

  it('falls back to defaultProject on Azure DevOps Server without duplicating project segment on project-suffixed URLs', async () => {
    const urls: string[] = [];
    const collectionCtx = makeContext(
      async (req) => {
        urls.push(req.url);
        return { status: 200, data: { count: 0, results: [], facets: {} } };
      },
      'https://ado.local/tfs/DefaultCollection',
      'My Project',
    );
    await searchWorkItems(collectionCtx, { searchText: 'bug' });

    const projectSuffixedCtx = makeContext(
      async (req) => {
        urls.push(req.url);
        return { status: 200, data: { count: 0, results: [], facets: {} } };
      },
      'https://ado.local/tfs/DefaultCollection/MyProject',
      'MyProject',
    );
    await searchWorkItems(projectSuffixedCtx, { searchText: 'bug' });

    expect(urls).toEqual([
      'https://ado.local/tfs/DefaultCollection/My%20Project/_apis/search/workitemsearchresults',
      'https://ado.local/tfs/DefaultCollection/MyProject/_apis/search/workitemsearchresults',
    ]);
  });

  it.each([
    [400, AzureDevOpsValidationError],
    [401, AzureDevOpsAuthenticationError],
    [403, AzureDevOpsPermissionError],
    [404, AzureDevOpsResourceNotFoundError],
  ] as const)(
    'maps actual HTTP %d responses to %p (not mocked AzureDevOpsError)',
    async (status, ErrorClass) => {
      const ctx = makeContext(async (req) => {
        throw new HttpError({
          message: `HTTP ${status}`,
          status,
          statusText: 'Error',
          url: req.url,
        });
      });

      await expect(
        searchWorkItems(ctx, { searchText: 'x', projectId: 'MyProj' }),
      ).rejects.toThrow(ErrorClass);
    },
  );
});
