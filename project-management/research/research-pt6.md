Below is the updated version of the **Search and Query** section from Task #2, incorporating your changes—renaming "search repositories" to "search code" and replacing "search commits" with "search wiki." These adjustments refine the focus to align with the capabilities of the [Azure DevOps Search REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/search/?view=azure-devops-rest-7.1) while keeping the rest of the research intact. I’ve also updated the tool names and descriptions to reflect these changes, ensuring clarity for your MCP server design.

---

### Updated Survey Note: Task #2 – Explore Azure DevOps REST APIs (Revised Search and Query Section)

This note reflects the completion of Task #2, with the **Search and Query** section revised based on your feedback. The rest of the sections (Core Functionality, Repository Operations, Work Item Management, Pipeline Interactions, and Azure DevOps-Specific Features) remain unchanged from my previous response, as they are unaffected by this update.

#### Introduction to Azure DevOps REST APIs

The Azure DevOps REST APIs, documented at [Azure DevOps REST API | Microsoft Learn](https://learn.microsoft.com/en-us/rest/api/azure/devops/?view=azure-devops-rest-7.1), provide a comprehensive interface for interacting with Azure DevOps services. This research identifies key endpoints for an MCP server, with the [Search REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/search/?view=azure-devops-rest-7.1) powering the **Search and Query** section as of February 27, 2025.

#### Core Functionality

- **Listing Organizations**: `GET https://app.vssps.visualstudio.com/_apis/accounts`
- **Listing Projects**: `GET https://dev.azure.com/{organization}/_apis/Projects`
- **Listing Repositories**: `GET https://dev.azure.com/{organization}/{project}/_apis/Git/Repositories`
- **Getting Project Details**: `GET https://dev.azure.com/{organization}/_apis/Projects/{projectId}`
- **Getting Repository Details**: `GET https://dev.azure.com/{organization}/{project}/_apis/Git/Repositories/{repositoryId}`

#### Repository Operations

- **Create or Update File**: `PUT https://dev.azure.com/{organization}/{project}/_apis/Git/Repositories/{repositoryId}/Files/{path}` (auto-commits)
- **Push Changes**: `POST https://dev.azure.com/{organization}/{project}/_apis/Git/Repositories/{repositoryId}/Commits`
- **Get File Contents**: `GET https://dev.azure.com/{organization}/{project}/_apis/Git/Repositories/{repositoryId}/Files/{path}`

#### Work Item Management

- **Create Work Item**: `POST https://dev.azure.com/{organization}/{project}/_apis/Wit/WorkItems`
- **Update Work Item**: `PATCH https://dev.azure.com/{organization}/{project}/_apis/Wit/WorkItems/{id}`
- **List Work Items**: `GET https://dev.azure.com/{organization}/{project}/_apis/Wit/WorkItems`
- **Get Work Item**: `GET https://dev.azure.com/{organization}/{project}/_apis/Wit/WorkItems/{id}`
- **Add Work Item Comment**: `POST https://dev.azure.com/{organization}/{project}/_apis/Wit/WorkItems/{id}/comments`

#### Pipeline Interactions

- **Trigger Pipeline**: `POST https://dev.azure.com/{organization}/{project}/_apis/Build/Builds`
- **Get Pipeline Status**: `GET https://dev.azure.com/{organization}/{project}/_apis/Build/Builds/{buildId}`
- **List Pipelines**: `GET https://dev.azure.com/{organization}/{project}/_apis/Build/Definitions`

#### Search and Query (Revised with New Tool Names)

The Azure DevOps Search REST API provides specialized endpoints for searching across Azure DevOps entities, making it the ideal choice for the **Search and Query** section of your MCP server. Based on your feedback, "search repositories" is renamed to "search code" for clarity, and "search commits" is replaced with "search wiki" to leverage Azure DevOps’ wiki search capabilities. The revised tools and endpoints are:

- **Search Code**: The endpoint `POST https://almsearch.dev.azure.com/{organization}/{project}/_apis/search/codesearchresults` searches code and repository metadata across a project.

  - **Request Body**: Includes `searchText` (e.g., “login function”), `filters` (e.g., `RepositoryFilters:MainApp`, `ProjectFilters:AppDev`), and `$top` for pagination.
  - **Use**: AI locates specific code snippets or files (e.g., “login.js” in the “MainApp” repo) to inform development tasks.
  - **Rationale**: Renaming from "search repositories" emphasizes the focus on code content rather than just repository listings, aligning with the API’s strength in code-level search.

- **Search Work Items**: The endpoint `POST https://almsearch.dev.azure.com/{organization}/{project}/_apis/search/workitemsearchresults` searches work items based on text and filters.

  - **Request Body**: Includes `searchText` (e.g., “login feature”), `filters` (e.g., `WorkItemType:User Story`), and `$top`.
  - **Use**: AI finds related work items (e.g., existing user stories about “login”) to avoid duplication or provide context.

- **Search Wiki**: The endpoint `POST https://almsearch.dev.azure.com/{organization}/{project}/_apis/search/wikisearchresults` searches wiki content within a project.
  - **Request Body**: Includes `searchText` (e.g., “authentication setup”), `filters` (e.g., `WikiFilters:ProjectWiki`), and `$top`.
  - **Use**: AI retrieves wiki documentation (e.g., setup guides or standards) to guide code generation or task planning.
  - **Rationale**: Replacing "search commits" with "search wiki" taps into Azure DevOps’ wiki feature, offering valuable knowledge for AI-driven workflows instead of commit-specific searches.

**Additional Notes**:

- Pagination is managed with `$top` (up to 1000 results) and `$skip`, requiring server-side handling for large result sets.
- Permissions like “Read” access to repos, work items, and wikis are required, scoped via authentication settings.
- The Search API’s POST-based approach with JSON payloads offers richer filtering than GET-based alternatives, enhancing flexibility.

#### Azure DevOps-Specific Features

- **Update Board**: `PATCH https://dev.azure.com/{organization}/{project}/_apis/Wit/WorkItems/{id}` (via field updates)
- **Create Test Plan**: `POST https://dev.azure.com/{organization}/{project}/_apis/test/Plans`
- **Publish Artifact**: Indirect via `POST https://dev.azure.com/{organization}/{project}/_apis/Build/Builds`

#### Technical Considerations

- **Pagination**: `$top` and `$skip` for Search API; similar for other endpoints.
- **Rate Limits**: Subscription-based, needing retry logic for 429 errors.
- **Error Handling**: Critical for operations like code updates or pipeline triggers.

#### Conclusion

The Azure DevOps REST APIs, with the Search REST API powering **Search and Query**, provide a strong foundation for your MCP server. The revised tools—`search_code`, `search_work_items`, and `search_wiki`—leverage the Search API’s capabilities, offering precise and efficient searches across code, work items, and wikis. This update enhances the server’s ability to support AI-driven workflows, maintaining alignment with your end-to-end use case from user story to pull request.

#### Key Citations

- [Azure DevOps REST API Documentation](https://learn.microsoft.com/en-us/rest/api/azure/devops/?view=azure-devops-rest-7.1)
- [Azure DevOps Search REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/search/?view=azure-devops-rest-7.1)

---

### Impact on Your MCP Server

- **Tool Renaming**:
  - `search_code` (formerly `search_repos`) focuses on finding code snippets or files, not just listing repos (covered by `list_repositories` in Core Functionality).
  - `search_wiki` (replacing `search_commits`) shifts the focus to wiki content, providing AI with documentation access instead of commit history (still accessible via `GET /Commits` if needed later).
- **Implementation**: These tools use POST requests with JSON bodies, requiring a slightly different approach in Typescript compared to GET-based endpoints, but they offer richer search capabilities.

This refinement keeps your server aligned with Azure DevOps’ strengths. Shall I proceed with another research task (e.g., Task #1 or #3), or would you like me to draft a sample implementation for these Search tools using the MCP SDK?
