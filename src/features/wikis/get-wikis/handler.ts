import { WebApi } from 'azure-devops-node-api';
import { GetWikisSchema } from './schema';
import { getWikis } from './feature';
import { defaultOrg, defaultProject } from '../../../utils/environment';

/**
 * Handler for the "get_wikis" tool
 *
 * This handler retrieves wikis in a specified project or organization.
 *
 * @param connection The Azure DevOps WebApi connection
 * @param toolParams The parameters for the tool call
 * @returns List of wikis
 */
export const getWikisHandler = async (
  connection: WebApi,
  toolParams: Record<string, unknown>,
) => {
  // Parse and validate the parameters
  const params = GetWikisSchema.parse(toolParams);

  // Use default organization ID if not provided
  const organizationId = params.organizationId || defaultOrg;

  // Call the feature implementation
  const wikis = await getWikis(connection, {
    organizationId,
    projectId: params.projectId ?? defaultProject,
  });

  // Return the wikis
  return wikis;
};
