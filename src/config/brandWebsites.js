/**
 * Official Brand Website Mapping
 * Maps brand names to their official websites and product search patterns
 */

module.exports = {
    // Industrial/Welding Brands
    'HARRIS': {
        domain: 'harriswelding.com',
        searchUrl: 'https://www.harriswelding.com/search',
        productPathPattern: '/products/',
        imageSelectors: [
            '.product-image img',
            '.product-gallery img',
            '.main-product-image img',
            'img[alt*="product"]'
        ],
        searchMethod: 'query', // or 'path'
        searchParam: 'q'
    },
    
    'LINCOLN': {
        domain: 'lincolnelectric.com', 
        searchUrl: 'https://www.lincolnelectric.com/en-us/search',
        productPathPattern: '/products/',
        imageSelectors: [
            '.product-hero-image img',
            '.product-image img',
            '.gallery-image img',
            'img[data-testid="product-image"]'
        ],
        searchMethod: 'query',
        searchParam: 'q'
    },
    
    'HYPERTHERM': {
        domain: 'hypertherm.com',
        searchUrl: 'https://www.hypertherm.com/search',
        productPathPattern: '/products/',
        imageSelectors: [
            '.product-detail-image img',
            '.hero-image img',
            '.product-gallery img',
            'img[alt*="product"]'
        ],
        searchMethod: 'query',
        searchParam: 'search'
    },

    // Safety/Industrial Brands
    '3M': {
        domain: '3m.com',
        searchUrl: 'https://www.3m.com/3M/en_US/search/',
        productPathPattern: '/products/',
        imageSelectors: [
            '.product-image img',
            '.hero-image img',
            '.product-detail-image img',
            'img[data-module="product-image"]'
        ],
        searchMethod: 'query',
        searchParam: 'Ntt'
    },

    'GARLOCK': {
        domain: 'garlock.com',
        searchUrl: 'https://www.garlock.com/search',
        productPathPattern: '/products/',
        imageSelectors: [
            '.product-image img',
            '.detail-image img',
            '.hero-image img',
            'img[alt*="product"]'
        ],
        searchMethod: 'query',
        searchParam: 'q'
    },

    // Technology Brands
    'APPLE': {
        domain: 'apple.com',
        searchUrl: 'https://www.apple.com/search/',
        productPathPattern: '/iphone/',
        imageSelectors: [
            '.hero-image img',
            '.product-hero img',
            '.overview-hero img',
            'img[data-module="heroimage"]'
        ],
        searchMethod: 'path',
        productPaths: {
            'iphone 13': '/iphone-13/',
            'iphone 14': '/iphone-14/',
            'iphone 15': '/iphone-15/',
            'macbook': '/macbook/',
            'ipad': '/ipad/'
        }
    },

    'XIAOMI': {
        domain: 'mi.com',
        searchUrl: 'https://www.mi.com/global/search',
        productPathPattern: '/products/',
        imageSelectors: [
            '.product-image img',
            '.hero-image img',
            '.main-image img',
            'img[data-src*="product"]'
        ],
        searchMethod: 'query',
        searchParam: 'keyword'
    },

    // Food & Restaurant Brands
    'JOLLIBEE': {
        domain: 'jollibee.com',
        searchUrl: 'https://www.jollibee.com/menu',
        productPathPattern: '/menu/',
        imageSelectors: [
            '.menu-item-image img',
            '.product-image img',
            '.food-image img',
            'img[alt*="menu"]'
        ],
        searchMethod: 'menu_scan', // Special handling for menu items
        menuCategories: ['chicken', 'sides', 'desserts']
    },

    'POPEYES': {
        domain: 'popeyes.com',
        searchUrl: 'https://www.popeyes.com/menu',
        productPathPattern: '/menu/',
        imageSelectors: [
            '.menu-item img',
            '.product-hero img',
            '.food-image img',
            'img[data-src*="menu"]'
        ],
        searchMethod: 'menu_scan',
        menuCategories: ['chicken', 'sides', 'desserts', 'beverages']
    },

    // Generic fallback patterns for unknown brands
    'GENERIC': {
        searchPatterns: [
            'https://www.{brand}.com/products/',
            'https://www.{brand}.com/search?q={product}',
            'https://{brand}.com/products/',
            'https://{brand}.com/search?q={product}'
        ],
        commonSelectors: [
            '.product-image img',
            '.hero-image img', 
            '.main-image img',
            '.gallery-image img',
            'img[alt*="product"]',
            'img[src*="product"]',
            'img[data-src*="product"]'
        ]
    }
};