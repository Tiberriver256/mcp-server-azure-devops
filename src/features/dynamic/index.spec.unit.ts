import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  handleDynamicRequest,
  initializeToolsets,
  isDynamicRequest,
  toolsets,
} from './index';

// Mock WebApi
const mockWebApi = {} as WebApi;

describe('Dynamic Toolset Feature', () => {
  // Sample tools for testing
  const sampleTools: { [key: string]: ToolDefinition[] } = {
    workItems: [
      {
        name: 'get_work_item',
        description: 'Get work item details',
        inputSchema: {},
      },
      {
        name: 'create_work_item',
        description: 'Create a new work item',
        inputSchema: {},
      },
    ],
    repositories: [
      {
        name: 'list_repositories',
        description: 'List all repositories',
        inputSchema: {},
      },
    ],
    dynamic: [
      {
        name: 'list_available_toolsets',
        description: 'List available toolsets',
        inputSchema: {},
      },
      {
        name: 'get_toolset_tools',
        description: 'Get tools in a toolset',
        inputSchema: {},
      },
      {
        name: 'enable_toolset',
        description: 'Enable a toolset',
        inputSchema: {},
      },
    ],
  };

  beforeEach(() => {
    // Clear and reinitialize toolsets before each test
    initializeToolsets(sampleTools);
  });

  describe('isDynamicRequest', () => {
    it('should identify dynamic toolset requests', () => {
      expect(
        isDynamicRequest({
          method: 'tools/call',
          params: { name: 'list_available_toolsets', arguments: {} },
        } as CallToolRequest),
      ).toBe(true);
      expect(
        isDynamicRequest({
          method: 'tools/call',
          params: { name: 'get_toolset_tools', arguments: {} },
        } as CallToolRequest),
      ).toBe(true);
      expect(
        isDynamicRequest({
          method: 'tools/call',
          params: { name: 'enable_toolset', arguments: {} },
        } as CallToolRequest),
      ).toBe(true);
    });

    it('should reject non-dynamic toolset requests', () => {
      expect(
        isDynamicRequest({
          method: 'tools/call',
          params: { name: 'get_work_item', arguments: {} },
        } as CallToolRequest),
      ).toBe(false);
    });
  });

  describe('initializeToolsets', () => {
    it('should initialize toolsets with correct state', () => {
      // Dynamic toolset should be enabled by default
      const dynamicToolset = toolsets.get('dynamic');
      expect(dynamicToolset?.enabled).toBe(true);
      expect(dynamicToolset?.tools).toHaveLength(3);

      // Other toolsets should be disabled by default
      const workItemsToolset = toolsets.get('workItems');
      expect(workItemsToolset?.enabled).toBe(false);
      expect(workItemsToolset?.tools).toHaveLength(2);

      const reposToolset = toolsets.get('repositories');
      expect(reposToolset?.enabled).toBe(false);
      expect(reposToolset?.tools).toHaveLength(1);
    });
  });

  describe('handleDynamicRequest', () => {
    it('should list available toolsets', async () => {
      const response = await handleDynamicRequest(mockWebApi, {
        method: 'tools/call',
        params: {
          name: 'list_available_toolsets',
          arguments: {},
        },
      } as CallToolRequest);

      const toolsetInfos = JSON.parse(response.content[0].text);
      expect(toolsetInfos).toHaveLength(3); // dynamic, workItems, repositories
      expect(toolsetInfos[0]).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        can_enable: 'true',
        currently_enabled: expect.any(String),
      });
    });

    it('should get toolset tools', async () => {
      const response = await handleDynamicRequest(mockWebApi, {
        method: 'tools/call',
        params: {
          name: 'get_toolset_tools',
          arguments: { toolset: 'workItems' },
        },
      } as CallToolRequest);

      const toolInfos = JSON.parse(response.content[0].text);
      expect(toolInfos).toHaveLength(2);
      expect(toolInfos[0]).toMatchObject({
        name: 'get_work_item',
        description: expect.any(String),
        can_enable: 'true',
        toolset: 'workItems',
      });
    });

    it('should enable a toolset', async () => {
      const response = await handleDynamicRequest(mockWebApi, {
        method: 'tools/call',
        params: {
          name: 'enable_toolset',
          arguments: { toolset: 'workItems' },
        },
      } as CallToolRequest);

      expect(response.content[0].text).toContain('enabled');
      const workItemsToolset = toolsets.get('workItems');
      expect(workItemsToolset?.enabled).toBe(true);
    });

    it('should handle enabling already enabled toolset', async () => {
      // Enable toolset first
      await handleDynamicRequest(mockWebApi, {
        method: 'tools/call',
        params: {
          name: 'enable_toolset',
          arguments: { toolset: 'workItems' },
        },
      } as CallToolRequest);

      // Try to enable again
      const response = await handleDynamicRequest(mockWebApi, {
        method: 'tools/call',
        params: {
          name: 'enable_toolset',
          arguments: { toolset: 'workItems' },
        },
      } as CallToolRequest);

      expect(response.content[0].text).toContain('already enabled');
    });

    it('should throw error for invalid toolset', async () => {
      await expect(
        handleDynamicRequest(mockWebApi, {
          method: 'tools/call',
          params: {
            name: 'get_toolset_tools',
            arguments: { toolset: 'nonexistent' },
          },
        } as CallToolRequest),
      ).rejects.toThrow('Toolset nonexistent not found');
    });

    it('should throw error for unknown dynamic tool', async () => {
      await expect(
        handleDynamicRequest(mockWebApi, {
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {},
          },
        } as CallToolRequest),
      ).rejects.toThrow('Unknown dynamic tool: unknown_tool');
    });
  });
});
