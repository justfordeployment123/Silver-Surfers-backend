import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import customConfigLite from '../load_and_audit/custom-config-lite.js';

// Helper to get __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lite version audit information - simplified
const LITE_AUDIT_INFO = {
    'color-contrast': {
        title: 'Color Contrast',
        category: 'Vision',
        impact: 'Essential for seniors with vision changes to read text clearly.',
    },
    'target-size': {
        title: 'Touch Target Size',
        category: 'Motor',
        impact: 'Larger buttons help seniors with tremors or arthritis.',
    },
    // CHANGE: Replace 'font-size' with 'text-font-audit' to match your custom audit
    'text-font-audit': {
        title: 'Font Size',
        category: 'Vision',
        impact: 'Larger fonts are crucial for seniors with presbyopia.',
    },
    'viewport': {
        title: 'Mobile Design',
        category: 'Technical',
        impact: 'Proper mobile display for seniors using tablets/phones.',
    },
    'link-name': {
        title: 'Link Text',
        category: 'Cognitive',
        impact: 'Clear link descriptions help seniors navigate confidently.',
    },
    'button-name': {
        title: 'Button Labels',
        category: 'Cognitive',
        impact: 'Descriptive button text prevents confusion for seniors.',
    },
    'label': {
        title: 'Form Labels',
        category: 'Cognitive',
        impact: 'Clear form labels help seniors complete tasks successfully.',
    },
    'heading-order': {
        title: 'Content Structure',
        category: 'Cognitive',
        impact: 'Logical headings reduce cognitive load for seniors.',
    },
    'is-on-https': {
        title: 'Security',
        category: 'Security',
        impact: 'Secure connections protect seniors from online scams.',
    },
    'largest-contentful-paint': {
        title: 'Loading Speed',
        category: 'Performance',
        impact: 'Fast loading prevents seniors from thinking site is broken.',
    },
    'cumulative-layout-shift': {
        title: 'Stable Layout',
        category: 'Performance',
        impact: 'Stable pages prevent seniors from clicking wrong elements.',
    }
};

const LITE_CATEGORY_COLORS = {
    'Vision': { bg: '#E3F2FD', border: '#1976D2' },
    'Motor': { bg: '#F3E5F5', border: '#7B1FA2' },
    'Cognitive': { bg: '#E8F5E8', border: '#388E3C' },
    'Performance': { bg: '#FFF3E0', border: '#F57C00' },
    'Security': { bg: '#FFEBEE', border: '#D32F2F' },
    'Technical': { bg: '#F5F5F5', border: '#616161' }
};

// Premium features that are missing in lite version
const PREMIUM_FEATURES = {
    additionalAudits: [
        'Text Size and Readability Analysis - In-depth font analysis',
        'Interactive Elements Visual Clarity - Color-only navigation detection',
        'Text Spacing Flexibility - Layout brittleness testing',
        'Page Responsiveness - JavaScript blocking analysis',
        'Privacy-Respecting Location Requests - Geolocation audit',
        'Page Complexity Management - DOM size optimization',
        'Technical Stability - Console error detection'
    ],
    visualFeatures: [
        'Visual highlighting of problem areas on your website',
        'Before/after comparison screenshots',
        'Color contrast heatmaps',
        'Interactive element visualization',
        'Font size analysis overlays'
    ],
    detailedAnalysis: [
        'Comprehensive explanations of why each issue matters for seniors',
        'Specific code recommendations and fixes',
        'Detailed impact assessments for each accessibility barrier',
        'Step-by-step improvement guides',
        'Technical implementation details'
    ],
    reportingFeatures: [
        'Multi-page detailed findings with data tables',
        'Score calculation breakdown and methodology',
        'Category-based organization with color coding',
        'Professional client-ready formatting',
        'Downloadable client folders organized by website and device type'
    ],
    categories: {
        'Vision Accessibility': 'Complete analysis of all visual barriers affecting seniors',
        'Motor Accessibility': 'Comprehensive motor skill and dexterity assessments',
        'Cognitive Accessibility': 'Full cognitive load and usability evaluation',
        'Performance for Seniors': 'Detailed speed and responsiveness optimization',
        'Security for Seniors': 'Complete privacy and security audit',
        'Technical Accessibility': 'Full technical compliance and stability check'
    }
};

// Function to calculate the lite score
function calculateLiteScore(report) {
    const categoryId = 'senior-friendly-lite';
    const categoryConfig = customConfigLite.categories[categoryId];
    if (!categoryConfig) {
        return { finalScore: 0 };
    }

    const auditRefs = categoryConfig.auditRefs;
    const auditResults = report.audits;

    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const auditRef of auditRefs) {
        const { id, weight } = auditRef;
        const result = auditResults[id];
        const score = result ? (result.score ?? 0) : 0;
        totalWeightedScore += score * weight;
        totalWeight += weight;
    }

    const finalScore = totalWeight === 0 ? 0 : (totalWeightedScore / totalWeight) * 100;
    return { finalScore };
}

class LiteAccessibilityPDFGenerator {
    constructor() {
        this.doc = new PDFDocument({
            margin: 40,
            size: 'A4'
        });

        this.doc.registerFont('RegularFont', 'Helvetica');
        this.doc.registerFont('BoldFont', 'Helvetica-Bold');

        this.currentY = 40;
        this.pageWidth = 515;
        this.margin = 40;
    }

    addPage() {
        this.doc.addPage();
        this.currentY = this.margin;
    }

    addTitle(text, fontSize = 28) {
        this.doc.fontSize(fontSize).font('BoldFont').fillColor('#2C3E50')
            .text(text, this.margin, this.currentY, { width: this.pageWidth, align: 'center' });
        this.currentY += fontSize + 25;
    }

    addHeading(text, fontSize = 16, color = '#34495E') {
        this.doc.fontSize(fontSize).font('BoldFont').fillColor(color)
            .text(text, this.margin, this.currentY, { width: this.pageWidth });
        this.currentY += fontSize + 12;
    }

    addBodyText(text, fontSize = 11, color = '#2C3E50') {
        this.doc.fontSize(fontSize).font('RegularFont').fillColor(color)
            .text(text, this.margin, this.currentY, { width: this.pageWidth, align: 'justify', lineGap: 3 });
        this.currentY += this.doc.heightOfString(text, { width: this.pageWidth, lineGap: 3 }) + 12;
    }

    addScoreDisplay(scoreData) {
    const score = scoreData.finalScore;
    const roundedScore = Math.round(score); // Round the score first
    const centerX = this.doc.page.width / 2;
    const radius = 50;

    // Use rounded score for color logic to match displayed value
    let scoreColor = roundedScore >= 80 ? '#27AE60' : roundedScore >= 40 ? '#F39C12' : '#E74C3C';

    this.doc.circle(centerX, this.currentY + radius, radius).fill(scoreColor);
    this.doc.fontSize(40).font('BoldFont').fillColor('#FFFFFF')
        .text(roundedScore, centerX - (radius / 2), this.currentY + (radius / 2) + 5,
            { width: radius, align: 'center' });
    this.currentY += (radius * 2) + 15;
    this.doc.fontSize(14).font('BoldFont').fillColor('#2C3E50')
        .text('SilverSurfers Score (Lite)', this.margin, this.currentY,
            { width: this.pageWidth, align: 'center' });
    this.currentY += 30;
}

    addLiteResults(reportData) {
        const audits = reportData.audits || {};

        this.addBodyText('Key Areas Checked:', 12, '#2980B9');
        this.currentY += 5;

        Object.keys(LITE_AUDIT_INFO).forEach(auditId => {
            const auditResult = audits[auditId];
            const auditInfo = LITE_AUDIT_INFO[auditId];

            // Skip audits that are N/A (score is null) or don't exist
            if (auditResult && auditInfo && auditResult.score !== null) {
                const score = auditResult.score;
                let status = score === 1 ? 'PASS' :
                    score > 0.5 ? 'NEEDS WORK' : 'FAIL';

                let statusColor = score === 1 ? '#27AE60' :
                    score > 0.5 ? '#F39C12' : '#E74C3C';

                // Draw colored bullet
                this.doc.circle(this.margin + 5, this.currentY + 6, 3).fill(statusColor);

                // Add text
                this.doc.fontSize(10).font('BoldFont').fillColor('#2C3E50')
                    .text(`${auditInfo.title}: ${status}`, this.margin + 15, this.currentY);
                this.currentY += 15;

                this.doc.fontSize(9).font('RegularFont').fillColor('#666')
                    .text(auditInfo.impact, this.margin + 15, this.currentY, { width: this.pageWidth - 15 });
                this.currentY += this.doc.heightOfString(auditInfo.impact, { width: this.pageWidth - 15 }) + 8;
            }
        });
    }

    addPremiumComparisonPage() {
        this.addPage();

        // Header with gradient-like effect
        this.doc.rect(0, 0, this.doc.page.width, 100).fill('#2C3E50');
        this.doc.fontSize(24).font('BoldFont').fillColor('white')
            .text('Upgrade Now to Unlock the Detailed', this.margin, 20, { width: this.pageWidth, align: 'center' });
        this.doc.fontSize(24).font('BoldFont').fillColor('white')
            .text('Inclusion and Accessibility Analysis', this.margin, 48, { width: this.pageWidth, align: 'center' });
        this.doc.fontSize(14).font('RegularFont').fillColor('#ECF0F1')
            .text('Unlock the complete senior accessibility analysis', this.margin, 78, { width: this.pageWidth, align: 'center' });

        this.currentY = 120;

        // What you're missing section
        this.addHeading('What You\'re Missing in the Quick Scan:', 18, '#E74C3C');
        this.currentY += 10;

        // Additional Audits
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 30).fill('#FFEBEE').stroke('#E74C3C');
        this.doc.fontSize(14).font('BoldFont').fillColor('#C62828')
            .text('7 Additional Critical Audits', this.margin + 10, this.currentY + 8);
        this.currentY += 40;

        PREMIUM_FEATURES.additionalAudits.forEach(audit => {
            this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
                .text(`• ${audit}`, this.margin + 10, this.currentY);
            this.currentY += 15;
        });

        this.currentY += 10;

        // Visual Features
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 30).fill('#E3F2FD').stroke('#1976D2');
        this.doc.fontSize(14).font('BoldFont').fillColor('#0D47A1')
            .text('Visual Analysis & Screenshots', this.margin + 10, this.currentY + 8);
        this.currentY += 40;

        PREMIUM_FEATURES.visualFeatures.forEach(feature => {
            this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
                .text(`• ${feature}`, this.margin + 10, this.currentY);
            this.currentY += 15;
        });

        this.currentY += 10;

        // Detailed Analysis
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 30).fill('#E8F5E8').stroke('#388E3C');
        this.doc.fontSize(14).font('BoldFont').fillColor('#1B5E20')
            .text('Comprehensive Analysis & Recommendations', this.margin + 10, this.currentY + 8);
        this.currentY += 40;

        PREMIUM_FEATURES.detailedAnalysis.forEach(feature => {
            this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
                .text(`• ${feature}`, this.margin + 10, this.currentY);
            this.currentY += 15;
        });
    }

    addPremiumFeaturesPage() {
        this.addPage();

        this.addHeading('Premium Report Features:', 18, '#2980B9');
        this.currentY += 10;

        // Professional Reporting
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 30).fill('#FFF3E0').stroke('#F57C00');
        this.doc.fontSize(14).font('BoldFont').fillColor('#E65100')
            .text('📄 Professional Client-Ready Reports', this.margin + 10, this.currentY + 8);
        this.currentY += 40;

        PREMIUM_FEATURES.reportingFeatures.forEach(feature => {
            this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
                .text(`• ${feature}`, this.margin + 10, this.currentY);
            this.currentY += 15;
        });

        this.currentY += 20;

        // Categories comparison
        this.addHeading('Complete Category Coverage in Premium:', 16, '#8E44AD');
        this.currentY += 10;

        Object.entries(PREMIUM_FEATURES.categories).forEach(([category, description]) => {
            this.doc.fontSize(12).font('BoldFont').fillColor('#2C3E50')
                .text(category, this.margin, this.currentY);
            this.currentY += 15;
            this.doc.fontSize(10).font('RegularFont').fillColor('#666')
                .text(description, this.margin + 10, this.currentY);
            this.currentY += 20;
        });

        // Call to action
        this.currentY += 20;
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 60).fill('#27AE60').stroke('#1E8449');
        this.doc.fontSize(16).font('BoldFont').fillColor('white')
            .text('Upgrade to Premium Today!', this.margin + 10, this.currentY + 10);
        this.doc.fontSize(12).font('RegularFont').fillColor('#D5F4E6')
            .text('Get the complete senior accessibility analysis your website deserves.', this.margin + 10, this.currentY + 35);
        this.currentY += 80;

        // Comparison summary
        this.addBodyText('Quick Scan: Basic overview of 11 essential checks', 11, '#95A5A6');
        this.addBodyText('Premium Version: Comprehensive analysis of 18+ audits with visual highlighting, detailed recommendations, and professional reporting', 11, '#27AE60');
    }

    async generateLiteReport(inputFile, outputFile) { // <-- REMOVED THE DEFAULT VALUE
        try {
            const reportData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
            const scoreData = calculateLiteScore(reportData);

            const stream = fs.createWriteStream(outputFile);
            this.doc.pipe(stream);

            // Header
            this.doc.rect(0, 0, this.doc.page.width, 80).fill('#34495E');
            this.doc.fontSize(24).font('BoldFont').fillColor('white')
                .text('SilverSurfers Report', this.margin, 25, { width: this.pageWidth, align: 'center' });
            this.doc.fontSize(14).font('RegularFont').fillColor('white')
                .text('Quick Scan - Essential Checks', this.margin, 50, { width: this.pageWidth, align: 'center' });

            this.currentY = 110;

            // Website info
            if (reportData.finalUrl) {
                this.addBodyText(`Website: ${reportData.finalUrl}`, 12, '#7F8C8D');
                this.currentY += 10;
            }

            // Score
            this.addScoreDisplay(scoreData);

            // Results
            this.addLiteResults(reportData);

            // Add premium comparison page
            this.addPremiumComparisonPage();

            // Footer on last page
            this.currentY += 20;
            this.addBodyText('This Quick Scan version provides a basic overview of essential older adult inclusion and accessibility checks.  Subscription versions include comprehensive analysis, visual highlighting, detailed recommendations, and professional reporting features to help you create truly older adult-friendly digital platforms.', 10, '#95A5A6');

            this.doc.end();

            return new Promise((resolve, reject) => {
                stream.on('finish', () => {
                    console.log(`Enhanced lite accessibility report generated: ${outputFile}`);
                    resolve({
                        success: true,
                        reportPath: outputFile,
                        score: scoreData.finalScore.toFixed(0),
                        isLiteVersion: true,
                        premiumFeaturesHighlighted: true
                    });
                });
                stream.on('error', reject);
            });

        } catch (error) {
            console.error('Error generating enhanced lite report:', error.message);
            throw error;
        }
    }
}

export async function generateLiteAccessibilityReport(inputFile, outputDirectory) {
    if (!inputFile || !outputDirectory) {
        throw new Error('Both inputFile and outputDirectory are required.');
    }

    // 1. Read the JSON file to get the URL for the filename
    const reportData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    if (!reportData.finalUrl) {
        throw new Error('The report JSON must contain a finalUrl property.');
    }

    // 2. Create the sanitized report name from the URL (e.g., "www-example-com.pdf")
    const urlObject = new URL(reportData.finalUrl);
    const reportName = `${urlObject.hostname.replace(/\./g, '-')}.pdf`;

    // 3. Combine the provided directory and the new filename
    const outputPath = path.join(outputDirectory, reportName);

    // 4. Ensure the target directory exists before writing the file
    // The calling script is now responsible for the folder's name and location.
    fs.mkdirSync(outputDirectory, { recursive: true });

    // 5. Generate the report
    const generator = new LiteAccessibilityPDFGenerator();
    return await generator.generateLiteReport(inputFile, outputPath);
}