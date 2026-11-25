import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { Readable } from 'stream';
import type * as http from 'http';
import type { IRequestHandler } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces.js';
import type {
  IHttpClient,
  IHttpClientResponse,
  IRequestInfo,
} from 'typed-rest-client/Interfaces.js';
import type {
  AuthFactoryDependencies,
  CachedAccessToken,
} from './auth-factory.ts';
import {
  createAuthClient,
  createAuthProvider,
  AuthenticationMethod,
  formatOrgUrlForLog,
  isLocationLookupFailure,
  RefreshingBearerCredentialHandler,
} from './auth-factory.ts';
import { createAzureDevOpsSession } from '../session/azure-devops-session.ts';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../errors/index.ts';
import type { WebApi } from 'azure-devops-node-api';

interface AuthDepsHarness {
  deps: AuthFactoryDependencies;
  mockGetResourceAreas: ReturnType<typeof mock.fn<() => Promise<unknown[]>>>;
  mockGetLocationsApi: ReturnType<
    typeof mock.fn<
      () => Promise<{ getResourceAreas: () => Promise<unknown[]> }>
    >
  >;
  mockGetToken: ReturnType<
    typeof mock.fn<(scope: string) => Promise<CachedAccessToken | null>>
  >;
  mockGetPersonalAccessTokenHandler: ReturnType<
    typeof mock.fn<(token: string) => IRequestHandler>
  >;
  webApiCalls: Array<{
    organizationUrl: string;
    authHandler: IRequestHandler;
  }>;
}

function createAuthDepsHarness(): AuthDepsHarness {
  const mockGetResourceAreas = mock.fn<() => Promise<unknown[]>>(() =>
    Promise.resolve([]),
  );
  const mockGetLocationsApi = mock.fn<
    () => Promise<{ getResourceAreas: () => Promise<unknown[]> }>
  >(() =>
    Promise.resolve({
      getResourceAreas: (...args: []) => mockGetResourceAreas(...args),
    }),
  );
  const mockGetToken = mock.fn<
    (scope: string) => Promise<CachedAccessToken | null>
  >(() => Promise.resolve(null));
  const mockGetPersonalAccessTokenHandler = mock.fn<
    (token: string) => IRequestHandler
  >(() => ({}) as IRequestHandler);
  const webApiCalls: Array<{
    organizationUrl: string;
    authHandler: IRequestHandler;
  }> = [];

  class FakeWebApi {
    constructor(organizationUrl: string, authHandler: IRequestHandler) {
      webApiCalls.push({ organizationUrl, authHandler });
    }

    getLocationsApi(...args: []) {
      return mockGetLocationsApi(...args);
    }
  }

  class FakeCredential {
    getToken(scope: string) {
      return mockGetToken(scope);
    }
  }

  const deps: AuthFactoryDependencies = {
    loadAzureDevOpsApi: () =>
      Promise.resolve({
        WebApi: FakeWebApi as unknown as new (
          organizationUrl: string,
          authHandler: IRequestHandler,
        ) => WebApi,
        getPersonalAccessTokenHandler: (token: string) =>
          mockGetPersonalAccessTokenHandler(token),
      }),
    loadAzureIdentity: () =>
      Promise.resolve({
        DefaultAzureCredential: FakeCredential,
        AzureCliCredential: FakeCredential,
      }),
  };

  return {
    deps,
    mockGetResourceAreas,
    mockGetLocationsApi,
    mockGetToken,
    mockGetPersonalAccessTokenHandler,
    webApiCalls,
  };
}

void describe('createAuthClient server auth guard', () => {
  let harness: AuthDepsHarness;

  beforeEach(() => {
    harness = createAuthDepsHarness();
  });

  void it('rejects Azure Identity and Azure CLI for Azure DevOps Server URLs', async () => {
    await assert.rejects(
      () =>
        createAuthClient(
          {
            method: AuthenticationMethod.AzureIdentity,
            organizationUrl: 'https://ado.local/tfs/DefaultCollection',
          },
          undefined,
          harness.deps,
        ),
      AzureDevOpsAuthenticationError,
    );

    await assert.rejects(
      () =>
        createAuthClient(
          {
            method: AuthenticationMethod.AzureCli,
            organizationUrl: 'https://ado.local/tfs/DefaultCollection',
          },
          undefined,
          harness.deps,
        ),
      AzureDevOpsAuthenticationError,
    );
  });

  void it('allows PAT auth for Azure DevOps Server URLs', async () => {
    const client = await createAuthClient(
      {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: 'https://ado.local/tfs/DefaultCollection',
        personalAccessToken: 'test-pat',
      },
      undefined,
      harness.deps,
    );
    assert.notStrictEqual(client, undefined);
    assert.strictEqual(
      harness.mockGetPersonalAccessTokenHandler.mock.calls[0]?.arguments[0],
      'test-pat',
    );
    assert.strictEqual(
      harness.webApiCalls[0]?.organizationUrl,
      'https://ado.local/tfs/DefaultCollection',
    );
  });
});

void describe('createAuthClient location lookup classification', () => {
  let harness: AuthDepsHarness;

  beforeEach(() => {
    harness = createAuthDepsHarness();
  });

  void it('throws ValidationError (not AuthenticationError) for location-id failures with sanitized cause', async () => {
    harness.mockGetResourceAreas.mock.mockImplementation(() =>
      Promise.reject(
        new Error(
          'Failed to find api location for area: Location id: e81700f7-3be2-46de-8624-2eb35882fcaa with Bearer secretTokenValue123456',
        ),
      ),
    );

    const err = await createAuthClient(
      {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: 'https://dev.azure.com/example-org',
        personalAccessToken: 'test-pat',
      },
      undefined,
      harness.deps,
    ).catch((e: unknown) => e);

    assert.ok(!(err instanceof AzureDevOpsAuthenticationError));
    assert.ok(err instanceof AzureDevOpsValidationError);
    assert.ok(err.message.includes('Failed to find api location'));
    assert.ok(err.message.includes('dev.azure.com/example-org'));
    assert.match(err.message, /not a credential failure/i);
    assert.ok(err.cause instanceof Error);
    assert.ok(!err.cause.message.includes('secretTokenValue123456'));
  });

  void it('throws AuthenticationError for HTTP 401-style failures', async () => {
    harness.mockGetResourceAreas.mock.mockImplementation(() =>
      Promise.reject(new Error('Request failed with status code 401')),
    );

    await assert.rejects(
      () =>
        createAuthClient(
          {
            method: AuthenticationMethod.PersonalAccessToken,
            organizationUrl: 'https://dev.azure.com/example-org',
            personalAccessToken: 'test-pat',
          },
          undefined,
          harness.deps,
        ),
      AzureDevOpsAuthenticationError,
    );
  });

  void it('throws AzureDevOpsError for other connection failures', async () => {
    harness.mockGetResourceAreas.mock.mockImplementation(() =>
      Promise.reject(new Error('ECONNREFUSED')),
    );

    const err = await createAuthClient(
      {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: 'https://dev.azure.com/example-org',
        personalAccessToken: 'test-pat',
      },
      undefined,
      harness.deps,
    ).catch((e: unknown) => e);

    assert.ok(!(err instanceof AzureDevOpsAuthenticationError));
    assert.ok(!(err instanceof AzureDevOpsValidationError));
    assert.ok(err instanceof AzureDevOpsError);
    assert.ok(err.message.includes('ECONNREFUSED'));
  });
});

void describe('createAuthProvider token caching & AzureDevOpsSession recovery', () => {
  let harness: AuthDepsHarness;

  beforeEach(() => {
    harness = createAuthDepsHarness();
  });

  void it('caches Entra tokens and deduplicates concurrent getAuthorizationHeader calls', async () => {
    harness.mockGetToken.mock.mockImplementation(() =>
      Promise.resolve({
        token: 'entra-token-1',
        expiresOnTimestamp: Date.now() + 60 * 60 * 1000,
      }),
    );

    const provider = createAuthProvider(
      {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: 'https://dev.azure.com/example-org',
      },
      harness.deps,
    );

    const [h1, h2, h3] = await Promise.all([
      provider.getAuthorizationHeader(),
      provider.getAuthorizationHeader(),
      provider.getAuthorizationHeader(),
    ]);

    assert.strictEqual(h1, 'Bearer entra-token-1');
    assert.strictEqual(h2, 'Bearer entra-token-1');
    assert.strictEqual(h3, 'Bearer entra-token-1');
    assert.strictEqual(harness.mockGetToken.mock.callCount(), 1);
  });

  void it('keeps multiple handlers synchronized with latest refreshed token across organizations', async () => {
    let current = 'token-v1';
    const refresh = mock.fn(() => {
      current = 'token-v2';
      return Promise.resolve(current);
    });

    const handlerOrgA = new RefreshingBearerCredentialHandler(
      () => current,
      refresh,
    );
    const handlerOrgB = new RefreshingBearerCredentialHandler(
      () => current,
      refresh,
    );

    const optsA: http.RequestOptions = {};
    const optsB: http.RequestOptions = {};
    handlerOrgA.prepareRequest(optsA);
    handlerOrgB.prepareRequest(optsB);
    assert.strictEqual(
      (optsA.headers as Record<string, string>).Authorization,
      'Bearer token-v1',
    );
    assert.strictEqual(
      (optsB.headers as Record<string, string>).Authorization,
      'Bearer token-v1',
    );

    assert.strictEqual(
      handlerOrgA.canHandleAuthentication({
        message: { statusCode: 401 },
      } as IHttpClientResponse),
      true,
    );
    assert.strictEqual(
      handlerOrgA.canHandleAuthentication({
        message: { statusCode: 403 },
      } as IHttpClientResponse),
      false,
    );

    const requestRaw = mock.fn((_requestInfo: IRequestInfo, _data: string) =>
      Promise.resolve({
        message: { statusCode: 200 },
      } as IHttpClientResponse),
    );
    const mockHttp = { requestRaw } as unknown as IHttpClient;
    const reqInfo = { options: {} } as IRequestInfo;

    await handlerOrgA.handleAuthentication(mockHttp, reqInfo, null);

    // Passes null (never '') on empty GET retries so Content-Length: 0 is not injected
    assert.strictEqual(requestRaw.mock.callCount(), 1);
    assert.strictEqual(requestRaw.mock.calls[0]?.arguments.length, 2);
    assert.strictEqual(requestRaw.mock.calls[0]?.arguments[0], reqInfo);
    assert.strictEqual(requestRaw.mock.calls[0]?.arguments[1], null);
    assert.strictEqual(
      (reqInfo.options.headers as Record<string, string>).Authorization,
      'Bearer token-v2',
    );

    // Second org handler automatically sees the refreshed token too
    const nextOptsB: http.RequestOptions = {};
    handlerOrgB.prepareRequest(nextOptsB);
    assert.strictEqual(
      (nextOptsB.headers as Record<string, string>).Authorization,
      'Bearer token-v2',
    );

    // Any ReadableStream (even if not yet ended) rejects cleanly so partially-consumed uploads are never truncated
    requestRaw.mock.resetCalls();
    const liveStream = Readable.from(['chunk-1', 'chunk-2']);
    await assert.rejects(
      () => handlerOrgA.handleAuthentication(mockHttp, reqInfo, liveStream),
      AzureDevOpsAuthenticationError,
    );

    const endedStream = Readable.from(['done']);
    for await (const _chunk of endedStream) {
      // drain stream so readableEnded === true
    }
    await assert.rejects(
      () => handlerOrgA.handleAuthentication(mockHttp, reqInfo, endedStream),
      AzureDevOpsAuthenticationError,
    );
    assert.strictEqual(requestRaw.mock.callCount(), 0);
  });

  void it('evicts failed WebApi promises from AzureDevOpsSession so subsequent calls recover', async () => {
    const fakeApi = { serverUrl: 'https://dev.azure.com/org' } as WebApi;
    let attempt = 0;
    const webApiFactory = mock.fn(() => {
      attempt += 1;
      if (attempt === 1) {
        return Promise.reject(new Error('transient network error'));
      }
      return Promise.resolve(fakeApi);
    });

    const session = createAzureDevOpsSession(
      {
        organizationUrl: 'https://dev.azure.com/org',
        authMethod: AuthenticationMethod.PersonalAccessToken,
        personalAccessToken: 'pat',
      },
      { webApiFactory },
    );

    await assert.rejects(() => session.getWebApi(), /transient network error/);
    assert.strictEqual(await session.getWebApi(), fakeApi);
    assert.strictEqual(await session.getWebApi(), fakeApi);
    assert.strictEqual(webApiFactory.mock.callCount(), 2);
  });
});

void describe('formatOrgUrlForLog / isLocationLookupFailure', () => {
  void it('formats host and pathname without credentials and detects location lookup errors', () => {
    assert.strictEqual(
      formatOrgUrlForLog('https://dev.azure.com/myorg/'),
      'dev.azure.com/myorg',
    );
    assert.strictEqual(
      isLocationLookupFailure(
        new Error('Failed to find api location for area: Location id: abc'),
      ),
      true,
    );
    assert.strictEqual(
      isLocationLookupFailure(new Error('401 Unauthorized')),
      false,
    );
  });
});
