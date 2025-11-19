---
name: azure-devops-rest-api
description: Guide for working with Azure DevOps REST APIs and OpenAPI specifications. Use this skill when implementing new Azure DevOps API integrations, exploring API capabilities, understanding request/response formats, or referencing the official OpenAPI specifications from the vsts-rest-api-specs repository.
---

# Azure DevOps REST API

## Overview

This skill provides guidance for working with Azure DevOps REST APIs using the official OpenAPI specifications from the [vsts-rest-api-specs](https://github.com/MicrosoftDocs/vsts-rest-api-specs) repository. It helps with implementing new API integrations, understanding API capabilities, and referencing the correct request/response formats.

## Key API Areas

Azure DevOps REST APIs are organized into the following main areas:

### Core Services
- **core** - Projects, teams, processes, and organization-level operations
- **git** - Repositories, branches, pull requests, commits
- **build** - Build definitions, builds, and build resources
- **pipelines** - Pipeline definitions and runs
- **release** - Release definitions, deployments, and approvals

### Work Item & Planning
- **wit** (Work Item Tracking) - Work items, queries, and work item types
- **work** - Boards, backlogs, sprints, and team configurations
- **testPlan** - Test plans, suites, and cases
- **testResults** - Test runs and results

### Package & Artifact Management
- **artifacts** - Artifact feeds and packages
- **artifactsPackageTypes** - NuGet, npm, Maven, Python packages

### Security & Governance
- **graph** - Users, groups, and memberships
- **security** - Access control lists and permissions
- **policy** - Branch policies and policy configurations
- **audit** - Audit logs and events

### Extension & Integration
- **extensionManagement** - Extensions and marketplace
- **serviceEndpoint** - Service connections
- **hooks** - Service hooks and subscriptions

## API Specification Structure

The vsts-rest-api-specs repository is organized by API area and version:

```
specification/
  ├── {api-area}/          (e.g., git, build, pipelines)
  │   ├── 7.2/            Latest stable version
  │   │   ├── {area}.json          OpenAPI spec file
  │   │   └── httpExamples/        Example requests/responses
  │   ├── 7.1/
  │   └── ...
```

### Using the Specifications

1. **Identify the API area** - Determine which service area (git, build, wit, etc.) contains the functionality needed
2. **Select the version** - Use the latest version (7.2) unless targeting a specific Azure DevOps Server version
3. **Review the OpenAPI spec** - The main `{area}.json` file contains all endpoints, schemas, and parameters
4. **Check httpExamples** - Real request/response examples for each endpoint

## Implementation Patterns

### Pattern 1: Exploring New API Capabilities

When exploring what APIs are available for a specific feature:

1. Clone the vsts-rest-api-specs repository to `/tmp/vsts-rest-api-specs`
2. Browse the specification directory for the relevant API area
3. Review the OpenAPI spec JSON file for available endpoints
4. Check httpExamples for real-world usage patterns

Example workflow:
```bash
cd /tmp
git clone --depth 1 https://github.com/MicrosoftDocs/vsts-rest-api-specs.git
cd vsts-rest-api-specs/specification/git/7.2
# Review git.json for endpoint definitions
# Check httpExamples/ for request/response samples
```

### Pattern 2: Implementing a New API Feature

When adding new API functionality to the MCP server:

1. **Locate the spec**: Find the relevant OpenAPI specification
2. **Review the schema**: Understand the request parameters and response format
3. **Check examples**: Review httpExamples for real request/response data
4. **Create types**: Define TypeScript interfaces based on the OpenAPI schema
5. **Implement handler**: Create the feature handler following the repository's feature-based architecture
6. **Add tests**: Write unit tests with mocked responses based on httpExamples

### Pattern 3: Understanding Request/Response Formats

When you need to understand the exact format of API requests or responses:

1. Navigate to `specification/{area}/{version}/httpExamples/`
2. Find the relevant endpoint example (e.g., `GET_repositories.json`)
3. Review both the request parameters and response body structure
4. Use this as the basis for creating Zod schemas and TypeScript types

## Reference Resources

### scripts/
Contains helper utilities for working with the API specifications:
- `clone_specs.sh` - Clone or update the vsts-rest-api-specs repository
- `find_endpoint.py` - Search for specific endpoints across all API specs

### references/
Contains curated reference documentation:
- `api_areas.md` - Comprehensive list of all API areas and their purposes
- `common_patterns.md` - Common request/response patterns across APIs
- `authentication.md` - API authentication methods and patterns

### Usage Tips

**Finding the right API:**
- Use the OpenAPI spec's `paths` section to find endpoint URLs
- Check the `tags` property to understand the API category
- Review the `operationId` for the internal Azure DevOps method name

**Understanding schemas:**
- All data models are in the `definitions` section of the OpenAPI spec
- Look for `$ref` properties to follow schema references
- Use httpExamples to see actual data structures

**Version selection:**
- Use version 7.2 for Azure DevOps Services (cloud)
- Check azure-devops-server-{version} folders for on-premises versions
- API versions are additive - newer versions include all older functionality

## Integration with This Repository

When implementing features in this MCP server:

1. **Follow the feature-based architecture**: Create features in `src/features/{api-area}/`
2. **Use Zod for validation**: Define schemas based on OpenAPI definitions
3. **Reference the specs**: Link to the relevant OpenAPI spec in code comments
4. **Include examples**: Use httpExamples data for test fixtures
5. **Match naming**: Use consistent naming with the Azure DevOps API (e.g., `repositoryId`, `pullRequestId`)

Example feature implementation pattern:
```typescript
// src/features/{api-area}/{operation}/
├── feature.ts          // Core implementation using azure-devops-node-api
├── schema.ts           // Zod schemas based on OpenAPI definitions
├── feature.spec.unit.ts // Tests using httpExamples data
└── index.ts            // Exports
```
