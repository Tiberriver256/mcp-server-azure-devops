import type { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import {
  isAzureDevOpsServicesUrl,
  resolveAzureDevOpsBaseUrls,
} from '../../../shared/azure-devops-url.ts';
import {
  isHttpError,
  mapHttpErrorToAzureDevOpsError,
} from '../../../shared/http/http-client.ts';
import { createSessionFromEnv } from '../../../shared/session/azure-devops-session.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import type { UserProfile } from '../types.ts';

/**
 * Get details of the currently authenticated user (Azure DevOps Services only).
 */
export async function getMe(
  connectionOrContext: WebApi | ToolContext,
): Promise<UserProfile> {
  try {
    const isContext = 'requestAzureDevOps' in connectionOrContext;
    const serverUrl = isContext
      ? connectionOrContext.config.organizationUrl
      : connectionOrContext.serverUrl;

    if (!isAzureDevOpsServicesUrl(serverUrl)) {
      throw new AzureDevOpsValidationError(
        'The get_me profile endpoint is only available for Azure DevOps Services',
      );
    }

    const baseUrls = resolveAzureDevOpsBaseUrls(serverUrl);
    const organization = baseUrls.organization;

    if (!organization) {
      throw new AzureDevOpsValidationError(
        'Could not extract organization from Azure DevOps Services URL',
      );
    }

    const ctx = isContext
      ? connectionOrContext
      : createSessionFromEnv({ organizationUrl: serverUrl });

    const authHeader = await ctx.getAuthHeader();
    const response = await ctx.http.get<{
      id: string;
      displayName?: string;
      emailAddress?: string;
    }>(
      `https://vssps.dev.azure.com/${encodeURIComponent(organization)}/_apis/profile/profiles/me?api-version=7.1`,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    const profile = response.data;
    if (
      !profile ||
      typeof profile !== 'object' ||
      typeof profile.id !== 'string' ||
      profile.id.length === 0
    ) {
      throw new AzureDevOpsError(
        'Unexpected response format from Azure DevOps profile endpoint',
      );
    }

    return {
      id: profile.id,
      displayName: profile.displayName || '',
      email: profile.emailAddress || '',
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    if (isHttpError(error)) {
      throw mapHttpErrorToAzureDevOpsError(error, 'getting user information');
    }

    throw new AzureDevOpsError(
      `Failed to get user information: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
