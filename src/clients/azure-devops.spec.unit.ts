import axios from 'axios';
import { getWikiClient } from './azure-devops';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WikiClient base urls', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DEVOPS_AUTH_METHOD: 'pat',
      AZURE_DEVOPS_PAT: 'test-pat',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses server base url when organizationUrl points to Azure DevOps Server', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        value: [],
      },
    });

    const client = await getWikiClient({
      organizationUrl: 'https://ado.local/tfs/DefaultCollection',
      projectId: 'ProjectX',
    });

    await client.listWikiPages('ProjectX', 'wiki1');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://ado.local/tfs/DefaultCollection/ProjectX/_apis/wiki/wikis/wiki1/pagesbatch',
      expect.any(Object),
      expect.objectContaining({
        params: {
          'api-version': '7.1',
        },
        headers: expect.any(Object),
      }),
    );
  });
});
