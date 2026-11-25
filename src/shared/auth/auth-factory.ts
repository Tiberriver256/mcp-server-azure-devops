import type { WebApi } from 'azure-devops-node-api';
import type { IRequestHandler } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import type {
  IHttpClient,
  IHttpClientResponse,
  IRequestInfo,
} from 'typed-rest-client/Interfaces';
import type * as http from 'http';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsValidationError,
  redactSecrets,
} from '../errors';
import {
  formatOrgUrlForLog,
  isAzureDevOpsServicesUrl,
} from '../azure-devops-url';
import { logInfo, logWarn } from '../logging';

export { formatOrgUrlForLog };

/**
 * Authentication methods supported by the Azure DevOps client
 */
export enum AuthenticationMethod {
  /**
   * Personal Access Token authentication
   */
  PersonalAccessToken = 'pat',

  /**
   * Azure Identity authentication (DefaultAzureCredential)
   */
  AzureIdentity = 'azure-identity',

  /**
   * Azure CLI authentication (AzureCliCredential)
   */
  AzureCli = 'azure-cli',
}

/**
 * Authentication configuration for Azure DevOps
 */
export interface AuthConfig {
  /**
   * Authentication method to use
   */
  method: AuthenticationMethod;

  /**
   * Organization URL (e.g., https://dev.azure.com/myorg)
   */
  organizationUrl: string;

  /**
   * Personal Access Token for Azure DevOps (required for PAT authentication)
   */
  personalAccessToken?: string;
}

/**
 * Azure DevOps Entra ID resource ID for OAuth token acquisition.
 */
export const AZURE_DEVOPS_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798';
const AZURE_DEVOPS_SCOPE = `${AZURE_DEVOPS_RESOURCE_ID}/.default`;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

interface CachedAccessToken {
  token: string;
  expiresOnTimestamp: number;
}

interface TokenCredentialLike {
  getToken(scope: string): Promise<CachedAccessToken | null>;
}

/**
 * Normalize an auth method string case-insensitively to AuthenticationMethod.
 */
export function normalizeAuthMethod(
  authMethodStr?: string,
): AuthenticationMethod {
  if (!authMethodStr) {
    return AuthenticationMethod.AzureIdentity;
  }

  const normalized = authMethodStr.trim().toLowerCase();
  if (normalized === AuthenticationMethod.PersonalAccessToken.toLowerCase()) {
    return AuthenticationMethod.PersonalAccessToken;
  }
  if (normalized === AuthenticationMethod.AzureIdentity.toLowerCase()) {
    return AuthenticationMethod.AzureIdentity;
  }
  if (normalized === AuthenticationMethod.AzureCli.toLowerCase()) {
    return AuthenticationMethod.AzureCli;
  }

  logWarn(
    `Unrecognized auth method '${authMethodStr}'. Using default (${AuthenticationMethod.AzureIdentity}).`,
  );
  return AuthenticationMethod.AzureIdentity;
}

/**
 * Encode a Personal Access Token into an HTTP Basic Authorization header value.
 */
export function createBasicAuthHeader(pat: string): string {
  const base64Token = Buffer.from(`:${pat}`).toString('base64');
  return `Basic ${base64Token}`;
}

/**
 * Whether an error looks like an Azure DevOps API location lookup failure.
 */
export function isLocationLookupFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Failed to find api location');
}

/**
 * Whether an error looks like a credential / HTTP auth failure.
 */
export function isCredentialAuthFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /\b401\b/.test(message) ||
    /\b403\b/.test(message) ||
    /unauthorized/i.test(message) ||
    /authentication failed/i.test(message) ||
    /access denied/i.test(message) ||
    /TF400813/i.test(message) ||
    /failed to acquire (token|azure)/i.test(message)
  );
}

/**
 * Reusable credential & authorization header provider.
 *
 * - Lazy-loads `@azure/identity` ONLY when `azure-identity` or `azure-cli` auth
 *   is actually used (zero startup cost / zero heap allocation for PAT users).
 * - Reuses a single `TokenCredential` instance and deduplicates concurrent
 *   refreshes so MSAL caches work and `az` CLI is not spawned on every call.
 */
export interface AuthProvider {
  readonly method: AuthenticationMethod;
  getAuthorizationHeader(): Promise<string>;
  getBearerToken(): Promise<string>;
  createRequestHandler(): Promise<IRequestHandler>;
}

/**
 * Refreshable Bearer token handler for `azure-devops-node-api`'s `WebApi`.
 * Reads the latest cached token via a live getter so multiple cached `WebApi`
 * instances (e.g., across organizations) stay synchronized after any refresh.
 */
export class RefreshingBearerCredentialHandler implements IRequestHandler {
  private readonly getCurrentToken: () => string;
  private readonly refreshToken: () => Promise<string>;

  constructor(
    getCurrentToken: () => string,
    refreshToken: () => Promise<string>,
  ) {
    this.getCurrentToken = getCurrentToken;
    this.refreshToken = refreshToken;
  }

  prepareRequest(options: http.RequestOptions): void {
    const isHeadersRecord = (
      value: http.OutgoingHttpHeaders | readonly string[] | undefined,
    ): value is http.OutgoingHttpHeaders =>
      value !== undefined && !Array.isArray(value);

    const headers: http.OutgoingHttpHeaders = isHeadersRecord(options.headers)
      ? options.headers
      : {};
    headers['Authorization'] = `Bearer ${this.getCurrentToken()}`;
    headers['X-TFS-FedAuthRedirect'] = 'Suppress';
    options.headers = headers;
  }

  canHandleAuthentication(response: IHttpClientResponse): boolean {
    return response.message.statusCode === 401;
  }

  async handleAuthentication(
    httpClient: IHttpClient,
    requestInfo: IRequestInfo,
    objs: unknown,
  ): Promise<IHttpClientResponse> {
    await this.refreshToken();
    this.prepareRequest(requestInfo.options);

    const isReadableStream = (
      value: unknown,
    ): value is NodeJS.ReadableStream & {
      readableEnded?: boolean;
      destroyed?: boolean;
    } =>
      typeof value === 'object' &&
      value !== null &&
      'pipe' in value &&
      typeof value.pipe === 'function';

    if (isReadableStream(objs)) {
      if (objs.readableEnded || objs.destroyed) {
        throw new AzureDevOpsAuthenticationError(
          'Authentication expired during a streaming upload; please retry the operation',
        );
      }
      return await httpClient.requestRaw(requestInfo, objs);
    }

    // Pass `null` (not `''`) when there is no body so typed-rest-client does NOT
    // inject `Content-Length: 0` onto GET/HEAD/DELETE retries.
    // `requestRaw`'s TypeScript signature expects `string | NodeJS.ReadableStream`,
    // while typed-rest-client's runtime explicitly checks `if (typeof data === 'string')`.
    const payload = typeof objs === 'string' ? objs : null;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const rawData = payload as unknown as string;
    return await httpClient.requestRaw(requestInfo, rawData);
  }
}

export function createAuthProvider(config: AuthConfig): AuthProvider {
  if (!config.organizationUrl) {
    throw new AzureDevOpsAuthenticationError('Organization URL is required');
  }

  if (
    !isAzureDevOpsServicesUrl(config.organizationUrl) &&
    config.method !== AuthenticationMethod.PersonalAccessToken
  ) {
    throw new AzureDevOpsAuthenticationError(
      'Azure DevOps Server requires Personal Access Token authentication',
    );
  }

  if (
    config.method === AuthenticationMethod.PersonalAccessToken &&
    !config.personalAccessToken
  ) {
    throw new AzureDevOpsAuthenticationError(
      'Personal Access Token is required',
    );
  }

  if (
    config.method !== AuthenticationMethod.PersonalAccessToken &&
    config.method !== AuthenticationMethod.AzureIdentity &&
    config.method !== AuthenticationMethod.AzureCli
  ) {
    throw new AzureDevOpsAuthenticationError(
      `Unsupported authentication method: ${String(config.method)}`,
    );
  }

  let credentialInstance: TokenCredentialLike | null = null;
  let cachedToken: CachedAccessToken | null = null;
  let inFlightToken: Promise<CachedAccessToken> | null = null;

  const getCredential = async (): Promise<TokenCredentialLike> => {
    if (credentialInstance) {
      return credentialInstance;
    }

    const identity = await import('@azure/identity');
    credentialInstance =
      config.method === AuthenticationMethod.AzureCli
        ? new identity.AzureCliCredential()
        : new identity.DefaultAzureCredential();
    return credentialInstance;
  };

  const acquireToken = async (forceRefresh = false): Promise<string> => {
    const now = Date.now();
    if (
      !forceRefresh &&
      cachedToken &&
      cachedToken.expiresOnTimestamp - TOKEN_REFRESH_BUFFER_MS > now
    ) {
      return cachedToken.token;
    }

    if (!inFlightToken) {
      inFlightToken = (async () => {
        try {
          const credential = await getCredential();
          const token = await credential.getToken(AZURE_DEVOPS_SCOPE);
          if (!token || !token.token) {
            throw new Error('Failed to acquire token');
          }
          cachedToken = token;
          return token;
        } catch (error) {
          const label =
            config.method === AuthenticationMethod.AzureCli
              ? 'Azure CLI'
              : 'Azure Identity';
          throw new AzureDevOpsAuthenticationError(
            `Failed to acquire ${label} token: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          inFlightToken = null;
        }
      })();
    }

    const resolved = await inFlightToken;
    return resolved.token;
  };

  const getAuthorizationHeader = async (): Promise<string> => {
    if (config.method === AuthenticationMethod.PersonalAccessToken) {
      return createBasicAuthHeader(config.personalAccessToken ?? '');
    }
    const token = await acquireToken(false);
    return `Bearer ${token}`;
  };

  const getBearerToken = async (): Promise<string> => {
    if (config.method === AuthenticationMethod.PersonalAccessToken) {
      throw new AzureDevOpsAuthenticationError(
        'Bearer token is not available for PAT authentication',
      );
    }
    return await acquireToken(false);
  };

  const createRequestHandler = async (): Promise<IRequestHandler> => {
    if (config.method === AuthenticationMethod.PersonalAccessToken) {
      const ado = await import('azure-devops-node-api');
      return ado.getPersonalAccessTokenHandler(
        config.personalAccessToken ?? '',
      );
    }

    const initialToken = await acquireToken(false);
    return new RefreshingBearerCredentialHandler(
      () => cachedToken?.token ?? initialToken,
      () => acquireToken(true),
    );
  };

  return {
    method: config.method,
    getAuthorizationHeader,
    getBearerToken,
    createRequestHandler,
  };
}

/**
 * Classify a connection failure from Azure DevOps WebApi initialization.
 */
export function classifyConnectionError(
  error: unknown,
  organizationUrl: string,
): AzureDevOpsError {
  if (error instanceof AzureDevOpsError) {
    return error;
  }

  const orgDisplay = formatOrgUrlForLog(organizationUrl);
  const message = redactSecrets(
    error instanceof Error ? error.message : String(error),
  );

  if (isLocationLookupFailure(error)) {
    return new AzureDevOpsValidationError(
      `Failed to resolve Azure DevOps API location for org ${orgDisplay}: ${message}. ` +
        'This is usually a wrong or unreachable AZURE_DEVOPS_ORG_URL ' +
        '(expected https://dev.azure.com/<org>), not a credential failure.',
      undefined,
      { cause: new Error(message) },
    );
  }

  if (isCredentialAuthFailure(error)) {
    return new AzureDevOpsAuthenticationError(
      `Failed to authenticate with Azure DevOps: ${message}`,
    );
  }

  return new AzureDevOpsError(`Failed to connect to Azure DevOps: ${message}`);
}

/**
 * Creates an authenticated `WebApi` client for Azure DevOps and verifies
 * API location reachability once.
 */
export async function createAuthClient(
  config: AuthConfig,
  provider?: AuthProvider,
): Promise<WebApi> {
  const authProvider = provider ?? createAuthProvider(config);
  const orgDisplay = formatOrgUrlForLog(config.organizationUrl);
  logInfo(`Azure DevOps auth: method=${config.method}, org=${orgDisplay}`);

  try {
    const [ado, authHandler] = await Promise.all([
      import('azure-devops-node-api'),
      authProvider.createRequestHandler(),
    ]);

    const client = new ado.WebApi(config.organizationUrl, authHandler);
    const locationsApi = await client.getLocationsApi();
    await locationsApi.getResourceAreas();

    return client;
  } catch (error) {
    throw classifyConnectionError(error, config.organizationUrl);
  }
}
