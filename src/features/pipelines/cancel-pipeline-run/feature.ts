import { WebApi } from 'azure-devops-node-api';
import * as BuildInterfaces from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { CancelPipelineRunOptions } from '../types';

/**
 * Cancel a running pipeline
 *
 * Azure DevOps pipelines are built on top of the Build system, so we use the Build API
 * to cancel pipeline runs. The pipeline run ID corresponds to the build ID.
 *
 * @param connection - The Azure DevOps connection
 * @param options - Options including pipeline and run IDs
 * @returns The updated run status
 */
export async function cancelPipelineRun(
  connection: WebApi,
  options: CancelPipelineRunOptions,
): Promise<{
  pipelineId: number;
  runId: number;
  status: string;
  result?: string;
  message: string;
  canceledBy?: string;
  cancelTime?: Date;
}> {
  const buildApi = await connection.getBuildApi();
  const projectId = options.projectId ?? 'CCTV';

  try {
    // First get the current build to check its status
    const currentBuild = await buildApi.getBuild(projectId, options.runId);

    if (!currentBuild) {
      throw new Error(`Pipeline run ${options.runId} not found`);
    }

    // Check if the build is already completed or cancelled
    if (currentBuild.status === BuildInterfaces.BuildStatus.Completed) {
      return {
        pipelineId: options.pipelineId,
        runId: options.runId,
        status: 'Completed',
        result: BuildInterfaces.BuildResult[currentBuild.result ?? 0],
        message: `Pipeline run ${options.runId} is already completed with result: ${BuildInterfaces.BuildResult[currentBuild.result ?? 0]}`,
      };
    }

    if (currentBuild.status === BuildInterfaces.BuildStatus.Cancelling) {
      return {
        pipelineId: options.pipelineId,
        runId: options.runId,
        status: 'Cancelling',
        message: `Pipeline run ${options.runId} is already being cancelled`,
      };
    }

    // Update the build status to Cancelling
    const updateBuild: BuildInterfaces.Build = {
      status: BuildInterfaces.BuildStatus.Cancelling,
    };

    // If a reason was provided, add it to the build
    if (options.reason) {
      updateBuild.keepForever = false;
      updateBuild.tags = [`Cancelled: ${options.reason}`];
    }

    // Cancel the build
    const updatedBuild = await buildApi.updateBuild(
      updateBuild,
      projectId,
      options.runId,
    );

    return {
      pipelineId: options.pipelineId,
      runId: options.runId,
      status: BuildInterfaces.BuildStatus[updatedBuild.status ?? 0],
      result: updatedBuild.result
        ? BuildInterfaces.BuildResult[updatedBuild.result]
        : undefined,
      message: `Successfully initiated cancellation of pipeline run ${options.runId}`,
      canceledBy: updatedBuild.requestedFor?.displayName,
      cancelTime: updatedBuild.finishTime,
    };
  } catch (error: any) {
    // Check if it's a not found error
    if (error.statusCode === 404 || error.message?.includes('404')) {
      throw new Error(
        `Pipeline run ${options.runId} not found. Note: The run ID must match an existing build ID.`,
      );
    }

    // Check if it's an authorization error
    if (error.statusCode === 401 || error.message?.includes('401')) {
      throw new Error(
        `Not authorized to cancel pipeline run ${options.runId}. Check your PAT permissions.`,
      );
    }

    throw new Error(
      `Failed to cancel pipeline run ${options.runId}: ${error.message || error}`,
    );
  }
}
