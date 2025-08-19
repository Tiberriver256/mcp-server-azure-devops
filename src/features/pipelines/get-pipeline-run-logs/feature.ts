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

      // Check if log is null or undefined
      if (!log) {
        console.warn(
          `Log ${logId} not found for pipeline ${pipelineId}, run ${runId}`,
        );
        return {
          logs: null,
          content: undefined,
        };
      }

      // Log the structure for debugging
      console.log('Log object structure:', {
        id: log.id,
        hasUrl: !!log.url,
        urlLength: log.url?.length,
        signedContent: log.signedContent
          ? {
              hasUrl: !!log.signedContent.url,
              signatureExpires: log.signedContent.signatureExpires,
            }
          : undefined,
      });

      // If we have a signed URL, fetch the content
      let content: string | undefined;
      // Use signedContent.url if available (when expand=signedContent), otherwise fall back to log.url
      const logUrl = log.signedContent?.url || log.url;

      if (logUrl) {
        try {
          console.log(
            `Attempting to fetch log content from: ${logUrl.substring(0, 100)}...`,
          );
          const response = await fetch(logUrl);

          if (!response.ok) {
            console.warn(
              `Failed to fetch log content - Status: ${response.status} ${response.statusText}`,
            );

            // Check if it's an HTML authentication page
            const contentType = response.headers.get('content-type');
            if (contentType?.includes('text/html')) {
              console.warn(
                'Received HTML response (likely authentication page) instead of log content',
              );
              console.warn(
                'This may indicate the signed URL requires additional authentication or has expired',
              );
            }
          } else {
            content = await response.text();
            console.log(
              `Successfully fetched log content (${content.length} characters)`,
            );
          }
        } catch (fetchError) {
          // Log fetch error but don't fail the operation
          console.error('Failed to fetch log content:', fetchError);
        }
      }

      return {
        logs: { logs: [log] },
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

      // Check if logs is null or undefined
      if (!logs) {
        console.warn(`No logs found for pipeline ${pipelineId}, run ${runId}`);
        return {
          logs: null,
          content: undefined,
        };
      }

      // Optionally fetch content for all logs
      const contents: string[] = [];
      if (options.fetchContent && logs.logs) {
        console.log(
          `Attempting to fetch content for ${logs.logs.length} logs...`,
        );

        for (const log of logs.logs) {
          // Use signedContent.url if available (when expand=signedContent), otherwise fall back to log.url
          const logUrl = log.signedContent?.url || log.url;

          if (logUrl) {
            try {
              console.log(
                `Fetching log ${log.id} from: ${logUrl.substring(0, 100)}...`,
              );
              const response = await fetch(logUrl);

              if (!response.ok) {
                console.warn(
                  `Failed to fetch log ${log.id} - Status: ${response.status} ${response.statusText}`,
                );

                // Check if it's an HTML authentication page
                const contentType = response.headers.get('content-type');
                if (contentType?.includes('text/html')) {
                  console.warn(
                    `Log ${log.id}: Received HTML (likely authentication page) instead of log content`,
                  );
                }
                contents.push(''); // Add empty string to maintain index alignment
              } else {
                const content = await response.text();
                console.log(
                  `Successfully fetched log ${log.id} (${content.length} characters)`,
                );
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
            console.warn(`Log ${log.id} has no URL available`);
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
