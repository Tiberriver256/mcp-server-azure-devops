import { AzureDevOpsClient } from '../../../shared/api/client';
import { createWikiPage } from './feature'; // Assuming feature.ts is in the same directory
import { CreateWikiPageSchema } from './schema'; // Assuming schema.ts is in the same directory
import { handleRequestError } from '../../../shared/errors/handle-request-error';
import { z } from 'zod';

// Mock the AzureDevOpsClient
jest.mock('../../../shared/api/client');
// Mock the error handler
jest.mock('../../../shared/errors/handle-request-error');

describe('createWikiPage Feature', () => {
  let client: jest.Mocked<AzureDevOpsClient>;
  const mockPut = jest.fn();

  const defaultParams: z.infer<typeof CreateWikiPageSchema> = {
    wikiId: 'test-wiki',
    content: 'Hello world',
  };

  beforeEach(() => {
    // Reset mocks for each test
    mockPut.mockReset();
    (handleRequestError as jest.Mock).mockReset();

    client = {
      put: mockPut,
      defaults: {
        organizationId: 'defaultOrg',
        projectId: 'defaultProject',
      },
    } as unknown as jest.Mocked<AzureDevOpsClient>;
  });

  it('should call client.put with correct URL and data for default org and project', async () => {
    mockPut.mockResolvedValue({ data: { some: 'response' } });
    await createWikiPage(defaultParams, client);

    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(
      'defaultOrg/defaultProject/_apis/wiki/wikis/test-wiki/pages?path=%2F&api-version=7.1-preview.1',
      { content: 'Hello world' },
    );
  });

  it('should call client.put with correct URL when projectId is explicitly provided', async () => {
    mockPut.mockResolvedValue({ data: { some: 'response' } });
    const paramsWithProject: z.infer<typeof CreateWikiPageSchema> = {
      ...defaultParams,
      projectId: 'customProject',
    };
    await createWikiPage(paramsWithProject, client);

    expect(mockPut).toHaveBeenCalledWith(
      'defaultOrg/customProject/_apis/wiki/wikis/test-wiki/pages?path=%2F&api-version=7.1-preview.1',
      { content: 'Hello world' },
    );
  });

  it('should call client.put with correct URL when organizationId is explicitly provided', async () => {
    mockPut.mockResolvedValue({ data: { some: 'response' } });
    const paramsWithOrg: z.infer<typeof CreateWikiPageSchema> = {
      ...defaultParams,
      organizationId: 'customOrg',
    };
    await createWikiPage(paramsWithOrg, client);

    expect(mockPut).toHaveBeenCalledWith(
      'customOrg/defaultProject/_apis/wiki/wikis/test-wiki/pages?path=%2F&api-version=7.1-preview.1',
      { content: 'Hello world' },
    );
  });
  
  it('should call client.put with correct URL when projectId is null (project-level wiki)', async () => {
    mockPut.mockResolvedValue({ data: { some: 'response' } });
    const paramsWithNullProject: z.infer<typeof CreateWikiPageSchema> = {
      ...defaultParams,
      projectId: null, // Explicitly null for project-level resources that don't need a project
    };
    // Client default for projectId should also be null or undefined in this scenario, or the API structure should be different.
    // For this test, let's assume the client default projectId can be ignored if params.projectId is null.
    // This test might need adjustment based on how project-level vs org-level resources are handled if projectId is null.
    // For now, let's assume it means the project part of the URL is omitted IF client.defaults.projectId is also not set.
    // If client.defaults.projectId IS set, current logic will use it.
    // A more robust way would be to have distinct logic for project-scoped vs organization-scoped resources.
    // However, based on the current feature.ts, if params.projectId is null, it falls back to client.defaults.projectId.
    // To truly test omitting project, client.defaults.projectId would also need to be undefined/null.
    
    // Let's refine the test: if projectId is explicitly null, and we want to test URL without project,
    // the client default should also reflect that.
    client.defaults.projectId = undefined; // Simulate no default project for this specific test case
    await createWikiPage(paramsWithNullProject, client);

    expect(mockPut).toHaveBeenCalledWith(
      'defaultOrg/_apis/wiki/wikis/test-wiki/pages?path=%2F&api-version=7.1-preview.1',
      { content: 'Hello world' },
    );
  });


  it('should correctly encode pagePath in the URL', async () => {
    mockPut.mockResolvedValue({ data: { some: 'response' } });
    const paramsWithPath: z.infer<typeof CreateWikiPageSchema> = {
      ...defaultParams,
      pagePath: '/My Test Page/Sub Page',
    };
    await createWikiPage(paramsWithPath, client);

    expect(mockPut).toHaveBeenCalledWith(
      'defaultOrg/defaultProject/_apis/wiki/wikis/test-wiki/pages?path=%2FMy%20Test%20Page%2FSub%20Page&api-version=7.1-preview.1',
      { content: 'Hello world' },
    );
  });
  
  it('should use default pagePath "/" if pagePath is null', async () => {
    mockPut.mockResolvedValue({ data: { some: 'response' } });
    const paramsWithPath: z.infer<typeof CreateWikiPageSchema> = {
      ...defaultParams,
      pagePath: null, // Explicitly null
    };
    await createWikiPage(paramsWithPath, client);

    expect(mockPut).toHaveBeenCalledWith(
      'defaultOrg/defaultProject/_apis/wiki/wikis/test-wiki/pages?path=%2F&api-version=7.1-preview.1',
      { content: 'Hello world' },
    );
  });


  it('should return the data from the response on success', async () => {
    const expectedResponse = { id: '123', path: '/', content: 'Hello world' };
    mockPut.mockResolvedValue({ data: expectedResponse });
    const result = await createWikiPage(defaultParams, client);

    expect(result).toEqual(expectedResponse);
  });

  it('should throw if organizationId is not provided and not set in defaults', async () => {
    client.defaults.organizationId = undefined; // Ensure no default org
    const paramsNoOrg: z.infer<typeof CreateWikiPageSchema> = {
      wikiId: 'test-wiki',
      content: 'Hello world',
      organizationId: null, // Explicitly null and no default
    };
    
    await expect(createWikiPage(paramsNoOrg, client)).rejects.toThrow(
      'Organization ID is not defined. Please provide it or set a default.'
    );
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('should call handleRequestError if client.put throws an error', async () => {
    const error = new Error('API Error');
    mockPut.mockRejectedValue(error);
    (handleRequestError as jest.Mock).mockResolvedValue(new Error('Handled Error')); // Simulate handleRequestError transforming the error

    await expect(createWikiPage(defaultParams, client)).rejects.toThrow('Handled Error');
    expect(handleRequestError).toHaveBeenCalledTimes(1);
    expect(handleRequestError).toHaveBeenCalledWith(error, 'Failed to create or update wiki page');
  });
});
