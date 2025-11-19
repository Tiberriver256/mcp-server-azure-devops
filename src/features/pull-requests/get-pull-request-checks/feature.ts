import { WebApi } from 'azure-devops-node-api';
import {
  GitPullRequestStatus,
  GitStatusState,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  PolicyEvaluationRecord,
  PolicyEvaluationStatus,
} from 'azure-devops-node-api/interfaces/PolicyInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

export interface PullRequestChecksOptions {
  projectId: string;
  repositoryId: string;
  pullRequestId: number;
}

export interface PipelineReference {
  pipelineId?: number;
  definitionId?: number;
  runId?: number;
  buildId?: number;
  displayName?: string;
  targetUrl?: string;
}

export interface PullRequestStatusCheck {
  id?: number;
  state: string;
  description?: string;
  context?: {
    name?: string;
    genre?: string;
  };
  createdDate?: string;
  updatedDate?: string;
  targetUrl?: string;
  pipeline?: PipelineReference;
}

export interface PullRequestPolicyCheck {
  evaluationId?: string;
  status: string;
  isBlocking?: boolean;
  isEnabled?: boolean;
  configurationId?: number;
  configurationRevision?: number;
  configurationTypeId?: string;
  configurationTypeDisplayName?: string;
  displayName?: string;
  startedDate?: string;
  completedDate?: string;
  message?: string;
  targetUrl?: string;
  pipeline?: PipelineReference;
}

export interface PullRequestChecksResult {
  statuses: PullRequestStatusCheck[];
  policyEvaluations: PullRequestPolicyCheck[];
}

/**
 * Retrieve status checks and policy evaluations for a pull request.
 */
export async function getPullRequestChecks(
  connection: WebApi,
  options: PullRequestChecksOptions,
): Promise<PullRequestChecksResult> {
  try {
    const [gitApi, policyApi, projectId] = await Promise.all([
      connection.getGitApi(),
      connection.getPolicyApi(),
      resolveProjectId(connection, options.projectId),
    ]);

    const [statusRecords, evaluationRecords] = await Promise.all([
      gitApi.getPullRequestStatuses(
        options.repositoryId,
        options.pullRequestId,
        projectId,
      ),
      policyApi.getPolicyEvaluations(
        projectId,
        buildPolicyArtifactId(projectId, options.pullRequestId),
      ),
    ]);

    return {
      statuses: (statusRecords ?? []).map(mapStatusRecord),
      policyEvaluations: (evaluationRecords ?? []).map(mapEvaluationRecord),
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get pull request checks: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

const buildPolicyArtifactId = (projectId: string, pullRequestId: number) =>
  `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`;

const projectIdGuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resolveProjectId = async (
  connection: WebApi,
  projectIdOrName: string,
): Promise<string> => {
  if (projectIdGuidPattern.test(projectIdOrName)) {
    return projectIdOrName;
  }

  const coreApi = await connection.getCoreApi();
  const project = await coreApi.getProject(projectIdOrName);

  if (!project?.id) {
    throw new AzureDevOpsResourceNotFoundError(
      `Project '${projectIdOrName}' not found`,
    );
  }

  return project.id;
};

const gitStatusStateMap = GitStatusState as unknown as Record<number, string>;
const policyStatusMap = PolicyEvaluationStatus as unknown as Record<
  number,
  string
>;

const mapStatusRecord = (
  status: GitPullRequestStatus,
): PullRequestStatusCheck => {
  const pipeline = mergePipelineReferences(
    parsePipelineReferenceFromUrl(status.targetUrl),
    extractPipelineReferenceFromObject(status.context),
    extractPipelineReferenceFromObject(status.properties),
  );

  return {
    id: status.id,
    state: formatEnumValue(status.state, gitStatusStateMap),
    description: status.description,
    context: {
      name: status.context?.name,
      genre: status.context?.genre,
    },
    createdDate: toIsoString(status.creationDate),
    updatedDate: toIsoString(status.updatedDate),
    targetUrl: status.targetUrl ?? pipeline?.targetUrl,
    pipeline,
  };
};

const mapEvaluationRecord = (
  evaluation: PolicyEvaluationRecord,
): PullRequestPolicyCheck => {
  const settings =
    (evaluation.configuration?.settings as Record<string, unknown>) || {};
  const context =
    (evaluation.context as Record<string, unknown> | undefined) ?? {};

  const pipeline = mergePipelineReferences(
    extractPipelineReferenceFromObject(settings),
    extractPipelineReferenceFromObject(context),
    parsePipelineReferenceFromUrl(
      extractString(settings.targetUrl) ?? extractString(context.targetUrl),
    ),
  );

  const displayName =
    extractString(settings.displayName) ??
    extractString(context.displayName) ??
    evaluation.configuration?.type?.displayName;

  const targetUrl =
    pipeline?.targetUrl ??
    extractString(context.targetUrl) ??
    extractString(settings.targetUrl);

  return {
    evaluationId: evaluation.evaluationId,
    status: formatEnumValue(evaluation.status, policyStatusMap),
    isBlocking: evaluation.configuration?.isBlocking,
    isEnabled: evaluation.configuration?.isEnabled,
    configurationId: evaluation.configuration?.id,
    configurationRevision: evaluation.configuration?.revision,
    configurationTypeId: evaluation.configuration?.type?.id,
    configurationTypeDisplayName: evaluation.configuration?.type?.displayName,
    displayName,
    startedDate: toIsoString(evaluation.startedDate),
    completedDate: toIsoString(evaluation.completedDate),
    message: extractString(context.message) ?? extractString(settings.message),
    targetUrl,
    pipeline,
  };
};

const formatEnumValue = (
  value: number | undefined,
  map: Record<number, string>,
): string => {
  if (typeof value === 'number' && map[value]) {
    const name = map[value];
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
  return 'unknown';
};

const toIsoString = (date: Date | undefined): string | undefined =>
  date ? date.toISOString() : undefined;

const extractString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const parseNumeric = (value: unknown): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const parseIdFromUri = (uri?: string): number | undefined => {
  if (!uri) {
    return undefined;
  }
  const match = uri.match(/(\d+)(?!.*\d)/);
  if (!match) {
    return undefined;
  }
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : undefined;
};

const parsePipelineReferenceFromUrl = (
  targetUrl?: string,
): PipelineReference | undefined => {
  if (!targetUrl) {
    return undefined;
  }

  try {
    const url = new URL(targetUrl);
    const result: PipelineReference = { targetUrl };

    const setParam = (param: string, setter: (value: number) => void) => {
      const raw = url.searchParams.get(param);
      const numeric = parseNumeric(raw);
      if (numeric !== undefined) {
        setter(numeric);
      }
    };

    setParam('pipelineId', (value) => {
      result.pipelineId = value;
    });
    setParam('definitionId', (value) => {
      result.definitionId = value;
    });
    setParam('buildDefinitionId', (value) => {
      result.definitionId = result.definitionId ?? value;
    });
    setParam('runId', (value) => {
      result.runId = value;
    });
    setParam('buildId', (value) => {
      result.buildId = value;
      result.runId = result.runId ?? value;
    });

    const segments = url.pathname.split('/').filter(Boolean);

    const pipelinesIndex = segments.lastIndexOf('pipelines');
    if (pipelinesIndex !== -1 && pipelinesIndex + 1 < segments.length) {
      const pipelineCandidate = parseNumeric(segments[pipelinesIndex + 1]);
      if (pipelineCandidate !== undefined) {
        result.pipelineId = result.pipelineId ?? pipelineCandidate;
      }
    }

    const runsIndex = segments.lastIndexOf('runs');
    if (runsIndex !== -1 && runsIndex + 1 < segments.length) {
      const runCandidate = parseNumeric(segments[runsIndex + 1]);
      if (runCandidate !== undefined) {
        result.runId = result.runId ?? runCandidate;
      }

      if (runsIndex > 0) {
        const preceding = segments[runsIndex - 1];
        const pipelineCandidate = parseNumeric(preceding);
        if (pipelineCandidate !== undefined) {
          result.pipelineId = result.pipelineId ?? pipelineCandidate;
        }
      }
    }

    const buildMatch = url.pathname.match(/\/build\/(?:definition\/)?(\d+)/i);
    if (!result.definitionId && buildMatch) {
      const id = parseNumeric(buildMatch[1]);
      if (id !== undefined) {
        result.definitionId = id;
      }
    }

    const buildUriMatch = url.pathname.match(/\/Build\/Build\/(\d+)/i);
    if (buildUriMatch) {
      const buildId = parseNumeric(buildUriMatch[1]);
      if (buildId !== undefined) {
        result.buildId = result.buildId ?? buildId;
        result.runId = result.runId ?? buildId;
      }
    }

    return result;
  } catch {
    return { targetUrl };
  }
};

const extractPipelineReferenceFromObject = (
  value: unknown,
): PipelineReference | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const object = value as Record<string, unknown>;
  const candidate: PipelineReference = {};

  const pipelineId = parseNumeric(
    object.pipelineId ??
      (object.pipeline as Record<string, unknown> | undefined)?.id,
  );
  if (pipelineId !== undefined) {
    candidate.pipelineId = pipelineId;
  }

  const definitionId = parseNumeric(
    object.definitionId ??
      object.buildDefinitionId ??
      object.pipelineDefinitionId ??
      (object.definition as Record<string, unknown> | undefined)?.id,
  );
  if (definitionId !== undefined) {
    candidate.definitionId = definitionId;
  }

  const runId = parseNumeric(
    object.runId ??
      object.buildId ??
      object.stageRunId ??
      object.jobRunId ??
      object.planId,
  );
  if (runId !== undefined) {
    candidate.runId = runId;
  }

  const buildId = parseNumeric(
    object.buildId ??
      (object.build as Record<string, unknown> | undefined)?.id ??
      parseIdFromUri(extractString(object.buildUri)) ??
      parseIdFromUri(extractString(object.uri)),
  );
  if (buildId !== undefined) {
    candidate.buildId = candidate.buildId ?? buildId;
    if (candidate.runId === undefined) {
      candidate.runId = buildId;
    }
  }

  const displayName =
    extractString(object.displayName) ?? extractString(object.name);
  if (displayName) {
    candidate.displayName = displayName;
  }

  const targetUrl =
    extractString(object.targetUrl) ??
    extractString(object.url) ??
    extractString(object.href);

  return mergePipelineReferences(
    candidate,
    parsePipelineReferenceFromUrl(targetUrl),
  );
};

const mergePipelineReferences = (
  ...refs: Array<PipelineReference | undefined>
): PipelineReference | undefined => {
  const merged: PipelineReference = {};
  let hasValue = false;

  for (const ref of refs) {
    if (!ref) {
      continue;
    }
    const apply = <K extends keyof PipelineReference>(key: K) => {
      const value = ref[key];
      if (value !== undefined && merged[key] === undefined) {
        merged[key] = value;
        hasValue = true;
      }
    };

    apply('pipelineId');
    apply('definitionId');
    apply('runId');
    apply('buildId');
    apply('displayName');
    apply('targetUrl');
  }

  return hasValue ? merged : undefined;
};
