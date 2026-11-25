import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { AuthenticationMethod } from '../../shared/auth/index.ts';
import { resolveAzureDevOpsBaseUrls } from '../../shared/azure-devops-url.ts';
import type { HttpRequestOptions } from '../../shared/http/http-client.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';
import {
  CODE_SEARCH_LOCATION_ID,
  WIKI_SEARCH_LOCATION_ID,
  WORK_ITEM_SEARCH_LOCATION_ID,
  clearSearchApiVersionCache,
} from './api-version.ts';
import { searchCode } from './search-code/feature.ts';
import { searchWiki } from './search-wiki/feature.ts';
import { searchWorkItems } from './search-work-items/feature.ts';

interface SearchProfile {
  readonly name: string;
  readonly orgUrl: string;
  readonly expectedOptionsUrl: string;
  readonly maxVersion: string;
  readonly previewOnly: boolean;
  readonly expectedApiVersion: string;
}

const PROFILES: readonly SearchProfile[] = [
  {
    name: 'server-2019-rtm',
    orgUrl: 'https://ado2019.local/tfs/DefaultCollection',
    expectedOptionsUrl:
      'https://ado2019.local/tfs/DefaultCollection/_apis/search',
    maxVersion: '5.0',
    previewOnly: true,
    expectedApiVersion: '5.0-preview.1',
  },
  {
    name: 'server-2020',
    orgUrl: 'https://ado2020.local/tfs/DefaultCollection',
    expectedOptionsUrl:
      'https://ado2020.local/tfs/DefaultCollection/_apis/search',
    maxVersion: '6.0',
    previewOnly: true,
    expectedApiVersion: '6.0-preview.1',
  },
  {
    name: 'server-2022',
    orgUrl: 'https://ado2022.local/tfs/DefaultCollection',
    expectedOptionsUrl:
      'https://ado2022.local/tfs/DefaultCollection/_apis/search',
    maxVersion: '7.0',
    previewOnly: false,
    expectedApiVersion: '7.0',
  },
  {
    name: 'services',
    orgUrl: 'https://dev.azure.com/demo-org',
    expectedOptionsUrl: 'https://almsearch.dev.azure.com/demo-org/_apis/search',
    maxVersion: '7.1',
    previewOnly: false,
    expectedApiVersion: '7.1',
  },
];

function makeSearchOptionsResponse(profile: SearchProfile): Response {
  const released = profile.previewOnly ? '0.0' : profile.maxVersion;
  return new Response(
    JSON.stringify({
      count: 3,
      value: [
        {
          id: CODE_SEARCH_LOCATION_ID,
          area: 'search',
          resourceName: 'codeSearchResults',
          resourceVersion: 1,
          minVersion: '1.0',
          maxVersion: profile.maxVersion,
          releasedVersion: released,
        },
        {
          id: WIKI_SEARCH_LOCATION_ID,
          area: 'search',
          resourceName: 'wikiSearchResults',
          resourceVersion: 1,
          minVersion: '1.0',
          maxVersion: profile.maxVersion,
          releasedVersion: released,
        },
        {
          id: WORK_ITEM_SEARCH_LOCATION_ID,
          area: 'search',
          resourceName: 'workItemSearchResults',
          resourceVersion: 1,
          minVersion: '1.0',
          maxVersion: profile.maxVersion,
          releasedVersion: released,
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function makeMockSession(
  orgUrl: string,
  captured: HttpRequestOptions[],
  apiVersion = '7.1',
): ToolContext {
  const baseUrls = resolveAzureDevOpsBaseUrls(orgUrl, {
    projectId: 'DemoProject',
  });
  const http = {
    request: async <T = unknown>(req: HttpRequestOptions) => {
      captured.push(req);
      return {
        status: 200,
        headers: {} as Record<string, string>,
        data: { count: 0, results: [], facets: {}, infoCode: 0 } as T,
      };
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

  return {
    config: {
      organizationUrl: orgUrl,
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: 'test-pat',
      defaultProject: 'DemoProject',
      apiVersion,
      readOnly: false,
      spotlighting: true,
    },
    baseUrls,
    http,
    getWebApi: async () => {
      throw new Error('Unexpected getWebApi');
    },
    getAuthHeader: async () => 'Basic OnRlc3QtcGF0',
    requestAzureDevOps: async <T = unknown>(
      req: HttpRequestOptions & { context: string },
    ) => http.request<T>(req),
    resolveBaseUrls: (opts) => resolveAzureDevOpsBaseUrls(orgUrl, opts),
    resolveProjectId: (explicit) => explicit ?? 'DemoProject',
    resolveOptionalProjectId: (explicit) => explicit ?? 'DemoProject',
  };
}

void describe('search per-area api-version negotiation', () => {
  beforeEach(() => {
    clearSearchApiVersionCache();
  });

  afterEach(() => {
    mock.restoreAll();
    clearSearchApiVersionCache();
  });

  for (const profile of PROFILES) {
    void it(`negotiates ${profile.expectedApiVersion} across code/wiki/work-item search on ${profile.name} and caches OPTIONS`, async () => {
      const fetchCalls: Array<{ url: string; method?: string; auth?: string }> =
        [];
      mock.method(
        globalThis,
        'fetch',
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const headers = new Headers(init?.headers);
          fetchCalls.push({
            url,
            method: init?.method,
            auth: headers.get('authorization') ?? undefined,
          });
          return makeSearchOptionsResponse(profile);
        },
      );

      const captured: HttpRequestOptions[] = [];
      const ctx = makeMockSession(profile.orgUrl, captured);
      const connection = {
        serverUrl: profile.orgUrl,
        getGitApi: mock.fn(),
      } as unknown as WebApi;

      await searchCode(
        connection,
        { projectId: 'DemoProject', searchText: 'greet' },
        ctx,
      );
      await searchWiki(ctx, { projectId: 'DemoProject', searchText: 'guide' });
      await searchWorkItems(ctx, {
        projectId: 'DemoProject',
        searchText: 'bug',
      });

      assert.strictEqual(fetchCalls.length, 1);
      assert.strictEqual(fetchCalls[0].method, 'OPTIONS');
      assert.strictEqual(fetchCalls[0].url, profile.expectedOptionsUrl);
      assert.ok(fetchCalls[0].auth?.startsWith('Basic '));

      assert.strictEqual(captured.length, 3);
      for (const req of captured) {
        assert.strictEqual(
          req.query?.['api-version'],
          profile.expectedApiVersion,
        );
      }
    });

    void it(`also resolves ${profile.expectedApiVersion} when AZURE_DEVOPS_API_VERSION is explicitly set to ${profile.maxVersion} on ${profile.name}`, async () => {
      mock.method(globalThis, 'fetch', async () =>
        makeSearchOptionsResponse(profile),
      );
      const captured: HttpRequestOptions[] = [];
      const ctx = makeMockSession(profile.orgUrl, captured, profile.maxVersion);
      const connection = {
        serverUrl: profile.orgUrl,
        getGitApi: mock.fn(),
      } as unknown as WebApi;

      await searchCode(
        connection,
        { projectId: 'DemoProject', searchText: 'greet' },
        ctx,
      );
      assert.strictEqual(
        captured[0].query?.['api-version'],
        profile.expectedApiVersion,
      );
    });
  }

  void it('falls back to configured apiVersion on HTTP 203 HTML or network errors without poisoning cache', async () => {
    let callCount = 0;
    mock.method(globalThis, 'fetch', async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response('<!DOCTYPE html><html>Sign In</html>', {
          status: 203,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return makeSearchOptionsResponse(PROFILES[1]);
    });

    const captured: HttpRequestOptions[] = [];
    const ctx = makeMockSession(PROFILES[1].orgUrl, captured, '7.1');

    await searchWiki(ctx, { projectId: 'DemoProject', searchText: 'first' });
    assert.strictEqual(captured[0].query?.['api-version'], '7.1');

    await searchWiki(ctx, { projectId: 'DemoProject', searchText: 'second' });
    assert.strictEqual(captured[1].query?.['api-version'], '6.0-preview.1');
    assert.strictEqual(callCount, 2);
  });
});
