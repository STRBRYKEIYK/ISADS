/**
 * Main Application for Product Image Search & Download System
 * Orchestrates the entire process from Excel reading to image downloading
 */

const { Command } = require('commander');
const path = require('path');
const fs = require('fs-extra');
const Logger = require('./utils/logger');
const config = require('./config/settings');

// Import modules
const ExcelReader = require('./modules/excelReader');
const ImageSearch = require('./modules/imageSearch');
const DownloadManager = require('./modules/downloadManager');
const FileManager = require('./modules/fileManager');

/**
 * Main Application class
 */
class ProductImageDownloader {
  /**
   * Create ProductImageDownloader instance
   */
  constructor() {
    this.excelReader = null;
    this.imageSearch = new ImageSearch();
    this.downloadManager = new DownloadManager();
    this.fileManager = new FileManager();
    this.startTime = null;
  }

  /**
   * Initialize and run the application
   * @param {Object} options - Command line options
   * @returns {Promise<void>}
   */
  async run(options) {
    this.startTime = Date.now();
    
    try {
      Logger.info('Product Image Search & Download System Started');
      Logger.info('Configuration loaded', {
        engines: config.search.engines,
        maxImages: config.search.maxImagesPerItem,
        outputDir: options.output
      });

      // Validate input file
      await this.validateInputFile(options.input);

      // Step 1: Read Excel file
      const products = await this.readExcelFile(options.input);
      Logger.info('Excel processing completed', { productCount: products.length });

      // Step 2: Setup folder structure
      await this.fileManager.setupFolderStructure(products, options.output);

      // Step 3: Search and download images
      const downloadResults = await this.processProducts(products, options.output);

      // Step 4: Handle products with no images found
      const nifProducts = products.filter(product => {
        const result = downloadResults.find(r => r.itemId === product.itemid);
        return !result || result.downloaded === 0;
      });

      if (nifProducts.length > 0) {
        await this.fileManager.handleNoImageFound(nifProducts, options.output);
      }

      // Step 5: Rename low-confidence folders to (NS)
      const lowConfidenceProducts = products.filter(p => (p.imageMatchingConfidence || 0) < 0.7 && (p.imageMatchingConfidence || 0) > 0);
      if (lowConfidenceProducts.length > 0) {
        await this.fileManager.handleLowConfidenceMatches(lowConfidenceProducts, options.output);
      }

      // Step 6: Generate summary report
      const reportPath = await this.fileManager.generateSummaryReport(
        products, 
        downloadResults, 
        options.output
      );

      // Final summary
  this.logFinalSummary(products, downloadResults, reportPath);

    } catch (error) {
      Logger.error('Application failed', error);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Validate input Excel file
   * @param {string} inputPath - Path to input Excel file
   * @returns {Promise<void>}
   */
  async validateInputFile(inputPath) {
    if (!inputPath) {
      throw new Error('Input Excel file path is required');
    }

    const absolutePath = path.resolve(inputPath);
    
    if (!await fs.pathExists(absolutePath)) {
      throw new Error(`Input Excel file not found: ${absolutePath}`);
    }

    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new Error(`Input path is not a file: ${absolutePath}`);
    }

    Logger.info('Input file validated', { path: absolutePath, size: stats.size });
  }

  /**
   * Read and parse Excel file
   * @param {string} inputPath - Path to Excel file
   * @returns {Promise<Array>} Array of product objects
   */
  async readExcelFile(inputPath) {
    try {
      this.excelReader = new ExcelReader(path.resolve(inputPath));
      const products = await this.excelReader.readFile();
      
      if (products.length === 0) {
        throw new Error('No valid products found in Excel file');
      }

      // Log summary
      const summary = this.excelReader.getSummary();
      Logger.info('Excel file summary', summary);

      return products;
    } catch (error) {
      Logger.error('Failed to read Excel file', error);
      throw error;
    }
  }

  /**
   * Process all products - search and download images
   * @param {Array} products - Array of product objects
   * @param {string} outputDir - Output directory
   * @returns {Promise<Array>} Array of download results
   */
  async processProducts(products, outputDir) {
    try {
      Logger.info('Starting product processing', { 
        totalProducts: products.length 
      });

      const downloadResults = [];
      let processedCount = 0;

      // Process products in batches to manage memory
      const batchSize = 10;
      
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        
        Logger.info('Processing batch', { 
          batch: Math.floor(i / batchSize) + 1,
          start: i + 1,
          end: Math.min(i + batchSize, products.length),
          total: products.length
        });

        const batchResults = await this.processBatch(batch, outputDir);
        downloadResults.push(...batchResults);
        
        processedCount += batch.length;
        Logger.progress('Overall progress', processedCount, products.length);
      }

      Logger.success('All products processed', {
        total: products.length,
        results: downloadResults.length
      });

      return downloadResults;
    } catch (error) {
      Logger.error('Product processing failed', error);
      throw error;
    }
  }

  /**
   * Process a batch of products
   * @param {Array} products - Batch of products to process
   * @param {string} outputDir - Output directory
   * @returns {Promise<Array>} Array of download results for the batch
   */
  async processBatch(products, outputDir) {
    const batchResults = [];

    for (const product of products) {
      try {
        Logger.info('Processing product', {
          itemId: product.itemid,
          name: product.name,
          brand: product.brand
        });

        // Search for images
        const imageUrls = await this.imageSearch.searchImages(product);
        
        if (imageUrls.length === 0) {
          Logger.warn('No images found for product', {
            itemId: product.itemid
          });
          
          batchResults.push({
            itemId: product.itemid,
            attempted: 0,
            downloaded: 0,
            failed: 0,
            downloadedFiles: [],
            errors: ['No images found']
          });
          continue;
        }

        // Store URLs in product for potential reuse
        product.imageUrls = imageUrls;

        // Download images
        const productDir = path.join(outputDir, product.folderName || product.itemid);
        const downloadResult = await this.downloadManager.downloadProductImages(
          product,
          imageUrls,
          productDir
        );

        batchResults.push(downloadResult);

      } catch (error) {
        Logger.error('Product processing failed', {
          itemId: product.itemid,
          error
        });

        batchResults.push({
          itemId: product.itemid,
          attempted: 0,
          downloaded: 0,
          failed: 1,
          downloadedFiles: [],
          errors: [error.message]
        });
      }
    }

    return batchResults;
  }

  /**
   * Log final summary of the entire process
   * @param {Array} products - Array of products
   * @param {Array} downloadResults - Array of download results
   * @param {string} reportPath - Path to generated report
   */
  logFinalSummary(products, downloadResults, reportPath) {
    const endTime = Date.now();
    const duration = Math.round((endTime - this.startTime) / 1000);
    
    const totalImages = downloadResults.reduce((sum, r) => sum + (r.downloaded || 0), 0);
    const totalFailed = downloadResults.reduce((sum, r) => sum + (r.failed || 0), 0);
    const productsWithImages = downloadResults.filter(r => r.downloaded > 0).length;
    
    Logger.success('='.repeat(60));
    Logger.success('PRODUCT IMAGE DOWNLOAD SYSTEM - COMPLETED');
    Logger.success('='.repeat(60));
    Logger.success('Processing Statistics:', {
      'Total Products': products.length,
      'Products with Images': productsWithImages,
      'Products without Images': products.length - productsWithImages,
      'Total Images Downloaded': totalImages,
      'Total Images Failed': totalFailed,
      'Processing Time': `${duration} seconds`,
      'Report Generated': reportPath
    });
    Logger.success('='.repeat(60));
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    try {
      Logger.info('Cleaning up resources');
      
      await Promise.all([
        this.imageSearch.cleanup(),
        this.downloadManager.cleanup(),
        this.fileManager.cleanup()
      ]);
      
      Logger.info('Cleanup completed successfully');
    } catch (error) {
      Logger.error('Cleanup failed', error);
    }
  }
}

/**
 * Setup command line interface
 */
function setupCLI() {
  const program = new Command();
  
  program
    .name('product-image-downloader')
    .description('Automated system for downloading product images from Excel data')
    .version('1.0.0');

  program
    .option('-i, --input <path>', 'Input Excel file path', 'products.xlsx')
    .option('-o, --output <path>', 'Output directory path', 'Item Images')
    .option('-c, --config <path>', 'Custom configuration file path')
    .option('--dry-run', 'Run without downloading images (validation only)')
    .option('--verbose', 'Enable verbose logging')
    .option('--max-products <number>', 'Maximum number of products to process')
    .option('--engines <list>', 'Comma-separated list of search engines to use (bing,google,shopee,lazada,ebay,shopping,amazon,hardware)');

  program.parse(process.argv);
  return program.opts();
}

/**
 * Main entry point
 */
async function main() {
  try {
    const options = setupCLI();
    
    // Set log level based on verbose flag
    if (options.verbose) {
      config.logging.level = 'debug';
    }

    // Load custom configuration if provided
    if (options.config) {
      const customConfig = require(path.resolve(options.config));
      Object.assign(config, customConfig);
      Logger.info('Custom configuration loaded', { configFile: options.config });
    }

    // Override search engines from CLI if provided
    if (options.engines) {
      const allowed = new Set(['bing', 'google', 'shopee', 'lazada', 'ebay', 'shopping']);
      const list = options.engines
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(e => allowed.has(e));
      if (list.length > 0) {
        config.search.engines = list;
        Logger.info('Search engines overridden from CLI', { engines: list });
      } else {
        Logger.warn('No valid engines provided to --engines; using defaults', { provided: options.engines });
      }
    }

    // Create and run the application
    const app = new ProductImageDownloader();
    await app.run(options);
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the application if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = ProductImageDownloader;