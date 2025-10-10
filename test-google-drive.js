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
    
    // Make file publicly accessible
    await drive.permissions.create({
      fileId: result.data.id,
      resource: {
        role: 'reader',
        type: 'anyone'
      }
    });
    
    console.log('✅ Test file uploaded!');
    console.log('File ID:', result.data.id);
    console.log('\n📎 Different Link Types:');
    console.log('1. Direct Download (auto-downloads):', `https://drive.google.com/uc?export=download&id=${result.data.id}`);
    console.log('2. View in Browser:', `https://drive.google.com/file/d/${result.data.id}/view`);
    console.log('3. Force Download:', `https://drive.google.com/uc?id=${result.data.id}&export=download&confirm=t`);
    console.log('\n💡 Use the "Direct Download" link in emails for best user experience!');
    
  } catch (error) {
    console.error('❌ Google Drive test failed:', error.message);
  }
}

testDrive();
