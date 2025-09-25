/**
 * Brand Website Scraper - Direct product image extraction from official brand websites
 * Highest priority source for authentic product images
 */

const puppeteer = require('puppeteer');
const path = require('path');
const brandWebsites = require('../config/brandWebsites');

class BrandWebsiteScraper {
    constructor(logger, settings = {}) {
        this.logger = logger;
        this.settings = settings;
        this.browser = null;
        this.visitedUrls = new Set();
        this.brandImageCache = new Map();
    }

    /**
     * Initialize browser for brand website scraping
     */
    async initializeBrowser() {
        if (this.browser) return this.browser;

        try {
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
            });
            
            this.logger.info('🏢 Brand website scraper browser initialized');
            return this.browser;
        } catch (error) {
            this.logger.error('Failed to initialize brand website scraper browser:', error);
            throw error;
        }
    }

    /**
     * Search for product images on official brand website
     */
    async searchBrandWebsite(productName, brandName) {
        try {
            if (!brandName || brandName === 'NONE') {
                return [];
            }

            const brandKey = brandName.toUpperCase();
            const brandConfig = brandWebsites[brandKey];
            
            if (!brandConfig) {
                this.logger.info(`🏢 No official website configuration for brand: ${brandName}`);
                return await this.tryGenericBrandSearch(productName, brandName);
            }

            this.logger.info(`🏢 Searching official ${brandName} website for: ${productName}`);
            
            const browser = await this.initializeBrowser();
            const page = await browser.newPage();
            
            // Set user agent and viewport
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });

            let imageUrls = [];

            switch (brandConfig.searchMethod) {
                case 'path':
                    imageUrls = await this.searchByPath(page, brandConfig, productName);
                    break;
                case 'query':
                    imageUrls = await this.searchByQuery(page, brandConfig, productName);
                    break;
                case 'menu_scan':
                    imageUrls = await this.searchMenuItems(page, brandConfig, productName);
                    break;
                default:
                    imageUrls = await this.searchByQuery(page, brandConfig, productName);
            }

            await page.close();
            
            this.logger.info(`🏢 Found ${imageUrls.length} images from ${brandName} official website`);
            return imageUrls;

        } catch (error) {
            this.logger.error(`Error searching ${brandName} website:`, error);
            return [];
        }
    }

    /**
     * Search using direct product paths (Apple-style)
     */
    async searchByPath(page, brandConfig, productName) {
        const productKey = productName.toLowerCase();
        const productPaths = brandConfig.productPaths || {};
        
        // Find matching product path
        const matchingPath = Object.keys(productPaths).find(key => 
            productKey.includes(key) || key.includes(productKey.split(' ')[0])
        );

        if (!matchingPath) {
            this.logger.info(`🏢 No direct path found for product: ${productName}`);
            return [];
        }

        const productUrl = `https://${brandConfig.domain}${productPaths[matchingPath]}`;
        
        try {
            await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 15000 });
            this.logger.info(`🏢 Visiting official product page: ${productUrl}`);
            
            return await this.extractImagesFromPage(page, brandConfig);
        } catch (error) {
            this.logger.error(`Failed to load product page: ${productUrl}`, error);
            return [];
        }
    }

    /**
     * Search using search query (Most brands)
     */
    async searchByQuery(page, brandConfig, productName) {
        const searchUrl = `${brandConfig.searchUrl}?${brandConfig.searchParam}=${encodeURIComponent(productName)}`;
        
        try {
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 15000 });
            this.logger.info(`🏢 Searching brand website: ${searchUrl}`);
            
            // Wait for search results to load
            await page.waitForTimeout(2000);
            
            // Look for product links in search results
            const productLinks = await page.evaluate((pattern) => {
                const links = Array.from(document.querySelectorAll('a[href*="' + pattern + '"]'));
                return links.map(link => link.href).slice(0, 3); // Top 3 results
            }, brandConfig.productPathPattern);

            let allImages = [];
            
            // Visit each product page
            for (const productLink of productLinks) {
                try {
                    await page.goto(productLink, { waitUntil: 'networkidle2', timeout: 10000 });
                    const images = await this.extractImagesFromPage(page, brandConfig);
                    allImages.push(...images);
                    
                    if (allImages.length >= 6) break; // Limit per brand
                } catch (error) {
                    this.logger.warn(`Failed to load product page: ${productLink}`);
                }
            }
            
            return allImages;
            
        } catch (error) {
            this.logger.error(`Failed to search brand website: ${searchUrl}`, error);
            return [];
        }
    }

    /**
     * Search menu items (Restaurant brands)
     */
    async searchMenuItems(page, brandConfig, productName) {
        try {
            const menuUrl = brandConfig.searchUrl;
            await page.goto(menuUrl, { waitUntil: 'networkidle2', timeout: 15000 });
            this.logger.info(`🏢 Scanning menu: ${menuUrl}`);
            
            // Wait for menu to load
            await page.waitForTimeout(3000);
            
            // Search for matching menu items
            const menuImages = await page.evaluate((productName, selectors) => {
                const images = [];
                const productKeywords = productName.toLowerCase().split(' ');
                
                selectors.forEach(selector => {
                    const imgElements = document.querySelectorAll(selector);
                    imgElements.forEach(img => {
                        const alt = (img.alt || '').toLowerCase();
                        const src = img.src || img.dataset.src;
                        
                        // Check if image alt text matches product
                        const matchesProduct = productKeywords.some(keyword => 
                            alt.includes(keyword) || src.includes(keyword)
                        );
                        
                        if (matchesProduct && src && src.startsWith('http')) {
                            images.push(src);
                        }
                    });
                });
                
                return [...new Set(images)]; // Remove duplicates
            }, productName, brandConfig.imageSelectors);
            
            return menuImages;
            
        } catch (error) {
            this.logger.error(`Failed to scan menu: ${brandConfig.searchUrl}`, error);
            return [];
        }
    }

    /**
     * Extract high-quality product images from a product page
     */
    async extractImagesFromPage(page, brandConfig) {
        try {
            const images = await page.evaluate((selectors) => {
                const imageUrls = [];
                
                selectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(img => {
                        const src = img.src || img.dataset.src || img.dataset.original;
                        if (src && src.startsWith('http')) {
                            imageUrls.push(src);
                        }
                    });
                });
                
                return [...new Set(imageUrls)]; // Remove duplicates
            }, brandConfig.imageSelectors);
            
            // Filter for high-quality images
            const highQualityImages = images.filter(url => {
                // Look for high-resolution indicators
                return url.includes('1200') || url.includes('1000') || 
                       url.includes('large') || url.includes('hero') ||
                       url.includes('main') || url.includes('product');
            });
            
            return highQualityImages.length > 0 ? highQualityImages : images;
            
        } catch (error) {
            this.logger.error('Failed to extract images from page:', error);
            return [];
        }
    }

    /**
     * Try generic brand website search patterns
     */
    async tryGenericBrandSearch(productName, brandName) {
        try {
            const genericConfig = brandWebsites.GENERIC;
            const brandDomain = brandName.toLowerCase().replace(/\s+/g, '');
            
            const browser = await this.initializeBrowser();
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            const searchUrls = genericConfig.searchPatterns.map(pattern => 
                pattern.replace('{brand}', brandDomain).replace('{product}', encodeURIComponent(productName))
            );
            
            let allImages = [];
            
            for (const url of searchUrls) {
                try {
                    this.logger.info(`🏢 Trying generic brand search: ${url}`);
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
                    
                    const images = await page.evaluate((selectors) => {
                        const imageUrls = [];
                        selectors.forEach(selector => {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(img => {
                                const src = img.src || img.dataset.src;
                                if (src && src.startsWith('http')) {
                                    imageUrls.push(src);
                                }
                            });
                        });
                        return [...new Set(imageUrls)];
                    }, genericConfig.commonSelectors);
                    
                    allImages.push(...images);
                    if (allImages.length >= 3) break; // Found some images, stop trying
                    
                } catch (error) {
                    // Continue to next URL pattern
                }
            }
            
            await page.close();
            return allImages.slice(0, 6); // Limit results
            
        } catch (error) {
            this.logger.error(`Failed generic brand search for ${brandName}:`, error);
            return [];
        }
    }

    /**
     * Close browser and cleanup
     */
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.logger.info('🏢 Brand website scraper browser closed');
        }
    }
}

module.exports = BrandWebsiteScraper;