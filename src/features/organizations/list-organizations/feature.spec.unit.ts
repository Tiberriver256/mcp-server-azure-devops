import { AuthenticationMethod } from '../../../shared/auth';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import { HttpError } from '../../../shared/http/http-client';
import type { HttpRequestOptions } from '../../../shared/http/http-client';
import { createAzureDevOpsSession } from '../../../shared/session/azure-devops-session';
import { listOrganizations } from './feature';

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

describe('listOrganizations', () => {
  it('fetches profile publicAlias and maps accessible organizations', async () => {
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
    expect(orgs).toEqual([
      { id: 'id-1', name: 'org-one', url: 'https://dev.azure.com/org-one' },
    ]);
    expect(urls[1]).toContain('memberId=user-alias-123');
  });

  it('rejects on-premises Azure DevOps Server URLs', async () => {
    const ctx = makeContext(
      async () => ({ status: 200, data: {} }),
      'https://ado.local/tfs/DefaultCollection',
    );

    await expect(listOrganizations(ctx)).rejects.toThrow(
      AzureDevOpsValidationError,
    );
  });

  it('maps profile HTTP 401 to AzureDevOpsAuthenticationError without leaking PAT', async () => {
    const ctx = makeContext(async (req) => {
      throw new HttpError({
        message: 'Unauthorized',
        status: 401,
        statusText: 'Unauthorized',
        url: req.url,
      });
    });

    const err = await listOrganizations(ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AzureDevOpsAuthenticationError);
    expect((err as Error).message).not.toContain('secret-pat-value');
  });
});
