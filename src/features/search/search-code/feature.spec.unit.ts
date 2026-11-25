import { Readable } from 'stream';
import type { WebApi } from 'azure-devops-node-api';
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
import { searchCode } from './feature';

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

describe('searchCode', () => {
  it('posts to almsearch.dev.azure.com, caps top to 10 when includeContent=true, and enriches file streams', async () => {
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
      getItemContent: jest
        .fn()
        .mockResolvedValue(Readable.from([Buffer.from('export const x = 1;')])),
    };
    const connection = {
      serverUrl: 'https://dev.azure.com/test-org',
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
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

    expect(capturedReq?.url).toBe(
      'https://almsearch.dev.azure.com/test-org/proj1/_apis/search/codesearchresults',
    );
    expect((capturedReq?.body as { $top?: number } | undefined)?.$top).toBe(10);
    expect(result.results[0].content).toBe('export const x = 1;');
  });

  it('targets on-premises Server collection URL directly', async () => {
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
      getGitApi: jest.fn(),
    } as unknown as WebApi;

    await searchCode(
      connection,
      { searchText: 'foo', projectId: 'MyProj', includeContent: false },
      ctx,
    );

    expect(capturedUrl).toBe(
      'https://ado.local:8080/tfs/DefaultCollection/MyProj/_apis/search/codesearchresults',
    );
  });

  it.each([
    [400, AzureDevOpsValidationError],
    [401, AzureDevOpsAuthenticationError],
    [403, AzureDevOpsPermissionError],
    [404, AzureDevOpsResourceNotFoundError],
  ] as const)('maps HTTP %d to %p', async (status, ErrorClass) => {
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
      getGitApi: jest.fn(),
    } as unknown as WebApi;

    await expect(
      searchCode(connection, { searchText: 'x', projectId: 'proj1' }, ctx),
    ).rejects.toThrow(ErrorClass);
  });
});
