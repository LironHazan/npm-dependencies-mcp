#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { program } = require('commander');
const { saveAndOpenReport, generateTimestampedFilename } = require('../utils/report-utils');
const chalk = require('chalk');

// Add axios for fetching npm versions
const axios = require('axios');

class NxProjectDepsAnalyzer {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.verbose = options.verbose || false;
    this.latestVersions = {}; // Cache for latest versions
  }

  /**
   * Log message if verbose mode is enabled
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Get all projects in the Nx workspace
   */
  getProjects() {
    try {
      const output = execSync('npx nx show projects --json', {
        cwd: this.rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      });

      return JSON.parse(output);
    } catch (error) {
      this.log(`Error getting projects: ${error.message}`);
      // Try alternative approach if npx nx show projects fails
      return this.getProjectsFromConfig();
    }
  }

  /**
   * Get projects from workspace configuration files
   */
  getProjectsFromConfig() {
    try {
      // Check for workspace.json or nx.json
      const workspaceJsonPath = path.join(this.rootDir, 'workspace.json');
      const nxJsonPath = path.join(this.rootDir, 'nx.json');

      if (fs.existsSync(workspaceJsonPath)) {
        const workspaceConfig = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf8'));
        return Object.keys(workspaceConfig.projects || {});
      } else if (fs.existsSync(nxJsonPath)) {
        const nxConfig = JSON.parse(fs.readFileSync(nxJsonPath, 'utf8'));
        return Object.keys(nxConfig.projects || {});
      }

      // Fallback to scanning directories
      return this.scanProjectDirectories();
    } catch (error) {
      this.log(`Error reading workspace config: ${error.message}`);
      return this.scanProjectDirectories();
    }
  }

  /**
   * Scan for projects in apps and libs directories
   */
  scanProjectDirectories() {
    const projects = [];
    const directories = ['apps', 'libs'];

    directories.forEach(dir => {
      const dirPath = path.join(this.rootDir, dir);
      if (fs.existsSync(dirPath)) {
        try {
          const items = fs.readdirSync(dirPath)
            .filter(item => fs.statSync(path.join(dirPath, item)).isDirectory());

          items.forEach(item => {
            projects.push(item);
          });
        } catch (error) {
          this.log(`Error scanning ${dir} directory: ${error.message}`);
        }
      }
    });

    return projects;
  }

  /**
   * Get the root package.json content
   */
  getRootPackageJson() {
    try {
      const packageJsonPath = path.join(this.rootDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      }
    } catch (error) {
      this.log(`Error reading root package.json: ${error.message}`);
    }
    return null;
  }

  /**
   * Get project configuration information
   */
  getProjectConfig(projectName) {
    try {
      const output = execSync(`npx nx show project ${projectName} --json`, {
        cwd: this.rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      });

      return JSON.parse(output);
    } catch (error) {
      this.log(`Error getting project config for ${projectName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get the tsconfig.json for a project
   */
  getProjectTsConfig(projectRoot) {
    try {
      const tsConfigPath = path.join(this.rootDir, projectRoot, 'tsconfig.json');
      if (fs.existsSync(tsConfigPath)) {
        return JSON.parse(fs.readFileSync(tsConfigPath, 'utf8'));
      }

      // Check for tsconfig.app.json or tsconfig.lib.json
      const altFiles = ['tsconfig.app.json', 'tsconfig.lib.json'];
      for (const file of altFiles) {
        const altPath = path.join(this.rootDir, projectRoot, file);
        if (fs.existsSync(altPath)) {
          return JSON.parse(fs.readFileSync(altPath, 'utf8'));
        }
      }
    } catch (error) {
      this.log(`Error reading tsconfig for ${projectRoot}: ${error.message}`);
    }
    return null;
  }

  /**
   * Get all import statements in TS/JS files in a project
   */
  getProjectImports(projectRoot) {
    try {
      const projectPath = path.join(this.rootDir, projectRoot);
      
      // Find all TS/JS files in the project
      const output = execSync(
        `find ${projectPath} -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | xargs grep -l "import.*from" || true`,
        { 
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
        }
      );
      
      const files = output.split('\n').filter(Boolean);
      const imports = new Set();
      
      // Extract import statements from each file
      files.forEach(file => {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const importRegex = /import\s+(?:(?:{[^}]*}|\*\s+as\s+[^;]+|[^;{]*)\s+from\s+)?['"]([^'"]+)['"]/g;
          let match;
          
          while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            if (!importPath.startsWith('.')) {
              // Only collect external imports (not relative imports)
              const packageName = importPath.split('/')[0];
              imports.add(packageName);
            }
          }
        } catch (error) {
          this.log(`Error processing file ${file}: ${error.message}`);
        }
      });
      
      return Array.from(imports);
    } catch (error) {
      this.log(`Error getting imports for ${projectRoot}: ${error.message}`);
      return [];
    }
  }

  /**
   * Analyze a single project's dependencies
   */
  analyzeProject(projectName) {
    console.log(`\n📦 Analyzing dependencies for project: ${projectName}`);
    
    // Get project configuration
    const projectConfig = this.getProjectConfig(projectName);
    if (!projectConfig) {
      console.log(`❌ Could not find configuration for project: ${projectName}`);
      return null;
    }
    
    const projectRoot = projectConfig.root;
    console.log(`📂 Project root: ${projectRoot}`);
    console.log(`🏷️ Project type: ${projectConfig.projectType || 'unknown'}`);
    
    // Get root package.json
    const rootPackageJson = this.getRootPackageJson();
    if (!rootPackageJson) {
      console.log('❌ Could not find root package.json');
      return null;
    }
    
    // Get project tsconfig.json (if any)
    const tsConfig = this.getProjectTsConfig(projectRoot);
    const hasTsConfig = !!tsConfig;
    
    // Get all imports in the project
    console.log('🔍 Scanning source files for import statements...');
    const imports = this.getProjectImports(projectRoot);
    console.log(`📊 Found ${imports.length} unique package imports`);
    
    // Match imports with root dependencies
    const rootDeps = {
      ...rootPackageJson.dependencies || {},
      ...rootPackageJson.devDependencies || {},
      ...rootPackageJson.peerDependencies || {}
    };
    
    const matchedDeps = {};
    const unmatchedImports = [];
    
    imports.forEach(importName => {
      if (rootDeps[importName]) {
        matchedDeps[importName] = rootDeps[importName];
      } else if (importName.startsWith('@')) {
        // Check for scoped packages
        const scope = importName.split('/')[0];
        const matchingDeps = Object.keys(rootDeps).filter(dep => dep.startsWith(scope + '/'));
        
        if (matchingDeps.length > 0) {
          matchingDeps.forEach(dep => {
            matchedDeps[dep] = rootDeps[dep];
          });
        } else {
          unmatchedImports.push(importName);
        }
      } else {
        unmatchedImports.push(importName);
      }
    });
    
    return {
      name: projectName,
      root: projectRoot,
      type: projectConfig.projectType || 'unknown',
      hasTsConfig,
      dependencies: matchedDeps,
      unmatchedImports,
      totalMatched: Object.keys(matchedDeps).length,
      totalUnmatched: unmatchedImports.length
    };
  }

  /**
   * Analyze all projects in the workspace
   * @param {boolean} npmOnly - If true, only include projects with npm dependencies
   */
  analyzeAllProjects(npmOnly = false) {
    const projects = this.getProjects();
    console.log(`\n🔍 Found ${projects.length} projects in Nx workspace`);
    
    const results = {};
    const depUsageCount = {};
    let npmProjectCount = 0;
    let skippedProjectCount = 0;
    
    projects.forEach(projectName => {
      const analysis = this.analyzeProject(projectName);
      if (analysis) {
        const hasDependencies = Object.keys(analysis.dependencies).length > 0;
        
        // If npmOnly is true, only include projects with npm dependencies
        if (!npmOnly || hasDependencies) {
          results[projectName] = analysis;
          
          if (hasDependencies) {
            npmProjectCount++;
          }
          
          // Count dependency usage across projects
          Object.keys(analysis.dependencies).forEach(dep => {
            depUsageCount[dep] = (depUsageCount[dep] || 0) + 1;
          });
        } else {
          skippedProjectCount++;
          this.log(`Skipping project ${projectName} (no npm dependencies)`);
        }
      }
    });
    
    if (npmOnly) {
      console.log(`\n📦 Showing ${npmProjectCount} npm projects (skipped ${skippedProjectCount} projects with no dependencies)`);
    }
    
    // Sort dependencies by usage count
    const sortedDeps = Object.entries(depUsageCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
    
    return {
      projects: results,
      depUsageCount: sortedDeps,
      totalProjects: Object.keys(results).length,
      npmOnly: npmOnly
    };
  }

  /**
   * Generate HTML report of projects and their dependencies
   */
  generateHtmlReport(analysisResults) {
    const { projects, depUsageCount, npmOnly } = analysisResults;
    
    // Initialize latestVersions if missing
    Object.values(projects).forEach(project => {
      if (!project.latestVersions) {
        project.latestVersions = {};
      }
    });
    
    // Store latestVersions in the instance for use in the report
    this.latestVersionsCache = {};
    
    // Collect latest versions from all projects
    Object.values(projects).forEach(project => {
      if (project.latestVersions) {
        Object.entries(project.latestVersions).forEach(([dep, version]) => {
          if (version) {
            this.latestVersionsCache[dep] = version;
          }
        });
      }
    });
    
    // Sort projects by dependency count
    const sortedProjects = Object.entries(projects)
      .map(([project, projectData]) => ({ 
        project, 
        count: Object.keys(projectData.dependencies || {}).length,
        root: projectData.root,
        type: projectData.type,
        dependencies: projectData.dependencies || {},
        unmatchedImports: projectData.unmatchedImports || []
      }))
      .sort((a, b) => b.count - a.count);
    
    // Generate ultra-simple HTML with minimal styling
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nx Monorepo Dependencies Analysis ${npmOnly ? '(npm projects only)' : ''}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
            line-height: 1.4;
            margin: 20px;
            color: #333;
        }
        
        table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 20px;
            font-size: 14px;
        }
        
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        
        th {
            background-color: #f2f2f2;
            font-weight: bold;
        }
        
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        .project-header {
            margin: 20px 0 10px 0;
            padding-bottom: 5px;
            border-bottom: 1px solid #eee;
        }
        
        .outdated {
            background-color: #fff3cd;
        }
        
        .current {
            background-color: #d4edda;
        }
        
        .filter-notice {
            background-color: #e7f5fe;
            padding: 10px;
            margin-bottom: 20px;
            border-left: 4px solid #0066cc;
        }
        
        .search {
            margin-bottom: 20px;
        }
        
        input[type="text"] {
            padding: 8px;
            width: 300px;
            border: 1px solid #ddd;
        }

        code {
            font-family: monospace;
            padding: 1px 5px;
            background-color: #f5f5f5;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <h1>Nx Monorepo Dependencies Analysis</h1>
    
    ${npmOnly ? `
    <div class="filter-notice">
        <p>Showing only projects with npm dependencies (${sortedProjects.length} of ${Object.values(projects).length} total projects)</p>
    </div>
    ` : ''}
    
    <h2>Most Used Dependencies</h2>
    <table>
        <tr>
            <th>Dependency</th>
            <th>Usage Count</th>
            <th>Current Version</th>
            <th>Latest Version</th>
        </tr>
        ${Object.entries(depUsageCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([dep, count]) => {
            const version = Object.values(projects).find(p => p.dependencies && p.dependencies[dep])?.dependencies[dep] || '';
            const latestVersion = this.latestVersionsCache[dep] || 'N/A';
            const isOutdated = version !== latestVersion && latestVersion !== 'N/A';
            
            return `
            <tr>
                <td><strong>${dep}</strong></td>
                <td>${count} projects</td>
                <td><code>${version}</code></td>
                <td class="${isOutdated ? 'outdated' : 'current'}"><code>${latestVersion}</code></td>
            </tr>
            `;
          }).join('')}
    </table>
    
    <div class="search">
        <input type="text" id="searchInput" placeholder="Filter by project name or dependency...">
    </div>
    
    <h2>Project Details</h2>
    
    ${sortedProjects.map(project => `
        <div class="project-item" data-project="${project.project}">
            <h3 class="project-header">${project.project} (${project.type}) - ${project.count} dependencies</h3>
            <p>Project root: ${project.root}</p>
            
            ${project.count > 0 ? `
            <table class="deps-table">
                <tr>
                    <th>Dependency</th>
                    <th>Current Version</th>
                    <th>Latest Version</th>
                </tr>
                ${Object.entries(project.dependencies || {}).map(([dep, version]) => {
                    const latestVersion = this.latestVersionsCache[dep] || 'N/A';
                    const isOutdated = version !== latestVersion && latestVersion !== 'N/A';
                    
                    return `
                    <tr>
                        <td>${dep}</td>
                        <td><code>${version}</code></td>
                        <td class="${isOutdated ? 'outdated' : 'current'}"><code>${latestVersion}</code></td>
                    </tr>
                    `;
                }).join('')}
            </table>
            ` : '<p>No dependencies found.</p>'}
            
            ${project.unmatchedImports && project.unmatchedImports.length ? `
                <p><strong>Unmatched Imports (${project.unmatchedImports.length}):</strong> ${project.unmatchedImports.join(', ')}</p>
            ` : ''}
        </div>
    `).join('')}
    
    <script>
        // Simple search functionality
        document.getElementById('searchInput').addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            
            document.querySelectorAll('.project-item').forEach(function(item) {
                const projectName = item.dataset.project.toLowerCase();
                const projectContent = item.textContent.toLowerCase();
                
                if (projectName.includes(searchTerm) || projectContent.includes(searchTerm)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    </script>
</body>
</html>
`;
  }

  async fetchLatestVersions(dependencies, skipLatest = false) {
    if (skipLatest) {
      console.log('Skipping fetching latest versions (--skip-latest flag set)');
      return {};
    }

    console.log('\n📡 Fetching latest versions from npm registry...');
    const results = {};
    const batchSize = 5; // Process in smaller batches to avoid rate limiting
    const depList = Object.keys(dependencies);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < depList.length; i += batchSize) {
      const batch = depList.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(depList.length/batchSize)} (${i+1}-${Math.min(i+batchSize, depList.length)} of ${depList.length} dependencies)`);
      
      await Promise.all(batch.map(async (dep) => {
        try {
          const response = await axios.get(`https://registry.npmjs.org/${dep}/latest`, {
            timeout: 5000,
            headers: { 'User-Agent': 'nx-dependency-analyzer' }
          });
          
          if (response.status === 200 && response.data && response.data.version) {
            results[dep] = response.data.version;
            success++;
          } else {
            console.log(`Warning: Unexpected response for ${dep}`);
            failed++;
          }
        } catch (error) {
          console.log(`Error fetching version for ${dep}: ${error.message}`);
          failed++;
        }
      }));
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < depList.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`✅ Completed version check: ${success} successful, ${failed} failed`);
    return results;
  }
}

// Handle command line arguments
program
  .name('nx-project-deps')
  .description('Analyze dependencies in an Nx monorepo')
  .version('1.0.0');

program
  .command('project')
  .description('Analyze dependencies of projects in an Nx workspace')
  .requiredOption('--root <path>', 'Path to the root of the Nx workspace')
  .option('--project <projectName>', 'Name of the project to analyze')
  .option('-v, --verbose', 'Enable verbose output')
  .option('-b, --browser', 'Open the report in a browser after generation', false)
  .option('-s, --skip-latest', 'Skip fetching latest versions from npm registry', false)
  .option('-n, --npm-only', 'Show only projects with npm dependencies', false)
  .action(async (options) => {
    const analyzer = new NxProjectDepsAnalyzer({
      rootDir: options.root,
      verbose: options.verbose
    });
    
    let analysis;
    
    if (options.project) {
      const project = analyzer.analyzeProject(options.project);
      if (project) {
        console.log('\n✅ Analysis complete for project:', options.project);
        
        // Collect all dependencies from the project
        const allDeps = {};
        Object.entries(project.dependencies).forEach(([dep, version]) => {
          allDeps[dep] = version;
        });
        
        // Fetch latest versions if not skipped
        project.latestVersions = options.skipLatest ? {} : await analyzer.fetchLatestVersions(allDeps, options.skipLatest);
        
        analysis = {
          projects: { [options.project]: project },
          depUsageCount: {},
          totalProjects: 1,
          npmOnly: false
        };
        
        // Count dependency usage for this single project
        Object.keys(project.dependencies).forEach(dep => {
          analysis.depUsageCount[dep] = 1;
        });
      } else {
        console.error('❌ Failed to analyze project:', options.project);
        process.exit(1);
      }
    } else {
      // Analyze all projects
      analysis = analyzer.analyzeAllProjects(options.npmOnly);
      console.log('\n✅ Analysis complete for all projects');
      
      // Collect all unique dependencies across all projects
      const allDeps = {};
      Object.values(analysis.projects).forEach(project => {
        Object.entries(project.dependencies).forEach(([dep, version]) => {
          allDeps[dep] = version;
        });
      });
      
      // Log top 5 most used dependencies
      console.log(chalk.bold.blueBright("\nTop 5 most used dependencies:"));
      Object.entries(analysis.depUsageCount)
        .forEach(([dep, count]) => {
          console.log(`${dep}: ${count} project${count !== 1 ? 's' : ''}`);
        });
      
      // Fetch latest versions if not skipped
      const latestVersions = options.skipLatest ? {} : await analyzer.fetchLatestVersions(allDeps, options.skipLatest);
      
      // Add latest versions to each project
      Object.values(analysis.projects).forEach(project => {
        project.latestVersions = {};
        Object.keys(project.dependencies).forEach(dep => {
          if (latestVersions[dep]) {
            project.latestVersions[dep] = latestVersions[dep];
          }
        });
      });
    }
    
    // Generate HTML report
    const report = analyzer.generateHtmlReport(analysis);
    
    // Save the report
    const filename = generateTimestampedFilename('project-deps');
    await saveAndOpenReport(report, '', options.browser === true, filename);
  });

// Ensure command processing
program.parse(process.argv);

module.exports = NxProjectDepsAnalyzer;