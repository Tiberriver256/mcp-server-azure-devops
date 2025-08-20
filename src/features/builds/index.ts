/**
 * Builds feature
 *
 * Provides tools for working with build artifacts, code coverage, and test results
 */
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { defaultProject } from '../../utils/environment';

// Import schemas
import {
  ListBuildArtifactsSchema,
  GetBuildArtifactSchema,
} from './artifacts/schema';
import {
  GetCodeCoverageSchema,
  GetCodeCoverageDetailsSchema,
} from './coverage/schema';
import {
  GetTestResultsSchema,
  GetTestRunStatsSchema,
} from './test-results/schema';

// Import features
import { listBuildArtifacts, getBuildArtifact } from './artifacts/feature';
import { getCodeCoverage, getCodeCoverageDetails } from './coverage/feature';
import { getTestResults, getTestRunStats } from './test-results/feature';

/**
 * Checks if the request is for the builds feature
 */
export const isBuildsRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return (
    toolName === 'list_build_artifacts' ||
    toolName === 'get_build_artifact' ||
    toolName === 'get_code_coverage' ||
    toolName === 'get_code_coverage_details' ||
    toolName === 'get_test_results' ||
    toolName === 'get_test_run_stats'
  );
};

/**
 * Handles builds-related tool requests
 */
export const handleBuildsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
) => {
  const args = request.params.arguments || {};

  switch (request.params.name) {
    case 'list_build_artifacts': {
      const validatedArgs = ListBuildArtifactsSchema.parse({
        ...args,
        projectId: args.projectId || defaultProject,
      });
      const result = await listBuildArtifacts(connection, {
        projectId: validatedArgs.projectId,
        buildId: validatedArgs.buildId,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_build_artifact': {
      const validatedArgs = GetBuildArtifactSchema.parse({
        ...args,
        projectId: args.projectId || defaultProject,
      });
      const result = await getBuildArtifact(connection, {
        projectId: validatedArgs.projectId,
        buildId: validatedArgs.buildId,
        artifactName: validatedArgs.artifactName,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_code_coverage': {
      const validatedArgs = GetCodeCoverageSchema.parse({
        ...args,
        projectId: args.projectId || defaultProject,
      });
      const result = await getCodeCoverage(connection, {
        projectId: validatedArgs.projectId,
        buildId: validatedArgs.buildId,
        flags: validatedArgs.flags,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_code_coverage_details': {
      const validatedArgs = GetCodeCoverageDetailsSchema.parse({
        ...args,
        projectId: args.projectId || defaultProject,
      });
      const result = await getCodeCoverageDetails(connection, {
        projectId: validatedArgs.projectId,
        buildId: validatedArgs.buildId,
        flags: validatedArgs.flags,
        top: validatedArgs.top,
        continuationToken: validatedArgs.continuationToken,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_test_results': {
      const validatedArgs = GetTestResultsSchema.parse({
        ...args,
        projectId: args.projectId || defaultProject,
      });
      const result = await getTestResults(connection, {
        projectId: validatedArgs.projectId,
        buildId: validatedArgs.buildId,
        publishContext: validatedArgs.publishContext,
        top: validatedArgs.top,
        skip: validatedArgs.skip,
        outcomes: validatedArgs.outcomes,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_test_run_stats': {
      const validatedArgs = GetTestRunStatsSchema.parse({
        ...args,
        projectId: args.projectId || defaultProject,
      });
      const result = await getTestRunStats(connection, {
        projectId: validatedArgs.projectId,
        buildId: validatedArgs.buildId,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown builds tool: ${request.params.name}`);
  }
};

// Export tool definitions
export { buildsTools } from './tool-definitions';
