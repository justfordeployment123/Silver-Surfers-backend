/**
 * Lighthouse Runner for Camoufox Integration
 * This script runs Lighthouse and connects to an existing browser via CDP
 */

const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');
const path = require('path');

async function runLighthouse() {
    const args = process.argv.slice(2);
    
    // Parse arguments
    const url = args[0];
    const outputPath = args[1];
    const device = args[2] || 'desktop';
    const isLite = args[3] === 'true';
    const cdpUrl = args[4]; // Optional: CDP WebSocket URL
    
    if (!url || !outputPath) {
        console.error('Usage: node lighthouse_runner.js <url> <outputPath> <device> <isLite> [cdpUrl]');
        process.exit(1);
    }
    
    try {
        let chrome;
        let port;
        
        // If CDP URL provided, connect to existing browser
        if (cdpUrl) {
            // Extract port from CDP URL (format: ws://localhost:PORT/devtools/browser/...)
            const portMatch = cdpUrl.match(/ws:\/\/localhost:(\d+)/);
            if (portMatch) {
                port = parseInt(portMatch[1]);
                console.log(`Connecting to existing browser on port ${port}`);
            } else {
                throw new Error('Invalid CDP URL format');
            }
        } else {
            // Launch new Chrome instance
            chrome = await chromeLauncher.launch({
                chromeFlags: [
                    '--headless',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--remote-debugging-port=0' // Use random port
                ]
            });
            port = chrome.port;
            console.log(`Launched Chrome on port ${port}`);
        }
        
        // Lighthouse options
        const options = {
            port: port,
            output: 'json',
            logLevel: 'info',
            maxWaitForFcp: 15000,
            maxWaitForLoad: 45000,
            formFactor: device === 'mobile' ? 'mobile' : 'desktop',
            screenEmulation: device === 'mobile' ? {
                mobile: true,
                width: 375,
                height: 667,
                deviceScaleFactor: 2
            } : {
                mobile: false,
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1
            },
            throttlingMethod: 'simulate',
            disableStorageReset: true
        };
        
        // Load custom config if available
        let customConfig = null;
        // Try multiple possible paths for config files
        const possibleConfigPaths = [
            isLite 
                ? '/app/lighthouse-configs/custom-config-lite.js'
                : '/app/lighthouse-configs/custom-config.js',
            isLite
                ? path.join(__dirname, 'lighthouse-configs', 'custom-config-lite.js')
                : path.join(__dirname, 'lighthouse-configs', 'custom-config.js'),
            isLite
                ? './lighthouse-configs/custom-config-lite.js'
                : './lighthouse-configs/custom-config.js'
        ];
        
        for (const configPath of possibleConfigPaths) {
            if (fs.existsSync(configPath)) {
                try {
                    // Use dynamic import for ES modules
                    const configModule = await import('file://' + path.resolve(configPath));
                    customConfig = configModule.default || configModule;
                    console.log(`Loaded custom config from ${configPath}`);
                    break;
                } catch (e) {
                    console.warn(`Could not load custom config from ${configPath}: ${e.message}`);
                }
            }
        }
        
        if (!customConfig) {
            console.log('Using default Lighthouse config (no custom config found)');
        }
        
        // Run Lighthouse
        console.log(`Running Lighthouse audit for ${url}...`);
        const result = await lighthouse(url, options, customConfig);
        
        if (!result || !result.lhr) {
            throw new Error('Lighthouse failed to generate report');
        }
        
        // Save report
        fs.writeFileSync(outputPath, JSON.stringify(result.lhr, null, 2));
        console.log(`Lighthouse report saved to ${outputPath}`);
        
        // Cleanup
        if (chrome) {
            await chrome.kill();
        }
        
        // Return success
        process.exit(0);
    } catch (error) {
        console.error('Lighthouse error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

runLighthouse();

