# Monorepo NPM Dependency Analysis MCP

[![npm version](https://img.shields.io/npm/v/npm-dependencies-mcp.svg)](https://www.npmjs.com/package/npm-dependencies-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Note**: This library was created with the assistance of Claude AI to enhance development workflows in monorepo environments.

## Installation

### Global Installation
```bash
# Install globally
npm install -g npm-dependencies-mcp

# Now you can use the mcp-npm command from anywhere
mcp-npm --help
```

### Local Installation in Your Project
```bash
# Install as a development dependency
npm install --save-dev npm-dependencies-mcp

# Use with npx
npx mcp-npm --help
```

### Run Directly with npx (No Installation)
```bash
# Run directly without installing
npx npm-dependencies-mcp --help

# Start the server
npx npm-dependencies-mcp start --port 3000

# Run analysis commands
npx npm-dependencies-mcp structure
npx npm-dependencies-mcp inconsistencies
```

### Local Development Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/npm-dependencies-mcp.git
cd npm-dependencies-mcp

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
mcp-npm start --port 3000 --root /path/to/monorepo --packages-dir packages
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

3. Try interactive mode:
```bash
mcp-npm interactive
# or using the shorthand
mcp-npm i
```

## Overview
This is a comprehensive tool that provides powerful analysis, querying, and management capabilities for NPM dependencies in JavaScript/TypeScript monorepos through an MCP (Model Context Protocol) server. It offers an intuitive interface for running automated checks to maintain dependency health, understand relationships between packages, and make informed decisions about your dependency management strategy.

## Available Commands

### Server Commands

- **Start the server**
  ```bash
  mcp-npm start [options]
  ```
  Options:
  - `-p, --port <number>` - Port to run the server on (default: 3000)
  - `-r, --root <path>` - Path to monorepo root (default: current directory)
  - `-d, --packages-dir <dir>` - Directory containing packages (default: 'packages')

- **Configure client settings**
  ```bash
  mcp-npm configure [options]
  ```
  Options:
  - `-s, --server <url>` - Server URL to connect to

### Analysis Commands

- **Show monorepo structure**
  ```bash
  mcp-npm structure
  ```
  Provides an overview of all packages in the monorepo, their versions, and dependency counts.

- **Check for version inconsistencies**
  ```bash
  mcp-npm inconsistencies
  ```
  Identifies dependencies that have different versions across packages.

- **Find unused dependencies**
  ```bash
  mcp-npm unused [options]
  ```
  Options:
  - `-p, --package <name>` - Limit analysis to a specific package

- **List outdated dependencies**
  ```bash
  mcp-npm outdated
  ```
  Shows dependencies that have newer versions available.

- **Display dependency graph**
  ```bash
  mcp-npm graph [options]
  ```
  Options:
  - `-p, --package <name>` - Focus graph on a specific package

- **Detect circular dependencies**
  ```bash
  mcp-npm circular
  ```
  Finds circular dependency chains in the monorepo.

- **Check security vulnerabilities**
  ```bash
  mcp-npm security
  ```
  Runs security audit on dependencies.

- **Find where dependency is used**
  ```bash
  mcp-npm usedby <dependency>
  ```
  Lists all packages using the specified dependency.

- **Show project dependencies**
  ```bash
  mcp-npm project <name>
  ```
  Displays detailed dependency information for a specific project.

- **Natural language query**
  ```bash
  mcp-npm query <text...>
  ```
  Ask questions in natural language about your dependencies.

- **Interactive mode**
  ```bash
  mcp-npm interactive
  # or
  mcp-npm i
  ```
  Start an interactive session with all commands available.

## Server API Endpoints

The MCP NPM Dependencies server provides these API endpoints:

- `GET /api/health` - Check server health
- `GET /api/structure` - Get monorepo structure
- `GET /api/inconsistencies` - Get version inconsistencies
- `GET /api/unused?package=<name>` - Get unused dependencies
- `GET /api/outdated` - Get outdated dependencies
- `GET /api/graph/<package>` - Get dependency graph
- `GET /api/circular` - Get circular dependencies
- `GET /api/security` - Get security vulnerabilities
- `GET /api/usedby/<dependency>` - Get packages using dependency
- `GET /api/project-dependencies/<project>` - Get project dependencies
- `POST /api/query` - Process natural language query
- `POST /api/cache/invalidate` - Invalidate server cache

## Features and Benefits

- **Centralized Dependency Management**: Monitor all dependencies across your monorepo in one place
- **Inconsistency Detection**: Quickly find and fix version inconsistencies
- **Natural Language Interface**: Ask questions about your dependencies in plain English
- **Security Monitoring**: Stay on top of security vulnerabilities
- **Interactive Mode**: Explore dependencies through an interactive CLI
- **Visualization**: Generate dependency graphs to understand relationships
- **API Server**: Use the server API for custom integrations
- **Cached Analysis**: Fast responses thanks to intelligent caching

## Configuration

MCP NPM Dependencies stores configuration in `~/.mcp-npm-config.json`. You can modify it directly or use the `configure` command.



## Examples

### Finding unused dependencies in a specific package

```bash
mcp-npm unused --package @myorg/ui-components
```

### Identifying which packages use a specific dependency

```bash
mcp-npm usedby lodash
```

### Detailed analysis of a specific project

```bash
mcp-npm project @myorg/api-service
```

### Natural language queries

```bash
# Find what uses React
mcp-npm query "which packages depend on react?"

# Check for specific version issues
mcp-npm query "are there any packages using different versions of lodash?"

# Complex dependency questions
mcp-npm query "what would be affected if I update axios to the latest version?"
```

## NX Tools

This library includes `nx-tools` commands for analyzing NX monorepo dependencies:

### Analyzing Dependencies
```bash
# Analyze dependencies in an NX monorepo
nx-tools deps [options]
```
Options:
- `-p, --project <path>` - Path to specific NX project
- `-r, --root <path>` - Path to monorepo root (default: current directory)
- `-v, --verbose` - Enable verbose output
- `-b, --browser` - Open the generated HTML report in browser
- `-s, --skip-latest` - Skip fetching latest versions from npm registry
- `-n, --npm-only` - Show only projects with npm dependencies

### Generating Project Graphs
```bash
# Generate a visualization of project dependencies
nx-tools graph [options]
```
Options:
- `-r, --root <path>` - Path to monorepo root
- `-o, --output <file>` - Output HTML file
- `-b, --browser` - Open the generated file in browser

### Analyzing Monorepo Structure
```bash
# Analyze the structure of an NX monorepo
nx-tools analyze [options]
```
Options:
- `-r, --root <path>` - Path to monorepo root
- `-a, --apps <dir>` - Apps directory name (default: 'apps')
- `-l, --libs <dir>` - Libraries directory name (default: 'libs')

### Scanning for Vulnerabilities
```bash
# Scan for vulnerabilities in dependencies
nx-tools vuln [options]
```
Options:
- `-r, --root <path>` - Path to monorepo root
- `-l, --level <level>` - Minimum vulnerability level to report

### Examples
```bash
# Analyze dependencies and open a report in the browser
nx-tools deps -p /path/to/nx/project -b

# Only show npm projects with their dependencies
nx-tools deps -p /path/to/nx/project -n

# Skip fetching latest versions for faster analysis
nx-tools deps -p /path/to/nx/project -s
```
