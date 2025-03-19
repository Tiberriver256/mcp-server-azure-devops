// Mock modules need to be defined before imports
const mockWebApiConstructor = jest.fn().mockImplementation(() => {
  return {
    getWorkItemTrackingApi: jest.fn().mockResolvedValue({
      queryById: jest.fn().mockResolvedValue({
        workItems: [],
      }),
      queryByWiql: jest.fn().mockResolvedValue({
        workItems: [],
      }),
      getWorkItems: jest.fn().mockResolvedValue([]),
    }),
    getLocationsApi: jest.fn().mockResolvedValue({
      getResourceAreas: jest.fn().mockResolvedValue([]),
    }),
    getCoreApi: jest.fn().mockResolvedValue({
      getProjects: jest.fn().mockResolvedValue([]),
      getProject: jest.fn().mockResolvedValue({}),
    }),
    getGitApi: jest.fn().mockResolvedValue({}),
  };
});

const mockGetPersonalAccessTokenHandler = jest.fn();
const mockGetBearerHandler = jest.fn();

jest.mock('azure-devops-node-api', () => ({
  WebApi: mockWebApiConstructor,
  getPersonalAccessTokenHandler: mockGetPersonalAccessTokenHandler,
  getBearerHandler: mockGetBearerHandler,
}));

// Mock the server module to avoid authentication errors
jest.mock('../../../server', () => {
  const originalModule = jest.requireActual('../../../server');

  return {
    ...originalModule,
    testConnection: jest.fn().mockResolvedValue(true),
  };
});

// Define mock server class
class MockServerClass {
  setRequestHandler = jest.fn();
  registerTool = jest.fn();
  capabilities = {
    tools: {} as Record<string, { name: string }>,
  };
}

// Mock the MCP SDK modules
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => new MockServerClass()),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  CallToolRequestSchema: 'CallToolRequestSchema',
}));

// Now import modules
import { AzureDevOpsError } from '../../../shared/errors';
import { AuthenticationMethod } from '../../../shared/auth';

// Mock the work-items feature module
jest.mock('./feature', () => ({
  listWorkItems: jest.fn(),
}));

// Import the mocked modules
import { listWorkItems } from './feature';
import { createAzureDevOpsServer } from '../../../server';

describe('Server - list_work_items Tool', () => {
  let mockServer: MockServerClass;
  let callToolHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Initialize the mock server
    mockServer = new MockServerClass();

    // Mock the Server constructor to return our mockServer
    (
      require('@modelcontextprotocol/sdk/server/index.js').Server as jest.Mock
    ).mockReturnValue(mockServer);

    // Create server instance with minimal config
    createAzureDevOpsServer({
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: 'fake-pat',
      organizationUrl: 'https://dev.azure.com/fake-org',
    });

    // Get the CallToolRequestSchema handler
    callToolHandler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'CallToolRequestSchema',
    )?.[1];
  });

  it('should handle list_work_items tool call', async () => {
    // Mock the listWorkItems function to return some work items
    const mockWorkItems = [
      { id: 123, fields: { 'System.Title': 'Work Item 1' } },
      { id: 456, fields: { 'System.Title': 'Work Item 2' } },
    ];
    (listWorkItems as jest.Mock).mockResolvedValueOnce(mockWorkItems);

    // Call the handler with list_work_items tool
    const result = await callToolHandler({
      params: {
        name: 'list_work_items',
        arguments: {
          projectId: 'project1',
          wiql: 'SELECT [System.Id] FROM WorkItems',
        },
      },
    });

    // Verify the result
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(mockWorkItems, null, 2),
        },
      ],
    });

    // Verify the listWorkItems function was called with correct parameters
    expect(listWorkItems).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'project1',
      wiql: 'SELECT [System.Id] FROM WorkItems',
    });
  });

  it('should handle validation errors', async () => {
    // Mock listWorkItems to throw a validation error
    (listWorkItems as jest.Mock).mockImplementation(() => {
      // This won't be called because the zod validation will fail
      return Promise.resolve([]);
    });

    // Call the handler with invalid arguments (missing required projectId)
    const result = await callToolHandler({
      params: {
        name: 'list_work_items',
        arguments: {
          // Missing projectId
          wiql: 'SELECT [System.Id] FROM WorkItems',
        },
      },
    });

    // Verify the result contains an error message
    expect(result.content[0].text).toContain('Required');
  });

  it('should handle API errors', async () => {
    // Mock the listWorkItems function to throw an error
    (listWorkItems as jest.Mock).mockRejectedValueOnce(
      new AzureDevOpsError('API error'),
    );

    // Call the handler
    const result = await callToolHandler({
      params: {
        name: 'list_work_items',
        arguments: {
          projectId: 'project1',
        },
      },
    });

    // Verify the result contains an error message
    expect(result.content[0].text).toContain('API error');
  });
});
