#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { program } = require('commander');
const { saveAndOpenReport, generateTimestampedFilename } = require('../utils/report-utils');

/**
 * Scan dependencies for vulnerabilities
 */
async function scanVulnerabilities(options) {
  const { rootDir, outputFile, openBrowser, reportsDir, level } = options;
  console.log(`🔍 Scanning for vulnerabilities in Nx monorepo at ${rootDir}`);

  try {
    // Run npm audit to get vulnerability info
    console.log('Running npm audit...');
    
    const auditCmd = `npm audit --json${level ? ` --audit-level=${level}` : ''}`;
    console.log(`Executing: ${auditCmd}`);
    
    let auditOutput;
    try {
      auditOutput = execSync(auditCmd, {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      // npm audit returns non-zero exit code if vulnerabilities are found
      // We need to capture the output anyway
      auditOutput = error.stdout;
    }

    if (!auditOutput) {
      console.log('✅ No vulnerabilities found!');
      return true;
    }

    // Parse the audit output
    const auditData = JSON.parse(auditOutput);
    
    // Find out which projects use vulnerable dependencies
    console.log('Analyzing project dependencies...');
    const projectDependencies = await analyzeProjectDependencies(rootDir, auditData);
    
    // Generate HTML report
    const html = generateVulnerabilityReport(auditData, projectDependencies);
    
    // Save report and optionally open in browser
    const defaultFilename = generateTimestampedFilename('vulnerability-report');
    await saveAndOpenReport(html, outputFile, openBrowser, defaultFilename, reportsDir);
    
    // Print summary
    printSummary(auditData, projectDependencies);
    
    return true;
  } catch (error) {
    console.error(`❌ Error scanning vulnerabilities: ${error.message}`);
    if (error.stdout) {
      console.error(`stdout: ${error.stdout}`);
    }
    if (error.stderr) {
      console.error(`stderr: ${error.stderr}`);
    }
    return false;
  }
}

/**
 * Analyze which projects use vulnerable dependencies
 */
async function analyzeProjectDependencies(rootDir, auditData) {
  // Get direct dependencies with vulnerabilities
  const vulnerableDeps = identifyDirectDependencies(auditData);
  const vulnerablePackages = vulnerableDeps.map(dep => dep.name);
  
  if (vulnerablePackages.length === 0) {
    return {};
  }
  
  try {
    // Get all projects in the monorepo
    const projects = getProjects(rootDir);
    console.log(`Found ${projects.length} projects in the monorepo`);
    
    // For each project, check if it's using any of the vulnerable packages
    const projectDeps = {};
    
    for (const project of projects) {
      const projectImports = getProjectImports(rootDir, project);
      
      // Filter to only vulnerable packages
      const usedVulnerableDeps = projectImports.filter(imp => vulnerablePackages.includes(imp));
      
      if (usedVulnerableDeps.length > 0) {
        projectDeps[project] = usedVulnerableDeps;
      }
    }
    
    return { 
      projectDependencies: projectDeps,
      vulnerableDependencies: vulnerableDeps
    };
  } catch (error) {
    console.error(`Error analyzing project dependencies: ${error.message}`);
    return {};
  }
}

/**
 * Get all projects in the Nx monorepo
 */
function getProjects(rootDir) {
  try {
    // Try to run 'nx show projects' to get a list of all projects
    const output = execSync('npx nx show projects', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    console.log(`Error getting projects with nx command: ${error.message}`);
    console.log('Falling back to directory scanning...');
    
    // Fallback: scan apps and libs directories
    const projects = [];
    
    ['apps', 'libs'].forEach(dir => {
      const fullPath = path.join(rootDir, dir);
      if (fs.existsSync(fullPath)) {
        const items = fs.readdirSync(fullPath, { withFileTypes: true })
          .filter(item => item.isDirectory())
          .map(item => item.name);
        
        projects.push(...items);
      }
    });
    
    return projects;
  }
}

/**
 * Get the packages imported by a project
 */
function getProjectImports(rootDir, projectName) {
  // Find the project's directory
  let projectRoot = '';
  
  // Check common locations
  const possiblePaths = [
    path.join(rootDir, 'apps', projectName),
    path.join(rootDir, 'libs', projectName)
  ];
  
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      projectRoot = possiblePath;
      break;
    }
  }
  
  if (!projectRoot) {
    // Try to find using nx project show
    try {
      const output = execSync(`npx nx show project ${projectName} --json`, {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      
      const projectInfo = JSON.parse(output);
      if (projectInfo && projectInfo.root) {
        projectRoot = path.join(rootDir, projectInfo.root);
      }
    } catch (error) {
      // Ignore errors
    }
  }
  
  if (!projectRoot) {
    console.log(`Could not find root directory for project: ${projectName}`);
    return [];
  }
  
  // Find all TS/JS files in the project
  try {
    // Find all TS/JS files with import statements
    const filePattern = `find ${projectRoot} -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \\) | xargs grep -l "import.*from" || true`;
    const filesWithImports = execSync(filePattern, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).split('\n').filter(Boolean);
    
    // Extract imports from these files
    const importedPackages = new Set();
    
    for (const file of filesWithImports) {
      const content = fs.readFileSync(file, 'utf8');
      const importRegex = /import\s+(?:(?:{[^}]*}|\*\s+as\s+[^;]+|[^;{]*)\s+from\s+)?['"]([^'"]+)['"]/g;
      
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (!importPath.startsWith('.')) {
          // Only external packages (not relative imports)
          // Get the package name (first part of the import path)
          const packageName = importPath.split('/')[0];
          importedPackages.add(packageName);
        }
      }
    }
    
    return Array.from(importedPackages);
  } catch (error) {
    console.log(`Error scanning imports for ${projectName}: ${error.message}`);
    return [];
  }
}

/**
 * Print summary of vulnerability scan
 */
function printSummary(auditData, projectDependencies) {
  if (!auditData.metadata || !auditData.metadata.vulnerabilities) {
    console.log('⚠️ Could not generate vulnerability summary');
    return;
  }
  
  const vulnCounts = auditData.metadata.vulnerabilities;
  const total = Object.values(vulnCounts).reduce((sum, count) => sum + count, 0);
  
  console.log('\n📊 Vulnerability Summary:');
  console.log(`Total vulnerabilities: ${total}`);
  
  if (vulnCounts.critical > 0) {
    console.log(`Critical: ${vulnCounts.critical}`);
  }
  if (vulnCounts.high > 0) {
    console.log(`High: ${vulnCounts.high}`);
  }
  if (vulnCounts.moderate > 0) {
    console.log(`Moderate: ${vulnCounts.moderate}`);
  }
  if (vulnCounts.low > 0) {
    console.log(`Low: ${vulnCounts.low}`);
  }
  
  // Extract direct dependencies to update
  const directDepsToUpdate = identifyDirectDependencies(auditData);
  
  if (directDepsToUpdate.length > 0) {
    console.log('\n🔄 Direct Dependencies to Update:');
    directDepsToUpdate.forEach(dep => {
      console.log(`  - ${dep.name}: ${dep.currentVersion} → ${dep.fixedVersion || 'No fixed version'} (${dep.severity})`);
    });
  }
  
  // Display vulnerable packages by project
  if (projectDependencies && projectDependencies.projectDependencies) {
    const projectDeps = projectDependencies.projectDependencies;
    const projects = Object.keys(projectDeps);
    
    if (projects.length > 0) {
      console.log('\n📑 Vulnerable Packages by Project:');
      
      projects.forEach(project => {
        const packages = projectDeps[project];
        console.log(`  🔶 ${project}:`);
        
        packages.forEach(pkg => {
          const depInfo = directDepsToUpdate.find(d => d.name === pkg);
          if (depInfo) {
            console.log(`    - ${pkg}: ${depInfo.currentVersion} → ${depInfo.fixedVersion || 'No fixed version'} (${depInfo.severity})`);
          } else {
            console.log(`    - ${pkg}`);
          }
        });
      });
    }
  }
  
  // Show fix advice
  if (total > 0) {
    console.log('\n💡 To fix these vulnerabilities, run:');
    console.log(`npm audit fix${auditData.metadata.vulnerabilities.critical > 0 ? ' --force' : ''}`);
  } else {
    console.log('\n✅ No vulnerabilities found!');
  }
}

/**
 * Identify direct dependencies that need to be updated
 */
function identifyDirectDependencies(auditData) {
  if (!auditData.advisories) {
    return [];
  }
  
  const advisories = auditData.advisories;
  const directDeps = new Map();
  
  // Process each advisory to find direct dependencies
  Object.values(advisories).forEach(advisory => {
    if (advisory.findings) {
      advisory.findings.forEach(finding => {
        if (finding.paths) {
          finding.paths.forEach(path => {
            // Top-level dependencies will have only one element in the path
            const pathElements = path.split('>')
            if (pathElements.length === 1 || pathElements.length === 2) {
              const depName = pathElements[0];
              
              // Only add if it's a more severe instance of this dependency
              if (!directDeps.has(depName) || 
                  isSeverityHigher(advisory.severity, directDeps.get(depName).severity)) {
                directDeps.set(depName, {
                  name: depName,
                  currentVersion: finding.version || 'unknown',
                  fixedVersion: advisory.patched_versions !== '<0.0.0' ? advisory.patched_versions : null,
                  severity: advisory.severity,
                  title: advisory.title,
                  url: advisory.url
                });
              }
            }
          });
        }
      });
    }
  });
  
  // Convert Map to array and sort by severity
  const result = Array.from(directDeps.values());
  
  return result.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Compare severity levels
 */
function isSeverityHigher(sev1, sev2) {
  const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
  return severityOrder[sev1] < severityOrder[sev2];
}

/**
 * Generate HTML vulnerability report
 */
function generateVulnerabilityReport(auditData, projectDependencies) {
  // Extract metadata
  const metadata = auditData.metadata || {};
  const vulnerabilities = metadata.vulnerabilities || {};
  const totalVulnerabilities = Object.values(vulnerabilities).reduce((sum, count) => sum + count, 0);

  // Extract advisories
  const advisories = auditData.advisories || {};
  const advisoryList = Object.values(advisories);
  
  // Count vulnerabilities by severity
  const severityCounts = {
    critical: vulnerabilities.critical || 0,
    high: vulnerabilities.high || 0,
    moderate: vulnerabilities.moderate || 0,
    low: vulnerabilities.low || 0
  };
  
  // Sort advisories by severity
  const sortedAdvisories = [...advisoryList].sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
  
  // Extract direct dependencies that need to be updated
  const directDepsToUpdate = identifyDirectDependencies(auditData);
  
  // Extract project dependencies
  const projectDeps = projectDependencies && projectDependencies.projectDependencies ? 
                      projectDependencies.projectDependencies : {};
  const projectsWithVulnerabilities = Object.keys(projectDeps);
  
  // Generate HTML
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nx Monorepo Vulnerability Report</title>
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
      color: white;
    }
    
    .badge-critical {
      background-color: #e74c3c;
    }
    
    .badge-high {
      background-color: #e67e22;
    }
    
    .badge-moderate {
      background-color: #f1c40f;
      color: #333;
    }
    
    .badge-low {
      background-color: #3498db;
    }
    
    .badge-info {
      background-color: #2ecc71;
    }
    
    .header {
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid #eee;
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
    
    .vulnerability-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      margin-bottom: 20px;
      overflow: hidden;
    }
    
    .vulnerability-header {
      padding: 15px;
      border-bottom: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .vulnerability-card.critical .vulnerability-header {
      background-color: rgba(231, 76, 60, 0.1);
    }
    
    .vulnerability-card.high .vulnerability-header {
      background-color: rgba(230, 126, 34, 0.1);
    }
    
    .vulnerability-card.moderate .vulnerability-header {
      background-color: rgba(241, 196, 15, 0.1);
    }
    
    .vulnerability-card.low .vulnerability-header {
      background-color: rgba(52, 152, 219, 0.1);
    }
    
    .vulnerability-title {
      font-weight: 600;
      margin: 0;
      font-size: 1.1em;
    }
    
    .vulnerability-body {
      padding: 15px;
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
    
    .fix-cmd {
      background-color: #f8f9fa;
      padding: 10px;
      border-radius: 4px;
      font-family: monospace;
      margin: 10px 0;
    }
    
    .severity-filter {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    
    .filter-btn {
      padding: 5px 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
      cursor: pointer;
    }
    
    .filter-btn.active {
      background-color: #2a3f5f;
      color: white;
      border-color: #2a3f5f;
    }
    
    .direct-deps-table {
      margin-top: 20px;
      margin-bottom: 30px;
    }
    
    .copy-btn {
      background-color: #f8f9fa;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 12px;
      margin-left: 10px;
    }
    
    .copy-btn:hover {
      background-color: #e9ecef;
    }
    
    .update-cmd {
      font-family: monospace;
      background-color: #f8f9fa;
      padding: 10px;
      border-radius: 4px;
      margin: 15px 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    
    .clipboard-temp {
      position: absolute;
      left: -9999px;
    }
    
    .projects-list {
      list-style: none;
      padding: 0;
    }
    
    .project-item {
      border-left: 3px solid #3498db;
      padding: 10px 15px;
      margin-bottom: 15px;
      background-color: #f8f9fa;
      border-radius: 0 4px 4px 0;
    }
    
    .project-title {
      font-weight: 600;
      font-size: 1.1em;
      margin-bottom: 10px;
    }
    
    .package-list {
      list-style: none;
      padding-left: 15px;
    }
    
    .package-item {
      margin-bottom: 8px;
      display: flex;
      align-items: center;
    }
    
    .expand-btn {
      background: none;
      border: none;
      font-size: 1.1em;
      cursor: pointer;
      margin-right: 10px;
      color: #3498db;
    }
    
    .project-section {
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Nx Monorepo Vulnerability Report</h1>
    <p>Comprehensive analysis of potential security vulnerabilities in your dependencies</p>
  </div>
  
  <div class="info-card">
    <h2>Summary</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="label">Total Vulnerabilities</div>
        <div class="value">${totalVulnerabilities}</div>
      </div>
      <div class="info-item">
        <div class="label">Critical</div>
        <div class="value" style="color: #e74c3c;">${severityCounts.critical}</div>
      </div>
      <div class="info-item">
        <div class="label">High</div>
        <div class="value" style="color: #e67e22;">${severityCounts.high}</div>
      </div>
      <div class="info-item">
        <div class="label">Moderate</div>
        <div class="value" style="color: #f1c40f;">${severityCounts.moderate}</div>
      </div>
      <div class="info-item">
        <div class="label">Low</div>
        <div class="value" style="color: #3498db;">${severityCounts.low}</div>
      </div>
    </div>
  </div>
  
  ${directDepsToUpdate.length > 0 ? `
  <div class="info-card">
    <h2>Direct Dependencies to Update <button id="copy-deps-btn" class="copy-btn">Copy Update Command</button></h2>
    <p>These direct dependencies need to be updated to fix vulnerabilities:</p>
    
    <table class="direct-deps-table">
      <thead>
        <tr>
          <th>Package</th>
          <th>Current Version</th>
          <th>Fixed Version</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
        ${directDepsToUpdate.map(dep => `
          <tr>
            <td>${dep.name}</td>
            <td>${dep.currentVersion}</td>
            <td>${dep.fixedVersion || 'No fixed version'}</td>
            <td><span class="badge badge-${dep.severity}">${dep.severity}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <h3>Update Command</h3>
    <div class="update-cmd" id="update-command">npm install --save${directDepsToUpdate.map(dep => dep.fixedVersion ? ` ${dep.name}@"${dep.fixedVersion}"` : '').filter(Boolean).join('')}</div>
    <p><strong>Note:</strong> After updating, run another vulnerability scan to ensure all issues are fixed.</p>
  </div>
  ` : ''}
  
  ${projectsWithVulnerabilities.length > 0 ? `
  <div class="info-card project-section">
    <h2>Vulnerable Packages by Project</h2>
    <p>The following projects in your monorepo use vulnerable packages:</p>
    
    <ul class="projects-list">
      ${projectsWithVulnerabilities.map(project => {
        const packages = projectDeps[project];
        return `
          <li class="project-item">
            <div class="project-title">${project}</div>
            <ul class="package-list">
              ${packages.map(pkg => {
                const depInfo = directDepsToUpdate.find(d => d.name === pkg);
                return depInfo ? 
                  `<li class="package-item">
                    <span class="badge badge-${depInfo.severity}">${depInfo.severity}</span>
                    ${pkg}: ${depInfo.currentVersion} → ${depInfo.fixedVersion || 'No fixed version'}
                  </li>` : 
                  `<li class="package-item">${pkg}</li>`;
              }).join('')}
            </ul>
          </li>
        `;
      }).join('')}
    </ul>
  </div>
  ` : ''}
  
  <div class="dashboard">
    <div class="card">
      <h3>Vulnerabilities by Severity</h3>
      <canvas id="severityChart"></canvas>
    </div>
    <div class="card">
      <h3>Recommended Actions</h3>
      <div style="padding: 20px;">
        ${totalVulnerabilities > 0 ? `
        <p>To fix these vulnerabilities, run:</p>
        <div class="fix-cmd">npm audit fix${severityCounts.critical > 0 ? ' --force' : ''}</div>
        <p>Note: <code>--force</code> may introduce breaking changes. Test thoroughly after fixing.</p>
        ` : '<p>✅ No vulnerabilities found! Your dependencies are secure.</p>'}
      </div>
    </div>
  </div>
  
  ${sortedAdvisories.length > 0 ? `
  <div class="info-card">
    <h2>Vulnerabilities (${sortedAdvisories.length})</h2>
    
    <div class="search">
      <input type="text" id="searchInput" placeholder="Search by package name, title, or ID...">
    </div>
    
    <div class="severity-filter">
      <button class="filter-btn active" data-severity="all">All</button>
      ${severityCounts.critical > 0 ? `<button class="filter-btn" data-severity="critical">Critical (${severityCounts.critical})</button>` : ''}
      ${severityCounts.high > 0 ? `<button class="filter-btn" data-severity="high">High (${severityCounts.high})</button>` : ''}
      ${severityCounts.moderate > 0 ? `<button class="filter-btn" data-severity="moderate">Moderate (${severityCounts.moderate})</button>` : ''}
      ${severityCounts.low > 0 ? `<button class="filter-btn" data-severity="low">Low (${severityCounts.low})</button>` : ''}
    </div>
    
    <div id="vulnerabilitiesList">
      ${sortedAdvisories.map(advisory => `
        <div class="vulnerability-card ${advisory.severity}" data-severity="${advisory.severity}">
          <div class="vulnerability-header">
            <h3 class="vulnerability-title">${advisory.title}</h3>
            <span class="badge badge-${advisory.severity}">${advisory.severity}</span>
          </div>
          <div class="vulnerability-body">
            <p><strong>Package:</strong> ${advisory.module_name}</p>
            <p><strong>Vulnerable versions:</strong> ${advisory.vulnerable_versions}</p>
            <p><strong>Patched versions:</strong> ${advisory.patched_versions || 'No patch available'}</p>
            <p><strong>Recommendation:</strong> ${advisory.recommendation || 'Update to a non-vulnerable version'}</p>
            <p><strong>CWE:</strong> ${advisory.cwe || 'Not specified'}</p>
            <p>${advisory.overview || ''}</p>
            ${advisory.url ? `<p><a href="${advisory.url}" target="_blank">More information</a></p>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}
  
  <textarea id="clipboard-temp" class="clipboard-temp"></textarea>
  
  <script>
    // Chart data for severity distribution
    const severityData = {
      labels: ['Critical', 'High', 'Moderate', 'Low'],
      datasets: [{
        label: 'Vulnerabilities',
        data: [${severityCounts.critical}, ${severityCounts.high}, ${severityCounts.moderate}, ${severityCounts.low}],
        backgroundColor: [
          'rgba(231, 76, 60, 0.7)',   // Critical
          'rgba(230, 126, 34, 0.7)',  // High
          'rgba(241, 196, 15, 0.7)',  // Moderate
          'rgba(52, 152, 219, 0.7)'   // Low
        ],
        borderColor: [
          'rgba(231, 76, 60, 1)',
          'rgba(230, 126, 34, 1)',
          'rgba(241, 196, 15, 1)',
          'rgba(52, 152, 219, 1)'
        ],
        borderWidth: 1
      }]
    };
    
    // Create charts when page loads
    window.addEventListener('load', () => {
      // Severity distribution chart
      new Chart(document.getElementById('severityChart'), {
        type: 'pie',
        data: severityData,
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
      
      // Search functionality
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.addEventListener('input', function() {
          const searchTerm = this.value.toLowerCase();
          
          document.querySelectorAll('.vulnerability-card').forEach(card => {
            const title = card.querySelector('.vulnerability-title').textContent.toLowerCase();
            const packageName = card.querySelector('.vulnerability-body').textContent.toLowerCase();
            
            const matches = title.includes(searchTerm) || packageName.includes(searchTerm);
            
            if (matches && !card.classList.contains('filtered-by-severity')) {
              card.style.display = 'block';
            } else {
              card.style.display = 'none';
            }
          });
        });
      }
      
      // Severity filter
      const filterButtons = document.querySelectorAll('.filter-btn');
      if (filterButtons.length > 0) {
        filterButtons.forEach(btn => {
          btn.addEventListener('click', function() {
            // Toggle active state
            filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const severity = this.dataset.severity;
            
            document.querySelectorAll('.vulnerability-card').forEach(card => {
              card.classList.remove('filtered-by-severity');
              
              if (severity === 'all' || card.dataset.severity === severity) {
                card.style.display = 'block';
              } else {
                card.style.display = 'none';
                card.classList.add('filtered-by-severity');
              }
            });
            
            // Also apply the search filter
            if (searchInput && searchInput.value) {
              const event = new Event('input', { bubbles: true });
              searchInput.dispatchEvent(event);
            }
          });
        });
      }
      
      // Copy update command
      const copyBtn = document.getElementById('copy-deps-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          const command = document.getElementById('update-command').textContent;
          const tempTextarea = document.getElementById('clipboard-temp');
          
          tempTextarea.value = command;
          tempTextarea.select();
          document.execCommand('copy');
          
          this.textContent = 'Copied!';
          setTimeout(() => {
            this.textContent = 'Copy Update Command';
          }, 2000);
        });
      }
    });
  </script>
</body>
</html>
  `;
}

// CLI program
program
  .name('nx-vuln-scanner')
  .description('Scan Nx monorepo for vulnerabilities in dependencies')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan for vulnerabilities')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-o, --output <file>', 'Output HTML file', '')
  .option('-b, --browser', 'Open the generated file in browser', false)
  .option('-d, --reports-dir <dir>', 'Reports directory', 'deps-reports')
  .option('-l, --level <level>', 'Minimum vulnerability level to report (low, moderate, high, critical)', '')
  .action(async (options) => {
    const result = await scanVulnerabilities({
      rootDir: options.root,
      outputFile: options.output,
      openBrowser: options.browser,
      reportsDir: options.reportsDir,
      level: options.level
    });
    
    if (result) {
      console.log(`\n📊 Vulnerability scan completed successfully`);
    } else {
      console.log(`\n❌ Vulnerability scan failed`);
    }
  });

program.parse(process.argv);

// Show help if no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 