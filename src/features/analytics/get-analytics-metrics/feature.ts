import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import { escapeODataStringLiteral } from '../odata-guardrails.ts';
import { queryAnalytics } from '../query-analytics/feature.ts';
import type { GetAnalyticsMetricsInput } from '../schemas.ts';
import { DEFAULT_ANALYTICS_TOP, DEFAULT_ODATA_VERSION } from '../types.ts';
import type { AllowedEntitySet, AnalyticsMetricsResult } from '../types.ts';

interface CompiledPresetQuery {
  readonly entitySet: AllowedEntitySet;
  readonly apply: string;
  readonly orderby?: string;
  readonly filterRow?: (row: Record<string, unknown>) => boolean;
  readonly enrichRow?: (
    row: Record<string, unknown>,
  ) => Record<string, unknown>;
}

const MS_PER_DAY = 86_400_000;

function computeLookbackUtcDate(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/**
 * Format a UTC `Date` into an Azure DevOps Analytics `DateSK` integer (`YYYYMMDD`).
 */
export function formatUtcDateSk(date: Date): number {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return Number.parseInt(`${year}${month}${day}`, 10);
}

/**
 * Format a UTC `Date` as an ISO 8601 `DateTimeOffset` with explicit `Z` suffix.
 */
export function formatUtcIsoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function asFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function roundPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function buildFilterPrefix(clauses: readonly string[]): string {
  if (clauses.length === 0) {
    return '';
  }
  return `filter(${clauses.join(' and ')})/`;
}

/**
 * Compile a curated metric preset into Microsoft's verified Azure DevOps
 * Analytics OData `$apply` aggregation query.
 */
export function compileAnalyticsMetricPreset(
  input: GetAnalyticsMetricsInput,
  now = new Date(),
): CompiledPresetQuery {
  const filterClauses: string[] = [];

  switch (input.metric) {
    case 'pipeline_pass_rate': {
      if (input.days !== undefined) {
        const minDateSk = formatUtcDateSk(
          computeLookbackUtcDate(input.days, now),
        );
        filterClauses.push(`CompletedDateSK ge ${minDateSk}`);
      }
      if (input.startDate) {
        filterClauses.push(`CompletedDate ge ${input.startDate}`);
      }
      if (input.endDate) {
        filterClauses.push(`CompletedDate le ${input.endDate}`);
      }
      if (input.pipelineName) {
        filterClauses.push(
          `Pipeline/PipelineName eq ${escapeODataStringLiteral(input.pipelineName)}`,
        );
      }
      if (input.branchName) {
        filterClauses.push(
          `Branch/BranchName eq ${escapeODataStringLiteral(input.branchName)}`,
        );
      }

      const apply =
        `${buildFilterPrefix(filterClauses)}` +
        `groupby((Pipeline/PipelineId,Pipeline/PipelineName),` +
        `aggregate($count as TotalRuns,` +
        `SucceededCount with sum as SucceededRuns,` +
        `FailedCount with sum as FailedRuns,` +
        `PartiallySucceededCount with sum as PartiallySucceededRuns,` +
        `CanceledCount with sum as CanceledRuns))`;

      return {
        entitySet: 'PipelineRuns',
        apply,
        orderby: 'TotalRuns desc',
        enrichRow: (row) => {
          const total = asFiniteNumber(row.TotalRuns);
          const succeeded = asFiniteNumber(row.SucceededRuns);
          return {
            ...row,
            PassRatePercent: roundPercent(succeeded, total),
          };
        },
      };
    }

    case 'pipeline_duration_percentiles': {
      if (input.days !== undefined) {
        const minDateSk = formatUtcDateSk(
          computeLookbackUtcDate(input.days, now),
        );
        filterClauses.push(`CompletedDateSK ge ${minDateSk}`);
      }
      if (input.startDate) {
        filterClauses.push(`CompletedDate ge ${input.startDate}`);
      }
      if (input.endDate) {
        filterClauses.push(`CompletedDate le ${input.endDate}`);
      }
      if (input.pipelineName) {
        filterClauses.push(
          `Pipeline/PipelineName eq ${escapeODataStringLiteral(input.pipelineName)}`,
        );
      }
      if (input.branchName) {
        filterClauses.push(
          `Branch/BranchName eq ${escapeODataStringLiteral(input.branchName)}`,
        );
      }

      const apply =
        `${buildFilterPrefix(filterClauses)}` +
        `groupby((Pipeline/PipelineId,Pipeline/PipelineName),` +
        `aggregate($count as TotalRuns,` +
        `TotalDurationSeconds with average as AvgTotalDurationSeconds,` +
        `TotalDurationSeconds with min as MinTotalDurationSeconds,` +
        `TotalDurationSeconds with max as MaxTotalDurationSeconds,` +
        `QueueDurationSeconds with average as AvgQueueDurationSeconds,` +
        `RunDurationSeconds with average as AvgRunDurationSeconds))`;

      return {
        entitySet: 'PipelineRuns',
        apply,
        orderby: 'AvgTotalDurationSeconds desc',
      };
    }

    case 'flaky_tests': {
      if (input.days !== undefined) {
        const minDateSk = formatUtcDateSk(
          computeLookbackUtcDate(input.days, now),
        );
        filterClauses.push(`DateSK ge ${minDateSk}`);
      }
      if (input.startDate) {
        filterClauses.push(`Date/Date ge ${input.startDate}`);
      }
      if (input.endDate) {
        filterClauses.push(`Date/Date le ${input.endDate}`);
      }
      if (input.workflow) {
        filterClauses.push(
          `Workflow eq ${escapeODataStringLiteral(input.workflow)}`,
        );
      }
      if (input.pipelineName) {
        filterClauses.push(
          `Pipeline/PipelineName eq ${escapeODataStringLiteral(input.pipelineName)}`,
        );
      }
      if (input.branchName) {
        filterClauses.push(
          `Branch/BranchName eq ${escapeODataStringLiteral(input.branchName)}`,
        );
      }

      const apply =
        `${buildFilterPrefix(filterClauses)}` +
        `groupby((Test/TestName),` +
        `aggregate(ResultFlakyCount with sum as FlakyCount,` +
        `ResultCount with sum as TotalResults,` +
        `ResultFailCount with sum as FailedCount,` +
        `ResultPassCount with sum as PassedCount))` +
        `/filter(FlakyCount gt 0)`;

      return {
        entitySet: 'TestResultsDaily',
        apply,
        orderby: 'FlakyCount desc',
        filterRow: (row) => asFiniteNumber(row.FlakyCount) > 0,
        enrichRow: (row) => {
          const total = asFiniteNumber(row.TotalResults);
          const flaky = asFiniteNumber(row.FlakyCount);
          return {
            ...row,
            FlakyRatePercent: roundPercent(flaky, total),
          };
        },
      };
    }

    case 'failed_tests': {
      if (input.days !== undefined) {
        const minDateSk = formatUtcDateSk(
          computeLookbackUtcDate(input.days, now),
        );
        filterClauses.push(`DateSK ge ${minDateSk}`);
      }
      if (input.startDate) {
        filterClauses.push(`Date/Date ge ${input.startDate}`);
      }
      if (input.endDate) {
        filterClauses.push(`Date/Date le ${input.endDate}`);
      }
      if (input.workflow) {
        filterClauses.push(
          `Workflow eq ${escapeODataStringLiteral(input.workflow)}`,
        );
      }
      if (input.pipelineName) {
        filterClauses.push(
          `Pipeline/PipelineName eq ${escapeODataStringLiteral(input.pipelineName)}`,
        );
      }
      if (input.branchName) {
        filterClauses.push(
          `Branch/BranchName eq ${escapeODataStringLiteral(input.branchName)}`,
        );
      }

      const apply =
        `${buildFilterPrefix(filterClauses)}` +
        `groupby((Test/TestName),` +
        `aggregate(ResultFailCount with sum as FailedCount,` +
        `ResultCount with sum as TotalResults,` +
        `ResultPassCount with sum as PassedCount,` +
        `ResultFlakyCount with sum as FlakyCount))` +
        `/filter(FailedCount gt 0)`;

      return {
        entitySet: 'TestResultsDaily',
        apply,
        orderby: 'FailedCount desc',
        filterRow: (row) => asFiniteNumber(row.FailedCount) > 0,
        enrichRow: (row) => {
          const total = asFiniteNumber(row.TotalResults);
          const failed = asFiniteNumber(row.FailedCount);
          return {
            ...row,
            FailRatePercent: roundPercent(failed, total),
          };
        },
      };
    }

    case 'work_item_cycle_time': {
      filterClauses.push("StateCategory eq 'Completed'");
      if (input.days !== undefined) {
        const minDateSk = formatUtcDateSk(
          computeLookbackUtcDate(input.days, now),
        );
        filterClauses.push(`CompletedDateSK ge ${minDateSk}`);
      }
      if (input.startDate) {
        filterClauses.push(`CompletedDate ge ${input.startDate}`);
      }
      if (input.endDate) {
        filterClauses.push(`CompletedDate le ${input.endDate}`);
      }
      if (input.workItemType) {
        filterClauses.push(
          `WorkItemType eq ${escapeODataStringLiteral(input.workItemType)}`,
        );
      }
      if (input.areaPath) {
        filterClauses.push(
          `Area/AreaPath eq ${escapeODataStringLiteral(input.areaPath)}`,
        );
      }
      if (input.iterationPath) {
        filterClauses.push(
          `Iteration/IterationPath eq ${escapeODataStringLiteral(input.iterationPath)}`,
        );
      }

      const apply =
        `${buildFilterPrefix(filterClauses)}` +
        `groupby((WorkItemType),` +
        `aggregate($count as CompletedCount,` +
        `CycleTimeDays with average as AvgCycleTimeDays,` +
        `LeadTimeDays with average as AvgLeadTimeDays,` +
        `CycleTimeDays with min as MinCycleTimeDays,` +
        `CycleTimeDays with max as MaxCycleTimeDays))`;

      return {
        entitySet: 'WorkItems',
        apply,
        orderby: 'CompletedCount desc',
      };
    }

    case 'work_item_counts': {
      if (input.days !== undefined) {
        const minIso = formatUtcIsoDateTime(
          computeLookbackUtcDate(input.days, now),
        );
        filterClauses.push(`ChangedDate ge ${minIso}`);
      }
      if (input.startDate) {
        filterClauses.push(`ChangedDate ge ${input.startDate}`);
      }
      if (input.endDate) {
        filterClauses.push(`ChangedDate le ${input.endDate}`);
      }
      if (input.workItemType) {
        filterClauses.push(
          `WorkItemType eq ${escapeODataStringLiteral(input.workItemType)}`,
        );
      }
      if (input.areaPath) {
        filterClauses.push(
          `Area/AreaPath eq ${escapeODataStringLiteral(input.areaPath)}`,
        );
      }
      if (input.iterationPath) {
        filterClauses.push(
          `Iteration/IterationPath eq ${escapeODataStringLiteral(input.iterationPath)}`,
        );
      }

      const apply =
        `${buildFilterPrefix(filterClauses)}` +
        `groupby((WorkItemType,State,StateCategory),` +
        `aggregate($count as Count,StoryPoints with sum as TotalStoryPoints))`;

      return {
        entitySet: 'WorkItems',
        apply,
        orderby: 'Count desc',
      };
    }
  }
}

/**
 * Run a curated Azure DevOps Analytics `$apply` metric preset (CI pass rates,
 * pipeline durations, flaky/failed tests, work item cycle time, and counts).
 */
export async function getAnalyticsMetrics(
  ctx: ToolContext,
  input: GetAnalyticsMetricsInput,
): Promise<AnalyticsMetricsResult> {
  const scope = input.scope ?? 'project';
  const version = input.version ?? DEFAULT_ODATA_VERSION;
  const top = input.top ?? DEFAULT_ANALYTICS_TOP;

  const compiled = compileAnalyticsMetricPreset(input);

  const queryResult = await queryAnalytics(ctx, {
    entitySet: compiled.entitySet,
    projectId: input.projectId,
    organizationId: input.organizationId,
    scope,
    version,
    apply: compiled.apply,
    orderby: compiled.orderby,
    top,
  });

  const filteredRows = compiled.filterRow
    ? queryResult.value.filter(compiled.filterRow)
    : queryResult.value;
  const rows = compiled.enrichRow
    ? filteredRows.map(compiled.enrichRow)
    : filteredRows;

  return {
    metric: input.metric,
    entitySet: compiled.entitySet,
    scope: queryResult.scope,
    ...(queryResult.projectId ? { projectId: queryResult.projectId } : {}),
    version: queryResult.version,
    appliedQuery: {
      apply: compiled.apply,
      ...(compiled.orderby ? { orderby: compiled.orderby } : {}),
      top,
    },
    returnedCount: rows.length,
    value: rows,
    ...(queryResult.warnings ? { warnings: queryResult.warnings } : {}),
  };
}
