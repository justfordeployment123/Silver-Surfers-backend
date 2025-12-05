import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { URL } from 'url';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-extra';
import { KnownDevices } from 'puppeteer';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import customConfig from './custom-config.js';

// --- SOLUTION 1: Adjust timeouts to be reasonable guardrails, not standard waiting times. ---
const ANTI_BOT_STRATEGIES = {
     basic: {
         name: 'Basic',
         timeout: 120000, // 2 minutes
         useStealth: false,
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
         cookieTimeout: 3000,
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
         useStealth: true,
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
             '--disable-extensions',
             '--disable-plugins',
             '--disable-default-apps'
         ],
         userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
         cookieTimeout: 6000,
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
         useStealth: true,
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
         cookieTimeout: 10000,
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
    
    const cookieSelectors = [
        '#onetrust-accept-btn-handler',
        'button[id*="accept"]',
        'button[class*="accept"]',
        '[aria-label*="Accept"]'
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
    let browserProcess = null;

    try {
        const puppeteerInstance = strategyConfig.useStealth
            ? puppeteer.use(stealthPlugin())
            : puppeteer;

        const timeoutPromise = new Promise((_, reject) => {
            auditTimeoutId = setTimeout(() => {
                reject(new Error(`${strategyConfig.name} strategy timed out after ${strategyConfig.timeout / 1000} seconds`));
            }, strategyConfig.timeout);
        });

        const auditPromise = (async () => {
            const launchOptions = {
                headless: 'new',
                args: strategyConfig.args,
                timeout: 30000,
                protocolTimeout: 60000,
                waitForInitialPage: true
            };

            console.time(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Browser Launch`);
            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Launching browser${strategyConfig.useStealth ? ' with stealth' : ''}...`);
            browser = await puppeteerInstance.launch(launchOptions);
            browserProcess = browser.process();
            console.timeEnd(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Browser Launch`);

            const page = await browser.newPage();

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

            console.time(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Page Navigation`);
            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Navigating to ${url}...`);
            const response = await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });
            console.timeEnd(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Page Navigation`);

            if (!response || response.status() >= 400) {
                throw new Error(`Failed to load page with HTTP status: ${response ? response.status() : 'N/A'}`);
            }
            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Page loaded successfully (Status: ${response.status()})`);

            // ========================= FIX 1: ADDED ROBUST WAITING =========================
            // This waits for the body element to exist, ensuring the core DOM is ready
            // before Lighthouse tries to audit it. This prevents the 'documentElement' error.
            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Waiting for core DOM to be ready...`);
            await page.waitForSelector('body', { timeout: 15000 });
            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Core DOM is ready.`);
            // ===============================================================================

            // This original wait is still useful for secondary resources to finish loading.
            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Waiting for page to settle...`);
            await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 }).catch(() => {
                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Page did not become fully idle, continuing anyway.`);
            });

            await handleCookieBanner(page, strategyConfig, attemptNumber);

            // ========================= FIX 3: ADDED EXPLICIT CONTENT WAIT (NEW ADDITION) =========================
            // This is the key to solving the race condition on modern sites. We wait for a specific element
            // that indicates the main content has been rendered by JavaScript.
            // Replace 'footer' with a selector that is stable for your target sites (e.g., '#app', 'main').
            try {
                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Waiting for key content element to render...`);
                await page.waitForSelector('footer', { timeout: 15000 });
                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Key content is ready.`);
            } catch (e) {
                console.warn(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Key content element did not appear. The page might be incomplete, but continuing.`);
            }
            // ===================================================================================================

            // ========================= FIX 2: SIMPLIFIED LIGHTHOUSE INTEGRATION =========================
            // By passing the 'page' object directly to Lighthouse, we no longer need to manually
            // specify port, formFactor, or screenEmulation. Lighthouse infers it all.
            const lighthouseOptions = {
                output: format,
                logLevel: 'info',
                maxWaitForFcp: 15000,
                maxWaitForLoad: 45000,
            };

            console.time(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Lighthouse Audit`);
            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Starting Lighthouse audit...`);
            
            // The lighthouse call is now simpler and more reliable. We pass `page` at the end.
            // We also use page.url() to get the final URL after any redirects.
            const lighthouseResult = await lighthouse(page.url(), lighthouseOptions, customConfig, page);
            
            console.timeEnd(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Lighthouse Audit`);
            // ==========================================================================================

            if (!lighthouseResult || !lighthouseResult.lhr) {
                throw new Error('Lighthouse failed to generate a report');
            }

            console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Lighthouse completed successfully`);

            console.log('🎯 [Score Validation] Calculating Silver Surfers score...');
            const scoreData = calculateSeniorFriendlinessScore(lighthouseResult.lhr);

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

            const urlObject = new URL(url);
            const hostname = urlObject.hostname.replace(/\./g, '-');
            const timestamp = Date.now();
            const reportPath = `report-${hostname}-${timestamp}.${format}`;

            await fsPromises.writeFile(reportPath, report);
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

        return await Promise.race([auditPromise, timeoutPromise]);

    } catch (error) {
        console.error(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Error during audit:`, error.message);

        if (browserProcess && !browserProcess.killed) {
            try {
                console.log(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Force killing browser process...`);
                browserProcess.kill('SIGKILL');
            } catch (killError) {
                console.warn(`[Attempt ${attemptNumber}] [${strategyConfig.name}] Could not kill process:`, killError.message);
            }
        }

        throw error;
    } finally {
        if (auditTimeoutId) {
            clearTimeout(auditTimeoutId);
        }
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
    const strategies = ['aggressive', 'stealth', 'basic'];
    const maxAttemptsPerStrategy = 3;
    const allErrors = [];

    console.log(`\n=== Starting audit for ${fullUrl} ===`);
    console.log(`Strategies to try: ${strategies.join(' → ')}`);

    for (const strategy of strategies) {
        console.log(`\n--- Trying ${ANTI_BOT_STRATEGIES[strategy].name} Strategy ---`);
        
        const strategyErrors = [];
        
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

                if (attempt < maxAttemptsPerStrategy) {
                    const waitTime = 2000 * attempt; // 2s, 4s
                    console.log(`[${strategy}] Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        console.log(`--- ${ANTI_BOT_STRATEGIES[strategy].name} Strategy failed after ${maxAttemptsPerStrategy} attempts ---`);
    }

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
        retryable: false,
        recommendation: 'This website has very strong anti-bot protections. Manual testing may be required.'
    };

    console.error(`=== FINAL FAILURE: All strategies exhausted for ${fullUrl} ===`);
    console.error('Strategies tried:', strategies.join(', '));
    console.error('Total attempts:', allErrors.length);
    
    return finalError;
}
