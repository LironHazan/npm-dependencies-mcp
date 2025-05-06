#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const { execSync } = require('child_process');

program
  .name('nx-tools')
  .description('Nx Monorepo Analysis Toolkit')
  .version('1.0.0');

program
  .command('graph')
  .description('Generate a visualization of project dependencies')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-o, --output <file>', 'Output HTML file', '')
  .option('-b, --browser', 'Open the generated file in browser', false)
  .option('-d, --reports-dir <dir>', 'Reports directory', 'deps-reports')
  .action((options) => {
    const scriptPath = path.join(__dirname, '../src/nx/nx-graph-visualizer.js');
    const cmd = `node ${scriptPath} generate --root "${options.root}" ${options.output ? `--output "${options.output}"` : ''} ${options.browser ? '--browser' : ''} --reports-dir "${options.reportsDir}"`;
    
    console.log(`Executing: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
  });

program
  .command('deps')
  .description('Analyze project dependencies')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-o, --output <file>', 'Output HTML report file', '')
  .option('-b, --browser', 'Open the generated report in browser', false)
  .option('-d, --reports-dir <dir>', 'Reports directory', 'deps-reports')
  .option('-p, --project <n>', 'Analyze a specific project')
  .option('-s, --skip-latest', 'Skip fetching latest versions from npm')
  .option('-n, --npm-only', 'Show only npm projects with dependencies')
  .action((options) => {
    const scriptPath = path.join(__dirname, '../src/nx/nx-project-deps.js');
    let cmd;
    
    if (options.project) {
      cmd = `node ${scriptPath} project --root "${options.root}" ${options.verbose ? '--verbose' : ''} --project "${options.project}" ${options.browser ? '--browser' : ''} ${options.skipLatest ? '--skip-latest' : ''} ${options.npmOnly ? '--npm-only' : ''}`;
    } else {
      cmd = `node ${scriptPath} analyze --root "${options.root}" ${options.verbose ? '--verbose' : ''} ${options.output ? `--output "${options.output}"` : ''} ${options.browser ? '--browser' : ''} --reports-dir "${options.reportsDir}" ${options.skipLatest ? '--skip-latest' : ''} ${options.npmOnly ? '--npm-only' : ''}`;
    }
    
    console.log(`Executing: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
  });

program
  .command('analyze')
  .description('Analyze the structure of an Nx monorepo')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-a, --apps <dir>', 'Apps directory name', 'apps')
  .option('-l, --libs <dir>', 'Libraries directory name', 'libs')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-o, --output <file>', 'Output HTML report file', '')
  .option('-b, --browser', 'Open the report in browser', false)
  .option('-d, --reports-dir <dir>', 'Reports directory', 'deps-reports')
  .action((options) => {
    const scriptPath = path.join(__dirname, '../src/nx/nx-root-analyzer.js');
    const cmd = `node ${scriptPath} analyze --root "${options.root}" --apps "${options.apps}" --libs "${options.libs}" ${options.verbose ? '--verbose' : ''} ${options.output ? `--output "${options.output}"` : ''} ${options.browser ? '--browser' : ''} --reports-dir "${options.reportsDir}"`;
    
    console.log(`Executing: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
  });

program
  .command('vuln')
  .description('Scan for vulnerabilities in dependencies')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-o, --output <file>', 'Output HTML report file', '')
  .option('-b, --browser', 'Open the generated report in browser', false)
  .option('-d, --reports-dir <dir>', 'Reports directory', 'deps-reports')
  .option('-l, --level <level>', 'Minimum vulnerability level to report (low, moderate, high, critical)')
  .action((options) => {
    const scriptPath = path.join(__dirname, '../src/nx/nx-vuln-scanner.js');
    const cmd = `node ${scriptPath} scan --root "${options.root}" ${options.output ? `--output "${options.output}"` : ''} ${options.browser ? '--browser' : ''} --reports-dir "${options.reportsDir}" ${options.level ? `--level ${options.level}` : ''}`;
    
    console.log(`Executing: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
  });

program.parse(process.argv);

// Show help if no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 