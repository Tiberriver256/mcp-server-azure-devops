import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthenticationMethod } from '../../../shared/auth/index.ts';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { HttpError } from '../../../shared/http/http-client.ts';
import type { HttpRequestOptions } from '../../../shared/http/http-client.ts';
import { createAzureDevOpsSession } from '../../../shared/session/azure-devops-session.ts';
import { listOrganizations } from './feature.ts';

function makeContext(
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
      personalAccessToken: 'secret-pat-value',
    },
    { httpClient: http },
  );
}

void describe('listOrganizations', () => {
  void it('fetches profile publicAlias and maps accessible organizations', async () => {
    const urls: string[] = [];
    const ctx = makeContext(async (req) => {
      urls.push(req.url);
      if (req.url.includes('/_apis/profile/profiles/me')) {
        return { status: 200, data: { publicAlias: 'user-alias-123' } };
      }
      return {
        status: 200,
        data: {
          value: [
            {
              accountId: 'id-1',
              accountName: 'org-one',
              accountUri: 'https://dev.azure.com/org-one',
            },
          ],
        },
      };
    });

    const orgs = await listOrganizations(ctx);
    assert.deepStrictEqual(orgs, [
      { id: 'id-1', name: 'org-one', url: 'https://dev.azure.com/org-one' },
    ]);
    assert.ok(urls[1].includes('memberId=user-alias-123'));
  });

  void it('rejects on-premises Azure DevOps Server URLs', async () => {
    const ctx = makeContext(
      async () => ({ status: 200, data: {} }),
      'https://ado.local/tfs/DefaultCollection',
    );

    await assert.rejects(
      () => listOrganizations(ctx),
      AzureDevOpsValidationError,
    );
  });

  void it('maps profile HTTP 401 to AzureDevOpsAuthenticationError without leaking PAT', async () => {
    const ctx = makeContext(async (req) => {
      throw new HttpError({
        message: 'Unauthorized',
        status: 401,
        statusText: 'Unauthorized',
        url: req.url,
      });
    });

    const err = await listOrganizations(ctx).catch((e: unknown) => e);
    assert.ok(err instanceof AzureDevOpsAuthenticationError);
    assert.ok(!err.message.includes('secret-pat-value'));
  });

  void it('maps HTTP 500 and malformed accounts payloads to AzureDevOpsError (not AuthenticationError)', async () => {
    const ctx500 = makeContext(async (req) => {
      throw new HttpError({
        message: 'Internal Server Error',
        status: 500,
        statusText: 'Internal Server Error',
        url: req.url,
      });
    });

    const err500 = await listOrganizations(ctx500).catch((e: unknown) => e);
    assert.ok(err500 instanceof AzureDevOpsError);
    assert.strictEqual(err500 instanceof AzureDevOpsAuthenticationError, false);

    const ctxMalformed = makeContext(async (req) => {
      if (req.url.includes('/_apis/profile/profiles/me')) {
        return { status: 200, data: { publicAlias: 'user-alias-123' } };
      }
      return { status: 200, data: { value: 'not-an-array' } };
    });
    const errMalformed = await listOrganizations(ctxMalformed).catch(
      (e: unknown) => e,
    );
    assert.ok(errMalformed instanceof AzureDevOpsError);
    assert.strictEqual(
      errMalformed instanceof AzureDevOpsAuthenticationError,
      false,
    );
  });
});
