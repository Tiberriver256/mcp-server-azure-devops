import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
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

/**
 * List of build-related tools
 */
export const buildsTools: ToolDefinition[] = [
  // Artifact tools
  {
    name: 'list_build_artifacts',
    description: 'List artifacts for a build',
    inputSchema: zodToJsonSchema(ListBuildArtifactsSchema),
  },
  {
    name: 'get_build_artifact',
    description: 'Get build artifact details',
    inputSchema: zodToJsonSchema(GetBuildArtifactSchema),
  },
  // Coverage tools
  {
    name: 'get_code_coverage',
    description: 'Get code coverage summary',
    inputSchema: zodToJsonSchema(GetCodeCoverageSchema),
  },
  {
    name: 'get_code_coverage_details',
    description: 'Get detailed code coverage',
    inputSchema: zodToJsonSchema(GetCodeCoverageDetailsSchema),
  },
  // Test tools
  {
    name: 'get_test_results',
    description: 'Get test results for build',
    inputSchema: zodToJsonSchema(GetTestResultsSchema),
  },
  {
    name: 'get_test_run_stats',
    description: 'Get test run statistics',
    inputSchema: zodToJsonSchema(GetTestRunStatsSchema),
  },
];
