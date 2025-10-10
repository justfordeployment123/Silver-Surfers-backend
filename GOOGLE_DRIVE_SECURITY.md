# 🔒 Google Drive Security Guide

## Security Overview

### What You're Asking:
1. ❓ "Will links expose other files in the folder?"
2. ❓ "Can users edit files using the link?"
3. ❓ "How does security work?"

## Answers:

### 1. File-Level Permissions (NOT Folder-Level)

**Answer**: NO - Only the specific file is shared.

```javascript
// When we create a permission:
await drive.permissions.create({
  fileId: result.data.id,  // ← SPECIFIC FILE ONLY
  resource: {
    role: 'reader',
    type: 'anyone'
  }
});
```

**What This Means**:
- ✅ Permission applies to **ONE file only**
- ✅ Other files in the same folder are **NOT exposed**
- ✅ Users cannot see folder structure
- ✅ Users cannot list other files
- ✅ Each file requires its own permission

**Example**:
```
Your Google Drive:
📁 SilverSurfers Reports/
├── customer1-report.pdf  [Link created]  ← ✅ Accessible
├── customer2-report.pdf  [No link]       ← ❌ NOT accessible
├── customer3-report.pdf  [No link]       ← ❌ NOT accessible
└── internal-notes.txt    [No link]       ← ❌ NOT accessible
```

### 2. Read-Only Access (Cannot Edit)

**Answer**: NO - Users can ONLY view/download.

**Permission Levels**:
```javascript
// What we use (SAFE):
role: 'reader'      ← Can ONLY view/download

// What we DON'T use:
role: 'writer'      ← Can edit/delete (DANGEROUS)
role: 'commenter'   ← Can add comments
role: 'owner'       ← Full control
```

**What Users CAN Do**:
- ✅ View the file
- ✅ Download the file
- ✅ Print the file (if PDF)

**What Users CANNOT Do**:
- ❌ Edit the file
- ❌ Delete the file
- ❌ Rename the file
- ❌ Move the file
- ❌ Share with others
- ❌ Change permissions
- ❌ See other files
- ❌ See folder contents
- ❌ Access your Drive account

### 3. Link Security

**File ID Security**:
```
https://drive.google.com/uc?export=download&id=1NW4PBqw9vS0HOHzjo29cbaKuUwJpWk3V
                                              └── Random, unguessable ID
```

**Security Features**:
- ✅ IDs are **random** (not sequential)
- ✅ **Cannot enumerate** other files
- ✅ Extremely long and complex
- ✅ Practically impossible to guess

**Example of Impossibility**:
```
Your file:     1NW4PBqw9vS0HOHzjo29cbaKuUwJpWk3V
Another file:  19dD22P0pjSEwsMlmAQS855ov3vp_DPfJ
                ↑ Completely different, unpredictable
```

### 4. Access Control Options

#### Option A: Public Access (Current - Less Secure)
```javascript
type: 'anyone'  // Anyone with the link
```

**Pros**:
- ✅ No login required
- ✅ Works for everyone
- ✅ Simple to use

**Cons**:
- ⚠️ Link can be forwarded
- ⚠️ Anyone with link can access

#### Option B: Email-Restricted (Recommended - More Secure)
```javascript
type: 'user',
emailAddress: 'customer@email.com'
```

**Pros**:
- ✅ Only specific email can access
- ✅ Requires Google login
- ✅ Cannot be forwarded effectively

**Cons**:
- ⚠️ User must have Google account
- ⚠️ User must login

#### Option C: Domain-Restricted (Enterprise)
```javascript
type: 'domain',
domain: 'yourcompany.com'
```

**Pros**:
- ✅ Only your organization
- ✅ Good for internal use

**Cons**:
- ⚠️ Not suitable for customers

## Security Recommendations

### 1. Enable Email Restriction (Recommended)

Add to your `.env`:
```env
GOOGLE_DRIVE_RESTRICT_TO_EMAIL=true
```

**How it works**:
- File accessible **ONLY** to the recipient's email
- User must login with their Google account
- Link cannot be shared with others
- More secure than public links

### 2. Implement Link Expiration

```javascript
// Set expiration date (7 days from now)
const expirationTime = new Date();
expirationTime.setDate(expirationTime.getDate() + 7);

await drive.permissions.create({
  fileId: result.data.id,
  resource: {
    role: 'reader',
    type: 'anyone',
    expirationTime: expirationTime.toISOString()
  }
});
```

### 3. Monitor File Access

```javascript
// Check who accessed the file
const permissions = await drive.permissions.list({
  fileId: result.data.id
});

console.log('File accessed by:', permissions.data.permissions);
```

### 4. Delete Files After Download

```javascript
// Delete file after 7 days
setTimeout(async () => {
  await drive.files.delete({
    fileId: result.data.id
  });
  console.log('File deleted for security');
}, 7 * 24 * 60 * 60 * 1000);
```

## Security Comparison

| Feature | Public Link | Email-Restricted | Domain-Restricted |
|---------|-------------|------------------|-------------------|
| No login required | ✅ Yes | ❌ No | ❌ No |
| Can forward link | ⚠️ Yes | ❌ No | ❌ No |
| Needs Google account | ❌ No | ✅ Yes | ✅ Yes |
| Security level | 🔓 Low | 🔒 Medium | 🔒🔒 High |
| Good for customers | ✅ Yes | ⚠️ Maybe | ❌ No |

## Best Practices

### 1. Use Unique Filenames
```javascript
const uniqueFileName = `${baseFileName}-${timestamp}-${randomId}-${emailHash}${fileExtension}`;
```
- ✅ Prevents filename collisions
- ✅ Adds randomness
- ✅ Harder to guess patterns

### 2. Separate Folders Per Customer
```javascript
// Create customer-specific folder
const customerFolder = await drive.files.create({
  resource: {
    name: `customer-${emailHash}`,
    mimeType: 'application/vnd.google-apps.folder'
  }
});

// Upload files to customer folder
fileMetadata.parents = [customerFolder.data.id];
```

### 3. Regular Cleanup
```javascript
// Delete old files (7+ days)
const oneWeekAgo = new Date();
oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

const query = `createdTime < '${oneWeekAgo.toISOString()}'`;
const files = await drive.files.list({ q: query });

for (const file of files.data.files) {
  await drive.files.delete({ fileId: file.id });
}
```

### 4. Audit Logging
```javascript
// Log all file operations
console.log({
  timestamp: new Date(),
  action: 'file_uploaded',
  fileId: result.data.id,
  recipient: email,
  fileName: uniqueFileName,
  accessType: useEmailRestriction ? 'restricted' : 'public'
});
```

## Common Security Concerns

### Q: "Can someone guess other file IDs?"
**A**: No. File IDs are 33-character random strings with ~2^198 possible combinations. Impossible to brute force.

### Q: "If someone gets the link, can they see all my files?"
**A**: No. The link only grants access to that specific file. Your other files remain private.

### Q: "Can someone edit the file?"
**A**: No. We use `role: 'reader'` which is read-only. No editing possible.

### Q: "What if someone shares the link?"
**A**: 
- Public links: Yes, they can share (use email restriction to prevent this)
- Email-restricted: Link won't work for others

### Q: "How long does the link last?"
**A**: 
- Default: Forever (until you delete the file)
- Recommended: Set expiration (7 days) or auto-delete

### Q: "Can I revoke access?"
**A**: Yes, you can delete the permission or the file:
```javascript
// Revoke permission
await drive.permissions.delete({
  fileId: result.data.id,
  permissionId: 'anyoneWithLink'
});

// Or delete file
await drive.files.delete({ fileId: result.data.id });
```

## Summary

✅ **SECURE**: Only specific files are shared  
✅ **SECURE**: Read-only access (cannot edit)  
✅ **SECURE**: Random, unguessable file IDs  
✅ **SECURE**: File-level permissions (not folder)  
⚠️ **WARNING**: Public links can be forwarded (use email restriction)  
✅ **RECOMMENDED**: Enable email restriction for better security  
✅ **RECOMMENDED**: Set expiration dates  
✅ **RECOMMENDED**: Regular cleanup of old files  

Your implementation is **SECURE** for basic use cases. Enable email restriction for production environments.
