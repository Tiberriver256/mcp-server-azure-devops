# Authentication Guide for Azure DevOps MCP Server

This guide provides detailed information about the authentication methods supported by the Azure DevOps MCP Server, including setup instructions, configuration examples, and troubleshooting tips.

## Supported Authentication Methods

The Azure DevOps MCP Server supports three authentication methods:

1. **Personal Access Token (PAT)** - Simple token-based authentication
2. **Azure Identity (DefaultAzureCredential)** - Flexible authentication using the Azure Identity SDK
3. **Azure CLI** - Authentication using your Azure CLI login

## Method 1: Personal Access Token (PAT) Authentication

PAT authentication is the simplest method and works well for personal use or testing.

### Setup Instructions

1. **Generate a PAT in Azure DevOps**:
   - Go to https://dev.azure.com/{your-organization}/_usersSettings/tokens
   - Or click on your profile picture > Personal access tokens
   - Select "+ New Token"
   - Name your token (e.g., "MCP Server Access")
   - Set an expiration date
   - Select the following scopes:
     - **Code**: Read & Write
     - **Work Items**: Read & Write
     - **Build**: Read & Execute
     - **Project and Team**: Read
     - **Graph**: Read
     - **Release**: Read & Execute
   - Click "Create" and copy the generated token

2. **Configure your `.env` file**:
   ```
   AZURE_DEVOPS_AUTH_METHOD=pat
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_PAT=your-personal-access-token
   AZURE_DEVOPS_DEFAULT_PROJECT=your-default-project
   ```

### Security Considerations

- PATs have an expiration date and will need to be renewed
- Store your PAT securely and never commit it to source control
- Consider using environment variables or a secrets manager in production
- Scope your PAT to only the permissions needed for your use case

## Method 2: Azure Identity Authentication (DefaultAzureCredential)

Azure Identity authentication uses the `DefaultAzureCredential` class from the `@azure/identity` package, which provides a simplified authentication experience by trying multiple credential types in sequence.

### How DefaultAzureCredential Works

`DefaultAzureCredential` tries the following credential types in order:

1. Environment variables (EnvironmentCredential)
2. Managed Identity (ManagedIdentityCredential)
3. Azure CLI (AzureCliCredential)
4. Visual Studio Code (VisualStudioCodeCredential)
5. Azure PowerShell (AzurePowerShellCredential)
6. Interactive Browser (InteractiveBrowserCredential) - optional, disabled by default

This makes it ideal for applications that need to work in different environments (local development, Azure-hosted) without code changes.

### Setup Instructions

1. **Install the Azure Identity SDK**:
   The SDK is already included as a dependency in the Azure DevOps MCP Server.

2. **Configure your `.env` file**:
   ```
   AZURE_DEVOPS_AUTH_METHOD=azure-identity
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_DEFAULT_PROJECT=your-default-project
   ```

3. **Set up credentials based on your environment**:

   a. **For service principals (client credentials)**:
      ```
      AZURE_TENANT_ID=your-tenant-id
      AZURE_CLIENT_ID=your-client-id
      AZURE_CLIENT_SECRET=your-client-secret
      ```

   b. **For managed identities in Azure**:
      No additional configuration needed if running in Azure with a managed identity.

   c. **For local development**:
      - Log in with Azure CLI: `az login`
      - Or use Visual Studio Code Azure Account extension

### Security Considerations

- Use managed identities in Azure for improved security
- For service principals, rotate client secrets regularly
- Store credentials securely using Azure Key Vault or environment variables
- Apply the principle of least privilege when assigning roles

## Method 3: Azure CLI Authentication

Azure CLI authentication uses the `AzureCliCredential` class from the `@azure/identity` package, which authenticates using the Azure CLI's logged-in account.

### Setup Instructions

1. **Install the Azure CLI**:
   - Follow the instructions at https://docs.microsoft.com/cli/azure/install-azure-cli

2. **Log in to Azure**:
   ```bash
   az login
   ```

3. **Configure your `.env` file**:
   ```
   AZURE_DEVOPS_AUTH_METHOD=azure-cli
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_DEFAULT_PROJECT=your-default-project
   ```

### Security Considerations

- Azure CLI authentication is best for local development
- Ensure your Azure CLI session is kept secure
- Log out when not in use: `az logout`

## Configuration Reference

| Environment Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `AZURE_DEVOPS_AUTH_METHOD` | Authentication method (`pat`, `azure-identity`, or `azure-cli`) | No | `azure-identity` |
| `AZURE_DEVOPS_ORG_URL` | Full URL to your Azure DevOps organization | Yes | - |
| `AZURE_DEVOPS_PAT` | Personal Access Token (for PAT auth) | Only with PAT auth | - |
| `AZURE_DEVOPS_DEFAULT_PROJECT` | Default project if none specified | No | - |
| `AZURE_DEVOPS_API_VERSION` | API version to use | No | Latest |
| `AZURE_TENANT_ID` | Azure AD tenant ID (for service principals) | Only with service principals | - |
| `AZURE_CLIENT_ID` | Azure AD application ID (for service principals) | Only with service principals | - |
| `AZURE_CLIENT_SECRET` | Azure AD client secret (for service principals) | Only with service principals | - |

## Troubleshooting Authentication Issues

### PAT Authentication Issues

1. **Invalid PAT**: Ensure your PAT hasn't expired and has the required scopes
   - Error: `TF400813: The user 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' is not authorized to access this resource.`
   - Solution: Generate a new PAT with the correct scopes

2. **Scope issues**: If receiving 403 errors, check if your PAT has the necessary permissions
   - Error: `TF401027: You need the Git 'Read' permission to perform this action.`
   - Solution: Update your PAT with the required scopes

3. **Organization access**: Verify your PAT has access to the organization specified in the URL
   - Error: `TF400813: Resource not found for anonymous request.`
   - Solution: Ensure your PAT has access to the specified organization

### Azure Identity Authentication Issues

1. **Missing credentials**: Ensure you have the necessary credentials configured
   - Error: `CredentialUnavailableError: DefaultAzureCredential failed to retrieve a token`
   - Solution: Check that you're logged in with Azure CLI or have environment variables set

2. **Permission issues**: Verify your identity has the necessary permissions
   - Error: `AuthorizationFailed: The client does not have authorization to perform action`
   - Solution: Assign the appropriate roles to your identity

3. **Token acquisition errors**: Check network connectivity and Azure AD endpoint availability
   - Error: `ClientAuthError: Interaction required`
   - Solution: Check network connectivity or use a different credential type

### Azure CLI Authentication Issues

1. **CLI not installed**: Ensure Azure CLI is installed and in your PATH
   - Error: `AzureCliCredential authentication failed: Azure CLI not found`
   - Solution: Install Azure CLI

2. **Not logged in**: Verify you're logged in to Azure CLI
   - Error: `AzureCliCredential authentication failed: Please run 'az login'`
   - Solution: Run `az login`

3. **Permission issues**: Check if your Azure CLI account has access to Azure DevOps
   - Error: `TF400813: The user is not authorized to access this resource`
   - Solution: Log in with an account that has access to Azure DevOps

## Best Practices

1. **Choose the right authentication method for your environment**:
   - For local development: Azure CLI or PAT
   - For CI/CD pipelines: PAT or service principal
   - For Azure-hosted applications: Managed Identity

2. **Follow the principle of least privilege**:
   - Only grant the permissions needed for your use case
   - Regularly review and rotate credentials

3. **Secure your credentials**:
   - Use environment variables or a secrets manager
   - Never commit credentials to source control
   - Set appropriate expiration dates for PATs

4. **Monitor and audit authentication**:
   - Review Azure DevOps access logs
   - Set up alerts for suspicious activity

## Examples

### Example 1: Local Development with PAT

```bash
# .env file
AZURE_DEVOPS_AUTH_METHOD=pat
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/mycompany
AZURE_DEVOPS_PAT=abcdefghijklmnopqrstuvwxyz0123456789
AZURE_DEVOPS_DEFAULT_PROJECT=MyProject
```

### Example 2: Azure-hosted Application with Managed Identity

```bash
# .env file
AZURE_DEVOPS_AUTH_METHOD=azure-identity
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/mycompany
AZURE_DEVOPS_DEFAULT_PROJECT=MyProject
```

### Example 3: CI/CD Pipeline with Service Principal

```bash
# .env file
AZURE_DEVOPS_AUTH_METHOD=azure-identity
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/mycompany
AZURE_DEVOPS_DEFAULT_PROJECT=MyProject
AZURE_TENANT_ID=00000000-0000-0000-0000-000000000000
AZURE_CLIENT_ID=11111111-1111-1111-1111-111111111111
AZURE_CLIENT_SECRET=your-client-secret
```

### Example 4: Local Development with Azure CLI

```bash
# .env file
AZURE_DEVOPS_AUTH_METHOD=azure-cli
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/mycompany
AZURE_DEVOPS_DEFAULT_PROJECT=MyProject
``` 