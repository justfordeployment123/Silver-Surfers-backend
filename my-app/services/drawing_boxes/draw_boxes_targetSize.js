import fs from 'fs';
import sharp from 'sharp';

async function isVisuallyDistinct(imagePathOrBuffer, rect) {
    try {
        if (rect.width < 2 || rect.height < 2) return false;
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 2000)
        );
        
        const analysisPromise = sharp(imagePathOrBuffer)
            .extract({ 
                left: Math.floor(rect.left), 
                top: Math.floor(rect.top), 
                width: Math.ceil(rect.width), 
                height: Math.ceil(rect.height) 
            })
            .stats();
            
        const region = await Promise.race([analysisPromise, timeoutPromise]);
        const VISIBILITY_THRESHOLD = 5;
        return region.channels.some(c => c.stdev > VISIBILITY_THRESHOLD);
    } catch (error) {
        console.warn(`⚠️  Could not analyze region for box at (${rect.left}, ${rect.top}): ${error.message}`);
        return false;
    }
}

/**
 * Extracts box data from the standard Lighthouse 'target-size' audit.
 * @param {object} lighthouseReport The full Lighthouse report object.
 * @param {string} auditId The ID of the audit to extract from.
 * @returns {Array<object>}
 */
function extractBoxData(lighthouseReport, auditId) {
    const boxes = [];
    const audit = lighthouseReport.audits[auditId];
    if (!audit?.details?.items) return boxes;

    for (const item of audit.details.items) {
        // The node object contains all the element details
        const node = item.node;
        if (node?.boundingRect) {
            boxes.push({
                rect: node.boundingRect,
                nodeLabel: node.nodeLabel,
                selector: node.selector,
                explanation: item.explanation,
            });
        }
    }
    return boxes;
}

/**
 * Draws the final image with numbered boxes.
 * @param {string | Buffer} imageBuffer The image to draw on.
 * @param {string} outputImagePath Where to save the final image.
 * @param {Array<object>} boundingBoxes The list of boxes to draw.
 * @param {object} options Drawing options.
 */
async function enhanceAndHighlight(imageBuffer, outputImagePath, boundingBoxes, options = {}) {
    const { boxColor = 'purple' } = options;
    try {
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();
        const { width, height } = metadata;

        let svgElements = '';
        boundingBoxes.forEach((boxData, index) => {
            const rect = boxData.rect;
            const boxNumber = index + 1;

            const svgRect = `<rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="none" stroke="${boxColor}" stroke-width="3" />`;
            const svgShadowRect = `<rect x="${rect.left + 1}" y="${rect.top + 1}" width="${rect.width}" height="${rect.height}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="3" />`;

            const idealSize = Math.max(10, Math.min(rect.height * 0.8, 20));
            const circleRadius = idealSize;
            const fontSize = Math.round(idealSize * 1.2);
            const circleCx = rect.left;
            const circleCy = rect.top;

            const svgCircleShadow = `<circle cx="${circleCx}" cy="${circleCy}" r="${circleRadius + 1}" fill="rgba(0,0,0,0.5)" />`;
            const svgCircle = `<circle cx="${circleCx}" cy="${circleCy}" r="${circleRadius}" fill="${boxColor}" />`;
            const svgText = `<text x="${circleCx}" y="${circleCy}" font-family="sans-serif" font-size="${fontSize}" fill="white" text-anchor="middle" dominant-baseline="central" font-weight="bold">${boxNumber}</text>`;

            svgElements += svgShadowRect + svgRect + svgCircleShadow + svgCircle + svgText;
        });

        const svgOverlay = `<svg width="${width}" height="${height}">${svgElements}</svg>`;
        await image
            .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
            .toFile(outputImagePath);

    } catch (error) {
        console.error('❌ Error enhancing image:', error.message); throw error;
    }
}

// --- MODIFIED FUNCTION ---
export async function processTargetSizeAudit(jsonReportPath, outputImagePath) {
    const AUDIT_ID = 'target-size';
    // const outputImagePath = '../drawing_boxes/highlighted-target-size.png'; // This is no longer needed

    if (!outputImagePath) {
        throw new Error("outputImagePath is required.");
    }

    console.log(`🔄 Reading report: ${jsonReportPath}`);
    const lighthouseReport = JSON.parse(fs.readFileSync(jsonReportPath, 'utf8'));

    const screenshotData = lighthouseReport.fullPageScreenshot?.screenshot?.data;
    if (!screenshotData) {
        console.error('❌ Error: Report does not contain a full-page screenshot.'); 
        return null; // Return null if no image can be generated
    }
    const screenshotBuffer = Buffer.from(screenshotData.split(',').pop(), 'base64');

    console.log(`🔎 Extracting data for audit: "${AUDIT_ID}"`);
    const allBoxes = extractBoxData(lighthouseReport, AUDIT_ID);

    // Filter out any elements that aren't actually visible in the screenshot
    const finalBoxes = [];
    
    // Limit processing to prevent hanging on large datasets
    const maxBoxesToProcess = 50;
    const boxesToProcess = allBoxes.slice(0, maxBoxesToProcess);
    
    if (allBoxes.length > maxBoxesToProcess) {
        console.log(`⚠️  Limiting processing to ${maxBoxesToProcess} boxes out of ${allBoxes.length} to prevent timeout`);
    }
    
    for (const box of boxesToProcess) {
        try {
            if (await isVisuallyDistinct(screenshotBuffer, box.rect)) {
                finalBoxes.push(box);
            }
        } catch (error) {
            console.warn(`⚠️  Skipping box due to processing error: ${error.message}`);
        }
    }

    if (finalBoxes.length === 0) {
        console.log(`\n✅ No target size issues found. No image will be generated.`);
        return null; // Return null to signal no image was created
    }

    console.log('\n📦 Legend for Highlighted Target Size Issues:');
    const tableData = finalBoxes.map((box, index) => ({
        'Box #': index + 1,
        'Element': box.nodeLabel || box.selector,
        'Issue Details': box.explanation,
    }));
    console.table(tableData);

    console.log(`\n🎨 Drawing ${finalBoxes.length} boxes in purple...`);
    await enhanceAndHighlight(screenshotBuffer, outputImagePath, finalBoxes, { boxColor: 'purple' });

    console.log(`\n✅ Success! Image saved to: ${outputImagePath}`);
    
    // Return the path to confirm success and provide the file location
    return outputImagePath;
}