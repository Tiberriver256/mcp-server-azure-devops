/**
 * Authentication module for Azure DevOps
 * 
 * This module provides authentication functionality for Azure DevOps API.
 * It supports multiple authentication methods:
 * - Personal Access Token (PAT)
 * - Azure Identity (DefaultAzureCredential)
 * - Azure CLI (AzureCliCredential)
 */

export { AuthenticationMethod, AuthConfig, createAuthClient } from './auth-factory';
export { AzureDevOpsClient } from './client-factory'; 