# Nx Monorepo Analysis Toolkit

This toolkit provides a set of tools for analyzing and visualizing dependencies in Nx monorepos, especially those with centralized dependency management at the root level.

## Installation

If you've installed this package globally:

```bash
npm install -g npm-dependencies-mcp
```

You can access the tools directly:

```bash
nx-tools <command> [options]
```

If using locally in a project:

```bash
npx nx-tools <command> [options]
```

Or through npm scripts:

```bash
npm run nx-tools -- <command> [options]
```

## Commands

### Analyze Monorepo Structure

Analyze the overall structure of an Nx monorepo, including dependencies and projects.

```bash
nx-tools analyze --root /path/to/monorepo --browser
```

Options:
- `-r, --root <path>` - Path to monorepo root (default: current directory)
- `-a, --apps <dir>` - Apps directory name (default: "apps")
- `-l, --libs <dir>` - Libraries directory name (default: "libs")
- `-v, --verbose` - Enable verbose output
- `-o, --output <file>` - Output HTML report file
- `-b, --browser` - Open the report in browser
- `-d, --reports-dir <dir>` - Reports directory (default: "deps-reports")

### Visualize Dependency Graph

Generate a visual dependency graph of the projects in your Nx monorepo.

```bash
nx-tools graph --root /path/to/monorepo --browser
```

Options:
- `-r, --root <path>` - Path to monorepo root (default: current directory)
- `-o, --output <file>` - Output HTML file
- `-b, --browser` - Open the generated file in browser
- `-d, --reports-dir <dir>` - Reports directory (default: "deps-reports")

### Analyze Project Dependencies

Analyze dependencies for all projects or a specific project in the monorepo.

```bash
# Analyze all projects
nx-tools deps --root /path/to/monorepo --browser

# Analyze a specific project
nx-tools deps --root /path/to/monorepo --project my-project
```

Options:
- `-r, --root <path>` - Path to monorepo root (default: current directory)
- `-v, --verbose` - Enable verbose output
- `-o, --output <file>` - Output HTML report file
- `-b, --browser` - Open the generated report in browser
- `-d, --reports-dir <dir>` - Reports directory (default: "deps-reports")
- `-p, --project <name>` - Analyze a specific project

## Examples

1. Generate a dependency graph for your monorepo and open in browser:
   ```bash
   nx-tools graph --root /path/to/monorepo --browser
   ```

2. Analyze dependencies for a specific project:
   ```bash
   nx-tools deps --project my-project --root /path/to/monorepo
   ```

3. Analyze the entire monorepo structure and save report to a custom location:
   ```bash
   nx-tools analyze --root /path/to/monorepo --output my-report.html
   ```

## Output

All reports are saved to the `deps-reports` directory by default (configurable with `--reports-dir`). HTML reports provide interactive visualization and analysis of your monorepo's dependencies. 