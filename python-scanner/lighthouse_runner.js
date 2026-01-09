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
        // CRITICAL: Try .mjs extension first (forces ES module interpretation)
        // Then fall back to .js (which might fail if package.json has "type": "commonjs")
        const configBaseName = isLite ? 'custom-config-lite' : 'custom-config';
        const possibleConfigPaths = [
            // Try .mjs first (forces ES module)
            `/app/lighthouse-configs/${configBaseName}.mjs`,
            path.join(__dirname, 'lighthouse-configs', `${configBaseName}.mjs`),
            `./lighthouse-configs/${configBaseName}.mjs`,
            // Fall back to .js
            `/app/lighthouse-configs/${configBaseName}.js`,
            path.join(__dirname, 'lighthouse-configs', `${configBaseName}.js`),
            `./lighthouse-configs/${configBaseName}.js`
        ];
        
        console.log(`🔍 Looking for custom config (isLite: ${isLite})...`);
        for (const configPath of possibleConfigPaths) {
            const exists = fs.existsSync(configPath);
            console.log(`   Checking: ${configPath} - ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
        }
        
        // Try to load custom config (ES module) - if it fails, continue without it
        for (const configPath of possibleConfigPaths) {
            if (fs.existsSync(configPath)) {
                console.log(`📂 Attempting to load config from: ${configPath}`);
                try {
                    // Use dynamic import for ES modules (config files use import/export)
                    // CRITICAL: Must use proper file:// URL format for ES modules
                    // In CommonJS context, we need to ensure the file is treated as ES module
                    const resolvedPath = path.resolve(configPath);
                    
                    // Ensure proper file:// URL format
                    // For ES modules, we need file:/// (three slashes) on Unix, file:///C:/ on Windows
                    let fileUrl;
                    if (process.platform === 'win32') {
                        // Windows: file:///C:/path/to/file.js (three slashes + drive letter)
                        const normalizedPath = resolvedPath.replace(/\\/g, '/');
                        fileUrl = `file:///${normalizedPath}`;
                    } else {
                        // Unix: file:///path/to/file.js (three slashes)
                        fileUrl = `file://${resolvedPath}`;
                    }
                    
                    console.log(`   Loading ES module from: ${fileUrl}`);
                    
                    // Use dynamic import with proper URL
                    // Dynamic import() in CommonJS context should handle ES modules correctly
                    const configModule = await import(fileUrl);
                    let loadedConfig = configModule.default || configModule;
                    
                    // CRITICAL FIX: Resolve paths in config relative to config file location
                    // The config uses __dirname which is evaluated in the config file's context
                    // We need to ensure paths are correct relative to where the config file actually is
                    const configDir = path.dirname(resolvedPath);
                    
                    // CRITICAL: The config file's __dirname is evaluated when the config module is loaded.
                    // The paths should already be absolute. However, if they're wrong (e.g., from a different
                    // working directory), we need to fix them relative to the config file's actual location.
                    // The config file structure is: /app/lighthouse-configs/custom-config.js
                    // Gatherers are at: /app/lighthouse-configs/custom_gatherers/*.js
                    // Audits are at: /app/lighthouse-configs/custom_audits/*.js
                    
                    // Fix artifact paths (gatherers)
                    if (loadedConfig.artifacts && Array.isArray(loadedConfig.artifacts)) {
                        loadedConfig.artifacts = loadedConfig.artifacts.map(artifact => {
                            if (artifact.gatherer) {
                                // If path doesn't exist, try to find it relative to config directory
                                if (!fs.existsSync(artifact.gatherer)) {
                                    const gathererBasename = path.basename(artifact.gatherer);
                                    const gathererDirName = 'custom_gatherers';
                                    
                                    // Try common locations
                                    const possiblePaths = [
                                        path.join(configDir, gathererDirName, gathererBasename), // Same dir as config
                                        path.join('/app', 'lighthouse-configs', gathererDirName, gathererBasename), // Absolute in container
                                        path.join(__dirname, 'lighthouse-configs', gathererDirName, gathererBasename), // Relative to runner
                                        artifact.gatherer // Keep original as fallback
                                    ];
                                    
                                    for (const possiblePath of possiblePaths) {
                                        if (fs.existsSync(possiblePath)) {
                                            artifact.gatherer = possiblePath;
                                            break;
                                        }
                                    }
                                }
                            }
                            return artifact;
                        });
                    }
                    
                    // Fix audit paths
                    if (loadedConfig.audits && Array.isArray(loadedConfig.audits)) {
                        loadedConfig.audits = loadedConfig.audits.map(audit => {
                            if (audit.path) {
                                // If path doesn't exist, try to find it relative to config directory
                                if (!fs.existsSync(audit.path)) {
                                    const auditBasename = path.basename(audit.path);
                                    const auditDirName = 'custom_audits';
                                    
                                    // Try common locations
                                    const possiblePaths = [
                                        path.join(configDir, auditDirName, auditBasename), // Same dir as config
                                        path.join('/app', 'lighthouse-configs', auditDirName, auditBasename), // Absolute in container
                                        path.join(__dirname, 'lighthouse-configs', auditDirName, auditBasename), // Relative to runner
                                        audit.path // Keep original as fallback
                                    ];
                                    
                                    for (const possiblePath of possiblePaths) {
                                        if (fs.existsSync(possiblePath)) {
                                            audit.path = possiblePath;
                                            break;
                                        }
                                    }
                                }
                            }
                            return audit;
                        });
                    }
                    
                    customConfig = loadedConfig;
                    console.log(`✅ Loaded custom config from ${configPath}`);
                    console.log(`   Config directory: ${configDir}`);
                    console.log(`   Found ${loadedConfig.artifacts?.length || 0} gatherers and ${loadedConfig.audits?.length || 0} audits`);
                    
                    // Verify paths exist and log details
                    let allPathsValid = true;
                    if (loadedConfig.artifacts) {
                        console.log(`   Verifying gatherer paths...`);
                        for (const artifact of loadedConfig.artifacts) {
                            if (artifact.gatherer) {
                                if (fs.existsSync(artifact.gatherer)) {
                                    console.log(`     ✅ ${artifact.id}: ${path.basename(artifact.gatherer)}`);
                                } else {
                                    console.log(`     ❌ ${artifact.id}: Path not found - ${artifact.gatherer}`);
                                    allPathsValid = false;
                                }
                            }
                        }
                    }
                    if (loadedConfig.audits) {
                        console.log(`   Verifying audit paths...`);
                        for (const audit of loadedConfig.audits) {
                            if (audit.path) {
                                if (fs.existsSync(audit.path)) {
                                    console.log(`     ✅ ${path.basename(audit.path)}`);
                                } else {
                                    console.log(`     ❌ Path not found - ${audit.path}`);
                                    allPathsValid = false;
                                }
                            }
                        }
                    }
                    
                    if (!allPathsValid) {
                        console.warn(`⚠️ Some custom audit/gatherer paths are invalid. Custom audits may not run correctly.`);
                    }
                    break;
                } catch (e) {
                    // Log error for debugging
                    console.error(`❌ Failed to load custom config from ${configPath}: ${e.message}`);
                    console.error(`   Error stack: ${e.stack}`);
                    if (configPath === possibleConfigPaths[possibleConfigPaths.length - 1]) {
                        console.warn(`⚠️ Will use Lighthouse defaults (custom audits will not run)`);
                        console.warn(`   This means text-font-audit, flesch-kincaid-audit, and other custom audits will be missing!`);
                    }
                }
            }
        }
        
        if (!customConfig) {
            console.warn(`⚠️ No custom config loaded - using Lighthouse defaults only`);
            console.warn(`   Custom audits (text-font-audit, flesch-kincaid-audit, etc.) will not run!`);
        } else {
            console.log(`✅ Custom config successfully loaded and ready to use`);
        }
        
        // If no custom config loaded, Lighthouse will use its default config
        // This is fine - we can still run audits without custom config
        
        // Run Lighthouse with retry logic
        console.log(`Running Lighthouse audit for ${url} on port ${port}...`);
        if (customConfig) {
            console.log(`   Using custom config with ${customConfig.audits?.length || 0} custom audits`);
            if (customConfig.audits) {
                customConfig.audits.forEach(audit => {
                    console.log(`     - ${path.basename(audit.path || 'unknown')}`);
                });
            }
        } else {
            console.log(`   Using default Lighthouse config (no custom audits)`);
        }
        
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

