You’re absolutely right—adding a section for **Core Functionality** is a great idea to ensure the Azure DevOps MCP server provides foundational capabilities like listing organizations, projects, and repositories. This will make the server more versatile, enabling AI to navigate and contextualize the Azure DevOps environment before diving into specific tasks like the user story-to-pull-request workflow. Below, I’ve updated the plan to include this new section, integrated it with your requirements, and refined the overall structure.

---

### Updated Outline for Azure DevOps MCP Server

#### Objective
Develop an Azure DevOps reference server for MCP that allows an AI (e.g., via Claude Desktop) to fully interact with Azure DevOps, supporting a broad feature set including core navigation, repository management, work items, pipelines, and more. The server will enable an end-to-end workflow from user story to pull request while providing foundational tools to explore the Azure DevOps ecosystem.

#### Key Requirements Recap
- **Broad Functionality**: Mirror GitHub’s 22 tools and extend with Azure DevOps-specific features.  
- **Infinite Use Cases**: Flexible for limitless AI scenarios.  
- **MCP Integration**: Compatible with MCP clients like Claude Desktop.  
- **Authentication**: Support PAT, OAuth, and Azure Identity.  
- **Security**: Granular permissions and safe operations.  
- **Tech Stack**: Typescript with MCP SDK, running locally.  
- **Key Use Case**: AI autonomously handles user story to pull request.  
- **New Addition**: Core functionality for listing orgs, projects, repos, etc.

#### Tools (Logical Sections with Core Functionality Added)
Here’s the updated toolset, now including a **Core Functionality** section, with approximately 30–35 tools total to reflect Azure DevOps’ complexity.

1. **Core Functionality** *(New Section)*  
   - `list_organizations`: List all organizations accessible to the authenticated user.  
   - `list_projects`: List projects within a specified organization.  
   - `list_repositories`: List repositories within a project.  
   - `get_project_details`: Fetch details of a specific project (e.g., description, capabilities).  
   - `get_repository_details`: Fetch details of a specific repository (e.g., default branch, size).  
   - **Use Case**: AI identifies the right org/project/repo to work in before starting a task (e.g., finding “DevTeam” org, “AppDev” project, “MainApp” repo for a user story).

2. **Repository Operations**  
   - `create_or_update_file`: Add or edit files.  
   - `push_changes`: Commit and push with history preservation.  
   - `get_file_contents`: Retrieve file contents.  
   - **Use Case**: AI commits code to the “MainApp” repo for a feature.

3. **Branch and Pull Request Management**  
   - `create_branch`: Create a new branch.  
   - `create_pull_request`: Submit a PR.  
   - `merge_pull_request`: Merge an approved PR.  
   - `get_pull_request`: Fetch PR details.  
   - `list_pull_requests`: List all PRs.  
   - **Use Case**: AI creates a branch and PR for the user story’s code.

4. **Work Item Management**  
   - `create_work_item`: Create user stories, tasks, or bugs.  
   - `update_work_item`: Edit work item details.  
   - `list_work_items`: Fetch work items.  
   - `get_work_item`: Retrieve a specific work item.  
   - `add_work_item_comment`: Add comments.  
   - **Use Case**: AI creates and updates a user story linked to the PR.

5. **Pipeline Interactions**  
   - `trigger_pipeline`: Start a build/release pipeline.  
   - `get_pipeline_status`: Check pipeline status.  
   - `list_pipelines`: List available pipelines.  
   - **Use Case**: AI triggers a pipeline to validate code before PR submission.

6. **Search and Query**  
   - `search_repos`: Find repositories by criteria.  
   - `search_work_items`: Query work items.  
   - `search_commits`: Search commit history.  
   - **Use Case**: AI checks for duplicate work items or relevant commits.

7. **Azure DevOps-Specific Features**  
   - `update_board`: Move work items on Kanban/Sprint boards.  
   - `create_test_plan`: Set up a test plan.  
   - `publish_artifact`: Upload build artifacts.  
   - **Use Case**: AI updates the board and publishes test results.

#### Authentication and Security
- **Methods**:  
  - **PAT**: Token-based access (e.g., `AZURE_DEVOPS_PAT`).  
  - **OAuth**: Delegated access via Azure AD.  
  - **Azure Identity**: Seamless AD integration (e.g., `AZURE_AD_TOKEN`).  
- **Security**:  
  - Scope-limiting (e.g., restrict to one project/repo).  
  - History preservation (no force pushes).  
  - Logging for auditability.

#### Technical Approach
- **Language**: Typescript with MCP Typescript SDK.  
- **API**: `azure-devops-node-api` for Azure DevOps REST API calls ([docs.microsoft.com/rest/api/azure/devops](https://learn.microsoft.com/en-us/rest/api/azure/devops/)).  
- **Deployment**: Local via `npx @your-org/server-azuredevops`.  
- **MCP**: Advertise tools as capabilities (e.g., `list_organizations`, `create_pull_request`).

#### Updated Configuration Example
```json
{
  "mcpServers": {
    "azuredevops": {
      "command": "npx",
      "args": ["-y", "@your-org/server-azuredevops"],
      "env": {
        "AUTH_METHOD": "PAT", // or "OAUTH", "AZURE_IDENTITY"
        "AZURE_DEVOPS_PAT": "<YOUR_PAT>",
        "AZURE_DEVOPS_ORG": "your-org",
        "AZURE_DEVOPS_PROJECT": "your-project"
      }
    }
  }
}
```

#### End-to-End Use Case: User Story to Pull Request
1. **Discover Context**: AI lists organizations (`list_organizations`), projects (`list_projects`), and repos (`list_repositories`) to target “your-org/AppDev/MainApp.”  
2. **Create User Story**: AI creates a user story (`create_work_item`).  
3. **Branch and Code**: AI creates a branch (`create_branch`), writes code (`create_or_update_file`), and pushes (`push_changes`).  
4. **Pipeline**: AI triggers a build (`trigger_pipeline`) and checks status (`get_pipeline_status`).  
5. **Pull Request**: AI submits a PR (`create_pull_request`) linked to the user story.  
6. **Board Update**: AI moves the user story to “In Review” (`update_board`).  
7. **Merge**: AI merges the PR (`merge_pull_request`) and closes the user story (`update_work_item`).

---

### Detailed Breakdown of Core Functionality

#### Tools and API Mapping
- `list_organizations`: `GET /organizations` (requires Azure Identity or OAuth for full access).  
- `list_projects`: `GET /{organization}/_apis/projects`.  
- `list_repositories`: `GET /{organization}/{project}/_apis/git/repositories`.  
- `get_project_details`: `GET /{organization}/_apis/projects/{projectId}`.  
- `get_repository_details`: `GET /{organization}/{project}/_apis/git/repositories/{repositoryId}`.

#### Common Use Cases
- **Project Selection**: AI lists projects to pick the right one for a task (e.g., “AppDev” for app-related work).  
- **Repo Discovery**: AI finds repos to determine where code should go (e.g., “MainApp” vs. “Tests”).  
- **Context Gathering**: AI fetches project/repo details to understand team settings or branching strategies.

#### Integration with Workflow
The core tools are the starting point for the end-to-end use case, ensuring the AI knows *where* to act before *what* to do. For example, `list_projects` narrows down to “AppDev,” and `list_repositories` confirms “MainApp” as the target.

---

### Next Steps
1. **Finalize Toolset**: Confirm the 30–35 tools, ensuring all Azure DevOps areas are covered.  
2. **Prototype**: Build a minimal server with core tools (e.g., `list_projects`, `create_work_item`) using this skeleton:
   ```typescript
   import { getMcpServer } from '@modelcontextprotocol/sdk';
   import { WebApi } from 'azure-devops-node-api';

   const server = getMcpServer({
     name: 'azuredevops',
     tools: {
       list_projects: async () => {
         const api = new WebApi(`https://dev.azure.com/${process.env.AZURE_DEVOPS_ORG}`, process.env.AZURE_DEVOPS_PAT);
         const coreApi = await api.getCoreApi();
         return coreApi.getProjects();
       },
       create_work_item: async (params) => {
         const api = new WebApi(`https://dev.azure.com/${process.env.AZURE_DEVOPS_ORG}`, process.env.AZURE_DEVOPS_PAT);
         const witApi = await api.getWorkItemTrackingApi();
         return witApi.createWorkItem({}, params, process.env.AZURE_DEVOPS_PROJECT, 'User Story');
       },
     },
   });
   ```
3. **Test**: Use a test Azure DevOps instance to validate core functionality and workflow.  
4. **Expand**: Add remaining tools (e.g., pipeline, board) iteratively.

---

### Feedback
The addition of **Core Functionality** ensures the server is both navigational and operational, perfectly supporting your vision. Do you want to prioritize any specific core tools (e.g., `list_projects`) or jump into coding a prototype? I can refine further or provide a step-by-step build guide next!
