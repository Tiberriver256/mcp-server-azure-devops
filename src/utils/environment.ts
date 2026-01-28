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

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return 'unknown-organization';
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === 'dev.azure.com') {
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    return segments[0] ?? 'unknown-organization';
  }

  if (hostname.endsWith('.visualstudio.com')) {
    return hostname.split('.')[0] || 'unknown-organization';
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return 'unknown-organization';
  }

  if (segments[0].toLowerCase() === 'tfs') {
    return segments[1] ?? 'unknown-organization';
  }

  return segments[0] ?? 'unknown-organization';
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
