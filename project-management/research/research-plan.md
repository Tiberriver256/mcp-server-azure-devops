Below is a detailed research plan designed to help you gather the essential knowledge and resources needed to build an Azure DevOps MCP (Model Context Protocol) server. To keep you from getting stuck in endless research, I’ve limited the plan to 7 concise, actionable tasks that can be completed efficiently—estimated at 1–2 hours each, totaling 7–14 hours. Each task builds toward your goal of creating a functional server while ensuring you cover the key areas: MCP protocol, Azure DevOps APIs, authentication, tools, and security.

---

## Research Plan: Building an Azure DevOps MCP Server

### Objective

Gather the necessary knowledge and resources to design and implement an Azure DevOps reference server for the Model Context Protocol (MCP), focusing on core functionality, repository operations, work items, pipelines, and security.

### Research Tasks (7 Total)

These tasks are structured to be completed sequentially, providing a clear path from understanding the basics to validating your approach.

#### 1. Understand the MCP Protocol and SDK

- **Goal**: Learn how MCP servers function and integrate with clients like Claude Desktop.
- **Actions**:
  - Read the [MCP Introduction](https://modelcontextprotocol.io/introduction) to understand its purpose and architecture.
  - Review the [Typescript MCP SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk) for guidance on building and advertising tools.
  - Examine the GitHub server’s code in [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) for a practical example.
- **Outcome**: A solid grasp of MCP’s client-server model and initial ideas for structuring your server.

#### 2. Explore Azure DevOps REST APIs

- **Goal**: Identify the key APIs for core functionality, repositories, work items, and pipelines.
- **Actions**:
  - Study the [Azure DevOps REST API overview](https://learn.microsoft.com/en-us/rest/api/azure/devops/?view=azure-devops-rest-7.1).
  - Focus on these endpoints:
    - **Core**: Organizations, projects, repositories (`GET /projects`).
    - **Git**: Repositories, commits, pull requests (`GET /git/repositories`).
    - **Work Items**: Creating and listing work items (`POST /wit/workitems`).
    - **Pipelines**: Triggering pipelines (`POST /build/builds`).
  - Note rate limits and pagination details.
- **Outcome**: A list of API endpoints tied to specific server tools (e.g., `list_projects`).

#### 3. Investigate Authentication Methods

- **Goal**: Determine how to securely authenticate with Azure DevOps APIs.
- **Actions**:
  - Read the [Azure DevOps authentication guidance](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/authentication-guidance?view=azure-devops).
  - Explore:
    - **Personal Access Tokens (PAT)**: Generating and scoping tokens.
    - **OAuth**: Registering an app in Azure AD for delegated access.
    - **Azure Identity**: Using managed identities or service principals.
  - Check `azure-devops-node-api` for authentication examples.
- **Outcome**: A chosen initial auth method (e.g., PAT) with notes for future expansion.

#### 4. Study the `azure-devops-node-api` Library

- **Goal**: Understand how to use this Typescript library to interact with Azure DevOps APIs.
- **Actions**:
  - Visit the [library’s GitHub page](https://github.com/microsoft/azure-devops-node-api).
  - Review examples of authenticated API calls (e.g., listing projects, creating work items).
  - Identify any gaps or limitations in the library.
- **Outcome**: Ability to use the library as the foundation for your server’s API interactions.

#### 5. Analyze the GitHub MCP Server for Patterns

- **Goal**: Learn best practices from an existing MCP server implementation.
- **Actions**:
  - Study the [GitHub server source code](https://github.com/modelcontextprotocol/servers/tree/main/src/github).
  - Focus on:
    - Tool definition and advertisement.
    - Error handling and history preservation.
    - Configuration via environment variables.
- **Outcome**: A template for organizing your server’s tools and setup.

#### 6. Research Security Best Practices

- **Goal**: Ensure your server handles permissions and operations securely.
- **Actions**:
  - Review [security in Azure DevOps integrations](https://learn.microsoft.com/en-us/azure/devops/organizations/security/about-security-identity?view=azure-devops).
  - Investigate:
    - Scoping PATs to minimal permissions.
    - Storing secrets securely (e.g., environment variables).
    - Adding retry logic for API rate limits.
- **Outcome**: A checklist of security practices to implement during development.

#### 7. Validate Use Case Feasibility

- **Goal**: Confirm that a sample use case (e.g., user story to pull request) works with your tools.
- **Actions**:
  - Map the use case steps to specific tools and APIs (e.g., create work item → `POST /wit/workitems`, link to PR → `PATCH /git/pullrequests`).
  - Identify gaps or additional tools needed.
  - Consider edge cases like pipeline failures or PR conflicts.
- **Outcome**: A refined tool list and a simple workflow diagram.

---

### Plan Summary

- **Tasks**: 7 targeted research steps.
- **Time Estimate**: 1–2 hours per task, totaling 7–14 hours.
- **Next Steps**: Once these tasks are complete, you’ll have the knowledge to start prototyping the server, beginning with core functionality and expanding from there.

This plan keeps research focused and efficient, giving you a strong foundation to build your Azure DevOps MCP server without getting lost in the weeds. If you’d like to tweak any tasks or add specific areas of focus, just let me know!
