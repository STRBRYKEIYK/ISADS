/**
 * Configuration settings for the Product Image Search & Download System
 */

module.exports = {
  // Search Engine Settings
  search: {
    engines: ['amazon', 'google', 'bing'], // Only fastest, most reliable engines
    maxImagesPerItem: 6, // Reduced for faster processing
    searchTimeout: 30000, // Reduced to 30 seconds for faster processing
    retryAttempts: 2, // Reduced retries for speed
    delayBetweenRequests: 1000, // Reduced to 1 second for speed
    delayBetweenEngines: 500, // Reduced to 0.5 seconds for speed
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    
    // Anti-detection settings
    enableUserAgentRotation: true,
    randomizeViewport: true,
    simulateHumanBehavior: true,
    
    // Selector timeouts
    selectorTimeout: 10000, // Reduced to 10 seconds for speed
    maxSelectorRetries: 2, // Reduced retries for speed
    
    // Performance optimizations
    concurrentSearches: 2, // Allow some concurrent searches
    skipSlowEngines: true // Skip engines that consistently timeout
  },

  // Image Quality Requirements - Updated dimensions
  quality: {
    // Image size requirements: 600x600 to 1200x1200
    minResolution: [600, 600],
    maxResolution: [1200, 1200],
    // Near-square aspect ratio window used by helpers/tests
    preferredAspectRatio: [0.8, 1.25], // Prefer near-square images
    strictSquareOnly: false, // Accept slightly non-square images
    
    // RELAXED: Background requirements disabled
    requirePureWhiteBackground: false,
    whiteBackgroundThreshold: 0.3, // Very lenient background check
    
    // RELAXED: Allow watermarks temporarily
    allowWatermarks: true,
    watermarkDetectionThreshold: 0.8, // Very high threshold (effectively disabled)
    
    // Image matching requirements
    imageMatchingThreshold: 0.7, // 70% confidence required
    
    // File requirements - adjusted for 600-1200px images
    minFileSize: 50000, // 50KB minimum (higher quality images)
    maxFileSize: 8000000, // 8MB maximum (accommodate larger images)
    allowedFormats: ['jpg', 'jpeg', 'png'],
    
    // Sharpness requirements
    minSharpness: 0.3 // 30% minimum sharpness
  },

  // Download Settings
  download: {
    concurrentDownloads: 5, // Increased for faster parallel downloads
    downloadTimeout: 15000, // Reduced timeout for faster failure detection
    retryAttempts: 2, // Reduced retries for speed
    backoffMultiplier: 1.5 // Faster backoff
  },

  // File System Settings
  fileSystem: {
    outputBaseDir: 'Item Images',
    nifSuffix: ' (NIF)', // No Image Found
    nsSuffix: ' (NS)', // Not Sure - Low confidence match
    imageExtensions: ['.jpg', '.jpeg', '.png'],
    maxFolderNameLength: 255
  },

  // Excel Settings
  excel: {
    expectedColumns: ['Item ID', 'Name', 'Brand'],
    headerRow: 1,
    maxRowsToProcess: 10000
  },

  // Logging Settings
  logging: {
    level: 'info',
    logFile: 'logs/product-image-download.log',
    maxLogSize: '20m',
    maxLogFiles: 5
  }
};