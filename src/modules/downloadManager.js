/**
 * Download Manager Module for Product Image Search & Download System
 * Handles downloading images with quality validation and error handling
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const Logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const QualityAnalyzer = require('./qualityAnalyzer');
const ImageValidator = require('../utils/imageValidator');
const config = require('../config/settings');
const crypto = require('crypto');
const sharp = require('sharp');

/**
 * Download Manager class for handling image downloads
 */
class DownloadManager {
  /**
   * Create DownloadManager instance
   */
  constructor() {
    this.qualityAnalyzer = new QualityAnalyzer();
    this.imageValidator = new ImageValidator(Logger);
    this.axiosInstance = this.createAxiosInstance();
    this.downloadQueue = [];
    this.activeDownloads = 0;
    this.downloadedHashes = new Set(); // Track downloaded image hashes for duplicate detection
    this.itemImageCounts = new Map(); // Track images per item
    this.stats = {
      totalAttempted: 0,
      successful: 0,
      failed: 0,
      qualityRejected: 0,
      duplicatesSkipped: 0,
      lowMatchSkipped: 0
    };
  }

  /**
   * Create configured axios instance for downloads
   * @returns {Object} Axios instance
   */
  createAxiosInstance() {
    return axios.create({
      timeout: config.download.downloadTimeout,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': config.search.userAgent,
        // Prefer JPEG/PNG only
        'Accept': 'image/jpeg,image/png;q=0.9,*/*;q=0.1',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      }
    });
  }

  /**
   * Download images for a product
   * @param {Object} product - Product object
   * @param {Array} imageUrls - Array of image URLs to download
   * @param {string} outputDir - Output directory path
   * @returns {Promise<Object>} Download results
   */
  async downloadProductImages(product, imageUrls, outputDir) {
    try {
      Logger.info('Starting downloads for product', {
        itemId: product.itemid,
        totalUrls: imageUrls.length
      });

      // Reset duplicate detection for new product
      this.imageValidator.resetDuplicateDetection();

      // Ensure output directory exists
      await fs.ensureDir(outputDir);

      const downloadPromises = imageUrls.slice(0, config.search.maxImagesPerItem)
        .map((url, index) => this.downloadSingleImage(url, outputDir, product.itemid, index + 1));

  const results = await Promise.allSettled(downloadPromises);
      
      // Process results
      const downloadResult = {
        itemId: product.itemid,
        attempted: results.length,
        downloaded: 0,
        failed: 0,
        downloadedFiles: [],
        errors: [],
        validationResults: []
      };

      let validImageCount = 0;
      let totalConfidence = 0;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled' && result.value && result.value.success) {
          // Validate image-product match on the saved file
          const validation = await this.imageValidator.validateImageMatch(
            result.value.filePath,
            product.name,
            product.itemid
          );

          downloadResult.validationResults.push({
            filePath: result.value.filePath,
            confidence: validation.confidence,
            isMatch: validation.isMatch
          });

          validImageCount++;
          totalConfidence += validation.confidence;
          downloadResult.downloaded++;
          downloadResult.downloadedFiles.push(result.value.filePath);
        } else {
          downloadResult.failed++;
          downloadResult.errors.push({
            index: i + 1,
            error: result.reason?.message || 'Unknown error'
          });
        }
      }

      // Calculate average confidence
      const avgConfidence = validImageCount > 0 ? totalConfidence / validImageCount : 0;
  downloadResult.averageConfidence = avgConfidence;
  downloadResult.needsNSFolder = avgConfidence < 0.7;
  // expose for later folder rename step
  product.imageMatchingConfidence = avgConfidence;

      Logger.info('Product download completed', {
        ...downloadResult,
        averageConfidence: (avgConfidence * 100).toFixed(1) + '%'
      });
      
      return downloadResult;

    } catch (error) {
      Logger.error('Product image download failed', {
        itemId: product.itemid,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Download single image with queue management
   * @param {string} url - Image URL
   * @param {string} outputDir - Output directory
   * @param {string} itemId - Item ID for naming
   * @param {number} imageIndex - Image index for naming
   * @returns {Promise<Object>} Download result
   */
  async downloadImageWithQueue(url, outputDir, itemId, imageIndex) {
    return new Promise((resolve, reject) => {
      this.downloadQueue.push({
        url,
        outputDir,
        itemId,
        imageIndex,
        resolve,
        reject
      });
      
      this.processQueue();
    });
  }

  /**
   * Process download queue with concurrency control
   */
  async processQueue() {
    if (this.activeDownloads >= config.download.concurrentDownloads || this.downloadQueue.length === 0) {
      return;
    }

    const download = this.downloadQueue.shift();
    this.activeDownloads++;

    try {
      const result = await Helpers.retry(
        () => this.downloadSingleImage(download.url, download.outputDir, download.itemId, download.imageIndex),
        config.download.retryAttempts
      );
      download.resolve(result);
    } catch (error) {
      download.reject(error);
    } finally {
      this.activeDownloads--;
      // Process next item in queue
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Download single image with quality validation
   * @param {string} url - Image URL
   * @param {string} outputDir - Output directory
   * @param {string} itemId - Item ID for naming
   * @param {number} imageIndex - Image index for naming
   * @returns {Promise<Object>} Download result
   */
  async downloadSingleImage(url, outputDir, itemId, imageIndex) {
    try {
      Logger.info('Downloading image', { itemId, url, index: imageIndex });

      // Check if we already have enough images for this item (max 5)
      const currentCount = this.itemImageCounts.get(itemId) || 0;
      if (currentCount >= 5) {
        throw new Error('Maximum images per item reached (5)');
      }

      // Count attempted downloads
      this.stats.totalAttempted++;

      // Enforce allowed file extensions from URL (jpeg/jpg/png only). If URL has no extension, defer to MIME checks.
      let urlExt = '';
      try {
        const pathname = new URL(url).pathname;
        urlExt = path.extname(pathname).toLowerCase();
      } catch (e) {
        urlExt = path.extname(url).toLowerCase();
      }
      if (urlExt && !['.jpg', '.jpeg', '.png'].includes(urlExt)) {
        throw new Error(`Unsupported file extension in URL: ${urlExt}`);
      }

      // Pre-check content-type via HEAD and enforce jpeg/png only
      let contentType = '';
      try {
        const headResp = await this.axiosInstance.head(url);
        contentType = headResp.headers['content-type'] || '';
      } catch (e) {
        // If HEAD fails, proceed to GET but will validate after
      }

      if (contentType && !(contentType.startsWith('image/jpeg') || contentType.startsWith('image/png'))) {
        throw new Error(`Unsupported Content-Type: ${contentType}`);
      }

      // Download image data
      const response = await this.axiosInstance.get(url);
      let imageBuffer = Buffer.from(response.data);

      // Best-effort MIME validation from data (sharp metadata)
      let meta;
      try {
        meta = await sharp(imageBuffer).metadata();
        const fmt = (meta.format || '').toLowerCase();
        if (!['jpeg', 'jpg', 'png'].includes(fmt)) {
          throw new Error(`Unsupported MIME/format from data: ${meta.format}`);
        }
      } catch (e) {
        throw e;
      }

      // Generate perceptual hash for duplicate detection
      const imageHash = await this.generateImageHash(imageBuffer);
      if (this.downloadedHashes.has(imageHash)) {
        this.stats.duplicatesSkipped++;
        throw new Error('Duplicate image detected');
      }

      // Option 3: crop to square with attention focus before quality analysis
      try {
        // Pick a target size between 500 and 1200 based on the smaller side
        const minSide = Math.min(meta.width || 0, meta.height || 0);
        const targetSize = Math.max(500, Math.min(1200, minSide || 0));
        imageBuffer = await sharp(imageBuffer)
          .resize({ width: targetSize, height: targetSize, fit: sharp.fit.cover, position: sharp.strategy.attention })
          // Re-encode as high-quality JPEG to ensure allowed extensions
          .jpeg({ mozjpeg: true, quality: 90 })
          .toBuffer();
      } catch (e) {
        Logger.warn('Failed to preprocess image with square crop', { itemId, url, error: e.message });
      }

      // Enhanced image quality validation only (matching is done post-save)
      const qualityAnalysis = await this.qualityAnalyzer.analyzeImage(imageBuffer, url);
      
      if (!qualityAnalysis.isValid) {
        const issues = qualityAnalysis.issues.join(', ');
        this.stats.qualityRejected++;
        throw new Error(`Image quality validation failed: ${issues}`);
      }

      // Generate filename
      // Force final extension to .jpg since we re-encode to JPEG
      let extensionWithDot = '.jpg';
      const baseFilename = `${itemId}_${imageIndex}`;
      const filename = Helpers.generateUniqueFilename(baseFilename, extensionWithDot);
      const filePath = path.join(outputDir, filename);

      // Save image to disk
      await fs.writeFile(filePath, imageBuffer);

      // Verify file was written correctly
      const stats = await fs.stat(filePath);
      if (stats.size !== imageBuffer.length) {
        throw new Error('File size mismatch after writing');
      }

      // Track successful download
      this.downloadedHashes.add(imageHash);
      this.itemImageCounts.set(itemId, currentCount + 1);
      this.stats.successful++;

      return {
        success: true,
        filePath,
        url,
        fileSize: stats.size,
        qualityScore: qualityAnalysis.score,
        dimensions: qualityAnalysis.dimensions,
        backgroundConfidence: qualityAnalysis.backgroundConfidence,
        hasWatermark: qualityAnalysis.hasWatermark
      };
    } catch (error) {
      Logger.warn('Single image download failed', { itemId, url, error: error.message });
      this.stats.failed++;
      throw error;
    }
  }

  /**
   * Download images for multiple products in batch
   * @param {Array} products - Array of product objects with imageUrls
   * @param {string} baseOutputDir - Base output directory
   * @param {Function} progressCallback - Progress callback function
   * @returns {Promise<Array>} Array of download results
   */
  async downloadBatch(products, baseOutputDir, progressCallback = null) {
    try {
      Logger.info('Starting batch download', {
        totalProducts: products.length,
        baseOutputDir
      });

      const results = [];
      
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        
        try {
          // Create product-specific directory
          const productDir = path.join(baseOutputDir, Helpers.sanitizeFilename(product.itemid));
          
          // Download images for this product
          const downloadResult = await this.downloadProductImages(
            product,
            product.imageUrls || [],
            productDir
          );
          
          results.push(downloadResult);
          
          // Call progress callback if provided
          if (progressCallback) {
            progressCallback(i + 1, products.length, downloadResult);
          }
          
          Logger.progress('Batch download progress', i + 1, products.length);
          
          // Add delay between products to be respectful
          if (i < products.length - 1) {
            await Helpers.sleep(1000);
          }
        } catch (error) {
          Logger.error('Product download failed', {
            itemId: product.itemid,
            error
          });
          
          results.push({
            itemId: product.itemid,
            attempted: 0,
            downloaded: 0,
            failed: 1,
            errors: [{ error: error.message }]
          });
        }
      }

      Logger.success('Batch download completed', {
        totalProducts: products.length,
        stats: this.getStats()
      });

      return results;
    } catch (error) {
      Logger.error('Batch download process failed', error);
      throw error;
    }
  }

  /**
   * Get download statistics
   * @returns {Object} Download statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalAttempted > 0 ? 
        (this.stats.successful / this.stats.totalAttempted * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Generate perceptual hash for duplicate detection
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<string>} Image hash
   */
  async generateImageHash(imageBuffer) {
    try {
      // Create a perceptual hash of the image for duplicate detection
      const resized = await sharp(imageBuffer)
        .resize(8, 8, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer();
      
      return crypto.createHash('md5').update(resized).digest('hex');
    } catch (error) {
      Logger.warn('Failed to generate perceptual hash, using content hash', { error: error.message });
      return crypto.createHash('md5').update(imageBuffer).digest('hex');
    }
  }

  /**
   * Reset download statistics and session data
   */
  resetStats() {
    this.stats = {
      totalAttempted: 0,
      successful: 0,
      failed: 0,
      qualityRejected: 0,
      duplicatesSkipped: 0,
      lowMatchSkipped: 0
    };
    this.downloadedHashes.clear();
    this.itemImageCounts.clear();
    Logger.info('Download statistics and session data reset');
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    // Wait for all active downloads to complete
    while (this.activeDownloads > 0) {
      await Helpers.sleep(100);
    }
    
    this.qualityAnalyzer.clearCache();
    Logger.info('Download manager cleaned up');
  }
}

module.exports = DownloadManager;