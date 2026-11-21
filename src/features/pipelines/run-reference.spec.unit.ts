import { WebApi } from 'azure-devops-node-api';
import { BuildQueryOrder } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors';
import { GetPipelineRunSchema } from './get-pipeline-run/schema';
import { ListPipelineRunsSchema } from './list-pipeline-runs/schema';
import {
  parsePipelineName,
  resolvePipelineIdByName,
  resolveRunIdByBuildNumber,
  resolveRunReference,
} from './run-reference';

describe('run-reference', () => {
  const getDefinitions = jest.fn();
  const getBuilds = jest.fn();
  const connection = {
    getBuildApi: jest.fn().mockResolvedValue({ getDefinitions, getBuilds }),
  } as unknown as WebApi;

  beforeEach(() => {
    getDefinitions.mockReset();
    getBuilds.mockReset();
  });

  describe('parsePipelineName', () => {
    it('returns the plain name when no folder is given', () => {
      expect(parsePipelineName(' Deploy ')).toEqual({ name: 'Deploy' });
    });

    it('splits backslash and forward slash folder prefixes', () => {
      expect(parsePipelineName('\\Backend\\Deploy')).toEqual({
        name: 'Deploy',
        folder: '\\Backend',
      });
      expect(parsePipelineName('Backend/Sub/Deploy')).toEqual({
        name: 'Deploy',
        folder: '\\Backend\\Sub',
      });
    });
  });

  describe('resolvePipelineIdByName', () => {
    it('resolves a unique, case-insensitive name match', async () => {
      getDefinitions.mockResolvedValue([
        { id: 7, name: 'CI Build', path: '\\' },
      ]);

      await expect(
        resolvePipelineIdByName(connection, 'proj', 'ci build'),
      ).resolves.toBe(7);
      expect(getDefinitions).toHaveBeenCalledWith('proj', 'ci build');
    });

    it('uses the folder prefix to disambiguate', async () => {
      getDefinitions.mockResolvedValue([
        { id: 1, name: 'Deploy', path: '\\Frontend' },
        { id: 2, name: 'Deploy', path: '\\Backend' },
      ]);

      await expect(
        resolvePipelineIdByName(connection, 'proj', 'backend/Deploy'),
      ).resolves.toBe(2);
      expect(getDefinitions).toHaveBeenCalledWith('proj', 'Deploy');
    });

    it('throws a validation error listing candidates when ambiguous', async () => {
      getDefinitions.mockResolvedValue([
        { id: 1, name: 'Deploy', path: '\\Frontend' },
        { id: 2, name: 'Deploy', path: '\\Backend' },
      ]);

      const promise = resolvePipelineIdByName(connection, 'proj', 'Deploy');
      await expect(promise).rejects.toThrow(AzureDevOpsValidationError);
      await expect(promise).rejects.toThrow(/Frontend\/Deploy \(id 1\)/);
      await expect(promise).rejects.toThrow(/Backend\/Deploy \(id 2\)/);
    });

    it('throws not found with similar-name suggestions', async () => {
      getDefinitions
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 9, name: 'Deploy-Prod', path: '\\' }]);

      const promise = resolvePipelineIdByName(connection, 'proj', 'Deploy');
      await expect(promise).rejects.toThrow(AzureDevOpsResourceNotFoundError);
      await expect(promise).rejects.toThrow(/Deploy-Prod \(id 9\)/);
      expect(getDefinitions).toHaveBeenLastCalledWith('proj', '*Deploy*');
    });
  });

  describe('resolveRunIdByBuildNumber', () => {
    it('resolves a single build scoped to a pipeline', async () => {
      getBuilds.mockResolvedValue([
        { id: 4711, buildNumber: '20240115.3', definition: { id: 7 } },
      ]);

      await expect(
        resolveRunIdByBuildNumber(connection, 'proj', '20240115.3', 7),
      ).resolves.toEqual({ runId: 4711, pipelineId: 7 });

      const args = getBuilds.mock.calls[0];
      expect(args[0]).toBe('proj');
      expect(args[1]).toEqual([7]);
      expect(args[3]).toBe('20240115.3');
      expect(args[16]).toBe(BuildQueryOrder.QueueTimeDescending);
    });

    it('searches the whole project when no pipeline is given', async () => {
      getBuilds.mockResolvedValue([
        { id: 5, buildNumber: '1.0.0', definition: { id: 3 } },
      ]);

      await expect(
        resolveRunIdByBuildNumber(connection, 'proj', '1.0.0'),
      ).resolves.toEqual({ runId: 5, pipelineId: 3 });
      expect(getBuilds.mock.calls[0][1]).toBeUndefined();
    });

    it('throws not found when no build matches', async () => {
      getBuilds.mockResolvedValue([]);

      await expect(
        resolveRunIdByBuildNumber(connection, 'proj', 'missing', 7),
      ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
    });

    it('throws a validation error listing runs when ambiguous', async () => {
      getBuilds.mockResolvedValue([
        { id: 2, buildNumber: 'main', definition: { id: 1, name: 'A' } },
        { id: 1, buildNumber: 'main', definition: { id: 2, name: 'B' } },
      ]);

      const promise = resolveRunIdByBuildNumber(connection, 'proj', 'main');
      await expect(promise).rejects.toThrow(AzureDevOpsValidationError);
      await expect(promise).rejects.toThrow(/runId 2, pipeline "A" \(id 1\)/);
    });
  });

  describe('resolveRunReference', () => {
    it('passes numeric identifiers through without API calls', async () => {
      await expect(
        resolveRunReference(connection, 'proj', { runId: 12, pipelineId: 3 }),
      ).resolves.toEqual({ runId: 12, pipelineId: 3 });
      expect(getDefinitions).not.toHaveBeenCalled();
      expect(getBuilds).not.toHaveBeenCalled();
    });

    it('resolves pipelineName and buildNumber together', async () => {
      getDefinitions.mockResolvedValue([{ id: 7, name: 'CI', path: '\\' }]);
      getBuilds.mockResolvedValue([{ id: 99, definition: { id: 7 } }]);

      await expect(
        resolveRunReference(connection, 'proj', {
          pipelineName: 'CI',
          buildNumber: '20240115.3',
        }),
      ).resolves.toEqual({ runId: 99, pipelineId: 7 });
      expect(getBuilds.mock.calls[0][1]).toEqual([7]);
    });

    it('resolves pipelineName alongside a runId', async () => {
      getDefinitions.mockResolvedValue([{ id: 7, name: 'CI', path: '\\' }]);

      await expect(
        resolveRunReference(connection, 'proj', {
          pipelineName: 'CI',
          runId: 42,
        }),
      ).resolves.toEqual({ runId: 42, pipelineId: 7 });
      expect(getBuilds).not.toHaveBeenCalled();
    });
  });

  describe('schema validation', () => {
    it('accepts pipelineName + buildNumber without runId', () => {
      expect(
        GetPipelineRunSchema.safeParse({
          pipelineName: 'CI',
          buildNumber: '20240115.3',
        }).success,
      ).toBe(true);
    });

    it('rejects a request without runId or buildNumber', () => {
      expect(
        GetPipelineRunSchema.safeParse({ pipelineName: 'CI' }).success,
      ).toBe(false);
    });

    it('rejects runId together with buildNumber', () => {
      expect(
        GetPipelineRunSchema.safeParse({ runId: 1, buildNumber: 'x' }).success,
      ).toBe(false);
    });

    it('rejects pipelineId together with pipelineName', () => {
      expect(
        GetPipelineRunSchema.safeParse({
          runId: 1,
          pipelineId: 2,
          pipelineName: 'CI',
        }).success,
      ).toBe(false);
    });

    it('requires pipelineId or pipelineName for list_pipeline_runs', () => {
      expect(ListPipelineRunsSchema.safeParse({}).success).toBe(false);
      expect(
        ListPipelineRunsSchema.safeParse({ pipelineName: 'CI' }).success,
      ).toBe(true);
    });
  });
});
