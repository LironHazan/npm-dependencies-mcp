#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { program } = require('commander');
const { saveAndOpenReport, generateTimestampedFilename } = require('../utils/report-utils');

// Generate HTML for visualizing dependencies
async function generateDependencyGraph(options) {
  const { rootDir, outputFile, openBrowser, reportsDir } = options;
  console.log(`🔍 Generating dependency graph for Nx monorepo at ${rootDir}`);

  try {
    // Run nx graph to generate dependency data
    console.log('Generating Nx dependency data...');
    const tempJsonFile = path.join(process.cwd(), 'nx-dep-graph-temp.json');
    
    execSync(`npx nx graph --file=${tempJsonFile}`, {
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
    });

    if (!fs.existsSync(tempJsonFile)) {
      console.error('❌ Failed to generate dependency data. Is this an Nx workspace?');
      return false;
    }

    // Read the generated JSON file
    const graphData = JSON.parse(fs.readFileSync(tempJsonFile, 'utf8'));
    
    // Generate HTML visualization
    const html = createVisualizationHtml(graphData);
    
    // Clean up temporary JSON file
    fs.unlinkSync(tempJsonFile);
    
    // Save report and optionally open in browser
    const defaultFilename = generateTimestampedFilename('dep-graph');
    await saveAndOpenReport(html, outputFile, openBrowser, defaultFilename, reportsDir);
    
    return true;
  } catch (error) {
    console.error(`❌ Error generating dependency graph: ${error.message}`);
    console.log('💡 Try running this command in the monorepo root directory');
    return false;
  }
}

// Create HTML visualization
function createVisualizationHtml(graphData) {
  // Extract projects and dependencies
  const { graph } = graphData;
  const { nodes, dependencies } = graph;
  
  // Prepare nodes array for visualization
  const nodeArray = Object.keys(nodes).map(key => {
    const node = nodes[key];
    return {
      id: key,
      label: key,
      type: node.type || 'unknown',
      data: node
    };
  });
  
  // Prepare edges array for visualization
  const edgeArray = [];
  Object.keys(dependencies).forEach(source => {
    dependencies[source].forEach(dep => {
      edgeArray.push({
        source,
        target: dep.target,
        type: dep.type || 'dependency'
      });
    });
  });
  
  // Generate HTML with embedded visualization
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nx Monorepo Dependency Graph</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    
    #container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    
    #header {
      padding: 10px;
      background-color: #f0f0f0;
      border-bottom: 1px solid #ddd;
    }
    
    #title {
      margin: 0;
      font-size: 1.5em;
    }
    
    #subtitle {
      margin: 5px 0;
      font-size: 0.9em;
      color: #666;
    }
    
    #controls {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }
    
    #graph {
      flex-grow: 1;
      position: relative;
    }
    
    svg {
      width: 100%;
      height: 100%;
    }
    
    .node {
      cursor: pointer;
      transition: opacity 0.3s;
    }
    
    .node circle {
      stroke: #fff;
      stroke-width: 1.5px;
      transition: all 0.3s;
    }
    
    .node text {
      font-size: 12px;
    }
    
    .node.app circle {
      fill: #ff6b6b;
    }
    
    .node.lib circle {
      fill: #4ecdc4;
    }
    
    .node.unknown circle {
      fill: #aaa;
    }
    
    .link {
      stroke: #999;
      stroke-opacity: 0.6;
      stroke-width: 1px;
      transition: all 0.3s;
    }
    
    .node:hover circle {
      r: 10;
    }
    
    .selected {
      stroke-width: 3px !important;
      stroke: #333 !important;
    }
    
    .tooltip {
      position: absolute;
      padding: 10px;
      background-color: rgba(255, 255, 255, 0.9);
      border: 1px solid #ddd;
      border-radius: 4px;
      pointer-events: none;
      z-index: 1000;
      font-size: 12px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      max-width: 300px;
      opacity: 0;
      transition: opacity 0.3s;
    }
    
    #legend {
      position: absolute;
      bottom: 20px;
      right: 20px;
      background-color: white;
      padding: 10px;
      border-radius: 4px;
      border: 1px solid #ddd;
    }
    
    .legend-item {
      display: flex;
      align-items: center;
      margin-bottom: 5px;
    }
    
    .legend-color {
      width: 15px;
      height: 15px;
      border-radius: 50%;
      margin-right: 5px;
    }
    
    #details {
      position: absolute;
      top: 20px;
      right: 20px;
      width: 300px;
      background-color: white;
      padding: 15px;
      border-radius: 4px;
      border: 1px solid #ddd;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      display: none;
    }
    
    #details h3 {
      margin-top: 0;
    }
    
    #details-content {
      overflow-y: auto;
      max-height: 400px;
    }
    
    .dependency-list {
      padding-left: 20px;
    }
    
    .close-btn {
      position: absolute;
      top: 5px;
      right: 5px;
      cursor: pointer;
      background: none;
      border: none;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div id="container">
    <div id="header">
      <h1 id="title">Nx Monorepo Dependency Graph</h1>
      <p id="subtitle">Visualizing project dependencies</p>
      <div id="controls">
        <button id="zoom-in">Zoom In</button>
        <button id="zoom-out">Zoom Out</button>
        <button id="reset">Reset</button>
        <label>
          <input type="checkbox" id="toggle-deps" checked>
          Show Dependencies
        </label>
      </div>
    </div>
    <div id="graph"></div>
    <div id="legend">
      <h3>Legend</h3>
      <div class="legend-item">
        <div class="legend-color" style="background-color: #ff6b6b;"></div>
        <span>Application</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background-color: #4ecdc4;"></div>
        <span>Library</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background-color: #aaa;"></div>
        <span>Unknown</span>
      </div>
    </div>
  </div>
  
  <div id="details">
    <button class="close-btn">&times;</button>
    <h3 id="details-title"></h3>
    <div id="details-content"></div>
  </div>
  
  <div class="tooltip" id="tooltip"></div>
  
  <script>
    // Graph data
    const nodes = ${JSON.stringify(nodeArray)};
    const links = ${JSON.stringify(edgeArray)};
    
    // D3 visualization
    function createGraph() {
      const width = document.getElementById('graph').clientWidth;
      const height = document.getElementById('graph').clientHeight;
      
      const svg = d3.select('#graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height);
      
      // Create a group for the graph content
      const g = svg.append('g');
      
      // Set up zoom behavior
      const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });
      
      svg.call(zoom);
      
      // Create a simulation for the graph
      const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(40));
      
      // Create links
      const link = g.append('g')
        .attr('class', 'links')
        .selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('class', 'link')
        .attr('marker-end', 'url(#arrow)');
      
      // Create arrow marker for the links
      svg.append('defs').selectAll('marker')
        .data(['arrow'])
        .enter()
        .append('marker')
        .attr('id', d => d)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20) // Position of the arrow on the line
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#999');
      
      // Create nodes
      const node = g.append('g')
        .attr('class', 'nodes')
        .selectAll('.node')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', d => 'node ' + (d.type || 'unknown'))
        .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));
      
      // Add circles for nodes
      node.append('circle')
        .attr('r', 7)
        .on('mouseover', showTooltip)
        .on('mouseout', hideTooltip)
        .on('click', showDetails);
      
      // Add labels
      node.append('text')
        .attr('dx', 12)
        .attr('dy', '.35em')
        .text(d => d.label);
      
      // Configure tooltip
      const tooltip = d3.select('#tooltip');
      
      function showTooltip(event, d) {
        tooltip.transition()
          .duration(200)
          .style('opacity', .9);
        
        tooltip.html(\`
          <strong>\${d.label}</strong><br/>
          Type: \${d.type || 'Unknown'}<br/>
          Click for details
        \`)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px');
      }
      
      function hideTooltip() {
        tooltip.transition()
          .duration(500)
          .style('opacity', 0);
      }
      
      // Details panel
      const detailsPanel = document.getElementById('details');
      const detailsTitle = document.getElementById('details-title');
      const detailsContent = document.getElementById('details-content');
      
      function showDetails(event, d) {
        // Clear previous selection
        d3.selectAll('.node circle').classed('selected', false);
        
        // Highlight selected node
        d3.select(this).classed('selected', true);
        
        // Get dependencies for this node
        const outbound = links.filter(link => link.source.id === d.id || link.source === d.id)
          .map(link => typeof link.target === 'object' ? link.target.id : link.target);
        
        const inbound = links.filter(link => link.target.id === d.id || link.target === d.id)
          .map(link => typeof link.source === 'object' ? link.source.id : link.source);
        
        // Update details panel
        detailsTitle.textContent = d.label;
        
        detailsContent.innerHTML = \`
          <p><strong>Type:</strong> \${d.type || 'Unknown'}</p>
          <p><strong>Dependencies (\${outbound.length}):</strong></p>
          <ul class="dependency-list">
            \${outbound.map(dep => \`<li>\${dep}</li>\`).join('')}
            \${outbound.length === 0 ? '<li>None</li>' : ''}
          </ul>
          <p><strong>Dependent By (\${inbound.length}):</strong></p>
          <ul class="dependency-list">
            \${inbound.map(dep => \`<li>\${dep}</li>\`).join('')}
            \${inbound.length === 0 ? '<li>None</li>' : ''}
          </ul>
        \`;
        
        detailsPanel.style.display = 'block';
      }
      
      // Close button for details panel
      document.querySelector('.close-btn').addEventListener('click', () => {
        detailsPanel.style.display = 'none';
        d3.selectAll('.node circle').classed('selected', false);
      });
      
      // Update the simulation on tick
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
      
      // Controls
      document.getElementById('zoom-in').addEventListener('click', () => {
        svg.transition().call(zoom.scaleBy, 1.3);
      });
      
      document.getElementById('zoom-out').addEventListener('click', () => {
        svg.transition().call(zoom.scaleBy, 0.7);
      });
      
      document.getElementById('reset').addEventListener('click', () => {
        svg.transition().call(zoom.transform, d3.zoomIdentity);
      });
      
      document.getElementById('toggle-deps').addEventListener('change', function() {
        const visibility = this.checked ? 'visible' : 'hidden';
        d3.selectAll('.link').style('visibility', visibility);
      });
      
      return simulation;
    }
    
    // Initialize the graph
    window.addEventListener('load', () => {
      createGraph();
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
      document.getElementById('graph').innerHTML = '';
      createGraph();
    });
  </script>
</body>
</html>
  `;
}

// CLI program
program
  .name('nx-graph-visualizer')
  .description('Generate visual representation of Nx monorepo dependencies')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate a visual dependency graph')
  .option('-r, --root <path>', 'Path to monorepo root', process.cwd())
  .option('-o, --output <file>', 'Output HTML file', '')
  .option('-b, --browser', 'Open the generated file in browser', false)
  .option('-d, --reports-dir <dir>', 'Reports directory', 'deps-reports')
  .action(async (options) => {
    const result = await generateDependencyGraph({
      rootDir: options.root,
      outputFile: options.output,
      openBrowser: options.browser,
      reportsDir: options.reportsDir
    });
    
    if (result) {
      console.log(`\n📊 Dependency graph generated successfully`);
    }
  });

program.parse(process.argv);

// Show help if no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 