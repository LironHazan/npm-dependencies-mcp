# Nx Monorepo Dependency Analysis Tools

A powerful suite of tools for analyzing and visualizing dependencies in Nx monorepos, especially when using a single-version approach with dependencies managed at the root level.

[![npm version](https://img.shields.io/npm/v/npm-dependencies-mcp.svg)](https://www.npmjs.com/package/npm-dependencies-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Documentation

For detailed documentation, please see the [docs directory](./docs/):
- [Complete NX Tools Documentation](./docs/NX-TOOLS.md)

## Tools Included

### 1. Nx Graph Visualizer (`nx-graph-visualizer.js`)

A tool that generates an interactive HTML visualization of your Nx monorepo's project dependency graph.

**Features:**
- Interactive D3.js visualization
- Zoom and pan capabilities
- Project details on hover
- Visual representation of project relationships

**Usage:**
```bash
./nx-graph-visualizer.js generate --root /path/to/nx/repo --output dependency-graph.html --browser
```

**Options:**
- `--root <path>`: Path to the Nx monorepo root (default: current directory)
- `--output <file>`: Output HTML file name (default: `nx-dep-graph.html`)
- `--browser`: Automatically open the generated HTML in your default browser

### 2. Nx Project Dependencies Analyzer (`nx-project-deps.js`)

A tool that analyzes which npm packages are actually used by each project in your Nx monorepo by scanning source files for import statements.

**Features:**
- Scans all projects in the monorepo
- Identifies which npm packages are imported in each project
- Matches imports with root-level dependencies
- Generates an interactive HTML report with charts
- Identifies potential unused or missing dependencies

**Usage:**
```bash
# Analyze all projects
./nx-project-deps.js analyze --root /path/to/nx/repo --output report.html --browser

# Analyze a specific project
./nx-project-deps.js project --root /path/to/nx/repo --project project-name
```

**Options for 'analyze' command:**
- `--root, -r <path>`: Path to the Nx monorepo root (default: current directory)
- `--verbose, -v`: Enable verbose output (default: false)
- `--output, -o <file>`: Output HTML report file (default: `nx-project-deps-report.html`)
- `--browser, -b`: Automatically open the generated HTML in your default browser

**Options for 'project' command:**
- `--root, -r <path>`: Path to the Nx monorepo root (default: current directory)
- `--verbose, -v`: Enable verbose output (default: false)
- `--project, -p <name>`: Project name to analyze (required)

### 3. Nx Root Analyzer (`nx-root-analyzer.js`)

A tool that analyzes the overall structure of an Nx monorepo with dependencies managed at the root level.

**Features:**
- Analyzes monorepo structure and metadata
- Identifies frameworks used in the project
- Provides dependency counts and distribution
- Shows project types and their relationships
- Generates an interactive HTML report with charts and graphs

**Usage:**
```bash
./nx-root-analyzer.js analyze --root /path/to/nx/repo --output report.html --browser
```

**Options:**
- `--root, -r <path>`: Path to the Nx monorepo root (default: current directory)
- `--apps, -a <dir>`: Apps directory name (default: 'apps')
- `--libs, -l <dir>`: Libraries directory name (default: 'libs')
- `--verbose, -v`: Enable verbose output (default: false)
- `--output, -o <file>`: Output HTML report file
- `--browser, -b`: Automatically open the generated HTML in your default browser

### 4. Nx Vulnerability Scanner (`nx-vuln-scanner.js`)

NEW! A tool that scans dependencies for security vulnerabilities in your Nx monorepo.

**Features:**
- Scans for security vulnerabilities in npm dependencies
- Categorizes vulnerabilities by severity (critical, high, moderate, low)
- Provides detailed information about each vulnerability
- Suggests remediation steps
- Generates an interactive HTML report with charts and filtering options

## Installation

### Global Installation (Recommended)

```bash
npm install -g npm-dependencies-mcp
```

This will make the `nx-tools` and `mcp-npm` commands available globally.

### Local Installation

```bash
npm install npm-dependencies-mcp
```

When installed locally, you can access the tools via npx:

```bash
npx nx-tools graph --root /path/to/monorepo
```

### Direct Usage Without Installation

```bash
npx npm-dependencies-mcp nx-tools graph --root /path/to/monorepo
```

## Quick Start

After installation, you can use all these tools through the `nx-tools` command line interface:

```bash
# Generate interactive dependency graph
nx-tools graph --root /path/to/monorepo --browser

# Analyze project dependencies
nx-tools deps --root /path/to/monorepo --browser

# Analyze overall monorepo structure
nx-tools analyze --root /path/to/monorepo --browser

# Scan for security vulnerabilities
nx-tools vuln --root /path/to/monorepo --browser
```

All reports are saved in the `deps-reports` directory by default and can be opened in any modern web browser.

## Browser Integration

All tools now include browser integration capabilities that allow you to automatically open the generated HTML reports in your default web browser. This works across all major operating systems:

- macOS: Uses the `open` command
- Windows: Uses the `start` command
- Linux: Uses the `xdg-open` command

To use this feature, simply add the `--browser` flag to any command that generates an HTML report.
