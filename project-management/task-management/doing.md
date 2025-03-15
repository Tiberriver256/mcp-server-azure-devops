## Current Tasks In Progress

- [x] **Task 0.7**: Fix MCP Server Implementation
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

    - **Specific Changes Required**:
      1. Server Class Changes:
         - Replace our custom `McpServer` usage with `Server` from SDK
         - Remove our custom `connect()` method implementation
         - Move Azure DevOps connection logic to tool handlers
      
      2. Tool Registration Changes:
         - Replace our custom `tool()` method with proper request handlers
         - Implement `ListToolsRequestSchema` handler to declare available tools
         - Implement `CallToolRequestSchema` handler with switch/case for tool execution
         - Move tool implementations into separate modules like GitHub's pattern
      
      3. Transport Handling:
         - Remove custom transport handling code
         - Let SDK handle transport via `server.connect(transport)`
         - Ensure proper error handling and response formatting
      
      4. Configuration:
         - Keep Azure DevOps config but integrate it with SDK server config
         - Move tool-specific config into tool modules
         - Ensure proper typing for all configurations

  - **Sub-tasks**:
    - [x] Research the MCP SDK Server and Transport interfaces
    - [x] Refactor AzureDevOpsServer class to properly extend/use the MCP SDK Server
    - [x] Implement correct request handlers for ListToolsRequestSchema and CallToolRequestSchema
    - [x] Properly convert our existing tool implementations to the SDK pattern
    - [x] Fix the connection logic to correctly use the transport
    - [x] Test the implementation with the MCP inspector
    - [x] Ensure all existing unit tests still pass
