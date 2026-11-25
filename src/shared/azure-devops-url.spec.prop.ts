import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import {
  formatOrgUrlForLog,
  getOrgNameFromUrl,
  isAzureDevOpsServicesUrl,
  resolveAzureDevOpsBaseUrls,
} from './azure-devops-url.ts';
import { AzureDevOpsValidationError } from './errors/index.ts';

const slugArb = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,18}$/);
const hostnameLabelArb = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,12}[a-z0-9]$/);
const serverHostArb = fc
  .tuple(hostnameLabelArb, fc.constantFrom('local', 'corp', 'internal', 'lan'))
  .map(([label, tld]) => `${label}.${tld}`);

void describe('azure-devops-url properties', () => {
  void it('Services dev.azure.com & *.visualstudio.com URLs resolve idempotently with almsearch host', () => {
    fc.assert(
      fc.property(
        slugArb,
        fc.option(slugArb, { nil: undefined }),
        fc.boolean(),
        (org, project, useVsts) => {
          const rawUrl = useVsts
            ? `https://${org.toLowerCase()}.visualstudio.com${project ? `/${project}` : ''}`
            : `https://dev.azure.com/${org}${project ? `/${project}` : ''}`;

          const resolved = resolveAzureDevOpsBaseUrls(rawUrl);
          assert.strictEqual(resolved.type, 'services');
          assert.strictEqual(isAzureDevOpsServicesUrl(rawUrl), true);
          assert.strictEqual(
            resolved.coreBaseUrl,
            `https://dev.azure.com/${resolved.organization}`,
          );
          assert.strictEqual(
            resolved.searchBaseUrl,
            `https://almsearch.dev.azure.com/${resolved.organization}`,
          );
          assert.strictEqual(getOrgNameFromUrl(rawUrl), resolved.organization);

          // Idempotence: resolving the canonical coreBaseUrl yields the exact same result
          assert.deepStrictEqual(
            resolveAzureDevOpsBaseUrls(resolved.coreBaseUrl),
            resolved,
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  void it('On-premises Azure DevOps Server URLs keep coreBaseUrl === searchBaseUrl and resolve idempotently', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('http', 'https'),
        serverHostArb,
        fc.option(fc.integer({ min: 8000, max: 9999 }), { nil: undefined }),
        fc.array(slugArb, { minLength: 0, maxLength: 2 }),
        slugArb.filter((s) => s.toLowerCase() !== 'tfs'),
        (scheme, host, port, vdirs, collection) => {
          const origin = `${scheme}://${host}${port ? `:${port}` : ''}`;
          const path = [...vdirs, collection].join('/');
          const rawUrl = `${origin}/${path}`;

          const resolved = resolveAzureDevOpsBaseUrls(rawUrl);
          assert.strictEqual(resolved.type, 'server');
          assert.strictEqual(isAzureDevOpsServicesUrl(rawUrl), false);
          assert.strictEqual(resolved.collection, collection);
          assert.strictEqual(resolved.coreBaseUrl, resolved.searchBaseUrl);
          assert.strictEqual(
            resolved.coreBaseUrl.endsWith(`/${collection}`),
            true,
          );
          assert.strictEqual(getOrgNameFromUrl(rawUrl), collection);

          // Idempotence on coreBaseUrl
          assert.deepStrictEqual(
            resolveAzureDevOpsBaseUrls(resolved.coreBaseUrl),
            resolved,
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  void it('Project suffix in Server URL is stripped into projectFromUrl when matching options.projectId', () => {
    fc.assert(
      fc.property(
        serverHostArb,
        slugArb.filter((s) => s.toLowerCase() !== 'tfs'),
        slugArb,
        (host, collection, project) => {
          const urlWithProject = `https://${host}/tfs/${collection}/${project}`;
          const resolved = resolveAzureDevOpsBaseUrls(urlWithProject, {
            projectId: project.toUpperCase(),
          });
          assert.strictEqual(resolved.type, 'server');
          assert.strictEqual(resolved.collection, collection);
          assert.strictEqual(resolved.projectFromUrl, project);
          assert.strictEqual(
            resolved.coreBaseUrl,
            `https://${host}/tfs/${collection}`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  void it('Malformed percent-encoding always throws AzureDevOpsValidationError (never URIError)', () => {
    fc.assert(
      fc.property(
        slugArb,
        fc.constantFrom('%E0%A4%A', '%ZZ', '%2', '%', '%C0%AF'),
        (prefix, badPercent) => {
          const url = `https://dev.azure.com/${prefix}${badPercent}`;
          assert.throws(
            () => resolveAzureDevOpsBaseUrls(url),
            AzureDevOpsValidationError,
          );
          assert.strictEqual(getOrgNameFromUrl(url), undefined);
        },
      ),
      { numRuns: 50 },
    );
  });

  void it('formatOrgUrlForLog never leaks embedded userinfo credentials, query params, or fragments', () => {
    fc.assert(
      fc.property(
        slugArb.filter((s) => s.length >= 6),
        slugArb.filter((s) => s.length >= 8),
        slugArb,
        slugArb.filter((s) => s.length >= 6),
        (user, secretPass, org, queryToken) => {
          const raw = `https://${user}:${secretPass}@dev.azure.com/${org}/?token=${queryToken}#frag_${secretPass}`;
          const formatted = formatOrgUrlForLog(raw);
          assert.strictEqual(formatted, `dev.azure.com/${org}`);
          assert.ok(!formatted.includes(secretPass));
          assert.ok(!formatted.includes(queryToken));
          assert.ok(!formatted.includes('@'));
          assert.ok(!formatted.includes('?'));
          assert.ok(!formatted.includes('#'));
        },
      ),
      { numRuns: 150 },
    );
  });
});
