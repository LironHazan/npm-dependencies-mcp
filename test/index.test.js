/**
 * Basic test for npm-dependencies-mcp module exports
 */

// Import the main module
const { 
  MCPNpmServer, 
  MCPNpmClient, 
  createServer, 
  createClient 
} = require('../index.js');

// Simple validation tests
console.log('Running basic validation tests for npm-dependencies-mcp');

// Check that exported objects and functions exist
if (!MCPNpmServer) throw new Error('MCPNpmServer export is missing');
if (!MCPNpmClient) throw new Error('MCPNpmClient export is missing');
if (typeof createServer !== 'function') throw new Error('createServer export is not a function');
if (typeof createClient !== 'function') throw new Error('createClient export is not a function');

console.log('✅ All basic validations passed'); 