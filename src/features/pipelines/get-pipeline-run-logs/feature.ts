import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { defaultProject } from '../../../utils/environment';
import { GetPipelineRunLogsOptions } from '../types';
import { LogCollection } from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import * as PipelinesInterfaces from 'azure-devops-node-api/interfaces/PipelinesInterfaces';

/**
 * Get logs for a specific pipeline run
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting pipeline run logs
 * @returns The logs for the pipeline run
 */
export async function getPipelineRunLogs(
  connection: WebApi,
  options: GetPipelineRunLogsOptions,
): Promise<{ logs: LogCollection; content?: string[] }> {
  try {
    const pipelinesApi = await connection.getPipelinesApi();
    const {
      projectId = defaultProject,
      pipelineId,
      runId,
      logId,
      expand = 'signedContent',
    } = options;

    // Convert string expand to enum value
    const expandEnum =
      expand === 'signedContent'
        ? PipelinesInterfaces.GetLogExpandOptions.SignedContent
        : PipelinesInterfaces.GetLogExpandOptions.None;

    if (logId !== undefined) {
      // Get specific log content
      const log = await pipelinesApi.getLog(
        projectId,
        pipelineId,
        runId,
        logId,
        expandEnum,
      );

      // If we have a signed URL, fetch the content
      let content: string | undefined;
      if (log.url) {
        try {
          const response = await fetch(log.url);
          if (response.ok) {
            content = await response.text();
          }
        } catch (fetchError) {
          // Log fetch error but don't fail the operation
          console.error('Failed to fetch log content:', fetchError);
        }
      }

      return {
        logs: { count: 1, value: [log] },
        content: content ? [content] : undefined,
      };
    } else {
      // List all logs for the run
      const logs = await pipelinesApi.listLogs(
        projectId,
        pipelineId,
        runId,
        expandEnum,
      );

      // Optionally fetch content for all logs
      const contents: string[] = [];
      if (options.fetchContent && logs.value) {
        for (const log of logs.value) {
          if (log.url) {
            try {
              const response = await fetch(log.url);
              if (response.ok) {
                const content = await response.text();
                contents.push(content);
              }
            } catch (fetchError) {
              // Log fetch error but continue with other logs
              console.error(
                `Failed to fetch content for log ${log.id}:`,
                fetchError,
              );
              contents.push(''); // Add empty string to maintain index alignment
            }
          } else {
            contents.push(''); // No URL available
          }
        }
      }

      return {
        logs,
        content: contents.length > 0 ? contents : undefined,
      };
    }
  } catch (error) {
    // Handle specific error types
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    // Check for specific error types and convert to appropriate Azure DevOps errors
    if (error instanceof Error) {
      if (
        error.message.includes('Authentication') ||
        error.message.includes('Unauthorized') ||
        error.message.includes('401')
      ) {
        throw new AzureDevOpsAuthenticationError(
          `Failed to authenticate: ${error.message}`,
        );
      }

      if (
        error.message.includes('not found') ||
        error.message.includes('does not exist') ||
        error.message.includes('404')
      ) {
        throw new AzureDevOpsResourceNotFoundError(
          `Pipeline run or logs not found: ${error.message}`,
        );
      }
    }

    // Otherwise, wrap it in a generic error
    throw new AzureDevOpsError(
      `Failed to get pipeline run logs: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
