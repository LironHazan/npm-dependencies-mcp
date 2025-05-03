const MCPNpmServer = require('./src/mcp-npm-server');
const MCPNpmClient = require('./src/mcp-npm-client');

module.exports = {
  MCPNpmServer,
  MCPNpmClient,
  
  /**
   * Create and start a new MCP NPM Dependencies server
   * @param {Object} options - Server options
   * @param {string} [options.monorepoRoot=process.cwd()] - Path to monorepo root
   * @param {string} [options.packagesDir='packages'] - Directory containing packages
   * @param {number} [options.port=3000] - Port to run the server on
   * @param {number} [options.cacheTTL=3600000] - Cache TTL in milliseconds
   * @returns {MCPNpmServer} - The server instance
   */
  createServer: (options = {}) => {
    const server = new MCPNpmServer(options);
    server.start();
    return server;
  },
  
  /**
   * Create a new MCP NPM Dependencies client
   * @param {Object} options - Client options
   * @param {string} [options.baseUrl='http://localhost:3000/api'] - Server API URL
   * @param {boolean} [options.interactive=false] - Whether to run in interactive mode
   * @returns {MCPNpmClient} - The client instance
   */
  createClient: (options = {}) => {
    return new MCPNpmClient(options);
  }
};
