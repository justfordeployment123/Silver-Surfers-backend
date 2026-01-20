import { generateSeniorAccessibilityReport } from './my-app/services/report_generation/pdf_generator.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test script to generate PDFs from existing report JSON files
 * Usage: node test-pdf-generation.js
 */

async function testPDFGeneration() {
    try {
        // Configuration - EDIT THESE VALUES FOR YOUR TEST
        const config = {
            // Path to your existing report JSON file
            inputFile: path.join(__dirname, 'report-www-google-com-1760617829107-lite.json'),
            
            // Output directory for the PDF
            outputDir: path.join(__dirname, 'test-reports'),
            
            // Test email address
            email_address: 'jackie@silversurfers.ai',
            
            // Website URL (should match the report)
            url: 'https://www.google.com',
            
            // Plan type: 'pro', 'starter', or 'onetime'
            planType: 'pro',
            
            // Form factor/device: 'desktop', 'tablet', or 'mobile'
            formFactor: 'desktop',
            
            // Optional: device for report metadata
            device: 'desktop'
        };

        console.log('🚀 Starting PDF generation test...\n');
        console.log('Configuration:');
        console.log(`  Input File: ${config.inputFile}`);
        console.log(`  Output Dir: ${config.outputDir}`);
        console.log(`  Email: ${config.email_address}`);
        console.log(`  URL: ${config.url}`);
        console.log(`  Plan Type: ${config.planType}`);
        console.log(`  Form Factor: ${config.formFactor}\n`);

        // Generate the PDF
        const result = await generateSeniorAccessibilityReport(config);

        console.log('\n✅ PDF Generated Successfully!');
        console.log(`📄 Report Path: ${result.reportPath}`);
        console.log(`📊 Score: ${result.score}%`);
        console.log(`📱 Device: ${result.formFactor}`);
        console.log(`🌐 URL: ${result.url}\n`);

    } catch (error) {
        console.error('❌ Error generating PDF:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
testPDFGeneration();
