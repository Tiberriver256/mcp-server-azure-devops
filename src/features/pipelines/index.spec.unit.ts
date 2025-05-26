import { WebApi } from 'azure-devops-node-api';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { isPipelinesRequest, handlePipelinesRequest } from './index';
import { listPipelines } from './list-pipelines/feature';
import { getPipeline } from './get-pipeline/feature';
import { triggerPipeline } from './trigger-pipeline/feature';

jest.mock('./list-pipelines/feature');
jest.mock('./get-pipeline/feature');
jest.mock('./trigger-pipeline/feature');

describe('Pipelines Request Handlers', () => {
  const mockConnection = {} as WebApi;

  describe('isPipelinesRequest', () => {
    it('should return true for pipelines requests', () => {
      const validTools = ['list_pipelines', 'get_pipeline', 'trigger_pipeline'];
      validTools.forEach((tool) => {
        const request = {
          params: { name: tool, arguments: {} },
          method: 'tools/call',
        } as CallToolRequest;
        expect(isPipelinesRequest(request)).toBe(true);
      });
    });

    it('should return false for non-pipelines requests', () => {
      const request = {
        params: { name: 'get_project', arguments: {} },
        method: 'tools/call',
      } as CallToolRequest;
      expect(isPipelinesRequest(request)).toBe(false);
    });
  });

  describe('handlePipelinesRequest', () => {
    it('should handle list_pipelines request', async () => {
      const mockPipelines = [
        { id: 1, name: 'Pipeline 1' },
        { id: 2, name: 'Pipeline 2' },
      ];

      (listPipelines as jest.Mock).mockResolvedValue(mockPipelines);

      const request = {
        params: {
          name: 'list_pipelines',
          arguments: {
            projectId: 'test-project',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handlePipelinesRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text as string)).toEqual(
        mockPipelines,
      );
      expect(listPipelines).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          projectId: 'test-project',
        }),
      );
    });

    it('should handle get_pipeline request', async () => {
      const mockPipeline = { id: 1, name: 'Pipeline 1' };
      (getPipeline as jest.Mock).mockResolvedValue(mockPipeline);

      const request = {
        params: {
          name: 'get_pipeline',
          arguments: {
            projectId: 'test-project',
            pipelineId: 1,
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handlePipelinesRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text as string)).toEqual(
        mockPipeline,
      );
      expect(getPipeline).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          projectId: 'test-project',
          pipelineId: 1,
        }),
      );
    });

    it('should handle trigger_pipeline request', async () => {
      const mockRun = { id: 1, state: 'inProgress' };
      (triggerPipeline as jest.Mock).mockResolvedValue(mockRun);

      const request = {
        params: {
          name: 'trigger_pipeline',
          arguments: {
            projectId: 'test-project',
            pipelineId: 1,
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handlePipelinesRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text as string)).toEqual(mockRun);
      expect(triggerPipeline).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          projectId: 'test-project',
          pipelineId: 1,
        }),
      );
    });

    it('should throw error for unknown tool', async () => {
      const request = {
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
        method: 'tools/call',
      } as CallToolRequest;

      await expect(
        handlePipelinesRequest(mockConnection, request),
      ).rejects.toThrow('Unknown pipelines tool');
    });

    it('should propagate errors from pipeline functions', async () => {
      const mockError = new Error('Test error');
      (listPipelines as jest.Mock).mockRejectedValue(mockError);

      const request = {
        params: {
          name: 'list_pipelines',
          arguments: {
            projectId: 'test-project',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      await expect(
        handlePipelinesRequest(mockConnection, request),
      ).rejects.toThrow(mockError);
    });
  });
});
