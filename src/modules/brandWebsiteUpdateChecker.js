/**
 * Brand Website Update Checker
 * Periodically checks brand websites for layout changes and logs notifications.
 */
const axios = require('axios');
const Logger = require('../utils/logger');
const config = require('../config/settings');

/**
 * Check for updates on brand websites
 * @param {Array} brandWebsites - List of brand website URLs
 * @param {Object} lastKnownStates - Map of last known HTML signatures
 * @returns {Promise<Array>} List of changed websites
 */
async function checkBrandWebsiteUpdates(brandWebsites, lastKnownStates = {}) {
  const changed = [];
  for (const url of brandWebsites) {
    try {
      const resp = await axios.get(url, { timeout: config.search.brandWebsiteTimeout });
      const html = resp.data;
      const signature = html.slice(0, 1000); // Simple signature: first 1000 chars
      if (lastKnownStates[url] && lastKnownStates[url] !== signature) {
        Logger.warn(`Brand website layout changed: ${url}`);
        changed.push(url);
      }
      lastKnownStates[url] = signature;
    } catch (err) {
      Logger.error(`Failed to check brand website: ${url}`, err.message);
    }
  }
  return changed;
}

module.exports = { checkBrandWebsiteUpdates };
