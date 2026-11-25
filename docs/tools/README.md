# Azure DevOps MCP Server Tools Documentation

This directory contains documentation for all **60 tools** available in the Azure DevOps MCP server, organized across 10 toolsets.

## Navigation

- [Core Navigation Tools](./core-navigation.md) — Overview of tools for navigating Azure DevOps resources
  - [Users](./user-tools.md) — Authenticated user profile (1 tool)
  - [Organizations](./organizations.md) — Accessible organizations (1 tool)
  - [Projects](./projects.md) — Projects, teams, and process templates (3 tools)
  - [Repositories](./repositories.md) — Git repositories, files, trees, branches, and commits (9 tools)
  - [Work Items](./work-items.md) — Work items, links, comments, and attachments (9 tools)
  - [Search](./search.md) — Code, wiki, and work item search (3 tools)
  - [Pull Requests](./pull-requests.md) — Pull requests, comments, reviews, checks, and merging (10 tools)
  - [Pipelines](./pipelines.md) — Pipelines, runs, artifacts, timelines, logs, and triggers (8 tools)
  - [Wikis](./wiki.md) — Wikis and wiki pages (6 tools)
  - [Test Plans](./test-plans.md) — Test plans, suites, and test cases (10 tools)
- [Resource URIs](./resources.md) — Accessing repository content via `ado://` resource URIs

## Tools by Category

### User Tools (`users`)

- [`get_me`](./user-tools.md#get_me) *(read-only, Services only)* — Get details of the authenticated user

### Organization Tools (`organizations`)

- [`list_organizations`](./organizations.md#list_organizations) *(read-only, Services only)* — List all Azure DevOps organizations accessible to the user

### Project Tools (`projects`)

- [`list_projects`](./projects.md#list_projects) *(read-only)* — List all projects in the organization
- [`get_project`](./projects.md#get_project) *(read-only)* — Get details of a specific project
- [`get_project_details`](./projects.md#get_project_details) *(read-only)* — Get comprehensive project details including process, work item types, fields, and teams

### Repository Tools (`repositories`)

- [`list_repositories`](./repositories.md#list_repositories) *(read-only)* — List all repositories in a project
- [`get_repository`](./repositories.md#get_repository) *(read-only)* — Get details of a specific repository
- [`get_repository_details`](./repositories.md#get_repository_details) *(read-only)* — Get detailed repository information including statistics and refs
- [`get_file_content`](./repositories.md#get_file_content) *(read-only)* — Get content of a file or directory from a repository
- [`get_all_repositories_tree`](./repositories.md#get_all_repositories_tree) *(read-only)* — Display hierarchical file trees across multiple repositories
- [`get_repository_tree`](./repositories.md#get_repository_tree) *(read-only)* — List files and folders in a repository from any path and depth
- [`create_branch`](./repositories.md#create_branch) *(write)* — Create a new branch from an existing branch
- [`create_commit`](./repositories.md#create_commit) *(write)* — Commit file additions, edits, or deletions using unified diffs or search/replace
- [`list_commits`](./repositories.md#list_commits) *(read-only)* — List recent commits on a branch with diff summaries

### Work Item Tools (`work-items`)

- [`list_work_items`](./work-items.md#list_work_items) *(read-only)* — List work items in a project using WIQL or a saved query
- [`get_work_item`](./work-items.md#get_work_item) *(read-only)* — Retrieve a work item by ID
- [`create_work_item`](./work-items.md#create_work_item) *(write)* — Create a new work item
- [`update_work_item`](./work-items.md#update_work_item) *(write)* — Update fields, state, or tags on an existing work item
- [`manage_work_item_link`](./work-items.md#manage_work_item_link) *(write)* — Add, remove, or update links between work items
- [`get_work_item_comments`](./work-items.md#get_work_item_comments) *(read-only)* — Retrieve paginated comments on a work item
- [`create_work_item_attachment`](./work-items.md#create_work_item_attachment) *(write)* — Upload and attach a local file to a work item
- [`get_work_item_attachment`](./work-items.md#get_work_item_attachment) *(read-only)* — Download an attachment from a work item to a local path
- [`delete_work_item_attachment`](./work-items.md#delete_work_item_attachment) *(write)* — Remove an attachment link from a work item

### Search Tools (`search`)

- [`search_code`](./search.md#search_code) *(read-only)* — Search code across repositories
- [`search_wiki`](./search.md#search_wiki) *(read-only)* — Search wiki page contents
- [`search_work_items`](./search.md#search_work_items) *(read-only)* — Search work items across projects

### Pull Request Tools (`pull-requests`)

- [`create_pull_request`](./pull-requests.md#create_pull_request) *(write)* — Create a new pull request
- [`get_pull_request`](./pull-requests.md#get_pull_request) *(read-only)* — Get a pull request by ID
- [`list_pull_requests`](./pull-requests.md#list_pull_requests) *(read-only)* — List pull requests in a repository
- [`get_pull_request_comments`](./pull-requests.md#get_pull_request_comments) *(read-only)* — Get comment threads from a pull request
- [`add_pull_request_comment`](./pull-requests.md#add_pull_request_comment) *(write)* — Add a comment or new review thread to a pull request
- [`update_pull_request`](./pull-requests.md#update_pull_request) *(write)* — Update PR metadata, status, draft state, reviewers, work items, and tags
- [`update_pull_request_thread_status`](./pull-requests.md#update_pull_request_thread_status) *(write)* — Update the status of an existing PR comment thread
- [`get_pull_request_changes`](./pull-requests.md#get_pull_request_changes) *(read-only)* — List changed files, unified diffs, and policy evaluations
- [`get_pull_request_checks`](./pull-requests.md#get_pull_request_checks) *(read-only)* — Summarize status checks, policy evaluations, and linked pipelines
- [`merge_pull_request`](./pull-requests.md#merge_pull_request) *(write)* — Complete (merge) a pull request or manage auto-complete

### Pipeline Tools (`pipelines`)

- [`list_pipelines`](./pipelines.md#list_pipelines) *(read-only)* — List all pipelines in a project
- [`get_pipeline`](./pipelines.md#get_pipeline) *(read-only)* — Get details of a specific pipeline
- [`list_pipeline_runs`](./pipelines.md#list_pipeline_runs) *(read-only)* — List recent runs for a pipeline with filters
- [`get_pipeline_run`](./pipelines.md#get_pipeline_run) *(read-only)* — Get detailed run information and artifact summaries
- [`download_pipeline_artifact`](./pipelines.md#download_pipeline_artifact) *(read-only)* — Download a single artifact file as text
- [`pipeline_timeline`](./pipelines.md#pipeline_timeline) *(read-only)* — Retrieve stage and job timeline records for a run
- [`get_pipeline_log`](./pipelines.md#get_pipeline_log) *(read-only)* — Retrieve log contents in plain or JSON format
- [`trigger_pipeline`](./pipelines.md#trigger_pipeline) *(write)* — Trigger a pipeline run with customizable parameters

### Wiki Tools (`wikis`)

- [`get_wikis`](./wiki.md#get_wikis) *(read-only)* — List all wikis in a project or organization
- [`get_wiki_page`](./wiki.md#get_wiki_page) *(read-only)* — Get content of a wiki page as plain text
- [`create_wiki`](./wiki.md#create_wiki) *(write)* — Create a new project wiki or code wiki
- [`update_wiki_page`](./wiki.md#update_wiki_page) *(write)* — Update the content of an existing wiki page
- [`list_wiki_pages`](./wiki.md#list_wiki_pages) *(read-only)* — List all pages in a wiki
- [`create_wiki_page`](./wiki.md#create_wiki_page) *(write)* — Create or update a wiki page

### Test Plans Tools (`test-plans`)

- [`list_test_plans`](./test-plans.md#list_test_plans) *(read-only)* — List test plans in a project
- [`get_test_plan`](./test-plans.md#get_test_plan) *(read-only)* — Get details of a test plan by ID
- [`create_test_plan`](./test-plans.md#create_test_plan) *(write)* — Create a new test plan
- [`list_test_suites`](./test-plans.md#list_test_suites) *(read-only)* — List test suites in a test plan
- [`get_test_suite`](./test-plans.md#get_test_suite) *(read-only)* — Get details of a specific test suite
- [`create_test_suite`](./test-plans.md#create_test_suite) *(write)* — Create a static, requirement-based, or query-based test suite
- [`list_suite_test_cases`](./test-plans.md#list_suite_test_cases) *(read-only)* — List test cases linked to a suite
- [`add_test_cases_to_suite`](./test-plans.md#add_test_cases_to_suite) *(write)* — Attach existing Test Case work items to a suite
- [`remove_test_cases_from_suite`](./test-plans.md#remove_test_cases_from_suite) *(write)* — Remove test cases from a static suite
- [`create_test_case`](./test-plans.md#create_test_case) *(write)* — Create a Test Case work item with structured steps XML

## Tool Structure

Each tool documentation section follows a consistent structure:

1. **Description**: Brief explanation of what the tool does
2. **Parameters**: Required and optional parameters with defaults
3. **Response**: Expected response format with examples
4. **Error Handling**: Typed errors and failure modes
5. **Example Usage**: Usage examples

## Examples

Examples of combining multiple tools together can be found in [Core Navigation Tools](./core-navigation.md#common-use-cases).
