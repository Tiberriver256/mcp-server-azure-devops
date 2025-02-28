import { WebApi } from 'azure-devops-node-api';
import { ICoreApi } from 'azure-devops-node-api/CoreApi';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { IBuildApi } from 'azure-devops-node-api/BuildApi';
import { ITestApi } from 'azure-devops-node-api/TestApi';
import { IReleaseApi } from 'azure-devops-node-api/ReleaseApi';
import { ITaskAgentApi } from 'azure-devops-node-api/TaskAgentApi';
import { ITaskApi } from 'azure-devops-node-api/TaskApi';
import { AzureDevOpsError, AzureDevOpsAuthenticationError } from './errors';
import { createAuthenticatedClient } from './auth';

export interface AzureDevOpsClientConfig {
  orgUrl: string;
  pat: string;
}

/**
 * Azure DevOps Client
 * 
 * Provides access to Azure DevOps APIs
 */
export class AzureDevOpsClient {
  private config: AzureDevOpsClientConfig;
  private clientPromise: Promise<WebApi> | null = null;

  constructor(config: AzureDevOpsClientConfig) {
    this.config = config;
  }

  /**
   * Get the authenticated Azure DevOps client
   * 
   * @returns The authenticated WebApi client
   * @throws {AzureDevOpsAuthenticationError} If authentication fails
   */
  private async getClient(): Promise<WebApi> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        try {
          return await createAuthenticatedClient(this.config);
        } catch (error) {
          // If it's already an AzureDevOpsError, rethrow it
          if (error instanceof AzureDevOpsError) {
            throw error;
          }
          // Otherwise, wrap it in an AzureDevOpsAuthenticationError
          throw new AzureDevOpsAuthenticationError(
            error instanceof Error 
              ? `Authentication failed: ${error.message}` 
              : 'Authentication failed: Unknown error'
          );
        }
      })();
    }
    return this.clientPromise;
  }

  /**
   * Check if the client is authenticated
   * 
   * @returns True if the client is authenticated
   */
  public async isAuthenticated(): Promise<boolean> {
    try {
      const client = await this.getClient();
      return !!client;
    } catch (error) {
      // Any error means we're not authenticated
      return false;
    }
  }

  /**
   * Get the Core API
   * 
   * @returns The Core API client
   * @throws {AzureDevOpsAuthenticationError} If authentication fails
   */
  public async getCoreApi(): Promise<ICoreApi> {
    try {
      const client = await this.getClient();
      return await client.getCoreApi();
    } catch (error) {
      // If it's already an AzureDevOpsError, rethrow it
      if (error instanceof AzureDevOpsError) {
        throw error;
      }
      // Otherwise, wrap it in an AzureDevOpsAuthenticationError
      throw new AzureDevOpsAuthenticationError(
        error instanceof Error 
          ? `Failed to get Core API: ${error.message}` 
          : 'Failed to get Core API: Unknown error'
      );
    }
  }

  /**
   * Get the Git API
   * 
   * @returns The Git API client
   * @throws {AzureDevOpsAuthenticationError} If authentication fails
   */
  public async getGitApi(): Promise<IGitApi> {
    try {
      const client = await this.getClient();
      return await client.getGitApi();
    } catch (error) {
      // If it's already an AzureDevOpsError, rethrow it
      if (error instanceof AzureDevOpsError) {
        throw error;
      }
      // Otherwise, wrap it in an AzureDevOpsAuthenticationError
      throw new AzureDevOpsAuthenticationError(
        error instanceof Error 
          ? `Failed to get Git API: ${error.message}` 
          : 'Failed to get Git API: Unknown error'
      );
    }
  }

  /**
   * Get the Work Item Tracking API
   * 
   * @returns The Work Item Tracking API client
   * @throws {AzureDevOpsAuthenticationError} If authentication fails
   */
  public async getWorkItemTrackingApi(): Promise<IWorkItemTrackingApi> {
    try {
      const client = await this.getClient();
      return await client.getWorkItemTrackingApi();
    } catch (error) {
      // If it's already an AzureDevOpsError, rethrow it
      if (error instanceof AzureDevOpsError) {
        throw error;
      }
      // Otherwise, wrap it in an AzureDevOpsAuthenticationError
      throw new AzureDevOpsAuthenticationError(
        error instanceof Error 
          ? `Failed to get Work Item Tracking API: ${error.message}` 
          : 'Failed to get Work Item Tracking API: Unknown error'
      );
    }
  }

  /**
   * Get the Build API
   * 
   * @returns The Build API client
   * @throws {AzureDevOpsAuthenticationError} If authentication fails
   */
  public async getBuildApi(): Promise<IBuildApi> {
    try {
      const client = await this.getClient();
      return await client.getBuildApi();
    } catch (error) {
      // If it's already an AzureDevOpsError, rethrow it
      if (error instanceof AzureDevOpsError) {
        throw error;
      }
      // Otherwise, wrap it in an AzureDevOpsAuthenticationError
      throw new AzureDevOpsAuthenticationError(
        error instanceof Error 
          ? `Failed to get Build API: ${error.message}` 
          : 'Failed to get Build API: Unknown error'
      );
    }
  }

  /**
   * Get the Test API
   * 
   * @returns The Test API client
   * @throws {AzureDevOpsAuthenticationError} If authentication fails
   */
  public async getTestApi(): Promise<ITestApi> {
    try {
      const client = await this.getClient();
      return await client.getTestApi();
    } catch (error) {
      // If it's already an AzureDevOpsError, rethrow it
      if (error instanceof AzureDevOpsError) {
        throw error;
      }
      // Otherwise, wrap it in an AzureDevOpsAuthenticationError
      throw new AzureDevOpsAuthenticationError(
        error instanceof Error 
          ? `Failed to get Test API: ${error.message}` 
          : 'Failed to get Test API: Unknown error'
      );
    }
  }

  /**
   * Get the Release API
   * 
   * @returns The Release API client
   * @throws {AzureDevOpsAuthenticationError} If authentication fails
   */
  public async getReleaseApi(): Promise<IReleaseApi> {
    try {
      const client = await this.getClient();
      return await client.getReleaseApi();
    } catch (error) {
      // If it's already an AzureDevOpsError, rethrow it
      if (error instanceof AzureDevOpsError) {
        throw error;
      }
      // Otherwise, wrap it in an AzureDevOpsAuthenticationError
      throw new AzureDevOpsAuthenticationError(
        error instanceof Error 
          ? `Failed to get Release API: ${error.message}` 
          : 'Failed to get Release API: Unknown error'
      );
    }
  }

  /**
   * Get the Task Agent API
   * 
   * @returns The Task Agent API client
   * @throws {AzureDevOpsAuthenticationError} If authentication fails
   */
  public async getTaskAgentApi(): Promise<ITaskAgentApi> {
    try {
      const client = await this.getClient();
      return await client.getTaskAgentApi();
    } catch (error) {
      // If it's already an AzureDevOpsError, rethrow it
      if (error instanceof AzureDevOpsError) {
        throw error;
      }
      // Otherwise, wrap it in an AzureDevOpsAuthenticationError
      throw new AzureDevOpsAuthenticationError(
        error instanceof Error 
          ? `Failed to get Task Agent API: ${error.message}` 
          : 'Failed to get Task Agent API: Unknown error'
      );
    }
  }

  /**
   * Get the Task API
   * 
   * @returns The Task API client
   * @throws {AzureDevOpsAuthenticationError} If authentication fails
   */
  public async getTaskApi(): Promise<ITaskApi> {
    try {
      const client = await this.getClient();
      return await client.getTaskApi();
    } catch (error) {
      // If it's already an AzureDevOpsError, rethrow it
      if (error instanceof AzureDevOpsError) {
        throw error;
      }
      // Otherwise, wrap it in an AzureDevOpsAuthenticationError
      throw new AzureDevOpsAuthenticationError(
        error instanceof Error 
          ? `Failed to get Task API: ${error.message}` 
          : 'Failed to get Task API: Unknown error'
      );
    }
  }
} 