import * as azureDevOpsClient from '../../../clients/azure-devops';
import { updateWikiPage } from './feature';
import { ZodError } from 'zod';

jest.mock('../../../clients/azure-devops');

const mockUpdatePage = jest.fn();

(azureDevOpsClient.getWikiClient as jest.Mock).mockResolvedValue({
  updatePage: mockUpdatePage,
});

describe('updateWikiPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (azureDevOpsClient.getWikiClient as jest.Mock).mockResolvedValue({
      updatePage: mockUpdatePage,
    });
  });

  it('should update a wiki page with required options', async () => {
    const mockResult = { id: 1, path: '/TestPage', content: 'Updated content' };
    mockUpdatePage.mockResolvedValue(mockResult);

    const result = await updateWikiPage({
      wikiId: 'wiki-1',
      pagePath: '/TestPage',
      content: 'Updated content',
    });

    expect(result).toEqual(mockResult);
    expect(azureDevOpsClient.getWikiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: expect.any(String),
        projectId: expect.any(String),
      }),
    );
    expect(mockUpdatePage).toHaveBeenCalledWith(
      { content: 'Updated content' },
      expect.any(String),
      'wiki-1',
      '/TestPage',
      { comment: undefined },
    );
  });

  it('should pass comment when provided', async () => {
    mockUpdatePage.mockResolvedValue({ id: 1, path: '/Page' });

    await updateWikiPage({
      wikiId: 'wiki-1',
      pagePath: '/Page',
      content: 'New content',
      comment: 'Updated via test',
    });

    expect(mockUpdatePage).toHaveBeenCalledWith(
      { content: 'New content' },
      expect.any(String),
      'wiki-1',
      '/Page',
      { comment: 'Updated via test' },
    );
  });

  it('should use custom org and project when provided', async () => {
    mockUpdatePage.mockResolvedValue({ id: 1 });

    await updateWikiPage({
      organizationId: 'custom-org',
      projectId: 'custom-project',
      wikiId: 'wiki-2',
      pagePath: '/CustomPage',
      content: 'Custom content',
    });

    expect(azureDevOpsClient.getWikiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'custom-org',
        projectId: 'custom-project',
      }),
    );
  });

  it('should throw ZodError for missing wikiId', async () => {
    await expect(
      updateWikiPage({
        wikiId: '',
        pagePath: '/Page',
        content: 'Content',
      }),
    ).rejects.toThrow(ZodError);
  });

  it('should throw ZodError for missing pagePath', async () => {
    await expect(
      updateWikiPage({
        wikiId: 'wiki-1',
        pagePath: '',
        content: 'Content',
      }),
    ).rejects.toThrow(ZodError);
  });

  it('should throw ZodError for missing content', async () => {
    await expect(
      updateWikiPage({
        wikiId: 'wiki-1',
        pagePath: '/Page',
        content: '',
      }),
    ).rejects.toThrow(ZodError);
  });

  it('should propagate errors from the wiki client', async () => {
    mockUpdatePage.mockRejectedValue(new Error('Wiki API error'));

    await expect(
      updateWikiPage({
        wikiId: 'wiki-1',
        pagePath: '/Page',
        content: 'Content',
      }),
    ).rejects.toThrow('Wiki API error');
  });

  it('should handle null comment as undefined', async () => {
    mockUpdatePage.mockResolvedValue({ id: 1 });

    await updateWikiPage({
      wikiId: 'wiki-1',
      pagePath: '/Page',
      content: 'Content',
      comment: null,
    });

    expect(mockUpdatePage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      'wiki-1',
      '/Page',
      { comment: undefined },
    );
  });
});
