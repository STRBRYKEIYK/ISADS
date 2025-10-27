/**
 * ImageDeduplicator module
 * Uses perceptual hashing to detect and remove duplicate images.
 * Integrates with download manager and file organization.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

/**
 * Generate a perceptual hash for an image file
 * @param {string} imagePath
 * @returns {Promise<string>} hash
 */
async function getImageHash(imagePath) {
  try {
    const buffer = await sharp(imagePath)
      .resize(32, 32, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer();
    // Simple average hash
    const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length;
    let hash = '';
    for (const pixel of buffer) {
      hash += pixel > avg ? '1' : '0';
    }
    // Convert binary string to hex
    return crypto.createHash('sha1').update(hash).digest('hex');
  } catch (err) {
    return null;
  }
}

/**
 * Remove duplicate images in a folder using perceptual hash
 * @param {string} folderPath
 * @returns {Promise<number>} Number of duplicates removed
 */
async function removeDuplicates(folderPath) {
  const files = fs.readdirSync(folderPath).filter(f => f.match(/\.(jpg|jpeg|png)$/i));
  const hashes = {};
  let removed = 0;
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const hash = await getImageHash(filePath);
    if (!hash) continue;
    if (hashes[hash]) {
      fs.unlinkSync(filePath);
      removed++;
    } else {
      hashes[hash] = filePath;
    }
  }
  return removed;
}

module.exports = {
  getImageHash,
  removeDuplicates,
};
