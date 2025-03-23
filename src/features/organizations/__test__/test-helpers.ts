import { AzureDevOpsConfig } from '../../../shared/types';
import { AuthenticationMethod } from '../../../shared/auth';

/**
 * Creates test configuration for Azure DevOps tests
 *
 * @returns Azure DevOps config
 */
export function getTestConfig(): AzureDevOpsConfig | null {
  // If we have real credentials, use them
  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
  const pat = process.env.AZURE_DEVOPS_PAT;

  if (orgUrl && pat) {
    return {
      organizationUrl: orgUrl,
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: pat,
      defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT,
    };
  }

  // If we don't have credentials, return null
  return null;
}

/**
 * Determines if integration tests should be skipped
 *
 * @returns true if integration tests should be skipped
 */
export function shouldSkipIntegrationTest(): boolean {
  if (!process.env.AZURE_DEVOPS_ORG_URL || !process.env.AZURE_DEVOPS_PAT) {
    console.log(
      'Skipping integration test: No real Azure DevOps connection available',
    );
    return true;
  }
  return false;
}
