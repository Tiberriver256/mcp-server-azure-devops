export { AZURE_DEVOPS_RESOURCE_ID } from '../../shared/auth/auth-factory.ts';

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
