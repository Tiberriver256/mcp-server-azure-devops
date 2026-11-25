import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { BuildQueryOrder } from 'azure-devops-node-api/interfaces/BuildInterfaces.js';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors/index.ts';
import { GetPipelineRunSchema } from './get-pipeline-run/schema.ts';
import { ListPipelineRunsSchema } from './list-pipeline-runs/schema.ts';
import {
  parsePipelineName,
  resolvePipelineIdByName,
  resolveRunIdByBuildNumber,
  resolveRunReference,
} from './run-reference.ts';

type GetDefinitionsFn = (projectId: string, name?: string) => Promise<unknown>;
type GetBuildsFn = (...args: unknown[]) => Promise<unknown>;

void describe('run-reference', () => {
  let getDefinitions: Mock<GetDefinitionsFn>;
  let getBuilds: Mock<GetBuildsFn>;
  let connection: WebApi;

  beforeEach(() => {
    getDefinitions = mock.fn<GetDefinitionsFn>(() =>
      Promise.reject(new Error('Unexpected getDefinitions call')),
    );
    getBuilds = mock.fn<GetBuildsFn>(() =>
      Promise.reject(new Error('Unexpected getBuilds call')),
    );
    connection = {
      getBuildApi: mock.fn(() =>
        Promise.resolve({ getDefinitions, getBuilds }),
      ),
    } as unknown as WebApi;
  });

  void describe('parsePipelineName', () => {
    void it('returns the plain name when no folder is given', () => {
      assert.deepStrictEqual(parsePipelineName(' Deploy '), { name: 'Deploy' });
    });

    void it('splits backslash and forward slash folder prefixes', () => {
      assert.deepStrictEqual(parsePipelineName('\\Backend\\Deploy'), {
        name: 'Deploy',
        folder: '\\Backend',
      });
      assert.deepStrictEqual(parsePipelineName('Backend/Sub/Deploy'), {
        name: 'Deploy',
        folder: '\\Backend\\Sub',
      });
    });

    void it('targets the root folder with a leading separator', () => {
      assert.deepStrictEqual(parsePipelineName('/Deploy'), {
        name: 'Deploy',
        folder: '\\',
      });
      assert.deepStrictEqual(parsePipelineName('\\Deploy'), {
        name: 'Deploy',
        folder: '\\',
      });
    });
  });

  void describe('resolvePipelineIdByName', () => {
    void it('resolves a unique, case-insensitive name match', async () => {
      getDefinitions.mock.mockImplementation(() =>
        Promise.resolve([{ id: 7, name: 'CI Build', path: '\\' }]),
      );

      assert.strictEqual(
        await resolvePipelineIdByName(connection, 'proj', 'ci build'),
        7,
      );
      assert.strictEqual(getDefinitions.mock.callCount(), 1);
      assert.deepStrictEqual(getDefinitions.mock.calls[0]?.arguments, [
        'proj',
        'ci build',
      ]);
    });

    void it('uses the folder prefix to disambiguate', async () => {
      getDefinitions.mock.mockImplementation(() =>
        Promise.resolve([
          { id: 1, name: 'Deploy', path: '\\Frontend' },
          { id: 2, name: 'Deploy', path: '\\Backend' },
        ]),
      );

      assert.strictEqual(
        await resolvePipelineIdByName(connection, 'proj', 'backend/Deploy'),
        2,
      );
      assert.strictEqual(getDefinitions.mock.callCount(), 1);
      assert.deepStrictEqual(getDefinitions.mock.calls[0]?.arguments, [
        'proj',
        'Deploy',
      ]);
    });

    void it('resolves the root pipeline when a subfolder has the same name', async () => {
      getDefinitions.mock.mockImplementation(() =>
        Promise.resolve([
          { id: 1, name: 'Deploy', path: '\\Backend' },
          { id: 2, name: 'Deploy', path: '\\' },
        ]),
      );

      assert.strictEqual(
        await resolvePipelineIdByName(connection, 'proj', '/Deploy'),
        2,
      );
    });

    void it('throws a validation error listing candidates when ambiguous', async () => {
      getDefinitions.mock.mockImplementation(() =>
        Promise.resolve([
          { id: 1, name: 'Deploy', path: '\\Frontend' },
          { id: 2, name: 'Deploy', path: '\\Backend' },
        ]),
      );

      await assert.rejects(
        () => resolvePipelineIdByName(connection, 'proj', 'Deploy'),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsValidationError);
          assert.match(err.message, /Frontend\/Deploy \(id 1\)/);
          assert.match(err.message, /Backend\/Deploy \(id 2\)/);
          return true;
        },
      );
    });

    void it('throws not found with similar-name suggestions', async () => {
      getDefinitions.mock.mockImplementationOnce(() => Promise.resolve([]), 0);
      getDefinitions.mock.mockImplementationOnce(
        () => Promise.resolve([{ id: 9, name: 'Deploy-Prod', path: '\\' }]),
        1,
      );

      await assert.rejects(
        () => resolvePipelineIdByName(connection, 'proj', 'Deploy'),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsResourceNotFoundError);
          assert.match(err.message, /Deploy-Prod \(id 9\)/);
          return true;
        },
      );
      assert.strictEqual(getDefinitions.mock.callCount(), 2);
      assert.deepStrictEqual(getDefinitions.mock.calls[1]?.arguments, [
        'proj',
        '*Deploy*',
      ]);
    });
  });

  void describe('resolveRunIdByBuildNumber', () => {
    void it('resolves a single build scoped to a pipeline', async () => {
      getBuilds.mock.mockImplementation(() =>
        Promise.resolve([
          { id: 4711, buildNumber: '20240115.3', definition: { id: 7 } },
        ]),
      );

      assert.deepStrictEqual(
        await resolveRunIdByBuildNumber(connection, 'proj', '20240115.3', 7),
        { runId: 4711, pipelineId: 7 },
      );

      assert.strictEqual(getBuilds.mock.callCount(), 1);
      const args = getBuilds.mock.calls[0]?.arguments;
      assert.ok(args);
      assert.strictEqual(args[0], 'proj');
      assert.deepStrictEqual(args[1], [7]);
      assert.strictEqual(args[3], '20240115.3');
      assert.strictEqual(args[16], BuildQueryOrder.QueueTimeDescending);
    });

    void it('searches the whole project when no pipeline is given', async () => {
      getBuilds.mock.mockImplementation(() =>
        Promise.resolve([
          { id: 5, buildNumber: '1.0.0', definition: { id: 3 } },
        ]),
      );

      assert.deepStrictEqual(
        await resolveRunIdByBuildNumber(connection, 'proj', '1.0.0'),
        { runId: 5, pipelineId: 3 },
      );
      assert.strictEqual(getBuilds.mock.callCount(), 1);
      assert.strictEqual(getBuilds.mock.calls[0]?.arguments[1], undefined);
    });

    void it('throws not found when no build matches', async () => {
      getBuilds.mock.mockImplementation(() => Promise.resolve([]));

      await assert.rejects(
        () => resolveRunIdByBuildNumber(connection, 'proj', 'missing', 7),
        AzureDevOpsResourceNotFoundError,
      );
    });

    void it('ignores builds whose number only matches as a wildcard', async () => {
      getBuilds.mock.mockImplementation(() =>
        Promise.resolve([
          { id: 11, buildNumber: '2024.1-hotfix', definition: { id: 7 } },
          { id: 10, buildNumber: '2024.1', definition: { id: 7 } },
        ]),
      );

      assert.deepStrictEqual(
        await resolveRunIdByBuildNumber(connection, 'proj', '2024.1', 7),
        { runId: 10, pipelineId: 7 },
      );
    });

    void it('treats a wildcard input as a literal build number', async () => {
      getBuilds.mock.mockImplementation(() =>
        Promise.resolve([
          { id: 11, buildNumber: '2024.10', definition: { id: 7 } },
          { id: 10, buildNumber: '2024.1', definition: { id: 7 } },
        ]),
      );

      await assert.rejects(
        () => resolveRunIdByBuildNumber(connection, 'proj', '2024.*', 7),
        AzureDevOpsResourceNotFoundError,
      );
    });

    void it('formats the ambiguity error even with an invalid queue time', async () => {
      getBuilds.mock.mockImplementation(() =>
        Promise.resolve([
          { id: 2, buildNumber: 'main', queueTime: 'not-a-date' },
          { id: 1, buildNumber: 'main', queueTime: '2024-01-15T10:00:00Z' },
        ]),
      );

      await assert.rejects(
        () => resolveRunIdByBuildNumber(connection, 'proj', 'main'),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsValidationError);
          assert.match(err.message, /runId 1, queued 2024-01-15T10:00:00.000Z/);
          return true;
        },
      );
    });

    void it('throws a validation error listing runs when ambiguous', async () => {
      getBuilds.mock.mockImplementation(() =>
        Promise.resolve([
          { id: 2, buildNumber: 'main', definition: { id: 1, name: 'A' } },
          { id: 1, buildNumber: 'main', definition: { id: 2, name: 'B' } },
        ]),
      );

      await assert.rejects(
        () => resolveRunIdByBuildNumber(connection, 'proj', 'main'),
        (err: unknown) => {
          assert.ok(err instanceof AzureDevOpsValidationError);
          assert.match(err.message, /runId 2, pipeline "A" \(id 1\)/);
          return true;
        },
      );
    });
  });

  void describe('resolveRunReference', () => {
    void it('passes numeric identifiers through without API calls', async () => {
      assert.deepStrictEqual(
        await resolveRunReference(connection, 'proj', {
          runId: 12,
          pipelineId: 3,
        }),
        { runId: 12, pipelineId: 3 },
      );
      assert.strictEqual(getDefinitions.mock.callCount(), 0);
      assert.strictEqual(getBuilds.mock.callCount(), 0);
    });

    void it('resolves pipelineName and buildNumber together', async () => {
      getDefinitions.mock.mockImplementation(() =>
        Promise.resolve([{ id: 7, name: 'CI', path: '\\' }]),
      );
      getBuilds.mock.mockImplementation(() =>
        Promise.resolve([{ id: 99, definition: { id: 7 } }]),
      );

      assert.deepStrictEqual(
        await resolveRunReference(connection, 'proj', {
          pipelineName: 'CI',
          buildNumber: '20240115.3',
        }),
        { runId: 99, pipelineId: 7 },
      );
      assert.strictEqual(getBuilds.mock.callCount(), 1);
      assert.deepStrictEqual(getBuilds.mock.calls[0]?.arguments[1], [7]);
    });

    void it('resolves pipelineName alongside a runId', async () => {
      getDefinitions.mock.mockImplementation(() =>
        Promise.resolve([{ id: 7, name: 'CI', path: '\\' }]),
      );

      assert.deepStrictEqual(
        await resolveRunReference(connection, 'proj', {
          pipelineName: 'CI',
          runId: 42,
        }),
        { runId: 42, pipelineId: 7 },
      );
      assert.strictEqual(getBuilds.mock.callCount(), 0);
    });
  });

  void describe('schema validation', () => {
    void it('accepts pipelineName + buildNumber without runId', () => {
      assert.strictEqual(
        GetPipelineRunSchema.safeParse({
          pipelineName: 'CI',
          buildNumber: '20240115.3',
        }).success,
        true,
      );
    });

    void it('rejects a request without runId or buildNumber', () => {
      assert.strictEqual(
        GetPipelineRunSchema.safeParse({ pipelineName: 'CI' }).success,
        false,
      );
    });

    void it('rejects runId together with buildNumber', () => {
      assert.strictEqual(
        GetPipelineRunSchema.safeParse({ runId: 1, buildNumber: 'x' }).success,
        false,
      );
    });

    void it('rejects pipelineId together with pipelineName', () => {
      assert.strictEqual(
        GetPipelineRunSchema.safeParse({
          runId: 1,
          pipelineId: 2,
          pipelineName: 'CI',
        }).success,
        false,
      );
    });

    void it('requires pipelineId or pipelineName for list_pipeline_runs', () => {
      assert.strictEqual(ListPipelineRunsSchema.safeParse({}).success, false);
      assert.strictEqual(
        ListPipelineRunsSchema.safeParse({ pipelineName: 'CI' }).success,
        true,
      );
    });
  });
});
