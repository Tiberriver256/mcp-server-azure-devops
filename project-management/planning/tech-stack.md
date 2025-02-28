## Tech Stack Documentation

### Overview
The tech stack for the Azure DevOps MCP server is tailored to ensure compatibility with the MCP, efficient interaction with Azure DevOps APIs, and a focus on security and scalability. It comprises a mix of programming languages, runtime environments, libraries, and development tools that streamline server development and operation.

### Programming Language and Runtime
- **Typescript**: Selected for its type safety, which minimizes runtime errors and enhances code readability. It aligns seamlessly with the MCP Typescript SDK for easy integration.
- **Node.js**: The runtime environment for executing Typescript, offering a non-blocking, event-driven architecture ideal for handling multiple API requests efficiently.

### Libraries and Dependencies
- **MCP Typescript SDK**: The official SDK for MCP server development. It provides the `getMcpServer` function to define and run the server with minimal setup, managing socket connections and JSON-RPC messaging so developers can focus on tool logic.
- **azure-devops-node-api**: A Node.js library that simplifies interaction with Azure DevOps REST APIs (e.g., Git, Work Item Tracking, Build). It supports Personal Access Token (PAT) authentication and offers a straightforward interface for common tasks.
- **Axios**: A promise-based HTTP client for raw API requests, particularly useful for endpoints not covered by `azure-devops-node-api` (e.g., listing organizations or Search API). It also supports Azure Active Directory (AAD) token-based authentication.
- **@azure/identity**: Facilitates AAD token acquisition for secure authentication with Azure DevOps resources when using AAD-based methods.
- **dotenv**: A lightweight module for loading environment variables from a `.env` file, securely managing sensitive data like PATs and AAD credentials.

### Development Tools
- **Visual Studio Code (VS Code)**: The recommended IDE, offering robust Typescript support, debugging tools, and integration with Git and Azure DevOps.
- **npm**: The package manager for installing and managing project dependencies.
- **ts-node**: Enables direct execution of Typescript files without precompilation, accelerating development and testing workflows.

### Testing and Quality Assurance
- **Jest**: A widely-used testing framework for unit and integration tests, ensuring the reliability of tools and server functionality.
- **ESLint**: A linter configured with Typescript-specific rules to maintain code quality and consistency.
- **Prettier**: A code formatter to enforce a uniform style across the project.

### Version Control and CI/CD
- **Git**: Used for version control, with repositories hosted on GitHub or Azure DevOps.
- **GitHub Actions**: Automates continuous integration and deployment, including builds, tests, and releases.

---

