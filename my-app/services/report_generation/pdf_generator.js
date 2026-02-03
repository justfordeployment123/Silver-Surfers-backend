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
export function calculateSeniorFriendlinessScore(report) {
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

        // CRITICAL: Match old backend's audit.js EXACTLY (lines 184-195)
        // Old backend: const score = result ? (result.score ?? 0) : 0;
        // Then: totalWeightedScore += score * weight; totalWeight += weight;
        // This ALWAYS includes weight, even for missing audits (treats them as score 0)
        const score = result ? (result.score ?? 0) : 0;
        totalWeightedScore += score * weight;
        totalWeight += weight;  // ALWAYS add weight, matching old backend exactly
    }

    if (totalWeight === 0) {
        return { finalScore: 0, totalWeightedScore: 0, totalWeight: 0 };
    }

    const finalScore = (totalWeightedScore / totalWeight) * 100;
    return { finalScore, totalWeightedScore, totalWeight };
}
export class ElderlyAccessibilityPDFGenerator {
    constructor(options = {}) {
        this.imagePaths = options.imagePaths || {};
        this.options = options; // Store all options for later use
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
        this.pageNumber = 0;
    }

    addTitlePage(reportData) {
        // Helper function to extract site name from URL
        function extractSiteName(url) {
            try {
                const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
                let hostname = urlObj.hostname.replace(/^www\./, '');
                // Convert domain to title case with spaces
                let name = hostname.split('.')[0]; // Get the main part before .com
                // Add spaces before capital letters and before numbers
                name = name.replace(/([A-Z])/g, ' $1').replace(/([0-9]+)/g, ' $1');
                // Split by common separators
                name = name.replace(/[-_]/g, ' ');
                // Title case each word
                name = name.split(' ').map(word => {
                    if (!word) return '';
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                }).join(' ').trim();
                return name || hostname;
            } catch (e) {
                return 'Website';
            }
        }

        const siteName = extractSiteName(reportData.finalUrl || reportData.url || '');
        const pageHeight = this.doc.page.height;
        const pageWidth = this.doc.page.width;

        // White background for the entire page
        this.doc.rect(0, 0, pageWidth, pageHeight).fill('#FFFFFF');

        // Title: "SilverSurfers Website Accessibility Audit Report" - centered, stacked
        const titleY = pageHeight * 0.35; // Upper-middle section
        const titleX = this.margin; // Start at margin
        const titleWidth = this.pageWidth; // Use full page width minus margins

        // Stack the title lines vertically
        this.doc.fontSize(36).font('BoldFont').fillColor('#2C3E50')
            .text('SilverSurfers', titleX, titleY, { width: titleWidth, align: 'center' });
        
        this.doc.fontSize(28).font('BoldFont').fillColor('#2C3E50')
            .text('Website', titleX, titleY + 50, { width: titleWidth, align: 'center' });
        
        this.doc.fontSize(28).font('BoldFont').fillColor('#2C3E50')
            .text('Accessibility', titleX, titleY + 90, { width: titleWidth, align: 'center' });
        
        this.doc.fontSize(28).font('BoldFont').fillColor('#2C3E50')
            .text('Audit Report', titleX, titleY + 130, { width: titleWidth, align: 'center' });

        // Lower left: "Prepared for [Website] on [Date]"
        const preparedY = pageHeight - 120;
        const preparedX = this.margin;
        
        this.doc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
            .text('Prepared for', preparedX, preparedY);
        
        this.doc.fontSize(13).font('BoldFont').fillColor('#2C3E50')
            .text(siteName, preparedX, preparedY + 18, { width: 200 });
        
        const dateStr = new Date(reportData.fetchTime || new Date()).toLocaleDateString('en-US', { 
            year: 'numeric', month: 'long', day: 'numeric' 
        });
        this.doc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
            .text('on', preparedX, preparedY + 40);
        
        this.doc.fontSize(13).font('BoldFont').fillColor('#2C3E50')
            .text(dateStr, preparedX, preparedY + 58, { width: 200 });

        // Lower right: Logo
        // Try multiple possible paths for the logo
        const possibleLogoPaths = [
            path.join(__dirname, '../../../assets/Logo.png'), // From report_generation: up 3 levels to backend-silver-surfers
            path.join(__dirname, '../../assets/Logo.png'),    // Alternative path
            path.join(process.cwd(), 'assets/Logo.png'),      // From project root
            path.join(process.cwd(), 'backend-silver-surfers/assets/Logo.png') // Explicit backend path
        ];
        
        const logoX = pageWidth - 180;
        const logoY = pageHeight - 150;
        const logoSize = 120;
        let logoLoaded = false;

        for (const logoPath of possibleLogoPaths) {
            try {
                if (fs.existsSync(logoPath)) {
                    this.doc.image(logoPath, logoX, logoY, { 
                        fit: [logoSize, logoSize],
                        align: 'right'
                    });
                    logoLoaded = true;
                    break;
                }
            } catch (error) {
                // Continue to next path
            }
        }

        if (!logoLoaded) {
            console.warn(`Logo not found. Tried paths: ${possibleLogoPaths.join(', ')}`);
        }

        // Reset currentY for next page (don't increment pageNumber here - let addPage() handle it)
        this.currentY = this.margin;
    }

    addFooter() {
        // Save current Y position to restore after drawing footer
        const savedY = this.doc.y;
        
        const pageHeight = this.doc.page.height;
        const footerY = pageHeight - 30; // 30px from bottom
        const pageWidth = this.doc.page.width;
        const leftMargin = this.margin;
        const rightMargin = pageWidth - this.margin;
        
        // Draw horizontal line (border)
        this.doc.strokeColor('#666666')
            .lineWidth(0.5)
            .moveTo(leftMargin, footerY - 5)
            .lineTo(rightMargin, footerY - 5)
            .stroke();
        
        // Left text: "SilverSurfers.ai" - use lineBreak: false to prevent cursor advancement
        this.doc.fontSize(9).font('RegularFont').fillColor('#666666')
            .text('SilverSurfers.ai', leftMargin, footerY, { lineBreak: false });
        
        // Center: Page number - use lineBreak: false to prevent cursor advancement
        const pageNumText = String(this.pageNumber);
        const pageNumWidth = this.doc.widthOfString(pageNumText);
        this.doc.fontSize(9).font('RegularFont').fillColor('#666666')
            .text(pageNumText, (pageWidth / 2) - (pageNumWidth / 2), footerY, { lineBreak: false });
        
        // Right text: "Website Accessibility Audit Report" - use lineBreak: false to prevent cursor advancement
        const rightText = 'Website Accessibility Audit Report';
        const rightTextWidth = this.doc.widthOfString(rightText);
        this.doc.fontSize(9).font('RegularFont').fillColor('#666666')
            .text(rightText, rightMargin - rightTextWidth, footerY, { lineBreak: false });
        
        // Restore Y position to prevent affecting document flow
        this.doc.y = savedY;
    }

    addPage() {
        // Add footer to previous page if it exists
        if (this.pageNumber > 0) {
            this.addFooter();
        }
        
        this.doc.addPage();
        this.pageNumber++;
        this.currentY = this.margin;
    }

    // Helper function to check if content fits on current page and add new page if needed
    checkPageBreak(neededHeight) {
        // Footer is at pageHeight - 30, so reserve 50px (30px footer + 20px buffer)
        const pageBottom = this.doc.page.height - 50;
        if (this.currentY + neededHeight > pageBottom) {
            this.addPage();
            return true; // Page was added
        }
        return false; // No page break needed
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
        const headingHeight = fontSize + 12;
        
        // Check if heading fits on current page
        this.checkPageBreak(headingHeight);
        
        this.doc.fontSize(fontSize).font('BoldFont').fillColor(color).text(text, this.margin, this.currentY, { width: this.pageWidth });
        this.currentY += headingHeight;
    }

    addBodyText(text, fontSize = 11, color = '#2C3E50') {
        // Set font size before calculating height
        this.doc.fontSize(fontSize);
        const textHeight = this.doc.heightOfString(text, { width: this.pageWidth, lineGap: 3 }) + 12;
        
        // Check if text fits on current page
        this.checkPageBreak(textHeight);
        
        this.doc.font('RegularFont').fillColor(color).text(text, this.margin, this.currentY, { width: this.pageWidth, align: 'justify', lineGap: 3 });
        this.currentY += textHeight;
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

    // Determine pass/fail status based on 80% threshold
    const isPassing = roundedScore >= 80;
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
            .text('This website did not meet the SilverSurfers accessibility standards (80% minimum required)',
                this.margin, this.currentY, { width: this.pageWidth, align: 'center' });
        this.currentY += 20;
    } else {
        this.doc.fontSize(12).font('RegularFont').fillColor('#27AE60')
            .text('This website meets SilverSurfers accessibility standards for older adult-friendly design',
                this.margin, this.currentY, { width: this.pageWidth, align: 'center' });
        this.currentY += 20;
    }
}
    addIntroPage(reportData, scoreData, planType = 'pro') {
        // Helper function to extract site name from URL
        function extractSiteName(url) {
            try {
                const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
                let hostname = urlObj.hostname.replace(/^www\./, '');
                // Convert domain to title case with spaces
                // e.g., "carverridgeseniorliving.com" -> "Carver Ridge Senior Living"
                let name = hostname.split('.')[0]; // Get the main part before .com
                // Add spaces before capital letters and before numbers
                name = name.replace(/([A-Z])/g, ' $1').replace(/([0-9]+)/g, ' $1');
                // Split by common separators
                name = name.replace(/[-_]/g, ' ');
                // Title case each word
                name = name.split(' ').map(word => {
                    if (!word) return '';
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                }).join(' ').trim();
                return name || hostname;
            } catch (e) {
                return 'Website';
            }
        }

        const siteName = extractSiteName(reportData.finalUrl || '');
        const score = Math.round(scoreData.finalScore);
        // For messaging on this page, treat 80% as the minimum recommended standard (Pass threshold)
        const meetsMinimum = score >= 80;
        const formFactor = reportData.configSettings?.formFactor || 'desktop';
        const formFactorDisplay = formFactor.charAt(0).toUpperCase() + formFactor.slice(1);

        // Determine package type display text
        let packageText = 'Pro';
        if (planType && typeof planType === 'string') {
            if (planType.toLowerCase().includes('starter')) packageText = 'Starter';
            else if (planType.toLowerCase().includes('onetime')) packageText = 'One-Time';
            else if (planType.toLowerCase().includes('pro')) packageText = 'Pro';
        }

        // Dark blue header bar at top - full width (edge to edge)
        const headerHeight = 50;
        const headerY = 0; // Start at top edge
        this.doc.rect(0, headerY, this.doc.page.width, headerHeight)
            .fill('#1E3A8A'); // Dark blue
        
        // Header text: "Website Accessibility Audit Report – (Desktop)" in white
        this.doc.fontSize(16).font('BoldFont').fillColor('#FFFFFF')
            .text(`Website Accessibility Audit Report – (${formFactorDisplay})`, this.margin, headerY + 15, 
                { width: this.pageWidth, align: 'left' });
        
        // Separator lines: white line then thin red line
        const separatorY = headerY + headerHeight;
        this.doc.strokeColor('#FFFFFF')
            .lineWidth(1)
            .moveTo(0, separatorY)
            .lineTo(this.doc.page.width, separatorY)
            .stroke();
        
        this.doc.strokeColor('#DC3545') // Red
            .lineWidth(0.5)
            .moveTo(0, separatorY + 1)
            .lineTo(this.doc.page.width, separatorY + 1)
            .stroke();
        
        // Light red/pink main content area with red border
        const contentStartY = separatorY + 2;
        const contentHeight = 200;
        const contentMargin = 20;
        const contentX = contentMargin;
        const contentWidth = this.doc.page.width - (contentMargin * 2);
        
        // Light red/pink background
        this.doc.rect(contentX, contentStartY, contentWidth, contentHeight)
            .fill('#FFE5E5'); // Light red/pink
        
        // Red border around content area
        this.doc.rect(contentX, contentStartY, contentWidth, contentHeight)
            .strokeColor('#DC3545')
            .lineWidth(1)
            .stroke();
        
        // "Overall Accessibility Score (Desktop)" heading - top-left of content area
        this.doc.fontSize(14).font('BoldFont').fillColor('#000000')
            .text(`Overall Accessibility Score (${formFactorDisplay})`, contentX + 15, contentStartY + 15, 
                { width: contentWidth - 30 });
        
        // Large score percentage - centered, red color
        const scoreY = contentStartY + 50;
        let scoreColor = '#DC3545'; // Red (always red as shown in image)
        if (score >= 80) {
            scoreColor = '#28A745'; // Green for Pass
        } else if (score >= 70) {
            scoreColor = '#FD7E14'; // Orange for Needs Improvement
        }
        
        this.doc.fontSize(72).font('BoldFont').fillColor(scoreColor)
            .text(`${score}%`, contentX, scoreY, 
                { width: contentWidth, align: 'center' });
        
        // Determine if score meets the 80% minimum recommended standard
        const isPassing = score >= 80;
        
        // Warning or Pass message - centered
        const warningY = contentStartY + 140;
        if (!isPassing) {
            this.doc.fontSize(12).font('BoldFont').fillColor('#DC3545')
                .text('WARNING: Below Recommended Standard', contentX, warningY, 
                    { width: contentWidth, align: 'center' });
        } else {
            this.doc.fontSize(12).font('BoldFont').fillColor('#28A745')
                .text('PASS: Meets Recommended Standard', contentX, warningY, 
                    { width: contentWidth, align: 'center' });
        }
        
        // Minimum recommended score text - centered
        this.doc.fontSize(10).font('RegularFont').fillColor('#000000')
            .text('Minimum recommended score: 80%', contentX, warningY + 20, 
                { width: contentWidth, align: 'center' });
        
        this.currentY = contentStartY + contentHeight + 30;

        // Report prepared for (left-aligned)
        const clientEmail = this.options?.clientEmail || reportData.clientEmail || 'client@email.com';
        this.doc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
            .text(`Report prepared for: ${clientEmail}`, this.margin + 60, this.currentY);
        this.currentY += 25;

        // Pages audited (left-aligned) - show actual page URL if available
        let pagesText = '';
        if (reportData.requestedUrl || reportData.finalUrl) {
            const pageUrl = reportData.requestedUrl || reportData.finalUrl;
            // Extract path from URL for display
            try {
                const urlObj = new URL(pageUrl);
                const displayPath = urlObj.pathname === '/' || urlObj.pathname === '' 
                    ? 'Home Page' 
                    : urlObj.pathname;
                pagesText = `Pages audited: ${displayPath}`;
            } catch (e) {
                pagesText = `Pages audited: ${pageUrl}`;
            }
        } else {
            const pagesCount = reportData.pagesScanned || reportData.pageCount;
            pagesText = typeof pagesCount === 'number' 
                ? `Pages audited: ${pagesCount}` 
                : 'Pages audited: 1';
        }
        this.doc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
            .text(pagesText, this.margin + 60, this.currentY);
        this.currentY += 25;

        // Package information (simple label, no dev-only notes)
        this.doc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
            .text(`Package: ${packageText}`, this.margin + 60, this.currentY);
        
        this.currentY += 30;
    }

    addScoreCalculationPage(reportData, scoreData) {
        this.addPage();
        
        // Title: "Detailed Score Breakdown" (blue)
        this.doc.fontSize(20).font('BoldFont').fillColor('#2C5F9C').text('Detailed Score Breakdown', this.margin, this.currentY);
        this.currentY += 30;
        
        // Explanation text (no horizontal line)
        this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50').text(
            'The final score is calculated using a weighted average system where components with greater impact on digital users receive higher weight values.',
            this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 }
        );
        this.currentY += 35;

        const auditRefs = customConfig.categories['senior-friendly']?.auditRefs || [];
        const auditResults = reportData.audits;

        // CRITICAL FIX: Include ALL audits from auditRefs, even if they have null/0 scores
        // This matches old backend behavior where all audits are shown in the calculation table
        // Missing audits or null scores are treated as 0 for display
        const tableItems = auditRefs
            .map(ref => {
                const result = auditResults[ref.id];
                // Treat missing or null scores as 0 (matching calculation logic)
                const score = (result && result.score !== null) ? (result.score ?? 0) : 0;
                const weightedScore = score * ref.weight;
                return {
                    name: AUDIT_INFO[ref.id]?.title || ref.id,
                    score: (score * 100).toFixed(0) + '%',
                    weight: ref.weight,
                    contribution: weightedScore.toFixed(2),
                };
            });

        // Draw compact table
        this.drawScoreCalculationTable(tableItems, scoreData);
    }

    addExecutiveSummary(reportData, scoreData) {
        this.addPage();
        
        // Helper to extract site name from URL
        function extractSiteName(url) {
            try {
                const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
                let hostname = urlObj.hostname.replace(/^www\./, '');
                let name = hostname.split('.')[0];
                name = name.replace(/([A-Z])/g, ' $1').replace(/([0-9]+)/g, ' $1');
                name = name.replace(/[-_]/g, ' ');
                name = name.split(' ').map(word => {
                    if (!word) return '';
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                }).join(' ').trim();
                return name || hostname;
            } catch (e) {
                return 'website';
            }
        }

        const siteName = extractSiteName(reportData.finalUrl || '');
        const score = Math.round(scoreData.finalScore);
        // For messaging on this page, treat 80% as the minimum recommended standard (Pass threshold)
        const meetsMinimum = score >= 80;

        // Executive Summary heading (blue)
        this.doc.fontSize(24).font('BoldFont').fillColor('#2C5F9C')
            .text('Executive Summary', this.margin, this.currentY);
        this.currentY += 35;

        // Opening paragraph with site name
        const openingText = `This comprehensive accessibility audit evaluates the ${siteName} website specifically for digital users. The assessment focuses on digital user challenges including vision changes, motor skill considerations, cognitive processing needs, and technology familiarity.`;
        this.doc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
            .text(openingText, this.margin, this.currentY, { 
                width: this.pageWidth, 
                align: 'justify',
                lineGap: 3 
            });
        this.currentY += this.doc.heightOfString(openingText, { width: this.pageWidth, lineGap: 3 }) + 30;

        // Key Findings section
        this.doc.fontSize(20).font('BoldFont').fillColor('#2C5F9C')
            .text('Key Findings', this.margin, this.currentY);
        this.currentY += 25;

        // Build page-specific key findings from this report's audits
        const audits = reportData.audits || {};
        const IMPORTANT_AUDITS = {
            'color-contrast': 'color contrast',
            'target-size': 'touch target sizing',
            'text-font-audit': 'text size and readability',
            'largest-contentful-paint': 'page loading speed',
            'link-name': 'link text clarity',
            'label': 'form labels and inputs',
            'cumulative-layout-shift': 'layout stability',
            'is-on-https': 'security (HTTPS)'
        };

        const weakAudits = [];
        const strongAudits = [];

        Object.keys(IMPORTANT_AUDITS).forEach(id => {
            const audit = audits[id];
            if (!audit || typeof audit.score !== 'number') return;
            if (audit.score < 0.7) {
                weakAudits.push(IMPORTANT_AUDITS[id]);
            } else if (audit.score >= 0.9) {
                strongAudits.push(IMPORTANT_AUDITS[id]);
            }
        });

        const formatList = (items) => {
            if (!items.length) return '';
            if (items.length === 1) return items[0];
            if (items.length === 2) return `${items[0]} and ${items[1]}`;
            return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
        };

        const keyFindings = [];

        // 1) Score statement – remove the word "Overall"
        keyFindings.push(
            `Score of ${score}% ${meetsMinimum ? 'meets' : 'falls below'} the 80% minimum standard for user-friendly accessibility on this page`
        );

        // 2) Areas needing improvement on this specific page
        if (weakAudits.length) {
            keyFindings.push(
                `Key accessibility gaps on this page: ${formatList(weakAudits)}.`
            );
        }

        // 3) Strong areas on this specific page
        if (strongAudits.length) {
            keyFindings.push(
                `Strong performance on this page in: ${formatList(strongAudits)}.`
            );
        }

        // Fallback bullets if we couldn't classify anything
        if (keyFindings.length === 1) {
            keyFindings.push(
                'This page shows a mix of strengths and opportunities for improvement across accessibility categories.'
            );
        }

        keyFindings.forEach(finding => {
            const bulletX = this.margin + 20;
            const textX = bulletX + 15;
            
            // Draw bullet point
            this.doc.circle(bulletX, this.currentY + 5, 2.5).fill('#2C3E50');
            
            // Draw finding text
            this.doc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
                .text(finding, textX, this.currentY, {
                    width: this.pageWidth - 35,
                    lineGap: 2
                });
            
            const findingHeight = this.doc.heightOfString(finding, { 
                width: this.pageWidth - 35, 
                lineGap: 2 
            });
            this.currentY += findingHeight + 10;
        });

        this.currentY += 20;

        // Recommended Priority Actions section
        this.doc.fontSize(20).font('BoldFont').fillColor('#2C5F9C')
            .text('Recommended Priority Actions', this.margin, this.currentY);
        this.currentY += 25;

        // Priority actions based on weakest audits for THIS page
        const ACTIONS_BY_AUDIT = {
            'color-contrast': 'Improve color contrast ratios for text and interactive elements so older adults can easily read content.',
            'target-size': 'Increase the size and spacing of buttons and links to make them easier to tap, especially on touch devices.',
            'text-font-audit': 'Increase text sizes and ensure consistent typography for comfortable reading.',
            'largest-contentful-paint': 'Optimize page loading speed (images, scripts, and hosting) to reduce wait times.',
            'link-name': 'Rewrite vague links (e.g., “Learn more”) into descriptive text that explains the destination or action.',
            'label': 'Add clear labels and instructions to all form fields so users understand what to enter.',
            'cumulative-layout-shift': 'Stabilize layout elements to prevent content from shifting as the page loads.',
            'is-on-https': 'Ensure all pages load over HTTPS to protect user privacy and security.'
        };

        const priorityActions = [];

        // Use the same weak audits list but keep only the first 4 for actions
        const weakAuditIdsInOrder = Object.keys(IMPORTANT_AUDITS).filter(id => {
            const audit = audits[id];
            return audit && typeof audit.score === 'number' && audit.score < 0.7;
        });

        weakAuditIdsInOrder.slice(0, 4).forEach(id => {
            if (ACTIONS_BY_AUDIT[id]) {
                priorityActions.push(ACTIONS_BY_AUDIT[id]);
            }
        });

        // Fallback to generic actions if nothing scored poorly
        if (!priorityActions.length) {
            priorityActions.push(
                'Maintain current accessibility practices and schedule regular reviews as content and design change.',
                'Monitor page loading speed and media sizes to ensure they remain fast for older devices and slower connections.'
            );
        }

        priorityActions.forEach(action => {
            const bulletX = this.margin + 20;
            const textX = bulletX + 15;
            
            // Draw bullet point
            this.doc.circle(bulletX, this.currentY + 5, 2.5).fill('#2C3E50');
            
            // Draw action text (bold for priority actions)
            this.doc.fontSize(11).font('BoldFont').fillColor('#2C3E50')
                .text(action, textX, this.currentY, {
                    width: this.pageWidth - 35,
                    lineGap: 2
                });
            
            const actionHeight = this.doc.heightOfString(action, { 
                width: this.pageWidth - 35, 
                lineGap: 2 
            });
            this.currentY += actionHeight + 10;
        });
    }

    addPriorityRecommendations(reportData) {
        this.addPage();
        
        // Page title
        this.doc.fontSize(22).font('BoldFont').fillColor('#2C5F9C')
            .text('Priority Recommendations', this.margin, this.currentY);
        this.currentY += 35;
        
        // Description
        this.doc.fontSize(12).font('RegularFont').fillColor('#2C3E50')
            .text('Based on the audit findings, here are the priority improvements organized by impact and implementation effort.',
                this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 });
        this.currentY += 40;

        const audits = reportData.audits || {};
        
        // Categorize audits by priority based on scores and weights
        const criticalIssues = [];
        const mediumIssues = [];
        const lowIssues = [];

        // Check each audit and categorize
        Object.keys(AUDIT_INFO).forEach(auditId => {
            const auditData = audits[auditId];
            if (!auditData) return;
            
            const score = auditData.score !== null && auditData.score !== undefined ? auditData.score : 1;
            const scorePercent = Math.round(score * 100);
            
            // Critical: score < 70% (Fail)
            // Medium: score 70-79% (Needs Improvement)
            // Low/Passing: score >= 80% (Pass)
            
            if (scorePercent < 70) {
                criticalIssues.push({ id: auditId, score: scorePercent, data: auditData });
            } else if (scorePercent < 80) {
                mediumIssues.push({ id: auditId, score: scorePercent, data: auditData });
            } else {
                // Low priority: score >= 80% (Passing but can still be improved)
                lowIssues.push({ id: auditId, score: scorePercent, data: auditData });
            }
        });

        // Critical Priority Section
        if (criticalIssues.length > 0) {
            // Section heading with icon circle
            const iconRadius = 12;
            const iconX = this.margin + iconRadius;
            const iconY = this.currentY + 7; // Center vertically with text (14px font height / 2 ≈ 7)
            
            // Draw red circle (no character)
            this.doc.circle(iconX, iconY, iconRadius).fill('#DC3545');
            
            this.doc.fontSize(16).font('BoldFont').fillColor('#DC3545')
                .text('Critical Priority (High Impact)', this.margin + 32, this.currentY);
            this.currentY += 35;

            // Add numbered critical issues
            criticalIssues.slice(0, 5).forEach((issue, index) => {
                this.addRecommendationItem(issue.id, index + 1, issue.data);
            });
        }

        // Medium Priority Section
        if (mediumIssues.length > 0) {
            // Calculate height needed: icon + heading + items
            const sectionHeaderHeight = 35;
            const itemsHeight = mediumIssues.slice(0, 3).reduce((total, issue) => {
                this.doc.fontSize(11);
                const info = AUDIT_INFO[issue.id];
                if (!info) return total;
                return total + this.doc.heightOfString(info.recommendation, { width: this.pageWidth }) + 20;
            }, 0);
            const totalHeight = sectionHeaderHeight + itemsHeight;
            
            // Check if entire section fits on current page
            this.checkPageBreak(totalHeight);

            const iconRadius = 12;
            const iconX = this.margin + iconRadius;
            const iconY = this.currentY + 7; // Center vertically with text (14px font height / 2 ≈ 7)
            
            // Draw yellow/orange circle (no character)
            this.doc.circle(iconX, iconY, iconRadius).fill('#FD7E14');
            
            this.doc.fontSize(16).font('BoldFont').fillColor('#2C5F9C')
                .text('Medium Priority (Moderate Impact)', this.margin + 32, this.currentY);
            this.currentY += 35;

            mediumIssues.slice(0, 3).forEach((issue, index) => {
                this.addRecommendationItem(issue.id, index + 1, issue.data, true);
            });
        }

        // Low Priority Section (optional, if there are any low priority items)
        if (lowIssues.length > 0) {
            // Calculate height needed: icon + heading + items (no description text)
            const sectionHeaderHeight = 25;
            const itemsToShow = Math.min(lowIssues.length, 10);
            const itemsHeight = lowIssues.slice(0, itemsToShow).reduce((total, issue) => {
                this.doc.fontSize(11);
                const info = AUDIT_INFO[issue.id];
                if (!info) return total;
                return total + this.doc.heightOfString(info.recommendation, { width: this.pageWidth }) + 20;
            }, 0);
            const totalHeight = sectionHeaderHeight + itemsHeight;
            
            // Check if entire section fits on current page
            this.checkPageBreak(totalHeight);

            const iconRadius = 12;
            const iconX = this.margin + iconRadius;
            const iconY = this.currentY + 7; // Center vertically with text (14px font height / 2 ≈ 7)
            
            // Draw green circle (no character)
            this.doc.circle(iconX, iconY, iconRadius).fill('#28A745');
            
            this.doc.fontSize(16).font('BoldFont').fillColor('#2C5F9C')
                .text('Low Priority (Minor Improvements)', this.margin + 32, this.currentY);
            this.currentY += 25;
            
            // Display all low priority items (or up to 10 to keep report manageable)
            lowIssues.slice(0, itemsToShow).forEach((issue, index) => {
                this.addRecommendationItem(issue.id, index + 1, issue.data, true);
            });
        }
    }

    addRecommendationItem(auditId, number, auditData, isCompact = false) {
        const info = AUDIT_INFO[auditId];
        if (!info) return;

        // Calculate total height needed for this item BEFORE adding it
        this.doc.fontSize(13); // Set font size for title height calculation
        const titleHeight = 22;
        
        let totalHeight = titleHeight;
        
        if (!isCompact) {
            // Calculate heights for full version
            const issueDesc = this.getIssueDescription(auditId, auditData);
            this.doc.fontSize(11);
            const issueHeight = this.doc.heightOfString(issueDesc, { width: this.pageWidth - this.margin }) + 18;
            const whyHeight = this.doc.heightOfString(info.why, { width: this.pageWidth - this.margin }) + 18;
            const recommendationHeight = this.doc.heightOfString(info.recommendation, { width: this.pageWidth - this.margin }) + 18;
            totalHeight += issueHeight + whyHeight + recommendationHeight;
        } else {
            // Calculate height for compact version
            this.doc.fontSize(11);
            const recommendationHeight = this.doc.heightOfString(info.recommendation, { width: this.pageWidth }) + 20;
            totalHeight += recommendationHeight;
        }

        // Check if entire item fits on current page
        this.checkPageBreak(totalHeight);

        // Number and title
        this.doc.fontSize(13).font('BoldFont').fillColor('#2C3E50')
            .text(`${number}. ${info.title}`, this.margin, this.currentY);
        this.currentY += titleHeight;

        if (!isCompact) {
            // Standard spacing between sections (18px) - consistent spacing after each section
            const sectionSpacing = 18;
            const textOptions = { lineGap: 1 };
            
            // Issue
            const issueDesc = this.getIssueDescription(auditId, auditData);
            const issueHeading = 'Issue: ';
            // Calculate height: heading + text combined
            this.doc.fontSize(11).font('BoldFont');
            const headingWidth = this.doc.widthOfString(issueHeading);
            const availableTextWidth = this.pageWidth - this.margin - headingWidth;
            this.doc.font('RegularFont');
            const issueTextHeight = this.doc.heightOfString(issueDesc, { 
                width: availableTextWidth,
                ...textOptions
            });
            
            const startYIssue = this.currentY;
            this.doc.fontSize(11).font('BoldFont').fillColor('#2C3E50')
                .text(issueHeading, this.margin, this.currentY, { continued: true })
                .font('RegularFont')
                .text(issueDesc, { width: availableTextWidth, ...textOptions });
            // Calculate actual height used and add consistent spacing
            this.currentY = startYIssue + issueTextHeight + sectionSpacing;

            // Why it matters
            const whyHeading = 'Why it matters: ';
            this.doc.fontSize(11).font('BoldFont');
            const whyHeadingWidth = this.doc.widthOfString(whyHeading);
            const whyTextWidth = this.pageWidth - this.margin - whyHeadingWidth;
            this.doc.font('RegularFont');
            const whyTextHeight = this.doc.heightOfString(info.why, { 
                width: whyTextWidth,
                ...textOptions
            });
            
            const startYWhy = this.currentY;
            this.doc.fontSize(11).font('BoldFont').fillColor('#2C3E50')
                .text(whyHeading, this.margin, this.currentY, { continued: true })
                .font('RegularFont')
                .text(info.why, { width: whyTextWidth, ...textOptions });
            // Calculate actual height used and add consistent spacing
            this.currentY = startYWhy + whyTextHeight + sectionSpacing;

            // Recommendation
            const recHeading = 'Recommendation: ';
            this.doc.fontSize(11).font('BoldFont');
            const recHeadingWidth = this.doc.widthOfString(recHeading);
            const recTextWidth = this.pageWidth - this.margin - recHeadingWidth;
            this.doc.font('RegularFont');
            const recTextHeight = this.doc.heightOfString(info.recommendation, { 
                width: recTextWidth,
                ...textOptions
            });
            
            const startYRec = this.currentY;
            this.doc.fontSize(11).font('BoldFont').fillColor('#2C3E50')
                .text(recHeading, this.margin, this.currentY, { continued: true })
                .font('RegularFont')
                .text(info.recommendation, { width: recTextWidth, ...textOptions });
            // Calculate actual height used and add consistent spacing
            this.currentY = startYRec + recTextHeight + sectionSpacing;
        } else {
            // Compact version for medium and low priority
            this.doc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
                .text(info.recommendation, this.margin, this.currentY, { width: this.pageWidth });
            this.currentY += this.doc.heightOfString(info.recommendation, 
                { width: this.pageWidth }) + 20;
        }
    }

    getIssueDescription(auditId, auditData) {
        // Try to use actual audit description first
        if (auditData && auditData.description) {
            // Clean markdown links: [text](url) -> text
            let cleanDesc = auditData.description.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
            
            // Return first 2 sentences for issue description
            const sentences = cleanDesc.split('. ');
            let result = sentences.slice(0, 2).join('. ');
            
            // Only add period if it doesn't already end with one (avoid double dots)
            if (result && !result.trim().endsWith('.')) {
                result += '.';
            }
            
            return result;
        }
        
        // Fallback to hardcoded descriptions if audit data not available
        const issueDescriptions = {
            'color-contrast': 'Insufficient color contrast between text and backgrounds makes content difficult to read for users with vision impairments or age-related vision changes.',
            'largest-contentful-paint': 'Slow page loading creates frustration and may cause users to abandon the site, assuming it\'s broken or connection failed.',
            'link-name': 'Generic link text like \'click here\' or \'read more\' provides no context about the destination, making navigation confusing.',
            'text-font-audit': 'Text size below 16px is difficult for many users to read without strain.',
            'layout-brittle-audit': 'Layout breaks when users adjust text spacing for better readability.',
            'interactive-color-audit': 'Buttons and links rely solely on color to indicate interactivity.',
            'target-size': 'Small touch targets are difficult to tap accurately for users with motor challenges.',
            'total-blocking-time': 'Page becomes unresponsive during loading, preventing user interactions.',
            'cumulative-layout-shift': 'Content shifts unexpectedly during page load, causing users to click wrong elements.'
        };
        
        return issueDescriptions[auditId] || 'This issue impacts accessibility for digital users.';
    }

    addAreasOfStrength(reportData) {
        this.addPage();
        
        // Page title
        this.doc.fontSize(20).font('BoldFont').fillColor('#2C5F9C')
            .text('Areas of Strength', this.margin, this.currentY);
        this.currentY += 30;
        
        // Description
        this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
            .text('The website demonstrates excellence in several important areas that benefit digital users.',
                this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 });
        this.currentY += 35;

        const audits = reportData.audits || {};
        const strengths = [];

        // Find audits with scores >= 80% (Pass threshold)
        Object.keys(AUDIT_INFO).forEach(auditId => {
            const auditData = audits[auditId];
            if (!auditData) return;
            
            const score = auditData.score !== null && auditData.score !== undefined ? auditData.score : 0;
            const scorePercent = Math.round(score * 100);
            
            if (scorePercent >= 80) {
                strengths.push({ 
                    id: auditId, 
                    score: scorePercent,
                    info: AUDIT_INFO[auditId]
                });
            }
        });

        // Display strengths
        if (strengths.length === 0) {
            this.doc.fontSize(10).font('RegularFont').fillColor('#6C757D')
                .text('Continue improving accessibility to build areas of strength.',
                    this.margin, this.currentY, { width: this.pageWidth });
        } else {
            strengths.forEach(strength => {
                // Calculate full item height including title and description
                const description = this.getStrengthDescription(strength.id, strength.score);
                this.doc.fontSize(11);
                const titleHeight = 20;
                this.doc.fontSize(9);
                const descriptionHeight = this.doc.heightOfString(description, { width: this.pageWidth }) + 15;
                const fullItemHeight = titleHeight + descriptionHeight;
                
                // Check if full item fits on current page
                this.checkPageBreak(fullItemHeight);

                // Green circle (no character)
                const checkRadius = 10;
                const checkX = this.margin + checkRadius;
                const checkY = this.currentY + 5.5; // Center vertically with 11px text
                
                // Draw green circle (no character inside)
                this.doc.circle(checkX, checkY, checkRadius).fill('#28A745');
                
                this.doc.fontSize(11).font('BoldFont').fillColor('#2C3E50')
                    .text(`${strength.info.title} (${strength.score}%)`, 
                        this.margin + 28, this.currentY);
                this.currentY += titleHeight;

                // Description
                this.doc.fontSize(9).font('RegularFont').fillColor('#2C3E50')
                    .text(description, this.margin, this.currentY, { 
                        width: this.pageWidth,
                        lineGap: 2
                    });
                this.currentY += this.doc.heightOfString(description, { 
                    width: this.pageWidth, 
                    lineGap: 2 
                }) + 18;
            });
        }
    }

    getStrengthDescription(auditId, score) {
        const descriptions = {
            'target-size': 'All clickable elements meet or exceed the minimum size requirements, making them easy to tap on touchscreens—critical for users with reduced fine motor control or arthritis.',
            'viewport': 'The website properly adapts to different screen sizes, ensuring content displays correctly on tablets and smartphones without requiring horizontal scrolling.',
            'label': 'All form fields have clear, associated labels that help users understand what information is required, particularly beneficial for screen reader users.',
            'is-on-https': 'The website uses HTTPS encryption across all pages, protecting sensitive information—especially important as users are frequently targeted by online scams.',
            'button-name': 'Buttons have descriptive labels that clearly indicate their function, helping users understand what will happen when they click.',
            'heading-order': 'Content is organized in a logical, hierarchical manner with proper heading structure, making it easier for all users to navigate and understand the page layout.',
            'cumulative-layout-shift': 'No unexpected layout shifts during page load, providing a stable and predictable experience.',
            'geolocation-on-start': 'Location requests only occur in response to user actions, respecting privacy and building trust.'
        };
        
        return descriptions[auditId] || 'This area meets or exceeds accessibility standards, providing an excellent experience for digital users.';
    }

    addAboutPage(reportData, scoreData) {
        this.addPage();
        
        // Page title
        this.doc.fontSize(20).font('BoldFont').fillColor('#2C5F9C')
            .text('About This Audit', this.margin, this.currentY);
        this.currentY += 30;
        
        // Description
        this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
            .text('This accessibility audit was conducted using SilverSurfers methodology, which specifically evaluates website accessibility from the perspective of older adult users.',
                this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 });
        this.currentY += 35;

        // Our Focus Areas section
        this.doc.fontSize(14).font('BoldFont').fillColor('#2C5F9C')
            .text('Our Focus Areas', this.margin, this.currentY);
        this.currentY += 20;

        const focusAreas = [
            'Vision changes (reduced contrast sensitivity, color perception)',
            'Motor skill considerations (reduced dexterity, arthritis, tremors)',
            'Cognitive processing needs (clear language, simple navigation)',
            'Technology familiarity levels (intuitive interfaces, clear instructions)'
        ];

        focusAreas.forEach(area => {
            const bulletX = this.margin + 20;
            const textX = bulletX + 15;
            
            // Draw bullet point
            this.doc.circle(bulletX, this.currentY + 5, 2).fill('#2C3E50');
            
            // Draw area text
            this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
                .text(area, textX, this.currentY, {
                    width: this.pageWidth - 35,
                    lineGap: 2
                });
            
            const areaHeight = this.doc.heightOfString(area, { 
                width: this.pageWidth - 35, 
                lineGap: 2 
            });
            this.currentY += areaHeight + 10;
        });

        this.currentY += 20;

        // Scoring Methodology section
        this.doc.fontSize(14).font('BoldFont').fillColor('#2C5F9C')
            .text('Scoring Methodology', this.margin, this.currentY);
        this.currentY += 20;

        // Methodology description
        this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
            .text('Each audit component receives a percentage score based on specific criteria. Components are then weighted according to their impact on digital users. The final score is calculated as a weighted average.',
                this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 });
        this.currentY += 35;

        // Formula in italic
        const formula = 'Final Score = (Sum of Weighted Points) ÷ (Total Possible Weight) × 100';
        this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
            .text(formula, this.margin, this.currentY, { 
                width: this.pageWidth, 
                align: 'left',
                oblique: true
            });
        this.currentY += 30;

        // Score Interpretation
        this.doc.fontSize(11).font('BoldFont').fillColor('#2C3E50')
            .text('Score Interpretation:', this.margin, this.currentY);
        this.currentY += 18;

        const interpretations = [
            { range: '80-100%: Pass', color: '#28A745', text: 'Highly accessible for digital users' },
            { range: '70-79%: Needs Improvement', color: '#FD7E14', text: 'Falls below recommended standards' },
            { range: 'Below 69%: Fail', color: '#DC3545', text: 'Significant barriers to digital users' }
        ];

        interpretations.forEach(interp => {
            const bulletX = this.margin + 20;
            const textX = bulletX + 15;
            
            // Draw bullet point
            this.doc.circle(bulletX, this.currentY + 5, 2).fill('#2C3E50');
            
            // Draw interpretation text with colored range
            this.doc.fontSize(10).font('BoldFont').fillColor(interp.color)
                .text(interp.range, textX, this.currentY, { continued: true })
                .font('RegularFont').fillColor('#2C3E50')
                .text(` - ${interp.text}`);
            
            this.currentY += 15;
        });
    }

    addNextStepsPage() {
        this.addPage();
        
        // Page title
        this.doc.fontSize(20).font('BoldFont').fillColor('#2C5F9C')
            .text('Next Steps', this.margin, this.currentY);
        this.currentY += 30;
        
        // Description
        this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
            .text('To improve accessibility and better serve digital visitors:',
                this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 });
        this.currentY += 30;

        const nextSteps = [
            'Review and implement the Critical Priority recommendations first, as these have the highest impact on user experience',
            'Create an accessibility improvement roadmap with timeline and resource allocation',
            'Test improvements with actual users to validate effectiveness',
            'Schedule regular accessibility audits to maintain and improve standards',
            'Train content creators and developers on user-friendly web design principles'
        ];

        nextSteps.forEach(step => {
            const bulletX = this.margin + 20;
            const textX = bulletX + 15;
            
            // Draw bullet point
            this.doc.circle(bulletX, this.currentY + 5, 2).fill('#2C3E50');
            
            // Draw step text
            this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
                .text(step, textX, this.currentY, {
                    width: this.pageWidth - 35,
                    lineGap: 2
                });
            
            const stepHeight = this.doc.heightOfString(step, { 
                width: this.pageWidth - 35, 
                lineGap: 2 
            });
            this.currentY += stepHeight + 12;
        });

        this.currentY += 25;

        // Questions or Need Support section
        this.doc.fontSize(14).font('BoldFont').fillColor('#2C5F9C')
            .text('Questions or Need Support?', this.margin, this.currentY);
        this.currentY += 20;

        // Contact information
        this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
            .text('Contact us at ', this.margin, this.currentY, { continued: true })
            .font('BoldFont')
            .text('hello@silversurfers.ai', { continued: true })
            .font('RegularFont')
            .text(' for:');
        this.currentY += 25;

        const supportItems = [
            'Detailed implementation guidance for specific recommendations',
            'Custom accessibility consulting services',
            'Follow-up audits to track progress',
            'Training and workshop opportunities'
        ];

        supportItems.forEach(item => {
            const bulletX = this.margin + 20;
            const textX = bulletX + 15;
            
            // Draw bullet point
            this.doc.circle(bulletX, this.currentY + 5, 2).fill('#2C3E50');
            
            // Draw item text
            this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
                .text(item, textX, this.currentY, {
                    width: this.pageWidth - 35,
                    lineGap: 2
                });
            
            const itemHeight = this.doc.heightOfString(item, { 
                width: this.pageWidth - 35, 
                lineGap: 2 
            });
            this.currentY += itemHeight + 10;
        });
    }

    addAppendix(reportData) {
        this.addPage();
        
        // Page title
        this.doc.fontSize(20).font('BoldFont').fillColor('#2C5F9C')
            .text('Appendix', this.margin, this.currentY);
        this.currentY += 30;
        
        // Technical Specifications heading
        this.doc.fontSize(11).font('BoldFont').fillColor('#2C3E50')
            .text('Technical Specifications:', this.margin, this.currentY);
        this.currentY += 25;

        const audits = reportData.audits || {};
        const supportedAudits = Object.keys(audits).filter(id => AUDIT_INFO[id]);

        // Collect all audits that have details.items (technical specifications)
        const auditsWithDetails = [];
        supportedAudits.forEach(auditId => {
            const auditData = audits[auditId];
            if (auditData && auditData.score !== null && auditData.details && 
                Array.isArray(auditData.details.items) && auditData.details.items.length > 0) {
                auditsWithDetails.push({ id: auditId, data: auditData });
            }
        });

        if (auditsWithDetails.length === 0) {
            this.doc.fontSize(10).font('RegularFont').fillColor('#6C757D')
                .text('No technical specifications available for this audit.',
                    this.margin, this.currentY, { width: this.pageWidth });
            return;
        }

        // Add each audit's table
        auditsWithDetails.forEach((audit, index) => {
            // Pre-check if the table will actually have content
            const tableConfig = this.getTableConfig(audit.id);
            const items = audit.data.details.items;
            
            // Check if all locations would be N/A (same logic as in addTablePages)
            const locationIndex = tableConfig.headers.findIndex(h => 
                h.toLowerCase().includes('location') || h.toLowerCase().includes('element location')
            );
            
            let hasValidContent = true;
            if (locationIndex !== -1) {
                const itemsWithValidLocation = items.filter(item => {
                    const locationValue = tableConfig.extractors[locationIndex](item);
                    return locationValue && locationValue !== 'N/A' && locationValue.trim() !== '';
                });
                hasValidContent = itemsWithValidLocation.length > 0;
            }
            
            // Only add section heading if there's valid content to display
            if (!hasValidContent) {
                return; // Skip this audit entirely
            }
            
            // Calculate height needed: heading + content
            const headingHeight = 20;
            // Estimate content height (will be calculated more precisely in drawEnhancedTable)
            const estimatedContentHeight = 100; // Conservative estimate
            const totalHeight = headingHeight + estimatedContentHeight;
            
            // Check if section fits on current page (only check after first item)
            if (index > 0) {
                this.checkPageBreak(totalHeight);
            }

            // Audit name as section heading
            const info = AUDIT_INFO[audit.id];
            if (info) {
                this.doc.fontSize(12).font('BoldFont').fillColor('#2C5F9C')
                    .text(info.title, this.margin, this.currentY);
                this.currentY += headingHeight;
            }

            // Add the table for this audit
            this.addTablePages(audit.id, audit.data, true); // Pass true for appendix mode
        });
    }

   addSummaryPage(reportData) {
        this.addPage();
        
        // Page title
        this.doc.fontSize(20).font('BoldFont').fillColor('#2C5F9C').text('Performance by Category', this.margin, this.currentY);
        this.currentY += 30;
        
        // Description text
        this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50').text(
            'This overview shows how the website performs across different accessibility dimensions important to digital users.',
            this.margin, this.currentY, { width: this.pageWidth, lineGap: 2 }
        );
        this.currentY += 30;
        
        const audits = reportData.audits || {};
        const categories = {};

        // Organize audits by category
        Object.keys(AUDIT_INFO).forEach(auditId => {
            const info = AUDIT_INFO[auditId];
            const auditData = audits[auditId];

            if (info) {
                if (!categories[info.category]) {
                    categories[info.category] = [];
                }
                // Use audit data if available, otherwise create placeholder with score 0
                const auditResult = auditData || { score: 0, numericValue: 0 };
                // If score is null, treat as 0 to show in summary
                const score = auditResult.score !== null ? auditResult.score : 0;
                categories[info.category].push({ 
                    id: auditId, 
                    info, 
                    data: { ...auditResult, score } 
                });
            }
        });

        // Draw each category as a table
        this.drawCategoryTables(categories, audits);
    }
    
    drawCategoryTables(categories, audits) {
        // Define the order of categories to match the image
        const categoryOrder = [
            'Vision Accessibility',
            'Motor Accessibility',
            'Cognitive Accessibility',
            'Performance for Older Adults',
            'Security for Older Adults',
            'Technical Accessibility'
        ];

        categoryOrder.forEach((categoryName) => {
            if (!categories[categoryName]) return;

            const categoryAudits = categories[categoryName];
            
            // Calculate height needed: heading + table
            const headingHeight = 25;
            // Estimate table height (will be calculated more precisely in drawCategoryTables)
            const estimatedTableHeight = 150; // Conservative estimate for a few rows
            const totalHeight = headingHeight + estimatedTableHeight;
            
            // Check if category section fits on current page
            this.checkPageBreak(totalHeight);

            // Category heading
            this.doc.fontSize(14).font('BoldFont').fillColor('#2C5F9C')
                .text(categoryName, this.margin, this.currentY);
            this.currentY += 25;

            // Table headers - ensure total width doesn't exceed pageWidth (515)
            // Component (100), Rating (85), Actual (50), Standard (70), Details (210) = 515
            // Increased Rating from 70 to 85 to ensure "Needs Improvement" fits on one line
            const colWidths = [100, 85, 50, 70, 210]; // Component, Rating, Actual, Standard, Details
            const rowMinHeight = 28;
            
            // Calculate header height dynamically based on text wrapping
            this.doc.fontSize(11).font('BoldFont');
            const headers = ['Component', 'Rating', 'Actual', 'Standard', 'Details'];
            let maxHeaderHeight = 0;
            headers.forEach((header, index) => {
                const headerTextHeight = this.doc.heightOfString(header, { 
                    width: colWidths[index] - 10,
                    lineGap: 2
                });
                if (headerTextHeight > maxHeaderHeight) {
                    maxHeaderHeight = headerTextHeight;
                }
            });
            // Add padding: 12px top + 12px bottom = 24px total padding
            const headerHeight = Math.max(maxHeaderHeight + 24, 40);
            
            // Draw header background
            this.doc.rect(this.margin, this.currentY, this.pageWidth, headerHeight).fill('#3D5A80');
            
            // Header text - all centered for consistency
            let currentX = this.margin;
            this.doc.fillColor('#FFFFFF');
            headers.forEach((header, index) => {
                // Center text horizontally using align: 'center' with column width
                this.doc.text(header, currentX + 5, this.currentY + (headerHeight / 2) - (maxHeaderHeight / 2), {
                    width: colWidths[index] - 10,
                    align: 'center'
                });
                currentX += colWidths[index];
            });

            let tableY = this.currentY + headerHeight;

            // Draw rows for each audit in this category
            categoryAudits.forEach((audit, rowIndex) => {
                const auditData = audits[audit.id] || {};
                const score = auditData.score !== null && auditData.score !== undefined ? auditData.score : 0;
                const scorePercent = Math.round(score * 100);
                
                // Determine rating and colors based on new thresholds
                let rating = 'Fail';
                let ratingColor = '#DC3545'; // Red
                let actualColor = '#DC3545'; // Red
                
                if (scorePercent >= 80) {
                    rating = 'Pass';
                    ratingColor = '#28A745'; // Green
                    actualColor = '#28A745'; // Green
                } else if (scorePercent >= 70) {
                    rating = 'Needs Improvement';
                    ratingColor = '#FD7E14'; // Yellow/Orange
                    actualColor = '#FD7E14'; // Yellow/Orange
                }
                
                // Standard is 80% or higher for Pass
                const standard = scorePercent >= 80 ? '>=80%' : '>=80%';
                
                // Get details from actual audit data
                let details = '';
                
                // Try to use actual audit description or displayValue first
                if (auditData.description) {
                    // Clean markdown links: [text](url) -> text
                    let cleanDesc = auditData.description.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
                    
                    // Use first sentence(s) of description - split on '. ' (period + space) to avoid splitting on version numbers
                    const sentences = cleanDesc.split('. ');
                    // Take first 2 sentences for better context, or first sentence if it's long enough
                    if (sentences.length > 1 && sentences[0].length < 100) {
                        details = sentences.slice(0, 2).join('. ');
                    } else {
                        details = sentences[0];
                    }
                    // Only add period if it doesn't already end with one (avoid double dots)
                    if (details && !details.trim().endsWith('.')) {
                        details += '.';
                    }
                    // Only truncate if extremely long (allow more text to wrap naturally)
                    if (details.length > 300) {
                        details = details.substring(0, 297) + '...';
                    }
                } else if (auditData.displayValue) {
                    // Use displayValue if available
                    details = auditData.displayValue;
                } else {
                    // Fallback to score-based generic message
                    if (scorePercent === 100) {
                        details = 'Meets all accessibility standards';
                    } else if (scorePercent === 0) {
                        details = 'Fails to meet accessibility requirements';
                    } else {
                        details = 'Partially meets accessibility standards';
                    }
                }

                // Calculate row height based on details text and component name
                // IMPORTANT: Set font size first for accurate height calculation
                this.doc.fontSize(10).font('RegularFont');
                const detailsHeight = this.doc.heightOfString(details, { 
                    width: colWidths[4] - 10,
                    lineGap: 1
                });
                const componentNameHeight = this.doc.heightOfString(audit.info.title, {
                    width: colWidths[0] - 10,
                    lineGap: 1
                });
                // Add generous padding: 6px top (tableY + 6) + text height + 10px bottom padding for safety
                // This ensures text never gets clipped
                const calculatedHeight = Math.max(detailsHeight, componentNameHeight) + 16;
                const rowHeight = Math.max(rowMinHeight, calculatedHeight);

                // Check if we need a new page (reserve space for footer at bottom)
                // Footer is at pageHeight - 30, so reserve 50px (30px footer + 20px buffer)
                // Also check if rendering this row would leave less than minimum space for next row
                // This prevents single-row pages
                const pageBottom = this.doc.page.height - 50;
                const minSpaceForNextRow = 60; // Minimum space needed for next row (40px row + 20px buffer)
                const spaceAfterRow = pageBottom - (tableY + rowHeight);
                const isLastRow = rowIndex === categoryAudits.length - 1;
                
                if (tableY + rowHeight > pageBottom || (!isLastRow && spaceAfterRow < minSpaceForNextRow)) {
                    this.addPage();
                    
                    // Redraw category heading and table header
                    this.doc.fontSize(14).font('BoldFont').fillColor('#2C5F9C')
                        .text(categoryName + ' (continued)', this.margin, this.currentY);
                    this.currentY += 25;
                    
                    this.doc.rect(this.margin, this.currentY, this.pageWidth, headerHeight).fill('#3D5A80');
                    currentX = this.margin;
                    this.doc.fontSize(11).font('BoldFont').fillColor('#FFFFFF');
                    headers.forEach((header, index) => {
                        // Center text horizontally using align: 'center' with column width
                        this.doc.text(header, currentX + 5, this.currentY + (headerHeight / 2) - (maxHeaderHeight / 2), {
                            width: colWidths[index] - 10,
                            align: 'center'
                        });
                        currentX += colWidths[index];
                    });
                    
                    tableY = this.currentY + headerHeight;
                }

                // Alternating row background
                const bgColor = rowIndex % 2 === 0 ? '#FFFFFF' : '#F8F9FA';
                this.doc.rect(this.margin, tableY, this.pageWidth, rowHeight).fill(bgColor);

                currentX = this.margin;

                // Component name - ensure full text wrapping (no height limit)
                const componentTitle = String(audit.info.title || '').trim();
                this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
                    .text(componentTitle, currentX + 5, tableY + 6, {
                        width: colWidths[0] - 10,
                        align: 'left',
                        lineGap: 1,
                        ellipsis: false
                    });
                currentX += colWidths[0];

                // Rating (colored) - allow "Needs Improvement" to wrap between "Needs" and "Improvement"
                // Use regular space (not non-breaking) so it wraps naturally at that point
                const ratingText = String(rating === 'Needs Improvement' ? 'Needs Improvement' : rating || '').trim();
                this.doc.fontSize(10).font('BoldFont').fillColor(ratingColor)
                    .text(ratingText, currentX + 5, tableY + 6, {
                        width: colWidths[1] - 10,
                        align: 'center'
                    });
                currentX += colWidths[1];

                // Actual (colored)
                const actualText = String(`${scorePercent}%` || '').trim();
                this.doc.fontSize(10).font('BoldFont').fillColor(actualColor)
                    .text(actualText, currentX + 5, tableY + 6, {
                        width: colWidths[2] - 10,
                        align: 'center'
                    });
                currentX += colWidths[2];

                // Standard
                const standardText = String(standard || '').trim();
                this.doc.fontSize(10).font('BoldFont').fillColor('#28A745')
                    .text(standardText, currentX + 5, tableY + 6, {
                        width: colWidths[3] - 10,
                        align: 'center'
                    });
                currentX += colWidths[3];

                // Details - ensure full text wrapping (no height limit to prevent clipping)
                const detailsText = String(details || '').trim();
                this.doc.fontSize(10).font('RegularFont').fillColor('#2C3E50')
                    .text(detailsText, currentX + 5, tableY + 6, {
                        width: colWidths[4] - 10,
                        align: 'left',
                        lineGap: 1,
                        ellipsis: false
                    });

                // Draw row border
                this.doc.moveTo(this.margin, tableY + rowHeight)
                    .lineTo(this.margin + this.pageWidth, tableY + rowHeight)
                    .strokeColor('#DEE2E6')
                    .lineWidth(0.5)
                    .stroke();

                tableY += rowHeight;
            });

            this.currentY = tableY + 20;
        });
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
            
            const categoryAudits = categories[categoryName];
            
            // Score badge dimensions
            const badgeWidth = 85;
            const badgeHeight = 20;
            const badgeX = cardX + cardWidth - badgeWidth - 12;
            const textLeftPadding = 12;
            const textRightPadding = 8; // Gap between text and badge
            const textWidth = badgeX - (cardX + textLeftPadding) - textRightPadding;
            
            // Calculate actual card height based on text wrapping
            let totalAuditHeight = 0;
            this.doc.fontSize(10).font('RegularFont'); // Set font for accurate height calculation
            categoryAudits.forEach(audit => {
                const textHeight = this.doc.heightOfString(audit.info.title, { 
                    width: textWidth,
                    lineGap: 2 
                });
                const auditItemHeight = Math.max(textHeight + 4, badgeHeight + 4); // At least badge height + padding
                totalAuditHeight += auditItemHeight + 6; // Add spacing between items
            });
            
            const cardHeight = 60 + totalAuditHeight; // Header + dynamic audit heights
            const totalHeight = cardHeight + 10; // Add some margin for page break check
            
            // Check if card fits on current page (or if we need to start a new row)
            if (column === 0) {
                // First column - check if we need a new page
                this.checkPageBreak(totalHeight);
            } else if (this.currentY + totalHeight > this.doc.page.height - 80) {
                // Second column but doesn't fit - move to next page
                this.addPage();
                cardIndex = 0;
            }
            
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
                
                // Calculate text height for this specific audit title
                this.doc.fontSize(10).font('RegularFont'); // Set font for accurate height
                const textHeight = this.doc.heightOfString(audit.info.title, { 
                    width: textWidth,
                    lineGap: 2 
                });
                const auditItemHeight = Math.max(textHeight + 4, badgeHeight + 4);
                
                // Audit name - with proper width and height constraints to allow wrapping
                this.doc.fontSize(10).font('RegularFont').fillColor('#1F2937')
                    .text(audit.info.title, cardX + textLeftPadding, auditY, { 
                        width: textWidth,
                        height: auditItemHeight,
                        lineGap: 2,
                        ellipsis: false // Allow full text to wrap
                    });
                
                // Score badge - vertically centered with text
                const badgeY = auditY + Math.max(0, (auditItemHeight - badgeHeight) / 2);
                this.doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fill(bgColor);
                this.doc.fontSize(9).font('BoldFont').fillColor(textColor)
                    .text(scoreText, badgeX, badgeY + 2, { width: badgeWidth, align: 'center' });
                
                auditY += auditItemHeight + 6; // Move to next item with spacing
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
    
    // Description text - use auditData.description if available, otherwise use title
    let descriptionText = auditData.description || auditData.title || info.title;
    if (descriptionText) {
        let cleanText = descriptionText.replace(/\[(.*?)\]\(.*?\)/g, '$1').trim();

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
    // Show if displayValue exists, or if numericValue exists (for audits like dom-size)
    const detailedValue = auditData.displayValue || (auditData.numericValue !== undefined && auditData.numericValue !== null ? `${auditData.numericValue}${auditData.numericUnit ? ' ' + auditData.numericUnit : ''}` : null);
    if (detailedValue) {
        const detailedStartY = this.currentY;
        
        // Draw left border
        this.doc.rect(this.margin - 5, detailedStartY, 4, 70).fill('#3B82F6');
        
        // Background box
        this.doc.rect(this.margin - 5, detailedStartY, this.pageWidth + 10, 70).fill('#F9FAFB');
        
        // Content
        this.doc.fontSize(11).font('BoldFont').fillColor('#1F2937').text('Detailed Results', this.margin + 10, detailedStartY + 12);
        this.doc.fontSize(11).font('RegularFont').fillColor('#4B5563').text(detailedValue, this.margin + 10, detailedStartY + 32, { width: this.pageWidth - 20 });
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
    
    addTablePages(auditId, auditData, isAppendixMode = false) {
    if (!auditData.details?.items || auditData.details.items.length === 0) return;
    
    const info = AUDIT_INFO[auditId];
    const tableConfig = this.getTableConfig(auditId);
    const items = auditData.details.items;
    
    // Filter out rows where ANY column is empty, null, undefined, 'N/A', or whitespace
    const filteredItems = items.filter(item => {
        // Check all columns using extractors
        return tableConfig.extractors.every(extractor => {
            const value = extractor(item);
            // Return true if value exists, is not 'N/A', and is not empty/whitespace
            return value && value !== 'N/A' && String(value).trim() !== '';
        });
    });
    
    // If all rows would be filtered out, skip the entire page
    if (filteredItems.length === 0) {
        console.log(`Skipping table for ${auditId} - all rows have empty columns`);
        return; // Exit without adding any content
    }
    
        // In appendix mode, don't add heading (it's already added by addAppendix)
        // In non-appendix mode, check if we need a new page and add heading
        if (!isAppendixMode) {
        // Check if we have enough space for header + at least one table row
        // Footer is at pageHeight - 30, so we need to reserve ~100px (header + row + buffer)
        const pageBottom = this.doc.page.height - 100;
        const headerHeight = 25;
        const minRowHeight = 40;
        const needsNewPage = this.currentY + headerHeight + minRowHeight > pageBottom;
        
        if (needsNewPage) {
            this.addPage();
        } else {
            this.currentY += 10; // Add some spacing if continuing on same page
        }
        
        // Add "Detailed Findings" header with blue color
        this.doc.fontSize(12).font('BoldFont').fillColor('#3B82F6').text('Detailed Findings', this.margin, this.currentY);
        this.currentY += 25;
    }

    const itemsPerPage = 12;
    for (let i = 0; i < filteredItems.length; i += itemsPerPage) {
        if (i > 0) {
            this.addPage();
            // Removed "Detailed Findings - Continued" heading
        }
        this.drawEnhancedTable(filteredItems.slice(i, i + itemsPerPage), tableConfig, info?.category);
    }
}
    
    getTableConfig(auditId) {
        // All widths must sum to pageWidth (515) to prevent overflow
        switch (auditId) {
            case 'text-font-audit':
                return {
                    headers: ['Text Content', 'Element Selector', 'Reason'],
                    widths: [170, 190, 155], // Total: 515
                    extractors: [
                        item => String(item.textSnippet || 'N/A').trim(),
                        item => String(item.containerSelector || 'N/A').trim(),
                        item => 'Font smaller than 16px - difficult for older adults to read'
                    ]
                };
            case 'interactive-color-audit':
                return {
                    headers: ['Interactive Text', 'Element Location', 'Accessibility Issue'],
                    widths: [150, 200, 165], // Total: 515
                    extractors: [
                        item => String(item.text || 'Interactive Element').trim(),
                        item => String(this.extractSelector(item.node) || 'N/A').trim(),
                        item => String(item.explanation || 'Insufficient visual distinction for older adult users').trim()
                    ]
                };
            case 'layout-brittle-audit':
                return {
                    headers: ['Page Element', 'Element Location', 'Accessibility Impact'],
                    widths: [150, 200, 165], // Total: 515
                    extractors: [
                        item => String(this.extractNodeLabel(item.node) || 'Layout Element').trim(),
                        item => String(this.extractSelector(item.node) || 'N/A').trim(),
                        item => 'Layout may break when older adults adjust text size for better readability'
                    ]
                };
            case 'flesch-kincaid-audit':
                return {
                    headers: ['Metric', 'Value'],
                    widths: [257, 258], // Total: 515
                    extractors: [
                        item => String(item.metric || 'N/A').trim(),
                        item => String(item.value || 'N/A').trim()
                    ]
                };
            default:
                return {
                    headers: ['Element', 'Location', 'Accessibility Issue'],
                    widths: [150, 200, 165], // Total: 515
                    extractors: [
                        item => String(item.node?.nodeLabel || item.nodeLabel || 'Page Element').trim(),
                        item => String(item.node?.selector || item.selector || 'N/A').trim(),
                        item => String(item.node?.explanation || item.explanation || 'May impact older adult users').trim()
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
        const rowHeight = 28;
        // Adjusted column widths: Audit Component (290), Score (70), Weight (70), Weighted (85) = 515
        // Increased Weighted from 70 to 85 to prevent "Weighted" from wrapping
        const colWidths = [290, 70, 70, 85]; // Audit Component, Score, Weight, Weighted
        // Reserve space for footer at bottom (footer at pageHeight - 30, so reserve 50px)
        const pageBottom = this.doc.page.height - 50;
        
        // Calculate header height dynamically based on text wrapping
        this.doc.font('BoldFont').fontSize(11);
        const headers = ['Audit Component', 'Score', 'Weight', 'Weighted'];
        let maxHeaderHeight = 0;
        headers.forEach((header, index) => {
            const headerTextHeight = this.doc.heightOfString(header, { 
                width: colWidths[index] - 20,
                lineGap: 2
            });
            if (headerTextHeight > maxHeaderHeight) {
                maxHeaderHeight = headerTextHeight;
            }
        });
        // Add padding: 12px top + 12px bottom = 24px total padding
        const headerHeight = Math.max(maxHeaderHeight + 24, 40);
        
        // Draw header with dark blue background
        this.doc.rect(this.margin, startY, this.pageWidth, headerHeight).fill('#3D5A80');
        this.doc.fillColor('#FFFFFF');
        
        let currentX = this.margin;
        headers.forEach((header, index) => {
            // Center text horizontally using align: 'center' with column width
            // Use lineBreak: false for "Weighted" to ensure it stays on one line
            const useLineBreak = header === 'Weighted' ? false : true;
            this.doc.text(header, currentX + 10, startY + (headerHeight / 2) - (maxHeaderHeight / 2), { 
                width: colWidths[index] - 20,
                align: 'center',
                lineBreak: useLineBreak
            });
            currentX += colWidths[index];
        });
        
        let tableY = startY + headerHeight;
        
        // Draw rows with alternating background
        items.forEach((item, rowIndex) => {
            // Calculate actual row height needed for Audit Component name FIRST
            // Set font size before calculating height for accuracy
            this.doc.fontSize(10).font('RegularFont');
            const componentNameHeight = this.doc.heightOfString(item.name, { 
                width: colWidths[0] - 20
            });
            const actualRowHeight = Math.max(rowHeight, componentNameHeight + 12);
            
            // Check if row would exceed page bottom margin (with safety buffer)
            // Also check if rendering this row would leave less than minimum space for next row
            // This prevents single-row pages
            const minSpaceForNextRow = 60; // Minimum space needed for next row (40px row + 20px buffer)
            const spaceAfterRow = pageBottom - (tableY + actualRowHeight);
            const isLastRow = rowIndex === items.length - 1;
            
            if (tableY + actualRowHeight > pageBottom || (!isLastRow && spaceAfterRow < minSpaceForNextRow)) {
                this.addPage();
                // Redraw header on new page
                this.doc.rect(this.margin, this.currentY, this.pageWidth, headerHeight).fill('#3D5A80');
                this.doc.font('BoldFont').fontSize(11).fillColor('#FFFFFF');
                currentX = this.margin;
                headers.forEach((header, index) => {
                    // Center text horizontally using align: 'center' with column width
                    // Use lineBreak: false for "Weighted" to ensure it stays on one line
                    const useLineBreak = header === 'Weighted' ? false : true;
                    this.doc.text(header, currentX + 10, this.currentY + (headerHeight / 2) - (maxHeaderHeight / 2), { 
                        width: colWidths[index] - 20,
                        align: 'center',
                        lineBreak: useLineBreak
                    });
                    currentX += colWidths[index];
                });
                tableY = this.currentY + headerHeight;
                // Recalculate pageBottom after adding new page
                pageBottom = this.doc.page.height - 50;
            }
            
            // Alternating light gray background - use actual row height
            const bgColor = rowIndex % 2 === 0 ? '#FFFFFF' : '#F8F9FA';
            this.doc.rect(this.margin, tableY, this.pageWidth, actualRowHeight).fill(bgColor);
            currentX = this.margin;
            
            // Audit Component (left-aligned) - remove height constraint
            const componentName = String(item.name || '').trim();
            this.doc.font('RegularFont').fontSize(10).fillColor('#2C3E50').text(componentName, currentX + 10, tableY + 6, {
                width: colWidths[0] - 20,
                align: 'left',
                ellipsis: false
            });
            currentX += colWidths[0];
            
            // Score (center-aligned with color based on value)
            const scoreValue = parseInt(item.score);
            let scoreColor = '#DC3545'; // Red for Fail (<70%)
            if (scoreValue >= 80) {
                scoreColor = '#28A745'; // Green for Pass (>=80%)
            } else if (scoreValue >= 70) {
                scoreColor = '#FD7E14'; // Yellow/Orange for Needs Improvement (70-79%)
            }
            const scoreText = String(item.score || '').trim();
            this.doc.font('BoldFont').fontSize(10).fillColor(scoreColor).text(scoreText, currentX + 10, tableY + 6, {
                width: colWidths[1] - 20,
                align: 'center'
            });
            currentX += colWidths[1];
            
            // Weight (center-aligned)
            const weightText = String(item.weight || '').trim();
            this.doc.font('RegularFont').fontSize(10).fillColor('#2C3E50').text(weightText, currentX + 10, tableY + 6, {
                width: colWidths[2] - 20,
                align: 'center'
            });
            currentX += colWidths[2];
            
            // Weighted (center-aligned)
            const contributionText = String(item.contribution || '').trim();
            this.doc.font('RegularFont').fontSize(10).fillColor('#2C3E50').text(contributionText, currentX + 10, tableY + 6, {
                width: colWidths[3] - 20,
                align: 'center'
            });
            
            // Draw light bottom border - use actual row height
            this.doc.moveTo(this.margin, tableY + actualRowHeight)
                .lineTo(this.margin + this.pageWidth, tableY + actualRowHeight)
                .strokeColor('#DEE2E6')
                .lineWidth(0.5)
                .stroke();
            tableY += actualRowHeight;
        });
        
        // Draw TOTAL CALCULATION row with light blue background
        const totalRowHeight = 25;
        
        // Check if TOTAL row would exceed page bottom margin
        if (tableY + totalRowHeight > pageBottom) {
            this.addPage();
            // Redraw header on new page
            this.doc.rect(this.margin, this.currentY, this.pageWidth, headerHeight).fill('#3D5A80');
            this.doc.font('BoldFont').fontSize(11).fillColor('#FFFFFF');
            currentX = this.margin;
            headers.forEach((header, index) => {
                // Center text horizontally using align: 'center' with column width
                this.doc.text(header, currentX + 10, this.currentY + (headerHeight / 2) - (maxHeaderHeight / 2), { 
                    width: colWidths[index] - 20,
                    align: 'center'
                });
                currentX += colWidths[index];
            });
            tableY = this.currentY + headerHeight;
        }
        
        this.doc.rect(this.margin, tableY, this.pageWidth, totalRowHeight).fill('#D6EAF8');
        
        currentX = this.margin;
        this.doc.font('BoldFont').fontSize(11).fillColor('#2C3E50').text('TOTAL CALCULATION', currentX + 10, tableY + 7);
        currentX += colWidths[0];
        
        // Empty cell for Score column
        this.doc.fontSize(10).text('—', currentX + 10, tableY + 7, {
            width: colWidths[1] - 20,
            align: 'center'
        });
        currentX += colWidths[1];
        
        // Total Weight
        const totalWeightText = String(scoreData.totalWeight || '').trim();
        this.doc.fontSize(10).text(totalWeightText, currentX + 10, tableY + 7, {
            width: colWidths[2] - 20,
            align: 'center'
        });
        currentX += colWidths[2];
        
        // Total Weighted
        const totalWeightedText = String(scoreData.totalWeightedScore.toFixed(2) || '').trim();
        this.doc.fontSize(10).text(totalWeightedText, currentX + 10, tableY + 7, {
            width: colWidths[3] - 20,
            align: 'center'
        });
        
        tableY += totalRowHeight;
        
        // Final Score calculation below table
        this.currentY = tableY + 15;
        
        // Check if final score text would exceed page bottom margin
        this.doc.fontSize(11);
        const finalScoreTextHeight = this.doc.heightOfString('Final Score: 100.00 ÷ 100 = 100%');
        if (this.currentY + finalScoreTextHeight > pageBottom) {
            this.addPage();
        }
        
        const finalScoreText = `Final Score: ${scoreData.totalWeightedScore.toFixed(2)} ÷ ${scoreData.totalWeight} = ${Math.round(scoreData.finalScore)}%`;
        this.doc.fontSize(11).font('BoldFont').fillColor('#2C3E50').text(
            finalScoreText,
            this.margin,
            this.currentY
        );
        
        this.currentY += 30;
    }
    
    drawEnhancedTable(items, config, category) {
    if (!items || items.length === 0) return;
    
    // Filter out rows where ANY column is empty, null, undefined, 'N/A', or whitespace
    const itemsToShow = items.filter(item => {
        // Check all columns using extractors
        return config.extractors.every(extractor => {
            const value = extractor(item);
            // Return true if value exists, is not 'N/A', and is not empty/whitespace
            return value && value !== 'N/A' && String(value).trim() !== '';
        });
    });
    
    // If ALL rows have empty columns, don't render the table at all
    if (itemsToShow.length === 0) {
        console.log('Skipping table - all rows have empty columns');
        return; // Exit without rendering anything
    }
    
    const startY = this.currentY;
    let tableY = startY;
    const auditInfo = AUDIT_INFO[config.auditId];
    // Reserve space for footer at bottom (footer at pageHeight - 30, so reserve 50px)
    let pageBottom = this.doc.page.height - 50;
    
    // Calculate header height dynamically based on text wrapping
    this.doc.font('BoldFont').fontSize(11);
    let maxHeaderHeight = 0;
    config.headers.forEach((header, index) => {
        const cellPadding = 10;
        const availableWidth = Math.max(config.widths[index] - (cellPadding * 2), 20);
        const headerTextHeight = this.doc.heightOfString(header, { 
            width: availableWidth,
            lineGap: 2
        });
        if (headerTextHeight > maxHeaderHeight) {
            maxHeaderHeight = headerTextHeight;
        }
    });
    // Add padding: 12px top + 12px bottom = 24px total padding
    const headerHeight = Math.max(maxHeaderHeight + 24, 40);
    
    // Draw header with light gray background
    this.doc.rect(this.margin, tableY, this.pageWidth, headerHeight).fill('#F3F4F6');
    this.doc.fillColor('#374151');
    let currentX = this.margin;
    
    config.headers.forEach((header, index) => {
        const cellPadding = 10;
        const availableWidth = Math.max(config.widths[index] - (cellPadding * 2), 20);
        // Center text horizontally using align: 'center' with column width
        this.doc.text(header, currentX + cellPadding, tableY + (headerHeight / 2) - (maxHeaderHeight / 2), { 
            width: availableWidth, 
            align: 'center' 
        });
        currentX += config.widths[index];
    });
    
    tableY += headerHeight;
    this.doc.font('RegularFont').fontSize(10);
    
    // Draw rows with alternating white background and bottom borders
    itemsToShow.forEach((item, rowIndex) => {
        const rowData = config.extractors.map(extractor => {
            let value = String(extractor(item) || 'N/A').trim();
            // Replace "Senior" with "Accessibility" in table cell text
            value = value.replace(/\bSenior\b/gi, 'Accessibility');
            return value;
        });
        let maxRowHeight = 0;
        
        rowData.forEach((cellValue, colIndex) => {
            const cellWidth = config.widths[colIndex] - 20;
            // Calculate height using same parameters as text rendering (lineGap: 2)
            // Ensure font size is 10pt for accurate height calculation
            this.doc.fontSize(10).font('RegularFont');
            const cellHeight = this.doc.heightOfString(cellValue, { 
                width: cellWidth,
                lineGap: 2
            });
            if (cellHeight > maxRowHeight) {
                maxRowHeight = cellHeight;
            }
        });
        
        // Add padding (10px top + 10px bottom) and ensure minimum row height
        const rowHeight = Math.max(maxRowHeight + 20, 40);
        // Don't cap row height - allow full text to display
        const finalRowHeight = rowHeight;
        
        // Check if row would exceed page bottom margin (with safety buffer for footer)
        // Footer is at pageHeight - 30, so reserve 50px (30px footer + 20px buffer)
        // Also check if rendering this row would leave less than minimum space for next row
        // This prevents single-row pages
        const minSpaceForNextRow = 60; // Minimum space needed for next row (40px row + 20px buffer)
        pageBottom = this.doc.page.height - 50;
        const spaceAfterRow = pageBottom - (tableY + finalRowHeight);
        
        // If row doesn't fit OR if it would leave less than minimum space for next row, move to new page
        if (tableY + finalRowHeight > pageBottom || (spaceAfterRow < minSpaceForNextRow && rowIndex < itemsToShow.length - 1)) {
            this.addPage();
            // Removed "Detailed Findings - Continued" heading
            tableY = this.currentY;
            
            // Redraw header on new page
            this.doc.rect(this.margin, tableY, this.pageWidth, headerHeight).fill('#F3F4F6');
            this.doc.font('BoldFont').fontSize(11).fillColor('#374151');
            currentX = this.margin;
            config.headers.forEach((header, index) => {
                const cellPadding = 10;
                const availableWidth = Math.max(config.widths[index] - (cellPadding * 2), 20);
                // Center text horizontally using align: 'center' with column width
                this.doc.text(header, currentX + cellPadding, tableY + (headerHeight / 2) - (maxHeaderHeight / 2), { 
                    width: availableWidth, 
                    align: 'center' 
                });
                currentX += config.widths[index];
            });
            tableY += headerHeight;
            this.doc.font('RegularFont').fontSize(10);
            // Recalculate pageBottom after adding new page
            pageBottom = this.doc.page.height - 50;
        }
        
        // White background for all rows
        this.doc.rect(this.margin, tableY, this.pageWidth, finalRowHeight).fill('#FFFFFF');
        
        // Draw cell content - ensure full text wrapping (no height limit to prevent clipping)
        currentX = this.margin;
        rowData.forEach((cellValue, colIndex) => {
            // Calculate available width for text (column width minus padding)
            const cellPadding = 10;
            const availableWidth = Math.max(config.widths[colIndex] - (cellPadding * 2), 20);
            
            // Draw text without height constraint - row height was already calculated to fit all text
            // Ensure font size is consistently 10pt for all table cells
            this.doc.fontSize(10).font('RegularFont').fillColor('#374151').text(cellValue, currentX + cellPadding, tableY + 10, {
                width: availableWidth,
                lineGap: 2,
                align: 'left',
                ellipsis: false
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
        
        // Final safety check - if tableY exceeds page bottom, we have a problem
        if (tableY > pageBottom) {
            console.warn(`Warning: Table row exceeded page bottom. tableY: ${tableY}, pageBottom: ${pageBottom}`);
        }
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

            console.log('Generating older adult-friendly accessibility report...');
            console.log(`Overall Score Calculated: ${scoreData.finalScore.toFixed(0)}`);

            // Add standardized title page as the first page
            this.addTitlePage(reportData);
            this.addPage(); // Add a new page after title page
            
            this.addIntroPage(reportData, scoreData, options.planType || 'pro');
            this.addExecutiveSummary(reportData, scoreData);
            this.addScoreCalculationPage(reportData, scoreData);
            this.addSummaryPage(reportData);
            this.addPriorityRecommendations(reportData);
            this.addAreasOfStrength(reportData);
            this.addAboutPage(reportData, scoreData);
            this.addNextStepsPage();
            this.addAppendix(reportData);

            const audits = reportData.audits || {};
            
            // Add footer to the last page before ending
            this.addFooter();
            
            // End the document
            this.doc.end();

            return new Promise((resolve, reject) => {
                stream.on('finish', () => {
                    const successMessage = {
                        success: true,
                        message: 'Older adult accessibility report generated successfully',
                        reportPath: finalOutputPath,
                        clientFolder: clientFolder,
                        fileName: fileName,
                        formFactor: formFactor,
                        url: url,
                        score: scoreData.finalScore.toFixed(0)
                    };
                    console.log(`Older adult accessibility report generated successfully: ${finalOutputPath}`);
                    resolve(successMessage);
                });
                stream.on('error', reject);
            });

        } catch (error) {
            console.error('Error generating older adult accessibility report:', error.message);
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

    const generator = new ElderlyAccessibilityPDFGenerator({ imagePaths, clientEmail: email_address });
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