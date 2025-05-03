# Monorepo NPM Dependency Analysis Protocol

## Installation

### Global Installation
```bash
# Install globally
npm install -g mcp-npm-dependencies

# Now you can use the mcp-npm command from anywhere
mcp-npm --help
```

### Local Installation in Your Project
```bash
# Install as a development dependency
npm install --save-dev mcp-npm-dependencies

# Use with npx
npx mcp-npm --help
```

### Local Development Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-npm-dependencies.git
cd mcp-npm-dependencies

# Install dependencies
npm install

# Link the package globally
npm link

# Now you can use the command
mcp-npm --help
```

## Quick Start

1. Start the server in your monorepo root:
```bash
mcp-npm start --port 3000
```

2. In another terminal, run commands to analyze your dependencies:
```bash
# Show monorepo structure
mcp-npm structure

# Check for version inconsistencies
mcp-npm inconsistencies

# Find circular dependencies
mcp-npm circular

# Explore with natural language queries
mcp-npm query "which packages are using lodash?"
```

## Overview
This protocol provides a structured approach to analyze, query, and manage NPM dependencies across a JavaScript/TypeScript monorepo. It establishes a series of investigative questions and automated checks to maintain dependency health and understand dependency relationships.

## Setup Requirements

1. **Tools**:
   - `npm` or `yarn` package manager
   - `nx` or `lerna` (if using either for monorepo management)
   - `depcheck` for unused dependency detection
   - `dependency-cruiser` for visualization
   - Optional: `madge` for circular dependency detection

2. **Initial Configuration**:
   ```bash
   # Install analysis tools
   npm install -g depcheck dependency-cruiser madge
   ```

## Protocol Questions

### 1. Structure Analysis

- **What is the overall dependency structure?**
   ```bash
   # Generate dependency graph visualization
   depcruise --include-only "^packages" --output-type dot packages | dot -T svg > dependency-graph.svg
   ```

- **How many packages exist in the monorepo?**
   ```bash
   # Count package.json files
   find ./packages -name "package.json" -not -path "*/node_modules/*" | wc -l
   ```

- **What are the internal dependency relationships?**
   ```bash
   # List packages and their internal dependencies
   for pkg in $(find ./packages -name "package.json" -not -path "*/node_modules/*"); do
     echo "Package: $(dirname $pkg)"
     grep -A 20 "dependencies\"|\"devDependencies\"" $pkg | grep -E "@your-scope|@your-namespace" || echo "  No internal dependencies"
   done
   ```

### 2. Version & Consistency Analysis

- **Are there duplicate dependencies with different versions?**
   ```bash
   # For yarn workspaces
   yarn why package-name
   
   # For npm workspaces
   npm ls package-name
   ```

- **Which packages have version inconsistencies?**
   ```bash
   # Custom script to check versions across packages
   node -e "
   const fs = require('fs');
   const path = require('path');
   const packages = fs.readdirSync('./packages');
   const deps = {};
   
   packages.forEach(pkg => {
     try {
       const pkgJson = require(path.join('./packages', pkg, 'package.json'));
       Object.entries({...pkgJson.dependencies, ...pkgJson.devDependencies})
         .forEach(([dep, version]) => {
           deps[dep] = deps[dep] || [];
           deps[dep].push({pkg, version});
         });
     } catch (e) {}
   });
   
   Object.entries(deps)
     .filter(([_, versions]) => new Set(versions.map(v => v.version)).size > 1)
     .forEach(([dep, versions]) => {
       console.log(`\n${dep} has inconsistent versions:`);
       versions.forEach(v => console.log(`  ${v.pkg}: ${v.version}`));
     });
   "
   ```

### 3. Health & Security Analysis

- **Are there any unused dependencies?**
   ```bash
   # Run depcheck in each package
   for dir in packages/*; do
     if [ -d "$dir" ]; then
       echo "Checking $dir"
       (cd "$dir" && depcheck)
     fi
   done
   ```

- **Which packages have security vulnerabilities?**
   ```bash
   # Run npm audit in each package
   npm audit --workspace=*
   ```

- **Are there circular dependencies?**
   ```bash
   # Check for circular dependencies
   madge --circular --extensions ts,js ./packages
   ```

### 4. Dependency Metrics

- **What is the dependency depth of each package?**
   ```bash
   # Calculate max dependency chain for each package
   for pkg in packages/*; do
     if [ -d "$pkg" ]; then
       echo "Dependency depth for $(basename $pkg)"
       (cd "$pkg" && madge --image dependency-depth.svg --exclude "node_modules" ./src)
     fi
   done
   ```

- **Which external packages are most widely used?**
   ```bash
   # Count occurrences of external dependencies
   find ./packages -name "package.json" -not -path "*/node_modules/*" -exec cat {} \; | 
   grep -E '"dependencies"|"devDependencies"' -A 50 | 
   grep -v -E '"dependencies"|"devDependencies"|{|}' | 
   grep -v "@your-scope" | 
   sort | uniq -c | sort -nr | head -20
   ```

### 5. Update & Maintenance Analysis

- **Which packages are outdated?**
   ```bash
   # Check for outdated dependencies
   npm outdated --workspace=*
   ```

- **What would be the impact of updating package X?**
   ```bash
   # List all packages that depend on X
   grep -r "\"package-x\":" --include="package.json" ./packages
   ```

## Actions Based on Protocol Findings

1. **Version Alignment**
   - Update inconsistent dependency versions to align across packages
   - Consider using a tool like `syncpack` to enforce consistency

2. **Dependency Cleanup**
   - Remove unused dependencies identified by depcheck
   - Extract commonly used dependencies to shared packages

3. **Security Remediation**
   - Schedule updates for dependencies with security issues
   - Isolate packages with vulnerable dependencies when updates aren't immediately possible

4. **Dependency Graph Optimization**
   - Break circular dependencies
   - Reduce dependency depth where possible
   - Consider restructuring package boundaries based on dependency analysis

## Automation

### Create a Script for Regular Analysis

```javascript
// dependency-report.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Output directory
const reportDir = path.join(__dirname, 'dependency-reports');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);

// Run the analysis
const date = new Date().toISOString().split('T')[0];
const reportFile = path.join(reportDir, `dependency-report-${date}.md`);

// Sections to generate
const sections = [
  {
    title: "Package Count",
    command: "find ./packages -name \"package.json\" -not -path \"*/node_modules/*\" | wc -l"
  },
  {
    title: "Version Inconsistencies",
    command: "node ./scripts/check-version-consistency.js"
  },
  {
    title: "Unused Dependencies",
    command: "node ./scripts/find-unused-deps.js"
  },
  {
    title: "Outdated Packages",
    command: "npm outdated --workspace=* --json || echo '{}'"
  },
  {
    title: "Security Vulnerabilities",
    command: "npm audit --json || echo '{}'"
  },
  {
    title: "Circular Dependencies",
    command: "madge --circular --extensions ts,js ./packages || echo 'None found'"
  }
];

// Generate report
let report = `# Dependency Analysis Report - ${date}\n\n`;

sections.forEach(section => {
  report += `## ${section.title}\n\n`;
  try {
    const output = execSync(section.command).toString();
    report += "```\n" + output + "\n```\n\n";
  } catch (error) {
    report += `Error: ${error.message}\n\n`;
  }
});

fs.writeFileSync(reportFile, report);
console.log(`Report generated at ${reportFile}`);
```

### Integration with CI/CD

```yaml
# .github/workflows/dependency-analysis.yml
name: Dependency Analysis

on:
  schedule:
    - cron: '0 0 * * 1'  # Run weekly on Monday
  workflow_dispatch:  # Allow manual trigger

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          npm ci
          npm install -g depcheck dependency-cruiser madge
      
      - name: Run dependency analysis
        run: node scripts/dependency-report.js
      
      - name: Archive report
        uses: actions/upload-artifact@v3
        with:
          name: dependency-report
          path: dependency-reports/
```

## Custom Analysis Examples

### Finding Direct vs Transitive Dependencies

```javascript
// direct-vs-transitive.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packages = fs.readdirSync('./packages').filter(p => 
  fs.statSync(path.join('./packages', p)).isDirectory()
);

packages.forEach(pkg => {
  const pkgPath = path.join('./packages', pkg);
  if (!fs.existsSync(path.join(pkgPath, 'package.json'))) return;
  
  console.log(`\n=== ${pkg} ===`);
  
  // Get direct dependencies
  const pkgJson = require(path.join(pkgPath, 'package.json'));
  const directDeps = new Set([
    ...Object.keys(pkgJson.dependencies || {}),
    ...Object.keys(pkgJson.devDependencies || {})
  ]);
  
  console.log(`Direct dependencies: ${directDeps.size}`);
  
  // Get all installed dependencies
  try {
    const allDeps = new Set(
      execSync('npm ls --all --parseable', { cwd: pkgPath })
        .toString()
        .split('\n')
        .filter(Boolean)
        .map(p => {
          const parts = p.split('node_modules/');
          return parts[parts.length - 1].split('/')[0];
        })
    );
    
    // Remove direct dependencies to get transitive only
    directDeps.forEach(d => allDeps.delete(d));
    
    console.log(`Transitive dependencies: ${allDeps.size}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
});
```
