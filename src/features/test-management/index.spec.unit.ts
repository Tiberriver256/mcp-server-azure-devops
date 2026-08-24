import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import { handleTestManagementRequest, isTestManagementRequest } from './index';
import { createTestRun } from './feature';

jest.mock('./feature');

describe('test management request handler', () => {
  const connection = {} as WebApi;

  it('recognizes all Test Management tools', () => {
    const names = [
      'list_test_plans',
      'list_test_suites',
      'list_suite_test_cases',
      'list_test_points',
      'create_test_run',
      'list_test_results',
      'update_test_results',
      'complete_test_run',
    ];

    for (const name of names) {
      expect(
        isTestManagementRequest({
          method: 'tools/call',
          params: { name, arguments: {} },
        } as CallToolRequest),
      ).toBe(true);
    }
  });

  it('routes a create_test_run request with validated arguments', async () => {
    (createTestRun as jest.Mock).mockResolvedValue({ id: 41 });
    const request = {
      method: 'tools/call',
      params: {
        name: 'create_test_run',
        arguments: {
          projectId: 'Example',
          name: 'Release regression',
          planId: 10,
          pointIds: [101],
        },
      },
    } as CallToolRequest;

    const response = await handleTestManagementRequest(connection, request);

    expect(JSON.parse(response.content[0].text as string)).toEqual({ id: 41 });
    expect(createTestRun).toHaveBeenCalledWith(connection, {
      projectId: 'Example',
      name: 'Release regression',
      planId: 10,
      pointIds: [101],
    });
  });
});
