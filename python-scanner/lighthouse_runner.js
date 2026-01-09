/**
 * Lighthouse Runner for Camoufox Integration
 * This script runs Lighthouse and connects to an existing browser via CDP
 */

// CommonJS imports
const fs = require('fs');
const path = require('path');

// Lighthouse and chrome-launcher - handle both CommonJS and ES module exports
let lighthouse, chromeLauncher;

async function runLighthouse() {
    // Import Lighthouse and chrome-launcher
    // Lighthouse v12+ may export as ES module even in CommonJS context
    if (!lighthouse || !chromeLauncher) {
        const lighthouseModule = require('lighthouse');
        const chromeLauncherModule = require('chrome-launcher');
        
        // Handle both default export and named export
        lighthouse = lighthouseModule.default || lighthouseModule;
        chromeLauncher = chromeLauncherModule.default || chromeLauncherModule;
        
        // Verify lighthouse is a function
        if (typeof lighthouse !== 'function') {
            throw new Error(`Lighthouse is not a function. Type: ${typeof lighthouse}, Module keys: ${Object.keys(lighthouseModule)}`);
        }
    }
    
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
            // Launch new Chrome/Chromium instance
            // Use CHROME_PATH from environment if set, otherwise chrome-launcher will find it
            const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
            
            if (!chromePath) {
                throw new Error('The CHROME_PATH environment variable must be set to a Chrome/Chromium executable.');
            }
            
            // Verify Chrome executable exists
            if (!fs.existsSync(chromePath)) {
                throw new Error(`Chrome executable not found at: ${chromePath}`);
            }
            
            // Check if it's executable
            try {
                fs.accessSync(chromePath, fs.constants.F_OK | fs.constants.X_OK);
            } catch (accessError) {
                throw new Error(`Chrome executable is not accessible at: ${chromePath}`);
            }
            
            // Use a fixed port range to avoid conflicts, but let chrome-launcher pick an available one
            const launchOptions = {
                chromeFlags: [
                    '--headless=new', // Use new headless mode
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ],
                chromePath: chromePath,
                port: 0 // Let chrome-launcher pick an available port
            };
            
            console.log(`Launching Chrome/Chromium from: ${chromePath}`);
            
            try {
                chrome = await chromeLauncher.launch(launchOptions);
                port = chrome.port;
                console.log(`✅ Chrome/Chromium launched successfully on port ${port}`);
                
                // Wait a moment to ensure Chrome is fully ready
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Verify Chrome is accessible
                const http = require('http');
                const checkUrl = `http://localhost:${port}/json/version`;
                await new Promise((resolve, reject) => {
                    const req = http.get(checkUrl, (res) => {
                        if (res.statusCode === 200) {
                            console.log(`✅ Chrome debugger is accessible on port ${port}`);
                            resolve();
                        } else {
                            reject(new Error(`Chrome debugger returned status ${res.statusCode}`));
                        }
                    });
                    req.on('error', (err) => {
                        reject(new Error(`Cannot connect to Chrome debugger: ${err.message}`));
                    });
                    req.setTimeout(5000, () => {
                        req.destroy();
                        reject(new Error('Chrome debugger connection timeout'));
                    });
                });
            } catch (launchError) {
                console.error(`❌ Failed to launch Chrome: ${launchError.message}`);
                throw new Error(`Chrome launch failed: ${launchError.message}`);
            }
        }
        
        // Lighthouse options
        const options = {
            port: port,
            output: 'json',
            logLevel: 'info',
            maxWaitForFcp: 15000,
            maxWaitForLoad: 45000,
            formFactor: device === 'mobile' ? 'mobile' : (device === 'tablet' ? 'mobile' : 'desktop'),
            screenEmulation: device === 'mobile' ? {
                mobile: true,
                width: 375,
                height: 667,
                deviceScaleFactor: 2
            } : device === 'tablet' ? {
                mobile: true,
                width: 800,
                height: 1280,
                deviceScaleFactor: 2
            } : {
                mobile: false,
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1
            },
            throttlingMethod: 'simulate',
            disableStorageReset: true,
            // Additional options for stability
            skipAboutBlank: false,
            onlyCategories: isLite ? ['senior-friendly-lite'] : ['senior-friendly']
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
        
        // Try to load custom config (ES module) - if it fails, continue without it
        for (const configPath of possibleConfigPaths) {
            if (fs.existsSync(configPath)) {
                try {
                    // Use dynamic import for ES modules (config files use import/export)
                    const resolvedPath = path.resolve(configPath);
                    const fileUrl = resolvedPath.startsWith('file://') ? resolvedPath : `file://${resolvedPath}`;
                    const configModule = await import(fileUrl);
                    customConfig = configModule.default || configModule;
                    console.log(`✅ Loaded custom config from ${configPath}`);
                    break;
                } catch (e) {
                    // Silently continue - config is optional, Lighthouse will use defaults
                    // Only log warning for debugging
                    if (configPath === possibleConfigPaths[possibleConfigPaths.length - 1]) {
                        console.warn(`⚠️ Could not load custom config (will use Lighthouse defaults): ${e.message}`);
                    }
                }
            }
        }
        
        // If no custom config loaded, Lighthouse will use its default config
        // This is fine - we can still run audits without custom config
        
        // Run Lighthouse with retry logic
        console.log(`Running Lighthouse audit for ${url} on port ${port}...`);
        let result;
        let lastError;
        
        // Retry up to 2 times if connection fails
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`Retry attempt ${attempt}...`);
                    // Wait a bit before retry
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                // Call lighthouse function (already extracted in function start)
                result = await lighthouse(url, options, customConfig);
                
                if (!result || !result.lhr) {
                    throw new Error('Lighthouse failed to generate report');
                }
                
                // Success - break out of retry loop
                break;
            } catch (error) {
                lastError = error;
                console.error(`Lighthouse attempt ${attempt} failed: ${error.message}`);
                
                if (attempt === 2) {
                    // Last attempt failed, throw the error
                    throw new Error(`Lighthouse failed after ${attempt} attempts: ${error.message}`);
                }
            }
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

