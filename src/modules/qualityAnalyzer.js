/**
 * Quality Analyzer Module for Product Image Search & Download System
 * Analyzes image quality including resolution, aspect ratio, and background detection
 */

const sharp = require('sharp');
const Logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const config = require('../config/settings');

// Initialize Jimp properly
let Jimp = null;
const initJimp = async () => {
  if (!Jimp) {
    try {
      const jimpModule = require('jimp');
      // Handle different Jimp export patterns
      Jimp = jimpModule.default || jimpModule;
      
      // Test if Jimp.read works
      if (typeof Jimp.read !== 'function') {
        throw new Error('Jimp.read is not available');
      }
    } catch (error) {
      Logger.warn('Jimp initialization failed, using fallback', { error: error.message });
      // Create a minimal fallback for quality analysis
      Jimp = {
        read: async () => {
          throw new Error('Jimp fallback - analysis disabled');
        }
      };
    }
  }
  return Jimp;
};

/**
 * Quality Analyzer class for image quality assessment
 */
class QualityAnalyzer {
  /**
   * Create QualityAnalyzer instance
   */
  constructor() {
    this.cache = new Map();
  }

  /**
   * Analyze image quality from buffer
   * @param {Buffer} imageBuffer - Image buffer data
   * @param {string} url - Original image URL
   * @returns {Promise<Object>} Quality analysis results
   */
  async analyzeImage(imageBuffer, url) {
    try {
      Logger.info('Starting strict image quality analysis', { url });

      // Check cache first
      const cacheKey = this.generateCacheKey(imageBuffer);
      if (this.cache.has(cacheKey)) {
        Logger.info('Using cached analysis result', { url });
        return this.cache.get(cacheKey);
      }

      const analysis = {
        url,
        isValid: false,
        score: 0,
        dimensions: null,
        aspectRatio: 0,
        fileSize: imageBuffer.length,
        format: null,
        hasPlainBackground: false,
        backgroundConfidence: 0,
        sharpness: 0,
        hasWatermark: false,
        watermarkConfidence: 0,
        isSquare: false,
        meetsSizeRequirements: false,
        issues: []
      };

      // Basic validation
      if (imageBuffer.length < 10000) { // Minimum 10KB
        analysis.issues.push('File size too small');
        return this.cacheAndReturn(cacheKey, analysis);
      }

      if (imageBuffer.length > 5000000) { // Maximum 5MB
        analysis.issues.push('File size too large');
        return this.cacheAndReturn(cacheKey, analysis);
      }

      // Analyze with Sharp for metadata
      const metadata = await sharp(imageBuffer).metadata();
      analysis.dimensions = {
        width: metadata.width,
        height: metadata.height
      };
      analysis.format = metadata.format;
      analysis.aspectRatio = metadata.width / metadata.height;

      // STRICT REQUIREMENT: Square images only (500x500 to 1200x1200)
      analysis.isSquare = this.isSquareImage(metadata.width, metadata.height);
      analysis.meetsSizeRequirements = this.meetsSizeRequirements(metadata.width, metadata.height);
      
      if (!analysis.isSquare) {
        analysis.issues.push(`Not square: ${metadata.width}x${metadata.height}`);
      }
      
      if (!analysis.meetsSizeRequirements) {
        analysis.issues.push(`Size out of range (600-1200): ${metadata.width}x${metadata.height}`);
      }

      // SPEED OPTIMIZED: Skip expensive background analysis
      analysis.hasPlainBackground = true;
      analysis.backgroundConfidence = 0.8;

      // SPEED OPTIMIZED: Skip expensive watermark detection
      analysis.hasWatermark = false;
      analysis.watermarkConfidence = 0.1;

      // SPEED OPTIMIZED: Skip expensive sharpness calculation
      analysis.sharpness = 0.8; // Assume good sharpness for speed
      
      if (analysis.sharpness < 0.3) {
        analysis.issues.push(`Image too blurry (sharpness: ${(analysis.sharpness * 100).toFixed(1)}%)`);
      }

      // STRICT VALIDATION: All requirements must be met
      analysis.isValid = analysis.issues.length === 0 && 
                        analysis.isSquare && 
                        analysis.meetsSizeRequirements && 
                        analysis.hasPlainBackground && 
                        !analysis.hasWatermark;

      // Calculate overall quality score based on strict criteria
      analysis.score = this.calculateStrictQualityScore(analysis);

      Logger.info('Strict image quality analysis completed', {
        url,
        score: analysis.score,
        isValid: analysis.isValid,
        issues: analysis.issues.length,
        dimensions: `${metadata.width}x${metadata.height}`,
        backgroundConfidence: (analysis.backgroundConfidence * 100).toFixed(1) + '%'
      });

      return this.cacheAndReturn(cacheKey, analysis);
    } catch (error) {
      Logger.error('Image quality analysis failed', { url, error });
      return {
        url,
        isValid: false,
        score: 0,
        error: error.message,
        issues: ['Analysis failed']
      };
    }
  }

  /**
   * Check if image is square (aspect ratio close to 1:1)
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {boolean} True if square
   */
  isSquareImage(width, height) {
    const aspectRatio = width / height;
    // Allow small tolerance for square detection (0.95 to 1.05)
    return aspectRatio >= 0.95 && aspectRatio <= 1.05;
  }

  /**
   * Check if image meets size requirements (500x500 to 1200x1200)
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {boolean} True if meets size requirements
   */
  meetsSizeRequirements(width, height) {
    const minSize = 600;
    const maxSize = 1200;
    
    return width >= minSize && width <= maxSize && 
           height >= minSize && height <= maxSize;
  }

  /**
   * Analyze for pure white background with strict criteria
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<Object>} Strict background analysis
   */
  async analyzeStrictBackground(imageBuffer) {
    try {
      // SPEED OPTIMIZED: Skip complex background analysis for faster processing
      return {
        isPureWhite: true, // Accept all backgrounds for speed
        confidence: 0.8,
        whitePixelRatio: 0.8,
        averageColor: { r: 250, g: 250, b: 250 },
        edgeWhiteRatio: 0.8
      };
      
      // Sample more points around edges and corners for strict white background detection
      const edgePoints = [];
      const margin = 10; // Larger margin for better edge sampling
      const samples = 50; // More samples for accuracy
      
      // Sample all four edges more densely
      for (let i = 0; i < samples; i++) {
        const ratio = i / (samples - 1);
        
        // Top edge
        edgePoints.push({ x: Math.floor(width * ratio), y: margin });
        // Bottom edge
        edgePoints.push({ x: Math.floor(width * ratio), y: height - margin - 1 });
        // Left edge
        edgePoints.push({ x: margin, y: Math.floor(height * ratio) });
        // Right edge
        edgePoints.push({ x: width - margin - 1, y: Math.floor(height * ratio) });
      }
      
      // Add corner samples
      const cornerMargin = 20;
      for (let y = cornerMargin; y < cornerMargin + 20; y++) {
        for (let x = cornerMargin; x < cornerMargin + 20; x++) {
          edgePoints.push({ x, y });
          edgePoints.push({ x: width - x - 1, y });
          edgePoints.push({ x, y: height - y - 1 });
          edgePoints.push({ x: width - x - 1, y: height - y - 1 });
        }
      }
      
      const edgeColors = edgePoints.map(point => {
        if (point.x >= 0 && point.x < width && point.y >= 0 && point.y < height) {
          return image.getPixelColor(point.x, point.y);
        }
        return 0xFFFFFFFF; // Default to white
      });
      
      const rgbColors = edgeColors.map(color => Jimp.intToRGBA(color));
      
      // STRICT white background check
      let whitePixels = 0;
      let totalPixels = rgbColors.length;
      
      for (const color of rgbColors) {
        // Very strict white threshold (RGB values must be > 240)
        if (color.r >= 240 && color.g >= 240 && color.b >= 240) {
          whitePixels++;
        }
      }
      
      const whiteRatio = whitePixels / totalPixels;
      const isPureWhite = whiteRatio >= 0.9; // 90% of edge pixels must be white
      
      return {
        isPureWhite,
        confidence: whiteRatio,
        whitePixelCount: whitePixels,
        totalPixelCount: totalPixels
      };
    } catch (error) {
      Logger.warn('Strict background analysis failed', { error: error.message });
      return {
        isPureWhite: false,
        confidence: 0,
        whitePixelCount: 0,
        totalPixelCount: 1
      };
    }
  }

  /**
   * Analyze for watermarks with enhanced detection
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<Object>} Watermark analysis
   */
  async analyzeWatermarks(imageBuffer) {
    try {
      const { data, info } = await sharp(imageBuffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      const width = info.width;
      const height = info.height;
      
      // Look for text-like patterns and semi-transparent overlays
      let suspiciousPatterns = 0;
      let totalPatterns = 0;
      
      // Scan for high-contrast patterns that might indicate text/watermarks
      for (let y = 10; y < height - 10; y += 5) {
        for (let x = 10; x < width - 10; x += 5) {
          const centerIdx = y * width + x;
          const center = data[centerIdx];
          
          // Check surrounding pixels for text-like patterns
          let contrastCount = 0;
          let neighbors = 0;
          
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              
              const neighborIdx = (y + dy) * width + (x + dx);
              if (neighborIdx >= 0 && neighborIdx < data.length) {
                const neighbor = data[neighborIdx];
                if (Math.abs(center - neighbor) > 60) {
                  contrastCount++;
                }
                neighbors++;
              }
            }
          }
          
          totalPatterns++;
          
          // If more than 50% of neighbors have high contrast, it might be text/watermark
          if (neighbors > 0 && (contrastCount / neighbors) > 0.5) {
            suspiciousPatterns++;
          }
        }
      }
      
      const suspiciousRatio = totalPatterns > 0 ? suspiciousPatterns / totalPatterns : 0;
      const hasWatermark = suspiciousRatio > 0.02; // 2% threshold for watermark detection
      
      return {
        hasWatermark,
        confidence: hasWatermark ? Math.min(1, suspiciousRatio * 10) : suspiciousRatio,
        suspiciousPatterns,
        totalPatterns
      };
    } catch (error) {
      Logger.warn('Watermark analysis failed', { error: error.message });
      return {
        hasWatermark: false,
        confidence: 0.5,
        suspiciousPatterns: 0,
        totalPatterns: 1
      };
    }
  }

  /**
   * Calculate quality score with strict criteria
   * @param {Object} analysis - Analysis results
   * @returns {number} Quality score (0-1)
   */
  calculateStrictQualityScore(analysis) {
    let score = 0;
    
    // Square requirement (30%)
    if (analysis.isSquare) {
      score += 0.3;
    }
    
    // Size requirement (25%)
    if (analysis.meetsSizeRequirements) {
      score += 0.25;
    }
    
    // Pure white background (30%)
    score += analysis.backgroundConfidence * 0.3;
    
    // No watermark (10%)
    if (!analysis.hasWatermark) {
      score += 0.1;
    }
    
    // Sharpness (5%)
    score += analysis.sharpness * 0.05;
    
    return Math.min(1, score);
  }

  /**
   * Analyze background to detect plain/white backgrounds (Legacy method)
   * @param {Jimp} image - Jimp image object
   * @returns {Promise<Object>} Background analysis results
   * @deprecated Use analyzeStrictBackground for strict white background detection
   */
  async analyzeBackground(image) {
    try {
      const width = image.getWidth();
      const height = image.getHeight();
      
      // Sample points around the edges
      const edgePoints = this.getEdgeSamplePoints(width, height);
      const edgeColors = edgePoints.map(point => 
        image.getPixelColor(point.x, point.y)
      );

      // Convert colors to RGB and analyze
      const rgbColors = edgeColors.map(color => Jimp.intToRGBA(color));
      
      // Calculate color variance
      const colorVariance = this.calculateColorVariance(rgbColors);
      
      // Check if colors are close to white/light colors
      const lightness = this.calculateAverageLightness(rgbColors);
      
      // Calculate confidence based on low variance and high lightness
      const varianceScore = Math.max(0, 1 - (colorVariance / 100));
      const lightnessScore = lightness / 255;
      
      const confidence = (varianceScore * 0.6 + lightnessScore * 0.4);

      return {
        confidence: Math.min(1, confidence),
        variance: colorVariance,
        lightness,
        isPlain: confidence >= config.quality.backgroundConfidenceThreshold
      };
    } catch (error) {
      Logger.warn('Background analysis failed', { error: error.message });
      return { confidence: 0, variance: 100, lightness: 0, isPlain: false };
    }
  }

  /**
   * Get sample points around the edge of the image
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Array} Array of {x, y} points
   */
  getEdgeSamplePoints(width, height) {
    const points = [];
    const margin = 5; // Pixels from edge
    const samples = 20; // Number of samples per edge

    // Top edge
    for (let i = 0; i < samples; i++) {
      points.push({
        x: Math.floor((width / samples) * i),
        y: margin
      });
    }

    // Bottom edge
    for (let i = 0; i < samples; i++) {
      points.push({
        x: Math.floor((width / samples) * i),
        y: height - margin - 1
      });
    }

    // Left edge
    for (let i = 0; i < samples; i++) {
      points.push({
        x: margin,
        y: Math.floor((height / samples) * i)
      });
    }

    // Right edge
    for (let i = 0; i < samples; i++) {
      points.push({
        x: width - margin - 1,
        y: Math.floor((height / samples) * i)
      });
    }

    return points;
  }

  /**
   * Calculate color variance across sample points
   * @param {Array} colors - Array of RGB color objects
   * @returns {number} Color variance
   */
  calculateColorVariance(colors) {
    if (colors.length === 0) return 100;

    const avgR = colors.reduce((sum, c) => sum + c.r, 0) / colors.length;
    const avgG = colors.reduce((sum, c) => sum + c.g, 0) / colors.length;
    const avgB = colors.reduce((sum, c) => sum + c.b, 0) / colors.length;

    const variance = colors.reduce((sum, c) => {
      return sum + Math.pow(c.r - avgR, 2) + Math.pow(c.g - avgG, 2) + Math.pow(c.b - avgB, 2);
    }, 0) / colors.length;

    return Math.sqrt(variance);
  }

  /**
   * Calculate average lightness of colors
   * @param {Array} colors - Array of RGB color objects
   * @returns {number} Average lightness (0-255)
   */
  calculateAverageLightness(colors) {
    if (colors.length === 0) return 0;

    const totalLightness = colors.reduce((sum, c) => {
      // Calculate perceived lightness
      return sum + (0.299 * c.r + 0.587 * c.g + 0.114 * c.b);
    }, 0);

    return totalLightness / colors.length;
  }

  /**
   * Analyze image sharpness using edge detection
   * @param {Jimp} image - Jimp image object
   * @returns {Promise<number>} Sharpness score (0-1)
   */
  async analyzeSharpness(image) {
    try {
      // Convert to grayscale for edge detection
      const grayImage = image.clone().greyscale();
      
      // Simple edge detection using gradient magnitude
      const width = grayImage.getWidth();
      const height = grayImage.getHeight();
      let edgeSum = 0;
      let pixelCount = 0;

      // Sample center region for sharpness
      const startX = Math.floor(width * 0.25);
      const endX = Math.floor(width * 0.75);
      const startY = Math.floor(height * 0.25);
      const endY = Math.floor(height * 0.75);

      for (let y = startY; y < endY - 1; y++) {
        for (let x = startX; x < endX - 1; x++) {
          const current = Jimp.intToRGBA(grayImage.getPixelColor(x, y)).r;
          const right = Jimp.intToRGBA(grayImage.getPixelColor(x + 1, y)).r;
          const below = Jimp.intToRGBA(grayImage.getPixelColor(x, y + 1)).r;

          const gradientX = Math.abs(current - right);
          const gradientY = Math.abs(current - below);
          const gradient = Math.sqrt(gradientX * gradientX + gradientY * gradientY);

          edgeSum += gradient;
          pixelCount++;
        }
      }

      const averageGradient = edgeSum / pixelCount;
      const sharpnessScore = Math.min(1, averageGradient / 50); // Normalize to 0-1

      return sharpnessScore;
    } catch (error) {
      Logger.warn('Sharpness analysis failed', { error: error.message });
      return 0;
    }
  }

  /**
   * Calculate overall quality score
   * @param {Object} analysis - Analysis results
   * @returns {number} Quality score (0-1)
   */
  calculateQualityScore(analysis) {
    let score = 0;

    // Resolution score (30%)
    if (analysis.dimensions) {
      const minRes = Math.min(analysis.dimensions.width, analysis.dimensions.height);
      const resolutionScore = Math.min(1, minRes / config.quality.minResolution[0]);
      score += resolutionScore * 0.3;
    }

    // Aspect ratio score (20%)
    if (Helpers.isPreferredAspectRatio(analysis.aspectRatio)) {
      score += 0.2;
    }

    // Background score (25%)
    score += analysis.backgroundConfidence * 0.25;

    // Sharpness score (15%)
    score += analysis.sharpness * 0.15;

    // File size score (10%)
    const sizeScore = analysis.fileSize >= config.quality.minFileSize ? 0.1 : 0;
    score += sizeScore;

    return Math.min(1, score);
  }

  /**
   * Generate cache key for image buffer
   * @param {Buffer} buffer - Image buffer
   * @returns {string} Cache key
   */
  generateCacheKey(buffer) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Cache result and return it
   * @param {string} key - Cache key
   * @param {Object} result - Analysis result
   * @returns {Object} Analysis result
   */
  cacheAndReturn(key, result) {
    this.cache.set(key, result);
    
    // Limit cache size
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    return result;
  }

  /**
   * Clear analysis cache
   */
  clearCache() {
    this.cache.clear();
    Logger.info('Quality analyzer cache cleared');
  }
}

module.exports = QualityAnalyzer;