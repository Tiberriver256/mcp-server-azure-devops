import { WebApi } from 'azure-devops-node-api';
import { getPersonalAccessTokenHandler } from 'azure-devops-node-api';
import { AzureDevOpsConfig } from '../types';
import { AuthenticationMethod } from '../auth';

const EXAMPLE_ORG_URLS = new Set(['https://dev.azure.com/your-organization']);
const EXAMPLE_PATS = new Set(['your-personal-access-token']);

function hasConfiguredOrgUrl(): boolean {
  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL?.trim();
  if (!orgUrl) {
    return false;
  }

  return !EXAMPLE_ORG_URLS.has(orgUrl);
}

function hasConfiguredPat(): boolean {
  const pat = process.env.AZURE_DEVOPS_PAT?.trim();
  if (!pat) {
    return false;
  }

  return !EXAMPLE_PATS.has(pat);
}

/**
 * Creates a WebApi connection for tests with real credentials
 *
 * @returns WebApi connection
 */
export async function getTestConnection(): Promise<WebApi | null> {
  // If we have real credentials, use them
  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
  const token = process.env.AZURE_DEVOPS_PAT;

  if (hasConfiguredOrgUrl() && hasConfiguredPat() && orgUrl && token) {
    const authHandler = getPersonalAccessTokenHandler(token);
    return new WebApi(orgUrl, authHandler);
  }

  // If we don't have credentials, return null
  return null;
}

/**
 * Creates test configuration for Azure DevOps tests
 *
 * @returns Azure DevOps config
 */
export function getTestConfig(): AzureDevOpsConfig | null {
  // If we have real credentials, use them
  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
  const pat = process.env.AZURE_DEVOPS_PAT;

  if (hasConfiguredOrgUrl() && hasConfiguredPat() && orgUrl && pat) {
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
 * Determines if Azure DevOps-backed tests should be skipped.
 *
 * @returns true if Azure DevOps-backed tests should be skipped
 */
export function shouldSkipAzureDevOpsTests(): boolean {
  if (!hasConfiguredOrgUrl() || !hasConfiguredPat()) {
    console.log(
      'Skipping Azure DevOps-backed tests: No real Azure DevOps connection available',
    );
    return true;
  }
  return false;
}

/**
 * Extracts text content from an MCP response content array.
 *
 * The newer MCP SDK models content as a discriminated union, so tests need to
 * narrow to a text item before reading `.text`.
 */
export function getTextContent(
  content: Array<{ type?: string; text?: unknown }>,
  index = 0,
): string {
  const item = content[index];

  if (!item || item.type !== 'text' || typeof item.text !== 'string') {
    throw new Error(`Expected text content at index ${index}`);
  }

  return item.text;
}
