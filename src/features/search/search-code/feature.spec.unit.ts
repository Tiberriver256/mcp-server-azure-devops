import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Readable } from 'stream';
import type { WebApi } from 'azure-devops-node-api';
import { AuthenticationMethod } from '../../../shared/auth/index.ts';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { HttpError } from '../../../shared/http/http-client.ts';
import type { HttpRequestOptions } from '../../../shared/http/http-client.ts';
import { createAzureDevOpsSession } from '../../../shared/session/azure-devops-session.ts';
import { searchCode } from './feature.ts';

function makeSearchContext(
  handler: (
    req: HttpRequestOptions,
  ) => Promise<{ status: number; data: unknown }>,
  organizationUrl = 'https://dev.azure.com/test-org',
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
      defaultProject: 'default-proj',
      apiVersion: '7.1',
    },
    { httpClient: http },
  );
}

void describe('searchCode', () => {
  void it('posts to almsearch.dev.azure.com, caps top to 10 when includeContent=true, and enriches file streams', async () => {
    let capturedReq: HttpRequestOptions | undefined;
    const ctx = makeSearchContext(async (req) => {
      capturedReq = req;
      return {
        status: 200,
        data: {
          count: 1,
          results: [
            {
              fileName: 'index.ts',
              path: '/src/index.ts',
              project: { name: 'proj1', id: 'p1' },
              repository: { name: 'repo1', id: 'r1', type: 'git' },
              versions: [{ branchName: 'main', changeId: 'abc123' }],
              matches: {},
            },
          ],
          facets: {},
          infoCode: 0,
        },
      };
    });

    const mockGitApi = {
      getItemContent: mock.fn(() =>
        Promise.resolve(Readable.from([Buffer.from('export const x = 1;')])),
      ),
    };
    const connection = {
      serverUrl: 'https://dev.azure.com/test-org',
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
    } as unknown as WebApi;

    const result = await searchCode(
      connection,
      {
        searchText: 'const x',
        projectId: 'proj1',
        top: 50,
        includeContent: true,
      },
      ctx,
    );

    assert.strictEqual(
      capturedReq?.url,
      'https://almsearch.dev.azure.com/test-org/proj1/_apis/search/codesearchresults',
    );
    assert.strictEqual(
      (capturedReq?.body as { $top?: number } | undefined)?.$top,
      10,
    );
    assert.strictEqual(result.results[0].content, 'export const x = 1;');
  });

  void it('targets on-premises Server collection URL directly', async () => {
    let capturedUrl = '';
    const ctx = makeSearchContext(async (req) => {
      capturedUrl = req.url;
      return {
        status: 200,
        data: { count: 0, results: [], facets: {}, infoCode: 0 },
      };
    }, 'https://ado.local:8080/tfs/DefaultCollection');

    const connection = {
      serverUrl: 'https://ado.local:8080/tfs/DefaultCollection',
      getGitApi: mock.fn(),
    } as unknown as WebApi;

    await searchCode(
      connection,
      { searchText: 'foo', projectId: 'MyProj', includeContent: false },
      ctx,
    );

    assert.strictEqual(
      capturedUrl,
      'https://ado.local:8080/tfs/DefaultCollection/MyProj/_apis/search/codesearchresults',
    );
  });

  const errorStatusCases = [
    [400, AzureDevOpsValidationError],
    [401, AzureDevOpsAuthenticationError],
    [403, AzureDevOpsPermissionError],
    [404, AzureDevOpsResourceNotFoundError],
  ] as const;

  for (const [status, ExpectedError] of errorStatusCases) {
    void it(`maps HTTP ${status} to ${ExpectedError.name}`, async () => {
      const ctx = makeSearchContext(async (req) => {
        throw new HttpError({
          message: `HTTP ${status}`,
          status,
          statusText: 'Error',
          url: req.url,
        });
      });

      const connection = {
        serverUrl: 'https://dev.azure.com/test-org',
        getGitApi: mock.fn(),
      } as unknown as WebApi;

      await assert.rejects(
        () =>
          searchCode(connection, { searchText: 'x', projectId: 'proj1' }, ctx),
        ExpectedError,
      );
    });
  }
});
