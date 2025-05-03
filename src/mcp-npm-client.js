const axios = require('axios');
const readline = require('readline');
const chalk = require('chalk');
const Table = require('cli-table3');

class MCPNpmClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000/api';
    this.interactive = options.interactive || false;
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await axios({
        method,
        url,
        data,
        timeout: 30000 // 30 seconds timeout
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        throw new Error(`Network Error: No response received. Is the server running?`);
      } else {
        throw new Error(`Request Error: ${error.message}`);
      }
    }
  }

  async getStructure() {
    return this.makeRequest('/structure');
  }

  async getVersionInconsistencies() {
    return this.makeRequest('/inconsistencies');
  }

  async getUnusedDependencies(packageName = null) {
    const endpoint = packageName ? `/unused?package=${encodeURIComponent(packageName)}` : '/unused';
    return this.makeRequest(endpoint);
  }

  async getOutdatedDependencies() {
    return this.makeRequest('/outdated');
  }

  async getDependencyGraph(packageName = null) {
    const endpoint = packageName ? `/graph/${encodeURIComponent(packageName)}` : '/graph';
    return this.makeRequest(endpoint);
  }

  async getCircularDependencies() {
    return this.makeRequest('/circular');
  }

  async getSecurityVulnerabilities() {
    return this.makeRequest('/security');
  }

  async getPackagesUsingDependency(dependency) {
    return this.makeRequest(`/usedby/${encodeURIComponent(dependency)}`);
  }

  async getProjectDependencies(projectName) {
    return this.makeRequest(`/project-dependencies/${encodeURIComponent(projectName)}`);
  }

  async query(queryText) {
    return this.makeRequest('/query', 'POST', { query: queryText });
  }

  async invalidateCache(key = null) {
    return this.makeRequest('/cache/invalidate', 'POST', { key });
  }

  // Formatting and display helpers
  displayStructure(data) {
    console.log(chalk.bold.blue('\n📦 MONOREPO STRUCTURE\n'));
    console.log(`Total packages: ${chalk.bold(data.packageCount)}`);
    console.log(`Total dependencies: ${chalk.bold(data.totalDependencies)}`);
    console.log(`Internal dependencies: ${chalk.bold(data.internalDependencies)}`);

    const table = new Table({
      head: [
        chalk.bold('Package'), 
        chalk.bold('Version'), 
        chalk.bold('Dependencies'), 
        chalk.bold('DevDependencies'),
        chalk.bold('Total')
      ]
    });

    data.packages.forEach(pkg => {
      table.push([
        pkg.name,
        pkg.version,
        pkg.dependencies.length,
        pkg.devDependencies.length,
        pkg.totalDependencies
      ]);
    });

    console.log(table.toString());
  }

  displayVersionInconsistencies(data) {
    console.log(chalk.bold.yellow('\n⚠️ VERSION INCONSISTENCIES\n'));
    console.log(`Found ${chalk.bold(data.total)} inconsistent dependencies.\n`);

    if (data.total === 0) {
      console.log(chalk.green('✓ No version inconsistencies found!'));
      return;
    }

    Object.entries(data.details).forEach(([dep, versions]) => {
      console.log(chalk.bold(`${dep}:`));
      
      const versionTable = new Table({
        head: [chalk.bold('Package'), chalk.bold('Version'), chalk.bold('Type')]
      });

      versions.forEach(v => {
        versionTable.push([
          v.package,
          v.version,
          v.type
        ]);
      });

      console.log(versionTable.toString() + '\n');
    });
  }

  displayUnusedDependencies(data) {
    console.log(chalk.bold.magenta('\n🧹 UNUSED DEPENDENCIES\n'));

    Object.entries(data).forEach(([pkg, result]) => {
      const unusedDeps = result.unused.dependencies;
      const unusedDevDeps = result.unused.devDependencies;
      const totalUnused = unusedDeps.length + unusedDevDeps.length;

      console.log(`${chalk.bold(pkg)}: ${totalUnused} unused dependencies`);

      if (totalUnused === 0) {
        console.log(chalk.green('  ✓ No unused dependencies\n'));
        return;
      }

      if (unusedDeps.length > 0) {
        console.log(chalk.yellow('  Unused dependencies:'));
        unusedDeps.forEach(dep => console.log(`  - ${dep}`));
      }

      if (unusedDevDeps.length > 0) {
        console.log(chalk.yellow('  Unused devDependencies:'));
        unusedDevDeps.forEach(dep => console.log(`  - ${dep}`));
      }

      if (result.missing && Object.keys(result.missing).length > 0) {
        console.log(chalk.red('  Missing dependencies:'));
        Object.entries(result.missing).forEach(([dep, files]) => {
          console.log(`  - ${dep} (used in ${files.length} files)`);
        });
      }

      console.log(''); // Add spacing between packages
    });
  }

  displayOutdatedDependencies(data) {
    console.log(chalk.bold.cyan('\n📅 OUTDATED DEPENDENCIES\n'));

    if (data.error) {
      console.log(chalk.red(`Error: ${data.error}`));
      if (data.details) console.log(data.details);
      return;
    }

    if (Object.keys(data).length === 0) {
      console.log(chalk.green('✓ All dependencies are up to date!'));
      return;
    }

    const table = new Table({
      head: [
        chalk.bold('Package'), 
        chalk.bold('Current'), 
        chalk.bold('Wanted'), 
        chalk.bold('Latest'),
        chalk.bold('Location')
      ]
    });

    Object.entries(data).forEach(([pkg, info]) => {
      table.push([
        pkg,
        info.current,
        info.wanted,
        info.latest,
        info.location
      ]);
    });

    console.log(table.toString());
  }

  displayCircularDependencies(data) {
    console.log(chalk.bold.red('\n🔄 CIRCULAR DEPENDENCIES\n'));

    if (data.length === 0) {
      console.log(chalk.green('✓ No circular dependencies found!'));
      return;
    }

    console.log(`Found ${chalk.bold(data.length)} circular dependencies:\n`);

    data.forEach((cycle, i) => {
      console.log(`${i + 1}. ${cycle.join(' → ')} → ${cycle[0]}`);
    });
  }

  displaySecurityVulnerabilities(data) {
    console.log(chalk.bold.red('\n🔒 SECURITY VULNERABILITIES\n'));

    if (data.error) {
      console.log(chalk.red(`Error: ${data.error}`));
      if (data.details) console.log(data.details);
      return;
    }

    // Format depends on npm audit format
    if (data.metadata) {
      const { vulnerabilities } = data;
      
      const summary = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
      Object.values(vulnerabilities).forEach(vuln => {
        summary[vuln.severity] = (summary[vuln.severity] || 0) + 1;
      });

      console.log('Vulnerability summary:');
      Object.entries(summary).forEach(([severity, count]) => {
        if (count > 0) {
          let color;
          switch (severity) {
            case 'critical': color = chalk.bgRed.white; break;
            case 'high': color = chalk.red; break;
            case 'moderate': color = chalk.yellow; break;
            case 'low': color = chalk.blue; break;
            default: color = chalk.gray; break;
          }
          console.log(`  ${color(severity)}: ${count}`);
        }
      });

      console.log('\nDetails:');
      Object.entries(vulnerabilities).forEach(([pkgName, vuln]) => {
        let color;
        switch (vuln.severity) {
          case 'critical': color = chalk.bgRed.white; break;
          case 'high': color = chalk.red; break;
          case 'moderate': color = chalk.yellow; break;
          case 'low': color = chalk.blue; break;
          default: color = chalk.gray; break;
        }
        
        console.log(`\n${color(vuln.severity.toUpperCase())} ${pkgName}@${vuln.version}`);
        console.log(`  Vulnerable path: ${vuln.path.join(' > ')}`);
        console.log(`  Recommendation: ${vuln.recommendation || 'No specific recommendation'}`);
      });
    } else if (Object.keys(data).length === 0) {
      console.log(chalk.green('✓ No security vulnerabilities found!'));
    } else {
      console.log('Raw vulnerability data:');
      console.log(JSON.stringify(data, null, 2));
    }
  }

  displayPackagesUsingDependency(data) {
    console.log(chalk.bold.green(`\n🔍 PACKAGES USING ${data.dependency}\n`));
    
    if (data.usedByCount === 0) {
      console.log(`No packages use ${chalk.bold(data.dependency)}`);
      return;
    }

    console.log(`${chalk.bold(data.dependency)} is used by ${chalk.bold(data.usedByCount)} packages:\n`);

    const table = new Table({
      head: [chalk.bold('Package'), chalk.bold('Version'), chalk.bold('Usage Type')]
    });

    data.packages.forEach(pkg => {
      table.push([
        pkg.package,
        pkg.version,
        pkg.usageType.join(', ')
      ]);
    });

    console.log(table.toString());
  }

  displayDependencyGraph(data) {
    console.log(chalk.bold.blue('\n📊 DEPENDENCY GRAPH\n'));
    
    // Basic representation of the graph
    if (data.nodes && data.edges) {
      console.log(`Graph contains ${chalk.bold(data.nodes.length)} nodes and ${chalk.bold(data.edges.length)} edges\n`);
      
      // In a real implementation, you might want to generate a visual representation
      // or export to a format like DOT for visualization with Graphviz
      console.log('You can export this data to visualize with tools like:');
      console.log('- Graphviz (DOT format)');
      console.log('- D3.js (for web visualization)');
      console.log('- Cytoscape.js (for interactive graphs)\n');
      
      // Show a simple adjacency list
      const adjacencyList = {};
      data.edges.forEach(edge => {
        if (!adjacencyList[edge.from]) adjacencyList[edge.from] = [];
        adjacencyList[edge.from].push(edge.to);
      });
      
      console.log('Simplified dependency relationships:');
      Object.entries(adjacencyList).forEach(([from, deps]) => {
        console.log(`${chalk.bold(from)} → ${deps.join(', ')}`);
      });
    } else {
      console.log('Graph data is in an unexpected format:');
      console.log(JSON.stringify(data, null, 2));
    }
  }

  displayProjectDependencies(data) {
    console.log(chalk.bold.cyan(`\n📦 DEPENDENCIES FOR PROJECT: ${chalk.bold(data.project)}\n`));
    
    if (data.error) {
      console.log(chalk.red(`Error: ${data.error}`));
      if (data.availableProjects) {
        console.log('\nAvailable projects:');
        data.availableProjects.forEach(project => console.log(`- ${project}`));
      }
      return;
    }
    
    // Display summary
    console.log('Summary:');
    console.log(`- Total dependencies: ${chalk.bold(data.summary.total)}`);
    console.log(`- Production dependencies: ${chalk.bold(data.summary.dependencies)}`);
    console.log(`- Development dependencies: ${chalk.bold(data.summary.devDependencies)}`);
    console.log(`- Peer dependencies: ${chalk.bold(data.summary.peerDependencies)}`);
    console.log(`- Internal (monorepo) dependencies: ${chalk.bold(data.summary.internal)}`);
    console.log(`- External dependencies: ${chalk.bold(data.summary.external)}`);
    console.log();
    
    // Display dependencies by type
    const displayDependencyTable = (title, deps) => {
      if (deps.length === 0) {
        return;
      }
      
      console.log(chalk.bold(title));
      
      const table = new Table({
        head: [chalk.bold('Name'), chalk.bold('Version'), chalk.bold('Type')]
      });
      
      deps.forEach(dep => {
        table.push([
          dep.name,
          dep.version,
          dep.type
        ]);
      });
      
      console.log(table.toString() + '\n');
    };
    
    displayDependencyTable('Production Dependencies', data.dependencies.production);
    displayDependencyTable('Development Dependencies', data.dependencies.development);
    displayDependencyTable('Peer Dependencies', data.dependencies.peer);
    
    // Display internal dependencies specifically
    if (data.dependencies.internal.length > 0) {
      console.log(chalk.bold.green('Internal Monorepo Dependencies:'));
      data.dependencies.internal.forEach(dep => {
        console.log(`- ${dep.name} (${dep.type})`);
      });
      console.log();
    }
  }

  async runInteractive() {
    if (!this.interactive) {
      throw new Error('Client not initialized in interactive mode');
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.bold.green('MCP> ')
    });

    console.log(chalk.bold('\n🧰 MCP NPM Dependencies Client\n'));
    console.log('Available commands:');
    console.log('  structure             - Show monorepo structure');
    console.log('  inconsistencies       - Show version inconsistencies');
    console.log('  unused [package]      - Show unused dependencies');
    console.log('  outdated              - Show outdated dependencies');
    console.log('  graph [package]       - Show dependency graph');
    console.log('  circular              - Show circular dependencies');
    console.log('  security              - Show security vulnerabilities');
    console.log('  usedby <dependency>   - Show packages using dependency');
    console.log('  project <name>        - Show dependencies for a specific project');
    console.log('  query <text>          - Natural language query');
    console.log('  clear                 - Clear the console');
    console.log('  exit                  - Exit the client\n');

    rl.prompt();

    rl.on('line', async (line) => {
      const args = line.trim().split(' ');
      const command = args[0].toLowerCase();

      try {
        switch (command) {
          case 'structure':
            this.displayStructure(await this.getStructure());
            break;
          case 'inconsistencies':
            this.displayVersionInconsistencies(await this.getVersionInconsistencies());
            break;
          case 'unused':
            this.displayUnusedDependencies(await this.getUnusedDependencies(args[1]));
            break;
          case 'outdated':
            this.displayOutdatedDependencies(await this.getOutdatedDependencies());
            break;
          case 'graph':
            this.displayDependencyGraph(await this.getDependencyGraph(args[1]));
            break;
          case 'circular':
            this.displayCircularDependencies(await this.getCircularDependencies());
            break;
          case 'security':
            this.displaySecurityVulnerabilities(await this.getSecurityVulnerabilities());
            break;
          case 'usedby':
            if (!args[1]) {
              console.log(chalk.red('Error: Missing dependency parameter'));
              break;
            }
            this.displayPackagesUsingDependency(await this.getPackagesUsingDependency(args[1]));
            break;
          case 'project':
            if (!args[1]) {
              console.log(chalk.red('Error: Missing project name parameter'));
              break;
            }
            this.displayProjectDependencies(await this.getProjectDependencies(args[1]));
            break;
          case 'query':
            const queryText = args.slice(1).join(' ');
            if (!queryText) {
              console.log(chalk.red('Error: Missing query text'));
              break;
            }
            const result = await this.query(queryText);
            console.log(chalk.bold.blue('\n🔍 QUERY RESULTS\n'));
            console.log(JSON.stringify(result, null, 2));
            break;
          case 'clear':
            console.clear();
            console.log(chalk.bold('\n🧰 MCP NPM Dependencies Client\n'));
            break;
          case 'exit':
            console.log('Goodbye!');
            rl.close();
            return;
          case '':
            break;
          default:
            console.log(chalk.red(`Unknown command: ${command}`));
            break;
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }

      rl.prompt();
    }).on('close', () => {
      process.exit(0);
    });
  }
}

module.exports = MCPNpmClient;

// Example usage
if (require.main === module) {
  const client = new MCPNpmClient({
    baseUrl: process.env.MCP_SERVER_URL || 'http://localhost:3000/api',
    interactive: true
  });
  
  client.runInteractive().catch(error => {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  });
}
