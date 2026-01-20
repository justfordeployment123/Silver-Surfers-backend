import { generateSeniorAccessibilityReport } from './my-app/services/report_generation/pdf_generator.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Quick PDF generation test with multiple scenarios
 * Usage: node quick-pdf-test.js [scenario-number]
 * Example: node quick-pdf-test.js 1
 */

// Define test scenarios
const scenarios = [
    {
        name: 'Google Desktop Pro',
        inputFile: 'report-www-google-com-1760617829107-lite.json',
        email_address: 'jackie@silversurfers.ai',
        url: 'https://www.google.com',
        planType: 'pro',
        formFactor: 'desktop'
    },
    {
        name: 'ChatGPT Mobile Starter',
        inputFile: 'report-chatgpt-com-1760681689254-lite.json',
        email_address: 'test@example.com',
        url: 'https://chatgpt.com',
        planType: 'starter',
        formFactor: 'mobile'
    },
    {
        name: 'Yahoo Tablet One-Time',
        inputFile: 'report-consent-yahoo-com-1760744249258-lite.json',
        email_address: 'client@yahoo.com',
        url: 'https://consent.yahoo.com',
        planType: 'onetime',
        formFactor: 'tablet'
    },
    {
        name: 'WebMD Desktop Pro',
        inputFile: 'report-www-webmd-com-1760695332252-lite.json',
        email_address: 'healthcare@test.com',
        url: 'https://www.webmd.com',
        planType: 'pro',
        formFactor: 'desktop'
    },
    {
        name: 'Medscape Desktop Starter',
        inputFile: 'report-www-medscape-com-1760681512170-lite.json',
        email_address: 'medical@test.com',
        url: 'https://www.medscape.com',
        planType: 'starter',
        formFactor: 'desktop'
    }
];

async function runScenario(scenario) {
    const inputPath = path.join(__dirname, scenario.inputFile);
    
    // Check if file exists
    if (!fs.existsSync(inputPath)) {
        console.log(`⚠️  Skipping: ${scenario.name} - File not found: ${scenario.inputFile}`);
        return null;
    }

    console.log(`\n📄 Generating: ${scenario.name}`);
    console.log(`   Input: ${scenario.inputFile}`);
    console.log(`   Plan: ${scenario.planType} | Device: ${scenario.formFactor}`);

    try {
        const result = await generateSeniorAccessibilityReport({
            inputFile: inputPath,
            outputDir: path.join(__dirname, 'test-pdf-reports'),
            email_address: scenario.email_address,
            url: scenario.url,
            planType: scenario.planType,
            formFactor: scenario.formFactor,
            device: scenario.formFactor
        });

        console.log(`   ✅ Success! Score: ${result.score}%`);
        console.log(`   📁 Saved to: ${result.reportPath}`);
        return result;
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return null;
    }
}

async function main() {
    console.log('🧪 PDF Generation Test Script\n');
    console.log('=' .repeat(60));

    const scenarioNumber = process.argv[2];

    if (scenarioNumber) {
        // Run specific scenario
        const index = parseInt(scenarioNumber) - 1;
        if (index >= 0 && index < scenarios.length) {
            console.log(`Running scenario ${scenarioNumber}: ${scenarios[index].name}\n`);
            await runScenario(scenarios[index]);
        } else {
            console.log(`❌ Invalid scenario number. Choose 1-${scenarios.length}`);
            console.log('\nAvailable scenarios:');
            scenarios.forEach((s, i) => {
                console.log(`  ${i + 1}. ${s.name}`);
            });
        }
    } else {
        // Run all scenarios
        console.log('Running all available scenarios...\n');
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const scenario of scenarios) {
            const result = await runScenario(scenario);
            if (result === null) {
                skipCount++;
            } else if (result) {
                successCount++;
            } else {
                errorCount++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 Summary:');
        console.log(`   ✅ Success: ${successCount}`);
        console.log(`   ⚠️  Skipped: ${skipCount}`);
        console.log(`   ❌ Errors: ${errorCount}`);
        console.log('\n💡 Tip: Run "node quick-pdf-test.js 1" to test just scenario 1');
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
