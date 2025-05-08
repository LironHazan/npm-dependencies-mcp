/**
 * Browser opener utility for HTML reports
 */
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

/**
 * Opens a file in the default browser based on OS
 * @param {string} filePath - Path to the file to open
 * @returns {Promise<boolean>} - Success status
 */
function openInBrowser(filePath) {
  return new Promise((resolve) => {
    const absolutePath = path.resolve(filePath);
    
    console.log(`🌐 Opening ${absolutePath} in your default browser...`);
    
    // Determine the command based on the operating system
    let command;
    const platform = os.platform();
    
    if (platform === 'darwin') {         // macOS
      command = `open "${absolutePath}"`;
    } else if (platform === 'win32') {    // Windows
      command = `start "" "${absolutePath}"`;
    } else {                              // Linux and others
      command = `xdg-open "${absolutePath}"`;
    }
    
    // Execute the command to open the browser
    exec(command, (error) => {
      if (error) {
        console.error(`❌ Error opening browser: ${error.message}`);
        console.log(`💡 You can manually open the file at: ${absolutePath}`);
        resolve(false);
      } else {
        console.log('✅ Browser opened successfully');
        resolve(true);
      }
    });
  });
}

module.exports = {
  openInBrowser
}; 