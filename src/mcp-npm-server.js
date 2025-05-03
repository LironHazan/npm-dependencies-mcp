const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const bodyParser = require('body-parser');

class MCPNpmServer {
  constructor(options = {}) {
    this.monorepoRoot = options.monorepoRoot || process.cwd();
    this.packagesDir = options.packagesDir || 'packages';
    this.port = options.port || 3000;
    this.cache = new Map();
    this.cacheTime = new Map();
    this.cacheTTL = options.cacheTTL || 3600000; // 1 hour default
    
    this.app = express();
    this.app.use(bodyParser.json());
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', version: '1.0.0' });
    });

    // Get monorepo structure overview
    this.app.get('/api/structure', async (req, res) => {
      try {
        const data = await this.getCachedData('structure', () => this.analyzeStructure());
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get dependency version inconsistencies
    this.app.get('/api/inconsistencies', async (req, res) => {
      try {
        const data = await this.getCachedData('inconsistencies', () => this.findVersionInconsistencies());
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get unused dependencies by package
    this.app.get('/api/unused', async (req, res) => {
      try {
        const packageName = req.query.package;
        const cacheKey = `unused-${packageName || 'all'}`;
        const data = await this.getCachedData(cacheKey, () => this.findUnusedDependencies(packageName));
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get outdated packages
    this.app.get('/api/outdated', async (req, res) => {
      try {
        const data = await this.getCachedData('outdated', () => this.findOutdatedDependencies());
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get dependency graph for a package
    this.app.get('/api/graph/:package?', async (req, res) => {
      try {
        const packageName = req.params.package;
        const cacheKey = `graph-${packageName || 'all'}`;
        const data = await this.getCachedData(cacheKey, () => this.generateDependencyGraph(packageName));
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get circular dependencies
    this.app.get('/api/circular', async (req, res) => {
      try {
        const data = await this.getCachedData('circular', () => this.findCircularDependencies());
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get security vulnerabilities
    this.app.get('/api/security', async (req, res) => {
      try {
        const data = await this.getCachedData('security', () => this.findSecurityVulnerabilities());
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get packages using a specific dependency
    this.app.get('/api/usedby/:dependency', async (req, res) => {
      try {
        const dependency = req.params.dependency;
        const cacheKey = `usedby-${dependency}`;
        const data = await this.getCachedData(cacheKey, () => this.findPackagesUsingDependency(dependency));
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get dependencies for a specific project
    this.app.get('/api/project-dependencies/:project', async (req, res) => {
      try {
        const project = req.params.project;
        const cacheKey = `project-deps-${project}`;
        const data = await this.getCachedData(cacheKey, () => this.getProjectDependencies(project));
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Advanced query endpoint - allows complex questions
    this.app.post('/api/query', async (req, res) => {
      try {
        const { query } = req.body;
        const result = await this.processQuery(query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Invalidate cache
    this.app.post('/api/cache/invalidate', (req, res) => {
      const { key } = req.body;
      if (key) {
        this.invalidateCache(key);
        res.json({ message: `Cache invalidated for key: ${key}` });
      } else {
        this.cache.clear();
        this.cacheTime.clear();
        res.json({ message: 'All cache invalidated' });
      }
    });
  }

  async getCachedData(key, dataFn) {
    const now = Date.now();
    if (this.cache.has(key) && now - this.cacheTime.get(key) < this.cacheTTL) {
      return this.cache.get(key);
    }
    
    const data = await dataFn();
    this.cache.set(key, data);
    this.cacheTime.set(key, now);
    return data;
  }

  invalidateCache(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.cacheTime.delete(key);
    }
  }

  async analyzeStructure() {
    console.log('Analyzing structure...');
    console.log('Monorepo root:', this.monorepoRoot);
    console.log('Packages directory:', this.packagesDir);
    
    // Get all package.json files, excluding node_modules
    const packagesPath = path.resolve(this.monorepoRoot, this.packagesDir);
    console.log('Full packages path:', packagesPath);
    
    try {
      // Check if the packages directory exists
      if (!fs.existsSync(packagesPath)) {
        console.error(`Packages directory does not exist: ${packagesPath}`);
        return { packageCount: 0, packages: [], totalDependencies: 0, internalDependencies: 0 };
      }
      
      // Read directories directly instead of relying on glob
      const packageDirs = fs.readdirSync(packagesPath)
        .filter(dir => fs.statSync(path.join(packagesPath, dir)).isDirectory())
        .filter(dir => dir !== 'node_modules');  // Explicitly exclude node_modules
      
      console.log('Found package directories:', packageDirs);
      
      const packages = [];
      
      for (const dir of packageDirs) {
        const packageJsonPath = path.join(packagesPath, dir, 'package.json');
        console.log('Checking for package.json at:', packageJsonPath);
        
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageContent = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const packageDir = path.dirname(packageJsonPath);
            const packageName = packageContent.name;
            
            console.log(`Found package ${packageName} at ${packageDir}`);
            
            packages.push({
              name: packageName,
              version: packageContent.version,
              path: packageDir,
              dependencies: Object.keys(packageContent.dependencies || {}),
              devDependencies: Object.keys(packageContent.devDependencies || {}),
              peerDependencies: Object.keys(packageContent.peerDependencies || {}),
              totalDependencies: 
                Object.keys(packageContent.dependencies || {}).length +
                Object.keys(packageContent.devDependencies || {}).length +
                Object.keys(packageContent.peerDependencies || {}).length
            });
          } catch (error) {
            console.error(`Error processing package.json at ${packageJsonPath}:`, error);
          }
        } else {
          console.log(`No package.json found at ${packageJsonPath}`);
        }
      }

      const result = {
        packageCount: packages.length,
        packages,
        totalDependencies: packages.reduce((acc, pkg) => acc + pkg.totalDependencies, 0),
        internalDependencies: this.countInternalDependencies(packages)
      };
      
      console.log(`Analysis complete. Found ${packages.length} packages.`);
      return result;
    } catch (error) {
      console.error('Error analyzing structure:', error);
      throw error;
    }
  }

  countInternalDependencies(packages) {
    const packageNames = new Set(packages.map(pkg => pkg.name));
    let count = 0;
    
    packages.forEach(pkg => {
      [...pkg.dependencies, ...pkg.devDependencies].forEach(dep => {
        if (packageNames.has(dep)) count++;
      });
    });
    
    return count;
  }

  async findVersionInconsistencies() {
    const structure = await this.analyzeStructure();
    const dependencyVersions = {};
    
    // Collect all versions
    structure.packages.forEach(pkg => {
      const collectDeps = (deps, type) => {
        Object.entries(deps || {}).forEach(([depName, version]) => {
          dependencyVersions[depName] = dependencyVersions[depName] || [];
          dependencyVersions[depName].push({
            package: pkg.name,
            version: version,
            type
          });
        });
      };
      
      try {
        const packageJson = JSON.parse(fs.readFileSync(path.join(pkg.path, 'package.json'), 'utf8'));
        collectDeps(packageJson.dependencies, 'dependency');
        collectDeps(packageJson.devDependencies, 'devDependency');
        collectDeps(packageJson.peerDependencies, 'peerDependency');
      } catch (e) {
        console.error(`Error reading package.json for ${pkg.name}:`, e);
      }
    });
    
    // Find inconsistencies
    const inconsistencies = {};
    Object.entries(dependencyVersions).forEach(([dep, versions]) => {
      const uniqueVersions = new Set(versions.map(v => v.version));
      if (uniqueVersions.size > 1) {
        inconsistencies[dep] = versions;
      }
    });
    
    return {
      total: Object.keys(inconsistencies).length,
      details: inconsistencies
    };
  }

  async findUnusedDependencies(packageName) {
    try {
      const structure = await this.analyzeStructure();
      const results = {};
      
      const processPackage = async (pkg) => {
        try {
          // Use depcheck command-line tool if available
          const output = execSync(`npx depcheck ${pkg.path} --json`, { 
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
          });
          
          const depcheckResult = JSON.parse(output);
          return {
            unused: {
              dependencies: depcheckResult.dependencies || [],
              devDependencies: depcheckResult.devDependencies || []
            },
            missing: depcheckResult.missing || {}
          };
        } catch (error) {
          // Fallback to basic detection when depcheck fails
          console.warn(`Depcheck failed for ${pkg.name}, using basic detection`);
          
          // This is a very simplified check that just lists all dependencies
          // as potential candidates - would need complex analysis to be accurate
          const packageJson = JSON.parse(fs.readFileSync(path.join(pkg.path, 'package.json'), 'utf8'));
          return {
            unused: {
              dependencies: Object.keys(packageJson.dependencies || {}),
              devDependencies: Object.keys(packageJson.devDependencies || {})
            },
            note: "Basic detection only - use depcheck for accuracy"
          };
        }
      };
      
      if (packageName) {
        const pkg = structure.packages.find(p => p.name === packageName);
        if (!pkg) {
          throw new Error(`Package not found: ${packageName}`);
        }
        results[packageName] = await processPackage(pkg);
      } else {
        // Process all packages
        for (const pkg of structure.packages) {
          results[pkg.name] = await processPackage(pkg);
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error in findUnusedDependencies:', error);
      throw error;
    }
  }

  async findOutdatedDependencies() {
    try {
      const output = execSync('npm outdated --json', { 
        cwd: this.monorepoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      
      try {
        return JSON.parse(output || '{}');
      } catch (e) {
        return { error: 'No outdated packages or invalid JSON response' };
      }
    } catch (error) {
      // npm outdated returns non-zero exit code when outdated packages are found
      try {
        return JSON.parse(error.stdout || '{}');
      } catch (e) {
        return { error: 'Error parsing npm outdated output', details: error.message };
      }
    }
  }

  async generateDependencyGraph(packageName) {
    try {
      let targetPath = path.join(this.monorepoRoot, this.packagesDir);
      
      if (packageName) {
        const structure = await this.analyzeStructure();
        const pkg = structure.packages.find(p => p.name === packageName);
        if (!pkg) {
          throw new Error(`Package not found: ${packageName}`);
        }
        targetPath = pkg.path;
      }
      
      // Use dependency-cruiser if available
      try {
        const excludePattern = `node_modules|dist|build`;
        const output = execSync(
          `npx dependency-cruiser --include-only "^${targetPath}" --exclude "${excludePattern}" --output-type json ${targetPath}`, 
          { encoding: 'utf8' }
        );
        
        return JSON.parse(output);
      } catch (error) {
        // Fallback to basic dependency extraction
        console.warn('dependency-cruiser failed, using basic extraction');
        
        const structure = await this.analyzeStructure();
        const graph = {
          nodes: [],
          edges: []
        };
        
        // Create nodes for each package
        structure.packages.forEach(pkg => {
          graph.nodes.push({
            id: pkg.name,
            type: 'package'
          });
        });
        
        // Create edges for dependencies
        structure.packages.forEach(pkg => {
          const packageJson = JSON.parse(fs.readFileSync(path.join(pkg.path, 'package.json'), 'utf8'));
          
          const addDependencyEdges = (deps) => {
            Object.keys(deps || {}).forEach(dep => {
              const targetPkg = structure.packages.find(p => p.name === dep);
              if (targetPkg) {
                graph.edges.push({
                  from: pkg.name,
                  to: dep,
                  type: 'depends on'
                });
              }
            });
          };
          
          addDependencyEdges(packageJson.dependencies);
          addDependencyEdges(packageJson.devDependencies);
        });
        
        return graph;
      }
    } catch (error) {
      console.error('Error in generateDependencyGraph:', error);
      throw error;
    }
  }

  async findCircularDependencies() {
    try {
      // Use madge if available
      try {
        const output = execSync(
          `npx madge --circular --json ${path.join(this.monorepoRoot, this.packagesDir)}`, 
          { encoding: 'utf8' }
        );
        
        return JSON.parse(output || '[]');
      } catch (error) {
        // Fallback to basic circular dependency detection
        console.warn('madge failed, using basic circular detection');
        
        const graph = await this.generateDependencyGraph();
        const adjacencyList = {};
        
        // Build adjacency list
        graph.edges.forEach(edge => {
          if (!adjacencyList[edge.from]) adjacencyList[edge.from] = [];
          adjacencyList[edge.from].push(edge.to);
        });
        
        // Basic cycle detection using DFS
        const findCycles = (node) => {
          const visited = new Set();
          const path = new Set();
          const cycles = [];
          
          const dfs = (current, pathArr) => {
            if (path.has(current)) {
              const cycleStart = pathArr.indexOf(current);
              cycles.push(pathArr.slice(cycleStart).concat(current));
              return;
            }
            
            if (visited.has(current)) return;
            
            visited.add(current);
            path.add(current);
            pathArr.push(current);
            
            (adjacencyList[current] || []).forEach(neighbor => {
              dfs(neighbor, [...pathArr]);
            });
            
            path.delete(current);
          };
          
          dfs(node, []);
          return cycles;
        };
        
        const allCycles = [];
        Object.keys(adjacencyList).forEach(node => {
          const cycles = findCycles(node);
          cycles.forEach(cycle => {
            // Canonicalize cycle to avoid duplicates
            const sorted = [...cycle].sort();
            const key = sorted.join(',');
            if (!allCycles.some(c => c.join(',') === key)) {
              allCycles.push(cycle);
            }
          });
        });
        
        return allCycles;
      }
    } catch (error) {
      console.error('Error in findCircularDependencies:', error);
      throw error;
    }
  }

  async findSecurityVulnerabilities() {
    try {
      try {
        const output = execSync('npm audit --json', { 
          cwd: this.monorepoRoot,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        
        return JSON.parse(output || '{}');
      } catch (error) {
        // npm audit returns non-zero exit code when vulnerabilities are found
        try {
          return JSON.parse(error.stdout || '{}');
        } catch (e) {
          return { error: 'Error parsing npm audit output', details: error.message };
        }
      }
    } catch (error) {
      console.error('Error in findSecurityVulnerabilities:', error);
      throw error;
    }
  }

  async findPackagesUsingDependency(dependency) {
    console.log(`Looking for packages using ${dependency}...`);
    const structure = await this.analyzeStructure();
    console.log(`Got structure with ${structure.packageCount} packages`);
    
    const results = [];
    
    for (const pkg of structure.packages) {
      try {
        console.log(`Checking ${pkg.name} for ${dependency}...`);
        const packageJsonPath = path.join(pkg.path, 'package.json');
        
        if (!fs.existsSync(packageJsonPath)) {
          console.log(`Package.json does not exist at: ${packageJsonPath}`);
          continue;
        }
        
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        const usageInfo = {
          package: pkg.name,
          usageType: []
        };
        
        if ((packageJson.dependencies || {})[dependency]) {
          console.log(`Found ${dependency} as a dependency in ${pkg.name}`);
          usageInfo.usageType.push('dependency');
          usageInfo.version = packageJson.dependencies[dependency];
        }
        
        if ((packageJson.devDependencies || {})[dependency]) {
          console.log(`Found ${dependency} as a devDependency in ${pkg.name}`);
          usageInfo.usageType.push('devDependency');
          usageInfo.version = usageInfo.version || packageJson.devDependencies[dependency];
        }
        
        if ((packageJson.peerDependencies || {})[dependency]) {
          console.log(`Found ${dependency} as a peerDependency in ${pkg.name}`);
          usageInfo.usageType.push('peerDependency');
          usageInfo.version = usageInfo.version || packageJson.peerDependencies[dependency];
        }
        
        if (usageInfo.usageType.length > 0) {
          results.push(usageInfo);
        }
      } catch (error) {
        console.error(`Error checking ${pkg.name} for dependency ${dependency}:`, error);
      }
    }
    
    const result = {
      dependency,
      usedByCount: results.length,
      packages: results
    };
    
    console.log(`Result: ${results.length} packages use ${dependency}`);
    return result;
  }

  async getProjectDependencies(projectName) {
    console.log(`Getting dependencies for project: ${projectName}`);
    const structure = await this.analyzeStructure();
    
    // Find the requested project
    const project = structure.packages.find(p => p.name === projectName || p.name.toLowerCase() === projectName.toLowerCase());
    if (!project) {
      console.log(`Project not found: ${projectName}`);
      return {
        error: `Project "${projectName}" not found in monorepo`,
        availableProjects: structure.packages.map(p => p.name)
      };
    }
    
    console.log(`Found project ${project.name} at ${project.path}`);
    
    try {
      const packageJsonPath = path.join(project.path, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        return {
          error: `No package.json found for project "${projectName}"`,
          path: packageJsonPath
        };
      }
      
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Group all dependencies by type
      const dependencies = Object.entries(packageJson.dependencies || {}).map(([name, version]) => ({ 
        name, version, type: 'dependency' 
      }));
      
      const devDependencies = Object.entries(packageJson.devDependencies || {}).map(([name, version]) => ({ 
        name, version, type: 'devDependency' 
      }));
      
      const peerDependencies = Object.entries(packageJson.peerDependencies || {}).map(([name, version]) => ({ 
        name, version, type: 'peerDependency' 
      }));
      
      // Combine all dependencies
      const allDependencies = [...dependencies, ...devDependencies, ...peerDependencies];
      
      // Categorize dependencies as internal (part of the monorepo) or external
      const packageNames = new Set(structure.packages.map(p => p.name));
      const internalDependencies = allDependencies.filter(dep => packageNames.has(dep.name));
      const externalDependencies = allDependencies.filter(dep => !packageNames.has(dep.name));
      
      return {
        project: project.name,
        path: project.path,
        summary: {
          total: allDependencies.length,
          dependencies: dependencies.length,
          devDependencies: devDependencies.length,
          peerDependencies: peerDependencies.length,
          internal: internalDependencies.length,
          external: externalDependencies.length
        },
        dependencies: {
          all: allDependencies,
          production: dependencies,
          development: devDependencies,
          peer: peerDependencies,
          internal: internalDependencies,
          external: externalDependencies
        }
      };
    } catch (error) {
      console.error(`Error getting dependencies for ${projectName}:`, error);
      return { error: error.message };
    }
  }

  async processQuery(query) {
    // Natural language query processing
    console.log(`Processing query: "${query}"`);
    const queryLower = query.toLowerCase();
    
    // Handle queries about dependencies for specific projects
    const projectDepsMatch = queryLower.match(/(?:what|which|list|show|get|find)(?:\s+(?:are|is))?\s+(?:the\s+)?(?:dependencies|deps)(?:\s+(?:for|of|in|used\s+(?:by|in)))?\s+(?:project|package|proj|pkg)\s+([a-zA-Z0-9\-@/.]+)/i);
    if (projectDepsMatch) {
      const projectName = projectDepsMatch[1].trim();
      console.log(`Detected project dependency query for: ${projectName}`);
      return this.getProjectDependencies(projectName);
    }
    
    // Alternative patterns for project dependency queries
    if ((queryLower.includes('dependencies') || queryLower.includes('deps')) && 
        (queryLower.includes('project') || queryLower.includes('package') || queryLower.includes('for'))) {
      const projectMatch = query.match(/(?:project|package|proj|pkg)\s+([a-zA-Z0-9\-@/.]+)/i);
      if (projectMatch) {
        const projectName = projectMatch[1].trim();
        console.log(`Detected alternative project dependency query for: ${projectName}`);
        return this.getProjectDependencies(projectName);
      }
    }
    
    // Handle questions about dependencies more robustly
    if (queryLower.includes('using') || queryLower.includes('depend')) {
      const dependencyMatch = queryLower.match(/(using|depending on|depend on|use|uses)\s+([a-zA-Z0-9\-@/.]+)/i);
      if (dependencyMatch) {
        const dependency = dependencyMatch[2].trim();
        console.log(`Detected dependency query for: ${dependency}`);
        return this.findPackagesUsingDependency(dependency);
      }
    }
    
    // Simple keyword-based router for common questions
    if (queryLower.includes('version') && queryLower.includes('inconsistent')) {
      return this.findVersionInconsistencies();
    }
    
    if (queryLower.includes('unused') && queryLower.includes('dependencies')) {
      const packageMatch = query.match(/package[s]?\s+([a-zA-Z0-9\-@/]+)/i);
      const packageName = packageMatch ? packageMatch[1] : null;
      return this.findUnusedDependencies(packageName);
    }
    
    if (queryLower.includes('outdated')) {
      return this.findOutdatedDependencies();
    }
    
    if (queryLower.includes('security') || queryLower.includes('vulnerabilities')) {
      return this.findSecurityVulnerabilities();
    }
    
    if (queryLower.includes('circular')) {
      return this.findCircularDependencies();
    }
    
    if (queryLower.includes('graph') || queryLower.includes('dependency') && queryLower.includes('structure')) {
      const packageMatch = query.match(/package[s]?\s+([a-zA-Z0-9\-@/]+)/i);
      const packageName = packageMatch ? packageMatch[1] : null;
      return this.generateDependencyGraph(packageName);
    }
    
    const usingMatch = query.match(/(?:packages|projects)\s+(?:using|depending on)\s+([a-zA-Z0-9\-@/]+)/i);
    if (usingMatch) {
      return this.findPackagesUsingDependency(usingMatch[1]);
    }
    
    // Default to structure overview
    return this.analyzeStructure();
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`MCP NPM Dependencies Server running on port ${this.port}`);
    });
    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('MCP NPM Dependencies Server stopped');
    }
  }
}

module.exports = MCPNpmServer;

// Example usage
if (require.main === module) {
  const server = new MCPNpmServer({
    port: process.env.PORT || 3000,
    monorepoRoot: process.env.MONOREPO_ROOT || process.cwd(),
    packagesDir: process.env.PACKAGES_DIR || 'packages'
  });
  
  server.start();
  
  // Handle graceful shutdown
  const shutdown = () => {
    console.log('Shutting down MCP NPM Dependencies Server...');
    server.stop();
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
