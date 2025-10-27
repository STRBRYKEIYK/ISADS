/**
 * Configuration settings for the Product Image Search & Download System
 */

module.exports = {
  // Search Engine Settings - BRAND WEBSITE PRIORITY
  search: {
    // PRIORITY ORDER: 1. Official Brand Websites, 2. Google, 3. Bing, 4. Amazon
    engines: ['google', 'bing', 'amazon'], // Fallback engines after brand websites
    maxImagesPerItem: 8, // Allow more images for better selection
    searchTimeout: 20000, // Allow time for quality results
    retryAttempts: 2, // More retries for valuable results
    delayBetweenRequests: 300, // Prevent rate limiting
    delayBetweenEngines: 200, // Allow proper cooldown between engines
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    
    // Brand Website Settings - HIGHEST PRIORITY
    prioritizeBrandWebsites: true, // Always check brand websites first
    brandWebsiteTimeout: 15000, // Timeout for brand website scraping
    brandWebsiteRetries: 2, // Retries for brand websites
    skipFallbackIfBrandFound: true, // Skip other engines if enough brand images found
    
    // Anti-detection settings - Enhanced for all sources
    enableUserAgentRotation: true,
    randomizeViewport: true,
    simulateHumanBehavior: true,
    
    // Selector timeouts - Balanced for quality results
    selectorTimeout: 8000, // Time for dynamic loading
    maxSelectorRetries: 2, // Retries for valuable results
    
    // Performance optimizations - QUALITY OVER SPEED
    concurrentSearches: 2, // Avoid rate limiting
    skipSlowEngines: false, // Don't skip - we want quality results
    fastFailMode: false, // Patience for high-quality results
    
    // QUALITY FILTERING - Prioritize professional sources
    preferredDomains: [
      'harriswelding.com', 'lincolnelectric.com', 'hypertherm.com', 
      '3m.com', 'garlock.com', 'apple.com', 'mi.com', 
      'jollibee.com', 'popeyes.com'
    ],
    avoidDomains: ['pinterest', 'facebook', 'twitter', 'instagram'], // Avoid social media
    requireProductPages: true // Prefer actual product pages over generic images
  },

  // Image Quality Requirements - HIGHEST QUALITY ONLY
  quality: {
    // HIGHEST QUALITY: 800x800 to 1200x1200 for maximum sharpness
    minResolution: [800, 800], // Increased to 800px minimum for crisp images
    maxResolution: [1200, 1200], // Keep 1200px max for optimal quality
    // Perfect square images preferred
    preferredAspectRatio: [0.9, 1.1], // Nearly perfect square images only
    strictSquareOnly: true, // STRICT: Only accept square/near-square images
    
    // CLEAN BACKGROUNDS: Professional product images only
    requirePureWhiteBackground: true, // Enable clean background detection
    whiteBackgroundThreshold: 0.75, // 75% white background required
    
    // NO WATERMARKS: Professional images only
    allowWatermarks: false, // Strict: No watermarks allowed
    watermarkDetectionThreshold: 0.3, // Aggressive watermark detection
    
    // Image matching requirements - SMART SEARCH-BASED MATCHING
    imageMatchingThreshold: 0.70, // 70% minimum confidence required
    preferBrandedImages: true, // Prioritize brand-specific matches
    perfectMatchThreshold: 0.95, // 95% for perfect matches
    
    // File requirements - HIGH QUALITY FILES ONLY
    minFileSize: 80000, // 80KB minimum (high quality images only)
    maxFileSize: 8000000, // 8MB maximum (accommodate high-res images)
    allowedFormats: ['jpg', 'jpeg', 'png'],
    
    // Sharpness requirements - CRISP IMAGES ONLY
    minSharpness: 0.5 // 50% minimum sharpness for professional quality
  },

  // Download Settings - MAXIMUM SPEED
  download: {
    concurrentDownloads: 10, // Increased to 10 for maximum parallel downloads
    downloadTimeout: 8000, // Reduced to 8 seconds for faster failure detection
    retryAttempts: 1, // Only 1 retry for maximum speed
    backoffMultiplier: 1.2 // Minimal backoff
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
  },

  // Cloud Storage Settings (Optional)
  cloud: {
    enableS3: false, // Set true to enable S3 uploads
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsRegion: 'us-east-1',
    s3Bucket: '',
    s3BasePath: 'item-images/'
  }
};