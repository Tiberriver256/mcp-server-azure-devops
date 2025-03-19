/**
 * Organization interface
 */
export interface Organization {
  /**
   * The ID of the organization
   */
  id: string;

  /**
   * The name of the organization
   */
  name: string;

  /**
   * The URL of the organization
   */
  url: string;
}

/**
 * Azure DevOps resource ID for token acquisition
 */
export const AZURE_DEVOPS_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798';
