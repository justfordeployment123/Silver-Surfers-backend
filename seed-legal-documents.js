import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

// Define the LegalDocument schema inline since we can't import the model easily
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

// Sample Terms of Use content
const termsOfUseContent = `
<h1>Terms of Use</h1>

<p><strong>Last Updated:</strong> December 15, 2024</p>

<h2>1. Acceptance of Terms</h2>
<p>By accessing and using Silver Surfers accessibility audit services ("Service"), you accept and agree to be bound by the terms and provision of this agreement.</p>

<h2>2. Description of Service</h2>
<p>Silver Surfers provides digital accessibility auditing services, including but not limited to:</p>
<ul>
  <li>Website accessibility assessments</li>
  <li>Compliance reporting (WCAG, ADA, Section 508)</li>
  <li>Accessibility certification</li>
  <li>Consulting and remediation guidance</li>
</ul>

<h2>3. User Accounts</h2>
<p>To access certain features of the Service, you may be required to create an account. You are responsible for:</p>
<ul>
  <li>Maintaining the confidentiality of your account credentials</li>
  <li>All activities that occur under your account</li>
  <li>Providing accurate and complete information</li>
</ul>

<h2>4. Acceptable Use</h2>
<p>You agree not to:</p>
<ul>
  <li>Use the Service for any unlawful purpose</li>
  <li>Attempt to gain unauthorized access to any part of the Service</li>
  <li>Interfere with or disrupt the Service or servers</li>
  <li>Use the Service to audit websites you do not own or have permission to audit</li>
</ul>

<h2>5. Payment Terms</h2>
<p>Payment for services is due according to the subscription plan selected. All fees are non-refundable unless otherwise specified.</p>

<h2>6. Intellectual Property</h2>
<p>The Service and its original content, features, and functionality are owned by Silver Surfers and are protected by international copyright, trademark, and other intellectual property laws.</p>

<h2>7. Limitation of Liability</h2>
<p>In no event shall Silver Surfers be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.</p>

<h2>8. Termination</h2>
<p>We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>

<h2>9. Changes to Terms</h2>
<p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days notice prior to any new terms taking effect.</p>

<h2>10. Contact Information</h2>
<p>If you have any questions about these Terms of Use, please contact us at:</p>
<ul>
  <li>Email: legal@silversurfers.ai</li>
  <li>Address: [Your Business Address]</li>
</ul>
`;

// Sample Privacy Policy content
const privacyPolicyContent = `
<h1>Privacy Policy</h1>

<p><strong>Last Updated:</strong> December 15, 2024</p>

<h2>1. Information We Collect</h2>
<p>We collect information you provide directly to us, such as when you:</p>
<ul>
  <li>Create an account</li>
  <li>Subscribe to our services</li>
  <li>Contact us for support</li>
  <li>Submit audit requests</li>
</ul>

<h3>Personal Information</h3>
<p>We may collect:</p>
<ul>
  <li>Name and email address</li>
  <li>Company information</li>
  <li>Payment information (processed securely through Stripe)</li>
  <li>Website URLs for auditing</li>
  <li>Communication preferences</li>
</ul>

<h3>Usage Information</h3>
<p>We automatically collect certain information when you use our Service:</p>
<ul>
  <li>Audit requests and results</li>
  <li>Usage patterns and preferences</li>
  <li>Device information</li>
  <li>IP address and browser type</li>
</ul>

<h2>2. How We Use Your Information</h2>
<p>We use the information we collect to:</p>
<ul>
  <li>Provide, maintain, and improve our services</li>
  <li>Process audit requests and generate reports</li>
  <li>Process payments and send related information</li>
  <li>Send technical notices and support messages</li>
  <li>Respond to your comments and questions</li>
  <li>Monitor and analyze usage trends</li>
</ul>

<h2>3. Information Sharing</h2>
<p>We do not sell, trade, or otherwise transfer your personal information to third parties except:</p>
<ul>
  <li>With your consent</li>
  <li>To comply with legal obligations</li>
  <li>To protect our rights and safety</li>
  <li>With service providers who assist in our operations</li>
</ul>

<h2>4. Data Security</h2>
<p>We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>

<h2>5. Data Retention</h2>
<p>We retain your information for as long as your account is active or as needed to provide services. Audit data is retained according to your subscription plan.</p>

<h2>6. Your Rights</h2>
<p>You have the right to:</p>
<ul>
  <li>Access your personal information</li>
  <li>Correct inaccurate data</li>
  <li>Delete your account and data</li>
  <li>Opt-out of marketing communications</li>
</ul>

<h2>7. Cookies and Tracking</h2>
<p>We use cookies and similar technologies to enhance your experience and analyze usage patterns. You can control cookie settings through your browser.</p>

<h2>8. Third-Party Services</h2>
<p>Our Service may contain links to third-party websites. We are not responsible for the privacy practices of these external sites.</p>

<h2>9. International Transfers</h2>
<p>Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place.</p>

<h2>10. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page.</p>

<h2>11. Contact Us</h2>
<p>If you have questions about this Privacy Policy, please contact us at:</p>
<ul>
  <li>Email: privacy@silversurfers.ai</li>
  <li>Address: [Your Business Address]</li>
</ul>
`;

const seedLegalDocuments = async () => {
  try {
    await connectDB();

    // Clear existing documents
    await LegalDocument.deleteMany({});
    console.log('🗑️ Cleared existing legal documents');

    // Create Terms of Use
    console.log('📝 Creating Terms of Use...');
    const termsDocument = new LegalDocument({
      type: 'terms-of-use',
      title: 'Terms of Use',
      content: termsOfUseContent,
      summary: 'Terms and conditions for using Silver Surfers accessibility audit services',
      version: '1.0',
      language: 'en',
      region: 'US',
      acceptanceRequired: true,
      status: 'published',
      effectiveDate: new Date(),
      slug: 'terms-of-use-v1-0'
    });

    await termsDocument.save();
    console.log('✅ Terms of Use created successfully');

    // Create Privacy Policy
    console.log('📝 Creating Privacy Policy...');
    const privacyDocument = new LegalDocument({
      type: 'privacy-policy',
      title: 'Privacy Policy',
      content: privacyPolicyContent,
      summary: 'How we collect, use, and protect your personal information',
      version: '1.0',
      language: 'en',
      region: 'US',
      acceptanceRequired: true,
      status: 'published',
      effectiveDate: new Date(),
      slug: 'privacy-policy-v1-0'
    });

    await privacyDocument.save();
    console.log('✅ Privacy Policy created successfully');

    console.log('\n🎉 All legal documents created successfully!');
    console.log('📋 Documents available at:');
    console.log('   - http://localhost:5000/legal/terms-of-use');
    console.log('   - http://localhost:5000/legal/privacy-policy');
    console.log('   - http://localhost:5000/terms');
    console.log('   - http://localhost:5000/privacy');

    // Test the API endpoints
    console.log('\n🧪 Testing API endpoints...');
    const testTerms = await LegalDocument.findOne({ type: 'terms-of-use', status: 'published' });
    const testPrivacy = await LegalDocument.findOne({ type: 'privacy-policy', status: 'published' });
    
    console.log('✅ Terms of Use found:', testTerms ? 'Yes' : 'No');
    console.log('✅ Privacy Policy found:', testPrivacy ? 'Yes' : 'No');

  } catch (error) {
    console.error('❌ Error seeding legal documents:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
};

// Run the script
seedLegalDocuments();