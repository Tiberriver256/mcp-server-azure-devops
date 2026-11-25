import { AuthenticationMethod } from '../../../shared/auth';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import { HttpError } from '../../../shared/http/http-client';
import type { HttpRequestOptions } from '../../../shared/http/http-client';
import { createAzureDevOpsSession } from '../../../shared/session/azure-devops-session';
import { getMe } from './feature';

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

describe('getMe', () => {
  it('returns user profile from vssps.dev.azure.com for Services URLs', async () => {
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
    expect(profile).toEqual({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(requestedUrl).toBe(
      'https://vssps.dev.azure.com/test-org/_apis/profile/profiles/me?api-version=7.1',
    );
  });

  it('rejects on-premises Azure DevOps Server URLs', async () => {
    const ctx = makeContext(
      async () => ({ status: 200, data: {} }),
      'https://ado.local/tfs/DefaultCollection',
    );
    await expect(getMe(ctx)).rejects.toThrow(AzureDevOpsValidationError);
  });

  it('maps HTTP 401 to AuthenticationError and HTTP 403 to PermissionError', async () => {
    const ctx401 = makeContext(async (req) => {
      throw new HttpError({
        message: 'Unauthorized',
        status: 401,
        statusText: 'Unauthorized',
        url: req.url,
      });
    });
    await expect(getMe(ctx401)).rejects.toThrow(AzureDevOpsAuthenticationError);

    const ctx403 = makeContext(async (req) => {
      throw new HttpError({
        message: 'Forbidden',
        status: 403,
        statusText: 'Forbidden',
        url: req.url,
      });
    });
    await expect(getMe(ctx403)).rejects.toThrow(AzureDevOpsPermissionError);
  });

  it('rejects malformed profile response payloads with AzureDevOpsError', async () => {
    const ctx = makeContext(async () => ({
      status: 200,
      data: '<html>unexpected</html>',
    }));
    await expect(getMe(ctx)).rejects.toThrow(AzureDevOpsError);
  });
});
