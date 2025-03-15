import { WebApi, getPersonalAccessTokenHandler } from 'azure-devops-node-api';
import { BearerCredentialHandler } from 'azure-devops-node-api/handlers/bearertoken';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';
import { AzureDevOpsAuthenticationError } from '../common/errors';

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
  AzureCli = 'azure-cli'
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
 * Azure DevOps resource ID for token acquisition
 */
const AZURE_DEVOPS_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798';

/**
 * Creates an authenticated client for Azure DevOps API based on the specified authentication method
 *
 * @param config Authentication configuration
 * @returns Authenticated WebApi client
 * @throws {AzureDevOpsAuthenticationError} If authentication fails
 */
export async function createAuthClient(config: AuthConfig): Promise<WebApi> {
  if (!config.organizationUrl) {
    throw new AzureDevOpsAuthenticationError('Organization URL is required');
  }

  try {
    let client: WebApi;

    switch (config.method) {
      case AuthenticationMethod.PersonalAccessToken:
        client = await createPatClient(config);
        break;
      case AuthenticationMethod.AzureIdentity:
        client = await createAzureIdentityClient(config);
        break;
      case AuthenticationMethod.AzureCli:
        client = await createAzureCliClient(config);
        break;
      default:
        throw new AzureDevOpsAuthenticationError(`Unsupported authentication method: ${config.method}`);
    }

    // Test the connection
    const locationsApi = await client.getLocationsApi();
    await locationsApi.getResourceAreas();

    return client;
  } catch (error) {
    if (error instanceof AzureDevOpsAuthenticationError) {
      throw error;
    }
    throw new AzureDevOpsAuthenticationError(
      `Failed to authenticate with Azure DevOps: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Creates a client using Personal Access Token authentication
 * 
 * @param config Authentication configuration
 * @returns Authenticated WebApi client
 * @throws {AzureDevOpsAuthenticationError} If PAT is missing or authentication fails
 */
async function createPatClient(config: AuthConfig): Promise<WebApi> {
  if (!config.personalAccessToken) {
    throw new AzureDevOpsAuthenticationError('Personal Access Token (PAT) is required');
  }

  // Create authentication handler using PAT
  const authHandler = getPersonalAccessTokenHandler(config.personalAccessToken);

  // Create API client with the auth handler
  return new WebApi(config.organizationUrl, authHandler);
}

/**
 * Creates a client using DefaultAzureCredential authentication
 * 
 * @param config Authentication configuration
 * @returns Authenticated WebApi client
 * @throws {AzureDevOpsAuthenticationError} If token acquisition fails
 */
async function createAzureIdentityClient(config: AuthConfig): Promise<WebApi> {
  try {
    // Create DefaultAzureCredential
    const credential = new DefaultAzureCredential();
    
    // Get token for Azure DevOps
    const token = await credential.getToken(`${AZURE_DEVOPS_RESOURCE_ID}/.default`);
    
    if (!token || !token.token) {
      throw new Error('Failed to acquire token');
    }
    
    // Create bearer token handler
    const authHandler = new BearerCredentialHandler(token.token);
    
    // Create API client with the auth handler
    return new WebApi(config.organizationUrl, authHandler);
  } catch (error) {
    throw new AzureDevOpsAuthenticationError(
      `Failed to acquire Azure Identity token: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Creates a client using AzureCliCredential authentication
 * 
 * @param config Authentication configuration
 * @returns Authenticated WebApi client
 * @throws {AzureDevOpsAuthenticationError} If token acquisition fails
 */
async function createAzureCliClient(config: AuthConfig): Promise<WebApi> {
  try {
    // Create AzureCliCredential
    const credential = new AzureCliCredential();
    
    // Get token for Azure DevOps
    const token = await credential.getToken(`${AZURE_DEVOPS_RESOURCE_ID}/.default`);
    
    if (!token || !token.token) {
      throw new Error('Failed to acquire token');
    }
    
    // Create bearer token handler
    const authHandler = new BearerCredentialHandler(token.token);
    
    // Create API client with the auth handler
    return new WebApi(config.organizationUrl, authHandler);
  } catch (error) {
    throw new AzureDevOpsAuthenticationError(
      `Failed to acquire Azure CLI token: ${error instanceof Error ? error.message : String(error)}`
    );
  }
} 