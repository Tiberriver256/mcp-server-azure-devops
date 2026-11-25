import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';
import { AzureDevOpsValidationError } from '../../shared/errors/index.ts';
import { workFeature, workTools } from './index.ts';

void describe('workFeature registration & schemas unit', () => {
  void test('exports workFeature with toolset="work" and all 4 read-only sprint tools with full ToolAnnotations', () => {
    assert.strictEqual(workFeature.toolset, 'work');
    assert.strictEqual(workFeature.tools, workTools);

    assert.deepStrictEqual(workTools.map((tool) => tool.name).sort(), [
      'get_iteration_work_items',
      'get_team_settings',
      'list_iterations',
      'list_team_iterations',
    ]);

    for (const tool of workTools) {
      assert.strictEqual(tool.readOnly, true, `${tool.name}.readOnly`);
      assert.strictEqual(
        tool.annotations.readOnlyHint,
        true,
        `${tool.name}.readOnlyHint`,
      );
      assert.strictEqual(
        tool.annotations.destructiveHint,
        false,
        `${tool.name}.destructiveHint`,
      );
      assert.strictEqual(
        tool.annotations.idempotentHint,
        true,
        `${tool.name}.idempotentHint`,
      );
      assert.strictEqual(
        tool.annotations.openWorldHint,
        true,
        `${tool.name}.openWorldHint`,
      );

      const def = tool.toDefinition();
      assert.strictEqual(def.name, tool.name);
      assert.strictEqual(def.readOnly, true);
      assert.ok(def.inputSchema && typeof def.inputSchema === 'object');
    }
  });

  void test('list_iterations tool rejects negative depth via Zod validation before calling getWebApi', async () => {
    const tool = workTools.find((t) => t.name === 'list_iterations');
    assert.ok(tool);

    const mockGetWebApi = mock.fn();
    const ctx = {
      getWebApi: mockGetWebApi,
      resolveProjectId: mock.fn((id?: string) => id ?? 'DemoProject'),
    } as unknown as ToolContext;

    await assert.rejects(
      () => tool.execute(ctx, { projectId: 'DemoProject', depth: -1 }),
      /0|min|too_small|depth/i,
    );
    assert.strictEqual(mockGetWebApi.mock.callCount(), 0);
  });

  void test('get_iteration_work_items tool rejects non-UUID integer iterationId with AzureDevOpsValidationError before getWebApi', async () => {
    const tool = workTools.find((t) => t.name === 'get_iteration_work_items');
    assert.ok(tool);

    const mockGetWebApi = mock.fn();
    const ctx = {
      getWebApi: mockGetWebApi,
      resolveProjectId: mock.fn((id?: string) => id ?? 'DemoProject'),
    } as unknown as ToolContext;

    await assert.rejects(
      () =>
        tool.execute(ctx, {
          projectId: 'DemoProject',
          iterationId: '102',
        }),
      AzureDevOpsValidationError,
    );
    assert.strictEqual(mockGetWebApi.mock.callCount(), 0);
  });
});
