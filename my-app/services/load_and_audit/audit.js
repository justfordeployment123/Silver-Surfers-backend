// audit.module.js
import fs from 'fs';
import { URL } from 'url';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-extra';
import { KnownDevices } from 'puppeteer';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import customConfig from './custom-config.js';

puppeteer.use(stealthPlugin());

// Anti-bot strategies with more reasonable timeouts
const ANTI_BOT_STRATEGIES = {
    basic: {
        name: 'Basic',
        timeout: 300000, // 5 minutes (increased from 2 minutes)
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
        waitTime: 2000,
        cookieTimeout: 2000 // Reduced from 3000ms per selector
    },
    stealth: {
        name: 'Stealth',
        timeout: 420000, // 7 minutes (increased from 2.5 minutes)
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
        cookieTimeout: 2000,
        extraHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
    },
    aggressive: {
        name: 'Aggressive',
        timeout: 600000, // 10 minutes (increased from 6 minutes)
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
        cookieTimeout: 3000,
        extraHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Cache-Control': 'no-cache',
            'Upgrade-Insecure-Requests': '1'
        },
        viewport: { width: 1920, height: 1080 }
    }
};

/**
 * Enhanced browser cleanup with multiple fallback methods
 */
async function cleanupBrowser(browser, strategy, attemptNumber) {
    if (!browser) return;

    try {
        const pages = await browser.pages();
        await Promise.all(pages.map(page => page.close().catch(() => {})));
        await browser.close();
        console.log(`[Attempt ${attemptNumber}] [${strategy}] Browser closed successfully`);
    } catch (closeError) {
        console.warn(`[Attempt ${attemptNumber}] [${strategy}] Warning during browser cleanup:`, closeError.message);
        try {
            await browser.process()?.kill('SIGKILL');
        } catch (killError) {
            console.warn(`[Attempt ${attemptNumber}] [${strategy}] Could not force kill browser process`);
        }
    }
}

// Function to calculate the weighted "Senior Friendliness" score
function calculateSeniorFriendlinessScore(report) {
    console.log('🔍 [Score Calculation] Starting Silver Surfers score calculation...');
    
    const categoryId = 'senior-friendly';
    const categoryConfig = customConfig.categories[categoryId];
    
    if (!categoryConfig) {
        console.error(`❌ [Score Calculation] Error: '${categoryId}' category not found in config.`);
        console.log('📊 [Score Calculation] Available categories:', Object.keys(customConfig.categories || {}));
        return { finalScore: 0, totalWeightedScore: 0, totalWeight: 0, error: 'Category not found' };
    }

    const auditRefs = categoryConfig.auditRefs;
    const auditResults = report.audits;

    console.log(`📋 [Score Calculation] Found ${auditRefs?.length || 0} audit references in senior-friendly category`);
    
    if (!auditRefs || auditRefs.length === 0) {
        console.error('❌ [Score Calculation] No audit references found in senior-friendly category');
        return { finalScore: 0, totalWeightedScore: 0, totalWeight: 0, error: 'No audit references' };
    }

    let totalWeightedScore = 0;
    let totalWeight = 0;
    let processedAudits = 0;
    let missingAudits = [];

    console.log('🔬 [Score Calculation] Processing individual audits:');
    
    for (const auditRef of auditRefs) {
        const { id, weight } = auditRef;
        const result = auditResults[id];
        const score = result ? (result.score ?? 0) : 0;
        
        if (!result) {
            console.log(`⚠️  [Score Calculation] Missing audit result for: ${id}`);
            missingAudits.push(id);
        } else {
            console.log(`✅ [Score Calculation] ${id}: score=${score}, weight=${weight}, contribution=${score * weight}`);
            processedAudits++;
        }
        
        totalWeightedScore += score * weight;
        totalWeight += weight;
    }

    console.log(`📊 [Score Calculation] Summary:`);
    console.log(`   - Processed audits: ${processedAudits}/${auditRefs.length}`);
    console.log(`   - Missing audits: ${missingAudits.length} ${missingAudits.length > 0 ? `(${missingAudits.join(', ')})` : ''}`);
    console.log(`   - Total weighted score: ${totalWeightedScore}`);
    console.log(`   - Total weight: ${totalWeight}`);

    if (totalWeight === 0) {
        console.error('❌ [Score Calculation] Total weight is 0 - cannot calculate score');
        return { finalScore: 0, totalWeightedScore: 0, totalWeight: 0, error: 'Zero total weight' };
    }

    const finalScore = (totalWeightedScore / totalWeight) * 100;
    console.log(`🎯 [Score Calculation] Final Silver Surfers Score: ${finalScore.toFixed(2)}`);
    
    return { finalScore, totalWeightedScore, totalWeight };
}

// Optimized cookie banner handling with timeout per selector
async function handleCookieBanner(page, strategyConfig, attemptNumber) {
    console.log(`[Attempt ${attemptNumber}] 🕵️ Looking for a cookie banner to accept...`);
    
    // Reduced and prioritized cookie selectors (most common first)
    const cookieSelectors = [
        // Most common and reliable selectors first
        '#onetrust-accept-btn-handler',
        '[data-testid="cookie-policy-manage-dialog-accept-button"]',
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
        '#accept-cookies',
        '#cookie-accept',
        'button[aria-label*="accept" i]',
        '[class*="cookie-accept"]',
        '[class*="accept-all"]',
        '//button[contains(., "Accept all")]',
        '//button[contains(., "Accept All")]',
        '//button[contains(., "I accept")]',
        '//button[contains(., "Accept")]'
    ];
    
    let bannerClicked = false;
    const selectorTimeout = strategyConfig.cookieTimeout || 2000;
    
    for (const selector of cookieSelectors) {
        try {
            const button = await page.waitForSelector(selector, { 
                timeout: selectorTimeout, 
                visible: true 
            });
            if (button) {
                console.log(`[Attempt ${attemptNumber}] ✅ Found cookie button with selector: "${selector}". Clicking...`);
                await page.evaluate(b => b.click(), button);
                
                // Wait for banner to disappear (shorter timeout)
                try {
                    await page.waitForSelector(selector, { hidden: true, timeout: 3000 });
                } catch {
                    // Banner might not disappear, that's okay
                }
                
                console.log(`[Attempt ${attemptNumber}] ✅ Cookie banner dismissed.`);
                bannerClicked = true;
                break;
            }
        } catch (error) { 
            // Selector not found, continue to next one
        }
    }
    
    if (!bannerClicked) {
        console.log(`[Attempt ${attemptNumber}] 🤷 No cookie banner found or handled. Continuing audit.`);
    }
    
    return bannerClicked;
}

async function performAuditWithStrategy(url, options, strategy, attemptNumber = 1) {
    const { device, format } = options;
    const strategyConfig = ANTI_BOT_STRATEGIES[strategy];

    console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name} Strategy] Starting ${device} audit for: ${url}`);

    let browser = null;
    let auditTimeoutId = null;

    try {
        // Create a promise that rejects after timeout
        const timeoutPromise = new Promise((_, reject) => {
            auditTimeoutId = setTimeout(() => {
                reject(new Error(`${strategyConfig.name} strategy timeout after ${strategyConfig.timeout/1000} seconds`));
            }, strategyConfig.timeout);
        });

        // Create the main audit promise
        const auditPromise = (async () => {
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
            } else if (device === 'tablet') {
                await page.emulate(KnownDevices['iPad Pro 11']);
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

            // Optimized cookie banner handling
            await handleCookieBanner(page, strategyConfig, attemptNumber);

            const lighthouseOptions = {
                port: new URL(browser.wsEndpoint()).port,
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
                }),
                ...(device === 'tablet' && {
                    formFactor: 'mobile',
                    screenEmulation: {
                        mobile: true,
                        width: 834,
                        height: 1194,
                        deviceScaleFactor: 2,
                        disabled: false,
                    },
                    userAgent: 'Mozilla/5.0 (iPad; CPU OS 13_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
                })
            };

            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Starting Lighthouse audit...`);

            const lighthouseResult = await lighthouse(url, lighthouseOptions, customConfig);

            if (!lighthouseResult || !lighthouseResult.lhr) {
                throw new Error('Lighthouse failed to generate a report');
            }

            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Lighthouse completed successfully`);

            // Calculate Silver Surfers score before generating report
            console.log('🎯 [Score Validation] Calculating Silver Surfers score...');
            const scoreData = calculateSeniorFriendlinessScore(lighthouseResult.lhr);
            
            // Check if score is 0 and prevent JSON file generation and PDF generation
            if (scoreData.finalScore === 0) {
                console.error('❌ [Score Validation] Silver Surfers score is 0 - blocking JSON file generation and PDF generation');
                console.log('🔍 [Score Validation] Score calculation details:', {
                    totalWeightedScore: scoreData.totalWeightedScore,
                    totalWeight: scoreData.totalWeight,
                    error: scoreData.error || 'No specific error'
                });
                
                throw new Error('Silver Surfers score is 0 - audit may have failed or configuration issue detected');
            }
            
            console.log(`✅ [Score Validation] Silver Surfers score: ${scoreData.finalScore.toFixed(2)} - proceeding with report generation`);
            
            const report = format === 'json' ? JSON.stringify(lighthouseResult.lhr, null, 2) : lighthouseResult.report;

            // Generate filename
            const urlObject = new URL(url);
            const hostname = urlObject.hostname.replace(/\./g, '-');
            const timestamp = Date.now();
            const reportPath = `report-${hostname}-${timestamp}.${format}`;

            fs.writeFileSync(reportPath, report);
            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Lighthouse report saved to ${reportPath}`);

            return {
                success: true,
                reportPath: reportPath,
                scoreData: scoreData,
                reportGenerated: true,
                url: url,
                device: device,
                strategy: strategyConfig.name,
                attemptNumber: attemptNumber,
                message: `Audit completed successfully using ${strategyConfig.name} strategy on attempt ${attemptNumber}`
            };
        })();

        // Race between timeout and audit completion
        const result = await Promise.race([auditPromise, timeoutPromise]);
        return result;

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
            await cleanupBrowser(browser, strategyConfig.name, attemptNumber);
        }
    }
}

/**
 * Runs a Lighthouse audit for a given URL with an intelligent retry mechanism.
 * @param {object} options - The audit options.
 * @param {string} options.url - The URL to audit.
 * @param {string} [options.device='desktop'] - The device to emulate ('desktop' or 'mobile').
 * @param {string} [options.format='json'] - The report format ('json' or 'html').
 * @returns {Promise<object>} A result object e.g. { success: true, reportPath: '...' } or { success: false, error: '...' }.
 */
export async function runLighthouseAudit(options) {
    const { url, device = 'desktop', format = 'json' } = options;

    if (!url) {
        return {
            success: false,
            error: 'URL is required',
            errorCode: 'MISSING_URL',
            message: 'No URL provided for audit'
        };
    }

    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const strategies = ['basic', 'stealth', 'aggressive'];
    const maxAttemptsPerStrategy = 3;
    const allErrors = [];

    console.log(`\n=== Starting audit for ${fullUrl} ===`);
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
                    format
                }, strategy, attempt);

                console.log(`=== SUCCESS: Audit completed with ${strategy} strategy on attempt ${attempt} ===\n`);
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
        message: `Audit failed: website has strong anti-bot protections`,
        url: fullUrl,
        device: device,
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