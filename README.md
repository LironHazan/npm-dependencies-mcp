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
This protocol provides a structured approach to analyze, query, and manage NPM dependencies across a JavaScript/TypeScript monorepo. It establishes a series of investigative questions and automated checks to maintain dependency health and understand dependency relationships.

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

## Integration with CI/CD

You can integrate MCP NPM Dependencies into your CI/CD pipeline to monitor dependency health automatically:

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
          npm install -g mcp-npm-dependencies
      
      - name: Start MCP server
        run: mcp-npm start &
        
      - name: Wait for server to start
        run: sleep 5
      
      - name: Run dependency analysis
        run: |
          mcp-npm structure > report-structure.md
          mcp-npm inconsistencies > report-inconsistencies.md
          mcp-npm circular > report-circular.md
          mcp-npm security > report-security.md
      
      - name: Archive reports
        uses: actions/upload-artifact@v3
        with:
          name: dependency-reports
          path: report-*.md
```

## Features and Benefits

- **Centralized Dependency Management**: Monitor all dependencies across your monorepo in one place
- **Inconsistency Detection**: Quickly find and fix version inconsistencies
- **Natural Language Interface**: Ask questions about your dependencies in plain English
- **Security Monitoring**: Stay on top of security vulnerabilities
- **Interactive Mode**: Explore dependencies through an interactive CLI
- **Visualization**: Generate dependency graphs to understand relationships
- **API Server**: Use the server API for custom integrations
- **Cached Analysis**: Fast responses thanks to intelligent caching

## System Requirements

- Node.js 14 or higher
- NPM 7 or higher
- For advanced features: `depcheck`, `dependency-cruiser`, and `madge`

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
