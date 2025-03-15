# Authentication Examples

This directory contains example `.env` files for different authentication methods supported by the Azure DevOps MCP Server.

## Available Examples

1. **[pat-authentication.env](./pat-authentication.env)** - Example configuration for Personal Access Token (PAT) authentication
2. **[azure-identity-authentication.env](./azure-identity-authentication.env)** - Example configuration for Azure Identity (DefaultAzureCredential) authentication
3. **[azure-cli-authentication.env](./azure-cli-authentication.env)** - Example configuration for Azure CLI authentication

## How to Use These Examples

1. Choose the authentication method that best suits your needs
2. Copy the corresponding example file to the root of your project as `.env`
3. Replace the placeholder values with your actual values
4. Start the Azure DevOps MCP Server

For example:

```bash
# Copy the PAT authentication example
cp docs/examples/pat-authentication.env .env

# Edit the .env file with your values
nano .env

# Start the server
npm start
```

## Additional Resources

For more detailed information about authentication methods, setup instructions, and troubleshooting, refer to the [Authentication Guide](../authentication.md). 