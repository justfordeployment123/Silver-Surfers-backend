import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import customConfig from '../load_and_audit/custom-config.js';

// Helper to get __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Elderly-focused audit information with expanded explanations and recommendations
const AUDIT_INFO = {
    'text-font-audit': {
        title: 'Text Size and Readability Analysis',
        category: 'Vision Accessibility',
        importance: 'Font size is critical for older adults who often experience presbyopia. Text smaller than 16px can be extremely difficult to read, causing eye strain.',
        why: 'Age-related vision changes make small text nearly impossible to read. Older adults need larger fonts to browse websites comfortably.',
        recommendation: 'Ensure all body text is at least 16 pixels. Use relative units like "rem" to allow users to easily scale the font size in their browser settings.',
    },
    'color-contrast': {
        title: 'Color Contrast for Clear Vision',
        category: 'Vision Accessibility',
        importance: 'Adequate color contrast is essential for older adults whose vision may be affected by cataracts or macular degeneration, making text invisible.',
        why: 'Aging eyes require higher contrast to distinguish text from backgrounds. Without it, content becomes inaccessible.',
        recommendation: 'Aim for a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text to meet WCAG AA standards, ensuring readability for most users.',
    },
    'interactive-color-audit': {
        title: 'Interactive Elements Visual Clarity',
        category: 'Vision Accessibility',
        importance: 'Older adults need clear visual cues to identify clickable elements. Relying on color alone can make navigation impossible for those with color vision changes.',
        why: 'Reduced visual acuity makes it difficult to distinguish interactive elements without clear, multi-sensory indicators (e.g., underlines, icons).',
        recommendation: 'Do not rely on color alone to indicate interactivity. Combine color with other visual cues like underlines for links or bold font weight for buttons.',
    },
    'target-size': {
        title: 'Touch Target Size for Older Adults',
        category: 'Motor Accessibility',
        importance: 'Older adults often experience tremors or arthritis. Small buttons and links are difficult to accurately tap, creating barriers to use.',
        why: 'Age-related motor changes require larger, well-spaced interactive elements. Small targets lead to frustration and prevent task completion.',
        recommendation: 'Ensure all buttons, links, and other interactive elements are at least 48x48 pixels. Provide ample spacing between targets to prevent accidental taps.',
    },
    'layout-brittle-audit': {
        title: 'Text Spacing Flexibility for Readability',
        category: 'Motor Accessibility',
        importance: 'Older adults often need to increase text spacing for better readability. Rigid layouts that break when text spacing is adjusted prevent this customization.',
        why: 'Many older adults require personalized text spacing to read comfortably. Inflexible layouts deny them this ability.',
        recommendation: 'Use flexible layout techniques (like CSS Flexbox or Grid) and avoid fixed heights on containers with text to ensure the layout adapts to user-adjusted text spacing.',
    },
    'heading-order': {
        title: 'Logical Content Structure',
        category: 'Cognitive Accessibility',
        importance: 'Proper heading hierarchy helps older adults understand content organization. A confusing structure increases cognitive load.',
        why: 'Clear information hierarchy reduces cognitive burden and helps older adults find and understand content without becoming overwhelmed.',
        recommendation: 'Structure content with a single H1 heading, followed by H2s for main sections, H3s for sub-sections, etc. Do not skip heading levels.',
    },
    'button-name': {
        title: 'Clear Button Labels',
        category: 'Cognitive Accessibility',
        importance: 'Older adults benefit from descriptive button names that clearly explain the resulting action. Vague labels like "Click here" create confusion.',
        why: 'Clear, descriptive labels help older adults understand website functionality and build confidence in their interactions.',
        recommendation: 'Button text should describe the action it will perform. For example, use "Submit Application" or "Download Report" instead of generic labels.',
    },
    'link-name': {
        title: 'Descriptive Link Text',
        category: 'Cognitive Accessibility',
        importance: 'Meaningful link text helps older adults understand where links will take them. Generic text like "Read more" creates uncertainty.',
        why: 'Descriptive links reduce confusion and help older adults navigate with confidence, understanding the purpose of each link.',
        recommendation: 'Link text should make sense out of context. Instead of a "click here" link, phrase it as "Read more about our older adults services".',
    },
    'label': {
        title: 'Form Field Labels',
        category: 'Cognitive Accessibility',
        importance: 'Clear form labels are essential for older adults who may have difficulty understanding form purposes. Missing labels create confusion.',
        why: 'Proper labels help older adults complete forms successfully, reducing frustration and abandonment of important tasks.',
        recommendation: 'Every form input should have a clearly visible and programmatically associated <label> tag. Place labels above the input field for clarity.',
    },
    'flesch-kincaid-audit': {
        title: 'Semantic Complexity Analysis',
        category: 'Cognitive Accessibility',
        importance: 'Complex language and difficult sentence structures create cognitive barriers for older adults. Age-related cognitive changes make it harder to process complex or academic writing.',
        why: 'Older adults benefit from clear, simple language that requires less mental effort to understand. High reading difficulty levels can prevent them from accessing important information and completing critical tasks.',
        recommendation: 'Aim for a Flesch-Kincaid Reading Ease score of 60 or higher (plain English level). Use shorter sentences, simpler words, and clear structure. Break complex ideas into digestible chunks. Avoid jargon and technical terms unless absolutely necessary.',
    },
    'largest-contentful-paint': {
        title: 'Page Loading Speed',
        category: 'Performance for Older Adults',
        importance: 'Slow-loading pages can confuse older adults who may think the site is broken. Fast loading builds confidence.',
        why: 'Older adults may have less patience for slow technology and may abandon sites that don\'t load quickly.',
        recommendation: 'Optimize images, use a content delivery network (CDN), and minimize render-blocking scripts to ensure the main content loads in under 2.5 seconds.',
    },
    'cumulative-layout-shift': {
        title: 'Stable Page Layout',
        category: 'Performance for Older Adults',
        importance: 'Pages that shift unexpectedly can confuse older adults and cause them to click wrong elements. Stable layouts provide predictable experiences.',
        why: 'Layout stability is crucial for older adults who need consistent, predictable interfaces.',
        recommendation: 'Specify dimensions for all images and ads to prevent content from shifting as it loads. Avoid inserting new content above existing content.',
    },
    'total-blocking-time': {
        title: 'Page Responsiveness',
        category: 'Performance for Older Adults',
        importance: 'Unresponsive pages frustrate older adults who may interpret delays as system failures. Quick responsiveness builds trust.',
        why: 'Older adults need immediate feedback from interactions to feel confident that their actions are being processed.',
        recommendation: 'Break up long-running JavaScript tasks and minimize main-thread work to ensure the page responds to user input (like clicks) quickly.',
    },
    'is-on-https': {
        title: 'Secure Connection Protection',
        category: 'Security for Older Adults',
        importance: 'HTTPS is crucial for protecting older adults who are often targets of online scams. It protects sensitive information from interception.',
        why: 'Older adults are frequently targeted by cybercriminals. Secure connections provide essential protection for their personal and financial information.',
        recommendation: 'The website should use a secure (HTTPS) connection on all pages to protect user data and build trust. This is indicated by a padlock icon in the browser\'s address bar.',
    },
    'geolocation-on-start': {
        title: 'Privacy-Respecting Location Requests',
        category: 'Security for Older Adults',
        importance: 'Unexpected location requests can alarm older adults who may not understand why a website needs their location. Clear explanations build trust.',
        why: 'Older adults value privacy and may be suspicious of unexpected requests for personal information.',
        recommendation: 'Only request the user\'s location in response to a direct user action (e.g., clicking a "Find stores near me" button). Never ask on page load.',
    },
    'viewport': {
        title: 'Mobile-Friendly Design',
        category: 'Technical Accessibility',
        importance: 'Proper viewport configuration ensures content displays correctly on all devices, which is vital as many older adults use tablets or phones.',
        why: 'Responsive design helps older adults access content on their preferred devices without text being too small or requiring horizontal scrolling.',
        recommendation: 'Include the `<meta name="viewport" content="width=device-width, initial-scale=1">` tag in the `<head>` of all pages to ensure proper rendering on mobile devices.',
    },
    'dom-size': {
        title: 'Page Complexity Management',
        category: 'Technical Accessibility',
        importance: 'Overly complex pages can slow down assistive technologies and confuse older adults. Simpler pages load faster and are easier to navigate.',
        why: 'Older adults benefit from simpler, more focused page designs that don\'t overwhelm them with too many choices.',
        recommendation: 'Keep the number of DOM elements on a page below 1,500. Simplify the page structure where possible to improve performance and reduce complexity.',
    },
    'errors-in-console': {
        title: 'Technical Stability',
        category: 'Technical Accessibility',
        importance: 'JavaScript errors can break website functionality in unexpected ways, particularly affecting assistive technologies that older adults may rely on.',
        why: 'Older adults often depend on assistive technologies, and technical errors can make websites completely unusable for them.',
        recommendation: 'Regularly check the browser\'s developer console for errors and fix them promptly to ensure a stable and reliable experience for all users.',
    },
    'font-size': {
        title: 'Overall Font Size Assessment',
        category: 'Vision Accessibility',
        importance: 'Consistent, readable font sizes ensure older adults can access all content without strain. Mixed small font sizes create accessibility barriers.',
        why: 'Predictable, large font sizes help older adults read content comfortably and maintain their independence online.',
        recommendation: 'Audit the entire site to ensure no text (other than logos or decorative text) falls below a 16 pixel computed size.',
    }
};

const CATEGORY_COLORS = {
    'Vision Accessibility': { bg: '#E3F2FD', border: '#1976D2', text: '#0D47A1' },
    'Motor Accessibility': { bg: '#F3E5F5', border: '#7B1FA2', text: '#4A148C' },
    'Cognitive Accessibility': { bg: '#E8F5E8', border: '#388E3C', text: '#1B5E20' },
    'Performance for Older Adults': { bg: '#FFF3E0', border: '#F57C00', text: '#E65100' },
    'Security for Older Adults': { bg: '#FFEBEE', border: '#D32F2F', text: '#B71C1C' },
    'Technical Accessibility': { bg: '#F5F5F5', border: '#616161', text: '#212121' }
};

// Function to calculate the weighted "Senior Friendliness" score
function calculateSeniorFriendlinessScore(report) {
    const categoryId = 'senior-friendly';
    const categoryConfig = customConfig.categories[categoryId];
    if (!categoryConfig) {
        console.error(`Error: '${categoryId}' category not found in config.`);
        return { finalScore: 0, totalWeightedScore: 0, totalWeight: 0 };
    }

    const auditRefs = categoryConfig.auditRefs;
    const auditResults = report.audits;

    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const auditRef of auditRefs) {
        const { id, weight } = auditRef;
        const result = auditResults[id];

        // MODIFICATION: Check if the audit result exists and is not 'not applicable'
        if (result && result.score !== null) {
            const score = result.score ?? 0;
            totalWeightedScore += score * weight;
            totalWeight += weight;
        }
    }

    if (totalWeight === 0) {
        return { finalScore: 0, totalWeightedScore: 0, totalWeight: 0 };
    }

    const finalScore = (totalWeightedScore / totalWeight) * 100;
    return { finalScore, totalWeightedScore, totalWeight };
}
class ElderlyAccessibilityPDFGenerator {
    constructor(options = {}) {
        this.imagePaths = options.imagePaths || {};
        this.doc = new PDFDocument({
            margin: 40,
            size: 'A4'
        });

        // Use default system fonts
        this.doc.registerFont('RegularFont', 'Helvetica');
        this.doc.registerFont('BoldFont', 'Helvetica-Bold');

        this.currentY = 40;
        this.pageWidth = 515; // Adjusted for margins
        this.margin = 40;
    }

    addPage() {
        this.doc.addPage();
        this.currentY = this.margin;
    }

    drawColorBar(category, y = null) {
        if (y !== null) this.currentY = y;
        const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['Technical Accessibility'];
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 4).fill(colors.border);
        this.currentY += 10;
    }

    addTitle(text, fontSize = 28) {
        this.doc.fontSize(fontSize).font('BoldFont').fillColor('#2C3E50').text(text, this.margin, this.currentY, { width: this.pageWidth, align: 'center' });
        this.currentY += fontSize + 25;
    }

    addSectionHeader(text, category, fontSize = 20) {
        const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['Technical Accessibility'];
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 35).fill(colors.bg);
        this.doc.rect(this.margin, this.currentY, this.pageWidth, 35).strokeColor(colors.border).lineWidth(2).stroke();
        this.doc.fontSize(fontSize).font('BoldFont').fillColor(colors.text).text(text, this.margin + 15, this.currentY + 10, { width: this.pageWidth - 30 });
        this.currentY += 50;
    }

    addHeading(text, fontSize = 16, color = '#34495E') {
        this.doc.fontSize(fontSize).font('BoldFont').fillColor(color).text(text, this.margin, this.currentY, { width: this.pageWidth });
        this.currentY += fontSize + 12;
    }

    addBodyText(text, fontSize = 11, color = '#2C3E50') {
        this.doc.fontSize(fontSize).font('RegularFont').fillColor(color).text(text, this.margin, this.currentY, { width: this.pageWidth, align: 'justify', lineGap: 3 });
        this.currentY += this.doc.heightOfString(text, { width: this.pageWidth, lineGap: 3 }) + 12;
    }

    addScoreBar(score, label) {
        const barWidth = 200;
        const barHeight = 20;
        const startX = this.margin;
        let scoreColor = '#E74C3C';
        let scoreText = 'Needs Improvement';
        if (score === null) {
            scoreColor = '#95A5A6';
            scoreText = 'Not Applicable';
        } else if (score === 1) {
            scoreColor = '#27AE60';
            scoreText = 'Excellent for Older Adults';
        } else if (score > 0.8) {
            scoreColor = '#2ECC71';
            scoreText = 'Good for Older Adults';
        } else if (score > 0.5) {
            scoreColor = '#F39C12';
            scoreText = 'Moderate Issues';
        }
        this.doc.rect(startX, this.currentY, barWidth, barHeight).fillColor('#ECF0F1').fill();
        if (score !== null) {
            this.doc.rect(startX, this.currentY, barWidth * Math.max(score, 0.05), barHeight).fillColor(scoreColor).fill();
        }
        this.doc.fontSize(12).font('BoldFont').fillColor('#2C3E50').text(`${label}: ${scoreText}`, startX + barWidth + 15, this.currentY + 5);
        this.currentY += barHeight + 15;
    }

addOverallScoreDisplay(scoreData) {
    const score = scoreData.finalScore;
    const roundedScore = Math.round(score);
    const centerX = this.doc.page.width / 2;
    const radius = 60;

    // Determine pass/fail status based on 70% threshold
    const isPassing = roundedScore >= 70;
    const resultText = isPassing ? 'PASS' : 'FAIL';
    const resultColor = isPassing ? '#27AE60' : '#E74C3C';

    const scoreColor = isPassing ? '#27AE60' : '#E74C3C';


    // Add prominent PASS/FAIL indicator with background box
    const resultBoxHeight = 45;
    const resultBoxWidth = 200;
    const resultBoxX = centerX - (resultBoxWidth / 2);
    
    // Draw colored background box for the result
    this.doc.rect(resultBoxX, this.currentY, resultBoxWidth, resultBoxHeight)
        .fill(resultColor)
        .stroke('#FFFFFF', 3);
    
    // Add white border for contrast
    this.doc.rect(resultBoxX - 2, this.currentY - 2, resultBoxWidth + 4, resultBoxHeight + 4)
        .stroke('#2C3E50', 2);
    
    // Add PASS/FAIL text with large, prominent styling
    this.doc.fontSize(28).font('BoldFont').fillColor('#FFFFFF')
        .text(resultText, resultBoxX, this.currentY + 8,
            { width: resultBoxWidth, align: 'center' });
    
    this.currentY += resultBoxHeight + 25;

    // Draw the score circle
    this.doc.circle(centerX, this.currentY + radius, radius).fill(scoreColor);
    this.doc.fontSize(50).font('BoldFont').fillColor('#FFFFFF')
        .text(roundedScore, centerX - (radius / 2), this.currentY + (radius / 2) + 5,
            { width: radius, align: 'center' });
    this.currentY += (radius * 2) + 15;
    
    // Add the score label
    this.doc.fontSize(16).font('BoldFont').fillColor('#2C3E50')
        .text('Overall SilverSurfers Score', this.margin, this.currentY,
            { width: this.pageWidth, align: 'center' });
    this.currentY += 40;

    // Add explanatory text about pass/fail threshold
    if (!isPassing) {
        this.doc.fontSize(12).font('RegularFont').fillColor('#E74C3C')
            .text('This website did not meet the SilverSurfers accessibility standards (70% minimum required)',
                this.margin, this.currentY, { width: this.pageWidth, align: 'center' });
        this.currentY += 20;
    } else {
        this.doc.fontSize(12).font('RegularFont').fillColor('#27AE60')
            .text('This website meets SilverSurfers accessibility standards for senior-friendly design',
                this.margin, this.currentY, { width: this.pageWidth, align: 'center' });
        this.currentY += 20;
    }
}
    addIntroPage(reportData, scoreData, planType = 'pro') {
        // Header background with gradient effect (simulate with overlapping rectangles)
        this.doc.rect(0, 0, this.doc.page.width, 220).fill('#6366F1');
        this.doc.rect(0, 180, this.doc.page.width, 40).fillOpacity(0.3).fill('#8B5CF6');
        this.doc.fillOpacity(1);
        let heading = 'SilverSurfers Pro Audit';
        if (planType && typeof planType === 'string') {
            if (planType.toLowerCase().includes('starter')) heading = 'SilverSurfers Starter Audit';
            else if (planType.toLowerCase().includes('onetime')) heading = 'SilverSurfers One-Time Audit';
            else if (planType.toLowerCase().includes('pro')) heading = 'SilverSurfers Pro Audit';
        }
        this.doc.fontSize(32).font('BoldFont').fillColor('white').text(heading, this.margin, 30, { width: this.pageWidth, align: 'center' });
        this.doc.fontSize(14).font('RegularFont').fillColor('white').text('Accessibility Audit Report', this.margin, 70, { width: this.pageWidth, align: 'center' });
        
        this.currentY = 110;

        // Calculate isPassing based on score
        const score = Math.round(scoreData.finalScore);
        const isPassing = score >= 70;

        // Website analyzed box with rounded corners (simulated)
        if (reportData.finalUrl) {
            const boxX = (this.doc.page.width - 280) / 2;
            const urlText = reportData.finalUrl;
            const urlFontSize = 13;
            const urlBoxWidth = 240;
            this.doc.fontSize(urlFontSize).font('BoldFont');
            // Calculate height needed for URL (wrap to multiple lines if needed)
            const urlHeight = this.doc.heightOfString(urlText, { width: urlBoxWidth, align: 'left' });
            const minBoxHeight = 50;
            const boxHeight = Math.max(minBoxHeight, urlHeight + 32); // 32 for label and padding
            // Draw box
            this.doc.roundedRect(boxX, this.currentY, 280, boxHeight, 8).fill('#7C3AED').fillOpacity(0.9);
            this.doc.fillOpacity(1);
            // Draw label
            this.doc.fontSize(11).font('RegularFont').fillColor('#E0E7FF').text('Website Analyzed', boxX + 20, this.currentY + 12);
            // Draw URL, vertically centered
            this.doc.fontSize(urlFontSize).font('BoldFont').fillColor('white');
            const urlY = this.currentY + 28 + Math.max(0, (boxHeight - minBoxHeight) / 2 - 8); // center if taller
            this.doc.text(urlText, boxX + 20, urlY, { width: urlBoxWidth, align: 'left' });
            this.currentY += boxHeight + 15;
        } else {
            this.currentY += 85;
        }

        // Score display box with rounded background
        const scoreBoxX = (this.doc.page.width - 440) / 2;
        const scoreBoxY = this.currentY;
        this.doc.roundedRect(scoreBoxX, scoreBoxY, 440, 120, 12).fill('#E0E7FF').fillOpacity(0.8);
        this.doc.fillOpacity(1);

        // score already declared above
        let scoreColor = '#EF4444'; // red
        let statusText = 'FAIL';
        if (score >= 70) {
            scoreColor = '#22C55E'; // green
            statusText = 'PASS';
        } else if (score >= 50) {
            scoreColor = '#FACC15'; // yellow
            statusText = 'WARNING';
        }
        // Large score circle with colored border
        this.doc.save();
        this.doc.circle(scoreBoxX + 80, scoreBoxY + 60, 45).fill('white').stroke(scoreColor).lineWidth(6).stroke();
        this.doc.restore();
        this.doc.fontSize(42).font('BoldFont').fillColor(scoreColor).text(score + '%', scoreBoxX + 35, scoreBoxY + 38, { width: 90, align: 'center' });
        this.doc.fontSize(12).font('BoldFont').fillColor(scoreColor).text(statusText, scoreBoxX + 35, scoreBoxY + 75, { width: 90, align: 'center' });

        // Score description
        this.doc.fontSize(15).font('BoldFont').fillColor('#1F2937').text('Overall SilverSurfers Score', scoreBoxX + 180, scoreBoxY + 25);
        const descText = isPassing 
            ? 'This website meets SilverSurfers accessibility\nstandards (70% minimum required)'
            : 'This website did not meet the SilverSurfers\naccessibility standards (70% minimum required)';
        this.doc.fontSize(11).font('RegularFont').fillColor('#4B5563').text(descText, scoreBoxX + 180, scoreBoxY + 50, { width: 240 });

        this.currentY += 150;
        
        // Report generated timestamp
        const timestamp = new Date(reportData.fetchTime).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
        this.doc.fontSize(10).font('RegularFont').fillColor('#6B7280').text(`Report Generated: ${timestamp}`, this.margin, this.currentY, { align: 'center', width: this.pageWidth });
        this.currentY += 40;

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
        
        // Section title
        this.doc.fontSize(18).font('BoldFont').fillColor('#1F2937').text('Section 1: How Your Score Was Calculated', this.margin, this.currentY);
        this.currentY += 25;
        
        // Horizontal line
        this.doc.moveTo(this.margin, this.currentY).lineTo(this.margin + this.pageWidth, this.currentY).stroke('#E5E7EB');
        this.currentY += 20;
        
        // Explanation text
        this.doc.fontSize(10).font('RegularFont').fillColor('#4B5563').text(
            'The final score is a weighted average of individual audits. Audits that have a greater impact on the user experience for older adults are given a higher "weight," meaning they contribute more to the final score.',
            this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 }
        );
        this.currentY += 45;

        const auditRefs = customConfig.categories['senior-friendly']?.auditRefs || [];
        const auditResults = reportData.audits;

        // Filter out N/A audits before creating the table
        const tableItems = auditRefs
            .map(ref => {
                const result = auditResults[ref.id];
                if (!result || result.score === null) {
                    return null;
                }
                const score = result.score ?? 0;
                const weightedScore = score * ref.weight;
                return {
                    name: AUDIT_INFO[ref.id]?.title || ref.id,
                    score: (score * 100).toFixed(0) + '%',
                    weight: ref.weight,
                    contribution: weightedScore.toFixed(2),
                };
            })
            .filter(item => item !== null);

        // Draw compact table
        this.drawScoreCalculationTable(tableItems, scoreData);
    }

   addSummaryPage(reportData) {
        this.addPage();
        
        // Section title
        this.doc.fontSize(18).font('BoldFont').fillColor('#1F2937').text('Section 2: Audit Summary by Category', this.margin, this.currentY);
        this.currentY += 25;
        
        // Horizontal line
        this.doc.moveTo(this.margin, this.currentY).lineTo(this.margin + this.pageWidth, this.currentY).stroke('#E5E7EB');
        this.currentY += 20;
        
        // Add summary introduction text
        this.doc.fontSize(10).font('RegularFont').fillColor('#4B5563').text(
            'This section provides a high-level overview of your website\'s accessibility performance across different categories. Each category focuses on specific aspects of senior-friendly design, from visual clarity to cognitive ease.',
            this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 }
        );
        this.currentY += 45;
        
        const audits = reportData.audits || {};
        const categories = {};

        Object.keys(audits).forEach(auditId => {
            const info = AUDIT_INFO[auditId];
            const auditData = audits[auditId];

            if (info && auditData.score !== null) {
                if (!categories[info.category]) {
                    categories[info.category] = [];
                }
                categories[info.category].push({ id: auditId, info, data: audits[auditId] });
            }
        });

        // Draw cards in a 2-column layout
        this.drawCategoryCards(categories);
    }
    
    drawCategoryCards(categories) {
        const cardWidth = (this.pageWidth - 15) / 2; // 2 columns with gap
        const cardGap = 15;
        const categoryIcons = {
            'Security for Older Adults': '🔒',
            'Technical Accessibility': '⚙️',
            'Performance for Older Adults': '⚡',
            'Cognitive Accessibility': '🧠',
            'Vision Accessibility': '👁️',
            'Motor Accessibility': '👆'
        };
        
        const categoryNames = Object.keys(categories);
        let cardIndex = 0;
        
        categoryNames.forEach((categoryName, index) => {
            const column = cardIndex % 2;
            const cardX = this.margin + (column * (cardWidth + cardGap));
            
            // Check if we need a new page
            if (this.currentY > 650) {
                this.addPage();
                cardIndex = 0;
            }
            
            const categoryAudits = categories[categoryName];
            const auditCount = categoryAudits.length;
            const cardHeight = 60 + (auditCount * 28); // Header + audits
            
            // Draw card background
            this.doc.roundedRect(cardX, this.currentY, cardWidth, cardHeight, 8)
                .fill('#FFFFFF')
                .stroke('#E5E7EB');
            
            // Category header (without emoji since they don't render properly in PDFKit)
            this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6')
                .text(categoryName, cardX + 12, this.currentY + 15, { width: cardWidth - 24 });
            
            let auditY = this.currentY + 45;
            
            // Draw each audit
            categoryAudits.forEach(audit => {
                const score = audit.data.score;
                let scoreText = 'Poor';
                let bgColor = '#FEE2E2';
                let textColor = '#991B1B';
                
                if (score === 1) {
                    scoreText = 'Excellent';
                    bgColor = '#D1FAE5';
                    textColor = '#065F46';
                } else if (score > 0.8) {
                    scoreText = 'Good';
                    bgColor = '#DBEAFE';
                    textColor = '#1E40AF';
                } else if (score > 0.5) {
                    scoreText = 'Needs Work';
                    bgColor = '#FEF3C7';
                    textColor = '#92400E';
                }
                
                // Audit name
                this.doc.fontSize(9).font('RegularFont').fillColor('#374151')
                    .text(audit.info.title, cardX + 12, auditY, { width: cardWidth - 90 });
                
                // Score badge
                const badgeWidth = 70;
                const badgeX = cardX + cardWidth - badgeWidth - 12;
                this.doc.roundedRect(badgeX, auditY - 2, badgeWidth, 18, 4).fill(bgColor);
                this.doc.fontSize(8).font('BoldFont').fillColor(textColor)
                    .text(scoreText, badgeX, auditY + 3, { width: badgeWidth, align: 'center' });
                
                auditY += 28;
            });
            
            // Move to next position
            if (column === 1) {
                this.currentY += cardHeight + 15;
                cardIndex = 0;
            } else {
                cardIndex++;
            }
        });
        
        // If we ended on left column, move down
        if (cardIndex === 1) {
            this.currentY += 100; // Approximate height of last card
        }
        
        this.currentY += 20;
    }

   addAuditDetailPage(auditId, auditData) {
    console.log(`[DEBUG] Processing audit: ${auditId}, Score: ${auditData.score}, Type: ${typeof auditData.score}`);

    this.addPage();
    const info = AUDIT_INFO[auditId];
    if (!info) return;
    
    // Title with score badge on the right
    const score = auditData.score ?? 0;
    let scoreText = 'Poor';
    let scoreColor = '#EF4444';
    if (score === 1) {
        scoreText = 'Excellent';
        scoreColor = '#10B981';
    } else if (score > 0.8) {
        scoreText = 'Good for Older Adults';
        scoreColor = '#3B82F6';
    } else if (score > 0.5) {
        scoreText = 'Needs Work';
        scoreColor = '#F59E0B';
    } else {
        scoreText = 'Needs Improvement';
        scoreColor = '#EF4444';
    }
    
    // Draw title
    this.doc.fontSize(20).font('BoldFont').fillColor('#1F2937').text(info.title, this.margin, this.currentY, { width: this.pageWidth * 0.65 });
    
    // Draw score label and badge aligned to the right
    const scoreY = this.currentY;
    const rightX = this.margin + this.pageWidth - 180;
    this.doc.fontSize(9).font('RegularFont').fillColor('#9CA3AF').text('SILVERSURFERS SCORE', rightX, scoreY, { align: 'right', width: 180 });
    this.doc.fontSize(13).font('BoldFont').fillColor(scoreColor).text(scoreText, rightX, scoreY + 15, { align: 'right', width: 180 });
    
    this.currentY += 40;
    
    // Horizontal line
    this.doc.moveTo(this.margin, this.currentY).lineTo(this.margin + this.pageWidth, this.currentY).stroke('#E5E7EB');
    this.currentY += 20;
    
    // Description text
    if (auditData.description) {
        const description = auditData.description;
        let cleanText = description.replace(/\[(.*?)\]\(.*?\)/g, '$1').trim();

        if (cleanText.length > 0 && !cleanText.endsWith('.')) {
            cleanText += '.';
        }

        const lastDotIndex = cleanText.lastIndexOf('.');
        if (lastDotIndex > -1) {
            const secondToLastDotIndex = cleanText.substring(0, lastDotIndex).lastIndexOf('.');
            if (secondToLastDotIndex > -1) {
                cleanText = cleanText.substring(0, secondToLastDotIndex + 1);
            }
        }

        if (cleanText.length > 0) {
            this.doc.fontSize(11).font('RegularFont').fillColor('#6B7280').text(cleanText, this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 });
            const textHeight = this.doc.heightOfString(cleanText, { width: this.pageWidth, lineGap: 2 });
            this.currentY += textHeight + 20;
        }
    }

    // Why This Matters section - with card background
    const whyStartY = this.currentY;
    this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6').text('Why This Matters for SilverSurfers', this.margin, this.currentY);
    this.currentY += 18;
    const whyTextStartY = this.currentY;
    this.doc.fontSize(11).font('RegularFont').fillColor('#374151').text(info.importance, this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 });
    const importanceHeight = this.doc.heightOfString(info.importance, { width: this.pageWidth, lineGap: 2 });
    this.currentY += importanceHeight + 18;
    
    // Draw background card for Why This Matters
    const whyCardHeight = this.currentY - whyStartY + 5;
    this.doc.rect(this.margin - 5, whyStartY - 5, this.pageWidth + 10, whyCardHeight)
        .fillOpacity(0.3).fill('#EFF6FF').fillOpacity(1);
    
    // Redraw text on top of background
    this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6').text('Why This Matters for SilverSurfers', this.margin, whyStartY);
    this.doc.fontSize(11).font('RegularFont').fillColor('#374151').text(info.importance, this.margin, whyTextStartY, { width: this.pageWidth, lineGap: 2 });
    this.currentY += 10;
    
    // Impact section - with card background
    const impactStartY = this.currentY;
    this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6').text('Impact on SilverSurfers', this.margin, this.currentY);
    this.currentY += 18;
    const impactTextStartY = this.currentY;
    this.doc.fontSize(11).font('RegularFont').fillColor('#374151').text(info.why, this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 });
    const whyHeight = this.doc.heightOfString(info.why, { width: this.pageWidth, lineGap: 2 });
    this.currentY += whyHeight + 18;
    
    // Draw background card for Impact
    const impactCardHeight = this.currentY - impactStartY + 5;
    this.doc.rect(this.margin - 5, impactStartY - 5, this.pageWidth + 10, impactCardHeight)
        .fillOpacity(0.3).fill('#EFF6FF').fillOpacity(1);
    
    // Redraw text on top of background
    this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6').text('Impact on SilverSurfers', this.margin, impactStartY);
    this.doc.fontSize(11).font('RegularFont').fillColor('#374151').text(info.why, this.margin, impactTextStartY, { width: this.pageWidth, lineGap: 2 });
    this.currentY += 10;
    
    // How to Improve section - with card background
    if (info.recommendation) {
        const howToStartY = this.currentY;
        this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6').text('How to Improve for SilverSurfers', this.margin, this.currentY);
        this.currentY += 18;
        const howToTextStartY = this.currentY;
        this.doc.fontSize(11).font('RegularFont').fillColor('#374151').text(info.recommendation, this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 });
        const recHeight = this.doc.heightOfString(info.recommendation, { width: this.pageWidth, lineGap: 2 });
        this.currentY += recHeight + 18;
        
        // Draw background card for How to Improve
        const howToCardHeight = this.currentY - howToStartY + 5;
        this.doc.rect(this.margin - 5, howToStartY - 5, this.pageWidth + 10, howToCardHeight)
            .fillOpacity(0.3).fill('#EFF6FF').fillOpacity(1);
        
        // Redraw text on top of background
        this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6').text('How to Improve for SilverSurfers', this.margin, howToStartY);
        this.doc.fontSize(11).font('RegularFont').fillColor('#374151').text(info.recommendation, this.margin, howToTextStartY, { width: this.pageWidth, lineGap: 2 });
        this.currentY += 10;
    }
    
    // Detailed Results section with left border and card background
    if (auditData.displayValue) {
        const detailedStartY = this.currentY;
        
        // Draw left border
        this.doc.rect(this.margin - 5, detailedStartY, 4, 70).fill('#3B82F6');
        
        // Background box
        this.doc.rect(this.margin - 5, detailedStartY, this.pageWidth + 10, 70).fill('#F9FAFB');
        
        // Content
        this.doc.fontSize(11).font('BoldFont').fillColor('#1F2937').text('Detailed Results', this.margin + 10, detailedStartY + 12);
        this.doc.fontSize(11).font('RegularFont').fillColor('#4B5563').text(auditData.displayValue, this.margin + 10, detailedStartY + 32, { width: this.pageWidth - 20 });
        this.currentY += 85;
    }
}
    
    addImagePage(auditId) {
        const imageFile = this.imagePaths[auditId];
        if (!imageFile || !fs.existsSync(imageFile)) {
            return;
        }
        this.addPage();
        const info = AUDIT_INFO[auditId];
        if (info) {
            this.drawColorBar(info.category);
            this.addHeading(`Visual Analysis: ${info.title}`, 18, '#2C3E50');
        }
        try {
            this.doc.image(imageFile, this.margin, this.currentY, { fit: [this.pageWidth, 650], align: 'center' });
        } catch (error) {
            console.error(`Error adding image ${imageFile}:`, error.message);
            this.addBodyText(`Visual analysis image unavailable: ${imageFile}`);
        }
    }
    
    addTablePages(auditId, auditData) {
    if (!auditData.details?.items || auditData.details.items.length === 0) return;
    
    const info = AUDIT_INFO[auditId];
    const tableConfig = this.getTableConfig(auditId);
    const items = auditData.details.items;
    
    // PRE-CHECK: Determine if table would be skipped due to all N/A locations
    const locationIndex = tableConfig.headers.findIndex(h => 
        h.toLowerCase().includes('location') || h.toLowerCase().includes('element location')
    );
    
    if (locationIndex !== -1) {
        const itemsWithValidLocation = items.filter(item => {
            const locationValue = tableConfig.extractors[locationIndex](item);
            return locationValue && locationValue !== 'N/A' && locationValue.trim() !== '';
        });
        
        // If all rows would be filtered out, skip the entire page
        if (itemsWithValidLocation.length === 0) {
            console.log(`Skipping 'Detailed Findings' page for ${auditId} - all locations are N/A`);
            return; // Exit without adding any page
        }
    }
    
    // Check if we need a new page or can continue on current page
    const needsNewPage = this.currentY > 600; // If we're far down the page, add new page
    
    if (needsNewPage) {
        this.addPage();
    } else {
        this.currentY += 10; // Add some spacing if continuing on same page
    }
    
    // Add "Detailed Findings (Sample)" header with blue color
    this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6').text('Detailed Findings (Sample)', this.margin, this.currentY);
    this.currentY += 25;

    const itemsPerPage = 12;
    for (let i = 0; i < items.length; i += itemsPerPage) {
        if (i > 0) {
            this.addPage();
            this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6').text(`Detailed Findings (Sample) - Continued`, this.margin, this.currentY);
            this.currentY += 25;
        }
        this.drawEnhancedTable(items.slice(i, i + itemsPerPage), tableConfig, info?.category);
    }
}
    
    getTableConfig(auditId) {
        switch (auditId) {
            case 'text-font-audit':
                return {
                    headers: ['Text Content', 'Element Selector', 'Reason'],
                    widths: [180, 200, 135],
                    extractors: [
                        item => item.textSnippet || 'N/A',
                        item => item.containerSelector || 'N/A',
                        item => 'Font smaller than 16px - difficult for older adults to read'
                    ]
                };
            case 'interactive-color-audit':
                return {
                    headers: ['Interactive Text', 'Element Location', 'Senior Accessibility Issue'],
                    widths: [150, 200, 165],
                    extractors: [
                        item => item.text || 'Interactive Element',
                        item => this.extractSelector(item.node) || 'N/A',
                        item => item.explanation || 'Insufficient visual distinction for older adult users'
                    ]
                };
            case 'layout-brittle-audit':
                return {
                    headers: ['Page Element', 'Element Location', 'Senior Impact'],
                    widths: [150, 200, 165],
                    extractors: [
                        item => this.extractNodeLabel(item.node) || 'Layout Element',
                        item => this.extractSelector(item.node) || 'N/A',
                        item => 'Layout may break when older adults adjust text size for better readability'
                    ]
                };
            case 'flesch-kincaid-audit':
                return {
                    headers: ['Metric', 'Value'],
                    widths: [257, 258],
                    extractors: [
                        item => item.metric || 'N/A',
                        item => item.value || 'N/A'
                    ]
                };
            default:
                return {
                    headers: ['Element', 'Location', 'Senior Accessibility Issue'],
                    widths: [150, 200, 165],
                    extractors: [
                        item => item.node?.nodeLabel || item.nodeLabel || 'Page Element',
                        item => item.node?.selector || item.selector || 'N/A',
                        item => item.node?.explanation || item.explanation || 'May impact older adult users'
                    ]
                };
        }
    }
    
    extractSelector(node) {
        if (!node) return null;
        return node.selector || node.path || null;
    }
    
    extractNodeLabel(node) {
        if (!node) return null;
        return node.nodeLabel || node.snippet || null;
    }
    
    drawScoreCalculationTable(items, scoreData) {
        if (!items || items.length === 0) return;
        
        const startY = this.currentY;
        const headerHeight = 28;
        const rowHeight = 22;
        const colWidths = [295, 60, 60, 100]; // Audit Component, Score, Weight, Weighted
        
        // Draw header with purple background
        this.doc.rect(this.margin, startY, this.pageWidth, headerHeight).fill('#6366F1');
        this.doc.font('BoldFont').fontSize(10).fillColor('#FFFFFF');
        
        const headers = ['Audit Component', 'Score', 'Weight', 'Weighted'];
        let currentX = this.margin;
        
        headers.forEach((header, index) => {
            const align = index === 0 ? 'left' : 'center';
            const xPos = index === 0 ? currentX + 10 : currentX + (colWidths[index] / 2) - (this.doc.widthOfString(header) / 2);
            this.doc.text(header, xPos, startY + 9, { 
                width: colWidths[index] - 20,
                align: align
            });
            currentX += colWidths[index];
        });
        
        let tableY = startY + headerHeight;
        this.doc.font('RegularFont').fontSize(9);
        
        // Draw rows
        items.forEach((item, rowIndex) => {
            // White background
            this.doc.rect(this.margin, tableY, this.pageWidth, rowHeight).fill('#FFFFFF');
            currentX = this.margin;
            // Audit Component (left-aligned, wrap)
            this.doc.fillColor('#374151').text(item.name, currentX + 10, tableY + 6, {
                width: colWidths[0] - 20,
                height: rowHeight - 6,
                align: 'left',
                lineGap: 2
            });
            currentX += colWidths[0];
            // Score (center-aligned, wrap)
            this.doc.text(item.score, currentX + 10, tableY + 6, {
                width: colWidths[1] - 20,
                height: rowHeight - 6,
                align: 'center',
                lineGap: 2
            });
            currentX += colWidths[1];
            // Weight (center-aligned, wrap)
            this.doc.text(String(item.weight), currentX + 10, tableY + 6, {
                width: colWidths[2] - 20,
                height: rowHeight - 6,
                align: 'center',
                lineGap: 2
            });
            currentX += colWidths[2];
            // Weighted (center-aligned, wrap)
            this.doc.text(item.contribution, currentX + 10, tableY + 6, {
                width: colWidths[3] - 20,
                height: rowHeight - 6,
                align: 'center',
                lineGap: 2
            });
            // Draw light bottom border
            this.doc.moveTo(this.margin, tableY + rowHeight)
                .lineTo(this.margin + this.pageWidth, tableY + rowHeight)
                .strokeColor('#E5E7EB')
                .lineWidth(0.5)
                .stroke();
            tableY += rowHeight;
        });
        
        // Draw final calculation box with yellow background
        this.currentY = tableY + 5;
        const calcBoxHeight = 30;
        this.doc.roundedRect(this.margin, this.currentY, this.pageWidth, calcBoxHeight, 4).fill('#FEF3C7');
        
        const finalCalcText = `Final Calculation: ${scoreData.totalWeightedScore.toFixed(2)} (Total Points) / ${scoreData.totalWeight} (Total Weight) = ${Math.round(scoreData.finalScore)}%`;
        this.doc.fontSize(10).font('BoldFont').fillColor('#92400E').text(
            finalCalcText,
            this.margin + 15,
            this.currentY + 9,
            { width: this.pageWidth - 30, align: 'center' }
        );
        
        this.currentY += calcBoxHeight + 20;
    }
    
    drawEnhancedTable(items, config, category) {
    if (!items || items.length === 0) return;
    
    // Find the Location column index
    const locationIndex = config.headers.findIndex(h => 
        h.toLowerCase().includes('location') || h.toLowerCase().includes('element location')
    );
    
    // Filter out rows where "Location" column has N/A
    let itemsToShow = items;
    if (locationIndex !== -1) {
        itemsToShow = items.filter(item => {
            const locationValue = config.extractors[locationIndex](item);
            return locationValue && locationValue !== 'N/A' && locationValue.trim() !== '';
        });
        
        // If ALL rows have N/A in Location, don't render the table at all
        if (itemsToShow.length === 0) {
            console.log('Skipping table - all rows have N/A in Location column');
            return; // Exit without rendering anything
        }
    }
    
    const startY = this.currentY;
    const headerHeight = 30;
    let tableY = startY;
    const auditInfo = AUDIT_INFO[config.auditId];
    
    // Draw header with light gray background
    this.doc.rect(this.margin, tableY, this.pageWidth, headerHeight).fill('#F3F4F6');
    this.doc.font('BoldFont').fontSize(10).fillColor('#374151');
    let currentX = this.margin;
    
    config.headers.forEach((header, index) => {
        this.doc.text(header, currentX + 10, tableY + 10, { 
            width: config.widths[index] - 20, 
            height: headerHeight - 10, 
            align: 'left' 
        });
        currentX += config.widths[index];
    });
    
    tableY += headerHeight;
    this.doc.font('RegularFont').fontSize(9);
    
    // Draw rows with alternating white background and bottom borders
    itemsToShow.forEach((item, rowIndex) => {
        const rowData = config.extractors.map(extractor => {
            let value = String(extractor(item) || 'N/A');
            // Truncate very long strings during calculation
            if (value.length > 200) {
                value = value.substring(0, 197) + '...';
            }
            return value;
        });
        let maxRowHeight = 0;
        
        rowData.forEach((cellValue, colIndex) => {
            const cellWidth = config.widths[colIndex] - 20;
            const cellHeight = this.doc.heightOfString(cellValue, { width: cellWidth });
            if (cellHeight > maxRowHeight) {
                maxRowHeight = cellHeight;
            }
        });
        
        const rowHeight = Math.max(maxRowHeight + 20, 35);
        // Cap maximum row height to prevent excessive spacing
        const finalRowHeight = Math.min(rowHeight, 120);
        
        if (tableY + finalRowHeight > this.doc.page.height - this.doc.page.margins.bottom) {
            this.addPage();
            this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6').text(`Detailed Findings (Sample) - Continued`, this.margin, this.currentY);
            this.currentY += 25;
            tableY = this.currentY;
            
            // Redraw header on new page
            this.doc.rect(this.margin, tableY, this.pageWidth, headerHeight).fill('#F3F4F6');
            this.doc.font('BoldFont').fontSize(10).fillColor('#374151');
            currentX = this.margin;
            config.headers.forEach((header, index) => {
                this.doc.text(header, currentX + 10, tableY + 10, { 
                    width: config.widths[index] - 20, 
                    height: headerHeight - 10, 
                    align: 'left' 
                });
                currentX += config.widths[index];
            });
            tableY += headerHeight;
            this.doc.font('RegularFont').fontSize(9);
        }
        
        // White background for all rows
        this.doc.rect(this.margin, tableY, this.pageWidth, finalRowHeight).fill('#FFFFFF');
        
        // Draw cell content with proper height constraint
        currentX = this.margin;
        rowData.forEach((cellValue, colIndex) => {
            // Truncate very long strings to prevent overflow
            let displayValue = cellValue;
            if (cellValue.length > 200) {
                displayValue = cellValue.substring(0, 197) + '...';
            }
            
            this.doc.fillColor('#374151').text(displayValue, currentX + 10, tableY + 10, {
                width: config.widths[colIndex] - 20,
                height: finalRowHeight - 20,
                lineGap: 2,
                align: 'left'
            });
            currentX += config.widths[colIndex];
        });
        
        // Draw light bottom border for the row
        this.doc.moveTo(this.margin, tableY + finalRowHeight)
            .lineTo(this.margin + this.pageWidth, tableY + finalRowHeight)
            .strokeColor('#E5E7EB')
            .lineWidth(0.5)
            .stroke();
        
        tableY += finalRowHeight;
    });
    
    this.currentY = tableY + 20;
}

    async generateReport(inputFile, outputFile, options = {}) {
        try {
            const reportData = JSON.parse(await fsPromises.readFile(inputFile, 'utf8'));
            const clientEmail = options.clientEmail || 'unknown-client';
            const formFactor = options.formFactor || reportData.configSettings?.formFactor || 'desktop';
            const url = reportData.finalUrl || 'unknown-url';

            // Create a safe, short, unique filename from URL and device
            function safeFilename(url, device) {
                try {
                    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
                    let hostname = u.hostname.replace(/^www\./, '');
                    let pathname = u.pathname.replace(/[^a-zA-Z0-9]/g, '_');
                    if (pathname.length > 40) pathname = pathname.slice(0, 40) + '_';
                    // Optionally, add a hash for uniqueness
                    const hash = Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
                    return `${hostname}${pathname ? '_' + pathname : ''}_${hash}-${device}.pdf`;
                } catch (e) {
                    // fallback for invalid URLs
                    return `report_${device}.pdf`;
                }
            }
            const fileName = safeFilename(url, formFactor);

            // Use outputDir if provided, otherwise use clientEmail as folder
            let clientFolder;
            if (options.outputDir) {
                clientFolder = path.resolve(options.outputDir);
            } else {
                clientFolder = path.resolve(clientEmail);
            }
            await fsPromises.mkdir(clientFolder, { recursive: true });

            // Set final output path
            const finalOutputPath = path.join(clientFolder, fileName);

            const scoreData = calculateSeniorFriendlinessScore(reportData);
            const stream = fs.createWriteStream(finalOutputPath);
            this.doc.pipe(stream);

            console.log('Generating senior-friendly accessibility report...');
            console.log(`Overall Score Calculated: ${scoreData.finalScore.toFixed(0)}`);

            this.addIntroPage(reportData, scoreData, options.planType || 'pro');
            this.addScoreCalculationPage(reportData, scoreData);
            this.addSummaryPage(reportData);

            const audits = reportData.audits || {};
            const supportedAudits = Object.keys(audits).filter(id => AUDIT_INFO[id]);
            const categories = {};

            supportedAudits.forEach(auditId => {
                const info = AUDIT_INFO[auditId];
                if (!categories[info.category]) {
                    categories[info.category] = [];
                }
                categories[info.category].push(auditId);
            });

            console.log(`Processing ${supportedAudits.length} audits across ${Object.keys(categories).length} categories...`);

            // Add Section 3 heading before audit details
            this.addPage();
            this.doc.fontSize(18).font('BoldFont').fillColor('#1F2937').text('Section 3: Detailed Audit Results', this.margin, this.currentY);
            this.currentY += 25;
            this.doc.moveTo(this.margin, this.currentY).lineTo(this.margin + this.pageWidth, this.currentY).stroke('#E5E7EB');
            this.currentY += 20;
            let detailPagesGenerated = false;
            for (const categoryName of Object.keys(categories)) {
                for (const auditId of categories[categoryName]) {
                    const auditData = audits[auditId];
                    if (auditData.score === null) {
                        continue;
                    }
                    // Only count as generated if there are visible details/items
                    if (auditData.details && Array.isArray(auditData.details.items) && auditData.details.items.length > 0) {
                        detailPagesGenerated = true;
                        this.addAuditDetailPage(auditId, auditData);
                        this.addTablePages(auditId, auditData);
                    }
                }
            }
            if (!detailPagesGenerated) {
                if (this.currentY > this.doc.page.height - 100) {
                    this.addPage();
                    this.currentY = 60;
                }
                this.doc.fontSize(12).font('RegularFont').fillColor('#6B7280').text('Continue to the next page to explore the full results of this assessment.', this.margin, this.currentY, { width: this.pageWidth, align: 'center' });
                this.currentY += 40;
            }
            this.doc.end();

            return new Promise((resolve, reject) => {
                stream.on('finish', () => {
                    const successMessage = {
                        success: true,
                        message: 'Senior accessibility report generated successfully',
                        reportPath: finalOutputPath,
                        clientFolder: clientFolder,
                        fileName: fileName,
                        formFactor: formFactor,
                        url: url,
                        score: scoreData.finalScore.toFixed(0)
                    };
                    console.log(`Senior accessibility report generated successfully: ${finalOutputPath}`);
                    resolve(successMessage);
                });
                stream.on('error', reject);
            });

        } catch (error) {
            console.error('Error generating senior accessibility report:', error.message);
            throw error;
        }
    }
}

export async function generateSeniorAccessibilityReport(options = {}) {
    const {
        inputFile = 'report.json',
        outputFile = 'silver-surfers-report.pdf',
        imagePaths = {},
        url,
        email_address,
        outputDir // <-- new option
    } = options;

    if (!url || !email_address) {
        throw new Error('url and email_address are required');
    }

    // Extract base URL from the provided url, normalize www/non-www
    function getBaseUrl(inputUrl) {
        try {
            const u = new URL(inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`);
            let hostname = u.hostname.replace(/^www\./, '');
            return `${u.protocol}//${hostname}`;
        } catch (e) {
            return inputUrl.replace(/^www\./, '');
        }
    }
    const baseUrl = getBaseUrl(url);

    const generator = new ElderlyAccessibilityPDFGenerator({ imagePaths });
    const result = await generator.generateReport(inputFile, outputFile, { ...options, outputDir, clientEmail: email_address, baseUrl, planType: options.planType });

    // Directory logic remains the same
    function sanitize(str) {
        return str.replace(/[^a-zA-Z0-9@.-]/g, '_').replace(/https?:\/\//, '').replace(/\./g, '-');
    }
    const dirName = `${sanitize(email_address)}_${sanitize(baseUrl)}`;
    const uniqueDir = path.resolve(__dirname, 'Seal_Reasoning_email_baseurl', dirName);
    await fsPromises.mkdir(uniqueDir, { recursive: true });
    const resultsFile = path.join(uniqueDir, 'results.json');
    let resultsData = [];
    try {
        const fileContent = await fsPromises.readFile(resultsFile, 'utf8');
        resultsData = JSON.parse(fileContent);
    } catch (e) {
        // File doesn't exist or invalid JSON, start fresh
        resultsData = [];
    }
    resultsData.push({
        Url: result.url,
        score: result.score,
        device: options.device || options.formFactor || null,
        timestamp: new Date().toISOString()
    });
    await fsPromises.writeFile(resultsFile, JSON.stringify(resultsData, null, 2));
    return result;
}
