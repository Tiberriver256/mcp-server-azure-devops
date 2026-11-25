import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import {
  getOrgNameFromUrl,
  resolveAzureDevOpsBaseUrls,
} from './azure-devops-url.ts';

/**
 * Independent RFC-3986 regex grammar oracle for Azure DevOps URLs (does NOT
 * share parsing helpers with `azure-devops-url.ts`).
 */
const RFC3986_URL_RE =
  /^(https?):\/\/([a-zA-Z0-9.-]+)(?::(\d+))?(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/;

function oracleResolveUrl(rawUrl: string, projectId?: string) {
  const m = RFC3986_URL_RE.exec(rawUrl);
  if (!m) {
    return null;
  }
  const scheme = m[1].toLowerCase();
  const host = m[2].toLowerCase();
  const port = m[3] ? `:${m[3]}` : '';
  const origin = `${scheme}://${host}${port}`;
  const pathParts = (m[4] ?? '')
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));

  if (host === 'dev.azure.com') {
    const org = pathParts[0];
    if (!org) {
      return null;
    }
    return {
      type: 'services' as const,
      orgOrCollection: org,
      coreBaseUrl: `https://dev.azure.com/${org}`,
      searchBaseUrl: `https://almsearch.dev.azure.com/${org}`,
    };
  }

  if (host.endsWith('.visualstudio.com')) {
    const org = host.slice(0, host.indexOf('.'));
    if (!org) {
      return null;
    }
    return {
      type: 'services' as const,
      orgOrCollection: org,
      coreBaseUrl: `https://dev.azure.com/${org}`,
      searchBaseUrl: `https://almsearch.dev.azure.com/${org}`,
    };
  }

  if (pathParts.length === 0) {
    return null;
  }
  if (pathParts.length === 1 && pathParts[0].toLowerCase() === 'tfs') {
    return null;
  }

  let effectiveParts = pathParts;
  if (
    projectId &&
    pathParts.length >= 2 &&
    pathParts[pathParts.length - 1].toLowerCase() === projectId.toLowerCase()
  ) {
    effectiveParts = pathParts.slice(0, -1);
  }

  const collection = effectiveParts[effectiveParts.length - 1];
  const coreBaseUrl = `${origin}/${effectiveParts.join('/')}`;
  return {
    type: 'server' as const,
    orgOrCollection: collection,
    coreBaseUrl,
    searchBaseUrl: coreBaseUrl,
  };
}

const slugArb = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,14}$/);
const vstsSlugArb = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,14}[a-z0-9]$/);
const serverHostArb = fc
  .tuple(vstsSlugArb, fc.constantFrom('corp.local', 'ado.internal', 'tfs.lan'))
  .map(([sub, dom]) => `${sub}.${dom}`);

void describe('azure-devops-url differential tests vs independent RFC-3986 grammar oracle', () => {
  void it('agrees with RFC-3986 grammar oracle across cloud, legacy visualstudio.com, and on-prem URLs', () => {
    const scenarioArb = fc.oneof(
      // dev.azure.com
      fc
        .tuple(slugArb, fc.option(slugArb, { nil: undefined }))
        .map(([org, proj]) => ({
          url: `https://dev.azure.com/${org}${proj ? `/${proj}` : ''}`,
          projectId: proj,
        })),
      // *.visualstudio.com
      fc
        .tuple(vstsSlugArb, fc.option(slugArb, { nil: undefined }))
        .map(([org, proj]) => ({
          url: `https://${org}.visualstudio.com${proj ? `/${proj}` : ''}`,
          projectId: proj,
        })),
      // On-prem with optional virtual dir, port, and project suffix
      fc
        .tuple(
          fc.constantFrom('http', 'https'),
          serverHostArb,
          fc.option(fc.integer({ min: 8080, max: 9443 }), { nil: undefined }),
          fc.constantFrom([], ['tfs'], ['devops', 'tfs']),
          slugArb.filter((s) => s.toLowerCase() !== 'tfs'),
          fc.option(slugArb, { nil: undefined }),
        )
        .map(([scheme, host, port, vdirs, col, proj]) => ({
          url: `${scheme}://${host}${port ? `:${port}` : ''}/${[...vdirs, col, ...(proj ? [proj] : [])].join('/')}`,
          projectId: proj,
        })),
    );

    fc.assert(
      fc.property(scenarioArb, ({ url, projectId }) => {
        const expected = oracleResolveUrl(url, projectId);
        assert.ok(expected !== null);

        const actual = resolveAzureDevOpsBaseUrls(url, { projectId });
        assert.strictEqual(actual.type, expected.type);
        assert.strictEqual(
          actual.organization ?? actual.collection,
          expected.orgOrCollection,
        );
        assert.strictEqual(actual.coreBaseUrl, expected.coreBaseUrl);
        assert.strictEqual(actual.searchBaseUrl, expected.searchBaseUrl);

        if (!projectId) {
          assert.strictEqual(getOrgNameFromUrl(url), expected.orgOrCollection);
        }
      }),
      { numRuns: 200 },
    );
  });
});
