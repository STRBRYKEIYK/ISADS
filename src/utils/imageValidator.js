const sharp = require('sharp');
const Jimp = require('jimp');
const similarity = require('string-similarity');
const { createHash } = require('crypto');
const path = require('path');
const fs = require('fs-extra');

/**
 * Validates image matches with product name and detects duplicates
 */
class ImageValidator {
    constructor(logger) {
        this.logger = logger;
        this.processedHashes = new Set();
        this.similarImages = new Map();
        this.duplicateThreshold = 0.9; // 90% similarity for duplicates
        this.matchThreshold = 0.7; // 70% confidence threshold
    }

    /**
     * Calculate image hash for duplicate detection
     */
    async calculateImageHash(imagePath) {
        try {
            const image = await Jimp.read(imagePath);
            const hash = image.hash();
            return hash;
        } catch (error) {
            this.logger.error(`Error calculating hash for ${imagePath}:`, error);
            return null;
        }
    }

    /**
     * Check if image is a duplicate
     */
    async isDuplicate(imagePath) {
        try {
            const hash = await this.calculateImageHash(imagePath);
            if (!hash) return false;

            // Check exact duplicates
            if (this.processedHashes.has(hash)) {
                return true;
            }

            // Check similar images using Hamming distance
            for (const [existingHash, existingPath] of this.similarImages.entries()) {
                const hammingDistance = this.calculateHammingDistance(hash, existingHash);
                const similarity = 1 - (hammingDistance / 64); // 64-bit hash
                
                if (similarity >= this.duplicateThreshold) {
                    this.logger.info(`Duplicate detected: ${imagePath} similar to ${existingPath} (${(similarity * 100).toFixed(1)}%)`);
                    return true;
                }
            }

            // Add to processed images
            this.processedHashes.add(hash);
            this.similarImages.set(hash, imagePath);
            return false;

        } catch (error) {
            this.logger.error(`Error checking duplicate for ${imagePath}:`, error);
            return false;
        }
    }

    /**
     * Calculate Hamming distance between two hashes
     */
    calculateHammingDistance(hash1, hash2) {
        if (hash1.length !== hash2.length) return 64;
        
        let distance = 0;
        for (let i = 0; i < hash1.length; i++) {
            if (hash1[i] !== hash2[i]) distance++;
        }
        return distance;
    }

    /**
     * Validate if image matches product name/description
     */
    async validateImageMatch(imagePath, productName, itemId) {
        try {
            const confidence = await this.calculateMatchConfidence(imagePath, productName);
            
            this.logger.info(`Match confidence for ${itemId}: ${(confidence * 100).toFixed(1)}%`);
            
            return {
                isMatch: confidence >= this.matchThreshold,
                confidence: confidence,
                needsNSFolder: confidence < this.matchThreshold
            };

        } catch (error) {
            this.logger.error(`Error validating image match for ${imagePath}:`, error);
            return {
                isMatch: false,
                confidence: 0,
                needsNSFolder: true
            };
        }
    }

    /**
     * Calculate match confidence between image and product name
     */
    async calculateMatchConfidence(imagePath, productName) {
        try {
            let confidence = 0;
            const productTokens = this.extractProductTokens(productName);
            
            // 1. Filename matching (30% weight)
            const filename = path.basename(imagePath, path.extname(imagePath));
            const filenameScore = this.calculateTextSimilarity(filename, productName);
            confidence += filenameScore * 0.3;

            // 2. Product attributes matching (40% weight)
            const attributeScore = this.calculateAttributeMatch(productTokens, filename);
            confidence += attributeScore * 0.4;

            // 3. Size/dimension matching (20% weight)
            const sizeScore = this.calculateSizeMatch(productTokens, filename);
            confidence += sizeScore * 0.2;

            // 4. Brand matching (10% weight)
            const brandScore = this.calculateBrandMatch(productTokens, filename);
            confidence += brandScore * 0.1;

            return Math.min(confidence, 1.0);

        } catch (error) {
            this.logger.error(`Error calculating match confidence:`, error);
            return 0;
        }
    }

    /**
     * Extract product tokens from name
     */
    extractProductTokens(productName) {
        const tokens = {
            sizes: [],
            colors: [],
            materials: [],
            brands: [],
            attributes: [],
            dimensions: []
        };

        const text = productName.toLowerCase();

        // Extract sizes
        const sizePatterns = [
            /\b(xs|s|m|l|xl|xxl|xxxl)\b/g,
            /\b(\d+(?:\.\d+)?)\s*(cm|mm|inch|in|ft)\b/g,
            /\b(\d+)\s*x\s*(\d+)(?:\s*x\s*(\d+))?\b/g,
            /\b(small|medium|large|extra\s*large)\b/g
        ];

        sizePatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                tokens.sizes.push(...matches);
            }
        });

        // Extract colors
        const colorWords = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'gray', 'grey', 'brown', 'pink', 'purple', 'orange', 'silver', 'gold', 'beige', 'navy', 'maroon'];
        colorWords.forEach(color => {
            if (text.includes(color)) {
                tokens.colors.push(color);
            }
        });

        // Extract materials
        const materialWords = ['cotton', 'polyester', 'silk', 'wool', 'leather', 'plastic', 'metal', 'wood', 'glass', 'ceramic', 'rubber', 'steel', 'aluminum'];
        materialWords.forEach(material => {
            if (text.includes(material)) {
                tokens.materials.push(material);
            }
        });

        // Extract other attributes
        tokens.attributes = text.split(/\s+/).filter(word => word.length > 2);

        return tokens;
    }

    /**
     * Calculate text similarity using string similarity
     */
    calculateTextSimilarity(text1, text2) {
        const clean1 = text1.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const clean2 = text2.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        return similarity.compareTwoStrings(clean1, clean2);
    }

    /**
     * Calculate attribute matching score
     */
    calculateAttributeMatch(productTokens, filename) {
        let matchCount = 0;
        let totalAttributes = 0;

        const filenameText = filename.toLowerCase();

        // Check size matches
        if (productTokens.sizes.length > 0) {
            totalAttributes += productTokens.sizes.length;
            productTokens.sizes.forEach(size => {
                if (filenameText.includes(size.toLowerCase())) {
                    matchCount++;
                }
            });
        }

        // Check color matches
        if (productTokens.colors.length > 0) {
            totalAttributes += productTokens.colors.length;
            productTokens.colors.forEach(color => {
                if (filenameText.includes(color)) {
                    matchCount++;
                }
            });
        }

        // Check material matches
        if (productTokens.materials.length > 0) {
            totalAttributes += productTokens.materials.length;
            productTokens.materials.forEach(material => {
                if (filenameText.includes(material)) {
                    matchCount++;
                }
            });
        }

        return totalAttributes > 0 ? matchCount / totalAttributes : 0.5;
    }

    /**
     * Calculate size/dimension matching score
     */
    calculateSizeMatch(productTokens, filename) {
        if (productTokens.sizes.length === 0) return 0.5;

        const filenameText = filename.toLowerCase();
        let sizeMatches = 0;

        productTokens.sizes.forEach(size => {
            if (filenameText.includes(size.toLowerCase())) {
                sizeMatches++;
            }
        });

        return sizeMatches / productTokens.sizes.length;
    }

    /**
     * Calculate brand matching score
     */
    calculateBrandMatch(productTokens, filename) {
        if (productTokens.brands.length === 0) return 0.5;

        const filenameText = filename.toLowerCase();
        let brandMatches = 0;

        productTokens.brands.forEach(brand => {
            if (filenameText.includes(brand.toLowerCase())) {
                brandMatches++;
            }
        });

        return brandMatches / productTokens.brands.length;
    }

    /**
     * Reset duplicate detection for new product
     */
    resetDuplicateDetection() {
        this.processedHashes.clear();
        this.similarImages.clear();
    }

    /**
     * Get validation statistics
     */
    getValidationStats() {
        return {
            processedImages: this.processedHashes.size,
            duplicatesDetected: this.similarImages.size,
            matchThreshold: this.matchThreshold,
            duplicateThreshold: this.duplicateThreshold
        };
    }
}

module.exports = ImageValidator;