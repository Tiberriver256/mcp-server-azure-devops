export * from './types.ts';
export * from './schemas.ts';
export { parseEdmxMetadata } from './edmx-parser.ts';
export {
  buildODataBaseUrl,
  buildODataQueryParams,
  buildSingleOpBatchPayload,
  escapeODataStringLiteral,
  findDateTimeWithoutTimezone,
  mapAnalyticsHttpError,
  normalizeSelectColumns,
  parseSingleOpBatchResponse,
  stripODataSingleQuotes,
  validateAnalyticsQuery,
  validateEntitySet,
  validateMetadataEntitySetName,
  validateSameOriginNextLink,
} from './odata-guardrails.ts';
export { getAnalyticsSchema } from './get-analytics-schema/feature.ts';
export { queryAnalytics } from './query-analytics/feature.ts';
export {
  compileAnalyticsMetricPreset,
  formatUtcDateSk,
  formatUtcIsoDateTime,
  getAnalyticsMetrics,
} from './get-analytics-metrics/feature.ts';

import { defineTool } from '../../shared/registry/tool-registry.ts';
import type { RegisteredTool } from '../../shared/registry/tool-registry.ts';
import {
  GetAnalyticsMetricsSchema,
  GetAnalyticsSchemaSchema,
  QueryAnalyticsSchema,
} from './schemas.ts';
import { getAnalyticsSchema } from './get-analytics-schema/feature.ts';
import { queryAnalytics } from './query-analytics/feature.ts';
import { getAnalyticsMetrics } from './get-analytics-metrics/feature.ts';

export interface AnalyticsFeatureModule {
  readonly toolset: 'analytics';
  readonly tools: readonly RegisteredTool[];
}

export const analyticsTools: readonly RegisteredTool[] = [
  defineTool({
    name: 'get_analytics_schema',
    description:
      'Inspect Azure DevOps Analytics OData $metadata schema to list available entity sets or inspect exact properties, Custom_* fields, and navigation properties of a chosen entity set (supports Cloud and on-prem Server).',
    schema: GetAnalyticsSchemaSchema,
    readOnly: true,
    handler: (ctx, args) => getAnalyticsSchema(ctx, args),
  }),
  defineTool({
    name: 'query_analytics',
    description:
      'Execute guarded read-only Azure DevOps Analytics OData v4 queries and $apply aggregations across Work Tracking, Pipelines, and Test entities (supports Cloud and on-prem Server). IMPORTANT CAVEATS: (1) Analytics has no area-path-level security — users with View analytics permission see work items across all area paths in the project; (2) Analytics data has eventual consistency lag (seconds to minutes behind real-time state) — use REST APIs for real-time checks and OData Analytics for historical trends and aggregations.',
    schema: QueryAnalyticsSchema,
    readOnly: true,
    handler: (ctx, args) => queryAnalytics(ctx, args),
  }),
  defineTool({
    name: 'get_analytics_metrics',
    description:
      'Run curated Azure DevOps Analytics OData $apply metric presets (pipeline_pass_rate, pipeline_duration_percentiles, flaky_tests, failed_tests, work_item_cycle_time, work_item_counts). Note: Analytics has no area-path-level security and exhibits eventual consistency lag behind real-time state.',
    schema: GetAnalyticsMetricsSchema,
    readOnly: true,
    handler: (ctx, args) => getAnalyticsMetrics(ctx, args),
  }),
];

export const analyticsFeature: AnalyticsFeatureModule = {
  toolset: 'analytics',
  tools: analyticsTools,
};
