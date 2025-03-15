# Azure Identity Authentication for Azure DevOps MCP Server

This document outlines the implementation approach for adding Azure Identity authentication support to the Azure DevOps MCP Server.

## Overview

The Azure DevOps MCP Server currently supports Personal Access Token (PAT) authentication. This enhancement will add support for Azure Identity authentication methods, specifically DefaultAzureCredential and AzureCliCredential, to provide more flexible authentication options for different environments.

## Azure Identity SDK

The `@azure/identity` package provides various credential types for authenticating with Azure services. For our implementation, we will focus on the following credential types:

### DefaultAzureCredential

`DefaultAzureCredential` provides a simplified authentication experience by trying multiple credential types in sequence:

1. Environment variables (EnvironmentCredential)
2. Managed Identity (ManagedIdentityCredential)
3. Azure CLI (AzureCliCredential)
4. Visual Studio Code (VisualStudioCodeCredential)
5. Azure PowerShell (AzurePowerShellCredential)
6. Interactive Browser (InteractiveBrowserCredential) - optional, disabled by default

This makes it ideal for applications that need to work in different environments (local development, Azure-hosted) without code changes.

### AzureCliCredential

`AzureCliCredential` authenticates using the Azure CLI's logged-in account. It requires the Azure CLI to be installed and the user to be logged in (`az login`). This is particularly useful for local development scenarios where developers are already using the Azure CLI.

## Implementation Approach

### 1. Authentication Abstraction Layer

Create an abstraction layer for authentication that supports both PAT and Azure Identity methods:

```typescript
// src/api/auth.ts
export interface AuthProvider {
  getConnection(): Promise<WebApi>;
  isAuthenticated(): Promise<boolean>;
}

export class PatAuthProvider implements AuthProvider {
  // Existing PAT authentication implementation
}

export class AzureIdentityAuthProvider implements AuthProvider {
  // New Azure Identity authentication implementation
}
```

### 2. Authentication Factory

Implement a factory pattern to create the appropriate authentication provider based on configuration:

```typescript
// src/api/auth.ts
export enum AuthMethod {
  PAT = 'pat',
  AZURE_IDENTITY = 'azure-identity'
}

export function createAuthProvider(config: AzureDevOpsConfig): AuthProvider {
  switch (config.authMethod) {
    case AuthMethod.AZURE_IDENTITY:
      return new AzureIdentityAuthProvider(config);
    case AuthMethod.PAT:
    default:
      return new PatAuthProvider(config);
  }
}
```

### 3. Azure Identity Authentication Provider

Implement the Azure Identity authentication provider:

```typescript
// src/api/auth.ts
export class AzureIdentityAuthProvider implements AuthProvider {
  private config: AzureDevOpsConfig;
  private connectionPromise: Promise<WebApi> | null = null;
  
  constructor(config: AzureDevOpsConfig) {
    this.config = config;
  }
  
  async getConnection(): Promise<WebApi> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.createConnection();
    }
    return this.connectionPromise;
  }
  
  private async createConnection(): Promise<WebApi> {
    try {
      // Azure DevOps resource ID for token scope
      const azureDevOpsResourceId = '499b84ac-1321-427f-aa17-267ca6975798';
      
      // Create credential based on configuration
      const credential = this.createCredential();
      
      // Get token for Azure DevOps
      const token = await credential.getToken(`${azureDevOpsResourceId}/.default`);
      
      if (!token) {
        throw new AzureDevOpsAuthenticationError('Failed to acquire token from Azure Identity');
      }
      
      // Create auth handler with token
      const authHandler = new BearerCredentialHandler(token.token);
      
      // Create WebApi client
      const connection = new WebApi(this.config.organizationUrl, authHandler);
      
      // Test the connection
      await connection.getLocationsApi();
      
      return connection;
    } catch (error) {
      throw new AzureDevOpsAuthenticationError(
        `Failed to authenticate with Azure Identity: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  private createCredential(): TokenCredential {
    if (this.config.azureIdentityOptions?.useAzureCliCredential) {
      return new AzureCliCredential();
    }
    
    // Default to DefaultAzureCredential
    return new DefaultAzureCredential();
  }
  
  async isAuthenticated(): Promise<boolean> {
    try {
      await this.getConnection();
      return true;
    } catch {
      return false;
    }
  }
}
```

### 4. Configuration Updates

Update the configuration interface to support specifying the authentication method:

```typescript
// src/types/config.ts
export interface AzureDevOpsConfig {
  // Existing properties
  organizationUrl: string;
  personalAccessToken?: string;
  defaultProject?: string;
  apiVersion?: string;
  
  // New properties
  authMethod?: AuthMethod;
  azureIdentityOptions?: {
    useAzureCliCredential?: boolean;
    // Other Azure Identity options as needed
  };
}
```

### 5. Environment Variable Updates

Update the environment variable handling in `index.ts`:

```typescript
// src/index.ts
const config: AzureDevOpsConfig = {
  organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
  personalAccessToken: process.env.AZURE_DEVOPS_PAT,
  defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT,
  apiVersion: process.env.AZURE_DEVOPS_API_VERSION,
  authMethod: (process.env.AZURE_DEVOPS_AUTH_METHOD as AuthMethod) || AuthMethod.PAT,
  azureIdentityOptions: {
    useAzureCliCredential: process.env.AZURE_DEVOPS_USE_CLI_CREDENTIAL === 'true'
  }
};
```

### 6. Client Updates

Update the `AzureDevOpsClient` class to use the authentication provider:

```typescript
// src/api/client.ts
export class AzureDevOpsClient {
  private authProvider: AuthProvider;
  
  constructor(config: AzureDevOpsConfig) {
    this.authProvider = createAuthProvider(config);
  }
  
  private async getClient(): Promise<WebApi> {
    return this.authProvider.getConnection();
  }
  
  // Rest of the class remains the same
}
```

## Error Handling

Implement proper error handling for Azure Identity authentication failures:

```typescript
// src/common/errors.ts
export class AzureIdentityAuthenticationError extends AzureDevOpsAuthenticationError {
  constructor(message: string) {
    super(`Azure Identity Authentication Error: ${message}`);
  }
}
```

## Configuration Examples

### PAT Authentication

```env
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-org
AZURE_DEVOPS_PAT=your-pat
AZURE_DEVOPS_AUTH_METHOD=pat
```

### DefaultAzureCredential Authentication

```env
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-org
AZURE_DEVOPS_AUTH_METHOD=azure-identity
# Optional environment variables for specific credential types
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
```

### AzureCliCredential Authentication

```env
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-org
AZURE_DEVOPS_AUTH_METHOD=azure-identity
AZURE_DEVOPS_USE_CLI_CREDENTIAL=true
```

## Testing

Implement tests for the new authentication methods:

1. Unit tests for the authentication providers
2. Integration tests for Azure Identity authentication
3. Tests for fallback behavior

## Documentation Updates

Update the README.md and other documentation to include information about the new authentication methods.

## Conclusion

This implementation approach provides a flexible and extensible way to add Azure Identity authentication support to the Azure DevOps MCP Server. It allows users to choose the authentication method that best suits their environment and needs, while maintaining backward compatibility with the existing PAT authentication method. 