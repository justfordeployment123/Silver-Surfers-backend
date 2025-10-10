// Test S3 connection and upload
import AWS from 'aws-sdk';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

// Configure AWS
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_S3_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

async function testS3Connection() {
  try {
    console.log('🔍 Testing S3 connection...');
    console.log('Bucket:', BUCKET_NAME);
    console.log('Region:', process.env.AWS_S3_REGION || 'us-east-1');
    
    // Test bucket access
    const result = await s3.headBucket({ Bucket: BUCKET_NAME }).promise();
    console.log('✅ S3 connection successful!');
    
    // Test upload
    const testContent = 'Hello from SilverSurfers!';
    const testKey = `test/connection-test-${Date.now()}.txt`;
    
    const uploadResult = await s3.upload({
      Bucket: BUCKET_NAME,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain'
    }).promise();
    
    console.log('✅ Test upload successful!');
    console.log('Uploaded to:', uploadResult.Location);
    
    // Clean up test file
    await s3.deleteObject({ Bucket: BUCKET_NAME, Key: testKey }).promise();
    console.log('✅ Test file cleaned up');
    
  } catch (error) {
    console.error('❌ S3 test failed:', error.message);
    
    if (error.code === 'NoSuchBucket') {
      console.error('💡 Make sure your bucket name is correct in .env file');
    } else if (error.code === 'InvalidAccessKeyId') {
      console.error('💡 Check your AWS_ACCESS_KEY_ID in .env file');
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.error('💡 Check your AWS_SECRET_ACCESS_KEY in .env file');
    } else if (error.code === 'AccessDenied') {
      console.error('💡 Make sure your IAM user has S3 permissions');
    }
  }
}

// Run the test
testS3Connection();
