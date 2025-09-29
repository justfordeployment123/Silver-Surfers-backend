// audit-module-with-lite-enhanced.js

import fs from 'fs';
import { URL } from 'url';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-extra';
import { KnownDevices } from 'puppeteer';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
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

// Anti-bot strategies with different configurations
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
            '--disable-gpu'
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        waitTime: 2000
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
            '--disable-features=TranslateUI'
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        waitTime: 5000,
        extraHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
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
            '--disable-prompt-on-repost'
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        waitTime: 8000,
        extraHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Cache-Control': 'no-cache',
            'Upgrade-Insecure-Requests': '1'
        },
        viewport: { width: 1920, height: 1080 }
    }
};

async function performAuditWithStrategy(url, options, strategy, attemptNumber = 1) {
    const { device, format, isLiteVersion = false } = options;
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

                // Apply strategy-specific settings
                if (strategyConfig.extraHeaders) {
                    await page.setExtraHTTPHeaders(strategyConfig.extraHeaders);
                }

                if (device === 'mobile') {
                    await page.emulate(KnownDevices['Pixel 5']);
                } else {
                    await page.setUserAgent(strategyConfig.userAgent);
                    const viewport = strategyConfig.viewport || { width: 1280, height: 800 };
                    await page.setViewport(viewport);
                }

                // Navigate with strategy-specific timeout
                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Navigating to ${url}...`);
                const response = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000
                });

                if (!response) {
                    throw new Error('No response received from page navigation');
                }

                if (response.status() !== 200) {
                    throw new Error(`HTTP ${response.status()}: Failed to load page`);
                }

                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Page loaded successfully`);

                // Strategy-specific wait time
                await new Promise(resolve => setTimeout(resolve, strategyConfig.waitTime));

                const lighthouseOptions = {
                    output: format,
                    logLevel: 'info',
                    maxWaitForFcp: 15000,
                    maxWaitForLoad: 45000,
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
                const lighthouseResult = await lighthouse(page.url(), lighthouseOptions, configToUse, page);

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
    const strategies = ['basic', 'stealth', 'aggressive'];
    const maxAttemptsPerStrategy = 3;
    const allErrors = [];

    console.log(`\n=== Starting ${version} audit for ${fullUrl} ===`);
    console.log(`Strategies to try: ${strategies.join(' → ')}`);

    // Try each strategy
    for (const strategy of strategies) {
        console.log(`\n--- Trying ${ANTI_BOT_STRATEGIES[strategy].name} Strategy ---`);
        
        const strategyErrors = [];
        
        // Try each strategy up to 3 times
        for (let attempt = 1; attempt <= maxAttemptsPerStrategy; attempt++) {
            try {
                const result = await performAuditWithStrategy(fullUrl, {
                    device,
                    format,
                    isLiteVersion
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