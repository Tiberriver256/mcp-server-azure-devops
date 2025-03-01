## Current Tasks In Progress

- [ ] **Task 0.7**: Fix MCP Server Implementation
  - **Role**: Full-Stack Developer
  - **Phase**: Research
  - **Description**: Fix the Azure DevOps MCP server implementation to correctly use the MCP SDK. Currently, the server is not properly implementing the MCP protocol, causing connection errors when trying to use it with the inspector.
  - **Notes**:
    - **How we discovered the issue**:
      - Attempted to connect to our server with the MCP inspector
      - Received error: "TypeError: transport.onMessage is not a function at AzureDevOpsServer.connect"
      - Root cause: We're incorrectly implementing the MCP server protocol
    
    - **What we can learn from the GitHub implementation**:
      - GitHub implementation in `project-management/reference/mcp-server/src/github/index.ts` shows the correct pattern
      - They directly use the `Server` class from the SDK rather than creating a custom class
      - They register handlers using `server.setRequestHandler()` for specific request schemas
      - They have a clear pattern for tool implementation and error handling
    
    - **Key differences in implementation**:
      - GitHub uses `import { Server } from "@modelcontextprotocol/sdk/server/index.js"`
      - They register request handlers with `server.setRequestHandler(ListToolsRequestSchema, async () => {...})`
      - Tool implementations follow a switch/case pattern based on the tool name
      - They connect to the transport using `await server.connect(transport)`
      - Our implementation attempts to handle transport messages directly which is incorrect
    
    - **Learning resources**:
      - Reference implementation in `project-management/reference/mcp-server/`
      - MCP SDK documentation
      - The specific schema structure shown in the GitHub reference
  - **Sub-tasks**:
    - [ ] Research the MCP SDK Server and Transport interfaces
    - [ ] Refactor AzureDevOpsServer class to properly extend/use the MCP SDK Server
    - [ ] Implement correct request handlers for ListToolsRequestSchema and CallToolRequestSchema
    - [ ] Properly convert our existing tool implementations to the SDK pattern
    - [ ] Fix the connection logic to correctly use the transport
    - [ ] Test the implementation with the MCP inspector
    - [ ] Ensure all existing unit tests still pass
