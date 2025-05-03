/**
 * Utilities for report generation and management
 */
const fs = require('fs');
const path = require('path');
const { openInBrowser } = require('./browser-opener');

// Default reports directory
const DEFAULT_REPORTS_DIR = 'deps-reports';

/**
 * Ensures the reports directory exists
 * @param {string} reportsDir - Path to reports directory
 * @returns {string} - Absolute path to reports directory
 */
function ensureReportsDirectory(reportsDir = DEFAULT_REPORTS_DIR) {
  const absolutePath = path.resolve(reportsDir);
  
  if (!fs.existsSync(absolutePath)) {
    console.log(`📁 Creating reports directory: ${absolutePath}`);
    fs.mkdirSync(absolutePath, { recursive: true });
  }
  
  return absolutePath;
}

/**
 * Saves a report to the reports directory
 * @param {string} content - Report content
 * @param {string} filename - Report filename
 * @param {string} reportsDir - Reports directory (default: deps-reports)
 * @returns {string} - Path to the saved report
 */
function saveReport(content, filename, reportsDir = DEFAULT_REPORTS_DIR) {
  const reportsDirPath = ensureReportsDirectory(reportsDir);
  const reportPath = path.join(reportsDirPath, filename);
  
  fs.writeFileSync(reportPath, content);
  console.log(`✅ Report saved to: ${reportPath}`);
  
  return reportPath;
}

/**
 * Generates a timestamped filename
 * @param {string} prefix - Filename prefix
 * @param {string} ext - File extension
 * @returns {string} - Timestamped filename
 */
function generateTimestampedFilename(prefix, ext = 'html') {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0')
  ].join('');
  
  return `${prefix}-${timestamp}.${ext}`;
}

/**
 * Processes output path, handling reports directory and default values
 * @param {string} outputPath - User-specified output path
 * @param {string} defaultFilename - Default filename if not specified
 * @param {string} reportsDir - Reports directory (default: deps-reports)
 * @returns {string} - Full path for the report
 */
function processOutputPath(outputPath, defaultFilename, reportsDir = DEFAULT_REPORTS_DIR) {
  // If output path is empty, use default filename in reports dir
  if (!outputPath) {
    return path.join(reportsDir, defaultFilename);
  }
  
  // If output path is just a filename (no directories), put it in reports dir
  if (!outputPath.includes(path.sep)) {
    return path.join(reportsDir, outputPath);
  }
  
  // If output path is a full path, use it as is
  return outputPath;
}

/**
 * Saves a report and optionally opens it in browser
 * @param {string} content - Report content
 * @param {string} outputPath - Where to save the report
 * @param {boolean} openInBrowserFlag - Whether to open in browser
 * @param {string} defaultFilename - Default filename if outputPath is empty
 * @param {string} reportsDir - Reports directory
 * @returns {Promise<string>} - Path where report was saved
 */
async function saveAndOpenReport(content, outputPath, openInBrowserFlag, defaultFilename, reportsDir = DEFAULT_REPORTS_DIR) {
  const finalPath = processOutputPath(outputPath, defaultFilename, reportsDir);
  const reportPath = saveReport(content, path.basename(finalPath), path.dirname(finalPath));
  
  if (openInBrowserFlag) {
    await openInBrowser(reportPath);
  } else {
    console.log('💡 To view the report, open the file in your browser or run with --browser flag');
  }
  
  return reportPath;
}

module.exports = {
  DEFAULT_REPORTS_DIR,
  ensureReportsDirectory,
  saveReport,
  generateTimestampedFilename,
  processOutputPath,
  saveAndOpenReport
}; 