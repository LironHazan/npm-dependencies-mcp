#!/usr/bin/env node
const { program } = require('commander');
const chalk = require('chalk');
const MCPNpmClient = require('../src/mcp-npm-client');
const MCPNpmServer = require('../src/mcp-npm-server');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Config file handling
const CONFIG_FILE = path.join(os.homedir(), '.mcp-npm-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error(`Warning: Could not load config file: ${error.message}`);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error(`Warning: Could not save config file: ${error.message}`);
  }
}

// Load config
const config = loadConfig();

// Create client instance
const client = new MCPNpmClient({
  baseUrl: config.serverUrl || 'http://localhost:3000/api'
});

// Setup CLI
program
  .name('mcp-npm')
  .description('Model Context Protocol for NPM Dependencies in Monorepos')
  .version('1.0.0');

// Server commands
program
  .command('start')
  .description('Start the MCP NPM Dependencies server')
  .option('-p, --port <number>', 'Port to run the server on', 3000)
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-d, --packages-dir <dir>', 'Directory containing packages', 'packages')
  .action((options) => {
    console.log(chalk.bold('🚀 Starting MCP NPM Dependencies Server\n'));
    console.log(`Root directory: ${chalk.blue(path.resolve(options.root))}`);
    console.log(`Packages directory: ${chalk.blue(options.packagesDir)}`);
    console.log(`Port: ${chalk.blue(options.port)}\n`);
    
    const server = new MCPNpmServer({
      port: options.port,
      monorepoRoot: options.root,
      packagesDir: options.packagesDir
    });
    
    server.start();
    
    // Save config
    saveConfig({
      ...config,
      serverUrl: `http://localhost:${options.port}/api`,
      lastRoot: options.root,
      lastPackagesDir: options.packagesDir
    });
  });

// Client commands
program
  .command('configure')
  .description('Configure the MCP NPM client')
  .option('-s, --server <url>', 'Server URL')
  .action((options) => {
    if (options.server) {
      saveConfig({
        ...config,
        serverUrl: options.server
      });
      console.log(chalk.green(`Server URL set to ${options.server}`));
    } else {
      console.log(chalk.blue('Current configuration:'));
      console.log(JSON.stringify(config, null, 2));
    }
  });

program
  .command('interactive')
  .alias('i')
  .description('Start interactive client')
  .action(async () => {
    const interactiveClient = new MCPNpmClient({
      baseUrl: config.serverUrl || 'http://localhost:3000/api',
      interactive: true
    });
    
    try {
      await interactiveClient.runInteractive();
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('structure')
  .description('Show monorepo structure')
  .action(async () => {
    try {
      const data = await client.getStructure();
      client.displayStructure(data);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('inconsistencies')
  .description('Show version inconsistencies')
  .action(async () => {
    try {
      const data = await client.getVersionInconsistencies();
      client.displayVersionInconsistencies(data);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('unused')
  .description('Show unused dependencies')
  .option('-p, --package <name>', 'Package name')
  .action(async (options) => {
    try {
      const data = await client.getUnusedDependencies(options.package);
      client.displayUnusedDependencies(data);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('outdated')
  .description('Show outdated dependencies')
  .action(async () => {
    try {
      const data = await client.getOutdatedDependencies();
      client.displayOutdatedDependencies(data);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('graph')
  .description('Show dependency graph')
  .option('-p, --package <name>', 'Package name')
  .action(async (options) => {
    try {
      const data = await client.getDependencyGraph(options.package);
      client.displayDependencyGraph(data);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('circular')
  .description('Show circular dependencies')
  .action(async () => {
    try {
      const data = await client.getCircularDependencies();
      client.displayCircularDependencies(data);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('security')
  .description('Show security vulnerabilities')
  .action(async () => {
    try {
      const data = await client.getSecurityVulnerabilities();
      client.displaySecurityVulnerabilities(data);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('usedby <dependency>')
  .description('Show packages using dependency')
  .action(async (dependency) => {
    try {
      const data = await client.getPackagesUsingDependency(dependency);
      client.displayPackagesUsingDependency(data);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('project <name>')
  .description('Show dependencies for a specific project')
  .action(async (name) => {
    try {
      const data = await client.getProjectDependencies(name);
      client.displayProjectDependencies(data);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('query <text...>')
  .description('Natural language query')
  .action(async (textArr) => {
    try {
      const text = textArr.join(' ');
      const data = await client.query(text);
      
      // Try to intelligently display based on data type
      if (data.packages && data.packageCount) {
        client.displayStructure(data);
      } else if (data.total && data.details) {
        client.displayVersionInconsistencies(data);
      } else if (data.usedByCount !== undefined) {
        client.displayPackagesUsingDependency(data);
      } else if (Array.isArray(data) && data.length > 0 && data[0].constructor === Array) {
        client.displayCircularDependencies(data);
      } else if (data.nodes && data.edges) {
        client.displayDependencyGraph(data);
      } else if (data.project && data.dependencies) {
        client.displayProjectDependencies(data);
      } else {
        console.log(chalk.bold.blue('\n🔍 QUERY RESULTS\n'));
        console.log(JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Default command when none is specified
if (process.argv.length <= 2) {
  process.argv.push('--help');
}

program.parse(process.argv);
