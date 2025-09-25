/**
 * Image Search Module for Product Image Search & Download System
 * Handles searching for product images across multiple search engines
 */

const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const pixelmatch = require('pixelmatch');
const Logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const config = require('../config/settings');
const BrandWebsiteScraper = require('./brandWebsiteScraper');

/**
 * Image Search class for finding product images
 */
class ImageSearch {
  /**
   * Create ImageSearch instance
   */
  constructor() {
    this.browser = null;
    this.axiosInstance = this.createAxiosInstance();
    this.downloadedImages = new Map(); // Track downloaded images to prevent duplicates
    this.imageHashes = new Set(); // Store image hashes for duplicate detection
    this.userAgents = this.initUserAgents(); // User agent rotation for anti-detection
    this.currentUserAgentIndex = 0;
    this.brandScraper = new BrandWebsiteScraper(Logger, config); // Official brand website scraper
  }

  /**
   * Create configured axios instance
   * @returns {Object} Axios instance
   */
  createAxiosInstance() {
    return axios.create({
      timeout: config.search.searchTimeout,
      headers: {
        'User-Agent': config.search.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      }
    });
  }

  /**
   * Initialize user agents for rotation
   * @returns {Array} Array of user agent strings
   */
  initUserAgents() {
    return [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
    ];
  }

  /**
   * Get next user agent for rotation
   * @returns {string} User agent string
   */
  getNextUserAgent() {
    const userAgent = this.userAgents[this.currentUserAgentIndex];
    this.currentUserAgentIndex = (this.currentUserAgentIndex + 1) % this.userAgents.length;
    return userAgent;
  }

  /**
   * Configure page with anti-detection measures
   * @param {Object} page - Puppeteer page
   * @returns {Promise<void>}
   */
  async configurePageForSearch(page) {
    // Set rotating user agent
    const userAgent = config.search.enableUserAgentRotation ? 
      this.getNextUserAgent() : config.search.userAgent;
    await page.setUserAgent(userAgent);
    
    // Randomize viewport if enabled
    if (config.search.randomizeViewport) {
      const viewports = [
        { width: 1366, height: 768 },
        { width: 1920, height: 1080 },
        { width: 1536, height: 864 },
        { width: 1440, height: 900 }
      ];
      const viewport = viewports[Math.floor(Math.random() * viewports.length)];
      await page.setViewport(viewport);
    } else {
      await page.setViewport({ width: 1366, height: 768 });
    }
    
    // Hide webdriver traces
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      
      // Mock screen properties
      Object.defineProperty(screen, 'width', { get: () => window.innerWidth });
      Object.defineProperty(screen, 'height', { get: () => window.innerHeight });
    });
    
    // Set additional headers
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
  }

  /**
   * Initialize browser for advanced search capabilities
   */
  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-blink-features=AutomationControlled',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images', // Speed optimization: don't load images
          '--disable-javascript', // Speed optimization: disable JS where possible
          '--disable-css', // Speed optimization: disable CSS rendering
          '--memory-pressure-off',
          '--max_old_space_size=4096'
        ],
        timeout: 10000 // Faster browser startup timeout
      });
      Logger.info('Browser initialized for advanced search');
    }
  }

  /**
   * Search for images for a given product
   * @param {Object} product - Product object with name and brand
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchImages(product) {
    try {
      Logger.info('Starting image search', { 
        itemId: product.itemid,
        name: product.name,
        brand: product.brand 
      });

      let allImageUrls = [];
      
      // PRIORITY 1: Search official brand website FIRST (Highest Quality & Authenticity)
      if (product.brand && product.brand !== 'NONE') {
        try {
          Logger.info(`🏢 PRIORITY: Searching official ${product.brand} website first`, {
            itemId: product.itemid,
            brand: product.brand
          });
          
          const brandImages = await this.brandScraper.searchBrandWebsite(product.name, product.brand);
          if (brandImages && brandImages.length > 0) {
            allImageUrls = allImageUrls.concat(brandImages);
            Logger.success(`🏢 Found ${brandImages.length} images from official ${product.brand} website`, {
              itemId: product.itemid,
              brand: product.brand,
              count: brandImages.length
            });
            
            // If we found enough high-quality images from brand website, we might not need other sources
            if (brandImages.length >= config.search.maxImagesPerItem) {
              Logger.info(`🏢 Sufficient images found from brand website, skipping other sources`, {
                itemId: product.itemid,
                brand: product.brand
              });
              
              const uniqueUrls = [...new Set(allImageUrls)];
              const filteredUrls = this.filterImageUrls(uniqueUrls);
              const limitedUrls = filteredUrls.slice(0, config.search.maxImagesPerItem);
              
              Logger.success('Brand website search completed', { 
                itemId: product.itemid,
                totalFound: allImageUrls.length,
                finalCount: limitedUrls.length,
                source: 'Official Brand Website'
              });
              
              return limitedUrls;
            }
          }
        } catch (error) {
          Logger.warn(`Brand website search failed for ${product.brand}`, { 
            itemId: product.itemid,
            error: error.message 
          });
        }
      }

      // PRIORITY 2: Fallback to search engines if needed
      Logger.info('Complementing with search engine results', { 
        itemId: product.itemid,
        brandImagesFound: allImageUrls.length
      });

      // Generate search queries
      const queries = Helpers.generateSearchQueries(product);
      product.searchQueries = queries;
      
      // Search with each query across enabled engines
      for (const query of queries) {
        for (const engine of config.search.engines) {
          try {
            Logger.info('Searching with query', { 
              itemId: product.itemid,
              engine,
              query 
            });

            const urls = await this.searchByEngineWithRetry(engine, query, product.itemid);
            if (urls && urls.length > 0) {
              allImageUrls = allImageUrls.concat(urls);
              Logger.success(`Found ${urls.length} images from ${engine}`, { 
                itemId: product.itemid,
                engine,
                count: urls.length 
              });
            } else {
              Logger.warn(`No images found from ${engine}`, { 
                itemId: product.itemid,
                engine 
              });
            }

            // Add delay between engines
            await Helpers.sleep(config.search.delayBetweenEngines);
          } catch (error) {
            Logger.warn('Search engine request failed', { 
              itemId: product.itemid,
              engine,
              query,
              error: error.message 
            });
          }
        }
        
        // Add delay between queries
        await Helpers.sleep(config.search.delayBetweenRequests);
      }

      // Remove duplicates and filter
      const uniqueUrls = [...new Set(allImageUrls)];
      const filteredUrls = this.filterImageUrls(uniqueUrls);
      
      // Limit to max images per item
      const limitedUrls = filteredUrls.slice(0, config.search.maxImagesPerItem);

      Logger.success('Image search completed', { 
        itemId: product.itemid,
        totalFound: allImageUrls.length,
        uniqueUrls: uniqueUrls.length,
        afterFiltering: filteredUrls.length,
        finalCount: limitedUrls.length
      });

      return limitedUrls;
    } catch (error) {
      Logger.error('Image search failed', { 
        itemId: product.itemid,
        error 
      });
      return [];
    }
  }

  /**
   * Search by engine with retry logic
   * @param {string} engine - Search engine name
   * @param {string} query - Search query
   * @param {string} itemId - Item ID for logging
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchByEngineWithRetry(engine, query, itemId) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= config.search.retryAttempts; attempt++) {
      try {
        Logger.info(`Search attempt ${attempt}/${config.search.retryAttempts}`, { 
          itemId, 
          engine, 
          attempt 
        });
        
        const urls = await this.searchByEngine(engine, query);
        
        if (urls && urls.length > 0) {
          return urls;
        } else if (attempt === config.search.retryAttempts) {
          Logger.warn(`No results after ${attempt} attempts`, { 
            itemId, 
            engine 
          });
          return [];
        }
      } catch (error) {
        lastError = error;
        Logger.warn(`Search attempt ${attempt} failed`, { 
          itemId, 
          engine, 
          attempt, 
          error: error.message 
        });
        
        if (attempt < config.search.retryAttempts) {
          // Exponential backoff
          const delay = Math.min(30000, 2000 * Math.pow(2, attempt - 1));
          Logger.info(`Retrying in ${delay}ms`, { itemId, engine });
          await Helpers.sleep(delay);
        }
      }
    }
    
    Logger.error(`All ${config.search.retryAttempts} attempts failed`, { 
      itemId, 
      engine, 
      error: lastError?.message 
    });
    return [];
  }

  /**
   * Search images using specific engine
   * @param {string} engine - Search engine name
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchByEngine(engine, query) {
    switch (engine.toLowerCase()) {
      case 'google':
        return await this.searchGoogle(query);
      case 'bing':
        return await this.searchBing(query);
      case 'shopee':
        return await this.searchShopee(query);
      case 'lazada':
        return await this.searchLazada(query);
      case 'ebay':
        return await this.searchEbay(query);
      case 'shopping':
        return await this.searchShoppingSites(query);
      case 'amazon':
        return await this.searchAmazon(query);
      case 'hardware':
        return await this.searchHardware(query);
      default:
        Logger.warn('Unknown search engine', { engine });
        return [];
    }
  }

  /**
   * Search Amazon for product images
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchAmazon(query) {
    try {
      await this.initBrowser();
      const page = await this.browser.newPage();
      
      try {
        await page.setUserAgent(config.search.userAgent);
        // Amazon search URL (default to .com, can be adjusted for region)
        const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: config.search.searchTimeout });

        // Wait for product results to load
        await page.waitForSelector('div.s-main-slot', { timeout: config.search.selectorTimeout });

        // Extract image URLs from product listings
        const imageUrls = await page.evaluate(() => {
          const images = [];
          // Amazon product images in search results
          const imgElements = document.querySelectorAll('div.s-main-slot img.s-image');
          
          imgElements.forEach(img => {
            if (img.src && img.src.startsWith('http')) {
              // Better URL transformation for 600-1200px range - preserve aspect ratio
              let url = img.src
                .replace('._AC_UY218_', '._AC_SL1200_') // Use SL1200 for better resolution
                .replace('._AC_UX218_', '._AC_SL1200_')
                .replace('._SY300_', '._SL1200_') // Scale to 1200px maintaining aspect ratio
                .replace('._SX300_', '._SL1200_')
                .replace('._AC_UL320_', '._AC_SL1200_') // Convert existing small sizes
                .replace('._AC_UL200_', '._AC_SL1200_')
                .replace('._AC_SL800_', '._AC_SL1200_') // Upgrade existing 800px to 1200px
                .replace('._AC_SL1000_', '._AC_SL1200_'); // Upgrade existing 1000px to 1200px
              
              // If no size modifier found, add one to get 1200px quality
              if (!url.includes('._AC_SL') && !url.includes('._SL')) {
                const extension = url.match(/\.[^.]*$/)?.[0] || '';
                if (extension) {
                  url = url.replace(extension, `._AC_SL1200_${extension}`);
                }
              }
              
              images.push(url);
            }
          });
          
          return images;
        });

        return imageUrls.slice(0, 20); // Limit results
      } finally {
        await page.close();
      }
    } catch (error) {
      Logger.warn('Amazon search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Search Hardware shops for product images
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchHardware(query) {
    try {
      // Search multiple hardware shop sites in parallel
      const searchPromises = [
        this.searchMrDIY(query),
        this.searchAceHardware(query),
        this.searchHomeDepot(query)
      ];
      
      const results = await Promise.allSettled(searchPromises);
      let allUrls = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allUrls = allUrls.concat(result.value);
        } else {
          const sites = ['MrDIY', 'Ace Hardware', 'Home Depot'];
          Logger.warn(`${sites[index]} search failed`, { 
            query, 
            error: result.reason.message 
          });
        }
      });
      
      return allUrls;
    } catch (error) {
      Logger.warn('Hardware shops search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Search MrDIY for product images
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchMrDIY(query) {
    try {
      await this.initBrowser();
      const page = await this.browser.newPage();
      
      try {
        await page.setUserAgent(config.search.userAgent);
        // MrDIY Malaysia search URL
        const searchUrl = `https://mrdiy.com.my/search?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Extract image URLs from product listings
        const imageUrls = await page.evaluate(() => {
          const images = [];
          const imgElements = document.querySelectorAll('.product-item img, .product-image img');
          
          imgElements.forEach(img => {
            if (img.src && img.src.startsWith('http')) {
              // Convert to higher resolution if possible
              let url = img.src.replace('_200x200', '_800x800').replace('_300x300', '_800x800');
              images.push(url);
            }
          });
          
          return images;
        });

        return imageUrls.slice(0, 15); // Limit results
      } finally {
        await page.close();
      }
    } catch (error) {
      Logger.warn('MrDIY search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Search Ace Hardware for product images
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchAceHardware(query) {
    try {
      await this.initBrowser();
      const page = await this.browser.newPage();
      
      try {
        await page.setUserAgent(config.search.userAgent);
        // Ace Hardware search URL
        const searchUrl = `https://www.acehardware.com/search?query=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Extract image URLs from product listings
        const imageUrls = await page.evaluate(() => {
          const images = [];
          const imgElements = document.querySelectorAll('.product-tile img, .product-image img');
          
          imgElements.forEach(img => {
            if (img.src && img.src.startsWith('http')) {
              images.push(img.src);
            }
          });
          
          return images;
        });

        return imageUrls.slice(0, 15); // Limit results
      } finally {
        await page.close();
      }
    } catch (error) {
      Logger.warn('Ace Hardware search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Search Home Depot for product images
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchHomeDepot(query) {
    try {
      await this.initBrowser();
      const page = await this.browser.newPage();
      
      try {
        await page.setUserAgent(config.search.userAgent);
        // Home Depot search URL
        const searchUrl = `https://www.homedepot.com/s/${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Extract image URLs from product listings
        const imageUrls = await page.evaluate(() => {
          const images = [];
          const imgElements = document.querySelectorAll('.product-pod img, .product-image img');
          
          imgElements.forEach(img => {
            if (img.src && img.src.startsWith('http')) {
              images.push(img.src);
            }
          });
          
          return images;
        });

        return imageUrls.slice(0, 15); // Limit results
      } finally {
        await page.close();
      }
    } catch (error) {
      Logger.warn('Home Depot search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Search Google Images
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchGoogle(query) {
    try {
      // Add image size parameter for larger images (600x600+)
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&safe=off&tbs=isz:l`; // isz:l = large images
      
      // Use browser for Google search to handle JavaScript
      await this.initBrowser();
      const page = await this.browser.newPage();
      
      try {
        await page.setUserAgent(config.search.userAgent);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Extract image URLs from the page
        const imageUrls = await page.evaluate(() => {
          const images = [];
          const imgElements = document.querySelectorAll('img[src]');
          
          imgElements.forEach(img => {
            const src = img.src;
            if (src && src.startsWith('http') && !src.includes('google.com')) {
              images.push(src);
            }
          });
          
          return images;
        });
        
        return imageUrls;
      } finally {
        await page.close();
      }
    } catch (error) {
      Logger.warn('Google search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Search Bing Images
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchBing(query) {
    try {
      const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2`;
      
      const response = await this.axiosInstance.get(searchUrl);
      const $ = cheerio.load(response.data);
      
      const imageUrls = [];
      
      // Extract image URLs from Bing results
      $('.iusc').each((i, element) => {
        try {
          const dataStr = $(element).attr('m');
          if (dataStr) {
            const data = JSON.parse(dataStr);
            if (data.murl) {
              imageUrls.push(data.murl);
            }
          }
        } catch (e) {
          // Skip invalid entries
        }
      });
      
      return imageUrls;
    } catch (error) {
      Logger.warn('Bing search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Search Shopee for product images
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchShopee(query) {
    try {
      await this.initBrowser();
      const page = await this.browser.newPage();
      
      try {
        await this.configurePageForSearch(page);
        
        const searchUrl = `https://shopee.com.my/search?keyword=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: config.search.searchTimeout });
        
        // Wait with multiple fallback selectors
        const selectors = [
          '[data-sqe="item"]',
          '.shopee-search-item-result__item',
          '.col-xs-2-4',
          '.item-basic',
          '[data-testid="product-item"]',
          '.shopee-product-tile'
        ];
        
        let foundSelector = null;
        for (const selector of selectors) {
          try {
            await page.waitForSelector(selector, { timeout: config.search.selectorTimeout });
            foundSelector = selector;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!foundSelector) {
          throw new Error('No product items found with any selector');
        }
        
        const imageUrls = await page.evaluate((selector) => {
          const images = [];
          const productItems = document.querySelectorAll(`${selector} img, ${selector} [data-src]`);
          
          productItems.forEach(img => {
            let imgSrc = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
            
            if (imgSrc && imgSrc.startsWith('http') && !imgSrc.includes('placeholder')) {
              // Convert thumbnail to larger image with multiple size variations
              let largeUrl = imgSrc
                .replace('_tn', '')
                .replace('_200x200', '_800x800')
                .replace('_300x300', '_800x800')
                .replace('_400x400', '_800x800')
                .replace('/tn_', '/');
              images.push(largeUrl);
            }
          });
          
          return images;
        }, foundSelector);
        
        return imageUrls.slice(0, 20); // Limit results
      } finally {
        await page.close();
      }
    } catch (error) {
      Logger.warn('Shopee search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Search Lazada for product images
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchLazada(query) {
    try {
      await this.initBrowser();
      const page = await this.browser.newPage();
      
      try {
        await this.configurePageForSearch(page);
        
        const searchUrl = `https://www.lazada.com.my/catalog/?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: config.search.searchTimeout });
        
        // Multiple fallback selectors for Lazada
        const selectors = [
          '[data-qa-locator="product-item"]',
          '.Bm3ON',
          '.gridItem',
          '.product-item',
          '[data-testid="product-item"]',
          '.c2prKC',
          '.item-card'
        ];
        
        let foundSelector = null;
        for (const selector of selectors) {
          try {
            await page.waitForSelector(selector, { timeout: config.search.selectorTimeout });
            foundSelector = selector;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!foundSelector) {
          throw new Error('No product items found with any selector');
        }
        
        const imageUrls = await page.evaluate((selector) => {
          const images = [];
          const productImages = document.querySelectorAll(`${selector} img, ${selector} [data-src]`);
          
          productImages.forEach(img => {
            let imgSrc = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
            
            if (imgSrc && imgSrc.startsWith('http')) {
              // Convert to higher resolution with multiple variations
              let largeUrl = imgSrc
                .replace('_200x200', '_800x800')
                .replace('_180x180', '_800x800')
                .replace('_240x240', '_800x800')
                .replace('_300x300', '_800x800')
                .replace('/200_', '/800_')
                .replace('/240_', '/800_');
              images.push(largeUrl);
            }
          });
          
          return images;
        }, foundSelector);
        
        return imageUrls.slice(0, 20);
      } finally {
        await page.close();
      }
    } catch (error) {
      Logger.warn('Lazada search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Search eBay for product images
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchEbay(query) {
    try {
      await this.initBrowser();
      const page = await this.browser.newPage();
      
      try {
        await this.configurePageForSearch(page);
        
        const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: config.search.searchTimeout });
        
        // Multiple selectors for eBay items
        const selectors = [
          '.s-item__image',
          '.s-item',
          '.x-item-title',
          '[data-testid="item-image"]',
          '.it-pic',
          '.img'
        ];
        
        let foundSelector = null;
        for (const selector of selectors) {
          try {
            await page.waitForSelector(selector, { timeout: config.search.selectorTimeout });
            foundSelector = selector;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!foundSelector) {
          throw new Error('No product items found with any selector');
        }
        
        const imageUrls = await page.evaluate((selector) => {
          const images = [];
          const productImages = document.querySelectorAll(`${selector} img, img[src]`);
          
          productImages.forEach(img => {
            if (img.src && img.src.startsWith('http')) {
              // Convert to larger size with multiple variations
              let largeUrl = img.src
                .replace('s-225', 's-800')
                .replace('s-140', 's-800')
                .replace('s-300', 's-800')
                .replace('_57', '_800')
                .replace('_50', '_800')
                .replace('_12', '_800');
              images.push(largeUrl);
            }
          });
          
          return images;
        }, foundSelector);
        
        return imageUrls.slice(0, 20);
      } finally {
        await page.close();
      }
    } catch (error) {
      Logger.warn('eBay search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Search multiple shopping sites (excluding problematic ones)
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchShoppingSites(query) {
    try {
      // Focus on working shopping sites only
      const searchPromises = [
        this.searchAmazon(query)
      ];
      
      const results = await Promise.allSettled(searchPromises);
      let allUrls = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allUrls = allUrls.concat(result.value);
        } else {
          const sites = ['Amazon'];
          Logger.warn(`${sites[index]} search failed`, { 
            query, 
            error: result.reason.message 
          });
        }
      });
      
      return allUrls;
    } catch (error) {
      Logger.warn('Shopping sites search failed', { query, error: error.message });
      return [];
    }
  }

  /**
   * Filter image URLs based on format and validity
   * @param {Array} urls - Array of image URLs
   * @returns {Array} Filtered array of URLs
   */
  filterImageUrls(urls) {
    return urls.filter(url => {
      try {
        // Check if URL is valid
        if (!Helpers.isValidUrl(url)) {
          return false;
        }

        // Check file extension strictly: only .jpg/.jpeg/.png
        const extension = Helpers.getFileExtension(url);
        if (!Helpers.isAllowedExtension(extension)) {
          return false;
        }

        // Enhanced filtering for shopping sites and quality
        const urlLower = url.toLowerCase();
        
        // Filter out common non-product image URLs
        const excludePatterns = [
          'logo', 'icon', 'banner', 'avatar', 'profile',
          'thumbnail', 'preview', 'sample', 'watermark',
          'advertisement', 'ad', 'button', 'social',
          'placeholder', 'loading', 'default',
          'category', 'brand', 'store', 'seller'
        ];

        for (const pattern of excludePatterns) {
          if (urlLower.includes(pattern)) {
            return false;
          }
        }

        // Prefer URLs that suggest higher quality images
        const qualityIndicators = [
          '_800x800', '_1200x1200', 'original', 'large',
          'hd', 'high', 'zoom', 'detail'
        ];

        // Check for quality indicators (bonus points but not required)
        let hasQualityIndicator = false;
        for (const indicator of qualityIndicators) {
          if (urlLower.includes(indicator)) {
            hasQualityIndicator = true;
            break;
          }
        }

        // Filter out images that are clearly too small based on URL
        const smallImagePatterns = [
          '_50x50', '_100x100', '_150x150', '_180x180',
          'thumb', 'small', 'mini', 'tiny'
        ];

        for (const pattern of smallImagePatterns) {
          if (urlLower.includes(pattern)) {
            return false;
          }
        }

        return true;
      } catch (error) {
        return false;
      }
    });
  }

  /**
   * Get image metadata without downloading
   * @param {string} url - Image URL
   * @returns {Promise<Object>} Image metadata
   */
  async getImageMetadata(url) {
    try {
      const response = await this.axiosInstance.head(url);
      
      const contentLength = parseInt(response.headers['content-length']) || 0;
      const contentType = response.headers['content-type'] || '';
      
      return {
        url,
        size: contentLength,
        contentType,
        isValid: contentType.startsWith('image/') && 
                contentLength >= config.quality.minFileSize &&
                contentLength <= config.quality.maxFileSize
      };
    } catch (error) {
      return {
        url,
        size: 0,
        contentType: '',
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Batch get metadata for multiple URLs
   * @param {Array} urls - Array of image URLs
   * @returns {Promise<Array>} Array of metadata objects
   */
  async batchGetMetadata(urls) {
    const metadataPromises = urls.map(url => 
      Helpers.retry(() => this.getImageMetadata(url))
    );
    
    const results = await Promise.allSettled(metadataPromises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          url: urls[index],
          size: 0,
          contentType: '',
          isValid: false,
          error: result.reason.message
        };
      }
    });
  }

  /**
   * Validate if image matches product name/description
   * @param {Buffer} imageBuffer - Image buffer
   * @param {Object} product - Product object
   * @returns {Promise<Object>} Matching validation result
   */
  async validateImageMatch(imageBuffer, product) {
    try {
      // Extract text keywords from product name and brand
      const productKeywords = this.extractProductKeywords(product);
      
      // Basic image analysis for product matching
      const matchingScore = await this.calculateImageProductMatch(imageBuffer, productKeywords);
      
      return {
        matchingScore,
        isValidMatch: matchingScore >= 0.7, // 70% threshold
        keywords: productKeywords,
        confidence: matchingScore
      };
    } catch (error) {
      Logger.warn('Image matching validation failed', { 
        itemId: product.itemid,
        error: error.message 
      });
      return {
        matchingScore: 0,
        isValidMatch: false,
        keywords: [],
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Extract relevant keywords from product information
   * @param {Object} product - Product object
   * @returns {Array} Array of keywords
   */
  extractProductKeywords(product) {
    const keywords = [];
    
    if (product.name) {
      // Extract meaningful words from product name
      const nameWords = product.name
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2)
        .filter(word => !['the', 'and', 'for', 'with', 'pack', 'set'].includes(word));
      
      keywords.push(...nameWords);
    }
    
    if (product.brand) {
      keywords.push(product.brand.toLowerCase());
    }
    
    // Extract size information
    const sizePatterns = /(\d+)(ml|l|g|kg|oz|lb|inch|cm|mm|ft)/gi;
    const name = product.name || '';
    const sizeMatches = name.match(sizePatterns);
    if (sizeMatches) {
      keywords.push(...sizeMatches.map(m => m.toLowerCase()));
    }
    
    // Extract color information
    const colorPatterns = /(black|white|red|blue|green|yellow|pink|purple|orange|brown|gray|grey|silver|gold)/gi;
    const colorMatches = name.match(colorPatterns);
    if (colorMatches) {
      keywords.push(...colorMatches.map(m => m.toLowerCase()));
    }
    
    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Calculate how well an image matches product keywords
   * @param {Buffer} imageBuffer - Image buffer
   * @param {Array} keywords - Product keywords
   * @returns {Promise<number>} Matching score (0-1)
   */
  async calculateImageProductMatch(imageBuffer, keywords) {
    try {
      // This is a simplified matching algorithm
      // In a production environment, you might use OCR or ML models
      
      let score = 0.5; // Base score
      
      // Analyze image characteristics that might indicate product match
      const metadata = await sharp(imageBuffer).metadata();
      
      // Size validation (square images are more likely to be product images)
      const aspectRatio = metadata.width / metadata.height;
      if (aspectRatio >= 0.8 && aspectRatio <= 1.25) {
        score += 0.2;
      }
      
      // Resolution check (higher resolution suggests product images)
      if (metadata.width >= 500 && metadata.height >= 500) {
        score += 0.1;
      }
      
      if (metadata.width >= 800 && metadata.height >= 800) {
        score += 0.1;
      }
      
      // Format preference (JPEG/PNG are better for products)
      if (['jpeg', 'jpg', 'png'].includes(metadata.format)) {
        score += 0.1;
      }
      
      return Math.min(1, score);
    } catch (error) {
      Logger.warn('Image-product matching calculation failed', { error: error.message });
      return 0.3; // Default low score
    }
  }

  /**
   * Check if image is duplicate
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<boolean>} True if duplicate
   */
  async isDuplicateImage(imageBuffer) {
    try {
      // Generate perceptual hash for the image
      const hash = await this.generateImageHash(imageBuffer);
      
      if (this.imageHashes.has(hash)) {
        return true;
      }
      
      // Check for similar hashes (hamming distance)
      for (const existingHash of this.imageHashes) {
        const similarity = this.calculateHashSimilarity(hash, existingHash);
        if (similarity > 0.9) { // 90% similar
          return true;
        }
      }
      
      this.imageHashes.add(hash);
      return false;
    } catch (error) {
      Logger.warn('Duplicate check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Generate perceptual hash for image
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<string>} Image hash
   */
  async generateImageHash(imageBuffer) {
    try {
      // Resize to 8x8 and convert to grayscale for perceptual hashing
      const { data } = await sharp(imageBuffer)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // Calculate average pixel value
      const avg = data.reduce((sum, pixel) => sum + pixel, 0) / data.length;
      
      // Generate hash based on pixels above/below average
      let hash = '';
      for (let i = 0; i < data.length; i++) {
        hash += data[i] > avg ? '1' : '0';
      }
      
      return hash;
    } catch (error) {
      Logger.warn('Hash generation failed', { error: error.message });
      return Math.random().toString(36); // Fallback to random string
    }
  }

  /**
   * Calculate similarity between two hashes
   * @param {string} hash1 - First hash
   * @param {string} hash2 - Second hash
   * @returns {number} Similarity score (0-1)
   */
  calculateHashSimilarity(hash1, hash2) {
    if (hash1.length !== hash2.length) {
      return 0;
    }
    
    let matches = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) {
        matches++;
      }
    }
    
    return matches / hash1.length;
  }

  /**
   * Analyze image for watermarks and text overlays
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<Object>} Watermark analysis result
   */
  async analyzeWatermark(imageBuffer) {
    try {
      // Basic watermark detection based on image analysis
      const metadata = await sharp(imageBuffer).metadata();
      
      // Convert to grayscale and analyze contrast patterns
      const { data } = await sharp(imageBuffer)
        .resize(Math.min(800, metadata.width), Math.min(800, metadata.height))
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // Look for patterns that might indicate watermarks
      const hasWatermark = this.detectWatermarkPatterns(data, Math.min(800, metadata.width));
      
      return {
        hasWatermark,
        confidence: hasWatermark ? 0.8 : 0.2
      };
    } catch (error) {
      Logger.warn('Watermark analysis failed', { error: error.message });
      return {
        hasWatermark: false,
        confidence: 0.5
      };
    }
  }

  /**
   * Detect watermark patterns in image data
   * @param {Buffer} data - Grayscale image data
   * @param {number} width - Image width
   * @returns {boolean} True if watermark patterns detected
   */
  detectWatermarkPatterns(data, width) {
    // This is a simplified watermark detection
    // Look for unusual contrast patterns that might indicate overlaid text
    
    const height = data.length / width;
    let edgeCount = 0;
    let totalPixels = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const current = data[idx];
        const neighbors = [
          data[idx - 1], data[idx + 1],
          data[idx - width], data[idx + width]
        ];
        
        // Calculate gradient
        const gradients = neighbors.map(n => Math.abs(current - n));
        const maxGradient = Math.max(...gradients);
        
        if (maxGradient > 50) { // High contrast edge
          edgeCount++;
        }
        totalPixels++;
      }
    }
    
    const edgeRatio = edgeCount / totalPixels;
    
    // If there are too many high-contrast edges, it might indicate watermarks/text
    return edgeRatio > 0.15;
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      Logger.info('Browser closed');
    }
    
    // Cleanup brand website scraper
    if (this.brandScraper) {
      await this.brandScraper.cleanup();
    }
    
    // Clear duplicate detection caches
    this.downloadedImages.clear();
    this.imageHashes.clear();
  }
}

module.exports = ImageSearch;
