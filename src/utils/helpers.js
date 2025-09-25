/**
 * Helper utilities for the Product Image Search & Download System
 */

const path = require('path');
const crypto = require('crypto');
const config = require('../config/settings');

/**
 * Collection of utility functions
 */
class Helpers {
  /**
   * Sanitize filename for safe file system usage
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   */
  static sanitizeFilename(filename) {
    // Remove or replace invalid characters
    const sanitized = filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Ensure it's not too long
    if (sanitized.length > config.fileSystem.maxFolderNameLength) {
      return sanitized.substring(0, config.fileSystem.maxFolderNameLength);
    }
    
    return sanitized;
  }

  /**
   * Generate search query variations for a product
   * @param {Object} product - Product data
   * @returns {Array<string>} Array of search queries
   */
  static generateSearchQueries(product) {
    const queries = [];
    const { name, brand } = product;
    
    if (name && brand) {
      // SPEED OPTIMIZED: Only most effective search patterns
      queries.push(`"${name}" "${brand}"`); // Most precise search only
      queries.push(`${name} ${brand}`); // Basic fallback only
    } else if (name) {
      queries.push(`"${name}"`); // Single precise search
    }
    
    return queries;
  }

  /**
   * Extract product type from product name
   * @param {string} name - Product name
   * @returns {string|null} Extracted product type
   */
  static extractProductType(name) {
    const commonTypes = [
      'cutting tip', 'welding rod', 'electrode', 'torch', 'regulator',
      'hose', 'fitting', 'valve', 'gauge', 'nozzle', 'tip', 'rod'
    ];
    
    const nameLower = name.toLowerCase();
    for (const type of commonTypes) {
      if (nameLower.includes(type)) {
        return type;
      }
    }
    
    return null;
  }

  /**
   * Get file extension from URL or filename
   * @param {string} url - URL or filename
   * @returns {string} File extension
   */
  static getFileExtension(url) {
    try {
      const pathname = new URL(url).pathname;
      const extension = path.extname(pathname).toLowerCase();
      return extension || '.jpg'; // Default to .jpg
    } catch {
      // If URL parsing fails, try extracting from string
      const extension = path.extname(url).toLowerCase();
      return extension || '.jpg';
    }
  }

  /**
   * Check if file extension is allowed
   * @param {string} extension - File extension
   * @returns {boolean} Whether extension is allowed
   */
  static isAllowedExtension(extension) {
    const normalizedExt = extension.toLowerCase().replace('.', '');
    return config.quality.allowedFormats.includes(normalizedExt);
  }

  /**
   * Generate unique filename to avoid conflicts
   * @param {string} baseFilename - Base filename
   * @param {string} extension - File extension
   * @returns {string} Unique filename
   */
  static generateUniqueFilename(baseFilename, extension) {
    const timestamp = Date.now();
    const hash = crypto.createHash('md5')
      .update(`${baseFilename}_${timestamp}`)
      .digest('hex')
      .substring(0, 8);
    
    return `${baseFilename}_${hash}${extension}`;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after sleep
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {number} maxRetries - Maximum retry attempts
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {Promise} Promise that resolves with function result
   */
  static async retry(fn, maxRetries = config.download.retryAttempts, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(config.download.backoffMultiplier, attempt - 1);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Calculate aspect ratio from dimensions
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {number} Aspect ratio
   */
  static calculateAspectRatio(width, height) {
    return width / height;
  }

  /**
   * Check if aspect ratio is within preferred range
   * @param {number} aspectRatio - Calculated aspect ratio
   * @returns {boolean} Whether aspect ratio is acceptable
   */
  static isPreferredAspectRatio(aspectRatio) {
    const [min, max] = config.quality.preferredAspectRatio;
    return aspectRatio >= min && aspectRatio <= max;
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted size string
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean} Whether URL is valid
   */
  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = Helpers;