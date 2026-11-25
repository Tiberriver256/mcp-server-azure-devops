import type { WebApi } from 'azure-devops-node-api';
import type { AzureDevOpsConfig } from '../types/config.ts';
import {
  AuthenticationMethod,
  createAuthClient,
  createAuthProvider,
  normalizeAuthMethod,
} from '../auth/auth-factory.ts';
import type { AuthProvider } from '../auth/auth-factory.ts';
import { resolveAzureDevOpsBaseUrls } from '../azure-devops-url.ts';
import type {
  AzureDevOpsBaseUrls,
  AzureDevOpsUrlOptions,
} from '../azure-devops-url.ts';
import {
  createHttpClient,
  mapHttpErrorToAzureDevOpsError,
} from '../http/http-client.ts';
import type {
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from '../http/http-client.ts';
import { AzureDevOpsValidationError } from '../errors/index.ts';
import type { EventEngine } from '../events/event-engine.ts';
import { logInfo } from '../logging.ts';

export const DEFAULT_API_VERSION = '7.1';

/**
 * Immutable, validated server configuration.
 * Never uses sentinel strings like `'no default project'`.
 */
export interface ResolvedAzureDevOpsConfig {
  readonly organizationUrl: string;
  readonly authMethod: AuthenticationMethod;
  readonly personalAccessToken?: string;
  readonly defaultProject?: string;
  readonly apiVersion: string;
  readonly toolsets?: readonly string[];
  readonly enabledTools?: readonly string[];
  readonly disabledTools?: readonly string[];
  readonly readOnly: boolean;
  readonly spotlighting: boolean;
  readonly eventPollIntervalMs?: number;
  readonly eventBufferSize?: number;
}

/**
 * Deep session seam passed to all tool handlers and resource handlers.
 *
 * Centralizes:
 * - Immutable resolved configuration (`defaultProject`, `apiVersion`, `organizationUrl`)
 * - Cached `WebApi` connections (per target organization URL) with automatic Entra token refresh
 * - Single `getAuthHeader()` source of truth (no per-feature `process.env` reads)
 * - Native `fetch`-backed `http` client with automatic auth injection for Azure DevOps hosts
 */
export interface ToolContext {
  readonly config: ResolvedAzureDevOpsConfig;
  readonly baseUrls: AzureDevOpsBaseUrls;
  readonly http: HttpClient;
  readonly eventEngine?: EventEngine;

  /**
   * Return a cached, authenticated `WebApi` instance for the configured org
   * (or an alternate cloud organization when `organizationId` is supplied).
   */
  getWebApi(organizationId?: string): Promise<WebApi>;

  /**
   * Return the Authorization header value (`Basic ...` or `Bearer ...`).
   */
  getAuthHeader(): Promise<string>;

  /**
   * Execute an authenticated HTTP request against an Azure DevOps REST endpoint.
   * Automatically attaches `Authorization` and maps HTTP failures to `AzureDevOpsError`.
   */
  requestAzureDevOps<T = unknown>(
    options: HttpRequestOptions & { context: string },
  ): Promise<HttpResponse<T>>;

  /**
   * Resolve base URLs for optional org/project overrides.
   */
  resolveBaseUrls(options?: AzureDevOpsUrlOptions): AzureDevOpsBaseUrls;

  /**
   * Resolve a required projectId (explicit argument -> configured defaultProject -> throws).
   */
  resolveProjectId(explicitProjectId?: string): string;

  /**
   * Resolve an optional projectId (explicit argument -> configured defaultProject -> undefined).
   */
  resolveOptionalProjectId(explicitProjectId?: string): string | undefined;
}

/**
 * Validate and normalize raw `AzureDevOpsConfig` without mutating the input object.
 */
export function resolveAzureDevOpsConfig(
  config: AzureDevOpsConfig,
): ResolvedAzureDevOpsConfig {
  const organizationUrl = config.organizationUrl?.trim() ?? '';
  if (!organizationUrl) {
    throw new AzureDevOpsValidationError('Organization URL is required');
  }

  const authMethod = config.authMethod ?? AuthenticationMethod.AzureIdentity;

  if (
    authMethod === AuthenticationMethod.PersonalAccessToken &&
    !config.personalAccessToken
  ) {
    throw new AzureDevOpsValidationError(
      'Personal access token is required when using PAT authentication',
    );
  }

  const trimmedProject = config.defaultProject?.trim();
  const defaultProject =
    trimmedProject &&
    trimmedProject.length > 0 &&
    trimmedProject !== 'no default project'
      ? trimmedProject
      : undefined;

  const trimmedApiVersion = config.apiVersion?.trim();
  const apiVersion =
    trimmedApiVersion && trimmedApiVersion.length > 0
      ? trimmedApiVersion
      : DEFAULT_API_VERSION;

  return {
    organizationUrl,
    authMethod,
    personalAccessToken: config.personalAccessToken,
    defaultProject,
    apiVersion,
    toolsets: config.toolsets ? [...config.toolsets] : undefined,
    enabledTools: config.enabledTools ? [...config.enabledTools] : undefined,
    disabledTools: config.disabledTools ? [...config.disabledTools] : undefined,
    readOnly: config.readOnly === true,
    spotlighting: config.spotlighting !== false,
    ...(config.eventPollIntervalMs !== undefined
      ? { eventPollIntervalMs: config.eventPollIntervalMs }
      : {}),
    ...(config.eventBufferSize !== undefined
      ? { eventBufferSize: config.eventBufferSize }
      : {}),
  };
}

export interface CreateSessionOptions {
  httpClient?: HttpClient;
  authProvider?: AuthProvider;
  eventEngine?: EventEngine;
  sessionId?: string;
  webApiFactory?: (
    organizationUrl: string,
    provider: AuthProvider,
  ) => Promise<WebApi>;
}

/**
 * Create a single deep session per MCP server instance.
 */
export function createAzureDevOpsSession(
  rawConfig: AzureDevOpsConfig,
  deps: CreateSessionOptions = {},
): ToolContext {
  const config = resolveAzureDevOpsConfig(rawConfig);
  const baseUrls = resolveAzureDevOpsBaseUrls(config.organizationUrl, {
    projectId: config.defaultProject,
  });
  const http = deps.httpClient ?? createHttpClient();

  let authProvider: AuthProvider | null = deps.authProvider ?? null;
  const getAuthProvider = (): AuthProvider => {
    if (!authProvider) {
      authProvider = createAuthProvider({
        method: config.authMethod,
        organizationUrl: config.organizationUrl,
        personalAccessToken: config.personalAccessToken,
      });
    }
    return authProvider;
  };

  // Cache WebApi per target URL; evict failed promises so transient errors can recover
  const webApiCache = new Map<string, Promise<WebApi>>();

  const getWebApi = async (organizationId?: string): Promise<WebApi> => {
    const trimmedOrg = organizationId?.trim();
    let targetUrl = config.organizationUrl;

    if (trimmedOrg && trimmedOrg.length > 0) {
      if (
        baseUrls.type === 'services' &&
        trimmedOrg !== baseUrls.organization
      ) {
        targetUrl = resolveAzureDevOpsBaseUrls(config.organizationUrl, {
          organizationId: trimmedOrg,
        }).coreBaseUrl;
      } else if (
        baseUrls.type === 'server' &&
        baseUrls.instanceBaseUrl &&
        trimmedOrg !== baseUrls.collection
      ) {
        targetUrl = `${baseUrls.instanceBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(trimmedOrg)}`;
      }
    }

    const provider = getAuthProvider();

    // Ensure Entra bearer token is still fresh when reusing a cached WebApi
    if (provider.method !== AuthenticationMethod.PersonalAccessToken) {
      await provider.getBearerToken();
    }

    const existing = webApiCache.get(targetUrl);
    if (existing) {
      return await existing;
    }

    const factory =
      deps.webApiFactory ??
      ((url: string, p: AuthProvider) =>
        createAuthClient(
          {
            method: config.authMethod,
            organizationUrl: url,
            personalAccessToken: config.personalAccessToken,
          },
          p,
        ));

    logInfo('Azure DevOps: connecting...');
    const pending = factory(targetUrl, provider)
      .then((api) => {
        logInfo('Azure DevOps: connection ok');
        return api;
      })
      .catch((error: unknown) => {
        webApiCache.delete(targetUrl);
        throw error;
      });

    webApiCache.set(targetUrl, pending);
    return await pending;
  };

  const getAuthHeader = async (): Promise<string> => {
    return await getAuthProvider().getAuthorizationHeader();
  };

  const requestAzureDevOps = async <T = unknown>(
    options: HttpRequestOptions & { context: string },
  ): Promise<HttpResponse<T>> => {
    const { context, ...httpOptions } = options;
    try {
      const authHeader = await getAuthHeader();
      const sanitizedHeaders: Record<string, string> = {};
      if (httpOptions.headers) {
        for (const [key, value] of Object.entries(httpOptions.headers)) {
          if (key.toLowerCase() !== 'authorization') {
            sanitizedHeaders[key] = value;
          }
        }
      }
      return await http.request<T>({
        ...httpOptions,
        headers: {
          ...sanitizedHeaders,
          Authorization: authHeader,
        },
      });
    } catch (error) {
      throw mapHttpErrorToAzureDevOpsError(error, context);
    }
  };

  const resolveBaseUrls = (
    options?: AzureDevOpsUrlOptions,
  ): AzureDevOpsBaseUrls => {
    if (!options || (!options.organizationId && !options.projectId)) {
      return baseUrls;
    }
    return resolveAzureDevOpsBaseUrls(config.organizationUrl, {
      organizationId: options.organizationId?.trim() || undefined,
      projectId: options.projectId?.trim() || config.defaultProject,
    });
  };

  const resolveOptionalProjectId = (
    explicitProjectId?: string,
  ): string | undefined => {
    const trimmed = explicitProjectId?.trim();
    if (trimmed && trimmed.length > 0 && trimmed !== 'no default project') {
      return trimmed;
    }
    return config.defaultProject;
  };

  const resolveProjectId = (explicitProjectId?: string): string => {
    const resolved = resolveOptionalProjectId(explicitProjectId);
    if (!resolved) {
      throw new AzureDevOpsValidationError(
        'projectId is required (provide projectId or set AZURE_DEVOPS_DEFAULT_PROJECT)',
      );
    }
    return resolved;
  };

  return {
    config,
    baseUrls,
    http,
    ...(deps.eventEngine ? { eventEngine: deps.eventEngine } : {}),
    getWebApi,
    getAuthHeader,
    requestAzureDevOps,
    resolveBaseUrls,
    resolveProjectId,
    resolveOptionalProjectId,
  };
}

/**
 * Create a ToolContext from process.env (intended for standalone callers and
 * integration tests; the MCP server constructs its session explicitly from CLI/env config).
 */
export function createSessionFromEnv(
  overrides: Partial<AzureDevOpsConfig> = {},
  deps?: CreateSessionOptions,
): ToolContext {
  const organizationUrl =
    overrides.organizationUrl ?? process.env.AZURE_DEVOPS_ORG_URL ?? '';
  const authMethod =
    overrides.authMethod ??
    normalizeAuthMethod(process.env.AZURE_DEVOPS_AUTH_METHOD);
  const personalAccessToken =
    overrides.personalAccessToken ?? process.env.AZURE_DEVOPS_PAT;
  const defaultProject =
    overrides.defaultProject ?? process.env.AZURE_DEVOPS_DEFAULT_PROJECT;
  const apiVersion =
    overrides.apiVersion ?? process.env.AZURE_DEVOPS_API_VERSION;

  return createAzureDevOpsSession(
    {
      organizationUrl,
      authMethod,
      personalAccessToken,
      defaultProject,
      apiVersion,
    },
    deps,
  );
}
