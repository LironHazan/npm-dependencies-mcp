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
      .map(([project, projectData]) => ({ project, count: Object.keys(projectData.dependencies).length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Generate HTML
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nx Monorepo Dependencies Analysis ${npmOnly ? '(npm projects only)' : ''}</title>
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
            grid-template-columns: 1fr;
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        @media (min-width: 992px) {
            .dashboard {
                grid-template-columns: 1fr 1fr;
            }
        }
        
        canvas {
            min-height: 300px;
        }
        
        .card {
            background-color: white;
            border-radius: 12px;
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.07);
            margin-bottom: 1.5rem;
            padding: 1.5rem;
            transition: all 0.3s ease;
        }
        
        .card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
        }
        
        .card h3 {
            margin-top: 0;
            margin-bottom: 1rem;
            color: #333;
            font-weight: 500;
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
            padding: 5px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            margin-right: 8px;
            margin-bottom: 8px;
            white-space: nowrap;
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
        
        .badge small {
            opacity: 0.8;
            font-weight: 400;
            margin-left: 3px;
        }
        
        code {
            background-color: #f5f5f5;
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 90%;
            color: #e83e8c;
        }

        .deps-table-container {
            margin-bottom: 20px;
            max-height: 300px;
            overflow-y: auto;
            border-radius: 4px;
            border: 1px solid #eee;
        }
        
        .deps-table {
            width: 100%;
            font-size: 13px;
            border-collapse: collapse;
            margin-bottom: 0;
        }
        
        .deps-table th {
            position: sticky;
            top: 0;
            background-color: #f8f9fa;
            z-index: 10;
            font-weight: 600;
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
            cursor: pointer;
            user-select: none;
        }
        
        .deps-table th:hover {
            background-color: #e9ecef;
        }
        
        .deps-table th::after {
            content: "";
            margin-left: 5px;
        }
        
        .deps-table th.sort-asc::after {
            content: "▲";
            font-size: 10px;
        }
        
        .deps-table th.sort-desc::after {
            content: "▼";
            font-size: 10px;
        }
        
        .deps-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #eee;
        }
        
        .deps-table tr:last-child td {
            border-bottom: none;
        }
        
        .deps-table tr:hover {
            background-color: #f5f5f5;
        }

        .version-outdated {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeeba;
        }
        
        .version-current {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .version-unknown {
            color: #6c757d;
            font-style: italic;
        }
        
        .filter-notice {
            background-color: #e7f5fe;
            color: #004085;
            padding: 10px 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            border-left: 4px solid #b8daff;
        }
        
        .filter-notice p {
            margin: 0;
        }
    </style>
</head>
<body>
    <h1>Nx Monorepo Dependencies Analysis</h1>
    ${npmOnly ? `
    <div class="filter-notice">
        <p>🔍 <strong>Filter active:</strong> Showing only projects with npm dependencies</p>
    </div>
    ` : ''}
    
    <div class="dashboard">
        <div class="card">
            <h3>Top 5 Most Used Dependencies</h3>
            <canvas id="depUsageChart"></canvas>
        </div>
        <div class="card">
            <h3>Top 5 Projects with Most Dependencies</h3>
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
            <div class="project-card" data-project="${project.project}">
                <div class="project-header">
                    <h3 class="project-name">${project.project}</h3>
                    <div class="project-meta">
                        <span class="badge badge-${project.type === 'application' ? 'primary' : 'success'}">
                            ${project.type}
                        </span>
                        <span>${project.count} dependencies</span>
                    </div>
                    <button class="expand-btn">Details</button>
                </div>
                <div class="project-body">
                    <p><strong>Project root:</strong> ${project.root}</p>
                    <h4>Dependencies (${project.count}):</h4>
                    ${project.count > 0 ? `
                    <div class="deps-table-container">
                        <table class="deps-table">
                            <thead>
                                <tr>
                                    <th>Dependency</th>
                                    <th>Current Version</th>
                                    <th>Latest Version</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(project.dependencies).map(([dep, version]) => `
                                <tr>
                                    <td>${dep}</td>
                                    <td><code>${version}</code></td>
                                    <td>
                                        ${this.latestVersionsCache && this.latestVersionsCache[dep] ? 
                                            `<code class="${version !== this.latestVersionsCache[dep] ? 'version-outdated' : 'version-current'}">${this.latestVersionsCache[dep]}</code>` : 
                                            '<span class="version-unknown">N/A</span>'}
                                    </td>
                                </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ` : '<p>No dependencies found.</p>'}
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
                <th>Current Version</th>
                <th>Latest Version</th>
                <th>Usage Count</th>
                <th>Projects</th>
            </tr>
        </thead>
        <tbody>
            ${Object.entries(depUsageCount).map(([dep, count]) => {
                // Get the version from the first project that uses this dependency
                const version = Object.values(projects).find(p => p.dependencies[dep])?.dependencies[dep] || '';
                return `
                <tr>
                    <td>${dep}</td>
                    <td><code>${version}</code></td>
                    <td>
                        ${this.latestVersionsCache && this.latestVersionsCache[dep] ? 
                            `<code class="${version !== this.latestVersionsCache[dep] ? 'version-outdated' : 'version-current'}">${this.latestVersionsCache[dep]}</code>` : 
                            '<span class="version-unknown">N/A</span>'}
                    </td>
                    <td>${count}</td>
                    <td>${((count / Object.keys(projects).length) * 100).toFixed(1)}%</td>
                </tr>
                `;
            }).join('')}
        </tbody>
    </table>
    
    <script>
        // Chart data
        const depUsageData = {
            labels: ${JSON.stringify(Object.keys(depUsageCount).slice(0, 5))},
            datasets: [{
                label: 'Number of Projects',
                data: ${JSON.stringify(Object.values(depUsageCount).slice(0, 5))},
                backgroundColor: [
                    'rgba(66, 133, 244, 0.7)',  // Google Blue
                    'rgba(219, 68, 55, 0.7)',   // Google Red
                    'rgba(244, 180, 0, 0.7)',   // Google Yellow
                    'rgba(15, 157, 88, 0.7)',   // Google Green
                    'rgba(66, 133, 244, 0.5)'   // Light Blue
                ],
                borderColor: [
                    'rgba(66, 133, 244, 1)',
                    'rgba(219, 68, 55, 1)',
                    'rgba(244, 180, 0, 1)',
                    'rgba(15, 157, 88, 1)',
                    'rgba(66, 133, 244, 0.8)'
                ],
                borderWidth: 1,
                borderRadius: 6
            }]
        };
        
        const projectDepsData = {
            labels: ${JSON.stringify(sortedProjects.slice(0, 5).map(p => p.project))},
            datasets: [{
                label: 'Dependency Count',
                data: ${JSON.stringify(sortedProjects.slice(0, 5).map(p => p.count))},
                backgroundColor: [
                    'rgba(15, 157, 88, 0.7)',   // Google Green
                    'rgba(244, 180, 0, 0.7)',   // Google Yellow
                    'rgba(219, 68, 55, 0.7)',   // Google Red
                    'rgba(66, 133, 244, 0.7)',  // Google Blue
                    'rgba(15, 157, 88, 0.5)'    // Light Green
                ],
                borderColor: [
                    'rgba(15, 157, 88, 1)',
                    'rgba(244, 180, 0, 1)',
                    'rgba(219, 68, 55, 1)',
                    'rgba(66, 133, 244, 1)',
                    'rgba(15, 157, 88, 0.8)'
                ],
                borderWidth: 1,
                borderRadius: 6
            }]
        };
        
        // Create charts
        window.addEventListener('load', () => {
            const depUsageCtx = document.getElementById('depUsageChart').getContext('2d');
            const projectDepsCtx = document.getElementById('projectDepsChart').getContext('2d');
            
            // Set global chart defaults
            Chart.defaults.font.family = "'Roboto', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif";
            Chart.defaults.font.size = 14;
            Chart.defaults.color = '#555';
            
            new Chart(depUsageCtx, {
                type: 'bar',
                data: depUsageData,
                options: {
                    indexAxis: 'y',
                    plugins: {
                        title: {
                            display: true,
                            text: 'Top 5 Most Used Dependencies',
                            font: {
                                size: 16,
                                weight: 'bold'
                            },
                            padding: {
                                bottom: 20
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return "Used in " + context.raw + " projects";
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            },
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Number of Projects'
                            }
                        }
                    },
                    maintainAspectRatio: false
                }
            });
            
            new Chart(projectDepsCtx, {
                type: 'bar',
                data: projectDepsData,
                options: {
                    plugins: {
                        title: {
                            display: true,
                            text: 'Top 5 Projects with Most Dependencies',
                            font: {
                                size: 16,
                                weight: 'bold'
                            },
                            padding: {
                                bottom: 20
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.raw + " dependencies";
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            },
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Number of Dependencies'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        }
                    },
                    maintainAspectRatio: false
                }
            });
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
        document.getElementById("searchInput").addEventListener("input", function() {
            const searchTerm = this.value.toLowerCase();
            
            document.querySelectorAll(".project-card").forEach(function(card) {
                const projectName = card.dataset.project.toLowerCase();
                
                // Check dependencies in the project table
                const depMatches = Array.from(card.querySelectorAll(".deps-table tbody tr")).some(function(row) {
                    const depName = row.cells[0].textContent.toLowerCase();
                    const depVersion = row.cells[1].textContent.toLowerCase();
                    return depName.includes(searchTerm) || depVersion.includes(searchTerm);
                });
                
                // Check unmatched imports in badges
                const unmatchedMatches = Array.from(card.querySelectorAll(".badge"))
                    .some(function(badge) {
                        return badge.textContent.toLowerCase().includes(searchTerm);
                    });
                
                const matches = projectName.includes(searchTerm) || depMatches || unmatchedMatches;
                
                card.style.display = matches ? "block" : "none";
            });
            
            // Filter main dependency table
            document.querySelectorAll("#depsTable tbody tr").forEach(function(row) {
                const depName = row.cells[0].textContent.toLowerCase();
                const depVersion = row.cells[1].textContent.toLowerCase();
                row.style.display = depName.includes(searchTerm) || depVersion.includes(searchTerm) ? "" : "none";
            });
        });

        // Table sorting functionality
        const sortTable = function(table, column, asc = true) {
            const dirModifier = asc ? 1 : -1;
            const tBody = table.querySelector("tbody");
            const rows = Array.from(tBody.querySelectorAll("tr"));
            
            // Sort each row
            const sortedRows = rows.sort((a, b) => {
                const aColText = a.querySelector("td:nth-child(" + (column + 1) + ")").textContent.trim();
                const bColText = b.querySelector("td:nth-child(" + (column + 1) + ")").textContent.trim();
                
                // Compare version strings if it's the version column
                if (column === 1) {
                    // Try to compare as semantic versions
                    const aVersion = aColText.replace(/[^\d.]/g, "").split(".").map(Number);
                    const bVersion = bColText.replace(/[^\d.]/g, "").split(".").map(Number);
                    
                    for (let i = 0; i < Math.max(aVersion.length, bVersion.length); i++) {
                        const aVal = aVersion[i] || 0;
                        const bVal = bVersion[i] || 0;
                        if (aVal !== bVal) {
                            return (aVal - bVal) * dirModifier;
                        }
                    }
                }
                
                return aColText.localeCompare(bColText) * dirModifier;
            });
            
            // Remove all existing rows from the table
            while (tBody.firstChild) {
                tBody.removeChild(tBody.firstChild);
            }
            
            // Add sorted rows
            tBody.append.apply(tBody, sortedRows);
            
            // Remember how the column is currently sorted
            table.querySelectorAll("th").forEach(th => th.classList.remove("sort-asc", "sort-desc"));
            table.querySelector("th:nth-child(" + (column + 1) + ")").classList.toggle("sort-asc", asc);
            table.querySelector("th:nth-child(" + (column + 1) + ")").classList.toggle("sort-desc", !asc);
        };
        
        // Add event listeners to all dependency table headers
        document.querySelectorAll(".deps-table th").forEach(function(headerCell, index) {
            headerCell.addEventListener("click", function() {
                const table = headerCell.closest("table");
                const currentIsAscending = headerCell.classList.contains("sort-asc");
                sortTable(table, index, !currentIsAscending);
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

module.exports = NxProjectDepsAnalyzer;