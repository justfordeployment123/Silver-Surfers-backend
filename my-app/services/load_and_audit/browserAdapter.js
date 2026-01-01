/**
 * Browser Adapter System
 * Supports multiple browser automation tools with enhanced anti-detection
 * Falls back between Puppeteer and Playwright for better success rates
 */

import puppeteer from 'puppeteer-extra';
import { KnownDevices } from 'puppeteer';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { chromium } from 'playwright';

/**
 * Generate random fingerprint data to avoid detection
 */
function generateFingerprint() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    ];

    const viewports = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1536, height: 864 },
        { width: 1440, height: 900 },
    ];

    const languages = [
        'en-US,en;q=0.9',
        'en-US,en;q=0.9,fr;q=0.8',
        'en-GB,en;q=0.9',
    ];

    return {
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
        viewport: viewports[Math.floor(Math.random() * viewports.length)],
        language: languages[Math.floor(Math.random() * languages.length)],
        timezone: 'America/New_York',
        locale: 'en-US',
    };
}

/**
 * Puppeteer Browser Adapter with Enhanced Anti-Detection
 */
export class PuppeteerAdapter {
    constructor() {
        this.name = 'Puppeteer';
        this.browser = null;
        this.page = null;
    }

    async launch(options = {}) {
        const fingerprint = generateFingerprint();
        const puppeteerInstance = puppeteer.use(stealthPlugin());

        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials',
                '--disable-web-security',
                '--disable-features=BlockInsecurePrivateNetworkRequests',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-background-timer-throttling',
                '--force-color-profile=srgb',
                '--metrics-recording-only',
                '--disable-default-apps',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-component-extensions-with-background-pages',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--mute-audio',
                '--no-zygote',
                '--disable-gpu',
                `--lang=${fingerprint.locale}`,
                `--timezone-id=${fingerprint.timezone}`,
            ],
            ignoreDefaultArgs: ['--enable-automation'],
            defaultViewport: null,
            ...options,
        };

        this.browser = await puppeteerInstance.launch(launchOptions);
        return this.browser;
    }

    async newPage(device = 'desktop') {
        if (!this.browser) {
            throw new Error('Browser not launched');
        }

        const fingerprint = generateFingerprint();
        this.page = await this.browser.newPage();

        // Enhanced anti-detection measures
        await this.page.evaluateOnNewDocument(() => {
            // Override navigator properties
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });

            // Override chrome property
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };

            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });

            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });

            // Remove automation indicators
            delete navigator.__proto__.webdriver;
        });

        // Set user agent and viewport
        if (device === 'mobile') {
            await this.page.emulate(KnownDevices['Pixel 5']);
        } else if (device === 'tablet') {
            const tabletDevices = ['iPad Pro 11', 'iPad 7th Gen', 'Galaxy Tab S4'];
            for (const devName of tabletDevices) {
                try {
                    await this.page.emulate(KnownDevices[devName]);
                    break;
                } catch (e) {
                    continue;
                }
            }
        } else {
            await this.page.setUserAgent(fingerprint.userAgent);
            await this.page.setViewport(fingerprint.viewport);
        }

        // Set extra headers
        await this.page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': fingerprint.language,
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
        });

        return this.page;
    }

    async goto(url, options = {}) {
        if (!this.page) {
            throw new Error('Page not created');
        }

        const response = await this.page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 60000,
            ...options,
        });

        return response;
    }

    async waitForSelector(selector, options = {}) {
        if (!this.page) {
            throw new Error('Page not created');
        }
        return await this.page.waitForSelector(selector, options);
    }

    async waitForNetworkIdle(options = {}) {
        if (!this.page) {
            throw new Error('Page not created');
        }
        return await this.page.waitForNetworkIdle({
            idleTime: 500,
            timeout: 10000,
            ...options,
        });
    }

    async evaluate(fn) {
        if (!this.page) {
            throw new Error('Page not created');
        }
        return await this.page.evaluate(fn);
    }

    get url() {
        return this.page ? this.page.url() : null;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

/**
 * Playwright Browser Adapter with Enhanced Anti-Detection
 * Playwright generally has better anti-detection capabilities
 */
export class PlaywrightAdapter {
    constructor() {
        this.name = 'Playwright';
        this.browser = null;
        this.page = null;
        this.context = null;
    }

    async launch(options = {}) {
        const fingerprint = generateFingerprint();

        this.browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials',
                '--disable-web-security',
                '--disable-features=BlockInsecurePrivateNetworkRequests',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-background-timer-throttling',
                '--force-color-profile=srgb',
                '--metrics-recording-only',
                '--disable-default-apps',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-component-extensions-with-background-pages',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--mute-audio',
                '--no-zygote',
                '--disable-gpu',
                `--lang=${fingerprint.locale}`,
                `--timezone-id=${fingerprint.timezone}`,
            ],
            ...options,
        });

        return this.browser;
    }

    async newPage(device = 'desktop') {
        if (!this.browser) {
            throw new Error('Browser not launched');
        }

        const fingerprint = generateFingerprint();

        // Create context with enhanced fingerprint
        const deviceDescriptors = {
            mobile: { ...chromium.devices['Pixel 5'] },
            tablet: { ...chromium.devices['iPad Pro'] },
            desktop: {
                userAgent: fingerprint.userAgent,
                viewport: fingerprint.viewport,
                deviceScaleFactor: 1,
                isMobile: false,
                hasTouch: false,
            },
        };

        const deviceConfig = deviceDescriptors[device] || deviceDescriptors.desktop;

        this.context = await this.browser.newContext({
            ...deviceConfig,
            locale: fingerprint.locale,
            timezoneId: fingerprint.timezone,
            permissions: [],
            geolocation: undefined,
            colorScheme: 'light',
            extraHTTPHeaders: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': fingerprint.language,
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
            },
        });

        // Add additional scripts to avoid detection
        await this.context.addInitScript(() => {
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

        this.page = await this.context.newPage();
        return this.page;
    }

    async goto(url, options = {}) {
        if (!this.page) {
            throw new Error('Page not created');
        }

        const response = await this.page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 60000,
            ...options,
        });

        return response;
    }

    async waitForSelector(selector, options = {}) {
        if (!this.page) {
            throw new Error('Page not created');
        }
        return await this.page.waitForSelector(selector, options);
    }

    async waitForNetworkIdle(options = {}) {
        if (!this.page) {
            throw new Error('Page not created');
        }
        // Playwright doesn't have waitForNetworkIdle, so we use a custom wait
        await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    }

    async evaluate(fn) {
        if (!this.page) {
            throw new Error('Page not created');
        }
        return await this.page.evaluate(fn);
    }

    get url() {
        return this.page ? this.page.url() : null;
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        this.page = null;
    }
}

/**
 * Browser Factory - Creates the appropriate browser adapter
 */
export function createBrowserAdapter(type = 'playwright') {
    if (type === 'playwright') {
        return new PlaywrightAdapter();
    } else if (type === 'puppeteer') {
        return new PuppeteerAdapter();
    } else {
        throw new Error(`Unknown browser type: ${type}`);
    }
}

/**
 * Try multiple browsers in sequence until one succeeds
 */
export async function tryWithMultipleBrowsers(fn, browsers = ['playwright', 'puppeteer']) {
    const errors = [];

    for (const browserType of browsers) {
        try {
            console.log(`🌐 Trying with ${browserType}...`);
            const adapter = createBrowserAdapter(browserType);
            const result = await fn(adapter);
            console.log(`✅ Success with ${browserType}!`);
            return { success: true, result, browser: browserType };
        } catch (error) {
            console.error(`❌ ${browserType} failed:`, error.message);
            errors.push({ browser: browserType, error: error.message });
            continue;
        }
    }

    return {
        success: false,
        error: 'All browsers failed',
        errors,
    };
}

