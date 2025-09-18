// audit.module.js
import fs from 'fs';
import { URL } from 'url';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-extra';
import { KnownDevices } from 'puppeteer';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import customConfig from './custom-config.js';

puppeteer.use(stealthPlugin());

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

async function performAudit(url, options) {
  const { device, format, useAdvancedFeatures } = options;
  const approach = useAdvancedFeatures ? 'Advanced' : 'Standard';
  console.log(`🚀 [Attempting with ${approach} Approach] Starting ${device} audit for: ${url}`);

  let browser = null;
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


    
    const page = await browser.newPage();

    if (device === 'mobile') {
      await page.emulate(KnownDevices['Pixel 5']);
    } else {
      const userAgent = useAdvancedFeatures 
        ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' 
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
      await page.setUserAgent(userAgent);
      await page.setViewport({ width: useAdvancedFeatures ? 1920 : 1280, height: useAdvancedFeatures ? 1080 : 800 });
    }

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (response.status() !== 200) {
      throw new Error(`Failed to load page: Status code ${response.status()}`);
    }
    console.log('✅ Page loaded successfully.');

    // --- Cookie Banner Handling ---
    console.log('🕵️ Looking for a cookie banner to accept...');
const cookieSelectors = [
    // --- By ID (Most specific and reliable) ---
    '#onetrust-accept-btn-handler',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
    '#hs-eu-confirmation-button', // HubSpot
    '#cookie_action_close_header', // Cookie Notice plugin
    '#cookie-accept',
    '#accept-cookies',
    '#accept_cookie',
    '#cookie-notice-accept',
    '#accept-all-cookies',
    '#wt-cli-accept-all-btn', // CookieYes

    // --- By Data Attributes (Very reliable) ---
    '[data-testid="cookie-policy-manage-dialog-accept-button"]',
    '[data-cy="cookie-accept"]',
    '[data-qa="accept-cookies"]',
    '[data-cookie-accept]',
    '[data-action="accept"]',
    '[data-action="accept-all"]',
    '[data-accept-action]',
    '[data-role="accept-cookies"]',

    // --- By ARIA Labels (Good for accessibility-compliant sites) ---
    'button[aria-label*="accept" i]',
    'button[aria-label*="agree" i]',
    'button[aria-label*="consent" i]',
    'button[aria-label*="allow" i]',
    
    // --- By Class Name Substring (Handles dynamically generated classes) ---
    '[class*="cookieNotification__agree-button"]',
    '[class*="iubenda-cs-accept-btn"]', // Iubenda
    '[class*="cmplz-accept"]', // Complianz
    '[class*="cookie-btn-accept-all"]',
    '[class*="cookie-accept"]',
    '[class*="cookie_accept"]',
    '[class*="cookie__accept"]',
    '[class*="accept-all"]',
    '[class*="acceptAll"]',
    '[class*="acceptContainer"]',
    '[class*="consent-accept"]',
    '[class*="banner-accept"]',
    '[class*="agree-button"]',
    '[class*="accept-button"]',
    '[class*="CallToAction"]', // Common in some frameworks

    // --- By XPath Text Match (Broadest, checked last) ---
    '//button[contains(., "Accept all")]',
    '//button[contains(., "Accept All")]',
    '//button[contains(., "ACCEPT ALL")]',
    '//button[contains(., "ALLOW ALL")]',
    '//button[contains(., "Allow all")]',
    '//button[contains(., "Agree to all")]',
    '//button[contains(., "I accept")]',
    '//button[contains(., "I agree")]',
    '//button[contains(., "Got it")]',
    '//button[contains(., "Okay")]',
    '//button[contains(., "OK")]',
    '//button[contains(., "Understood")]',
    '//a[contains(., "Accept")]', // Sometimes it's a link
    '//button[contains(., "Accept")]', // Generic "Accept" is last
];
    let bannerClicked = false;
    for (const selector of cookieSelectors) {
      try {
        const button = await page.waitForSelector(selector, { timeout: 3000, visible: true });
        if (button) {
          console.log(`✅ Found cookie button with selector: "${selector}". Clicking...`);
          await page.evaluate(b => b.click(), button);
          await page.waitForSelector(selector, { hidden: true, timeout: 3000 });
          console.log('✅ Cookie banner dismissed.');
          bannerClicked = true;
          break;
        }
      } catch (error) { /* Selector not found, continue */ }
    }
    if (!bannerClicked) {
      console.log('🤷 No cookie banner found or handled. Continuing audit.');
    }

    const lighthouseOptions = {
      port: new URL(browser.wsEndpoint()).port,
      output: format,
      logLevel: 'info',
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

    const lighthouseResult = await lighthouse(url, lighthouseOptions, customConfig);
    
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
      
      return { 
        success: false, 
        error: 'Silver Surfers score is 0 - audit may have failed or configuration issue detected',
        scoreData: scoreData,
        reportGenerated: false
      };
    }
    
    console.log(`✅ [Score Validation] Silver Surfers score: ${scoreData.finalScore.toFixed(2)} - proceeding with report generation`);
    
    const report = format === 'json' ? JSON.stringify(lighthouseResult.lhr, null, 2) : lighthouseResult.report;

    // --- Generate a unique filename ---
    const urlObject = new URL(url);
    const hostname = urlObject.hostname.replace(/\./g, '-');
    const timestamp = Date.now();
    const reportPath = `report-${hostname}-${timestamp}.${format}`;
    
    fs.writeFileSync(reportPath, report);
    console.log(`✅ Lighthouse report saved to ${reportPath}`);
    
    return { 
      success: true, 
      reportPath: reportPath,
      scoreData: scoreData,
      reportGenerated: true
    };
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed successfully.');
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
    return { success: false, error: 'URL is required.' };
  }

  const fullUrl = url.startsWith('http') ? url : `https://${url}`;

  try {
    // First attempt with standard features
    return await performAudit(fullUrl, { device, format, useAdvancedFeatures: false });
  } catch (error) {
    console.error(`Standard attempt failed: ${error.message}`);
    
    // If the first attempt failed with a specific error, retry with advanced features
    if (error.message.includes('Status code 403') || error.message.includes('timed out')) {
      try {
        console.log('Retrying with advanced features...');
        return await performAudit(fullUrl, { device, format, useAdvancedFeatures: true });
      } catch (finalError) {
        console.error(`Advanced attempt also failed: ${finalError.message}`);
        return { success: false, error: finalError.message };
      }
    } else {
      // For any other error, fail immediately
      return { success: false, error: error.message };
    }
  }
}