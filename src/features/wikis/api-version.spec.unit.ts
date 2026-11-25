import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { AuthenticationMethod } from '../../shared/auth/index.ts';
import { resolveAzureDevOpsBaseUrls } from '../../shared/azure-devops-url.ts';
import { AzureDevOpsValidationError } from '../../shared/errors/index.ts';
import type { HttpRequestOptions } from '../../shared/http/http-client.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';
import {
  CORE_PROJECTS_LOCATION_ID,
  WIKI_PAGES_BATCH_LOCATION_ID,
  WIKI_PAGES_LOCATION_ID,
  WIKI_WIKIS_LOCATION_ID,
  clearWikiApiVersionCache,
} from './api-version.ts';
import { WikiClient } from './wiki-client.ts';

interface WikiProfile {
  readonly name: string;
  readonly orgUrl: string;
  readonly maxVersion: string;
  readonly supportsPagesBatch: boolean;
  readonly pagesBatchPreviewOnly: boolean;
  readonly expectedGaVersion: string;
  readonly expectedPagesBatchVersion?: string;
}

const PROFILES: readonly WikiProfile[] = [
  {
    name: 'server-2019-rtm',
    orgUrl: 'https://ado2019.local/tfs/DefaultCollection',
    maxVersion: '5.0',
    supportsPagesBatch: false,
    pagesBatchPreviewOnly: false,
    expectedGaVersion: '5.0',
  },
  {
    name: 'server-2020',
    orgUrl: 'https://ado2020.local/tfs/DefaultCollection',
    maxVersion: '6.0',
    supportsPagesBatch: true,
    pagesBatchPreviewOnly: true,
    expectedGaVersion: '6.0',
    expectedPagesBatchVersion: '6.0-preview.1',
  },
  {
    name: 'server-2022',
    orgUrl: 'https://ado2022.local/tfs/DefaultCollection',
    maxVersion: '7.0',
    supportsPagesBatch: true,
    pagesBatchPreviewOnly: false,
    expectedGaVersion: '7.0',
    expectedPagesBatchVersion: '7.0',
  },
  {
    name: 'services',
    orgUrl: 'https://dev.azure.com/demo-org',
    maxVersion: '7.1',
    supportsPagesBatch: true,
    pagesBatchPreviewOnly: false,
    expectedGaVersion: '7.1',
    expectedPagesBatchVersion: '7.1',
  },
];

function makeOptionsResponse(profile: WikiProfile, url: string): Response {
  if (url.endsWith('/_apis/core')) {
    return new Response(
      JSON.stringify({
        count: 1,
        value: [
          {
            id: CORE_PROJECTS_LOCATION_ID,
            area: 'core',
            resourceName: 'projects',
            resourceVersion: 4,
            minVersion: '1.0',
            maxVersion: profile.maxVersion,
            releasedVersion: profile.maxVersion,
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  const locations = [
    {
      id: WIKI_WIKIS_LOCATION_ID,
      area: 'wiki',
      resourceName: 'wikis',
      resourceVersion: 2,
      minVersion: '1.0',
      maxVersion: profile.maxVersion,
      releasedVersion: profile.maxVersion,
    },
    {
      id: WIKI_PAGES_LOCATION_ID,
      area: 'wiki',
      resourceName: 'pages',
      resourceVersion: 1,
      minVersion: '1.0',
      maxVersion: profile.maxVersion,
      releasedVersion: profile.maxVersion,
    },
  ];

  if (profile.supportsPagesBatch) {
    locations.push({
      id: WIKI_PAGES_BATCH_LOCATION_ID,
      area: 'wiki',
      resourceName: 'pagesBatch',
      resourceVersion: 1,
      minVersion: '6.0',
      maxVersion: profile.maxVersion,
      releasedVersion: profile.pagesBatchPreviewOnly
        ? '0.0'
        : profile.maxVersion,
    });
  }

  return new Response(
    JSON.stringify({ count: locations.length, value: locations }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function makeWikiSession(
  orgUrl: string,
  captured: HttpRequestOptions[],
  apiVersion = '7.1',
): ToolContext {
  const baseUrls = resolveAzureDevOpsBaseUrls(orgUrl, {
    projectId: 'DemoProject',
  });
  const http = {
    request: async <T = unknown>(
      req: HttpRequestOptions,
    ): Promise<{
      status: number;
      headers: Record<string, string>;
      data: T;
    }> => {
      captured.push(req);
      if (req.url.includes('/_apis/projects/')) {
        return { status: 200, headers: {}, data: { id: 'proj-guid' } as T };
      }
      if (req.url.endsWith('/pagesbatch')) {
        return {
          status: 200,
          headers: {},
          data: { value: [{ id: 1, path: '/Home', order: 0 }] } as T,
        };
      }
      if (req.method === 'GET') {
        return {
          status: 200,
          headers: { etag: '"e1"' },
          data: '# Demo Wiki' as T,
        };
      }
      return {
        status: 200,
        headers: { etag: '"e2"' },
        data: { id: 'w1', path: '/Home' } as T,
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

void describe('wikis per-area api-version negotiation', () => {
  beforeEach(() => {
    clearWikiApiVersionCache();
  });

  afterEach(() => {
    mock.restoreAll();
    clearWikiApiVersionCache();
  });

  for (const profile of PROFILES) {
    void it(`negotiates wiki/pages, wiki/wikis, core/projects, and pagesbatch on ${profile.name} and caches OPTIONS per area`, async () => {
      const optionsUrls: string[] = [];
      mock.method(
        globalThis,
        'fetch',
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          assert.strictEqual(init?.method, 'OPTIONS');
          optionsUrls.push(url);
          return makeOptionsResponse(profile, url);
        },
      );

      const captured: HttpRequestOptions[] = [];
      const ctx = makeWikiSession(profile.orgUrl, captured);
      const client = new WikiClient(ctx);

      await client.getPage('DemoProject', 'DemoProject.wiki', '/Home');
      await client.updatePage(
        { content: '# Updated' },
        'DemoProject',
        'DemoProject.wiki',
        '/Home',
      );
      await client.createWiki('DemoProject', {
        name: 'NewWiki',
        projectId: 'DemoProject',
        type: 'projectWiki',
      });

      const pageReqs = captured.filter((r) => r.url.endsWith('/pages'));
      const wikiCreateReq = captured.find((r) => r.url.endsWith('/wiki/wikis'));
      const projectReq = captured.find((r) =>
        r.url.includes('/_apis/projects/'),
      );

      assert.ok(pageReqs.length >= 2);
      for (const req of pageReqs) {
        assert.strictEqual(
          req.query?.['api-version'],
          profile.expectedGaVersion,
        );
      }
      assert.strictEqual(
        wikiCreateReq?.query?.['api-version'],
        profile.expectedGaVersion,
      );
      assert.strictEqual(
        projectReq?.query?.['api-version'],
        profile.expectedGaVersion,
      );

      if (!profile.supportsPagesBatch) {
        await assert.rejects(
          () => client.listWikiPages('DemoProject', 'DemoProject.wiki'),
          (error: unknown) => {
            assert.ok(error instanceof AzureDevOpsValidationError);
            assert.match(error.message, /pagesbatch/i);
            assert.match(error.message, /2019|2020|6\.0-preview\.1/i);
            return true;
          },
        );
      } else {
        const pages = await client.listWikiPages(
          'DemoProject',
          'DemoProject.wiki',
        );
        assert.strictEqual(pages.length, 1);
        const batchReq = captured.find((r) => r.url.endsWith('/pagesbatch'));
        assert.strictEqual(
          batchReq?.query?.['api-version'],
          profile.expectedPagesBatchVersion,
        );
      }

      // Only 2 OPTIONS requests total: once for 'wiki', once for 'core'
      assert.strictEqual(optionsUrls.length, 2);
      assert.ok(optionsUrls.some((u) => u.endsWith('/_apis/wiki')));
      assert.ok(optionsUrls.some((u) => u.endsWith('/_apis/core')));
    });
  }

  void it('falls back to configured apiVersion on HTTP 203 HTML or network errors without poisoning cache', async () => {
    let callCount = 0;
    mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response('<!DOCTYPE html><html>Sign In</html>', {
          status: 203,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return makeOptionsResponse(
        PROFILES[0],
        typeof input === 'string' ? input : input.toString(),
      );
    });

    const captured: HttpRequestOptions[] = [];
    const ctx = makeWikiSession(PROFILES[0].orgUrl, captured, '7.1');
    const client = new WikiClient(ctx);

    await client.getPage('DemoProject', 'DemoProject.wiki', '/Home');
    assert.strictEqual(captured[0].query?.['api-version'], '7.1');

    await client.getPage('DemoProject', 'DemoProject.wiki', '/Home');
    assert.strictEqual(captured[1].query?.['api-version'], '5.0');
    assert.strictEqual(callCount, 2);
  });
});
