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
        impact: 'Essential for older adults with vision changes to read text clearly.',
    },
    'target-size': {
        title: 'Touch Target Size',
        category: 'Motor',
        impact: 'Larger buttons help older adults with tremors or arthritis.',
    },
    // CHANGE: Replace 'font-size' with 'text-font-audit' to match your custom audit
    'text-font-audit': {
        title: 'Font Size',
        category: 'Vision',
        impact: 'Larger fonts are crucial for older adults with presbyopia.',
    },
    'viewport': {
        title: 'Mobile Design',
        category: 'Technical',
        impact: 'Proper mobile display for older adults using tablets/phones.',
    },
    'link-name': {
        title: 'Link Text',
        category: 'Cognitive',
        impact: 'Clear link descriptions help older adults navigate confidently.',
    },
    'button-name': {
        title: 'Button Labels',
        category: 'Cognitive',
        impact: 'Descriptive button text prevents confusion for older adults.',
    },
    'label': {
        title: 'Form Labels',
        category: 'Cognitive',
        impact: 'Clear form labels help older adults complete tasks successfully.',
    },
    'heading-order': {
        title: 'Content Structure',
        category: 'Cognitive',
        impact: 'Logical headings reduce cognitive load for older adults.',
    },
    'is-on-https': {
        title: 'Security',
        category: 'Security',
        impact: 'Secure connections protect older adults from online scams.',
    },
    'largest-contentful-paint': {
        title: 'Loading Speed',
        category: 'Performance',
        impact: 'Fast loading prevents older adults from thinking site is broken.',
    },
    'cumulative-layout-shift': {
        title: 'Stable Layout',
        category: 'Performance',
        impact: 'Stable pages prevent older adults from clicking wrong elements.',
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
        'Comprehensive explanations of why each issue matters for older adults',
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
        'Vision Accessibility': 'Complete analysis of all visual barriers affecting older adults',
        'Motor Accessibility': 'Comprehensive motor skill and dexterity assessments',
        'Cognitive Accessibility': 'Full cognitive load and usability evaluation',
        'Performance for Older Adults': 'Detailed speed and responsiveness optimization',
        'Security for Older Adults': 'Complete privacy and security audit',
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

    addBodyText(text, fontSize = 14, color = '#2C3E50') {
        this.doc.fontSize(fontSize).font('RegularFont').fillColor(color)
            .text(text, this.margin, this.currentY, { width: this.pageWidth, align: 'justify', lineGap: 3 });
        this.currentY += this.doc.heightOfString(text, { width: this.pageWidth, lineGap: 3 }) + 12;
    }

    addScoreDisplay(scoreData) {
    const score = scoreData.finalScore;
    const roundedScore = Math.round(score); // Round the score first
    const centerX = this.doc.page.width / 2;
    const radius = 50;

    // Three-tier color system: Pass (>=80%), Needs Improvement (70-79%), Fail (<70%)
    let scoreColor;
    if (roundedScore >= 80) {
        scoreColor = '#28A745'; // Green for Pass
    } else if (roundedScore >= 70) {
        scoreColor = '#FD7E14'; // Yellow/Orange for Needs Improvement
    } else {
        scoreColor = '#DC3545'; // Red for Fail
    }

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

        // Add page break for results
        this.addPage();
        
        // Results heading
        this.doc.fontSize(18).font('BoldFont').fillColor('#1F2937')
            .text('Accessibility Check Results', this.margin, this.currentY);
        
        // Divider line
        this.doc.moveTo(this.margin, this.currentY + 25)
            .lineTo(this.margin + this.pageWidth, this.currentY + 25)
            .lineWidth(2).stroke('#3B82F6');
        
        this.currentY += 45;
        
        // Info box
        const infoBoxHeight = 80;
        this.doc.rect(this.margin, this.currentY, this.pageWidth, infoBoxHeight).fill('#EFF6FF').stroke('#3B82F6');
        this.doc.fontSize(12).font('RegularFont').fillColor('#1E40AF')
            .text('The Quick Scan report is a limited view of the website submitted and only audits the home page.', 
                this.margin + 15, this.currentY + 18, { width: this.pageWidth - 30, align: 'left', lineGap: 3 });
        
        this.currentY += infoBoxHeight + 25;

        // Results in 2-column card grid
        const cardWidth = (this.pageWidth - 15) / 2;
        const cardHeight = 100;
        const cardSpacing = 15;
        let column = 0;
        let rowStartY = this.currentY;

        Object.keys(LITE_AUDIT_INFO).forEach((auditId, index) => {
            const auditResult = audits[auditId];
            const auditInfo = LITE_AUDIT_INFO[auditId];

            // Skip audits that are N/A (score is null) or don't exist
            if (auditResult && auditInfo && auditResult.score !== null) {
                const score = auditResult.score;
                let status = score >= 0.8 ? 'PASS' :
                    score >= 0.7 ? 'NEEDS IMPROVEMENT' : 'FAIL';

                let bgColor, borderColor, statusColor, badgeBg;
                if (score >= 0.8) {
                    bgColor = '#ECFDF5';
                    borderColor = '#10B981';
                    statusColor = '#FFFFFF';
                    badgeBg = '#10B981';
                } else if (score >= 0.7) {
                    bgColor = '#FEF3C7';
                    borderColor = '#F59E0B';
                    statusColor = '#FFFFFF';
                    badgeBg = '#F59E0B';
                } else {
                    bgColor = '#FEE2E2';
                    borderColor = '#EF4444';
                    statusColor = '#FFFFFF';
                    badgeBg = '#EF4444';
                }

                // Check if we need a new page
                if (rowStartY + cardHeight > this.doc.page.height - 50) {
                    this.addPage();
                    rowStartY = this.currentY;
                    column = 0;
                }

                const cardX = this.margin + (column * (cardWidth + cardSpacing));
                const cardY = rowStartY;

                // Draw card with left border
                this.doc.rect(cardX, cardY, cardWidth, cardHeight).fill(bgColor);
                this.doc.rect(cardX, cardY, 4, cardHeight).fill(borderColor);

                // Status badge in top right
                const badgeWidth = 90;
                const badgeHeight = 20;
                const badgeX = cardX + cardWidth - badgeWidth - 10;
                const badgeY = cardY + 8;
                this.doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 10).fill(badgeBg);
                this.doc.fontSize(11).font('BoldFont').fillColor(statusColor)
                    .text(status, badgeX, badgeY + 5, { width: badgeWidth, align: 'center' });

                // Title
                this.doc.fontSize(14).font('BoldFont').fillColor('#1F2937')
                    .text(auditInfo.title, cardX + 12, cardY + 12, { width: cardWidth - 95 });

                // Description
                this.doc.fontSize(11).font('RegularFont').fillColor('#6B7280')
                    .text(auditInfo.impact, cardX + 12, cardY + 46, { 
                        width: cardWidth - 24, 
                        height: cardHeight - 64,
                        ellipsis: true,
                        lineGap: 3
                    });

                // Move to next column or row
                column++;
                if (column >= 2) {
                    column = 0;
                    rowStartY += cardHeight + cardSpacing;
                }
            }
        });
        
        // Update currentY to after the last row
        this.currentY = rowStartY + (column > 0 ? cardHeight + cardSpacing : 0);
    }

    addPremiumComparisonPage() {
        this.addPage();

        // Header with gradient-like effect - matching website colors
        this.doc.rect(0, 0, this.doc.page.width, 100).fill('#1E40AF');
        this.doc.fontSize(20).font('BoldFont').fillColor('white')
            .text('Upgrade SilverSurfers Subscription', this.margin, 30, { width: this.pageWidth, align: 'center' });
        
        this.doc.fontSize(16).font('RegularFont').fillColor('#BFDBFE')
            .text('Unlock the complete older adult accessibility analysis', this.margin, 60, { width: this.pageWidth, align: 'center' });

        this.currentY = 130;

        // Premium features section - Boxes with blue background
        const fullBoxWidth = this.pageWidth;
        const boxHeight = 280;
        
        // Box 1: Additional Critical Audits (full width)
        this.doc.roundedRect(this.margin, this.currentY, fullBoxWidth, boxHeight, 10).fill('#1E3A8A');
        this.doc.fontSize(16).font('BoldFont').fillColor('#FFFFFF')
            .text('Receive additional critical Audits', this.margin + 15, this.currentY + 15, { width: fullBoxWidth - 30 });
        
        let yPos = this.currentY + 40;
        const bulletX = this.margin + 15;
        const textX = bulletX + 12;
        const textWidth = fullBoxWidth - 45;
        PREMIUM_FEATURES.additionalAudits.forEach(audit => {
            this.doc.fontSize(13).font('RegularFont').fillColor('#BFDBFE')
                .text('•', bulletX, yPos, { width: 14 });
            const textHeight = this.doc.heightOfString(audit, { width: textWidth - 10, lineGap: 3 });
            this.doc.text(audit, textX, yPos, { width: textWidth - 10, lineGap: 3 });
            yPos += textHeight + 10;
        });

        this.currentY += boxHeight + 20;
        
        // Box 2: Comprehensive Analysis (full width, matching)
        const box3Height = 190;
        this.doc.roundedRect(this.margin, this.currentY, fullBoxWidth, box3Height, 10).fill('#1E3A8A');
        this.doc.fontSize(16).font('BoldFont').fillColor('#FFFFFF')
            .text('Comprehensive Analysis', this.margin + 15, this.currentY + 15, { width: fullBoxWidth - 30 });
        
        yPos = this.currentY + 40;
        PREMIUM_FEATURES.detailedAnalysis.forEach(feature => {
            this.doc.fontSize(13).font('RegularFont').fillColor('#BFDBFE')
                .text('• ' + feature, this.margin + 15, yPos, { width: fullBoxWidth - 30, lineGap: 3 });
            const featureHeight = this.doc.heightOfString(feature, { width: fullBoxWidth - 45, lineGap: 3 });
            yPos += featureHeight + 10;
        });
        
        this.currentY += box3Height + 15;
        
        // Upgrade button
        const buttonWidth = 200;
        const buttonX = (this.doc.page.width - buttonWidth) / 2;
        this.doc.roundedRect(buttonX, this.currentY, buttonWidth, 40, 20).fill('#FFFFFF');
        this.doc.fontSize(14).font('BoldFont').fillColor('#1E40AF')
            .text('Upgrade Now', buttonX, this.currentY + 12, { width: buttonWidth, align: 'center' });
        
        this.currentY += 60;
        
        // Bottom explanatory text - properly wrapped
        this.doc.fontSize(12).font('RegularFont').fillColor('#6B7280')
            .text('This Quick Scan report provides a basic overview of the homepage highlighting essential older adult accessibility checks. Subscription packages includes comprehensive analysis, detailed recommendations, and professional reporting features to help you create a truly older adult-friendly digital experience.', 
                this.margin + 20, this.currentY, { width: this.pageWidth - 40, align: 'left', lineGap: 3 });
    }

    addPremiumFeaturesPage() {
        this.addPage();

        this.addHeading('Premium Report Features:', 16, '#2980B9');
        this.currentY += 10;

        // Professional Reporting
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 30).fill('#FFF3E0').stroke('#F57C00');
        this.doc.fontSize(14).font('BoldFont').fillColor('#E65100')
            .text('Professional Client-Ready Reports', this.margin + 10, this.currentY + 8);
        this.currentY += 40;

        PREMIUM_FEATURES.reportingFeatures.forEach(feature => {
            this.doc.fontSize(14).font('RegularFont').fillColor('#2C3E50')
                .text(`• ${feature}`, this.margin + 10, this.currentY, { lineGap: 3 });
            const featureHeight = this.doc.heightOfString(`• ${feature}`, { width: this.pageWidth - 20, lineGap: 3 });
            this.currentY += featureHeight + 10;
        });

        this.currentY += 20;

        // Categories comparison
        this.addHeading('Complete Category Coverage in Premium:', 16, '#8E44AD');
        this.currentY += 10;

        Object.entries(PREMIUM_FEATURES.categories).forEach(([category, description]) => {
            this.doc.fontSize(16).font('BoldFont').fillColor('#2C3E50')
                .text(category, this.margin, this.currentY);
            this.currentY += 18;
            this.doc.fontSize(14).font('RegularFont').fillColor('#666')
                .text(description, this.margin + 10, this.currentY, { lineGap: 3 });
            const descHeight = this.doc.heightOfString(description, { width: this.pageWidth - 20, lineGap: 3 });
            this.currentY += descHeight + 10;
        });

        // Call to action
        this.currentY += 20;

        // Ensure the CTA and summary fit on the page when using larger fonts
        if (this.currentY + 180 > this.doc.page.height - this.margin) {
            this.addPage();
        }

        this.doc.rect(this.margin, this.currentY, this.pageWidth, 60).fill('#27AE60').stroke('#1E8449');
        this.doc.fontSize(16).font('BoldFont').fillColor('white')
            .text('Upgrade to Premium Today!', this.margin + 10, this.currentY + 10);
        this.doc.fontSize(14).font('RegularFont').fillColor('#D5F4E6')
            .text('Get the complete older adult accessibility analysis your website deserves.', this.margin + 10, this.currentY + 35);
        this.currentY += 80;

        // Comparison summary
        this.addBodyText('Quick Scan: Basic overview of 11 essential checks', 14, '#95A5A6');
        this.addBodyText('Premium Version: Comprehensive analysis of 18+ audits with visual highlighting, detailed recommendations, and professional reporting', 14, '#27AE60');
    }

    async generateLiteReport(inputFile, outputFile) { // <-- REMOVED THE DEFAULT VALUE
        try {
            const reportData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
            const scoreData = calculateLiteScore(reportData);

            const stream = fs.createWriteStream(outputFile);
            this.doc.pipe(stream);

            // Header - align with deep blue used in premium sections
            this.doc.rect(0, 0, this.doc.page.width, 120).fill('#1E3A8A');
            
            // Title
            this.doc.fontSize(28).font('BoldFont').fillColor('white')
                .text('SilverSurfers Quick Scan Report', this.margin, 40, { width: this.pageWidth, align: 'center' });
            
            // Subtitle
            this.doc.fontSize(14).font('RegularFont').fillColor('#E3F2FD')
                .text('QUICK SCAN VERSION - ESSENTIAL CHECKS', this.margin, 80, { width: this.pageWidth, align: 'center' });

            this.currentY = 140;

            // Score section with blue background
            const scoreBoxHeight = 200;
            this.doc.rect(0, this.currentY, this.doc.page.width, scoreBoxHeight).fill('#1E3A8A');
            
            // Draw score circle with color-coded background
            const centerX = this.doc.page.width / 2;
            const circleY = this.currentY + 80;
            const roundedScore = Math.round(scoreData.finalScore);
            
            // Three-tier color system: Pass (>=80%), Needs Improvement (70-79%), Fail (<70%)
            let scoreColor;
            if (roundedScore >= 80) {
                scoreColor = '#28A745'; // Green for Pass
            } else if (roundedScore >= 70) {
                scoreColor = '#FD7E14'; // Yellow/Orange for Needs Improvement
            } else {
                scoreColor = '#DC3545'; // Red for Fail
            }
            
            // Draw colored circle
            this.doc.circle(centerX, circleY, 60).fill(scoreColor);
            
            // Score text
            this.doc.fontSize(48).font('BoldFont').fillColor('#FFFFFF').opacity(1)
                .text(`${roundedScore}%`, 0, circleY - 24, { width: this.doc.page.width, align: 'center' });
            
            // Score label
            this.doc.fontSize(14).font('RegularFont').fillColor('#FFFFFF')
                .text('SilverSurfers Score', 0, circleY + 80, { width: this.doc.page.width, align: 'center' });
            
            // Status text below score circle
            let statusText;
            if (roundedScore >= 80) {
                statusText = 'Pass - Highly accessible for older adults';
            } else if (roundedScore >= 70) {
                statusText = 'Needs Improvement - Falls below recommended standards';
            } else {
                statusText = 'Fail - Significant barriers to older adults';
            }
            
            this.doc.fontSize(12).font('BoldFont').fillColor('#FFFFFF')
                .text(statusText, 0, circleY + 105, { width: this.doc.page.width, align: 'center' });
            
            this.currentY += scoreBoxHeight + 20;

            // Website info box
            if (reportData.finalUrl) {
                this.doc.rect(this.margin, this.currentY, this.pageWidth, 70).fill('#F5F5F5');
                this.doc.fontSize(16).font('BoldFont').fillColor('#333333')
                    .text('Website Analyzed:', this.margin + 15, this.currentY + 16);
                this.doc.fontSize(14).font('RegularFont').fillColor('#3B82F6')
                    .text(reportData.finalUrl, this.margin + 15, this.currentY + 40);
                this.currentY += 90;
            }

            // Results
            this.addLiteResults(reportData);

            // Add premium comparison page
            this.addPremiumComparisonPage();

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