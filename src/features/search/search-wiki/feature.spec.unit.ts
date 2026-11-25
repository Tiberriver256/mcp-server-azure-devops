import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
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
import { clearSearchApiVersionCache } from '../api-version.ts';
import { searchWiki } from './feature.ts';

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

void describe('searchWiki', () => {
  beforeEach(() => {
    clearSearchApiVersionCache();
    mock.method(globalThis, 'fetch', () =>
      Promise.reject(new Error('offline unit test')),
    );
  });

  afterEach(() => {
    mock.restoreAll();
    clearSearchApiVersionCache();
  });

  void it('supports org-wide search on Services and merges project filters', async () => {
    let captured: HttpRequestOptions | undefined;
    const ctx = makeContext(async (req) => {
      captured = req;
      return {
        status: 200,
        data: { count: 1, results: [], facets: {}, infoCode: 0 },
      };
    });

    await searchWiki(ctx, {
      searchText: 'onboarding',
      filters: { Project: ['ExtraProj'] },
    });

    assert.strictEqual(
      captured?.url,
      'https://almsearch.dev.azure.com/test-org/_apis/search/wikisearchresults',
    );
    assert.deepStrictEqual(
      (captured?.body as { filters?: { Project: string[] } } | undefined)
        ?.filters,
      {
        Project: ['ExtraProj'],
      },
    );
  });

  void it('requires projectId for Azure DevOps Server on-prem wiki search when no defaultProject is configured', async () => {
    const ctx = makeContext(
      async () => ({ status: 200, data: {} }),
      'https://ado.local/tfs/DefaultCollection',
    );

    await assert.rejects(
      () => searchWiki(ctx, { searchText: 'onboarding' }),
      AzureDevOpsValidationError,
    );
  });

  void it('falls back to defaultProject on Azure DevOps Server without duplicating project segment on project-suffixed URLs', async () => {
    const urls: string[] = [];
    const collectionCtx = makeContext(
      async (req) => {
        urls.push(req.url);
        return { status: 200, data: { count: 0, results: [], facets: {} } };
      },
      'https://ado.local/tfs/DefaultCollection',
      'My Project',
    );
    await searchWiki(collectionCtx, { searchText: 'onboarding' });

    const projectSuffixedCtx = makeContext(
      async (req) => {
        urls.push(req.url);
        return { status: 200, data: { count: 0, results: [], facets: {} } };
      },
      'https://ado.local/tfs/DefaultCollection/MyProject',
      'MyProject',
    );
    await searchWiki(projectSuffixedCtx, { searchText: 'onboarding' });

    assert.deepStrictEqual(urls, [
      'https://ado.local/tfs/DefaultCollection/My%20Project/_apis/search/wikisearchresults',
      'https://ado.local/tfs/DefaultCollection/MyProject/_apis/search/wikisearchresults',
    ]);
  });

  const errorStatusCases = [
    [400, AzureDevOpsValidationError],
    [401, AzureDevOpsAuthenticationError],
    [403, AzureDevOpsPermissionError],
    [404, AzureDevOpsResourceNotFoundError],
  ] as const;

  for (const [status, ExpectedError] of errorStatusCases) {
    void it(`maps HTTP ${status} to ${ExpectedError.name}`, async () => {
      const ctx = makeContext(async (req) => {
        throw new HttpError({
          message: `HTTP ${status}`,
          status,
          statusText: 'Error',
          url: req.url,
        });
      });

      await assert.rejects(
        () => searchWiki(ctx, { searchText: 'x', projectId: 'proj1' }),
        ExpectedError,
      );
    });
  }
});
