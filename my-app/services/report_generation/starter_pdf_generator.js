import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import customConfig from '../load_and_audit/custom-config.js';

// Helper function to sanitize text for PDF rendering
function sanitizeText(text) {
    if (!text) return '';
    return String(text)
        .replace(/[™℠©®]/g, '')  // Remove special unicode symbols
        .replace(/[^\x00-\x7F]/g, '')  // Remove non-ASCII characters that may cause issues
        .trim();
}

const AUDIT_INFO = {
    'text-font-audit': {
        title: 'Text Size and Readability Analysis',
        category: 'Vision Accessibility',
        importance: 'Font size is critical for older adults who often experience presbyopia.',
        why: 'Age-related vision changes make small text nearly impossible to read.',
    },
    'color-contrast': {
        title: 'Color Contrast for Clear Vision',
        category: 'Vision Accessibility',
        importance: 'Adequate color contrast is essential for older adults.',
        why: 'Aging eyes require higher contrast to distinguish text.',
    },
    'interactive-color-audit': {
        title: 'Interactive Elements Visual Clarity',
        category: 'Vision Accessibility',
        importance: 'Older adults need clear visual cues to identify clickable elements.',
        why: 'Reduced visual acuity makes it difficult to distinguish interactive elements.',
    },
    'target-size': {
        title: 'Touch Target Size for Older Adults',
        category: 'Motor Accessibility',
        importance: 'Older adults often experience tremors or arthritis.',
        why: 'Age-related motor changes require larger, well-spaced interactive elements.',
    },
    'layout-brittle-audit': {
        title: 'Text Spacing Flexibility for Readability',
        category: 'Motor Accessibility',
        importance: 'Older adults often need to increase text spacing.',
        why: 'Many older adults require personalized text spacing to read comfortably.',
    },
    'heading-order': {
        title: 'Logical Content Structure',
        category: 'Cognitive Accessibility',
        importance: 'Clear structure helps older adults understand page content.',
        why: 'Logical organization makes navigation intuitive.',
    },
    'is-on-https': {
        title: 'Secure Connection Protection',
        category: 'Security for Older Adults',
        importance: 'HTTPS is crucial for protecting older adults from scams.',
        why: 'Older adults are frequently targeted by cybercriminals.',
    },
    'geolocation-on-start': {
        title: 'Privacy-Respecting Location Requests',
        category: 'Security for Older Adults',
        importance: 'Unexpected location requests can alarm older adults.',
        why: 'Older adults value privacy and may be suspicious of requests.',
    },
    'viewport': {
        title: 'Mobile-Friendly Design',
        category: 'Technical Accessibility',
        importance: 'Proper viewport configuration ensures correct display.',
        why: 'Responsive design helps older adults access content on preferred devices.',
    },
    'dom-size': {
        title: 'Page Complexity Management',
        category: 'Technical Accessibility',
        importance: 'Overly complex pages can slow down assistive technologies.',
        why: 'Older adults benefit from simpler page designs.',
    },
    'errors-in-console': {
        title: 'Technical Stability',
        category: 'Technical Accessibility',
        importance: 'JavaScript errors can break website functionality.',
        why: 'Older adults depend on assistive technologies.',
    },
    'font-size': {
        title: 'Overall Font Size Assessment',
        category: 'Vision Accessibility',
        importance: 'Consistent, readable font sizes ensure accessibility.',
        why: 'Predictable, large font sizes help older adults read comfortably.',
    }
};

const CATEGORY_COLORS = {
    'Vision Accessibility': { bg: '#E3F2FD', border: '#1976D2', text: '#0D47A1', emoji: '👁️' },
    'Motor Accessibility': { bg: '#F3E5F5', border: '#7B1FA2', text: '#4A148C', emoji: '👆' },
    'Cognitive Accessibility': { bg: '#E8F5E8', border: '#388E3C', text: '#1B5E20', emoji: '🧠' },
    'Performance for Older Adults': { bg: '#FFF3E0', border: '#F57C00', text: '#E65100', emoji: '⚡' },
    'Security for Older Adults': { bg: '#FFEBEE', border: '#D32F2F', text: '#B71C1C', emoji: '🔒' },
    'Technical Accessibility': { bg: '#F5F5F5', border: '#616161', text: '#212121', emoji: '⚙️' }
};

function calculateSeniorFriendlinessScore(report) {
    const categoryId = 'senior-friendly';
    const categoryConfig = customConfig.categories[categoryId];
    if (!categoryConfig) {
        console.error(`Error: '${categoryId}' category not found in config.`);
        return { finalScore: 0, totalWeightedScore: 0, totalWeight: 0, scoreTable: [] };
    }

    const auditRefs = categoryConfig.auditRefs;
    const auditResults = report.audits || {};

    let totalWeightedScore = 0;
    let totalWeight = 0;
    const scoreTable = [];

    for (const auditRef of auditRefs) {
        const { id, weight } = auditRef;
        const result = auditResults[id];

        if (result && typeof result.score === 'number') {
            const score = result.score;
            const weightedScore = score * weight;
            totalWeightedScore += weightedScore;
            totalWeight += weight;
            
            scoreTable.push({
                component: AUDIT_INFO[id]?.title || id,
                score: Math.round(score * 100),
                weight: weight,
                weighted: weightedScore.toFixed(2)
            });
        }
    }

    // Fallback: if no data matched auditRefs, populate from available audits with default weight 1
    if (scoreTable.length === 0) {
        const refMap = new Map(auditRefs.map(r => [r.id, r.weight]));
        Object.entries(auditResults).forEach(([id, result]) => {
            if (result && typeof result.score === 'number') {
                const weight = refMap.get(id) ?? 1;
                const weightedScore = result.score * weight;
                totalWeightedScore += weightedScore;
                totalWeight += weight;
                scoreTable.push({
                    component: AUDIT_INFO[id]?.title || id,
                    score: Math.round(result.score * 100),
                    weight,
                    weighted: weightedScore.toFixed(2)
                });
            }
        });
    }

    if (totalWeight === 0) {
        return { finalScore: 0, totalWeightedScore: 0, totalWeight: 0, scoreTable: [] };
    }

    const finalScore = (totalWeightedScore / totalWeight) * 100;
    return { finalScore, totalWeightedScore, totalWeight, scoreTable };
}

export class StarterAccessibilityPDFGenerator {
    constructor(options = {}) {
        this.imagePaths = options.imagePaths || {};
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

    async generateReport(inputFile, outputFile, options = {}) {
        try {
            const rawData = fs.readFileSync(inputFile, 'utf8');
            const reportData = JSON.parse(rawData);
            const scoreData = calculateSeniorFriendlinessScore(reportData);

            // Ensure output directory and file path
            const outDir = options.outputDir || process.cwd();
            const baseName = path.basename(reportData.finalUrl || reportData.url || 'report').replace(/[^a-zA-Z0-9.-]/g, '_');
            const deviceTag = options.formFactor || options.device || 'desktop';
            const finalOutputPath = outputFile && path.isAbsolute(outputFile)
                ? outputFile
                : path.join(outDir, `${baseName}-${deviceTag}-starter.pdf`);

            // Create directory if missing
            try { fs.mkdirSync(outDir, { recursive: true }); } catch {}

            // Pipe BEFORE writing any content (PDFKit requirement)
            const writeStream = fs.createWriteStream(finalOutputPath);
            this.doc.pipe(writeStream);

            // Add pages in Starter order: Title, Score Calculation, Summary, Summary Table, Detailed Results
            this.addIntroPage(reportData, scoreData);
            this.addScoreCalculationPage(reportData, scoreData);
            this.addSummaryByCategory(reportData);
            this.addSummaryTable(scoreData);
            this.addDetailedResults(reportData);

            // Finalize document and await write completion
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
                this.doc.on('error', reject);
                this.doc.end();
            });

            console.log(`✅ Starter audit PDF generated: ${finalOutputPath}`);
            return {
                success: true,
                reportPath: finalOutputPath,
                score: scoreData.finalScore,
                url: reportData.finalUrl || reportData.url || 'Unknown'
            };
        } catch (error) {
            console.error('Error generating Starter report:', error);
            throw error;
        }
    }

    addPage() {
        this.doc.addPage();
        this.currentY = this.margin;
    }

    addIntroPage(reportData, scoreData) {
        // Header background with gradient effect (simulate with overlapping rectangles)
        this.doc.rect(0, 0, this.doc.page.width, 220).fill('#6366F1');
        this.doc.rect(0, 180, this.doc.page.width, 40).fillOpacity(0.3).fill('#8B5CF6');
        this.doc.fillOpacity(1);
        
        this.doc.fontSize(32).font('BoldFont').fillColor('white').text('SilverSurfers Starter Audit', this.margin, 30, { width: this.pageWidth, align: 'center' });
        this.doc.fontSize(14).font('RegularFont').fillColor('white').text('Accessibility Audit Report', this.margin, 70, { width: this.pageWidth, align: 'center' });
        
        this.currentY = 110;

        // Website analyzed box with rounded corners (simulated)
        const boxX = (this.doc.page.width - 280) / 2;
        this.doc.roundedRect(boxX, this.currentY, 280, 50, 8).fill('#7C3AED').fillOpacity(0.9);
        this.doc.fillOpacity(1);
        this.doc.fontSize(11).font('RegularFont').fillColor('#E0E7FF').text('Website Analyzed', boxX + 20, this.currentY + 12);
        this.doc.fontSize(13).font('BoldFont').fillColor('white').text(reportData.finalUrl || 'Website', boxX + 20, this.currentY + 28, { width: 240 });
        this.currentY += 85;

        // Score display box with rounded background
        const scoreBoxX = (this.doc.page.width - 440) / 2;
        const scoreBoxY = this.currentY;
        this.doc.roundedRect(scoreBoxX, scoreBoxY, 440, 120, 12).fill('#E0E7FF').fillOpacity(0.8);
        this.doc.fillOpacity(1);

        const score = Math.round(scoreData.finalScore);
        const isPassing = score >= 70;
        const scoreColor = isPassing ? '#6366F1' : '#EF4444';
        const statusText = isPassing ? 'PASS' : 'FAIL';

        // Large score circle
        this.doc.circle(scoreBoxX + 80, scoreBoxY + 60, 45).fill('white');
        this.doc.fontSize(42).font('BoldFont').fillColor(scoreColor).text(score + '%', scoreBoxX + 35, scoreBoxY + 38, { width: 90, align: 'center' });
        this.doc.fontSize(12).font('BoldFont').fillColor(scoreColor).text(statusText, scoreBoxX + 35, scoreBoxY + 75, { width: 90, align: 'center' });

        // Score description
        this.doc.fontSize(15).font('BoldFont').fillColor('#1F2937').text('Overall SilverSurfers Score', scoreBoxX + 180, scoreBoxY + 25);
        const descText = isPassing 
            ? 'This website meets SilverSurfers accessibility\nstandards for senior-friendly design'
            : 'This website needs improvements to meet\nSilverSurfers accessibility standards';
        this.doc.fontSize(11).font('RegularFont').fillColor('#4B5563').text(descText, scoreBoxX + 180, scoreBoxY + 50, { width: 240 });

        this.currentY += 150;
        
        // Report generated timestamp
        const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        this.doc.fontSize(10).font('RegularFont').fillColor('#6B7280').text(`Report Generated: ${dateStr}`, this.margin, this.currentY, { align: 'center', width: this.pageWidth });
        this.currentY += 30;

        // Note about paid subscriptions
        const noteBoxY = this.currentY;
        this.doc.roundedRect(this.margin, noteBoxY, this.pageWidth, 30, 6).fill('#FEF3C7');
        this.doc.fontSize(11).font('BoldFont').fillColor('#92400E').text('Note:', this.margin + 15, noteBoxY + 8);
        this.doc.fontSize(10).font('RegularFont').fillColor('#78350F').text('Paid subscriptions review each page of the website submitted.', this.margin + 50, noteBoxY + 9);
        this.currentY += 50;

        // Our Mission section
        this.doc.roundedRect(this.margin, this.currentY, this.pageWidth, 90, 8).fill('#EFF6FF');
        this.doc.roundedRect(this.margin, this.currentY, 5, 90, 2).fill('#3B82F6');
        this.doc.fontSize(13).font('BoldFont').fillColor('#1E40AF').text('Our Mission: Digital Inclusion for Older Adults', this.margin + 20, this.currentY + 15);
        const missionText = 'This comprehensive SilverSurfers audit evaluates website accessibility specifically from the perspective of older adult users. We focus on the unique challenges older adults face, including age-related vision changes, motor skill considerations, cognitive processing needs, and technology familiarity levels.';
        this.doc.fontSize(10).font('RegularFont').fillColor('#1E3A8A').text(missionText, this.margin + 20, this.currentY + 38, { width: this.pageWidth - 40, align: 'justify' });
        this.currentY += 110;

        // Report Sections
        this.doc.fontSize(14).font('BoldFont').fillColor('#3B82F6').text('Report Sections', this.margin, this.currentY);
        this.currentY += 25;

        const sections = [
            { num: 1, title: 'How Your Score Was Calculated' },
            { num: 2, title: 'Audit Summary by Category' },
            { num: 3, title: 'Detailed Audit Results' }
        ];

        sections.forEach((section, index) => {
            this.doc.fontSize(11).font('BoldFont').fillColor('#1F2937').text(`Section ${section.num}:`, this.margin + 20, this.currentY);
            this.doc.fontSize(11).font('RegularFont').fillColor('#4B5563').text(section.title, this.margin + 90, this.currentY);
            this.currentY += 18;
        });
    }

    addScoreCalculationPage(reportData, scoreData) {
        this.addPage();
        this.doc.fontSize(20).font('BoldFont').fillColor('#1F2937').text('Section 1: How Your Score Was Calculated', this.margin, this.currentY);
        this.currentY += 30;
        this.doc.fontSize(11).font('RegularFont').fillColor('#4B5563').text('The final score is a weighted average of individual audits. Audits that have a greater impact on the user experience for older adults are given a higher "weight," meaning they contribute more to the final score.', this.margin, this.currentY, { width: this.pageWidth });
        this.currentY += 50;

        // Score calculation table
        try {
            console.log('[StarterPDF] Section 1 scoreTable length:', Array.isArray(scoreData.scoreTable) ? scoreData.scoreTable.length : 'N/A');
            if (Array.isArray(scoreData.scoreTable) && scoreData.scoreTable.length) {
                console.log('[StarterPDF] First 3 score rows:', scoreData.scoreTable.slice(0, 3));
            }
        } catch {}
        this.drawScoreTable(scoreData.scoreTable);
        
        this.currentY += 20;
        const finalCalc = `Final Calculation: ${scoreData.totalWeightedScore.toFixed(2)} (Total Points) / ${scoreData.totalWeight} (Total Weight) = ${scoreData.finalScore.toFixed(0)}%`;
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 30).fill('#FEF3C7').stroke('#F59E0B', 2);
        this.doc.fontSize(12).font('BoldFont').fillColor('#B45309').text(finalCalc, this.margin + 10, this.currentY + 8);
        this.currentY += 40;
    }

    drawScoreTable(scoreItems) {
        const headers = ['Audit Component', 'Score', 'Weight', 'Weighted'];
        const widths = [260, 80, 60, 115];
        const headerHeight = 30;
        const rowHeight = 25;

        // Check if scoreItems is empty
        if (!scoreItems || scoreItems.length === 0) {
            this.doc.fontSize(10).font('RegularFont').fillColor('#6B7280').text('No audit data available', this.margin, this.currentY);
            this.currentY += 30;
            return;
        }

        // Header
        this.doc.rect(this.margin, this.currentY, this.pageWidth, headerHeight).fill('#4F46E5');
        this.doc.fontSize(11).font('BoldFont').fillColor('white');
        let x = this.margin;
        headers.forEach((header, i) => {
            this.doc.text(header, x + 8, this.currentY + 8, { width: widths[i] - 16, align: 'center' });
            x += widths[i];
        });

        this.currentY += headerHeight;

        // Rows
        this.doc.fontSize(10).font('RegularFont').fillColor('#1F2937');
        scoreItems.forEach((item, idx) => {
            const bgColor = idx % 2 === 0 ? '#F9FAFB' : 'white';
            this.doc.rect(this.margin, this.currentY, this.pageWidth, rowHeight).fill(bgColor).stroke('#E5E7EB');
            
            x = this.margin;
            const componentName = sanitizeText(String(item.component || '')).substring(0, 40);
            this.doc.fontSize(9).fillColor('#1F2937').text(componentName || '—', x + 8, this.currentY + 7, { width: widths[0] - 16 });
            this.doc.fontSize(9).fillColor('#1F2937').text(String(item.score || '0') + '%', x + widths[0] + 8, this.currentY + 7, { width: widths[1] - 16, align: 'center' });
            this.doc.fontSize(9).fillColor('#1F2937').text(String(item.weight || '0'), x + widths[0] + widths[1] + 8, this.currentY + 7, { width: widths[2] - 16, align: 'center' });
            this.doc.fontSize(9).fillColor('#1F2937').text(String(item.weighted || '0'), x + widths[0] + widths[1] + widths[2] + 8, this.currentY + 7, { width: widths[3] - 16, align: 'center' });
            
            this.currentY += rowHeight;
        });
    }

    addSummaryByCategory(reportData) {
        this.addPage();
        this.doc.fontSize(20).font('BoldFont').fillColor('#1F2937').text('Section 2: Audit Summary by Category', this.margin, this.currentY);
        this.currentY += 35;

        const audits = reportData.audits || {};
        const categories = {};

        Object.keys(audits).forEach(auditId => {
            const info = AUDIT_INFO[auditId];
            const auditData = audits[auditId];
            if (info && auditData.score !== null) {
                if (!categories[info.category]) {
                    categories[info.category] = [];
                }
                categories[info.category].push({ id: auditId, info, data: auditData });
            }
        });

        // Draw 6 category boxes (2x3 grid)
        const categoryList = Object.keys(categories);
        let boxIndex = 0;

        for (let row = 0; row < 3; row++) {
            if (this.currentY > this.doc.page.height - 220) {
                this.addPage();
            }

            for (let col = 0; col < 2; col++) {
                if (boxIndex >= categoryList.length) break;

                const categoryName = categoryList[boxIndex];
                const categoryAudits = categories[categoryName];
                const colors = CATEGORY_COLORS[categoryName] || CATEGORY_COLORS['Technical Accessibility'];

                const boxX = this.margin + (col * 260);
                const boxY = this.currentY;
                const boxWidth = 250;
                const boxHeight = 130;

                // Draw box
                this.doc.rect(boxX, boxY, boxWidth, boxHeight).fill(colors.bg).stroke(colors.border, 2);

                // Category title (cleaned up)
                const categoryTitle = sanitizeText(categoryName);
                this.doc.fontSize(12).font('BoldFont').fillColor(colors.text).text(categoryTitle, boxX + 10, boxY + 10, { width: boxWidth - 20 });

                // Audit items
                let itemY = boxY + 35;
                this.doc.fontSize(10).font('RegularFont').fillColor('#1F2937');
                categoryAudits.forEach(audit => {
                    const score = audit.data.score;
                    let badge = 'Excellent';
                    let badgeColor = '#10B981';
                    if (score < 0.5) {
                        badge = 'Poor';
                        badgeColor = '#EF4444';
                    } else if (score < 0.8) {
                        badge = 'Needs Work';
                        badgeColor = '#F59E0B';
                    }

                    const auditTitle = sanitizeText(audit.info.title).substring(0, 35);
                    this.doc.fontSize(9).font('RegularFont').fillColor('#4B5563').text(auditTitle, boxX + 10, itemY, { width: boxWidth - 50 });
                    this.doc.fontSize(9).font('BoldFont').fillColor(badgeColor).text(badge, boxX + 180, itemY);
                    itemY += 22;
                });

                boxIndex++;
            }

            this.currentY += 150;
        }
    }

    addSummaryTable(scoreData) {
        this.addPage();
        this.doc.fontSize(20).font('BoldFont').fillColor('#1F2937').text('Section 3: Summary Table', this.margin, this.currentY);
        this.currentY += 35;

        // Debug
        try {
            console.log('[StarterPDF] Section 3 scoreTable length:', Array.isArray(scoreData.scoreTable) ? scoreData.scoreTable.length : 'N/A');
            if (Array.isArray(scoreData.scoreTable) && scoreData.scoreTable.length) {
                console.log('[StarterPDF] First 3 summary rows:', scoreData.scoreTable.slice(0, 3));
            }
        } catch {}

        // Check if scoreTable is empty
        if (!scoreData.scoreTable || scoreData.scoreTable.length === 0) {
            this.doc.fontSize(11).font('RegularFont').fillColor('#6B7280').text('No audit data available for summary.', this.margin, this.currentY);
            this.currentY += 30;
            return;
        }

        const headers = ['Audit Component', 'Score', 'Weight', 'Weighted Contribution'];
        const widths = [220, 75, 60, 160];
        const headerHeight = 30;
        const rowHeight = 24;

        // Header
        this.doc.rect(this.margin, this.currentY, this.pageWidth, headerHeight).fill('#4F46E5');
        this.doc.fontSize(10).font('BoldFont').fillColor('white');
        let x = this.margin;
        headers.forEach((header, i) => {
            this.doc.text(header, x + 8, this.currentY + 8, { width: widths[i] - 16, align: 'center' });
            x += widths[i];
        });

        this.currentY += headerHeight;

        // Rows
        this.doc.fontSize(9).font('RegularFont').fillColor('#1F2937');
        scoreData.scoreTable.forEach((item, idx) => {
            if (this.currentY > this.doc.page.height - 60) {
                this.addPage();
            }

            const bgColor = idx % 2 === 0 ? '#F9FAFB' : 'white';
            this.doc.rect(this.margin, this.currentY, this.pageWidth, rowHeight).fill(bgColor).stroke('#E5E7EB');
            
            x = this.margin;
            const componentName = sanitizeText(String(item.component || '')).substring(0, 30);
            this.doc.fontSize(8).fillColor('#1F2937').text(componentName || '—', x + 8, this.currentY + 6, { width: widths[0] - 16 });
            this.doc.fontSize(8).fillColor('#1F2937').text(String(item.score || '0') + '%', x + widths[0] + 8, this.currentY + 6, { width: widths[1] - 16, align: 'center' });
            this.doc.fontSize(8).fillColor('#1F2937').text(String(item.weight || '0'), x + widths[0] + widths[1] + 8, this.currentY + 6, { width: widths[2] - 16, align: 'center' });
            this.doc.fontSize(8).fillColor('#1F2937').text(String(item.weighted || '0'), x + widths[0] + widths[1] + widths[2] + 8, this.currentY + 6, { width: widths[3] - 16, align: 'center' });
            
            this.currentY += rowHeight;
        });

        this.currentY += 20;
    }

    addDetailedResults(reportData) {
        this.addPage();
        this.doc.fontSize(20).font('BoldFont').fillColor('#1F2937').text('Section 4: Detailed Audit Results', this.margin, this.currentY);
        this.currentY += 36;

        const audits = reportData.audits || {};
        
        Object.keys(audits).forEach(auditId => {
            // Check if we need a new page before adding audit item
            if (this.currentY > this.doc.page.height - 120) {
                this.addPage();
            }

            const info = AUDIT_INFO[auditId];
            const auditData = audits[auditId];

            if (!info || auditData.score === null) return;

            // Section title (cleaned)
            const cleanTitle = sanitizeText(info.title);
            this.doc.fontSize(13).font('BoldFont').fillColor('#1F2937').text(cleanTitle, this.margin, this.currentY);
            this.currentY += 9;
            
            // Underline
            this.doc.rect(this.margin, this.currentY, this.pageWidth, 2).fill('#4F46E5');
            this.currentY += 14;

            // Score and status
            const score = auditData.score;
            let status = 'Needs Work';
            let statusColor = '#F59E0B';
            if (score >= 0.8) {
                status = 'Excellent';
                statusColor = '#10B981';
            } else if (score < 0.5) {
                status = 'Poor';
                statusColor = '#EF4444';
            }

            // Render status on one line with explicit coordinates to prevent overlap
            this.doc.fontSize(10).font('RegularFont').fillColor('#4B5563').text('Status:', this.margin, this.currentY);
            this.doc.fontSize(10).font('BoldFont').fillColor(statusColor).text(status, this.margin + 60, this.currentY);
            this.currentY += 18;

            // Description - clean and format
            if (auditData.description) {
                const cleanDesc = sanitizeText(auditData.description
                    .replace(/\[(.*?)\]\(.*?\)/g, '$1'));
                if (cleanDesc) {
                    this.doc.fontSize(10).font('RegularFont').fillColor('#374151').text(cleanDesc, this.margin, this.currentY, { width: this.pageWidth });
                    this.currentY += this.doc.heightOfString(cleanDesc, { width: this.pageWidth }) + 12;
                }
            }

            // Detailed findings if available
            if (auditData.displayValue) {
                const cleanDisplayValue = sanitizeText(auditData.displayValue);
                if (cleanDisplayValue) {
                    this.doc.fontSize(9).font('BoldFont').fillColor('#1F2937').text('Detailed Results:', this.margin, this.currentY);
                    this.currentY += 12;
                    this.doc.fontSize(9).font('RegularFont').fillColor('#4B5563').text(cleanDisplayValue, this.margin, this.currentY, { width: this.pageWidth });
                    this.currentY += this.doc.heightOfString(cleanDisplayValue, { width: this.pageWidth }) + 16;
                }
            }

            this.currentY += 10;
        });
    }
}

export async function generateStarterAccessibilityReport(options = {}) {
    console.log(`📄 [StarterPDF] generateStarterAccessibilityReport called`);
    console.log(`   Options:`, { 
        hasInputFile: !!options.inputFile,
        hasOutputFile: !!options.outputFile,
        url: options.url,
        email: options.email_address,
        device: options.device,
        outputDir: options.outputDir,
        imagePathsCount: Object.keys(options.imagePaths || {}).length
    });
    
    const {
        inputFile = 'report.json',
        outputFile = 'starter-report.pdf',
        imagePaths = {},
        url,
        email_address,
        outputDir
    } = options;

    if (!url || !email_address) {
        throw new Error('url and email_address are required');
    }

    console.log(`📄 [StarterPDF] Creating generator instance...`);
    const generator = new StarterAccessibilityPDFGenerator({ imagePaths });
    
    console.log(`📄 [StarterPDF] Calling generator.generateReport...`);
    const result = await generator.generateReport(inputFile, outputFile, { ...options, outputDir, clientEmail: email_address });
    
    console.log(`📄 [StarterPDF] Report generated successfully:`, result);
    return result;
}
