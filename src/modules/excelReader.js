/**
 * Excel Reader Module for Product Image Search & Download System
 * Handles reading and parsing Excel files containing product data
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs-extra');
const Logger = require('../utils/logger');
const config = require('../config/settings');

/**
 * Excel Reader class for processing product data
 */
class ExcelReader {
  /**
   * Create ExcelReader instance
   * @param {string} filePath - Path to Excel file
   */
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = null;
    this.worksheet = null;
    this.products = [];
  }

  /**
   * Read and parse Excel file
   * @returns {Promise<Array>} Array of product objects
   */
  async readFile() {
    try {
      Logger.info('Starting Excel file processing', { file: this.filePath });
      
      // Check if file exists
      if (!await fs.pathExists(this.filePath)) {
        throw new Error(`Excel file not found: ${this.filePath}`);
      }

      // Read the workbook
      this.workbook = XLSX.readFile(this.filePath);
      
      // Get the first worksheet
      const sheetNames = this.workbook.SheetNames;
      if (sheetNames.length === 0) {
        throw new Error('No worksheets found in Excel file');
      }

      this.worksheet = this.workbook.Sheets[sheetNames[0]];
      Logger.info('Excel file loaded successfully', { 
        sheets: sheetNames.length,
        activeSheet: sheetNames[0]
      });

      // Parse the data
      this.products = await this.parseData();
      
      Logger.success('Excel parsing completed', { 
        totalProducts: this.products.length 
      });
      
      return this.products;
    } catch (error) {
      Logger.error('Failed to read Excel file', error);
      throw error;
    }
  }

  /**
   * Parse worksheet data into product objects
   * @returns {Promise<Array>} Array of parsed product objects
   */
  async parseData() {
    try {
      // Convert worksheet to JSON
      const jsonData = XLSX.utils.sheet_to_json(this.worksheet, {
        header: 1, // Use array of arrays format
        defval: '' // Default value for empty cells
      });

      if (jsonData.length === 0) {
        throw new Error('Excel file is empty');
      }

      // Get headers from first row
      const headers = jsonData[0];
      Logger.info('Excel headers found', { headers: headers.join(', ') });

      // Validate required columns
      const columnMap = this.validateAndMapColumns(headers);
      
      // Process data rows
      const products = [];
      const maxRows = Math.min(jsonData.length, config.excel.maxRowsToProcess + 1);
      
      for (let i = 1; i < maxRows; i++) {
        const row = jsonData[i];
        const product = this.parseProductRow(row, columnMap, i + 1);
        
        if (product) {
          products.push(product);
        }
      }

      Logger.info('Product data parsed', { 
        totalRows: jsonData.length - 1,
        validProducts: products.length 
      });

      return products;
    } catch (error) {
      Logger.error('Failed to parse Excel data', error);
      throw error;
    }
  }

  /**
   * Validate required columns exist and create column mapping
   * @param {Array} headers - Array of header strings
   * @returns {Object} Column mapping object
   */
  validateAndMapColumns(headers) {
    const columnMap = {};
    const requiredColumns = config.excel.expectedColumns;
    
    // Create case-insensitive mapping
    for (const required of requiredColumns) {
      const index = headers.findIndex(header => 
        header && header.toString().toLowerCase().trim() === required.toLowerCase()
      );
      
      if (index === -1) {
        // Try alternative column names
        const alternatives = this.getAlternativeColumnNames(required);
        let found = false;
        
        for (const alt of alternatives) {
          const altIndex = headers.findIndex(header => 
            header && header.toString().toLowerCase().trim() === alt.toLowerCase()
          );
          if (altIndex !== -1) {
            columnMap[required] = altIndex;
            found = true;
            break;
          }
        }
        
        if (!found) {
          throw new Error(`Required column '${required}' not found in Excel file. Available columns: ${headers.join(', ')}`);
        }
      } else {
        columnMap[required] = index;
      }
    }

    Logger.info('Column mapping created', columnMap);
    return columnMap;
  }

  /**
   * Get alternative column names for flexible matching
   * @param {string} columnName - Standard column name
   * @returns {Array} Array of alternative names
   */
  getAlternativeColumnNames(columnName) {
    const alternatives = {
      'Item ID': ['ItemID', 'Item_ID', 'ID', 'Product ID', 'ProductID', 'SKU'],
      'Name': ['Product Name', 'ProductName', 'Product_Name', 'Title', 'Description'],
      'Brand': ['Manufacturer', 'Make', 'Company', 'Vendor', 'Supplier']
    };

    return alternatives[columnName] || [];
  }

  /**
   * Parse a single product row
   * @param {Array} row - Row data array
   * @param {Object} columnMap - Column mapping
   * @param {number} rowNumber - Row number for logging
   * @returns {Object|null} Product object or null if invalid
   */
  parseProductRow(row, columnMap, rowNumber) {
    try {
      const product = {};

      // Extract required fields
      for (const [columnName, columnIndex] of Object.entries(columnMap)) {
        const value = row[columnIndex];
        product[columnName.toLowerCase().replace(' ', '')] = 
          value ? value.toString().trim() : '';
      }

      // Validate essential fields
      if (!product.itemid || !product.name) {
        Logger.warn('Skipping row with missing essential data', { 
          row: rowNumber,
          itemId: product.itemid,
          name: product.name 
        });
        return null;
      }

      // Add metadata
      product.rowNumber = rowNumber;
      product.searchQueries = [];
      product.downloadedImages = [];
      product.errors = [];

      return product;
    } catch (error) {
      Logger.warn('Error parsing product row', { 
        row: rowNumber,
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Get summary statistics of parsed data
   * @returns {Object} Summary statistics
   */
  getSummary() {
    const summary = {
      totalProducts: this.products.length,
      withBrand: this.products.filter(p => p.brand && p.brand.length > 0).length,
      withoutBrand: this.products.filter(p => !p.brand || p.brand.length === 0).length,
      uniqueBrands: [...new Set(this.products.map(p => p.brand).filter(Boolean))].length
    };

    return summary;
  }

  /**
   * Export products to JSON for debugging
   * @param {string} outputPath - Output file path
   */
  async exportToJson(outputPath) {
    try {
      const data = {
        metadata: {
          sourceFile: this.filePath,
          exportDate: new Date().toISOString(),
          summary: this.getSummary()
        },
        products: this.products
      };

      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeJson(outputPath, data, { spaces: 2 });
      
      Logger.info('Products exported to JSON', { file: outputPath });
    } catch (error) {
      Logger.error('Failed to export products to JSON', error);
      throw error;
    }
  }
}

module.exports = ExcelReader;