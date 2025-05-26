import { WebApi } from 'azure-devops-node-api';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { isProjectsRequest, handleProjectsRequest } from './index';
import { getProject } from './get-project';
import { getProjectDetails } from './get-project-details';
import { listProjects } from './list-projects';

// Mock the imported modules
jest.mock('./get-project', () => ({
  getProject: jest.fn(),
}));

jest.mock('./get-project-details', () => ({
  getProjectDetails: jest.fn(),
}));

jest.mock('./list-projects', () => ({
  listProjects: jest.fn(),
}));

describe('Projects Request Handlers', () => {
  const mockConnection = {} as WebApi;

  describe('isProjectsRequest', () => {
    it('should return true for projects requests', () => {
      const validTools = [
        'list_projects',
        'get_project',
        'get_project_details',
      ];
      validTools.forEach((tool) => {
        const request = {
          params: { name: tool, arguments: {} },
          method: 'tools/call',
        } as CallToolRequest;
        expect(isProjectsRequest(request)).toBe(true);
      });
    });

    it('should return false for non-projects requests', () => {
      const request = {
        params: { name: 'list_work_items', arguments: {} },
        method: 'tools/call',
      } as CallToolRequest;
      expect(isProjectsRequest(request)).toBe(false);
    });
  });

  describe('handleProjectsRequest', () => {
    it('should handle list_projects request', async () => {
      const mockProjects = [
        { id: '1', name: 'Project 1' },
        { id: '2', name: 'Project 2' },
      ];

      (listProjects as jest.Mock).mockResolvedValue(mockProjects);

      const request = {
        params: {
          name: 'list_projects',
          arguments: {
            top: 10,
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleProjectsRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text as string)).toEqual(
        mockProjects,
      );
      expect(listProjects).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          top: 10,
        }),
      );
    });

    it('should handle get_project request', async () => {
      const mockProject = { id: '1', name: 'Project 1' };
      (getProject as jest.Mock).mockResolvedValue(mockProject);

      const request = {
        params: {
          name: 'get_project',
          arguments: {
            projectId: 'Project 1',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleProjectsRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text as string)).toEqual(
        mockProject,
      );
      expect(getProject).toHaveBeenCalledWith(mockConnection, 'Project 1');
    });

    it('should handle get_project_details request', async () => {
      const mockProjectDetails = {
        id: '1',
        name: 'Project 1',
        teams: [{ id: 'team1', name: 'Team 1' }],
      };

      (getProjectDetails as jest.Mock).mockResolvedValue(mockProjectDetails);

      const request = {
        params: {
          name: 'get_project_details',
          arguments: {
            projectId: 'Project 1',
            includeTeams: true,
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleProjectsRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text as string)).toEqual(
        mockProjectDetails,
      );
      expect(getProjectDetails).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          projectId: 'Project 1',
          includeTeams: true,
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
        handleProjectsRequest(mockConnection, request),
      ).rejects.toThrow('Unknown projects tool');
    });

    it('should propagate errors from project functions', async () => {
      const mockError = new Error('Test error');
      (listProjects as jest.Mock).mockRejectedValue(mockError);

      const request = {
        params: {
          name: 'list_projects',
          arguments: {},
        },
        method: 'tools/call',
      } as CallToolRequest;

      await expect(
        handleProjectsRequest(mockConnection, request),
      ).rejects.toThrow(mockError);
    });
  });
});
