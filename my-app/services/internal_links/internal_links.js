import axios from 'axios';
import puppeteer from 'puppeteer';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cheerio = require('cheerio');

export class InternalLinksExtractor {
  constructor(options = {}) {
    this.config = {
      maxLinks: options.maxLinks || 25,
      maxDepth: options.maxDepth || 2,
      delayMs: options.delayMs || 2000,
      timeout: options.timeout || 15000,
      maxRetries: options.maxRetries || 3,
    };
    
    this.visited = new Set();
    this.results = [];
    this.baseOrigin = null;
  }

  async extractLinksWithPuppeteer(url) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: this.config.timeout 
      });

      const links = await page.evaluate(() => {
        const baseUrl = window.location.href;
        const origin = new URL(baseUrl).origin;
        const linkSet = new Set();

        document.querySelectorAll('a[href]').forEach(anchor => {
          const href = anchor.getAttribute('href');
          if (!href) return;

          try {
            const fullUrl = new URL(href, baseUrl);
            if (fullUrl.origin !== origin) return;
            
            fullUrl.hash = '';
            fullUrl.search = '';
            
            const cleanUrl = fullUrl.href.replace(/\/$/, '');
            if (cleanUrl === origin) return;
            
            if (!/\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|exe|woff|woff2|ttf)$/i.test(cleanUrl)) {
              linkSet.add(cleanUrl);
            }
          } catch (e) { /* Skip invalid URLs */ }
        });

        return Array.from(linkSet);
      });

      return links;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async extractLinksWithCheerio(url) {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Accept: 'text/html,application/xhtml+xml',
      },
      timeout: this.config.timeout,
    });

    const $ = cheerio.load(response.data);
    const origin = new URL(url).origin;
    const links = new Set();

    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const fullUrl = new URL(href, url);
        if (fullUrl.origin !== origin) return;
        
        fullUrl.hash = '';
        fullUrl.search = '';
        
        const cleanUrl = fullUrl.href.replace(/\/$/, '');
        if (cleanUrl === origin) return;

        if (!/\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|exe|woff|woff2|ttf)$/i.test(cleanUrl)) {
          links.add(cleanUrl);
        }
      } catch (e) { /* Skip invalid URLs */ }
    });

    return Array.from(links);
  }

  isValidInternalLink(url) {
    const invalidPatterns = [
      /\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|exe|woff|woff2|ttf)$/i,
      /^[)\]"']/,
      /[)\]"']$/,
      /^\s*$/
    ];
    return !invalidPatterns.some(pattern => pattern.test(url));
  }

  // REFACTORED: This function is now simplified to only use Puppeteer and Cheerio.
  async extractLinksFromUrl(url) {
    console.log(`Extracting links from: ${url}`);
    
    try {
      const links = await this.extractLinksWithPuppeteer(url);
      console.log(`Found ${links.length} links via Puppeteer`);
      return links.filter(link => !this.visited.has(link));
    } catch (puppeteerError) {
      console.log('Puppeteer failed, trying Cheerio as a fallback...');
      try {
        const links = await this.extractLinksWithCheerio(url);
        console.log(`Found ${links.length} links via Cheerio`);
        return links.filter(link => !this.visited.has(link));
      } catch (cheerioError) {
        // If both methods fail, throw an error to be handled by the retry logic.
        throw new Error(`Both Puppeteer and Cheerio failed to extract from ${url}.`);
      }
    }
  }

  async attemptExtractionWithRetries(url) {
    let lastError = null;
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.extractLinksFromUrl(url);
      } catch (error) {
        lastError = error;
        console.log(`Attempt ${attempt}/${this.config.maxRetries} failed for ${url}: ${error.message}`);
        if (attempt < this.config.maxRetries) {
          await this.delay();
        }
      }
    }
    throw lastError;
  }

  async delay() {
    return new Promise(resolve => setTimeout(resolve, this.config.delayMs));
  }

  async extractInternalLinks(baseUrl) {
    try {
      console.log(`Starting internal link extraction for: ${baseUrl}`);
      console.log(`Max links: ${this.config.maxLinks}, Max depth: ${this.config.maxDepth}`);

      this.baseOrigin = new URL(baseUrl).origin;
      this.visited.clear();
      this.results = [];

      this.visited.add(baseUrl);
      this.results.push({ url: baseUrl, depth: 0, source: 'initial' });

      let processIndex = 0;
      while (processIndex < this.results.length && this.results.length < this.config.maxLinks) {
        const currentItem = this.results[processIndex];
        const { url, depth } = currentItem;

        console.log(`\nProcessing #${processIndex + 1} (depth ${depth}): ${url}`);
        if (processIndex > 0) await this.delay();

        if (depth >= this.config.maxDepth) {
          console.log(`Max depth (${this.config.maxDepth}) reached. Skipping.`);
          processIndex++;
          continue;
        }

        try {
          const foundLinks = await this.attemptExtractionWithRetries(url);
          
          for (const link of foundLinks) {
            if (this.results.length >= this.config.maxLinks) break;
            if (!this.visited.has(link)) {
              this.visited.add(link);
              this.results.push({ url: link, depth: depth + 1, source: url });
            }
          }
        } catch (error) {
          console.log(`FATAL: Could not process ${url} after all retries:`, error.message);
          currentItem.error = error.message;
          if (processIndex === 0) {
            throw new Error(`The base URL ${baseUrl} could not be processed. Aborting.`);
          }
        }
        
        processIndex++;
      }

      console.log(`\nExtraction complete! Found a total of ${this.results.length} internal links.`);
      
      const finalLinks = this.results.map(item => item.url).slice(0, this.config.maxLinks);

      return {
        success: true,
        links: finalLinks
      };

    } catch (error) {
      console.error('A critical error occurred during the extraction process:', error.message);
      return {
        success: false,
        error: 'Failed to extract links due to a critical error.',
        details: error.message
      };
    }
  }
}

export async function extractInternalLinks(baseUrl, options = {}) {
  const extractor = new InternalLinksExtractor(options);
  return await extractor.extractInternalLinks(baseUrl);
}

export default InternalLinksExtractor;