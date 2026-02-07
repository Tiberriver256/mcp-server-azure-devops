# Research Documentation

This directory contains research reports and findings that inform the development of the Azure DevOps MCP Server.

## Available Reports

### Tool Loading Strategies Research
**Date:** November 19, 2024

Research into how other MCP servers handle the challenge of loading too many tools at once.

- **[Executive Summary](./SUMMARY.md)** - Quick overview and recommendations (5 min read)
- **[Full Report](./tool-loading-strategies.md)** - Detailed analysis, code examples, and implementation guidance (25 min read)

**Key Finding:** Implement domain-based filtering + read-only mode to allow users to selectively load tool domains and filter out write operations, reducing tool count by 70-95% based on configuration.

**Strategies Analyzed:**
1. **Domain-based filtering** - Load only specific feature areas (work-items, repositories, etc.)
2. **Read-only mode** - Filter out create/update/delete operations for safe exploration
3. **Multi-tier modes** - Namespace/consolidated/single tool abstractions

**Repositories Analyzed:**
- microsoft/azure-devops-mcp (TypeScript) - Domain filtering
- microsoft/mcp Azure.Mcp.Server (C#/.NET) - All three strategies

## How to Use This Research

1. **Quick Decision:** Read the [SUMMARY.md](./SUMMARY.md)
2. **Implementation Details:** See the [full report](./tool-loading-strategies.md) for:
   - Detailed strategy comparisons
   - Code examples
   - Step-by-step implementation guidance
   - Comparison matrices
   - Long-term vision

## Contributing Research

When adding new research:
1. Create a descriptive markdown file in this directory
2. Add a summary entry to this README
3. Include date, objective, and key findings
4. Link to full details in the report itself
