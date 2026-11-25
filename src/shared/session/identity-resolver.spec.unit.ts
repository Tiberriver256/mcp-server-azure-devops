import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../errors/index.ts';
import type { ToolContext } from './azure-devops-session.ts';
import {
  isUuid,
  resolveCurrentUserId,
  resolveIdentityId,
} from './identity-resolver.ts';

function makeMockCtx(overrides: {
  type?: 'services' | 'server';
  identityBaseUrl?: string;
  apiVersion?: string;
  connectResult?: unknown;
  identities?: unknown[];
}): {
  ctx: ToolContext;
  requestMock: ReturnType<typeof mock.fn>;
} {
  const requestMock = mock.fn(async () => ({
    status: 200,
    headers: {},
    data: { value: overrides.identities ?? [] },
  }));
  const ctx = {
    config: {
      apiVersion: overrides.apiVersion ?? '7.1',
    },
    baseUrls: {
      type: overrides.type ?? 'services',
      identityBaseUrl:
        overrides.identityBaseUrl ?? 'https://vssps.dev.azure.com/myorg',
    },
    getWebApi: mock.fn(async () => ({
      connect: mock.fn(async () => overrides.connectResult),
    })),
    requestAzureDevOps: requestMock,
  } as unknown as ToolContext;
  return { ctx, requestMock };
}

void describe('identity-resolver', () => {
  void it('detects valid UUIDs case-insensitively', () => {
    assert.strictEqual(isUuid('11111111-1111-4111-8111-111111111111'), true);
    assert.strictEqual(isUuid('ABCDEF01-2345-4678-9ABC-DEF012345678'), true);
    assert.strictEqual(isUuid('alice@contoso.com'), false);
    assert.strictEqual(isUuid('12345'), false);
  });

  void it('resolves authenticated user via connection.connect()', async () => {
    const { ctx } = makeMockCtx({
      connectResult: {
        authenticatedUser: {
          id: '11111111-1111-4111-8111-111111111111',
          providerDisplayName: 'Alice',
          properties: { Account: { $value: 'alice@contoso.com' } },
        },
      },
    });
    const result = await resolveCurrentUserId(ctx);
    assert.deepStrictEqual(result, {
      id: '11111111-1111-4111-8111-111111111111',
      displayName: 'Alice',
      uniqueName: 'alice@contoso.com',
    });
  });

  void it('throws AzureDevOpsResourceNotFoundError when connectionData lacks user id', async () => {
    const { ctx } = makeMockCtx({ connectResult: {} });
    await assert.rejects(
      () => resolveCurrentUserId(ctx),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('passes UUID through without HTTP lookup', async () => {
    const { ctx, requestMock } = makeMockCtx({});
    const result = await resolveIdentityId(
      ctx,
      '22222222-2222-4222-8222-222222222222',
    );
    assert.deepStrictEqual(result, {
      id: '22222222-2222-4222-8222-222222222222',
    });
    assert.strictEqual(requestMock.mock.callCount(), 0);
  });

  void it('resolves email via identityBaseUrl on Services and Server', async () => {
    const { ctx, requestMock } = makeMockCtx({
      type: 'server',
      identityBaseUrl: 'https://ado.corp:8080/tfs/DefaultCollection',
      apiVersion: '6.0',
      identities: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          providerDisplayName: 'Bob',
          properties: { Mail: { $value: 'bob@corp.local' } },
        },
      ],
    });
    const result = await resolveIdentityId(ctx, 'bob@corp.local');
    assert.strictEqual(result.id, '22222222-2222-4222-8222-222222222222');
    assert.strictEqual(requestMock.mock.callCount(), 1);
    const callArg = requestMock.mock.calls[0].arguments[0] as {
      url: string;
      query: Record<string, string>;
    };
    assert.strictEqual(
      callArg.url,
      'https://ado.corp:8080/tfs/DefaultCollection/_apis/identities',
    );
    assert.strictEqual(callArg.query['api-version'], '6.0');
  });

  void it('disambiguates multiple candidates by exact email match and rejects ambiguous names', async () => {
    const { ctx: exactCtx } = makeMockCtx({
      identities: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          providerDisplayName: 'Alex Smith',
          properties: { Mail: { $value: 'alex@contoso.com' } },
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          providerDisplayName: 'Alex Jones',
          properties: { Mail: { $value: 'alex.j@contoso.com' } },
        },
      ],
    });
    const exact = await resolveIdentityId(exactCtx, 'alex@contoso.com');
    assert.strictEqual(exact.id, '11111111-1111-4111-8111-111111111111');

    await assert.rejects(
      () => resolveIdentityId(exactCtx, 'Alex'),
      AzureDevOpsValidationError,
    );
  });

  void it('throws AzureDevOpsResourceNotFoundError on empty lookup and validation error on blank input', async () => {
    const { ctx } = makeMockCtx({ identities: [] });
    await assert.rejects(
      () => resolveIdentityId(ctx, 'nobody@contoso.com'),
      AzureDevOpsResourceNotFoundError,
    );
    await assert.rejects(
      () => resolveIdentityId(ctx, '   '),
      AzureDevOpsValidationError,
    );
  });
});
