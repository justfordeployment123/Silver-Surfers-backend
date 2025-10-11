import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

// Define the LegalDocument schema
const legalDocumentSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['terms-of-use', 'privacy-policy', 'cookie-policy', 'data-processing-agreement'],
    required: true,
    index: true 
  },
  version: { type: String, required: true, default: '1.0' },
  title: { type: String, required: true },
  content: { type: String, required: true },
  summary: { type: String },
  status: { 
    type: String, 
    enum: ['draft', 'published', 'archived'], 
    default: 'published',
    index: true 
  },
  effectiveDate: { type: Date, default: Date.now },
  language: { type: String, default: 'en' },
  region: { type: String, default: 'US' },
  acceptanceRequired: { type: Boolean, default: true },
  slug: { type: String, unique: true, index: true }
}, {
  timestamps: true
});

const LegalDocument = mongoose.model('LegalDocument', legalDocumentSchema);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/silversurfers');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testLegalDocuments = async () => {
  try {
    await connectDB();

    // Check if documents exist
    const allDocs = await LegalDocument.find({});
    console.log(`📊 Total documents in database: ${allDocs.length}`);
    
    allDocs.forEach(doc => {
      console.log(`- ${doc.type} (${doc.status}) - ${doc.title}`);
    });

    // Test getCurrent method
    const termsDoc = await LegalDocument.getCurrent('terms-of-use', 'en', 'US');
    console.log('\n🔍 Testing getCurrent method:');
    console.log('Terms of Use found:', termsDoc ? 'Yes' : 'No');
    
    if (termsDoc) {
      console.log('Document details:');
      console.log('- Type:', termsDoc.type);
      console.log('- Title:', termsDoc.title);
      console.log('- Status:', termsDoc.status);
      console.log('- Version:', termsDoc.version);
      console.log('- Language:', termsDoc.language);
      console.log('- Region:', termsDoc.region);
    }

    // Test privacy policy
    const privacyDoc = await LegalDocument.getCurrent('privacy-policy', 'en', 'US');
    console.log('\nPrivacy Policy found:', privacyDoc ? 'Yes' : 'No');

  } catch (error) {
    console.error('❌ Error testing legal documents:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
};

// Run the test
testLegalDocuments();