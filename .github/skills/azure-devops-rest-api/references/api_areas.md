# Azure DevOps API Areas Reference

This document provides a comprehensive overview of all Azure DevOps REST API areas and their purposes.

## Core Platform Services

### account
Organization and account management APIs for creating and managing Azure DevOps organizations.

### core
Core platform APIs including:
- Projects (create, update, list, delete)
- Teams (create, update, list team members)
- Processes (Agile, Scrum, CMMI, custom)
- Connections and proxies

### graph
Identity and access management:
- Users and service principals
- Groups and memberships
- Descriptors and identity resolution
- User entitlements

## Source Control & Git

### git
Complete Git repository management:
- Repositories (create, delete, list)
- Branches and refs
- Commits and pushes
- Pull requests (create, update, review, merge)
- Pull request threads and comments
- Pull request iterations
- Import requests
- Cherry-picks and reverts

### tfvc
Team Foundation Version Control (legacy)

## Build & Release

### build
Build pipeline management:
- Build definitions
- Builds (queue, get, list)
- Build artifacts
- Build timeline and logs

### pipelines
YAML pipeline management:
- Pipeline definitions
- Pipeline runs
- Pipeline artifacts
- Environments and approvals

### release
Classic release pipeline management

### distributedTask
Task and agent management

## Work Item Tracking

### wit (Work Item Tracking)
Work item management:
- Work items (create, update, delete, query)
- Work item types and fields
- Work item relations and links
- Queries (WIQL)

### work
Agile planning and boards:
- Backlogs
- Boards and board settings
- Sprints and iterations
- Team settings

## Testing

### testPlan
Modern test management:
- Test plans
- Test suites
- Test cases

### testResults
Test execution and results:
- Test runs
- Test results
- Code coverage

## Package Management

### artifacts
Azure Artifacts feeds and packages

### artifactsPackageTypes
Package type-specific APIs (NuGet, npm, Maven, Python)

## Extension & Integration

### extensionManagement
Extension marketplace and installation

### serviceEndpoint
Service connections

### hooks
Service hooks and webhooks

## Security & Compliance

### security
Access control and permissions

### policy
Branch policies and quality gates

### audit
Audit logging and compliance

## Notification & Communication

### notification
Notification settings and subscriptions

### wiki
Wiki pages and content

## Quick Reference

Most commonly used APIs:
- **Projects**: `core`
- **Repos**: `git`
- **Work Items**: `wit`
- **Boards**: `work`
- **Pipelines**: `pipelines` (YAML) or `build` (classic)
- **Pull Requests**: `git`
- **Test Management**: `testPlan`, `testResults`
- **Packages**: `artifacts`
