// audit-module-with-lite.js

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

async function performAudit(url, options, attemptNumber = 1) {
    const { device, format, useAdvancedFeatures, isLiteVersion = false } = options;
    const approach = useAdvancedFeatures ? 'Advanced' : 'Standard';
    const version = isLiteVersion ? 'Lite' : 'Full';

    console.log(`[Attempt ${attemptNumber}] [${approach} - ${version}] Starting ${device} audit for: ${url}`);



    let browser = null;

    let connectionTimeoutId = null;



    try {

        browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
            ],
            });


        console.log(`[Attempt ${attemptNumber}] Browser launched successfully`);



        // Test browser connection before proceeding

        const pages = await browser.pages();

        if (pages.length === 0) {

            throw new Error('Browser launched but no pages available');

        }



        const page = await browser.newPage();



        // Set up connection timeout

        connectionTimeoutId = setTimeout(() => {

            throw new Error('Browser connection timeout - taking too long to establish connection');

        }, 45000); // 45 second timeout for the entire connection process



        if (device === 'mobile') {

            await page.emulate(KnownDevices['Pixel 5']);

        } else {

            const userAgent = useAdvancedFeatures

                ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

                : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';

            await page.setUserAgent(userAgent);

            await page.setViewport({

                width: useAdvancedFeatures ? 1920 : 1280,

                height: useAdvancedFeatures ? 1080 : 800

            });

        }



        // Enhanced page loading with better error handling

        console.log(`[Attempt ${attemptNumber}] Navigating to ${url}...`);

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

        console.log(`[Attempt ${attemptNumber}] Page loaded successfully`);



        // Wait a moment for page to stabilize

        await new Promise(resolve => setTimeout(resolve, 2000));



        // Clear the connection timeout since we've successfully connected

        if (connectionTimeoutId) {

            clearTimeout(connectionTimeoutId);

            connectionTimeoutId = null;

        }



        // --- REMOVED SECTION ---

        // No longer need to get the wsEndpoint or parse the port

        // const wsEndpoint = browser.wsEndpoint();

        // ... port parsing logic removed ...

        // --- END REMOVED SECTION ---



        const lighthouseOptions = {

            // port: port, // <-- REMOVE THIS LINE

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



        console.log(`[Attempt ${attemptNumber}] Starting Lighthouse audit...`); // Updated log message



        const configToUse = isLiteVersion ? customConfigLite : customConfig;



        // Add timeout wrapper for Lighthouse execution

        const lighthousePromise = lighthouse(page.url(), lighthouseOptions, configToUse, page); // <-- PASS `page` HERE



        const timeoutPromise = new Promise((_, reject) => {

            setTimeout(() => {

                reject(new Error('Lighthouse execution timeout after 120 seconds'));

            }, 120000);

        });



        const lighthouseResult = await Promise.race([lighthousePromise, timeoutPromise]);



        if (!lighthouseResult || !lighthouseResult.lhr) {

            throw new Error('Lighthouse failed to generate a report');

        }



        console.log(`[Attempt ${attemptNumber}] Lighthouse completed successfully`);



        const report = format === 'json' ? JSON.stringify(lighthouseResult.lhr, null, 2) : lighthouseResult.report;



        // Generate filename

        const urlObject = new URL(url);

        const hostname = urlObject.hostname.replace(/\./g, '-');

        const timestamp = Date.now();

        const versionSuffix = isLiteVersion ? '-lite' : '';

        const reportPath = `report-${hostname}-${timestamp}${versionSuffix}.${format}`;



        fs.writeFileSync(reportPath, report);

        console.log(`[Attempt ${attemptNumber}] Lighthouse ${version} report saved to ${reportPath}`);



        // --- Add this block ---

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

        // --- End block ---



        return {

            success: true,

            reportPath: reportPath,

            isLiteVersion: isLiteVersion,

            version: version,

            url: url,

            device: device,

            attemptNumber: attemptNumber,

            message: `${version} audit completed successfully on attempt ${attemptNumber}`

        };



    } catch (error) {

        console.error(`[Attempt ${attemptNumber}] Error during audit:`, error.message);

        throw error;

    } finally {

        // Clean up timeout if it's still active

        if (connectionTimeoutId) {

            clearTimeout(connectionTimeoutId);

        }



        // Enhanced browser cleanup

        if (browser) {

            try {

                const pages = await browser.pages();

                await Promise.all(pages.map(page => page.close().catch(() => { })));

                await browser.close();

                console.log(`[Attempt ${attemptNumber}] Browser closed successfully`);

            } catch (closeError) {

                console.warn(`[Attempt ${attemptNumber}] Warning during browser cleanup:`, closeError.message);

                // Force kill the browser process if normal close fails

                try {

                    await browser.process()?.kill('SIGKILL');

                } catch (killError) {

                    console.warn(`[Attempt ${attemptNumber}] Could not force kill browser process`);

                }

            }

        }

    }

}



/**

 * Runs a Lighthouse audit with retry mechanism

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

    const maxAttempts = 3;

    const errors = [];



    for (let attempt = 1; attempt <= maxAttempts; attempt++) {

        try {

            console.log(`\n=== Starting Attempt ${attempt} of ${maxAttempts} ===`);



            // Try standard approach first

            const result = await performAudit(fullUrl, {

                device,

                format,

                useAdvancedFeatures: false,

                isLiteVersion

            }, attempt);



            console.log(`=== Attempt ${attempt} completed successfully ===\n`);

            return result;



        } catch (error) {

            const errorInfo = {

                attempt: attempt,

                error: error.message,

                timestamp: new Date().toISOString()

            };

            errors.push(errorInfo);



            console.error(`[Attempt ${attempt}] Standard approach failed: ${error.message}`);



            // Try advanced features if standard fails and it's a connection/timeout issue

            if (error.message.includes('Status code 403') ||

                error.message.includes('timed out') ||

                error.message.includes('timeout') ||

                error.message.includes('connection') ||

                error.message.includes('Connecting to browser')) {

                try {

                    console.log(`[Attempt ${attempt}] Retrying with advanced features...`);

                    const result = await performAudit(fullUrl, {

                        device,

                        format,

                        useAdvancedFeatures: true,

                        isLiteVersion

                    }, attempt);



                    console.log(`=== Attempt ${attempt} completed successfully with advanced features ===\n`);

                    return result;



                } catch (advancedError) {

                    errorInfo.advancedError = advancedError.message;

                    console.error(`[Attempt ${attempt}] Advanced approach also failed: ${advancedError.message}`);

                }

            }



            // If this is the last attempt, prepare final error response

            if (attempt === maxAttempts) {

                const finalError = {

                    success: false,

                    error: `All ${maxAttempts} attempts failed`,

                    errorCode: 'AUDIT_FAILED',

                    message: `${version} audit failed after ${maxAttempts} attempts`,

                    url: fullUrl,

                    device: device,

                    isLiteVersion: isLiteVersion,

                    version: version,

                    attempts: errors,

                    lastError: error.message,

                    timestamp: new Date().toISOString(),

                    retryable: true

                };



                console.error(`=== Final failure for ${version} audit of ${fullUrl} ===`);

                console.error('Error details:', finalError);

                return finalError;

            }



            // Wait before next attempt (exponential backoff)

            const waitTime = Math.pow(2, attempt - 1) * 2000; // 2s, 4s, 8s

            console.log(`Waiting ${waitTime}ms before attempt ${attempt + 1}...`);

            await new Promise(resolve => setTimeout(resolve, waitTime));

        }

    }

}



/**

 * Convenience function to run the lite version of the audit

 * @param {object} options - The audit options

 * @returns {Promise<object>} Result object

 */

export async function runLighthouseLiteAudit(options) {

    return await runLighthouseAudit({ ...options, isLiteVersion: true });

}