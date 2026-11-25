import type { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import {
  isAzureDevOpsServicesUrl,
  resolveAzureDevOpsBaseUrls,
} from '../../../shared/azure-devops-url';
import { isHttpError } from '../../../shared/http/http-client';
import { createSessionFromEnv } from '../../../shared/session/azure-devops-session';
import type { ToolContext } from '../../../shared/session/azure-devops-session';
import type { UserProfile } from '../types';

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
      `https://vssps.dev.azure.com/${organization}/_apis/profile/profiles/me?api-version=7.1`,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    const profile = response.data;
    return {
      id: profile.id,
      displayName: profile.displayName || '',
      email: profile.emailAddress || '',
    };
  } catch (error) {
    if (isHttpError(error) && (error.status === 401 || error.status === 403)) {
      throw new AzureDevOpsAuthenticationError(
        `Authentication failed: ${error.message}`,
      );
    }

    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    throw new AzureDevOpsError(
      `Failed to get user information: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
