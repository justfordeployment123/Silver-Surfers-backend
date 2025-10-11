import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

// Import the actual LegalDocument model
import LegalDocument from './my-app/services/server/models/LegalDocument.js';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/silversurfers');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testAPI = async () => {
  try {
    await connectDB();

    // Test getCurrent method with the actual model
    console.log('🔍 Testing getCurrent method with actual model...');
    const termsDoc = await LegalDocument.getCurrent('terms-of-use', 'en', 'US');
    console.log('Terms of Use found:', termsDoc ? 'Yes' : 'No');
    
    if (termsDoc) {
      console.log('Document details:');
      console.log('- ID:', termsDoc._id);
      console.log('- Type:', termsDoc.type);
      console.log('- Title:', termsDoc.title);
      console.log('- Status:', termsDoc.status);
      console.log('- Version:', termsDoc.version);
      console.log('- Language:', termsDoc.language);
      console.log('- Region:', termsDoc.region);
      console.log('- Content length:', termsDoc.content.length);
    } else {
      console.log('❌ No terms document found');
      
      // Let's see what documents we have
      const allDocs = await LegalDocument.find({});
      console.log(`📊 Total documents: ${allDocs.length}`);
      allDocs.forEach(doc => {
        console.log(`- ${doc.type} (${doc.status}) - ${doc.title} - lang:${doc.language} region:${doc.region}`);
      });
    }

  } catch (error) {
    console.error('❌ Error testing API:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
};

// Run the test
testAPI();