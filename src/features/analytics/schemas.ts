import { z } from 'zod';
import {
  ANALYTICS_METRIC_PRESETS,
  ANALYTICS_SCOPES,
  DEFAULT_ODATA_VERSION,
  MAX_ANALYTICS_TOP,
  ODATA_VERSIONS,
} from './types.ts';

const ISO_DATETIME_WITH_TZ_RE =
  /^\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

const IsoDateTimeWithTimezoneSchema = z
  .string()
  .regex(
    ISO_DATETIME_WITH_TZ_RE,
    "ISO 8601 DateTimeOffset must include an explicit timezone offset ('Z' or '±HH:MM', e.g. '2026-11-01T00:00:00Z')",
  );

/**
 * Schema for `get_analytics_schema`
 */
export const GetAnalyticsSchemaSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID or name (defaults to AZURE_DEVOPS_DEFAULT_PROJECT when scope is "project").',
    ),
  organizationId: z
    .string()
    .optional()
    .describe(
      'Optional Azure DevOps organization (Cloud) or collection (Server) override.',
    ),
  scope: z
    .enum(ANALYTICS_SCOPES)
    .default('project')
    .describe(
      'Analytics query scope: "project" (recommended default) or "organization" (org/collection-wide metadata).',
    ),
  version: z
    .enum(ODATA_VERSIONS)
    .default(DEFAULT_ODATA_VERSION)
    .describe(
      'Azure DevOps Analytics OData version (default: "v3.0-preview" for Cloud + Server 2019/2020/2022 compatibility; "v4.0-preview" adds pool capacity snapshots).',
    ),
  entitySet: z
    .string()
    .optional()
    .describe(
      'Optional OData entity set name to inspect in detail (e.g. "WorkItems", "PipelineRuns", "TestResultsDaily"). Omit to list all available entity sets.',
    ),
});

export type GetAnalyticsSchemaInput = z.infer<typeof GetAnalyticsSchemaSchema>;

/**
 * Schema for `query_analytics`
 */
export const QueryAnalyticsSchema = z.object({
  entitySet: z
    .string()
    .min(1)
    .describe(
      'Target OData entity set (e.g. "WorkItems", "WorkItemRevisions", "WorkItemSnapshot", "PipelineRuns", "TestResultsDaily"). Plain entity set name only — key addressing like WorkItems(123) is blocked.',
    ),
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID or name (defaults to AZURE_DEVOPS_DEFAULT_PROJECT when scope is "project").',
    ),
  organizationId: z
    .string()
    .optional()
    .describe(
      'Optional Azure DevOps organization (Cloud) or collection (Server) override.',
    ),
  scope: z
    .enum(ANALYTICS_SCOPES)
    .default('project')
    .describe(
      'Query scope: "project" (recommended default) or "organization" (opt-in org/collection-wide query; requires View analytics across projects).',
    ),
  version: z
    .enum(ODATA_VERSIONS)
    .default(DEFAULT_ODATA_VERSION)
    .describe(
      'Azure DevOps Analytics OData version (default: "v3.0-preview").',
    ),
  select: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Fields to return ($select, max 800 columns). If both select and apply are omitted, a safe bounded default $select is automatically injected.',
    ),
  filter: z
    .string()
    .optional()
    .describe(
      'OData $filter expression (e.g. "State eq \'Active\' and ChangedDate ge 2026-11-01T00:00:00Z"). DateTimeOffset literals MUST include a timezone offset (Z or ±HH:MM).',
    ),
  apply: z
    .string()
    .optional()
    .describe(
      'OData $apply aggregation pipeline (e.g. "groupby((DateSK,State),aggregate($count as ItemCount))"). Required for all *Snapshot entities.',
    ),
  expand: z
    .string()
    .optional()
    .describe(
      'OData $expand clause with nested $select (e.g. "AssignedTo($select=UserName)"). Expanding Revisions on WorkItems is blocked (query WorkItemRevisions instead).',
    ),
  orderby: z
    .string()
    .optional()
    .describe('OData $orderby clause (e.g. "StoryPoints desc").'),
  top: z
    .number()
    .int()
    .min(1, 'top must be at least 1')
    .max(
      MAX_ANALYTICS_TOP,
      `top must be at most ${MAX_ANALYTICS_TOP} (max ${MAX_ANALYTICS_TOP} rows per query)`,
    )
    .optional()
    .describe(
      `Maximum number of rows to return ($top; default: 100, hard max: ${MAX_ANALYTICS_TOP}).`,
    ),
  skip: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Number of rows to skip ($skip). Prefer nextLink for large datasets.',
    ),
  count: z
    .boolean()
    .optional()
    .describe(
      'Include total matching row count ($count=true, returned as @odata.count).',
    ),
  nextLink: z
    .string()
    .optional()
    .describe(
      'Explicit same-origin @odata.nextLink URL from a previous query_analytics page. Off-origin URLs are rejected before sending any request.',
    ),
});

export type QueryAnalyticsInput = z.infer<typeof QueryAnalyticsSchema>;

/**
 * Schema for `get_analytics_metrics`
 */
export const GetAnalyticsMetricsSchema = z.object({
  metric: z
    .enum(ANALYTICS_METRIC_PRESETS)
    .describe(
      'Curated Analytics metric preset: "pipeline_pass_rate", "pipeline_duration_percentiles", "flaky_tests", "failed_tests", "work_item_cycle_time", or "work_item_counts".',
    ),
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID or name (defaults to AZURE_DEVOPS_DEFAULT_PROJECT when scope is "project").',
    ),
  organizationId: z
    .string()
    .optional()
    .describe(
      'Optional Azure DevOps organization (Cloud) or collection (Server) override.',
    ),
  scope: z
    .enum(ANALYTICS_SCOPES)
    .default('project')
    .describe(
      'Query scope: "project" (recommended default) or "organization" (opt-in org/collection-wide aggregation).',
    ),
  version: z
    .enum(ODATA_VERSIONS)
    .default(DEFAULT_ODATA_VERSION)
    .describe(
      'Azure DevOps Analytics OData version (default: "v3.0-preview" for Server 2019/2020/2022 + Cloud compatibility).',
    ),
  days: z
    .number()
    .int()
    .min(1)
    .max(3650)
    .optional()
    .describe(
      'Optional rolling lookback window in days (e.g. 30). Omit to aggregate all available Analytics history.',
    ),
  startDate: IsoDateTimeWithTimezoneSchema.optional().describe(
    'Optional inclusive ISO 8601 start DateTimeOffset with timezone offset (e.g. "2026-11-01T00:00:00Z").',
  ),
  endDate: IsoDateTimeWithTimezoneSchema.optional().describe(
    'Optional inclusive ISO 8601 end DateTimeOffset with timezone offset (e.g. "2026-11-30T23:59:59Z").',
  ),
  pipelineName: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional pipeline name filter (applicable to pipeline_* and test_* presets).',
    ),
  branchName: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional branch name filter, e.g. "refs/heads/main" (applicable to pipeline_* and test_* presets).',
    ),
  workflow: z
    .enum(['Build', 'Release'])
    .optional()
    .describe(
      'Optional test execution workflow filter ("Build" or "Release"; applicable to flaky_tests and failed_tests).',
    ),
  workItemType: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional work item type filter, e.g. "User Story" or "Bug" (applicable to work_item_* presets).',
    ),
  areaPath: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional exact AreaPath filter (applicable to work_item_* presets).',
    ),
  iterationPath: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional exact IterationPath filter (applicable to work_item_* presets).',
    ),
  top: z
    .number()
    .int()
    .min(1)
    .max(MAX_ANALYTICS_TOP)
    .optional()
    .describe(
      `Maximum number of aggregated metric groups to return (default: 100, max: ${MAX_ANALYTICS_TOP}).`,
    ),
});

export type GetAnalyticsMetricsInput = z.infer<
  typeof GetAnalyticsMetricsSchema
>;
