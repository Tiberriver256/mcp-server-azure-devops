# Azure Identity Authentication for Azure DevOps MCP Server

This guide explains how to use Azure Identity authentication with the Azure DevOps MCP Server.

## Overview

Azure Identity authentication lets you use your existing Azure credentials to authenticate with Azure DevOps, instead of creating and managing Personal Access Tokens (PATs). This approach offers several benefits:

- **Unified authentication**: Use the same credentials for Azure and Azure DevOps
- **Enhanced security**: Support for managed identities and client certificates
- **Flexible credential types**: Multiple options for different environments
- **Automatic token management**: Handles token acquisition and renewal

## Credential Types

The Azure DevOps MCP Server supports multiple credential types through the Azure Identity SDK:

### DefaultAzureCredential

This credential type attempts multiple authentication methods in sequence until one succeeds:

1. Environment variables (EnvironmentCredential)
2. Managed Identity (ManagedIdentityCredential)
3. Azure CLI (AzureCliCredential)
4. Visual Studio Code (VisualStudioCodeCredential)
5. Azure PowerShell (AzurePowerShellCredential)

It's a great option for applications that need to work across different environments without code changes.

### AzureCliCredential

This credential type uses your Azure CLI login. It's perfect for local development when you're already using the Azure CLI.

## Configuration

### Environment Variables

To use Azure Identity authentication, set the following environment variables:

```bash
# Required
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
AZURE_DEVOPS_AUTH_METHOD=azure-identity

# Optional
AZURE_DEVOPS_DEFAULT_PROJECT=your-project-name
```

For service principal authentication, add these environment variables:

```bash
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
```

### Use with Claude Desktop/Cursor AI

Add the following to your configuration file:

```json
{
  "mcpServers": {
    "azureDevOps": {
      "command": "npx",
      "args": ["-y", "@tiberriver256/mcp-server-azure-devops"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/your-organization",
        "AZURE_DEVOPS_AUTH_METHOD": "azure-identity",
        "AZURE_DEVOPS_DEFAULT_PROJECT": "your-project-name"
      }
    }
  }
}
```

## Authentication Methods

### Method 1: Using Azure CLI

1. Install the Azure CLI from [here](https://docs.microsoft.com/cli/azure/install-azure-cli)
2. Log in to Azure:
   ```bash
   az login
   ```
3. Set up your environment variables:
   ```bash
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_AUTH_METHOD=azure-identity
   ```

### Method 2: Using Service Principal

1. Create a service principal in Azure AD:
   ```bash
   az ad sp create-for-rbac --name "MyAzureDevOpsApp"
   ```
2. Grant the service principal access to your Azure DevOps organization
3. Set up your environment variables:
   ```bash
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_AUTH_METHOD=azure-identity
   AZURE_TENANT_ID=your-tenant-id
   AZURE_CLIENT_ID=your-client-id
   AZURE_CLIENT_SECRET=your-client-secret
   ```

### Method 3: Using Managed Identity (for Azure-hosted applications)

1. Enable managed identity for your Azure resource (VM, App Service, etc.)
2. Grant the managed identity access to your Azure DevOps organization
3. Set up your environment variables:
   ```bash
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_AUTH_METHOD=azure-identity
   ```

## Troubleshooting

### Common Issues

#### Failed to acquire token

```
Error: Failed to authenticate with Azure Identity: CredentialUnavailableError: DefaultAzureCredential failed to retrieve a token
```

**Possible solutions:**
- Ensure you're logged in with `az login`
- Check if your managed identity is correctly configured
- Verify that service principal credentials are correct

#### Permission issues

```
Error: Failed to authenticate with Azure Identity: AuthorizationFailed: The client does not have authorization to perform action
```

**Possible solutions:**
- Ensure your identity has the necessary permissions in Azure DevOps
- Check if you need to add your identity to specific Azure DevOps project(s)

#### Network issues

```
Error: Failed to authenticate with Azure Identity: ClientAuthError: Interaction required
```

**Possible solutions:**
- Check your network connectivity
- Verify that your firewall allows connections to Azure services

## Best Practices

1. **Choose the right credential type for your environment**:
   - For local development: Azure CLI credential
   - For CI/CD pipelines: Service principal
   - For Azure-hosted applications: Managed identity

2. **Follow the principle of least privilege**:
   - Only grant the permissions needed for your use case
   - Regularly audit and review permissions

3. **Rotate credentials regularly**:
   - For service principals, rotate client secrets periodically
   - Use certificate-based authentication when possible for enhanced security

## Examples

### Basic configuration with Azure CLI

```bash
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/mycompany
AZURE_DEVOPS_AUTH_METHOD=azure-identity
AZURE_DEVOPS_DEFAULT_PROJECT=MyProject
```

### Service principal authentication

```bash
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/mycompany
AZURE_DEVOPS_AUTH_METHOD=azure-identity
AZURE_DEVOPS_DEFAULT_PROJECT=MyProject
AZURE_TENANT_ID=00000000-0000-0000-0000-000000000000
AZURE_CLIENT_ID=11111111-1111-1111-1111-111111111111
AZURE_CLIENT_SECRET=your-client-secret
```
