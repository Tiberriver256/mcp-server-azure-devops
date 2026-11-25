import type { ToolContext } from './azure-devops-session.ts';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../errors/index.ts';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolvedIdentity {
  id: string;
  displayName?: string;
  uniqueName?: string;
}

interface RawIdentity {
  id?: string;
  providerDisplayName?: string;
  customDisplayName?: string;
  properties?: {
    Account?: { $value?: string };
    Mail?: { $value?: string };
  };
}

interface IdentitiesResponse {
  value?: RawIdentity[];
}

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

/**
 * Resolve the currently authenticated caller's Azure DevOps identity GUID via
 * `connection.connect()` (`/_apis/connectionData`), which works across both
 * Azure DevOps Services (Cloud) and Azure DevOps Server 2019–2022 (On-Prem).
 */
export async function resolveCurrentUserId(
  ctx: ToolContext,
  organizationId?: string,
): Promise<ResolvedIdentity> {
  const connection = await ctx.getWebApi(organizationId);
  const connData = await connection.connect();
  const user = connData?.authenticatedUser;
  const id = user?.id?.trim();
  if (!id) {
    throw new AzureDevOpsResourceNotFoundError(
      'Unable to determine authenticated user identity from Azure DevOps connectionData',
    );
  }
  const rawProps: unknown = user?.properties;
  let uniqueName: string | undefined;
  if (
    typeof rawProps === 'object' &&
    rawProps !== null &&
    'Account' in rawProps
  ) {
    const accountObj: unknown = (rawProps as Record<string, unknown>).Account;
    if (
      typeof accountObj === 'object' &&
      accountObj !== null &&
      '$value' in accountObj
    ) {
      const val: unknown = (accountObj as Record<string, unknown>).$value;
      if (typeof val === 'string') {
        uniqueName = val;
      }
    }
  }
  return {
    id,
    displayName: user?.providerDisplayName ?? user?.customDisplayName,
    uniqueName,
  };
}

function getIdentityAccount(identity: RawIdentity): string | undefined {
  return (
    identity.properties?.Mail?.$value ?? identity.properties?.Account?.$value
  );
}

function getIdentityDisplayName(identity: RawIdentity): string | undefined {
  return identity.customDisplayName ?? identity.providerDisplayName;
}

/**
 * Resolve an identity identifier (UUID, email, UPN, domain\alias, or display name)
 * to a single unambiguous Azure DevOps identity GUID across Cloud (`vssps`) and
 * On-Prem Server (`coreBaseUrl`).
 */
export async function resolveIdentityId(
  ctx: ToolContext,
  identifier: string,
  organizationId?: string,
): Promise<ResolvedIdentity> {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new AzureDevOpsValidationError(
      'Identity identifier must not be empty',
    );
  }

  if (isUuid(trimmed)) {
    return { id: trimmed };
  }

  const baseUrls =
    organizationId && typeof ctx.resolveBaseUrls === 'function'
      ? ctx.resolveBaseUrls({ organizationId })
      : ctx.baseUrls;
  const baseUrl = baseUrls.identityBaseUrl.replace(/\/+$/, '');
  const apiVersion =
    baseUrls.type === 'services' ? '7.1' : ctx.config.apiVersion;

  const response = await ctx.requestAzureDevOps<IdentitiesResponse>({
    method: 'GET',
    url: `${baseUrl}/_apis/identities`,
    query: {
      searchFilter: 'General',
      filterValue: trimmed,
      queryMembership: 'None',
      'api-version': apiVersion,
    },
    context: `resolve identity '${trimmed}'`,
  });

  const candidates = (response.data?.value ?? []).filter(
    (entry): entry is RawIdentity & { id: string } =>
      typeof entry.id === 'string' && entry.id.trim().length > 0,
  );

  if (candidates.length === 0) {
    throw new AzureDevOpsResourceNotFoundError(
      `No Azure DevOps identity found matching '${trimmed}'`,
    );
  }

  if (candidates.length === 1) {
    const [only] = candidates;
    return {
      id: only.id,
      displayName: getIdentityDisplayName(only),
      uniqueName: getIdentityAccount(only),
    };
  }

  const needle = trimmed.toLowerCase();
  const exactMatches = candidates.filter((entry) => {
    const account = getIdentityAccount(entry)?.toLowerCase();
    const mail = entry.properties?.Mail?.$value?.toLowerCase();
    const acct = entry.properties?.Account?.$value?.toLowerCase();
    return account === needle || mail === needle || acct === needle;
  });

  if (exactMatches.length === 1) {
    const [exact] = exactMatches;
    return {
      id: exact.id,
      displayName: getIdentityDisplayName(exact),
      uniqueName: getIdentityAccount(exact),
    };
  }

  const summary = candidates
    .slice(0, 5)
    .map((entry) => {
      const name = getIdentityDisplayName(entry) ?? 'Unknown';
      const account = getIdentityAccount(entry);
      return account
        ? `${name} <${account}> (${entry.id})`
        : `${name} (${entry.id})`;
    })
    .join(', ');

  throw new AzureDevOpsValidationError(
    `Ambiguous identity '${trimmed}' matched ${candidates.length} identities (${summary}). Provide an exact email/uniqueName or UUID.`,
  );
}
