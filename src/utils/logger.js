/**
 * Logger utility for the Product Image Search & Download System
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');
const config = require('../config/settings');

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.logFile);
fs.ensureDirSync(logsDir);

/**
 * Custom log format
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
  })
);

/**
 * Create and configure Winston logger
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // File transport
    new winston.transports.File({
      filename: config.logging.logFile,
      maxsize: config.logging.maxLogSize,
      maxFiles: config.logging.maxLogFiles
    })
  ]
});

/**
 * Enhanced logging methods with context
 */
class Logger {
  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  static info(message, context = {}) {
    logger.info(this.formatMessage(message, context));
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  static warn(message, context = {}) {
    logger.warn(this.formatMessage(message, context));
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Error|Object} error - Error object or context
   */
  static error(message, error = {}) {
    if (error instanceof Error) {
      logger.error(message, error);
    } else {
      logger.error(this.formatMessage(message, error));
    }
  }

  /**
   * Log success message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  static success(message, context = {}) {
    logger.info(`✓ ${this.formatMessage(message, context)}`);
  }

  /**
   * Log progress message
   * @param {string} message - Log message
   * @param {number} current - Current progress
   * @param {number} total - Total items
   */
  static progress(message, current, total) {
    const percentage = Math.round((current / total) * 100);
    logger.info(`[${percentage}%] ${message} (${current}/${total})`);
  }

  /**
   * Format message with context
   * @param {string} message - Base message
   * @param {Object} context - Additional context
   * @returns {string} Formatted message
   */
  static formatMessage(message, context) {
    if (Object.keys(context).length === 0) {
      return message;
    }
    
    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    
    return `${message} | ${contextStr}`;
  }
}

module.exports = Logger;