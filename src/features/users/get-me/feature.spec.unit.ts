import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthenticationMethod } from '../../../shared/auth/index.ts';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { HttpError } from '../../../shared/http/http-client.ts';
import type { HttpRequestOptions } from '../../../shared/http/http-client.ts';
import { createAzureDevOpsSession } from '../../../shared/session/azure-devops-session.ts';
import { getMe } from './feature.ts';

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
      personalAccessToken: 'test-pat',
    },
    { httpClient: http },
  );
}

void describe('getMe', () => {
  void it('returns user profile from vssps.dev.azure.com for Services URLs', async () => {
    let requestedUrl = '';
    const ctx = makeContext(async (req) => {
      requestedUrl = req.url;
      return {
        status: 200,
        data: {
          id: 'user-1',
          displayName: 'Ada Lovelace',
          emailAddress: 'ada@example.com',
        },
      };
    });

    const profile = await getMe(ctx);
    assert.deepStrictEqual(profile, {
      id: 'user-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    assert.strictEqual(
      requestedUrl,
      'https://vssps.dev.azure.com/test-org/_apis/profile/profiles/me?api-version=7.1',
    );
  });

  void it('rejects on-premises Azure DevOps Server URLs', async () => {
    const ctx = makeContext(
      async () => ({ status: 200, data: {} }),
      'https://ado.local/tfs/DefaultCollection',
    );
    await assert.rejects(() => getMe(ctx), AzureDevOpsValidationError);
  });

  void it('maps HTTP 401 to AuthenticationError and HTTP 403 to PermissionError', async () => {
    const ctx401 = makeContext(async (req) => {
      throw new HttpError({
        message: 'Unauthorized',
        status: 401,
        statusText: 'Unauthorized',
        url: req.url,
      });
    });
    await assert.rejects(() => getMe(ctx401), AzureDevOpsAuthenticationError);

    const ctx403 = makeContext(async (req) => {
      throw new HttpError({
        message: 'Forbidden',
        status: 403,
        statusText: 'Forbidden',
        url: req.url,
      });
    });
    await assert.rejects(() => getMe(ctx403), AzureDevOpsPermissionError);
  });

  void it('rejects malformed profile response payloads with AzureDevOpsError', async () => {
    const ctx = makeContext(async () => ({
      status: 200,
      data: '<html>unexpected</html>',
    }));
    await assert.rejects(() => getMe(ctx), AzureDevOpsError);
  });
});
