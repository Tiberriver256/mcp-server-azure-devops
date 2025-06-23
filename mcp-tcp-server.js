#!/usr/bin/env node
/**
 * MCP Azure DevOps TCP Server
 * 
 * A TCP wrapper for the MCP Azure DevOps server that enables network access.
 * This allows remote machines to connect to the MCP server running on Windows.
 * 
 * Features:
 * - TCP server wrapper for stdio-based MCP server
 * - Built-in connection testing
 * - Support for both direct TCP and SSH tunnel connections
 * - Automatic environment variable passthrough
 * 
 * Usage: mcp-tcp-server [port] or mcp-tcp-server --help
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);

function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                   MCP Azure DevOps TCP Server                     ║
╚═══════════════════════════════════════════════════════════════════╝

SYNOPSIS
  mcp-tcp-server [port]              Start server (default: 9999)
  mcp-tcp-server test [host] [port]  Test connection
  mcp-tcp-server --help              Show this help

DESCRIPTION
  Wraps the MCP Azure DevOps server in a TCP server for remote access,
  allowing the MCP server to be accessed over the network.

EXAMPLES
  Direct TCP Connection:
    Windows:  mcp-tcp-server 8888
    Remote:   mcp-remote connect <windows-ip> 8888
    
  Via Reverse SSH Tunnel:
    Windows:  mcp-tcp-server 8888
    Remote:   ssh -N -R 8889:127.0.0.1:8888 user@remote-host
              mcp-remote connect localhost 8889

ENVIRONMENT
  All Azure DevOps variables are passed through:
  • AZURE_DEVOPS_ORG_URL
  • AZURE_DEVOPS_AUTH_METHOD
  • AZURE_DEVOPS_PAT (for personal access token)
  
  See README for complete environment setup.
`);
}

if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
  showHelp();
  process.exit(0);
}

// Test mode
if (args[0] === 'test') {
  const readline = require('readline');
  const testHost = args[1] || 'localhost';
  const testPort = parseInt(args[2] || 8889);
  
  console.log(`\n🔍 Testing MCP server connection...`);
  console.log(`   Target: ${testHost}:${testPort}\n`);
  
  const client = net.createConnection(testPort, testHost, () => {
    console.log('✅ Connected successfully!\n');
    
    // Send initialization message
    const initMessage = JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "0.1.0",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0"
        }
      },
      id: 1
    }) + '\n';
    
    console.log('📤 Sending initialization request...');
    client.write(initMessage);
  });
  
  // Create readline interface to parse JSON-RPC messages
  const rl = readline.createInterface({
    input: client,
    crlfDelay: Infinity
  });
  
  rl.on('line', (line) => {
    console.log('\n📥 Response received:');
    try {
      const msg = JSON.parse(line);
      console.log(JSON.stringify(msg, null, 2));
      
      if (msg.result && msg.result.serverInfo) {
        console.log('\n✅ Server info:');
        console.log(`   Name: ${msg.result.serverInfo.name}`);
        console.log(`   Version: ${msg.result.serverInfo.version}`);
      }
    } catch (e) {
      console.log('⚠️  Raw response (not JSON):', line);
    }
  });
  
  client.on('error', (err) => {
    console.error('\n❌ Connection failed:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('   Make sure the MCP server is running on the specified port.');
    }
    process.exit(1);
  });
  
  client.on('close', () => {
    console.log('\n🔌 Connection closed');
    process.exit(0);
  });
  
  // Keep connection open for 10 seconds
  setTimeout(() => {
    console.log('\n⏱️  Test duration complete, closing connection...');
    client.end();
  }, 10000);
  
  return; // Exit early, don't start server
}

const port = parseInt(args[0] || 9999);

// Start TCP server that bridges to MCP stdio
const server = net.createServer(socket => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`\n🔗 [${timestamp}] New client connected`);
  console.log(`   From: ${socket.remoteAddress}:${socket.remotePort}`);
  
  // Start MCP server process - try different approaches
  let mcp;
  const distPath = path.join(__dirname, 'dist/index.js');
  const srcPath = path.join(__dirname, 'src/index.ts');
  
  // Check what's available
  const fs = require('fs');
  if (fs.existsSync(distPath)) {
    console.log('   Starting compiled MCP server...');
    mcp = spawn('node', [distPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });
  } else if (fs.existsSync(path.join(__dirname, 'node_modules/.bin/ts-node.cmd'))) {
    console.log('   Starting MCP server with ts-node...');
    mcp = spawn('ts-node.cmd', [srcPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      env: process.env
    });
  } else {
    console.error('\n❌ Cannot find MCP server!');
    console.error('   Please run: npm install && npm run build\n');
    socket.destroy();
    return;
  }
  
  // Log MCP server errors to stderr
  mcp.stderr.on('data', (data) => {
    process.stderr.write(`[MCP] ${data}`);
  });
  
  mcp.on('error', (err) => {
    console.error('[MCP] Failed to start:', err.message);
    socket.destroy();
  });
  
  mcp.on('exit', (code, signal) => {
    if (code !== 0) {
      console.log(`[MCP] Process exited with code ${code}`);
    }
    socket.destroy();
  });
  
  // Connect TCP socket to MCP stdio
  socket.pipe(mcp.stdin);
  mcp.stdout.pipe(socket);
  
  // Handle socket errors and cleanup
  socket.on('error', (err) => {
    if (err.code !== 'ECONNRESET') {
      console.error('[Socket] Error:', err.message);
    }
    mcp.kill();
  });
  
  socket.on('close', () => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n🔌 [${timestamp}] Client disconnected`);
    mcp.kill();
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                   MCP Azure DevOps TCP Server                     ║
╚═══════════════════════════════════════════════════════════════════╝

🚀 Server started successfully!
   Listening on: 0.0.0.0:${port}

📡 Connection Options:

   1️⃣  Direct TCP (same network):
      mcp-remote connect <this-machine-ip> ${port}

   2️⃣  SSH Reverse Tunnel (remote access):
      ssh -N -R 8889:127.0.0.1:${port} user@remote-host
      mcp-remote connect localhost 8889

💡 Tips:
   • Windows Firewall may block incoming connections
   • Use 'mcp-tcp-server test' to verify connectivity
   • Press Ctrl+C to stop the server
`);
});

server.on('error', (err) => {
  console.error('\n❌ Server error:', err.message);
  
  if (err.code === 'EADDRINUSE') {
    console.error(`   Port ${port} is already in use.`);
    console.error(`   Try a different port: mcp-tcp-server <port>`);
  } else if (err.code === 'EACCES') {
    console.error(`   Permission denied to bind to port ${port}.`);
    console.error(`   Try a port number above 1024.`);
  }
  
  process.exit(1);
});