# 🆓 FREE Local File Server Solution

## Overview
This is the simplest and completely free solution - upload files to your own server and serve them via HTTP.

**Cost**: $0 (uses your existing server)
**Storage**: Limited only by your server space
**Setup**: 5 minutes

## Step 1: Create Upload Directory

```bash
mkdir -p backend-silver-surfers/uploads
mkdir -p backend-silver-surfers/uploads/reports
```

## Step 2: Add File Upload Route

Add this to your `server.js`:

```javascript
import multer from 'multer';
import path from 'path';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/reports/');
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const emailHash = crypto.createHash('md5').update(req.body.email || 'anonymous').toString('hex').substring(0, 8);
    const uniqueName = `${timestamp}-${randomId}-${emailHash}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

// Serve static files
app.use('/uploads', express.static('uploads'));

// File upload endpoint
app.post('/upload-files', upload.array('files'), (req, res) => {
  const fileUrls = req.files.map(file => ({
    filename: file.originalname,
    url: `${process.env.API_BASE_URL || 'http://localhost:5000'}/uploads/reports/${file.filename}`,
    size: file.size
  }));
  
  res.json({ success: true, files: fileUrls });
});
```

## Step 3: Update Email Function

Replace the Google Drive upload with local file copy:

```javascript
// Upload file to local server and return public URL
async function uploadToLocal(filePath, fileName, folderPath, email) {
  try {
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');
    const emailHash = crypto.createHash('md5').update(email || 'anonymous').toString('hex').substring(0, 8);
    const fileExtension = path.extname(fileName);
    const baseFileName = path.basename(fileName, fileExtension);
    const uniqueFileName = `${baseFileName}-${timestamp}-${randomId}-${emailHash}${fileExtension}`;
    
    const uploadDir = path.join(process.cwd(), 'uploads', 'reports');
    await fs.mkdir(uploadDir, { recursive: true });
    
    const destinationPath = path.join(uploadDir, uniqueFileName);
    await fs.copyFile(filePath, destinationPath);
    
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000';
    const publicUrl = `${baseUrl}/uploads/reports/${uniqueFileName}`;
    
    return {
      url: publicUrl,
      originalPath: filePath,
      originalFileName: fileName,
      uniqueFileName: uniqueFileName
    };
  } catch (error) {
    console.error('Local upload error:', error);
    throw new Error(`Failed to upload ${fileName} to local server: ${error.message}`);
  }
}
```

## Step 4: Update Package.json

Add multer dependency:

```bash
npm install multer
```

## Step 5: Environment Variables

Add to `.env`:

```env
# Local File Server
API_BASE_URL=http://localhost:5000
# For production: https://yourdomain.com
```

## Step 6: Test the Setup

1. **Start your server**:
   ```bash
   npm start
   ```

2. **Test file upload**:
   ```bash
   curl -X POST http://localhost:5000/upload-files \
     -F "files=@test-file.pdf" \
     -F "email=test@example.com"
   ```

3. **Check file is accessible**:
   ```bash
   curl http://localhost:5000/uploads/reports/filename.pdf
   ```

## Benefits

✅ **Completely Free** (no external services)  
✅ **No API keys or setup**  
✅ **Full control over files**  
✅ **No size limits**  
✅ **Fast and reliable**  
✅ **Works offline**  

## Considerations

⚠️ **Server Space**: Limited by your server's disk space  
⚠️ **Public Access**: Files are publicly accessible  
⚠️ **Backup**: You need to backup files yourself  
⚠️ **CDN**: No global distribution  

## Security Improvements

1. **Add Authentication**:
   ```javascript
   app.get('/uploads/reports/:filename', authRequired, (req, res) => {
     // Serve file only to authenticated users
   });
   ```

2. **Add File Cleanup**:
   ```javascript
   // Clean up old files after 7 days
   setInterval(async () => {
     const files = await fs.readdir('uploads/reports/');
     const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
     
     for (const file of files) {
       const filePath = path.join('uploads/reports/', file);
       const stats = await fs.stat(filePath);
       if (stats.birthtime.getTime() < weekAgo) {
         await fs.unlink(filePath);
       }
     }
   }, 24 * 60 * 60 * 1000); // Run daily
   ```

3. **Add Rate Limiting**:
   ```javascript
   import rateLimit from 'express-rate-limit';
   
   const uploadLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 10 // limit each IP to 10 uploads per windowMs
   });
   
   app.post('/upload-files', uploadLimiter, upload.array('files'), ...);
   ```

## Production Deployment

For production, consider:

1. **Use a CDN** (Cloudflare - free tier available)
2. **Add HTTPS** (Let's Encrypt - free)
3. **Set up monitoring** (UptimeRobot - free tier)
4. **Add backups** (rsync to another server)

This local file server solution is perfect for getting started quickly and cost-effectively!
