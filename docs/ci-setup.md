# CI Environment Setup for Integration Tests

This document explains how to set up the CI environment to run integration tests with Azure DevOps.

## GitHub Secrets Configuration

To run integration tests in the CI environment, you need to configure the following GitHub Secrets:

1. **AZURE_DEVOPS_ORG_URL**: The URL of your Azure DevOps organization (e.g., `https://dev.azure.com/your-organization`)
2. **AZURE_DEVOPS_PAT**: A Personal Access Token with appropriate permissions
3. **AZURE_DEVOPS_DEFAULT_PROJECT** (optional): The default project to use for tests

### Setting up GitHub Secrets

1. Go to your GitHub repository
2. Click on "Settings" > "Secrets and variables" > "Actions"
3. Click on "New repository secret"
4. Add each of the required secrets:

#### AZURE_DEVOPS_ORG_URL
- Name: `AZURE_DEVOPS_ORG_URL`
- Value: `https://dev.azure.com/your-organization`

#### AZURE_DEVOPS_PAT
- Name: `AZURE_DEVOPS_PAT`
- Value: Your Personal Access Token

#### AZURE_DEVOPS_DEFAULT_PROJECT (optional)
- Name: `AZURE_DEVOPS_DEFAULT_PROJECT`
- Value: Your project name

## Personal Access Token (PAT) Requirements

The PAT used for integration tests should have the following permissions:

- **Code**: Read & Write
- **Work Items**: Read & Write
- **Build**: Read & Execute
- **Project and Team**: Read
- **Graph**: Read
- **Release**: Read & Execute

## Security Considerations

- Use a dedicated Azure DevOps organization or project for testing
- Create a PAT with the minimum required permissions
- Consider setting an expiration date for the PAT
- Regularly rotate the PAT used in GitHub Secrets

## Troubleshooting

If integration tests fail in CI:

1. Check the GitHub Actions logs for detailed error messages
2. Verify that the PAT has not expired
3. Ensure the PAT has the required permissions
4. Confirm that the organization URL is correct
5. Check if the default project exists and is accessible with the provided PAT 