# Azure DevOps MCP Server Tools Documentation

This directory contains documentation for all **77 tools** available in the Azure DevOps MCP server, organized across 13 toolsets.

## Navigation

- [Core Navigation Tools](./core-navigation.md) — Overview of tools for navigating Azure DevOps resources
  - [Users](./user-tools.md) — Authenticated user profile (1 tool)
  - [Organizations](./organizations.md) — Accessible organizations (1 tool)
  - [Projects](./projects.md) — Projects, teams, and process templates (4 tools)
  - [Repositories](./repositories.md) — Git repositories, files, trees, branches, and commits (10 tools)
  - [Work Items](./work-items.md) — Work items, links, comments, revisions, and attachments (11 tools)
  - [Search](./search.md) — Code, wiki, and work item search (3 tools)
  - [Pull Requests](./pull-requests.md) — Pull requests, comments, reviews, votes, checks, and merging (12 tools)
  - [Pipelines](./pipelines.md) — Pipelines, runs, artifacts, timelines, logs, test results, retries, and triggers (10 tools)
  - [Wikis](./wiki.md) — Wikis and wiki pages (6 tools)
  - [Test Plans](./test-plans.md) — Test plans, suites, and test cases (10 tools)
  - **Work (`work`)** — Sprints, iterations, and team settings (4 tools)
  - **Analytics (`analytics`)** — OData v4 schema discovery, guarded queries, and agile metrics (3 tools)
  - **Events (`events`)** — MCP event type discovery and bounded event polling (2 tools)
- [Resource URIs](./resources.md) — Accessing repository content and event streams via `ado://` resource URIs

## Tools by Category

### User Tools (`users`)

- [`get_me`](./user-tools.md#get_me) _(read-only, Services only)_ — Get details of the authenticated user

### Organization Tools (`organizations`)

- [`list_organizations`](./organizations.md#list_organizations) _(read-only, Services only)_ — List all Azure DevOps organizations accessible to the user

### Project Tools (`projects`)

- [`list_projects`](./projects.md#list_projects) _(read-only)_ — List all projects in the organization
- [`get_project`](./projects.md#get_project) _(read-only)_ — Get details of a specific project
- [`get_project_details`](./projects.md#get_project_details) _(read-only)_ — Get comprehensive project details including process, work item types, fields, and teams
- `list_teams` _(read-only)_ — List teams in a project

### Repository Tools (`repositories`)

- [`list_repositories`](./repositories.md#list_repositories) _(read-only)_ — List all repositories in a project
- [`get_repository`](./repositories.md#get_repository) _(read-only)_ — Get details of a specific repository
- [`get_repository_details`](./repositories.md#get_repository_details) _(read-only)_ — Get detailed repository information including statistics and refs
- [`get_file_content`](./repositories.md#get_file_content) _(read-only)_ — Get content of a file or directory from a repository
- [`get_all_repositories_tree`](./repositories.md#get_all_repositories_tree) _(read-only)_ — Display hierarchical file trees across multiple repositories
- [`get_repository_tree`](./repositories.md#get_repository_tree) _(read-only)_ — List files and folders in a repository from any path and depth
- [`create_branch`](./repositories.md#create_branch) _(write)_ — Create a new branch from an existing branch
- [`create_commit`](./repositories.md#create_commit) _(write)_ — Commit file additions, edits, or deletions using unified diffs or search/replace
- [`list_commits`](./repositories.md#list_commits) _(read-only)_ — List recent commits on a branch with diff summaries
- `list_branches` _(read-only)_ — List branches in a repository with ahead/behind and creator metadata

### Work Item Tools (`work-items`)

- [`list_work_items`](./work-items.md#list_work_items) _(read-only)_ — List work items in a project using WIQL or a saved query
- [`get_work_item`](./work-items.md#get_work_item) _(read-only)_ — Retrieve a work item by ID
- [`create_work_item`](./work-items.md#create_work_item) _(write)_ — Create a new work item
- [`update_work_item`](./work-items.md#update_work_item) _(write)_ — Update fields, state, or tags on an existing work item
- [`manage_work_item_link`](./work-items.md#manage_work_item_link) _(write)_ — Add, remove, or update links between work items
- [`get_work_item_comments`](./work-items.md#get_work_item_comments) _(read-only)_ — Retrieve paginated comments on a work item
- `add_work_item_comment` _(write)_ — Add a comment to a work item
- `get_work_item_revisions` _(read-only)_ — Retrieve revision history for a work item
- [`create_work_item_attachment`](./work-items.md#create_work_item_attachment) _(write)_ — Upload and attach a local file to a work item
- [`get_work_item_attachment`](./work-items.md#get_work_item_attachment) _(write)_ — Download an attachment from a work item to a local path
- [`delete_work_item_attachment`](./work-items.md#delete_work_item_attachment) _(write)_ — Remove an attachment link from a work item

### Search Tools (`search`)

- [`search_code`](./search.md#search_code) _(read-only)_ — Search code across repositories
- [`search_wiki`](./search.md#search_wiki) _(read-only)_ — Search wiki page contents
- [`search_work_items`](./search.md#search_work_items) _(read-only)_ — Search work items across projects

### Pull Request Tools (`pull-requests`)

- [`create_pull_request`](./pull-requests.md#create_pull_request) _(write)_ — Create a new pull request
- [`get_pull_request`](./pull-requests.md#get_pull_request) _(read-only)_ — Get a pull request by ID
- [`list_pull_requests`](./pull-requests.md#list_pull_requests) _(read-only)_ — List pull requests in a repository
- [`get_pull_request_comments`](./pull-requests.md#get_pull_request_comments) _(read-only)_ — Get comment threads from a pull request
- [`add_pull_request_comment`](./pull-requests.md#add_pull_request_comment) _(write)_ — Add a comment or new review thread to a pull request
- [`update_pull_request`](./pull-requests.md#update_pull_request) _(write)_ — Update PR metadata, status, draft state, reviewers, work items, and tags
- [`update_pull_request_thread_status`](./pull-requests.md#update_pull_request_thread_status) _(write)_ — Update the status of an existing PR comment thread
- [`get_pull_request_changes`](./pull-requests.md#get_pull_request_changes) _(read-only)_ — List changed files, unified diffs, and policy evaluations
- [`get_pull_request_checks`](./pull-requests.md#get_pull_request_checks) _(read-only)_ — Summarize status checks, policy evaluations, and linked pipelines
- [`merge_pull_request`](./pull-requests.md#merge_pull_request) _(write)_ — Complete (merge) a pull request or manage auto-complete
- `vote_pull_request` _(write)_ — Submit or reset a reviewer vote on a pull request
- `manage_pull_request_reviewers` _(write)_ — Add or remove required/optional reviewers on a pull request

### Pipeline Tools (`pipelines`)

- [`list_pipelines`](./pipelines.md#list_pipelines) _(read-only)_ — List all pipelines in a project
- [`get_pipeline`](./pipelines.md#get_pipeline) _(read-only)_ — Get details of a specific pipeline
- [`list_pipeline_runs`](./pipelines.md#list_pipeline_runs) _(read-only)_ — List recent runs for a pipeline with filters
- [`get_pipeline_run`](./pipelines.md#get_pipeline_run) _(read-only)_ — Get detailed run information and artifact summaries
- [`download_pipeline_artifact`](./pipelines.md#download_pipeline_artifact) _(read-only)_ — Download a single artifact file as text
- [`pipeline_timeline`](./pipelines.md#pipeline_timeline) _(read-only)_ — Retrieve stage and job timeline records for a run
- [`get_pipeline_log`](./pipelines.md#get_pipeline_log) _(read-only)_ — Retrieve log contents in plain or JSON format
- [`trigger_pipeline`](./pipelines.md#trigger_pipeline) _(write)_ — Trigger a pipeline run with customizable parameters
- `get_build_test_results` _(read-only)_ — Retrieve test run summaries and failing test case details for a build
- `retry_pipeline_stage` _(write)_ — Retry a failed or canceled stage in a pipeline build

### Wiki Tools (`wikis`)

- [`get_wikis`](./wiki.md#get_wikis) _(read-only)_ — List all wikis in a project or organization
- [`get_wiki_page`](./wiki.md#get_wiki_page) _(read-only)_ — Get content of a wiki page as plain text
- [`create_wiki`](./wiki.md#create_wiki) _(write)_ — Create a new project wiki or code wiki
- [`update_wiki_page`](./wiki.md#update_wiki_page) _(write)_ — Update the content of an existing wiki page
- [`list_wiki_pages`](./wiki.md#list_wiki_pages) _(read-only)_ — List all pages in a wiki
- [`create_wiki_page`](./wiki.md#create_wiki_page) _(write)_ — Create or update a wiki page

### Test Plans Tools (`test-plans`)

- [`list_test_plans`](./test-plans.md#list_test_plans) _(read-only)_ — List test plans in a project
- [`get_test_plan`](./test-plans.md#get_test_plan) _(read-only)_ — Get details of a test plan by ID
- [`create_test_plan`](./test-plans.md#create_test_plan) _(write)_ — Create a new test plan
- [`list_test_suites`](./test-plans.md#list_test_suites) _(read-only)_ — List test suites in a test plan
- [`get_test_suite`](./test-plans.md#get_test_suite) _(read-only)_ — Get details of a specific test suite
- [`create_test_suite`](./test-plans.md#create_test_suite) _(write)_ — Create a static, requirement-based, or query-based test suite
- [`list_suite_test_cases`](./test-plans.md#list_suite_test_cases) _(read-only)_ — List test cases linked to a suite
- [`add_test_cases_to_suite`](./test-plans.md#add_test_cases_to_suite) _(write)_ — Attach existing Test Case work items to a suite
- [`remove_test_cases_from_suite`](./test-plans.md#remove_test_cases_from_suite) _(write)_ — Remove test cases from a static suite
- [`create_test_case`](./test-plans.md#create_test_case) _(write)_ — Create a Test Case work item with structured steps XML

### Work / Sprint Tools (`work`)

- `list_iterations` _(read-only)_ — List project iteration classification nodes
- `list_team_iterations` _(read-only)_ — List iterations assigned to a team (all, past, current, or future)
- `get_team_settings` _(read-only)_ — Get team backlog, working days, and default iteration settings
- `get_iteration_work_items` _(read-only)_ — List work items assigned to a specific team iteration

### Analytics Tools (`analytics`)

- `get_analytics_schema` _(read-only)_ — Discover OData v4 Analytics entity sets, properties, and navigation properties from `$metadata`
- `query_analytics` _(read-only)_ — Execute guarded OData v4 queries (with `$batch` support and same-origin `@odata.nextLink` paging)
- `get_analytics_metrics` _(read-only)_ — Compute preset agile and CI metrics (`cycle_time`, `lead_time`, `velocity`, `burndown`, `pipeline_pass_rate`, `test_pass_rate`)

### Events Tools (`events`)

- `list_event_types` _(read-only)_ — List supported Azure DevOps MCP event types and schemas
- `poll_events` _(read-only)_ — Poll buffered Azure DevOps events by cursor and optional type filter

## Tool Structure

Each tool documentation section follows a consistent structure:

1. **Description**: Brief explanation of what the tool does
2. **Parameters**: Required and optional parameters with defaults
3. **Response**: Expected response format with examples
4. **Error Handling**: Typed errors and failure modes
5. **Example Usage**: Usage examples

## Examples

Examples of combining multiple tools together can be found in [Core Navigation Tools](./core-navigation.md#common-use-cases).
