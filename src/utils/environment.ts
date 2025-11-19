// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

/**
 * Utility functions and constants related to environment variables.
 */

/**
 * Extract organization name from Azure DevOps organization URL
 */
export function getOrgNameFromUrl(url?: string): string {
  if (!url) return 'unknown-organization';

  // Match Azure DevOps Services (cloud)
  const devMatch = url.match(/https?:\/\/dev\.azure\.com\/([^/]+)/);
  if (devMatch) return devMatch[1];

  // Match Azure DevOps Server (on-prem TFS)
  const tfsMatch = url.match(/https?:\/\/[^/]+\/tfs\/([^/]+)/);
  if (tfsMatch) return tfsMatch[1];

  // Fallback
  if (url.includes('azure')) {
    const fallbackMatch = url.match(/https?:\/\/[^/]+\/([^/]+)/);
    return fallbackMatch ? fallbackMatch[1] : 'unknown-organization';
  }

  return 'unknown-organization';
}

/**
 * Default project name from environment variables
 */
export const defaultProject =
  process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'no default project';

/**
 * Default organization name derived from the organization URL
 */
export const defaultOrg = getOrgNameFromUrl(process.env.AZURE_DEVOPS_ORG_URL);
