# 🆓 FREE Google Drive Setup Guide

## Overview
This guide shows you how to set up Google Drive API for free file storage instead of paid AWS S3.

**Free Storage**: 15GB per Google account
**Cost**: $0 (completely free!)

## Step 1: Create Google Cloud Project

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com
   - Sign in with your Google account

2. **Create New Project**
   - Click "Select a project" → "New Project"
   - Project name: `SilverSurfers Drive API`
   - Click "Create"

## Step 2: Enable Google Drive API

1. **Navigate to APIs & Services**
   - In the left menu: "APIs & Services" → "Library"

2. **Enable Drive API**
   - Search for "Google Drive API"
   - Click on it and press "Enable"

## Step 3: Create Credentials

1. **Go to Credentials**
   - "APIs & Services" → "Credentials"

2. **Create OAuth 2.0 Client ID**
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: "Desktop application"
   - Name: `SilverSurfers Desktop Client`
   - Click "Create"

3. **Download Credentials**
   - Download the JSON file
   - Note the `client_id` and `client_secret`

## Step 4: Get Refresh Token

1. **Install Google APIs CLI tool**
   ```bash
   npm install -g googleapis
   ```

2. **Run this script to get refresh token**
   ```javascript
   const { google } = require('googleapis');
   
   const oauth2Client = new google.auth.OAuth2(
     'YOUR_CLIENT_ID',
     'YOUR_CLIENT_SECRET',
     'urn:ietf:wg:oauth:2.0:oob'
   );
   
   const authUrl = oauth2Client.generateAuthUrl({
     access_type: 'offline',
     scope: ['https://www.googleapis.com/auth/drive']
   });
   
   console.log('Visit this URL:', authUrl);
   console.log('Enter the code here:');
   ```

3. **Follow the authorization flow**
   - Visit the URL in your browser
   - Sign in and authorize the app
   - Copy the authorization code
   - The script will give you a refresh token

## Step 5: Create Drive Folder (Optional)

1. **Go to Google Drive**
   - Visit: https://drive.google.com

2. **Create Folder**
   - Click "New" → "Folder"
   - Name: `SilverSurfers Reports`
   - Right-click folder → "Get link"
   - Copy the folder ID from the URL

## Step 6: Configure Environment Variables

Add to your `.env` file:

```env
# Google Drive Configuration
GOOGLE_DRIVE_CLIENT_ID=your-client-id-here
GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret-here
GOOGLE_DRIVE_REFRESH_TOKEN=your-refresh-token-here
GOOGLE_DRIVE_FOLDER_ID=your-folder-id-here
```

## Step 7: Install Dependencies

```bash
cd backend-silver-surfers
npm install googleapis
```

## Step 8: Test the Setup

Create `test-google-drive.js`:

```javascript
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_DRIVE_CLIENT_ID,
  process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function testDrive() {
  try {
    // List files to test connection
    const response = await drive.files.list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name)',
    });
    
    console.log('✅ Google Drive connection successful!');
    console.log('Files:', response.data.files);
    
    // Test upload
    const testContent = 'Hello from SilverSurfers!';
    const media = {
      mimeType: 'text/plain',
      body: testContent
    };
    
    const fileMetadata = {
      name: `test-${Date.now()}.txt`,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID || 'root']
    };
    
    const result = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink'
    });
    
    console.log('✅ Test file uploaded!');
    console.log('File ID:', result.data.id);
    console.log('View Link:', result.data.webViewLink);
    
  } catch (error) {
    console.error('❌ Google Drive test failed:', error.message);
  }
}

testDrive();
```

Run the test:
```bash
node test-google-drive.js
```

## Alternative Free Solutions

### Option 1: Dropbox API
- **Free**: 2GB storage
- **Setup**: Similar to Google Drive
- **API**: Dropbox API v2

### Option 2: OneDrive API
- **Free**: 5GB storage
- **Setup**: Microsoft Graph API
- **Good for**: Microsoft ecosystem users

### Option 3: Local File Server
- **Free**: Unlimited (your server space)
- **Setup**: Simple file upload to your server
- **Limitation**: Requires public server

### Option 4: GitHub Releases (for small files)
- **Free**: 2GB per release
- **Setup**: GitHub API
- **Good for**: Open source projects

## Benefits of Google Drive Solution

✅ **Completely Free** (15GB storage)  
✅ **No credit card required**  
✅ **Reliable Google infrastructure**  
✅ **Easy to set up**  
✅ **Good API documentation**  
✅ **Public links work well**  

## Troubleshooting

1. **"Invalid credentials"**: Check client ID/secret
2. **"Access denied"**: Ensure Drive API is enabled
3. **"Refresh token expired"**: Re-run the authorization flow
4. **"Quota exceeded"**: You've hit the API limits (very rare)

## Security Notes

- Files are uploaded to your Google Drive account
- You can make them public or private
- Consider setting up a dedicated Google account for this
- Refresh tokens don't expire (unless revoked)

## Cost Comparison

| Solution | Free Tier | Paid Plans |
|----------|-----------|------------|
| Google Drive | 15GB | $1.99/month for 100GB |
| AWS S3 | 5GB | $0.023/GB/month |
| Dropbox | 2GB | $9.99/month for 2TB |
| OneDrive | 5GB | $1.99/month for 100GB |

**Google Drive is the best free option with 15GB storage!**
