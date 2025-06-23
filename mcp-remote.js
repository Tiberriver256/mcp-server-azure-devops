#!/usr/bin/env node

const net = require('net');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const host = args[1] || 'localhost';
const port = parseInt(args[2]) || 8889;

if (command !== 'connect' || args.length < 3) {
  console.error('Usage: mcp-remote connect <host> <port>');
  process.exit(1);
}

// Create TCP connection
const client = net.createConnection({ port, host }, () => {
  // Connection established - now bridge stdio to TCP
});

// Create readline interface for stdin
const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
});

// Forward stdin to TCP
rl.on('line', (line) => {
  client.write(line + '\n');
});

// Forward TCP to stdout
client.on('data', (data) => {
  process.stdout.write(data);
});

// Handle TCP connection errors
client.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

// Handle TCP connection close
client.on('close', () => {
  process.exit(0);
});

// Handle stdin close
rl.on('close', () => {
  client.end();
});