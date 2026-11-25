export const ODATA_VERSIONS = [
  'v1.0',
  'v2.0',
  'v3.0-preview',
  'v4.0-preview',
] as const;

export type ODataVersion = (typeof ODATA_VERSIONS)[number];

export const DEFAULT_ODATA_VERSION: ODataVersion = 'v3.0-preview';

export const ANALYTICS_SCOPES = ['project', 'organization'] as const;
export type AnalyticsScope = (typeof ANALYTICS_SCOPES)[number];

export const ANALYTICS_METRIC_PRESETS = [
  'pipeline_pass_rate',
  'pipeline_duration_percentiles',
  'flaky_tests',
  'failed_tests',
  'work_item_cycle_time',
  'work_item_counts',
] as const;

export type AnalyticsMetricPreset = (typeof ANALYTICS_METRIC_PRESETS)[number];

export const DEFAULT_ANALYTICS_TOP = 100;
export const MAX_ANALYTICS_TOP = 1000;
export const MAX_ANALYTICS_COLUMNS = 800;
export const MAX_ODATA_GET_URL_LENGTH = 2800;

/**
 * Known Azure DevOps Analytics OData entity sets across v1.0 through v4.0-preview.
 */
export const ALLOWED_ENTITY_SETS = [
  // Work Tracking (v1.0 / v2.0+)
  'WorkItems',
  'WorkItemRevisions',
  'WorkItemSnapshot',
  'WorkItemBoardSnapshot',
  'WorkItemLinks',
  'Areas',
  'Iterations',
  'BoardLocations',
  'Dates',
  'Tags',
  'Teams',
  'Users',
  'Processes',
  // Pipelines (v3.0-preview+)
  'Pipelines',
  'PipelineRuns',
  'PipelineJobs',
  'PipelineRunActivityResults',
  'PipelineTasks',
  'Branches',
  // Capacity / Pool Snapshots (v4.0-preview)
  'ParallelPipelineJobsSnapshot',
  'TaskAgentPoolSizeSnapshots',
  'TaskAgentRequestSnapshots',
  // Test Plans & Execution (v3.0-preview+)
  'TestRuns',
  'TestResults',
  'TestResultsDaily',
  'Tests',
  'TestPoints',
  'TestPointHistorySnapshots',
  'TestSuites',
  'TestConfigurations',
] as const;

export type AllowedEntitySet = (typeof ALLOWED_ENTITY_SETS)[number];

/**
 * Composite historical snapshot entity sets that Azure DevOps Analytics
 * strictly blocks unless aggregated via `$apply=...aggregate(...)`.
 */
export const SNAPSHOT_ENTITY_SETS: ReadonlySet<string> = new Set<string>([
  'WorkItemSnapshot',
  'WorkItemBoardSnapshot',
  'TestPointHistorySnapshots',
  'TaskAgentPoolSizeSnapshots',
  'TaskAgentRequestSnapshots',
  'ParallelPipelineJobsSnapshot',
]);

/**
 * High-cardinality unique key / free-text columns blocked in `groupby(...)`
 * by Azure DevOps Analytics (`VS403522`).
 */
export const HIGH_CARDINALITY_GROUPBY_COLUMNS: ReadonlySet<string> =
  new Set<string>([
    'workitemid',
    'workitemsk',
    'title',
    'workitemrevisionsk',
    'workitemlinksk',
    'pipelinerunid',
    'pipelinerunsk',
    'testresultid',
    'testresultsk',
    'testrunid',
    'testrunsk',
    'description',
  ]);

/**
 * Safe bounded default `$select` column projections injected when a caller
 * queries a non-snapshot entity set without explicit `select` or `apply`.
 * Prevents `VS403670` (>800 columns on wide custom-field collections) and keeps
 * responses compact.
 */
export const DEFAULT_SELECT_BY_ENTITY_SET: Readonly<
  Record<string, readonly string[]>
> = {
  WorkItems: [
    'WorkItemId',
    'Title',
    'WorkItemType',
    'State',
    'StateCategory',
    'Priority',
    'StoryPoints',
    'ChangedDate',
  ],
  WorkItemRevisions: [
    'WorkItemRevisionSK',
    'WorkItemId',
    'Revision',
    'Title',
    'State',
    'RevisedDateSK',
    'ChangedDate',
  ],
  WorkItemLinks: [
    'WorkItemLinkSK',
    'SourceWorkItemId',
    'TargetWorkItemId',
    'LinkTypeName',
  ],
  Areas: ['AreaSK', 'AreaId', 'AreaName', 'AreaPath'],
  Iterations: [
    'IterationSK',
    'IterationId',
    'IterationName',
    'IterationPath',
    'StartDate',
    'EndDate',
  ],
  BoardLocations: ['BoardLocationSK', 'BoardName', 'ColumnName'],
  Dates: ['DateSK', 'Date', 'Year', 'MonthOfYear'],
  Tags: ['TagSK', 'TagName'],
  Teams: ['TeamSK', 'TeamId', 'TeamName'],
  Users: ['UserSK', 'UserId', 'UserName', 'UserEmail'],
  Processes: ['ProcessSK', 'WorkItemType', 'State', 'StateCategory'],
  Pipelines: ['PipelineSK', 'PipelineId', 'PipelineName'],
  PipelineRuns: [
    'PipelineRunId',
    'PipelineId',
    'SucceededCount',
    'FailedCount',
    'PartiallySucceededCount',
    'CanceledCount',
    'TotalDurationSeconds',
    'CompletedDate',
  ],
  PipelineJobs: ['PipelineJobSK', 'JobName', 'TotalDurationSeconds'],
  PipelineRunActivityResults: [
    'PipelineRunActivityResultSK',
    'TaskDurationSeconds',
    'Outcome',
  ],
  PipelineTasks: ['PipelineTaskSK', 'TaskName'],
  Branches: ['BranchSK', 'BranchName', 'RepositoryId'],
  TestRuns: [
    'TestRunId',
    'Title',
    'ResultCount',
    'ResultPassCount',
    'ResultFailCount',
  ],
  TestResults: ['TestResultId', 'Outcome', 'DurationSeconds', 'IsFlaky'],
  TestResultsDaily: [
    'DateSK',
    'Workflow',
    'ResultCount',
    'ResultPassCount',
    'ResultFailCount',
    'ResultFlakyCount',
    'DurationSeconds',
  ],
  Tests: ['TestSK', 'TestName', 'FullyQualifiedTestName', 'ContainerName'],
  TestPoints: ['TestPointId', 'LastResultOutcome'],
  TestSuites: ['TestSuiteId', 'Title'],
  TestConfigurations: ['TestConfigurationId', 'Name'],
};

export interface EdmxProperty {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
}

export interface EdmxNavigationProperty {
  readonly name: string;
  readonly type: string;
  readonly isCollection: boolean;
}

export interface EdmxEntityType {
  readonly name: string;
  readonly baseType?: string;
  readonly keys: readonly string[];
  readonly properties: readonly EdmxProperty[];
  readonly navigationProperties: readonly EdmxNavigationProperty[];
}

export interface EdmxEntitySet {
  readonly name: string;
  readonly entityType: string;
  readonly shortEntityType: string;
}

export interface ParsedEdmxMetadata {
  readonly namespace?: string;
  readonly entitySets: readonly EdmxEntitySet[];
  readonly entityTypes: ReadonlyMap<string, EdmxEntityType>;
}

export interface AnalyticsSchemaSummaryResult {
  readonly scope: AnalyticsScope;
  readonly projectId?: string;
  readonly version: ODataVersion;
  readonly entitySetCount: number;
  readonly entitySets: readonly {
    readonly name: string;
    readonly entityType: string;
    readonly isSnapshot: boolean;
    readonly requiresAggregation: boolean;
  }[];
}

export interface AnalyticsEntitySchemaResult {
  readonly scope: AnalyticsScope;
  readonly projectId?: string;
  readonly version: ODataVersion;
  readonly entitySet: string;
  readonly entityType: string;
  readonly isSnapshot: boolean;
  readonly requiresAggregation: boolean;
  readonly keys: readonly string[];
  readonly properties: readonly EdmxProperty[];
  readonly customProperties: readonly EdmxProperty[];
  readonly navigationProperties: readonly EdmxNavigationProperty[];
}

export type GetAnalyticsSchemaResult =
  | AnalyticsSchemaSummaryResult
  | AnalyticsEntitySchemaResult;

export interface QueryAnalyticsResult {
  readonly entitySet: string;
  readonly scope: AnalyticsScope;
  readonly projectId?: string;
  readonly version: ODataVersion;
  readonly '@odata.context'?: string;
  readonly '@odata.count'?: number;
  readonly '@odata.nextLink'?: string;
  readonly nextLinkBlocked?: boolean;
  readonly usedBatch?: boolean;
  readonly appliedDefaultSelect?: readonly string[];
  readonly returnedCount: number;
  readonly value: Record<string, unknown>[];
  readonly warnings?: readonly string[];
}

export interface AnalyticsMetricsResult {
  readonly metric: AnalyticsMetricPreset;
  readonly entitySet: string;
  readonly scope: AnalyticsScope;
  readonly projectId?: string;
  readonly version: ODataVersion;
  readonly appliedQuery: {
    readonly apply: string;
    readonly orderby?: string;
    readonly top: number;
  };
  readonly returnedCount: number;
  readonly value: Record<string, unknown>[];
  readonly warnings?: readonly string[];
}
