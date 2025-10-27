/**
 * Cloud Storage Integration (AWS S3)
 * Optional upload of images to S3 after download
 */
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const config = require('../config/settings');

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: config.cloud?.awsAccessKeyId,
  secretAccessKey: config.cloud?.awsSecretAccessKey,
  region: config.cloud?.awsRegion || 'us-east-1'
});

/**
 * Upload image to S3 bucket
 * @param {string} filePath - Local image file path
 * @param {string} bucket - S3 bucket name
 * @param {string} key - S3 object key
 * @returns {Promise<string>} S3 URL
 */
async function uploadToS3(filePath, bucket, key) {
  const fileContent = fs.readFileSync(filePath);
  const params = {
    Bucket: bucket,
    Key: key,
    Body: fileContent,
    ContentType: 'image/jpeg',
    ACL: 'public-read'
  };
  await s3.upload(params).promise();
  return `https://${bucket}.s3.amazonaws.com/${key}`;
}

module.exports = { uploadToS3 };
