#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { program } = require('commander');
const { saveAndOpenReport, generateTimestampedFilename } = require('../utils/report-utils');

// Custom class to analyze Nx monorepo with root-level dependencies
class NxMonorepoAnalyzer {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.appsDir = options.appsDir || 'apps';
    this.libsDir = options.libsDir || 'libs';
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
   * Read package.json from specified path
   */
  readPackageJson(packagePath) {
    try {
      const packageJsonPath = path.join(packagePath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const content = fs.readFileSync(packageJsonPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      this.log(`Error reading package.json at ${packagePath}: ${error.message}`);
    }
    return null;
  }

  /**
   * Get all projects (apps and libs) in the monorepo
   */
  getProjects() {
    // Read workspace.json or nx.json if available
    let workspaceConfig = null;
    const workspaceJsonPath = path.join(this.rootDir, 'workspace.json');
    const nxJsonPath = path.join(this.rootDir, 'nx.json');
    
    if (fs.existsSync(workspaceJsonPath)) {
      try {
        workspaceConfig = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf8'));
        this.log('Found workspace.json configuration');
      } catch (error) {
        this.log(`Error reading workspace.json: ${error.message}`);
      }
    } else if (fs.existsSync(nxJsonPath)) {
      try {
        workspaceConfig = JSON.parse(fs.readFileSync(nxJsonPath, 'utf8'));
        this.log('Found nx.json configuration');
      } catch (error) {
        this.log(`Error reading nx.json: ${error.message}`);
      }
    }

    // Get project list from Nx if available
    let nxProjects = [];
    try {
      // Try to get project list from 'nx show projects' command
      const nxOutput = execSync('npx nx show projects', { 
        cwd: this.rootDir, 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      });
      nxProjects = nxOutput.split('\n').filter(Boolean);
      this.log(`Found ${nxProjects.length} projects from Nx command`);
    } catch (error) {
      this.log(`Error running Nx command: ${error.message}`);
      // Fallback to directory scanning if nx command fails
      nxProjects = this.getProjectsFromDirectories();
      this.log(`Found ${nxProjects.length} projects from directory scanning`);
    }

    return nxProjects;
  }

  /**
   * Fallback method to get projects by scanning directories
   */
  getProjectsFromDirectories() {
    const projects = [];

    // Check apps directory
    const appsPath = path.join(this.rootDir, this.appsDir);
    if (fs.existsSync(appsPath)) {
      try {
        const apps = fs.readdirSync(appsPath)
          .filter(file => fs.statSync(path.join(appsPath, file)).isDirectory());
        
        apps.forEach(app => {
          projects.push({
            name: app,
            type: 'app',
            path: path.relative(this.rootDir, path.join(appsPath, app))
          });
        });
      } catch (error) {
        this.log(`Error scanning apps directory: ${error.message}`);
      }
    }

    // Check libs directory
    const libsPath = path.join(this.rootDir, this.libsDir);
    if (fs.existsSync(libsPath)) {
      try {
        const libs = fs.readdirSync(libsPath)
          .filter(file => fs.statSync(path.join(libsPath, file)).isDirectory());
        
        libs.forEach(lib => {
          projects.push({
            name: lib,
            type: 'lib',
            path: path.relative(this.rootDir, path.join(libsPath, lib))
          });
        });
      } catch (error) {
        this.log(`Error scanning libs directory: ${error.message}`);
      }
    }

    return projects;
  }

  /**
   * Analyze dependencies from the root package.json
   */
  analyzeRootDependencies() {
    const rootPackageJson = this.readPackageJson(this.rootDir);
    if (!rootPackageJson) {
      console.error('❌ Root package.json not found!');
      return null;
    }

    // Extract all dependencies
    const dependencies = { 
      ...(rootPackageJson.dependencies || {}),
      ...(rootPackageJson.devDependencies || {}),
      ...(rootPackageJson.peerDependencies || {})
    };

    // Count by category
    const analysis = {
      name: rootPackageJson.name || 'Unknown',
      version: rootPackageJson.version || 'Unknown',
      totalDependencies: Object.keys(dependencies).length,
      dependencies: Object.keys(rootPackageJson.dependencies || {}).length,
      devDependencies: Object.keys(rootPackageJson.devDependencies || {}).length,
      peerDependencies: Object.keys(rootPackageJson.peerDependencies || {}).length,
      projects: this.getProjects(),
      framework: this.detectFramework(rootPackageJson)
    };

    // Detect Nx version
    try {
      const nxVersion = execSync('npx nx --version', {
        cwd: this.rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      }).trim();
      analysis.nxVersion = nxVersion;
    } catch (error) {
      this.log(`Error getting Nx version: ${error.message}`);
      analysis.nxVersion = 'Unknown';
    }

    return {
      ...analysis,
      packageJson: rootPackageJson
    };
  }

  /**
   * Detect frameworks used in the project
   */
  detectFramework(packageJson) {
    const frameworks = [];
    const deps = { 
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {})
    };

    // React detection
    if (deps['react'] && deps['react-dom']) {
      frameworks.push('React');
    }

    // Angular detection
    if (deps['@angular/core']) {
      frameworks.push('Angular');
    }

    // Vue detection
    if (deps['vue']) {
      frameworks.push('Vue');
    }

    // Node.js/Express detection
    if (deps['express']) {
      frameworks.push('Express');
    }

    // NestJS detection
    if (deps['@nestjs/core']) {
      frameworks.push('NestJS');
    }

    // GraphQL detection
    if (deps['graphql'] || deps['@apollo/client'] || deps['apollo-server']) {
      frameworks.push('GraphQL');
    }

    return frameworks;
  }

  /**
   * Analyze project imports to find internal dependencies
   */
  async analyzeProjectImports() {
    // Try to run npx nx graph to get dependency information
    try {
      const rawData = execSync('npx nx graph --file=nx-dep-graph.json', {
        cwd: this.rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      });
      
      // Read the generated file
      const graphFile = path.join(this.rootDir, 'nx-dep-graph.json');
      if (fs.existsSync(graphFile)) {
        const graphData = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
        
        // Clean up the generated file
        try {
          fs.unlinkSync(graphFile);
        } catch (err) {
          this.log(`Could not delete nx-dep-graph.json: ${err.message}`);
        }
        
        return this.processNxGraph(graphData);
      }
    } catch (error) {
      this.log(`Error generating Nx dependency graph: ${error.message}`);
    }
    
    return null;
  }
  
  /**
   * Process the Nx graph data
   */
  processNxGraph(graphData) {
    if (!graphData || !graphData.graph || !graphData.graph.dependencies) {
      return null;
    }
    
    const projectDependencies = {};
    
    // Process each project's dependencies
    Object.keys(graphData.graph.dependencies).forEach(projectName => {
      const dependencies = graphData.graph.dependencies[projectName];
      
      projectDependencies[projectName] = {
        dependencies: dependencies.map(dep => dep.target),
        type: 'unknown'
      };
    });
    
    // Get project types from graph nodes
    if (graphData.graph.nodes) {
      Object.keys(graphData.graph.nodes).forEach(nodeName => {
        if (projectDependencies[nodeName]) {
          const node = graphData.graph.nodes[nodeName];
          projectDependencies[nodeName].type = node.type || 'unknown';
        }
      });
    }
    
    return projectDependencies;
  }

  /**
   * Analyze package.json and tsconfig.json files for all projects
   */
  analyzeAllProjects() {
    const rootPackageJson = this.readPackageJson(this.rootDir);
    if (!rootPackageJson) {
      console.error('❌ Root package.json not found');
      return null;
    }

    const projects = this.getProjects();
    
    // Get full analysis
    const analysis = {
      name: rootPackageJson.name,
      version: rootPackageJson.version,
      projects: projects.map(project => {
        if (typeof project === 'string') {
          return { name: project, type: 'unknown' };
        }
        return project;
      }),
      totalProjects: projects.length,
      dependencies: Object.keys(rootPackageJson.dependencies || {}).length,
      devDependencies: Object.keys(rootPackageJson.devDependencies || {}).length,
      peerDependencies: Object.keys(rootPackageJson.peerDependencies || {}).length,
      totalDependencies: Object.keys({
        ...(rootPackageJson.dependencies || {}),
        ...(rootPackageJson.devDependencies || {}),
        ...(rootPackageJson.peerDependencies || {})
      }).length
    };

    return analysis;
  }

  /**
   * Generate HTML report from analysis results
   */
  generateHtmlReport(rootAnalysis, projectsInfo, projectDeps) {
    // Format frameworks as a string
    const frameworksStr = rootAnalysis.framework.join(', ') || 'None detected';
    
    // Count project types
    const projectTypes = {};
    projectsInfo.projects.forEach(project => {
      const type = project.type || 'unknown';
      projectTypes[type] = (projectTypes[type] || 0) + 1;
    });
    
    // Format project dependencies for visualization
    const projectDepsData = [];
    if (projectDeps) {
      Object.keys(projectDeps).forEach(projectName => {
        const project = projectDeps[projectName];
        if (project.dependencies.length > 0) {
          projectDepsData.push({
            id: projectName,
            type: project.type,
            dependencies: project.dependencies
          });
        }
      });
    }
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nx Monorepo Analysis Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://d3js.org/d3.v7.min.js"></script>
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
    
    .header {
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid #eee;
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
    
    .info-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      padding: 20px;
      margin-bottom: 20px;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 15px;
    }
    
    .info-item {
      margin-bottom: 10px;
    }
    
    .info-item .label {
      font-weight: bold;
      margin-bottom: 5px;
      color: #666;
      font-size: 14px;
    }
    
    .info-item .value {
      font-size: 24px;
      color: #2a3f5f;
    }
    
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 600;
      margin-right: 5px;
      margin-bottom: 5px;
      color: white;
    }
    
    .badge-framework {
      background-color: #3498db;
    }
    
    .badge-app {
      background-color: #e74c3c;
    }
    
    .badge-lib {
      background-color: #2ecc71;
    }
    
    .badge-unknown {
      background-color: #95a5a6;
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
    
    #project-graph {
      width: 100%;
      height: 600px;
      margin-top: 20px;
      border: 1px solid #ddd;
      border-radius: 8px;
    }
    
    .node {
      cursor: pointer;
    }
    
    .node circle {
      stroke: #fff;
      stroke-width: 2px;
    }
    
    .node.app circle {
      fill: #e74c3c;
    }
    
    .node.lib circle {
      fill: #2ecc71;
    }
    
    .node.unknown circle {
      fill: #95a5a6;
    }
    
    .node text {
      font-size: 12px;
    }
    
    .link {
      stroke: #999;
      stroke-opacity: 0.6;
      stroke-width: 1px;
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
  </style>
</head>
<body>
  <div class="header">
    <h1>Nx Monorepo Analysis Report</h1>
    <p>Comprehensive analysis of your Nx monorepo structure and dependencies</p>
  </div>
  
  <div class="info-card">
    <h2>Monorepo Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="label">Name</div>
        <div class="value">${rootAnalysis.name}</div>
      </div>
      <div class="info-item">
        <div class="label">Version</div>
        <div class="value">${rootAnalysis.version}</div>
      </div>
      <div class="info-item">
        <div class="label">Nx Version</div>
        <div class="value">${rootAnalysis.nxVersion}</div>
      </div>
      <div class="info-item">
        <div class="label">Total Projects</div>
        <div class="value">${projectsInfo.totalProjects}</div>
      </div>
      <div class="info-item">
        <div class="label">Framework(s)</div>
        <div>
          ${rootAnalysis.framework.map(fw => `<span class="badge badge-framework">${fw}</span>`).join(' ')}
          ${rootAnalysis.framework.length === 0 ? '<span class="badge badge-framework">None detected</span>' : ''}
        </div>
      </div>
    </div>
  </div>
  
  <div class="dashboard">
    <div class="card">
      <h3>Dependency Distribution</h3>
      <canvas id="depDistChart"></canvas>
    </div>
    <div class="card">
      <h3>Project Types</h3>
      <canvas id="projectTypesChart"></canvas>
    </div>
  </div>
  
  <div class="info-card">
    <h2>Project Structure</h2>
    <p>Total projects: ${projectsInfo.totalProjects}</p>
    
    <div class="search">
      <input type="text" id="projectSearchInput" placeholder="Search projects...">
    </div>
    
    <table id="projectsTable">
      <thead>
        <tr>
          <th>Project Name</th>
          <th>Type</th>
          <th>Dependencies</th>
        </tr>
      </thead>
      <tbody>
        ${projectsInfo.projects.map(project => {
          const projectName = typeof project === 'string' ? project : project.name;
          const projectType = typeof project === 'string' ? 'unknown' : (project.type || 'unknown');
          const deps = projectDeps && projectDeps[projectName] ? projectDeps[projectName].dependencies.length : 0;
          
          return `
            <tr>
              <td>${projectName}</td>
              <td><span class="badge badge-${projectType}">${projectType}</span></td>
              <td>${deps}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>
  
  ${projectDepsData.length > 0 ? `
    <div class="info-card">
      <h2>Project Dependencies Graph</h2>
      <p>Visual representation of project dependencies within the monorepo</p>
      <div id="project-graph"></div>
    </div>
  ` : ''}
  
  <script>
    // Chart data for dependencies
    const depDistData = {
      labels: ['Production', 'Development', 'Peer'],
      datasets: [{
        label: 'Dependency Count',
        data: [${rootAnalysis.dependencies}, ${rootAnalysis.devDependencies}, ${rootAnalysis.peerDependencies}],
        backgroundColor: [
          'rgba(54, 162, 235, 0.5)',
          'rgba(255, 99, 132, 0.5)',
          'rgba(255, 206, 86, 0.5)'
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(255, 206, 86, 1)'
        ],
        borderWidth: 1
      }]
    };
    
    // Chart data for project types
    const projectTypesData = {
      labels: ${JSON.stringify(Object.keys(projectTypes))},
      datasets: [{
        label: 'Project Count',
        data: ${JSON.stringify(Object.values(projectTypes))},
        backgroundColor: [
          'rgba(231, 76, 60, 0.5)',
          'rgba(46, 204, 113, 0.5)',
          'rgba(149, 165, 166, 0.5)',
          'rgba(52, 152, 219, 0.5)',
          'rgba(155, 89, 182, 0.5)'
        ],
        borderColor: [
          'rgba(231, 76, 60, 1)',
          'rgba(46, 204, 113, 1)',
          'rgba(149, 165, 166, 1)',
          'rgba(52, 152, 219, 1)',
          'rgba(155, 89, 182, 1)'
        ],
        borderWidth: 1
      }]
    };
    
    // Project dependencies data for graph
    const graphData = {
      nodes: ${JSON.stringify(projectDepsData.map(p => ({ id: p.id, type: p.type })))},
      links: ${JSON.stringify(projectDepsData.flatMap(p => 
        p.dependencies.map(dep => ({ source: p.id, target: dep }))
      ))}
    };
    
    // Create charts when page loads
    window.addEventListener('load', () => {
      // Dependency distribution chart
      new Chart(document.getElementById('depDistChart'), {
        type: 'pie',
        data: depDistData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.raw;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = Math.round((value / total) * 100);
                  return \`\${context.label}: \${value} (\${percentage}%)\`;
                }
              }
            }
          }
        }
      });
      
      // Project types chart
      new Chart(document.getElementById('projectTypesChart'), {
        type: 'bar',
        data: projectTypesData,
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
      
      // Project search functionality
      document.getElementById('projectSearchInput').addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        
        document.querySelectorAll('#projectsTable tbody tr').forEach(row => {
          const projectName = row.cells[0].textContent.toLowerCase();
          row.style.display = projectName.includes(searchTerm) ? '' : 'none';
        });
      });
      
      // Create dependency graph if data exists
      if (graphData.nodes.length > 0) {
        createForceGraph();
      }
    });
    
    // Force directed graph using D3.js
    function createForceGraph() {
      const width = document.getElementById('project-graph').clientWidth;
      const height = document.getElementById('project-graph').clientHeight;
      
      const svg = d3.select('#project-graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height);
      
      // Add arrow markers for links
      svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('xoverflow', 'visible')
        .append('svg:path')
        .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
        .attr('fill', '#999')
        .style('stroke', 'none');
      
      // Create force simulation
      const simulation = d3.forceSimulation(graphData.nodes)
        .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(40));
      
      // Add links
      const link = svg.append('g')
        .selectAll('line')
        .data(graphData.links)
        .enter()
        .append('line')
        .attr('class', 'link')
        .attr('marker-end', 'url(#arrowhead)');
      
      // Add nodes
      const node = svg.append('g')
        .selectAll('.node')
        .data(graphData.nodes)
        .enter()
        .append('g')
        .attr('class', d => \`node \${d.type || 'unknown'}\`)
        .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));
      
      // Add circles to nodes
      node.append('circle')
        .attr('r', 8)
        .append('title')
        .text(d => d.id);
      
      // Add labels to nodes
      node.append('text')
        .attr('dy', -12)
        .attr('text-anchor', 'middle')
        .text(d => d.id);
      
      // Update positions on simulation tick
      simulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);
        
        node
          .attr('transform', d => \`translate(\${d.x},\${d.y})\`);
      });
      
      // Drag functions
      function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      
      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }
      
      function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
    }
  </script>
</body>
</html>
    `;
  }
}

// Set up command-line interface
program
  .name('nx-root-analyzer')
  .description('Analyze an Nx monorepo with dependencies managed at the root level')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze the Nx monorepo')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-a, --apps <dir>', 'Apps directory name', 'apps')
  .option('-l, --libs <dir>', 'Libraries directory name', 'libs')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-o, --output <file>', 'Output HTML report file', '')
  .option('-b, --browser', 'Open the report in browser', false)
  .option('-d, --reports-dir <dir>', 'Reports directory', 'deps-reports')
  .action(async (options) => {
    console.log(`🔍 Analyzing Nx monorepo at ${options.root}`);
    
    const analyzer = new NxMonorepoAnalyzer({
      rootDir: options.root,
      appsDir: options.apps,
      libsDir: options.libs,
      verbose: options.verbose
    });
    
    // Get root dependencies analysis
    const rootAnalysis = analyzer.analyzeRootDependencies();
    if (!rootAnalysis) {
      console.error('❌ Failed to analyze root dependencies');
      process.exit(1);
    }
    
    console.log('\n📦 Monorepo Information:');
    console.log(`Name: ${rootAnalysis.name}`);
    console.log(`Version: ${rootAnalysis.version}`);
    console.log(`Nx Version: ${rootAnalysis.nxVersion}`);
    console.log(`Framework(s): ${rootAnalysis.framework.join(', ') || 'None detected'}`);
    
    console.log(`\n📊 Dependency Counts:`);
    console.log(`Production dependencies: ${rootAnalysis.dependencies}`);
    console.log(`Development dependencies: ${rootAnalysis.devDependencies}`);
    console.log(`Peer dependencies: ${rootAnalysis.peerDependencies}`);
    console.log(`Total unique dependencies: ${rootAnalysis.totalDependencies}`);
    
    // Show projects
    const projectsInfo = analyzer.analyzeAllProjects();
    if (projectsInfo) {
      console.log(`\n🏗️ Project Structure:`);
      console.log(`Total projects: ${projectsInfo.totalProjects}`);
      
      if (projectsInfo.projects.length > 0) {
        console.log('\nProjects:');
        
        // Group projects by type
        const groupedProjects = projectsInfo.projects.reduce((acc, project) => {
          const type = project.type || 'unknown';
          acc[type] = acc[type] || [];
          acc[type].push(project.name);
          return acc;
        }, {});
        
        // Print grouped projects
        Object.keys(groupedProjects).forEach(type => {
          console.log(`\n${type.charAt(0).toUpperCase() + type.slice(1)} (${groupedProjects[type].length}):`);
          groupedProjects[type].forEach(project => console.log(`  - ${project}`));
        });
      }
    }
    
    // Get inter-project dependencies
    console.log('\n🔄 Analyzing project dependencies...');
    const projectDeps = await analyzer.analyzeProjectImports();
    
    if (projectDeps) {
      console.log('\n🔄 Project Dependencies:');
      Object.keys(projectDeps).forEach(projectName => {
        const project = projectDeps[projectName];
        if (project.dependencies.length > 0) {
          console.log(`\n${projectName} (${project.type}):`);
          project.dependencies.forEach(dep => console.log(`  → ${dep}`));
        }
      });
    } else {
      console.log('❌ Could not generate project dependency graph');
      console.log('💡 Try running this command in the monorepo root directory');
    }
    
    // Generate HTML report if requested
    if (options.output || options.browser) {
      console.log(`\n📄 Generating HTML report...`);
      
      const html = analyzer.generateHtmlReport(rootAnalysis, projectsInfo, projectDeps);
      
      // Save report and optionally open in browser
      const defaultFilename = generateTimestampedFilename('monorepo-analysis');
      await saveAndOpenReport(html, options.output, options.browser, defaultFilename, options.reportsDir);
      
      console.log(`\n📊 Monorepo analysis completed successfully`);
    }
  });

program
  .command('deps')
  .description('List all dependencies from root package.json')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-t, --type <type>', 'Dependency type (all, prod, dev, peer)', 'all')
  .action((options) => {
    const analyzer = new NxMonorepoAnalyzer({
      rootDir: options.root
    });
    
    const rootAnalysis = analyzer.analyzeRootDependencies();
    if (!rootAnalysis) {
      console.error('❌ Failed to analyze root dependencies');
      process.exit(1);
    }
    
    const packageJson = rootAnalysis.packageJson;
    
    console.log(`\n📦 Dependencies for ${packageJson.name}@${packageJson.version}:`);
    
    if (options.type === 'all' || options.type === 'prod') {
      console.log('\n📌 Production Dependencies:');
      if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
        Object.entries(packageJson.dependencies).forEach(([name, version]) => {
          console.log(`  ${name}: ${version}`);
        });
      } else {
        console.log('  None');
      }
    }
    
    if (options.type === 'all' || options.type === 'dev') {
      console.log('\n🛠️ Development Dependencies:');
      if (packageJson.devDependencies && Object.keys(packageJson.devDependencies).length > 0) {
        Object.entries(packageJson.devDependencies).forEach(([name, version]) => {
          console.log(`  ${name}: ${version}`);
        });
      } else {
        console.log('  None');
      }
    }
    
    if (options.type === 'all' || options.type === 'peer') {
      console.log('\n🤝 Peer Dependencies:');
      if (packageJson.peerDependencies && Object.keys(packageJson.peerDependencies).length > 0) {
        Object.entries(packageJson.peerDependencies).forEach(([name, version]) => {
          console.log(`  ${name}: ${version}`);
        });
      } else {
        console.log('  None');
      }
    }
  });

program
  .command('projects')
  .description('List all projects in the monorepo')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-a, --apps <dir>', 'Apps directory name', 'apps')
  .option('-l, --libs <dir>', 'Libraries directory name', 'libs')
  .action((options) => {
    const analyzer = new NxMonorepoAnalyzer({
      rootDir: options.root,
      appsDir: options.apps,
      libsDir: options.libs
    });
    
    const projects = analyzer.getProjects();
    console.log(`\n🏗️ Projects in ${options.root}:`);
    console.log(`Found ${projects.length} projects\n`);
    
    // Organize projects by type if possible
    const organizedProjects = {};
    
    projects.forEach(project => {
      const type = typeof project === 'string' ? 'unknown' : (project.type || 'unknown');
      organizedProjects[type] = organizedProjects[type] || [];
      organizedProjects[type].push(typeof project === 'string' ? project : project.name);
    });
    
    Object.keys(organizedProjects).forEach(type => {
      console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} (${organizedProjects[type].length}):`);
      organizedProjects[type].forEach(name => console.log(`  - ${name}`));
      console.log('');
    });
  });

program.parse(process.argv);

// Show help if no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 