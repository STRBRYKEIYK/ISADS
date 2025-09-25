# Product Image Search & Download System

An automated Node.js application that reads product data from Excel files and downloads matching product images with intelligent quality filtering and organization.

## Features

- **Excel Integration**: Reads product data (Item ID, Name, Brand) from Excel files
- **Multi-Engine Search**: Searches across Google Images, Bing Images, Amazon, Hardware shops, and more
- **Quality Filtering**: Downloads only high-quality images that meet specific criteria
- **Smart Organization**: Creates structured folder hierarchy organized by Item ID
- **Background Detection**: AI-powered detection of plain/white backgrounds
- **Error Handling**: Comprehensive error handling with retry logic
- **Progress Tracking**: Real-time progress reporting and logging
- **Summary Reports**: Detailed reports of processing results

## Installation

### Prerequisites

- Node.js 16.0 or higher
- npm or yarn package manager

### Setup

1. Clone or download this repository
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

## Usage

### Basic Usage

```bash
npm start -- --input "path/to/your/products.xlsx" --output "Item Images"
```

### Command Line Options

```bash
node src/main.js [options]

Options:
  -i, --input <path>     Input Excel file path (default: "products.xlsx")
  -o, --output <path>    Output directory path (default: "Item Images")
  -c, --config <path>    Custom configuration file path
  --dry-run              Run without downloading images (validation only)
  --verbose              Enable verbose logging
  --max-products <num>   Maximum number of products to process
  -h, --help             Display help information
```

### Excel File Format

Your Excel file should contain the following columns:

| Item ID | Name | Brand |
|---------|------|-------|
| 1 | Acetylene Cutting Tip 2NX | HARRIS |
| 2 | Welding Rod E6013 | Lincoln |
| 3 | Plasma Cutter Electrode | Hypertherm |

**Required Columns:**
- `Item ID`: Unique identifier for the product
- `Name`: Product name/description
- `Brand`: Product brand/manufacturer (optional but recommended)

## Configuration

### Default Settings

The system uses intelligent defaults, but you can customize behavior by creating a configuration file:

```javascript
// custom-config.js
module.exports = {
  search: {
    engines: ['google', 'bing', 'amazon', 'hardware', 'shopee', 'lazada'],
    maxImagesPerItem: 5,
    delayBetweenRequests: 2000
  },
  quality: {
    minResolution: [800, 800],
    preferredAspectRatio: [0.8, 1.2],
    backgroundConfidenceThreshold: 0.7
  },
  download: {
    concurrentDownloads: 3,
    retryAttempts: 3
  }
};
```

Use custom configuration:
```bash
npm start -- --input products.xlsx --config custom-config.js
```

### Image Quality Criteria

The system applies the following quality filters:

1. **Resolution**: Minimum 800x800 pixels
2. **Aspect Ratio**: Square or near-square (0.8-1.2 ratio)
3. **Background**: Plain/white background preferred
4. **File Size**: Between 50KB and 10MB
5. **Format**: JPG, PNG, or WebP
6. **Content**: Clear product visibility, minimal text overlay

## Output Structure

The system creates a organized folder structure:

```
Item Images/
├── 1/
│   ├── image1_a1b2c3d4.jpg
│   ├── image2_e5f6g7h8.jpg
│   └── image3_i9j0k1l2.png
├── 2/
│   ├── image1_m3n4o5p6.jpg
│   └── image2_q7r8s9t0.jpg
├── 3 (NIF)/
│   └── README.txt
└── summary_report_1234567890.txt
```

**Folder Types:**
- **Regular Folders**: Named by Item ID, containing downloaded images
- **NIF Folders**: "(NIF)" suffix indicates "No Image Found"
- **Summary Report**: Text and JSON reports with processing statistics

## Project Structure

```
├── src/
│   ├── main.js                 # Main application entry point
│   ├── config/
│   │   └── settings.js         # Configuration settings
│   ├── modules/
│   │   ├── excelReader.js      # Excel file processing
│   │   ├── imageSearch.js      # Image search functionality
│   │   ├── qualityAnalyzer.js  # Image quality analysis
│   │   ├── downloadManager.js  # Download management
│   │   └── fileManager.js      # File system operations
│   └── utils/
│       ├── logger.js           # Logging utilities
│       └── helpers.js          # Helper functions
├── tests/                      # Test files
├── data/                       # Data directory (Excel files)
├── package.json               # Node.js dependencies
└── README.md                  # This file
```

## Examples

### Example 1: Basic Usage
```bash
# Process products.xlsx and save to Item Images folder
npm start

# Same as above with explicit parameters
npm start -- --input products.xlsx --output "Item Images"
```

### Example 2: Custom Configuration
```bash
# Use custom settings
npm start -- --input inventory.xlsx --config my-settings.js --verbose
```

### Example 3: Validation Only
```bash
# Test without downloading (dry run)
npm start -- --input products.xlsx --dry-run
```

## Logging

The system provides comprehensive logging:

- **Console Output**: Real-time progress and status updates
- **Log Files**: Detailed logs saved to `logs/product-image-download.log`
- **Summary Reports**: Complete processing reports in text and JSON formats

### Log Levels
- `INFO`: General information and progress
- `WARN`: Warnings and non-critical issues
- `ERROR`: Errors and failures
- `SUCCESS`: Successful operations

## Troubleshooting

### Common Issues

**1. "Excel file not found"**
- Verify the input file path is correct
- Ensure the file exists and is accessible

**2. "Required column not found"**
- Check that your Excel file has the required columns: Item ID, Name, Brand
- Column names are case-insensitive but must match exactly

**3. "No images found for product"**
- This is normal for some products
- Check the search queries being generated
- Consider adjusting the product name or brand information

**4. "Download failed" errors**
- Usually due to network issues or invalid image URLs
- The system will retry automatically
- Check your internet connection

**5. "Quality validation failed"**
- Images don't meet quality criteria
- Adjust quality settings in configuration if needed
- This helps ensure only good quality images are downloaded

### Performance Tips

1. **Reduce Concurrent Downloads**: Lower `concurrentDownloads` if experiencing timeouts
2. **Increase Delays**: Increase `delayBetweenRequests` to be more respectful to websites
3. **Limit Products**: Use `--max-products` option for testing with smaller datasets
4. **Batch Processing**: The system automatically processes products in batches

## Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Development Mode
```bash
npm run dev
```

## Legal and Ethical Considerations

- **Respect Robots.txt**: The system respects website policies
- **Rate Limiting**: Built-in delays prevent overwhelming servers
- **Fair Use**: Only download images for legitimate business purposes
- **Copyright**: Ensure you have rights to use downloaded images
- **Terms of Service**: Comply with search engine and website terms

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run tests and linting
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or feature requests:

1. Check the troubleshooting section above
2. Review the configuration options
3. Check the logs for detailed error information
4. Create an issue with:
   - System information (Node.js version, OS)
   - Complete error messages
   - Sample Excel file (if possible)
   - Configuration used

## Changelog

### Version 1.0.0
- Initial release
- Excel file processing
- Multi-engine image search
- Quality filtering and analysis
- Automated folder organization
- Comprehensive logging and reporting