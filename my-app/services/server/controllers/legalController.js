import LegalDocument from '../models/LegalDocument.js';
import LegalAcceptance from '../models/LegalAcceptance.js';

export async function getLegalDocument(req, res) {
  try {
    const { type } = req.params;
    const { language = 'en', region = 'US' } = req.query;
    
    console.log(`🔍 Looking for document: type=${type}, language=${language}, region=${region}`);
    
    const document = await LegalDocument.getCurrent(type, language, region);
    console.log(`📄 Document found:`, document ? 'Yes' : 'No');
    
    if (!document) {
      const allDocs = await LegalDocument.find({});
      console.log(`📊 Total documents in database: ${allDocs.length}`);
      allDocs.forEach(doc => {
        console.log(`- ${doc.type} (${doc.status}) - lang:${doc.language} region:${doc.region}`);
      });
      
      return res.status(404).json({ error: 'Legal document not found' });
    }

    res.json({
      id: document._id,
      type: document.type,
      title: document.title,
      content: document.content,
      version: document.version,
      effectiveDate: document.effectiveDate,
      summary: document.summary,
      acceptanceRequired: document.acceptanceRequired,
      acceptanceDeadline: document.acceptanceDeadline
    });
  } catch (err) {
    console.error('Legal document fetch error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch legal document' });
  }
}

export async function getAllLegalDocuments(req, res) {
  try {
    const { language = 'en', region = 'US' } = req.query;
    
    const documents = await Promise.all([
      LegalDocument.getCurrent('terms-of-use', language, region),
      LegalDocument.getCurrent('privacy-policy', language, region)
    ]);
    
    const result = {};
    documents.forEach(doc => {
      if (doc) {
        result[doc.type] = {
          id: doc._id,
          title: doc.title,
          version: doc.version,
          effectiveDate: doc.effectiveDate,
          summary: doc.summary,
          acceptanceRequired: doc.acceptanceRequired
        };
      }
    });
    
    res.json(result);
  } catch (err) {
    console.error('Legal documents fetch error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch legal documents' });
  }
}

export async function acceptLegalDocument(req, res) {
  try {
    const { type } = req.params;
    const userId = req.user.id;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    const document = await LegalDocument.getCurrent(type);
    if (!document) {
      return res.status(404).json({ error: 'Legal document not found' });
    }
    
    const existingAcceptance = await LegalAcceptance.hasAccepted(userId, document._id);
    if (existingAcceptance) {
      return res.json({ 
        message: 'Already accepted',
        acceptedAt: existingAcceptance.acceptedAt,
        version: existingAcceptance.acceptedVersion
      });
    }
    
    const acceptance = new LegalAcceptance({
      user: userId,
      document: document._id,
      acceptedVersion: document.version,
      ipAddress,
      userAgent,
      acceptanceMethod: 'manual'
    });
    
    await acceptance.save();
    
    res.json({
      message: 'Legal document accepted successfully',
      acceptedAt: acceptance.acceptedAt,
      version: acceptance.acceptedVersion,
      documentType: document.type
    });
  } catch (err) {
    console.error('Legal acceptance error:', err?.message || err);
    res.status(500).json({ error: 'Failed to accept legal document' });
  }
}

export async function getUserAcceptances(req, res) {
  try {
    const userId = req.user.id;
    const acceptances = await LegalAcceptance.getUserAcceptances(userId);
    
    res.json({ acceptances });
  } catch (err) {
    console.error('User acceptances fetch error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch user acceptances' });
  }
}

export async function debugLegal(req, res) {
  try {
    const allDocs = await LegalDocument.find({});
    const termsDoc = await LegalDocument.getCurrent('terms-of-use', 'en', 'US');
    
    res.json({
      totalDocuments: allDocs.length,
      allDocuments: allDocs.map(doc => ({
        id: doc._id,
        type: doc.type,
        title: doc.title,
        status: doc.status,
        language: doc.language,
        region: doc.region
      })),
      termsDocument: termsDoc ? {
        id: termsDoc._id,
        type: termsDoc.type,
        title: termsDoc.title,
        status: termsDoc.status
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getAllLegalDocumentsAdmin(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const documents = await LegalDocument.find({}).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      documents: documents
    });
  } catch (err) {
    console.error('Get all legal documents error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch legal documents' });
  }
}

export async function createLegalDocument(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const {
      type,
      title,
      content,
      summary,
      version,
      language = 'en',
      region = 'US',
      acceptanceRequired = true,
      acceptanceDeadline,
      metaTitle,
      metaDescription
    } = req.body;
    
    const document = new LegalDocument({
      type,
      title,
      content,
      summary,
      version,
      language,
      region,
      acceptanceRequired,
      acceptanceDeadline: acceptanceDeadline ? new Date(acceptanceDeadline) : undefined,
      metaTitle,
      metaDescription,
      createdBy: req.user.id,
      lastModifiedBy: req.user.id,
      status: 'draft'
    });
    
    await document.save();
    
    res.status(201).json({
      message: 'Legal document created successfully',
      document: {
        id: document._id,
        type: document.type,
        title: document.title,
        version: document.version,
        status: document.status
      }
    });
  } catch (err) {
    console.error('Legal document creation error:', err?.message || err);
    res.status(500).json({ error: 'Failed to create legal document' });
  }
}

export async function updateLegalDocument(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { id } = req.params;
    const updateData = { ...req.body };
    updateData.lastModifiedBy = req.user.id;
    updateData.lastModified = new Date();
    
    const document = await LegalDocument.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Legal document not found' });
    }
    
    res.json({
      message: 'Legal document updated successfully',
      document: {
        id: document._id,
        type: document.type,
        title: document.title,
        version: document.version,
        status: document.status,
        lastModified: document.lastModified
      }
    });
  } catch (err) {
    console.error('Legal document update error:', err?.message || err);
    res.status(500).json({ error: 'Failed to update legal document' });
  }
}

export async function publishLegalDocument(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { id } = req.params;
    const document = await LegalDocument.findById(id);
    
    if (!document) {
      return res.status(404).json({ error: 'Legal document not found' });
    }
    
    await document.publish(req.user.id);
    
    res.json({
      message: 'Legal document published successfully',
      document: {
        id: document._id,
        type: document.type,
        title: document.title,
        version: document.version,
        status: document.status,
        effectiveDate: document.effectiveDate
      }
    });
  } catch (err) {
    console.error('Legal document publish error:', err?.message || err);
    res.status(500).json({ error: 'Failed to publish legal document' });
  }
}

