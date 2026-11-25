import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { listTeams } from './feature.ts';
import { ListTeamsSchema } from '../schemas.ts';
import { projectsFeature } from '../index.ts';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';

void describe('listTeams unit', () => {
  void test('lists project-scoped teams and omits $expandIdentity when unset or false', async () => {
    const projectTeams = [
      { id: 't1', name: 'DemoProject Team' },
      { id: 't2', name: 'Platform Team' },
    ];
    const mockGetTeams = mock.fn((..._args: unknown[]) =>
      Promise.resolve(projectTeams),
    );
    const mockGetAllTeams = mock.fn();
    const mockConnection = {
      getCoreApi: mock.fn(() =>
        Promise.resolve({
          getTeams: mockGetTeams,
          getAllTeams: mockGetAllTeams,
        }),
      ),
    } as unknown as WebApi;

    const result = await listTeams(mockConnection, {
      projectId: 'DemoProject',
      mine: true,
      expandIdentity: false,
    });

    assert.deepStrictEqual(result, projectTeams);
    assert.strictEqual(mockGetTeams.mock.callCount(), 1);
    assert.strictEqual(mockGetAllTeams.mock.callCount(), 0);
    // Crucial on-prem invariant: expandIdentity must be undefined (NEVER false)
    assert.deepStrictEqual(mockGetTeams.mock.calls[0]?.arguments, [
      'DemoProject',
      true,
      100,
      undefined,
      undefined,
    ]);
  });

  void test('lists all org/collection teams when projectId is omitted', async () => {
    const allTeams = [
      { id: 't1', name: 'DemoProject Team' },
      { id: 't2', name: 'OtherProject Team' },
    ];
    const mockGetAllTeams = mock.fn((..._args: unknown[]) =>
      Promise.resolve(allTeams),
    );
    const mockGetTeams = mock.fn();
    const mockConnection = {
      getCoreApi: mock.fn(() =>
        Promise.resolve({
          getAllTeams: mockGetAllTeams,
          getTeams: mockGetTeams,
        }),
      ),
    } as unknown as WebApi;

    const result = await listTeams(mockConnection, { top: 50, skip: 5 });

    assert.deepStrictEqual(result, allTeams);
    assert.strictEqual(mockGetAllTeams.mock.callCount(), 1);
    assert.strictEqual(mockGetTeams.mock.callCount(), 0);
    assert.deepStrictEqual(mockGetAllTeams.mock.calls[0]?.arguments, [
      undefined,
      50,
      5,
      undefined,
    ]);
  });

  void test('ignores projectId and calls getAllTeams when allProjects is true', async () => {
    const mockGetAllTeams = mock.fn((..._args: unknown[]) =>
      Promise.resolve([{ id: 't1', name: 'All Team' }]),
    );
    const mockGetTeams = mock.fn();
    const mockConnection = {
      getCoreApi: mock.fn(() =>
        Promise.resolve({
          getAllTeams: mockGetAllTeams,
          getTeams: mockGetTeams,
        }),
      ),
    } as unknown as WebApi;

    await listTeams(mockConnection, {
      projectId: 'DemoProject',
      allProjects: true,
    });

    assert.strictEqual(mockGetAllTeams.mock.callCount(), 1);
    assert.strictEqual(mockGetTeams.mock.callCount(), 0);
  });

  void test('passes expandIdentity=true on Server 2020+ / Services (maxVersion >= 6.0)', async () => {
    const mockGetTeams = mock.fn((..._args: unknown[]) => Promise.resolve([]));
    const mockBeginGetLocation = mock.fn(() =>
      Promise.resolve({ maxVersion: '7.1' }),
    );
    const mockConnection = {
      getCoreApi: mock.fn(() =>
        Promise.resolve({
          vsoClient: { beginGetLocation: mockBeginGetLocation },
          getTeams: mockGetTeams,
        }),
      ),
    } as unknown as WebApi;

    await listTeams(mockConnection, {
      projectId: 'DemoProject',
      expandIdentity: true,
    });

    assert.strictEqual(mockBeginGetLocation.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetTeams.mock.calls[0]?.arguments, [
      'DemoProject',
      undefined,
      100,
      undefined,
      true,
    ]);
  });

  void test('omits $expandIdentity even when expandIdentity=true on Server 2019 (maxVersion 5.0)', async () => {
    const mockGetTeams = mock.fn((..._args: unknown[]) => Promise.resolve([]));
    const mockGetAllTeams = mock.fn((..._args: unknown[]) =>
      Promise.resolve([]),
    );
    const mockConnection = {
      getCoreApi: mock.fn(() =>
        Promise.resolve({
          vsoClient: {
            beginGetLocation: mock.fn(() =>
              Promise.resolve({ maxVersion: '5.0' }),
            ),
          },
          getTeams: mockGetTeams,
          getAllTeams: mockGetAllTeams,
        }),
      ),
    } as unknown as WebApi;

    await listTeams(mockConnection, {
      projectId: 'DemoProject',
      expandIdentity: true,
    });
    assert.deepStrictEqual(mockGetTeams.mock.calls[0]?.arguments, [
      'DemoProject',
      undefined,
      100,
      undefined,
      undefined,
    ]);

    await listTeams(mockConnection, {
      allProjects: true,
      expandIdentity: true,
    });
    assert.deepStrictEqual(mockGetAllTeams.mock.calls[0]?.arguments, [
      undefined,
      100,
      undefined,
      undefined,
    ]);
  });

  void test('maps null project response to AzureDevOpsResourceNotFoundError', async () => {
    const mockConnection = {
      getCoreApi: mock.fn(() =>
        Promise.resolve({
          getTeams: mock.fn(() => Promise.resolve(null)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () => listTeams(mockConnection, { projectId: 'MissingProject' }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void test('validates top and skip bounds without calling Azure DevOps', async () => {
    const mockGetApi = mock.fn();
    const mockConnection = {
      getCoreApi: mockGetApi,
    } as unknown as WebApi;

    await assert.rejects(
      () => listTeams(mockConnection, { top: 1001 }),
      AzureDevOpsValidationError,
    );
    await assert.rejects(
      () => listTeams(mockConnection, { skip: -1 }),
      AzureDevOpsValidationError,
    );
    assert.strictEqual(mockGetApi.mock.callCount(), 0);
  });

  void test('wraps unexpected errors in AzureDevOpsError', async () => {
    const mockConnection = {
      getCoreApi: mock.fn(() => {
        throw new Error('Core API down');
      }),
    } as unknown as WebApi;

    await assert.rejects(
      () => listTeams(mockConnection),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsError);
        assert.strictEqual(err.message, 'Failed to list teams: Core API down');
        return true;
      },
    );
  });

  void test('tool handler ignores configured defaultProject when allProjects is true', async () => {
    const mockGetAllTeams = mock.fn((..._args: unknown[]) =>
      Promise.resolve([{ id: 't1', name: 'Org Team' }]),
    );
    const mockGetTeams = mock.fn();
    const mockConnection = {
      getCoreApi: mock.fn(() =>
        Promise.resolve({
          getAllTeams: mockGetAllTeams,
          getTeams: mockGetTeams,
        }),
      ),
    } as unknown as WebApi;

    const tool = projectsFeature.tools.find((t) => t.name === 'list_teams');
    assert.ok(tool);
    assert.strictEqual(tool.readOnly, true);
    assert.strictEqual(tool.annotations.readOnlyHint, true);

    const def = tool.toDefinition();
    assert.ok(def.inputSchema && typeof def.inputSchema === 'object');

    const mockCtx = {
      getWebApi: mock.fn(() => Promise.resolve(mockConnection)),
      resolveOptionalProjectId: mock.fn(
        (explicit?: string) => explicit ?? 'DefaultProject',
      ),
    } as unknown as ToolContext;

    await tool.execute(mockCtx, { allProjects: true });

    assert.strictEqual(mockGetAllTeams.mock.callCount(), 1);
    assert.strictEqual(mockGetTeams.mock.callCount(), 0);

    const parsed = ListTeamsSchema.parse({});
    assert.strictEqual(parsed.top, 100);
  });
});
