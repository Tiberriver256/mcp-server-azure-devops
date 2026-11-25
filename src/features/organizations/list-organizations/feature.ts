import type { AzureDevOpsConfig } from '../../../shared/types';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import { isAzureDevOpsServicesUrl } from '../../../shared/azure-devops-url';
import {
  isHttpError,
  mapHttpErrorToAzureDevOpsError,
} from '../../../shared/http/http-client';
import { createAzureDevOpsSession } from '../../../shared/session/azure-devops-session';
import type { ToolContext } from '../../../shared/session/azure-devops-session';
import type { Organization } from '../types';

interface AzureDevOpsAccountRecord {
  accountId: string;
  accountName: string;
  accountUri: string;
}

/**
 * Lists all Azure DevOps organizations accessible to the authenticated user
 * (Azure DevOps Services only).
 */
export async function listOrganizations(
  configOrContext: AzureDevOpsConfig | ToolContext,
): Promise<Organization[]> {
  try {
    const isContext = 'requestAzureDevOps' in configOrContext;
    const organizationUrl = isContext
      ? configOrContext.config.organizationUrl
      : configOrContext.organizationUrl;

    if (!isAzureDevOpsServicesUrl(organizationUrl)) {
      throw new AzureDevOpsValidationError(
        'The list_organizations endpoint is only available for Azure DevOps Services',
      );
    }

    const ctx = isContext
      ? configOrContext
      : createAzureDevOpsSession(configOrContext);

    const authHeader = await ctx.getAuthHeader();

    // Step 1: Get the user profile to get the publicAlias
    const profileResponse = await ctx.http.get<{ publicAlias?: string }>(
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0',
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    const publicAlias =
      profileResponse.data && typeof profileResponse.data === 'object'
        ? profileResponse.data.publicAlias
        : undefined;
    if (typeof publicAlias !== 'string' || publicAlias.length === 0) {
      throw new AzureDevOpsAuthenticationError(
        'Unable to get user publicAlias from profile',
      );
    }

    // Step 2: Get organizations using the publicAlias
    const orgsResponse = await ctx.http.get<{
      value?: AzureDevOpsAccountRecord[];
    }>(
      `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${encodeURIComponent(publicAlias)}&api-version=6.0`,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    if (
      !orgsResponse.data ||
      typeof orgsResponse.data !== 'object' ||
      !Array.isArray(orgsResponse.data.value)
    ) {
      throw new AzureDevOpsError(
        'Unexpected response format from Azure DevOps accounts endpoint',
      );
    }

    return orgsResponse.data.value.map((org) => ({
      id: org.accountId,
      name: org.accountName,
      url: org.accountUri,
    }));
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    if (isHttpError(error)) {
      throw mapHttpErrorToAzureDevOpsError(error, 'listing organizations');
    }

    if (
      error instanceof Error &&
      (error.message.includes('Unauthorized') ||
        error.message.includes('Authentication'))
    ) {
      throw new AzureDevOpsAuthenticationError(
        `Authentication failed: ${error.message}`,
      );
    }

    throw new AzureDevOpsError(
      `Failed to list organizations: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
