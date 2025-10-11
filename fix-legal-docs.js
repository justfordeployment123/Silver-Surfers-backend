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

const fixLegalDocuments = async () => {
  try {
    await connectDB();

    // Check current documents
    const allDocs = await LegalDocument.find({});
    console.log(`📊 Current documents: ${allDocs.length}`);
    
    allDocs.forEach(doc => {
      console.log(`- ${doc.type} (${doc.status}) - ${doc.title}`);
    });

    // Update all documents to published status
    const updateResult = await LegalDocument.updateMany(
      { status: 'draft' },
      { 
        status: 'published',
        effectiveDate: new Date()
      }
    );
    
    console.log(`✅ Updated ${updateResult.modifiedCount} documents to published status`);

    // Verify the fix
    const publishedDocs = await LegalDocument.find({ status: 'published' });
    console.log(`📋 Published documents: ${publishedDocs.length}`);
    
    publishedDocs.forEach(doc => {
      console.log(`- ${doc.type} (${doc.status}) - ${doc.title}`);
    });

    // Test getCurrent method
    const termsDoc = await LegalDocument.getCurrent('terms-of-use', 'en', 'US');
    console.log('\n🔍 Testing getCurrent method:');
    console.log('Terms of Use found:', termsDoc ? 'Yes' : 'No');

    if (!termsDoc) {
      console.log('❌ Still no terms document found. Creating missing documents...');
      
      // Create missing documents if they don't exist
      const termsContent = `
<h1>Terms of Use</h1>
<p><strong>Last Updated:</strong> December 15, 2024</p>
<h2>1. Acceptance of Terms</h2>
<p>By accessing and using Silver Surfers accessibility audit services, you accept and agree to be bound by the terms and provision of this agreement.</p>
<h2>2. Description of Service</h2>
<p>Silver Surfers provides digital accessibility auditing services, including website accessibility assessments, compliance reporting, and consulting guidance.</p>
<h2>3. User Accounts</h2>
<p>To access certain features of the Service, you may be required to create an account. You are responsible for maintaining the confidentiality of your account credentials.</p>
<h2>4. Contact Information</h2>
<p>If you have any questions about these Terms of Use, please contact us at legal@silversurfers.ai</p>
      `;

      const privacyContent = `
<h1>Privacy Policy</h1>
<p><strong>Last Updated:</strong> December 15, 2024</p>
<h2>1. Information We Collect</h2>
<p>We collect information you provide directly to us, such as when you create an account, subscribe to our services, or submit audit requests.</p>
<h2>2. How We Use Your Information</h2>
<p>We use the information we collect to provide, maintain, and improve our services, process audit requests, and communicate with you.</p>
<h2>3. Data Security</h2>
<p>We implement appropriate security measures to protect your personal information against unauthorized access.</p>
<h2>4. Contact Us</h2>
<p>If you have questions about this Privacy Policy, please contact us at privacy@silversurfers.ai</p>
      `;

      // Create Terms of Use
      const newTerms = new LegalDocument({
        type: 'terms-of-use',
        title: 'Terms of Use',
        content: termsContent,
        summary: 'Terms and conditions for using Silver Surfers accessibility audit services',
        version: '1.0',
        language: 'en',
        region: 'US',
        acceptanceRequired: true,
        status: 'published',
        effectiveDate: new Date(),
        slug: 'terms-of-use-v1-0'
      });

      await newTerms.save();
      console.log('✅ Created Terms of Use document');

      // Create Privacy Policy
      const newPrivacy = new LegalDocument({
        type: 'privacy-policy',
        title: 'Privacy Policy',
        content: privacyContent,
        summary: 'How we collect, use, and protect your personal information',
        version: '1.0',
        language: 'en',
        region: 'US',
        acceptanceRequired: true,
        status: 'published',
        effectiveDate: new Date(),
        slug: 'privacy-policy-v1-0'
      });

      await newPrivacy.save();
      console.log('✅ Created Privacy Policy document');
    }

    // Final test
    const finalTerms = await LegalDocument.getCurrent('terms-of-use', 'en', 'US');
    const finalPrivacy = await LegalDocument.getCurrent('privacy-policy', 'en', 'US');
    
    console.log('\n🎉 Final Results:');
    console.log('✅ Terms of Use available:', finalTerms ? 'Yes' : 'No');
    console.log('✅ Privacy Policy available:', finalPrivacy ? 'Yes' : 'No');

  } catch (error) {
    console.error('❌ Error fixing legal documents:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
};

// Run the fix
fixLegalDocuments();