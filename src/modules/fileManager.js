/**
 * File Manager Module for Product Image Search & Download System
 * Handles file system operations and folder organization
 */

const fs = require('fs-extra');
const path = require('path');
const Logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const config = require('../config/settings');
const XLSX = require('xlsx');

/**
 * File Manager class for handling file system operations
 */
class FileManager {
  /**
   * Create FileManager instance
   */
  constructor() {
    this.createdDirectories = new Set();
  }

  /**
   * Setup folder structure for products
   * @param {Array} products - Array of product objects
   * @param {string} baseOutputDir - Base output directory
   * @returns {Promise<Object>} Setup results
   */
  async setupFolderStructure(products, baseOutputDir) {
    try {
      Logger.info('Setting up folder structure', {
        totalProducts: products.length,
        baseDir: baseOutputDir
      });

      // Ensure base directory exists
      await fs.ensureDir(baseOutputDir);
      this.createdDirectories.add(baseOutputDir);

      const results = {
        totalFolders: 0,
        createdFolders: 0,
        errors: []
      };

      // Create individual product folders
      for (const product of products) {
        try {
          const folderName = this.generateFolderName(product);
          const folderPath = path.join(baseOutputDir, folderName);
          
          await fs.ensureDir(folderPath);
          this.createdDirectories.add(folderPath);
          
          results.totalFolders++;
          results.createdFolders++;
          
          // Store folder path in product object for later use
          product.folderPath = folderPath;
          product.folderName = folderName;
        } catch (error) {
          Logger.warn('Failed to create folder for product', {
            itemId: product.itemid,
            error: error.message
          });
          
          results.errors.push({
            itemId: product.itemid,
            error: error.message
          });
        }
      }

      Logger.success('Folder structure setup completed', {
        created: results.createdFolders,
        total: results.totalFolders,
        errors: results.errors.length
      });

      return results;
    } catch (error) {
      Logger.error('Failed to setup folder structure', error);
      throw error;
    }
  }

  /**
   * Generate folder name for a product
   * @param {Object} product - Product object
   * @param {boolean} isNotSure - Whether to add NS (Not Sure) suffix
   * @returns {string} Sanitized folder name
   */
  generateFolderName(product, isNotSure = false) {
    let folderName = product.itemid.toString();
    
    // Add NS suffix if confidence is below 70%
    if (isNotSure) {
      folderName += ' (NS)';
    }
    
    // Sanitize the folder name
    folderName = Helpers.sanitizeFilename(folderName);
    
    // Ensure it's not empty after sanitization
    if (!folderName || folderName.trim().length === 0) {
      folderName = `product_${Date.now()}`;
      if (isNotSure) {
        folderName += '_NS';
      }
    }
    
    return folderName;
  }

  /**
   * Handle "No Image Found" cases by creating NIF folders
   * @param {Array} products - Array of products with no images
   * @param {string} baseOutputDir - Base output directory
   * @returns {Promise<Object>} NIF handling results
   */
  async handleNoImageFound(products, baseOutputDir) {
    try {
      Logger.info('Handling No Image Found cases', {
        totalProducts: products.length
      });

      const results = {
        totalNIFProducts: products.length,
        createdNIFFolders: 0,
        errors: []
      };

      for (const product of products) {
        try {
          const baseFolderName = this.generateFolderName(product);
          const currentFolderPath = product.folderPath || path.join(baseOutputDir, baseFolderName);
          const nifFolderName = baseFolderName + config.fileSystem.nifSuffix;
          const nifFolderPath = path.join(baseOutputDir, nifFolderName);
          
          // Check if the original folder exists and rename it to NIF
          if (await fs.pathExists(currentFolderPath)) {
            await fs.move(currentFolderPath, nifFolderPath);
            Logger.info('Renamed existing folder to NIF', {
              itemId: product.itemid,
              from: baseFolderName,
              to: nifFolderName
            });
          } else {
            // If original folder doesn't exist, create the NIF folder
            await fs.ensureDir(nifFolderPath);
          }
          
          this.createdDirectories.add(nifFolderPath);
          
          // Create a readme file explaining the NIF status
          const readmeContent = this.generateNIFReadme(product);
          const readmePath = path.join(nifFolderPath, 'README.txt');
          await fs.writeFile(readmePath, readmeContent, 'utf8');
          
          results.createdNIFFolders++;
          
          // Update product object
          product.folderPath = nifFolderPath;
          product.folderName = nifFolderName;
          product.isNIF = true;
          
          Logger.info('Created NIF folder', {
            itemId: product.itemid,
            folderName: nifFolderName
          });
        } catch (error) {
          Logger.warn('Failed to create NIF folder', {
            itemId: product.itemid,
            error: error.message
          });
          
          results.errors.push({
            itemId: product.itemid,
            error: error.message
          });
        }
      }

      Logger.success('NIF handling completed', {
        created: results.createdNIFFolders,
        total: results.totalNIFProducts,
        errors: results.errors.length
      });

      return results;
    } catch (error) {
      Logger.error('Failed to handle NIF cases', error);
      throw error;
    }
  }

  /**
   * Generate README content for NIF folders
   * @param {Object} product - Product object
   * @returns {string} README content
   */
  generateNIFReadme(product) {
    const timestamp = new Date().toISOString();
    
    return `No Image Found (NIF) - ${product.itemid}

Product Details:
- Item ID: ${product.itemid}
- Name: ${product.name || 'N/A'}
- Brand: ${product.brand || 'N/A'}

Search Information:
- Search Date: ${timestamp}
- Search Queries Used: ${(product.searchQueries || []).join(', ')}
- Reason: No suitable images found that meet quality criteria

Quality Criteria Applied:
- Minimum Resolution: ${config.quality.minResolution.join('x')} pixels
- Preferred Aspect Ratio: ${config.quality.preferredAspectRatio.join(' - ')}
- Background: Plain/white background preferred
- File Formats: ${config.quality.allowedFormats.join(', ')}

This folder was created automatically by the Product Image Search & Download System.
`;
  }

  /**
   * Organize downloaded files by moving them to appropriate folders
   * @param {Array} downloadResults - Array of download result objects
   * @param {string} baseOutputDir - Base output directory
   * @returns {Promise<Object>} Organization results
   */
  async organizeDownloadedFiles(downloadResults, baseOutputDir) {
    try {
      Logger.info('Organizing downloaded files', {
        totalResults: downloadResults.length
      });

      const results = {
        totalFiles: 0,
        organizedFiles: 0,
        errors: []
      };

      for (const downloadResult of downloadResults) {
        if (downloadResult.downloadedFiles && downloadResult.downloadedFiles.length > 0) {
          for (const filePath of downloadResult.downloadedFiles) {
            try {
              results.totalFiles++;
              
              // Files should already be in the correct location
              // Just verify they exist
              if (await fs.pathExists(filePath)) {
                results.organizedFiles++;
              } else {
                throw new Error('Downloaded file not found');
              }
            } catch (error) {
              Logger.warn('File organization issue', {
                itemId: downloadResult.itemId,
                filePath,
                error: error.message
              });
              
              results.errors.push({
                itemId: downloadResult.itemId,
                filePath,
                error: error.message
              });
            }
          }
        }
      }

      Logger.success('File organization completed', {
        organized: results.organizedFiles,
        total: results.totalFiles,
        errors: results.errors.length
      });

      return results;
    } catch (error) {
      Logger.error('Failed to organize files', error);
      throw error;
    }
  }

  /**
   * Generate summary report of the entire process
   * @param {Array} products - Array of product objects
   * @param {Array} downloadResults - Array of download results
   * @param {string} outputDir - Output directory
   * @returns {Promise<string>} Path to summary report
   */
  async generateSummaryReport(products, downloadResults, outputDir) {
    try {
      Logger.info('Generating summary report');

      const timestamp = new Date().toISOString();
      const reportData = {
        generatedAt: timestamp,
        summary: this.calculateSummaryStats(products, downloadResults),
        productDetails: this.createProductSummary(products, downloadResults),
        configuration: this.getConfigurationSummary()
      };

      // Generate report content
      const reportContent = this.formatSummaryReport(reportData);
      
      // Write report to file
      const reportPath = path.join(outputDir, `summary_report_${Date.now()}.txt`);
      await fs.writeFile(reportPath, reportContent, 'utf8');

      // Also generate JSON report for programmatic access
      const jsonReportPath = path.join(outputDir, `summary_report_${Date.now()}.json`);
      await fs.writeJson(jsonReportPath, reportData, { spaces: 2 });

      // Also generate XLSX summary with required columns
      const xlsxPath = await this.generateSummaryXlsx(products, downloadResults, outputDir);

      Logger.success('Summary report generated', {
        textReport: reportPath,
        jsonReport: jsonReportPath,
        xlsxReport: xlsxPath
      });

      return reportPath;
    } catch (error) {
      Logger.error('Failed to generate summary report', error);
      throw error;
    }
  }

  /**
   * Generate XLSX summary (ID, NAME, BRAND, STATUS, COUNT)
   * STATUS: Image found | NIF | NS
   * COUNT: number of images downloaded
   * @param {Array} products
   * @param {Array} downloadResults
   * @param {string} outputDir
   * @returns {Promise<string>} path to XLSX file
   */
  async generateSummaryXlsx(products, downloadResults, outputDir) {
    try {
      const resultMap = new Map();
      (downloadResults || []).forEach(r => {
        resultMap.set(r.itemId, r);
      });

      const rows = [];
      // Header
      rows.push(['ID', 'NAME', 'BRAND', 'STATUS', 'COUNT']);

      for (const product of products) {
        const result = resultMap.get(product.itemid) || { downloaded: 0 };
        const count = result.downloaded || 0;
        let status = 'Image found';

        if (product.isNIF || count === 0) {
          status = 'NIF';
        } else if (product.isNS || ((product.imageMatchingConfidence || 0) > 0 && (product.imageMatchingConfidence || 0) < 0.7)) {
          status = 'NS';
        }

        rows.push([
          product.itemid,
          product.name || '',
          product.brand || '',
          status,
          count
        ]);
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Summary');

      const xlsxPath = path.join(outputDir, `summary_${Date.now()}.xlsx`);
      XLSX.writeFile(wb, xlsxPath);
      return xlsxPath;
    } catch (error) {
      Logger.warn('Failed to generate XLSX summary', { error: error.message });
      // Fail silently for XLSX, but return empty path
      return '';
    }
  }

  /**
   * Calculate summary statistics
   * @param {Array} products - Array of products
   * @param {Array} downloadResults - Array of download results
   * @returns {Object} Summary statistics
   */
  calculateSummaryStats(products, downloadResults) {
    const stats = {
      totalProducts: products.length,
      productsWithImages: 0,
      productsWithoutImages: 0,
      totalImagesDownloaded: 0,
      totalImagesFailed: 0,
      totalQualityRejected: 0,
      averageImagesPerProduct: 0,
      successRate: 0
    };

    downloadResults.forEach(result => {
      if (result.downloaded > 0) {
        stats.productsWithImages++;
      } else {
        stats.productsWithoutImages++;
      }
      
      stats.totalImagesDownloaded += result.downloaded || 0;
      stats.totalImagesFailed += result.failed || 0;
      stats.totalQualityRejected += result.qualityRejected || 0;
    });

    if (stats.productsWithImages > 0) {
      stats.averageImagesPerProduct = (stats.totalImagesDownloaded / stats.productsWithImages).toFixed(2);
    }

    const totalAttempted = stats.totalImagesDownloaded + stats.totalImagesFailed + stats.totalQualityRejected;
    if (totalAttempted > 0) {
      stats.successRate = ((stats.totalImagesDownloaded / totalAttempted) * 100).toFixed(2) + '%';
    }

    return stats;
  }

  /**
   * Create product summary
   * @param {Array} products - Array of products
   * @param {Array} downloadResults - Array of download results
   * @returns {Array} Product summary array
   */
  createProductSummary(products, downloadResults) {
    const resultMap = new Map();
    downloadResults.forEach(result => {
      resultMap.set(result.itemId, result);
    });

    return products.map(product => {
      const result = resultMap.get(product.itemid) || {};
      return {
        itemId: product.itemid,
        name: product.name,
        brand: product.brand,
        folderName: product.folderName,
        imagesDownloaded: result.downloaded || 0,
        imagesFailed: result.failed || 0,
        qualityRejected: result.qualityRejected || 0,
        isNIF: product.isNIF || false,
        searchQueries: product.searchQueries || []
      };
    });
  }

  /**
   * Get configuration summary
   * @returns {Object} Configuration summary
   */
  getConfigurationSummary() {
    return {
      searchEngines: config.search.engines,
      maxImagesPerItem: config.search.maxImagesPerItem,
      qualityCriteria: {
        minResolution: config.quality.minResolution,
        preferredAspectRatio: config.quality.preferredAspectRatio,
        allowedFormats: config.quality.allowedFormats,
        minFileSize: Helpers.formatBytes(config.quality.minFileSize),
        maxFileSize: Helpers.formatBytes(config.quality.maxFileSize)
      },
      downloadSettings: {
        concurrentDownloads: config.download.concurrentDownloads,
        retryAttempts: config.download.retryAttempts
      }
    };
  }

  /**
   * Format summary report as text
   * @param {Object} reportData - Report data object
   * @returns {string} Formatted report text
   */
  formatSummaryReport(reportData) {
    const { summary, productDetails, configuration } = reportData;
    
    let report = `PRODUCT IMAGE SEARCH & DOWNLOAD SYSTEM - SUMMARY REPORT
Generated: ${reportData.generatedAt}

OVERALL STATISTICS
==================
Total Products Processed: ${summary.totalProducts}
Products with Images: ${summary.productsWithImages}
Products without Images (NIF): ${summary.productsWithoutImages}
Total Images Downloaded: ${summary.totalImagesDownloaded}
Total Images Failed: ${summary.totalImagesFailed}
Total Images Rejected (Quality): ${summary.totalQualityRejected}
Average Images per Product: ${summary.averageImagesPerProduct}
Overall Success Rate: ${summary.successRate}

CONFIGURATION USED
==================
Search Engines: ${configuration.searchEngines.join(', ')}
Max Images per Item: ${configuration.maxImagesPerItem}
Minimum Resolution: ${configuration.qualityCriteria.minResolution.join('x')}
Allowed Formats: ${configuration.qualityCriteria.allowedFormats.join(', ')}
Concurrent Downloads: ${configuration.downloadSettings.concurrentDownloads}
Retry Attempts: ${configuration.downloadSettings.retryAttempts}

PRODUCT DETAILS
===============
`;

    productDetails.forEach(product => {
      report += `
Item ID: ${product.itemId}
Name: ${product.name}
Brand: ${product.brand}
Folder: ${product.folderName}
Images Downloaded: ${product.imagesDownloaded}
Images Failed: ${product.imagesFailed}
Quality Rejected: ${product.qualityRejected}
Status: ${product.isNIF ? 'No Image Found (NIF)' : 'Processed'}
Search Queries: ${product.searchQueries.join(' | ')}
`;
    });

    return report;
  }

  /**
   * Handle low confidence image matches by renaming folders to NS (Not Sure)
   * @param {Array} products - Array of products with low confidence matches
   * @param {string} baseOutputDir - Base output directory
   * @returns {Promise<Object>} NS handling results
   */
  async handleLowConfidenceMatches(products, baseOutputDir) {
    try {
      Logger.info('Handling low confidence image matches', {
        totalProducts: products.length
      });

      const results = {
        totalNSProducts: products.length,
        renamedNSFolders: 0,
        errors: []
      };

      for (const product of products) {
        try {
          const originalFolderName = this.generateFolderName(product, false);
          const nsFolderName = this.generateFolderName(product, true);
          const originalFolderPath = path.join(baseOutputDir, originalFolderName);
          const nsFolderPath = path.join(baseOutputDir, nsFolderName);
          
          // Check if the original folder exists and rename it to NS
          if (await fs.pathExists(originalFolderPath)) {
            await fs.move(originalFolderPath, nsFolderPath);
            Logger.info('Renamed folder to NS due to low confidence', {
              itemId: product.itemid,
              from: originalFolderName,
              to: nsFolderName,
              confidence: product.imageMatchingConfidence || 0
            });
          } else {
            // Create NS folder if original doesn't exist
            await fs.ensureDir(nsFolderPath);
          }
          
          this.createdDirectories.add(nsFolderPath);
          
          // Create a readme file explaining the NS status
          const readmeContent = this.generateNSReadme(product);
          const readmePath = path.join(nsFolderPath, 'README_NS.txt');
          await fs.writeFile(readmePath, readmeContent, 'utf8');
          
          results.renamedNSFolders++;
          
          // Update product object
          product.folderPath = nsFolderPath;
          product.folderName = nsFolderName;
          product.isNS = true;
          
        } catch (error) {
          Logger.warn('Failed to rename folder to NS', {
            itemId: product.itemid,
            error: error.message
          });
          
          results.errors.push({
            itemId: product.itemid,
            error: error.message
          });
        }
      }

      Logger.success('NS handling completed', {
        renamed: results.renamedNSFolders,
        total: results.totalNSProducts,
        errors: results.errors.length
      });

      return results;
    } catch (error) {
      Logger.error('Failed to handle low confidence matches', error);
      throw error;
    }
  }

  /**
   * Generate README content for NS (Not Sure) folders
   * @param {Object} product - Product object
   * @returns {string} README content
   */
  generateNSReadme(product) {
    const timestamp = new Date().toISOString();
    const confidence = product.imageMatchingConfidence || 0;
    
    return `Not Sure (NS) - Image Matching Confidence Below 70% - ${product.itemid}

Product Details:
- Item ID: ${product.itemid}
- Name: ${product.name || 'N/A'}
- Brand: ${product.brand || 'N/A'}

Image Matching Information:
- Analysis Date: ${timestamp}
- Image Matching Confidence: ${(confidence * 100).toFixed(1)}%
- Threshold Required: 70%
- Reason: Images found but matching confidence below threshold

The images in this folder may not accurately represent the specified product.
Manual verification is recommended before using these images.

Quality Criteria Applied:
- Pure White Background: Required
- Image Size: 500x500 to 1200x1200 pixels (square only)
- No Watermarks: Required
- Image-Product Match: Below 70% confidence

This folder was created automatically by the Product Image Search & Download System.
`;
  }

  /**
   * Clean up temporary files and directories
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      Logger.info('Starting file manager cleanup');
      
      // Clear the directory tracking set
      this.createdDirectories.clear();
      
      Logger.info('File manager cleanup completed');
    } catch (error) {
      Logger.error('File manager cleanup failed', error);
    }
  }
}

module.exports = FileManager;