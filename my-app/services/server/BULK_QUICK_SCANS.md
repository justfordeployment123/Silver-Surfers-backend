# Bulk Quick Scans Feature

## Overview

The bulk quick scans feature allows admins to submit multiple URLs at once for quick scan processing. All scans are queued and processed serially on the backend.

## Endpoint

**POST** `/admin/quick-scans/bulk`

**Authentication:** Required (Admin only)

## Request Body

```json
{
  "urls": [
    "https://example.com",
    "https://another-site.com",
    "https://third-site.com"
  ],
  "email": "admin@silversurfers.ai",  // Optional, defaults to admin's email
  "firstName": "Admin",                // Optional, defaults to "Admin"
  "lastName": "User"                    // Optional, defaults to "User"
}
```

## Parameters

- **urls** (required, array): Array of URLs to scan. Maximum 50 URLs per request.
- **email** (optional, string): Email address to receive scan results. Defaults to admin's email.
- **firstName** (optional, string): First name for the scan records. Defaults to "Admin".
- **lastName** (optional, string): Last name for the scan records. Defaults to "User".

## Response

### Success Response (200)

```json
{
  "success": true,
  "message": "Bulk submission processed: 3 queued, 0 failed, 0 skipped",
  "summary": {
    "total": 3,
    "successful": 3,
    "failed": 0,
    "skipped": 0
  },
  "results": {
    "total": 3,
    "successful": [
      {
        "url": "https://example.com",
        "index": 1,
        "taskId": "1234567890-abc123-0",
        "jobId": "507f1f77bcf86cd799439011",
        "quickScanId": "507f1f77bcf86cd799439012"
      },
      {
        "url": "https://another-site.com",
        "index": 2,
        "taskId": "1234567890-abc123-1",
        "jobId": "507f1f77bcf86cd799439013",
        "quickScanId": "507f1f77bcf86cd799439014"
      }
    ],
    "failed": [],
    "skipped": []
  },
  "timestamp": "2025-12-30T18:00:00.000Z"
}
```

### Error Responses

**400 Bad Request** - Invalid input
```json
{
  "error": "Maximum 50 URLs allowed per bulk submission. You provided 75."
}
```

**403 Forbidden** - Not an admin
```json
{
  "error": "Admin access required"
}
```

**503 Service Unavailable** - Queue not initialized
```json
{
  "error": "Quick scan queue not initialized"
}
```

## Features

1. **URL Validation**: Each URL is validated and normalized before queuing
2. **Duplicate Prevention**: URLs that were scanned in the last 24 hours are skipped
3. **Error Handling**: Failed URLs are reported individually without stopping the entire batch
4. **Serial Processing**: All scans are queued and processed one at a time on the backend
5. **Detailed Results**: Returns success/failure status for each URL

## Example Usage

### cURL

```bash
curl -X POST http://localhost:5000/admin/quick-scans/bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "urls": [
      "https://example.com",
      "https://google.com",
      "https://github.com"
    ],
    "email": "admin@silversurfers.ai"
  }'
```

### JavaScript/Fetch

```javascript
const response = await fetch('http://localhost:5000/admin/quick-scans/bulk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  },
  body: JSON.stringify({
    urls: [
      'https://example.com',
      'https://google.com',
      'https://github.com'
    ],
    email: 'admin@silversurfers.ai'
  })
});

const result = await response.json();
console.log(result);
```

## Notes

- Maximum 50 URLs per bulk submission
- Each URL is validated and normalized before queuing
- URLs that were successfully scanned in the last 24 hours are automatically skipped
- Failed URLs don't prevent other URLs from being queued
- All scans are processed serially (one after another) on the backend
- Each scan will send an email to the specified email address when completed




