#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { program } = require('commander');
const { saveAndOpenReport, generateTimestampedFilename } = require('../utils/report-utils');

class NxProjectDepsAnalyzer {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.verbose = options.verbose || false;
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
   */
  analyzeAllProjects() {
    const projects = this.getProjects();
    console.log(`\n🔍 Found ${projects.length} projects in Nx workspace`);
    
    const results = {};
    const depUsageCount = {};
    
    projects.forEach(projectName => {
      const analysis = this.analyzeProject(projectName);
      if (analysis) {
        results[projectName] = analysis;
        
        // Count dependency usage across projects
        Object.keys(analysis.dependencies).forEach(dep => {
          depUsageCount[dep] = (depUsageCount[dep] || 0) + 1;
        });
      }
    });
    
    // Sort dependencies by usage count
    const sortedDeps = Object.entries(depUsageCount)
      .sort((a, b) => b[1] - a[1])
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
    
    return {
      projects: results,
      depUsageCount: sortedDeps,
      totalProjects: Object.keys(results).length
    };
  }

  /**
   * Generate HTML report of projects and their dependencies
   */
  generateHtmlReport(analysisResults) {
    const { projects, depUsageCount } = analysisResults;
    
    // Sort projects by dependency count
    const sortedProjects = Object.values(projects).sort((a, b) => 
      Object.keys(b.dependencies).length - Object.keys(a.dependencies).length
    );
    
    // Generate HTML
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nx Monorepo Dependencies Analysis</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        h1, h2, h3 {
            color: #2a3f5f;
        }
        
        .dashboard {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            padding: 20px;
            height: 300px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        
        th {
            background-color: #f8f9fa;
            font-weight: 600;
        }
        
        tr:hover {
            background-color: #f5f5f5;
        }
        
        .search {
            margin-bottom: 20px;
        }
        
        .search input {
            padding: 8px 12px;
            width: 300px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        
        .badge {
            display: inline-block;
            padding: 3px 7px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            margin-right: 5px;
            margin-bottom: 5px;
        }
        
        .badge-primary {
            background-color: #3498db;
            color: white;
        }
        
        .badge-success {
            background-color: #2ecc71;
            color: white;
        }
        
        .badge-warning {
            background-color: #f39c12;
            color: white;
        }
        
        .expand-btn {
            background: none;
            border: none;
            color: #3498db;
            cursor: pointer;
            font-size: 14px;
        }
        
        .project-card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
            overflow: hidden;
        }
        
        .project-header {
            padding: 15px;
            background-color: #f8f9fa;
            border-bottom: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .project-name {
            font-weight: 600;
            margin: 0;
        }
        
        .project-meta {
            font-size: 14px;
            color: #666;
        }
        
        .project-body {
            padding: 15px;
            display: none;
        }
        
        .dep-list {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }
        
        .project-card.expanded .project-body {
            display: block;
        }
    </style>
</head>
<body>
    <h1>Nx Monorepo Dependencies Analysis</h1>
    
    <div class="dashboard">
        <div class="card">
            <h3>Most Used Dependencies</h3>
            <canvas id="depUsageChart"></canvas>
        </div>
        <div class="card">
            <h3>Dependencies Per Project</h3>
            <canvas id="projectDepsChart"></canvas>
        </div>
    </div>
    
    <h2>Project Dependencies</h2>
    <p>Total projects analyzed: ${Object.keys(projects).length}</p>
    
    <div class="search">
        <input type="text" id="searchInput" placeholder="Search projects or dependencies...">
    </div>
    
    <div id="projectList">
        ${sortedProjects.map(project => `
            <div class="project-card" data-project="${project.name}">
                <div class="project-header">
                    <h3 class="project-name">${project.name}</h3>
                    <div class="project-meta">
                        <span class="badge badge-${project.type === 'application' ? 'primary' : 'success'}">
                            ${project.type}
                        </span>
                        <span>${Object.keys(project.dependencies).length} dependencies</span>
                    </div>
                    <button class="expand-btn">Details</button>
                </div>
                <div class="project-body">
                    <p><strong>Project root:</strong> ${project.root}</p>
                    <h4>Dependencies (${Object.keys(project.dependencies).length}):</h4>
                    <div class="dep-list">
                        ${Object.entries(project.dependencies).map(([dep, version]) => 
                            `<span class="badge badge-primary" title="${version}">${dep}</span>`
                        ).join('')}
                    </div>
                    ${project.unmatchedImports.length ? `
                        <h4>Unmatched Imports (${project.unmatchedImports.length}):</h4>
                        <div class="dep-list">
                            ${project.unmatchedImports.map(imp => 
                                `<span class="badge badge-warning">${imp}</span>`
                            ).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('')}
    </div>
    
    <h2>Dependency Usage</h2>
    
    <table id="depsTable">
        <thead>
            <tr>
                <th>Dependency</th>
                <th>Usage Count</th>
                <th>Projects</th>
            </tr>
        </thead>
        <tbody>
            ${Object.entries(depUsageCount).map(([dep, count]) => `
                <tr>
                    <td>${dep}</td>
                    <td>${count}</td>
                    <td>${((count / Object.keys(projects).length) * 100).toFixed(1)}%</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    
    <script>
        // Chart data
        const depUsageData = {
            labels: ${JSON.stringify(Object.keys(depUsageCount).slice(0, 10))},
            datasets: [{
                label: 'Projects Using',
                data: ${JSON.stringify(Object.values(depUsageCount).slice(0, 10))},
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        };
        
        const projectDepsData = {
            labels: ${JSON.stringify(sortedProjects.slice(0, 10).map(p => p.name))},
            datasets: [{
                label: 'Dependencies Count',
                data: ${JSON.stringify(sortedProjects.slice(0, 10).map(p => Object.keys(p.dependencies).length))},
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            }]
        };
        
        // Create charts
        window.addEventListener('load', () => {
            // Dependencies usage chart
            new Chart(document.getElementById('depUsageChart'), {
                type: 'bar',
                data: depUsageData,
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            }
                        }
                    }
                }
            });
            
            // Projects dependencies chart
            new Chart(document.getElementById('projectDepsChart'), {
                type: 'bar',
                data: projectDepsData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            }
                        }
                    }
                }
            });
            
            // Project card expand/collapse
            document.querySelectorAll('.expand-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const card = btn.closest('.project-card');
                    card.classList.toggle('expanded');
                    btn.textContent = card.classList.contains('expanded') ? 'Collapse' : 'Details';
                });
            });
            
            // Search functionality
            document.getElementById('searchInput').addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase();
                
                document.querySelectorAll('.project-card').forEach(card => {
                    const projectName = card.dataset.project.toLowerCase();
                    const deps = Array.from(card.querySelectorAll('.badge'))
                        .map(badge => badge.textContent.toLowerCase());
                    
                    const matches = projectName.includes(searchTerm) || 
                        deps.some(dep => dep.includes(searchTerm));
                    
                    card.style.display = matches ? 'block' : 'none';
                });
                
                // Filter dependency table
                document.querySelectorAll('#depsTable tbody tr').forEach(row => {
                    const depName = row.cells[0].textContent.toLowerCase();
                    row.style.display = depName.includes(searchTerm) ? '' : 'none';
                });
            });
        });
    </script>
</body>
</html>
    `;
  }
}

// Set up command-line interface
program
  .name('nx-project-deps')
  .description('Analyze npm dependencies for specific projects in an Nx monorepo')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze dependencies for all projects')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-o, --output <file>', 'Output HTML report file', '')
  .option('-b, --browser', 'Open the generated report in browser', false)
  .option('-d, --reports-dir <dir>', 'Reports directory', 'deps-reports')
  .action(async (options) => {
    console.log(`🔍 Analyzing dependencies for Nx monorepo at ${options.root}`);
    
    const analyzer = new NxProjectDepsAnalyzer({
      rootDir: options.root,
      verbose: options.verbose
    });
    
    const results = analyzer.analyzeAllProjects();
    
    // Print summary
    console.log('\n📊 Dependencies Analysis Summary:');
    console.log(`Total projects analyzed: ${results.totalProjects}`);
    
    const topDeps = Object.entries(results.depUsageCount)
      .slice(0, 10)
      .map(([dep, count]) => `${dep} (${count} projects)`);
    
    console.log('\nTop 10 most used dependencies:');
    topDeps.forEach((dep, index) => console.log(`${index + 1}. ${dep}`));
    
    // Generate HTML report
    const html = analyzer.generateHtmlReport(results);
    
    // Save report and optionally open in browser
    const defaultFilename = generateTimestampedFilename('project-deps');
    await saveAndOpenReport(html, options.output, options.browser, defaultFilename, options.reportsDir);
    
    console.log(`\n📊 Project dependencies analysis completed successfully`);
  });

program
  .command('project')
  .description('Analyze dependencies for a specific project')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-v, --verbose', 'Enable verbose output', false)
  .requiredOption('-p, --project <name>', 'Project name to analyze')
  .action((options) => {
    console.log(`🔍 Analyzing dependencies for project ${options.project} in Nx monorepo at ${options.root}`);
    
    const analyzer = new NxProjectDepsAnalyzer({
      rootDir: options.root,
      verbose: options.verbose
    });
    
    const analysis = analyzer.analyzeProject(options.project);
    
    if (analysis) {
      console.log('\n📊 Dependencies Analysis Summary:');
      console.log(`Project: ${analysis.name} (${analysis.type})`);
      console.log(`Root: ${analysis.root}`);
      console.log(`Dependencies: ${Object.keys(analysis.dependencies).length}`);
      
      console.log('\nDependencies:');
      Object.entries(analysis.dependencies).forEach(([dep, version]) => {
        console.log(`- ${dep}: ${version}`);
      });
      
      if (analysis.unmatchedImports.length > 0) {
        console.log('\nUnmatched imports:');
        analysis.unmatchedImports.forEach(imp => {
          console.log(`- ${imp}`);
        });
      }
    }
  });

program.parse(process.argv);

// Show help if no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 