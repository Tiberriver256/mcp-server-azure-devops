import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors/index.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import { parseEdmxMetadata } from '../edmx-parser.ts';
import {
  buildODataBaseUrl,
  executeAnalyticsHttpRequest,
  validateMetadataEntitySetName,
} from '../odata-guardrails.ts';
import type { GetAnalyticsSchemaInput } from '../schemas.ts';
import { DEFAULT_ODATA_VERSION, SNAPSHOT_ENTITY_SETS } from '../types.ts';
import type {
  AnalyticsEntitySchemaResult,
  AnalyticsSchemaSummaryResult,
  GetAnalyticsSchemaResult,
} from '../types.ts';

/**
 * Fetch and parse Azure DevOps Analytics OData `$metadata` EDMX XML.
 * Lists all available entity sets when `entitySet` is omitted, or inspects
 * exact properties, `Custom_*` fields, and navigation properties of one entity set.
 */
export async function getAnalyticsSchema(
  ctx: ToolContext,
  input: GetAnalyticsSchemaInput,
): Promise<GetAnalyticsSchemaResult> {
  const scope = input.scope ?? 'project';
  const version = input.version ?? DEFAULT_ODATA_VERSION;
  const requestedEntitySet =
    input.entitySet !== undefined
      ? validateMetadataEntitySetName(input.entitySet)
      : undefined;

  const projectId =
    scope === 'project' ? ctx.resolveProjectId(input.projectId) : undefined;
  const baseUrls = input.organizationId
    ? ctx.resolveBaseUrls({ organizationId: input.organizationId })
    : ctx.baseUrls;

  const odataBaseUrl = buildODataBaseUrl({
    analyticsBaseUrl: baseUrls.analyticsBaseUrl,
    scope,
    projectId,
    version,
  });

  const metadataUrl = `${odataBaseUrl}/$metadata`;
  const response = await executeAnalyticsHttpRequest<string>(ctx, {
    method: 'GET',
    url: metadataUrl,
    headers: {
      Accept: 'application/xml, text/xml',
    },
    responseType: 'text',
    context: `fetching Analytics OData $metadata (${version})`,
    version,
  });

  const parsed = parseEdmxMetadata(response.data);

  if (!requestedEntitySet) {
    const entitySets = parsed.entitySets.map((es) => {
      const isSnapshot = SNAPSHOT_ENTITY_SETS.has(es.name);
      return {
        name: es.name,
        entityType: es.entityType,
        isSnapshot,
        requiresAggregation: isSnapshot,
      };
    });

    const summary: AnalyticsSchemaSummaryResult = {
      scope,
      ...(projectId ? { projectId } : {}),
      version,
      entitySetCount: entitySets.length,
      entitySets,
    };
    return summary;
  }

  const targetLower = requestedEntitySet.toLowerCase();
  const matchedSet = parsed.entitySets.find(
    (es) => es.name.toLowerCase() === targetLower,
  );
  if (!matchedSet) {
    const available = parsed.entitySets.map((es) => es.name).join(', ');
    throw new AzureDevOpsResourceNotFoundError(
      `Analytics entitySet '${requestedEntitySet}' was not found in OData ${version} $metadata. Available entity sets: ${available || '(none)'}`,
    );
  }

  const entityType = parsed.entityTypes.get(matchedSet.shortEntityType);
  const properties = entityType?.properties ?? [];
  const customProperties = properties.filter((p) =>
    p.name.startsWith('Custom_'),
  );
  const navigationProperties = entityType?.navigationProperties ?? [];
  const keys = entityType?.keys ?? [];
  const isSnapshot = SNAPSHOT_ENTITY_SETS.has(matchedSet.name);

  const detail: AnalyticsEntitySchemaResult = {
    scope,
    ...(projectId ? { projectId } : {}),
    version,
    entitySet: matchedSet.name,
    entityType: matchedSet.entityType,
    isSnapshot,
    requiresAggregation: isSnapshot,
    keys,
    properties,
    customProperties,
    navigationProperties,
  };
  return detail;
}
