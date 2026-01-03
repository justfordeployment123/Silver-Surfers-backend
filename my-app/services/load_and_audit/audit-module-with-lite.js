// audit-module-with-lite-enhanced.js

import fs from 'fs';
import { URL } from 'url';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-extra';
import { KnownDevices } from 'puppeteer';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { chromium } from 'playwright';
import customConfig from './custom-config.js';
import customConfigLite from './custom-config-lite.js';

puppeteer.use(stealthPlugin());

function calculateLiteScore(report) {
    const categoryId = 'senior-friendly-lite';
    const categoryConfig = customConfigLite.categories[categoryId];
    if (!categoryConfig) {
        return { finalScore: 0 };
    }
    const auditRefs = categoryConfig.auditRefs;
    const auditResults = report.audits;
    let totalWeightedScore = 0;
    let totalWeight = 0;
    for (const auditRef of auditRefs) {
        const { id, weight } = auditRef;
        const result = auditResults[id];
        const score = result ? (result.score ?? 0) : 0;
        totalWeightedScore += score * weight;
        totalWeight += weight;
    }
    const finalScore = totalWeight === 0 ? 0 : (totalWeightedScore / totalWeight) * 100;
    return { finalScore };
}

// Enhanced anti-bot strategies with better evasion techniques
const ANTI_BOT_STRATEGIES = {
    basic: {
        name: 'Basic',
        timeout: 120000, // 2 minutes
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled'
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        waitTime: 3000,
        extraHeaders: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Cache-Control': 'max-age=0',
            'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        }
    },
    stealth: {
        name: 'Stealth',
        timeout: 150000, // 2.5 minutes
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-web-security',
            '--disable-features=TranslateUI',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=VizDisplayCompositor',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-default-apps'
        ],
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        waitTime: 6000,
        extraHeaders: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Cache-Control': 'max-age=0',
            'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        }
    },
    aggressive: {
        name: 'Aggressive',
        timeout: 180000, // 3 minutes
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-web-security',
            '--disable-features=TranslateUI',
            '--disable-features=VizDisplayCompositor',
            '--disable-ipc-flooding-protection',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-first-run',
            '--disable-infobars',
            '--disable-notifications'
        ],
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        waitTime: 10000,
        extraHeaders: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Linux"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        },
        viewport: { width: 1920, height: 1080 }
    }
};

async function performAuditWithStrategy(url, options, strategy, attemptNumber = 1) {
    const { device, format, isLiteVersion = false, htmlFilePath = null } = options;
    const version = isLiteVersion ? 'Lite' : 'Full';
    const strategyConfig = ANTI_BOT_STRATEGIES[strategy];

    console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name} Strategy - ${version}] Starting ${device} audit for: ${url}`);

    let browser = null;
    let auditTimeoutId = null;

    try {
        // Create overall timeout for this entire attempt
        const auditPromise = new Promise(async (resolve, reject) => {
            try {
                // Set timeout for this specific strategy attempt
                auditTimeoutId = setTimeout(() => {
                    reject(new Error(`${strategyConfig.name} strategy timeout after ${strategyConfig.timeout/1000} seconds`));
                }, strategyConfig.timeout);

                const launchOptions = {
                    headless: 'new',
                    args: strategyConfig.args,
                    timeout: 30000,
                    protocolTimeout: 60000
                };

                browser = await puppeteer.launch(launchOptions);
                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Browser launched successfully`);

                const page = await browser.newPage();

                // Enhanced stealth techniques to avoid bot detection
                await page.evaluateOnNewDocument(() => {
                    // Remove webdriver property
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined,
                    });
                    
                    // Override the plugins property to use a custom getter
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [1, 2, 3, 4, 5],
                    });
                    
                    // Override the languages property to use a custom getter
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en'],
                    });
                    
                    // Override the permissions property
                    const originalQuery = window.navigator.permissions.query;
                    window.navigator.permissions.query = (parameters) => (
                        parameters.name === 'notifications' ?
                            Promise.resolve({ state: Notification.permission }) :
                            originalQuery(parameters)
                    );
                    
                    // Mock chrome runtime
                    if (!window.chrome) {
                        window.chrome = {
                            runtime: {},
                            loadTimes: function() {},
                            csi: function() {},
                            app: {}
                        };
                    }
                    
                    // Override getBattery if it exists
                    if (navigator.getBattery) {
                        navigator.getBattery = () => Promise.resolve({
                            charging: true,
                            chargingTime: 0,
                            dischargingTime: Infinity,
                            level: 1
                        });
                    }
                });

                // Apply strategy-specific settings with enhanced headers
                const enhancedHeaders = {
                    ...strategyConfig.extraHeaders,
                    'Referer': 'https://www.google.com/',
                    'Origin': new URL(url).origin,
                };
                if (enhancedHeaders) {
                    await page.setExtraHTTPHeaders(enhancedHeaders);
                }

                if (device === 'mobile') {
                    await page.emulate(KnownDevices['Pixel 5']);
                } else {
                    await page.setUserAgent(strategyConfig.userAgent);
                    const viewport = strategyConfig.viewport || { width: 1280, height: 800 };
                    await page.setViewport(viewport);
                }

                // Check if we have HTML file from Playwright (bypass navigation)
                let response = null;
                const fs = await import('fs/promises');
                
                if (htmlFilePath) {
                    try {
                        // Check if file exists
                        await fs.access(htmlFilePath);
                        console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Loading HTML from Playwright file (bypassing navigation)...`);
                        const fileUrl = `file://${htmlFilePath}`;
                        response = await page.goto(fileUrl, {
                            waitUntil: 'domcontentloaded',
                            timeout: 60000
                        });
                        // Set the original URL for Lighthouse (so it knows what URL we're auditing)
                        await page.evaluate((originalUrl) => {
                            window.history.replaceState({}, '', originalUrl);
                        }, url);
                        console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] HTML loaded from file, URL set to: ${url}`);
                    } catch (fileError) {
                        console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] HTML file not found, falling back to navigation...`);
                        // Fall through to normal navigation
                    }
                }
                
                // If no HTML file or file load failed, navigate normally
                if (!response) {
                    // Navigate with strategy-specific timeout and human-like behavior
                    console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Navigating to ${url}...`);
                    
                    // Add random delay before navigation (human-like behavior)
                    const randomDelay = Math.random() * 2000 + 1000; // 1-3 seconds
                    await new Promise(resolve => setTimeout(resolve, randomDelay));
                    
                    // Simulate mouse movement before navigation
                    await page.mouse.move(Math.random() * 100, Math.random() * 100);
                    
                    response = await page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 60000
                    });
                    
                    // Simulate human-like scrolling after page loads
                    await page.evaluate(() => {
                        window.scrollTo(0, Math.random() * 500);
                    });
                }

                if (!response) {
                    throw new Error('No response received from page navigation');
                }

                // More permissive status code handling - accept redirects and some 4xx codes
                if (response.status() >= 500) {
                    throw new Error(`HTTP ${response.status()}: Server error`);
                }
                
                if (response.status() === 403) {
                    // For 403, try to wait and see if it's just a temporary block
                    console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Got 403, waiting to see if page loads...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    // Try to get page content to see if it actually loaded
                    try {
                        const content = await page.content();
                        if (content.length < 1000) {
                            throw new Error(`HTTP ${response.status()}: Failed to load page - insufficient content`);
                        }
                        console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Page content loaded despite 403 status`);
                    } catch (contentError) {
                        throw new Error(`HTTP ${response.status()}: Failed to load page - ${contentError.message}`);
                    }
                } else if (response.status() >= 400 && response.status() < 500) {
                    throw new Error(`HTTP ${response.status()}: Failed to load page`);
                }

                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Page loaded successfully (Status: ${response.status()})`);

                // Strategy-specific wait time with additional random delay
                const totalWaitTime = strategyConfig.waitTime + Math.random() * 2000;
                await new Promise(resolve => setTimeout(resolve, totalWaitTime));

                const lighthouseOptions = {
                    output: format,
                    logLevel: 'info',
                    maxWaitForFcp: 15000,
                    maxWaitForLoad: 30000,
                    // Disable fresh navigation to use existing page
                    skipAboutBlank: true,
                    disableStorageReset: true,
                    // Allow Lighthouse to work with problematic responses
                    maxWaitForLoad: 30000,
                    // Disable network throttling to avoid additional issues
                    throttlingMethod: 'devtools',
                    // More permissive error handling
                    disableNetworkThrottling: true,
                    ...(device === 'desktop' && {
                        formFactor: 'desktop',
                        screenEmulation: {
                            mobile: false,
                            width: 1920,
                            height: 1080,
                            deviceScaleFactor: 1,
                            disabled: false,
                        },
                    }),
                    ...(device === 'mobile' && {
                        formFactor: 'mobile',
                        screenEmulation: { mobile: true },
                    })
                };

                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Starting Lighthouse audit...`);

                const configToUse = isLiteVersion ? customConfigLite : customConfig;
                // Use the original URL for Lighthouse (not file:// URL if we loaded from file)
                const currentUrl = htmlFilePath ? url : page.url();
                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Running Lighthouse on URL: ${currentUrl}`);
                
                let lighthouseResult;
                try {
                    lighthouseResult = await lighthouse(currentUrl, lighthouseOptions, configToUse, page);
                } catch (lighthouseError) {
                    console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Lighthouse error: ${lighthouseError.message}`);
                    // If Lighthouse fails due to navigation issues, try with a more permissive approach
                    if (lighthouseError.message.includes('403') || lighthouseError.message.includes('ERRORED_DOCUMENT_REQUEST')) {
                        console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Retrying Lighthouse with more permissive settings...`);
                        // Try with even more permissive settings
                        const permissiveOptions = {
                            ...lighthouseOptions,
                            maxWaitForLoad: 60000,
                            maxWaitForFcp: 30000,
                            skipAboutBlank: true,
                            disableStorageReset: true,
                            throttlingMethod: 'devtools',
                            disableNetworkThrottling: true,
                        };
                        lighthouseResult = await lighthouse(currentUrl, permissiveOptions, configToUse, page);
                    } else {
                        throw lighthouseError;
                    }
                }

                if (!lighthouseResult || !lighthouseResult.lhr) {
                    throw new Error('Lighthouse failed to generate a report');
                }

                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Lighthouse completed successfully`);

                const report = format === 'json' ? JSON.stringify(lighthouseResult.lhr, null, 2) : lighthouseResult.report;

                // Generate filename
                const urlObject = new URL(url);
                const hostname = urlObject.hostname.replace(/\./g, '-');
                const timestamp = Date.now();
                const versionSuffix = isLiteVersion ? '-lite' : '';
                const reportPath = `report-${hostname}-${timestamp}${versionSuffix}.${format}`;

                fs.writeFileSync(reportPath, report);
                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Lighthouse ${version} report saved to ${reportPath}`);

                // Validate lite version score
                if (isLiteVersion && format === 'json') {
                    let reportObj;
                    try {
                        reportObj = typeof report === 'string' ? JSON.parse(report) : report;
                    } catch (e) {
                        throw new Error('Failed to parse Lighthouse JSON report for lite score calculation');
                    }
                    const { finalScore } = calculateLiteScore(reportObj);
                    if (finalScore === 0) {
                        throw new Error('Lite audit score is 0, indicating a failed audit');
                    }
                }

                resolve({
                    success: true,
                    reportPath: reportPath,
                    isLiteVersion: isLiteVersion,
                    version: version,
                    url: url,
                    device: device,
                    strategy: strategyConfig.name,
                    attemptNumber: attemptNumber,
                    message: `${version} audit completed successfully using ${strategyConfig.name} strategy on attempt ${attemptNumber}`
                });

            } catch (error) {
                reject(error);
            }
        });

        return await auditPromise;

    } catch (error) {
        console.error(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Error during audit:`, error.message);
        throw error;
    } finally {
        // Clean up timeout
        if (auditTimeoutId) {
            clearTimeout(auditTimeoutId);
        }

        // Enhanced browser cleanup
        if (browser) {
            try {
                const pages = await browser.pages();
                await Promise.all(pages.map(page => page.close().catch(() => { })));
                await browser.close();
                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Browser closed successfully`);
            } catch (closeError) {
                console.warn(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Warning during browser cleanup:`, closeError.message);
                try {
                    await browser.process()?.kill('SIGKILL');
                } catch (killError) {
                    console.warn(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Could not force kill browser process`);
                }
            }
        }
        
        // Clean up HTML file if it was created by Playwright
        if (htmlFilePath) {
            try {
                const fs = await import('fs/promises');
                await fs.unlink(htmlFilePath).catch(() => {}); // Ignore errors if file already deleted
                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Cleaned up HTML file: ${htmlFilePath}`);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
        }
    }
}

/**
 * Try with Playwright first (better anti-detection), then fallback to Puppeteer
 */
async function tryWithPlaywrightFirst(url, options) {
    const { device, format, isLiteVersion } = options;
    
    try {
        console.log(`🎭 Attempting with Playwright (better anti-detection)...`);
        
        const browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials',
            ],
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            viewport: device === 'mobile' ? { width: 375, height: 667 } : { width: 1920, height: 1080 },
            locale: 'en-US',
            timezoneId: 'America/New_York',
            permissions: [],
            extraHTTPHeaders: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Cache-Control': 'max-age=0',
                'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                'Sec-Ch-Ua-Mobile': device === 'mobile' ? '?1' : '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'Referer': 'https://www.google.com/',
            },
        });

        // Add anti-detection scripts
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
        });

        const page = await context.newPage();
        
        // Simulate human-like behavior
        const response = await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 60000,
        });

        if (response && response.status() === 403) {
            console.log(`⚠️ Playwright also got 403, but continuing...`);
            // Wait a bit and check if content loaded
            await page.waitForTimeout(3000);
            const content = await page.content();
            if (content.length < 1000) {
                await browser.close();
                throw new Error('Playwright: Insufficient content despite 403');
            }
        }

        // Get the final URL after any redirects
        const finalUrl = page.url();
        
        // Get HTML content and save to file
        const htmlContent = await page.content();
        
        // Save HTML to temporary file so Puppeteer can load it
        const fs = await import('fs/promises');
        const path = await import('path');
        const tempDir = process.env.TEMP_DIR || '/tmp';
        const htmlFileName = `playwright_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.html`;
        const htmlFilePath = path.join(tempDir, htmlFileName);
        
        await fs.writeFile(htmlFilePath, htmlContent, 'utf-8');
        
        // Close Playwright browser
        await browser.close();
        
        console.log(`✅ Playwright successfully navigated to: ${finalUrl}`);
        console.log(`📄 HTML saved to: ${htmlFilePath}`);
        return { success: true, finalUrl, htmlFilePath };
        
    } catch (error) {
        console.log(`❌ Playwright failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Runs a Lighthouse audit with multiple anti-bot strategies
 * @param {object} options - The audit options
 * @param {string} options.url - The URL to audit
 * @param {string} [options.device='desktop'] - The device to emulate ('desktop' or 'mobile')
 * @param {string} [options.format='json'] - The report format ('json' or 'html')
 * @param {boolean} [options.isLiteVersion=false] - Whether to run the lite version
 * @returns {Promise<object>} Result object with success/failure details
 */
export async function runLighthouseAudit(options) {
    const { url, device = 'desktop', format = 'json', isLiteVersion = false } = options;
    const version = isLiteVersion ? 'Lite' : 'Full';

    if (!url) {
        return {
            success: false,
            error: 'URL is required',
            errorCode: 'MISSING_URL',
            message: 'No URL provided for audit',
            isLiteVersion: isLiteVersion
        };
    }

    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    
    // First, try with Playwright to see if we can bypass 403
    const playwrightResult = await tryWithPlaywrightFirst(fullUrl, { device, format, isLiteVersion });
    const urlToUse = playwrightResult.success ? playwrightResult.finalUrl : fullUrl;
    const htmlFilePath = playwrightResult.success ? playwrightResult.htmlFilePath : null;
    
    const strategies = ['basic', 'stealth', 'aggressive'];
    const maxAttemptsPerStrategy = 3;
    const allErrors = [];

    console.log(`\n=== Starting ${version} audit for ${urlToUse} ===`);
    console.log(`Strategies to try: ${strategies.join(' → ')}`);

    // Try each strategy
    for (const strategy of strategies) {
        console.log(`\n--- Trying ${ANTI_BOT_STRATEGIES[strategy].name} Strategy ---`);
        
        const strategyErrors = [];
        
        // Try each strategy up to 3 times
        for (let attempt = 1; attempt <= maxAttemptsPerStrategy; attempt++) {
            try {
                const result = await performAuditWithStrategy(urlToUse, {
                    device,
                    format,
                    isLiteVersion,
                    htmlFilePath: htmlFilePath  // Pass HTML file path if available
                }, strategy, attempt);

                console.log(`=== SUCCESS: ${version} audit completed with ${strategy} strategy on attempt ${attempt} ===\n`);
                return result;

            } catch (error) {
                const errorInfo = {
                    strategy: strategy,
                    attempt: attempt,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                strategyErrors.push(errorInfo);
                allErrors.push(errorInfo);

                console.error(`[${strategy}] Attempt ${attempt} failed: ${error.message}`);

                // If not the last attempt for this strategy, wait before retrying
                if (attempt < maxAttemptsPerStrategy) {
                    const waitTime = 2000 * attempt; // 2s, 4s, 6s
                    console.log(`[${strategy}] Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        console.log(`--- ${ANTI_BOT_STRATEGIES[strategy].name} Strategy failed after ${maxAttemptsPerStrategy} attempts ---`);
    }

    // All strategies failed
    const finalError = {
        success: false,
        error: `All strategies failed after ${strategies.length * maxAttemptsPerStrategy} total attempts`,
        errorCode: 'ALL_STRATEGIES_FAILED',
        message: `${version} audit failed: website has strong anti-bot protections`,
        url: fullUrl,
        device: device,
        isLiteVersion: isLiteVersion,
        version: version,
        strategiesTried: strategies,
        totalAttempts: allErrors.length,
        allErrors: allErrors,
        timestamp: new Date().toISOString(),
        retryable: false, // Don't retry if all strategies failed
        recommendation: 'This website has very strong anti-bot protections. Manual testing may be required.'
    };

    console.error(`=== FINAL FAILURE: All strategies exhausted for ${fullUrl} ===`);
    console.error('Strategies tried:', strategies.join(', '));
    console.error('Total attempts:', allErrors.length);
    
    return finalError;
}

/**
 * Convenience function to run the lite version of the audit
 * @param {object} options - The audit options
 * @returns {Promise<object>} Result object
 */
export async function runLighthouseLiteAudit(options) {
    return await runLighthouseAudit({ ...options, isLiteVersion: true });
}