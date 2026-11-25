import fc from 'fast-check';
import {
  formatOrgUrlForLog,
  getOrgNameFromUrl,
  isAzureDevOpsServicesUrl,
  resolveAzureDevOpsBaseUrls,
} from './azure-devops-url';
import { AzureDevOpsValidationError } from './errors';

const slugArb = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,18}$/);
const hostnameLabelArb = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,12}[a-z0-9]$/);
const serverHostArb = fc
  .tuple(hostnameLabelArb, fc.constantFrom('local', 'corp', 'internal', 'lan'))
  .map(([label, tld]) => `${label}.${tld}`);

describe('azure-devops-url properties', () => {
  it('Services dev.azure.com & *.visualstudio.com URLs resolve idempotently with almsearch host', () => {
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
          expect(resolved.type).toBe('services');
          expect(isAzureDevOpsServicesUrl(rawUrl)).toBe(true);
          expect(resolved.coreBaseUrl).toBe(
            `https://dev.azure.com/${resolved.organization}`,
          );
          expect(resolved.searchBaseUrl).toBe(
            `https://almsearch.dev.azure.com/${resolved.organization}`,
          );
          expect(getOrgNameFromUrl(rawUrl)).toBe(resolved.organization);

          // Idempotence: resolving the canonical coreBaseUrl yields the exact same result
          expect(resolveAzureDevOpsBaseUrls(resolved.coreBaseUrl)).toEqual(
            resolved,
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  it('On-premises Azure DevOps Server URLs keep coreBaseUrl === searchBaseUrl and resolve idempotently', () => {
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
          expect(resolved.type).toBe('server');
          expect(isAzureDevOpsServicesUrl(rawUrl)).toBe(false);
          expect(resolved.collection).toBe(collection);
          expect(resolved.coreBaseUrl).toBe(resolved.searchBaseUrl);
          expect(resolved.coreBaseUrl.endsWith(`/${collection}`)).toBe(true);
          expect(getOrgNameFromUrl(rawUrl)).toBe(collection);

          // Idempotence on coreBaseUrl
          expect(resolveAzureDevOpsBaseUrls(resolved.coreBaseUrl)).toEqual(
            resolved,
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  it('Project suffix in Server URL is stripped into projectFromUrl when matching options.projectId', () => {
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
          expect(resolved.type).toBe('server');
          expect(resolved.collection).toBe(collection);
          expect(resolved.projectFromUrl).toBe(project);
          expect(resolved.coreBaseUrl).toBe(
            `https://${host}/tfs/${collection}`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Malformed percent-encoding always throws AzureDevOpsValidationError (never URIError)', () => {
    fc.assert(
      fc.property(
        slugArb,
        fc.constantFrom('%E0%A4%A', '%ZZ', '%2', '%', '%C0%AF'),
        (prefix, badPercent) => {
          const url = `https://dev.azure.com/${prefix}${badPercent}`;
          expect(() => resolveAzureDevOpsBaseUrls(url)).toThrow(
            AzureDevOpsValidationError,
          );
          expect(getOrgNameFromUrl(url)).toBeUndefined();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('formatOrgUrlForLog never leaks embedded userinfo credentials, query params, or fragments', () => {
    fc.assert(
      fc.property(
        slugArb.filter((s) => s.length >= 6),
        slugArb.filter((s) => s.length >= 8),
        slugArb,
        slugArb.filter((s) => s.length >= 6),
        (user, secretPass, org, queryToken) => {
          const raw = `https://${user}:${secretPass}@dev.azure.com/${org}/?token=${queryToken}#frag_${secretPass}`;
          const formatted = formatOrgUrlForLog(raw);
          expect(formatted).toBe(`dev.azure.com/${org}`);
          expect(formatted).not.toContain(secretPass);
          expect(formatted).not.toContain(queryToken);
          expect(formatted).not.toContain('@');
          expect(formatted).not.toContain('?');
          expect(formatted).not.toContain('#');
        },
      ),
      { numRuns: 150 },
    );
  });
});
