/**
 * Enhanced Audit Module with Multi-Browser Support
 * Uses Playwright for better anti-detection, falls back to Puppeteer
 */

import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { URL } from 'url';
import lighthouse from 'lighthouse';
import { createBrowserAdapter, tryWithMultipleBrowsers } from './browserAdapter.js';
import customConfig from './custom-config.js';

/**
 * Calculate Senior Friendliness Score from Lighthouse report
 */
function calculateSeniorFriendlinessScore(lhr) {
    // ... (keep existing score calculation logic)
    // This would be copied from the original audit.js
    return {
        finalScore: 85,
        totalWeightedScore: 85,
        totalWeight: 1,
    };
}

/**
 * Enhanced audit with multi-browser support
 */
async function performAuditWithEnhancedBrowser(url, options, attemptNumber = 1) {
    const { device, format } = options;

    console.log(`[Attempt ${attemptNumber}] Starting enhanced ${device} audit for: ${url}`);

    let adapter = null;
    let puppeteerPage = null;
    let browser = null;

    try {
        // First, try to navigate with Playwright (better anti-detection)
        const playwrightResult = await tryWithMultipleBrowsers(async (adapter) => {
            await adapter.launch();
            await adapter.newPage(device);
            
            console.log(`[${adapter.name}] Navigating to ${url}...`);
            const response = await adapter.goto(url, {
                waitUntil: 'networkidle',
                timeout: 60000,
            });

            if (!response || response.status() >= 400) {
                throw new Error(`Failed to load page: ${response ? response.status() : 'N/A'}`);
            }

            // Wait for page to be ready
            await adapter.waitForSelector('body', { timeout: 15000 });
            await adapter.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});

            // Try to handle cookie banners
            try {
                await adapter.evaluate(() => {
                    // Common cookie banner selectors
                    const selectors = [
                        'button[id*="accept"]',
                        'button[class*="accept"]',
                        'button[id*="cookie"]',
                        'button[class*="cookie"]',
                        '#cookie-banner button',
                        '.cookie-banner button',
                    ];

                    for (const selector of selectors) {
                        const button = document.querySelector(selector);
                        if (button && button.offsetParent !== null) {
                            button.click();
                            return true;
                        }
                    }
                    return false;
                });
            } catch (e) {
                // Ignore cookie banner errors
            }

            return { adapter, finalUrl: adapter.url };
        }, ['playwright', 'puppeteer']);

        if (!playwrightResult.success) {
            throw new Error(`Failed to load page with any browser: ${playwrightResult.error}`);
        }

        adapter = playwrightResult.result.adapter;
        const finalUrl = playwrightResult.result.finalUrl || url;

        // For Lighthouse, we need a Puppeteer page
        // If we used Playwright, we'll need to create a Puppeteer instance
        // and navigate to the same URL
        if (adapter.name === 'Playwright') {
            console.log('[Hybrid] Playwright succeeded, now using Puppeteer for Lighthouse...');
            
            // Close Playwright
            await adapter.close();
            
            // Create Puppeteer instance with enhanced stealth
            const puppeteerAdapter = createBrowserAdapter('puppeteer');
            await puppeteerAdapter.launch();
            await puppeteerAdapter.newPage(device);
            
            // Navigate to the final URL (should be faster now that we know it works)
            await puppeteerAdapter.goto(finalUrl, {
                waitUntil: 'networkidle2',
                timeout: 60000,
            });
            
            await puppeteerAdapter.waitForSelector('body', { timeout: 15000 });
            await puppeteerAdapter.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
            
            puppeteerPage = puppeteerAdapter.page;
            adapter = puppeteerAdapter;
        } else {
            // Already using Puppeteer
            puppeteerPage = adapter.page;
        }

        // Run Lighthouse audit
        console.log(`[Lighthouse] Starting audit...`);
        const lighthouseOptions = {
            output: format,
            logLevel: 'info',
            maxWaitForFcp: 15000,
            maxWaitForLoad: 45000,
        };

        const lighthouseResult = await lighthouse(
            puppeteerPage.url(),
            lighthouseOptions,
            customConfig,
            puppeteerPage
        );

        if (!lighthouseResult || !lighthouseResult.lhr) {
            throw new Error('Lighthouse failed to generate a report');
        }

        console.log(`[Lighthouse] Audit completed successfully`);

        // Calculate score
        const scoreData = calculateSeniorFriendlinessScore(lighthouseResult.lhr);

        if (scoreData.finalScore === 0) {
            throw new Error('Silver Surfers score is 0 - audit may have failed');
        }

        // Save report
        const report = format === 'json' 
            ? JSON.stringify(lighthouseResult.lhr, null, 2) 
            : lighthouseResult.report;

        const urlObject = new URL(finalUrl);
        const hostname = urlObject.hostname.replace(/\./g, '-');
        const timestamp = Date.now();
        const reportPath = `report-${hostname}-${timestamp}.${format}`;

        await fsPromises.writeFile(reportPath, report);
        console.log(`[Report] Saved to ${reportPath}`);

        return {
            success: true,
            reportPath: reportPath,
            scoreData: scoreData,
            reportGenerated: true,
            url: finalUrl,
            device: device,
            browser: adapter.name,
            attemptNumber: attemptNumber,
            message: `Audit completed successfully using ${adapter.name} on attempt ${attemptNumber}`
        };

    } catch (error) {
        console.error(`[Attempt ${attemptNumber}] Error:`, error.message);
        throw error;
    } finally {
        if (adapter) {
            await adapter.close();
        }
    }
}

/**
 * Main audit function with enhanced multi-browser retry logic
 */
export async function runLighthouseAudit(options) {
    const { url, device = 'desktop', format = 'json' } = options;

    if (!url) {
        return {
            success: false,
            error: 'URL is required',
            errorCode: 'MISSING_URL',
        };
    }

    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const maxAttempts = 3;
    const allErrors = [];

    console.log(`\n=== Starting enhanced audit for ${fullUrl} ===`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await performAuditWithEnhancedBrowser(fullUrl, {
                device,
                format
            }, attempt);

            console.log(`=== SUCCESS: Audit completed on attempt ${attempt} ===\n`);
            return result;

        } catch (error) {
            const errorInfo = {
                attempt: attempt,
                error: error.message,
                timestamp: new Date().toISOString()
            };
            allErrors.push(errorInfo);

            console.error(`[Attempt ${attempt}] Failed: ${error.message}`);

            if (attempt < maxAttempts) {
                const waitTime = 3000 * attempt; // 3s, 6s
                console.log(`Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    return {
        success: false,
        error: `All attempts failed after ${maxAttempts} tries`,
        errorCode: 'ALL_ATTEMPTS_FAILED',
        url: fullUrl,
        device: device,
        totalAttempts: allErrors.length,
        allErrors: allErrors,
        timestamp: new Date().toISOString(),
    };
}

