# Claude Code MCP Setup for Azure DevOps (Windows → Ubuntu)

This guide configures Claude Code on Ubuntu to connect to the MCP Azure DevOps server running on Windows via SSH reverse tunnel.

## Architecture

```
Windows Machine                    Ubuntu Machine
┌─────────────────┐               ┌──────────────────┐
│ mcp-tcp-server  │◄──────────────│  Claude Code     │
│ (port 9999)     │  SSH Tunnel   │                  │
│                 │  localhost:8889│  mcp-remote.js   │
└─────────────────┘               └──────────────────┘
```

## Setup Steps

### 1. On Windows Machine

Start the MCP TCP server:
```powershell
cd path\to\mcp-server-azure-devops
node mcp-tcp-server.js 9999
```

### 2. From Windows to Ubuntu

Create reverse SSH tunnel:
```bash
ssh -N -R 8889:127.0.0.1:9999 ian@ubuntu-machine
```

This creates port 8889 on Ubuntu that tunnels back to Windows port 9999.

### 3. On Ubuntu Machine

The MCP configuration has been created at: `~/.config/claude/mcp.json`

No environment variables needed here - they're already configured on the Windows machine and will be passed through automatically.

### 4. Test Connection

From Ubuntu:
```bash
cd /home/ian/Code/mcp-server-azure-devops
node mcp-tcp-server.js test localhost 8889
```

## Configuration Details

The MCP configuration uses:
- Transport: stdio via mcp-remote.js
- Connection: localhost:8889 (reverse tunnel endpoint)
- Environment variables passed through to Windows MCP server

## Troubleshooting

1. **Connection refused**: Ensure the SSH tunnel is active
2. **Authentication errors**: Verify PAT is correct and has required permissions
3. **Server not found**: Check that mcp-tcp-server.js is running on Windows

## Security Notes

- Keep your PAT secure and never commit it to version control
- The SSH tunnel provides encrypted transport between machines
- Consider using SSH key authentication for the tunnel