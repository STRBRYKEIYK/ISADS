# Product Image Search & Download System

## Project Overview
This Node.js application automatically reads product data from Excel files and downloads matching product images with intelligent quality filtering. It organizes images by Item ID in structured folders.

## Key Components
- **Excel Reader**: Processes product data (Item ID, Name, Brand)
- **Image Search**: Multi-engine search with quality filtering
- **Background Detection**: AI-powered plain background detection
- **Download Manager**: Concurrent downloads with error handling
- **File Organization**: Structured folder hierarchy by Item ID

## Development Guidelines
- Use modern JavaScript (ES6+) with async/await
- Implement proper error handling and logging
- Follow modular architecture pattern
- Use configuration files for search parameters
- Implement rate limiting for web scraping
- Add comprehensive testing for all modules

## Code Style
- Use camelCase for variables and functions
- Use PascalCase for classes
- Add JSDoc comments for all functions
- Handle all Promise rejections
- Use try-catch blocks for error handling
- Implement progress tracking and logging

## Image Quality Criteria
- Plain/white background preferred
- Square or near-square aspect ratio (1:1)
- Minimum resolution: 800x800px
- Clear product visibility
- Minimal text overlay

## Quick Start
```bash
# Install dependencies
npm install

# Run with sample data
node src/main.js --input data/sample_products.csv --output "Item Images"

# Show help
node src/main.js --help
```

## Project Status
✅ **COMPLETED** - All core functionality implemented and tested