import fs from 'fs/promises'; // Use the async version of fs for server environments
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

function extractBoxData(lighthouseReport, auditId) {
    const boxes = [];
    const audit = lighthouseReport.audits[auditId];
    if (!audit?.details?.items) return boxes;

    for (const item of audit.details.items) {
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

async function enhanceAndHighlight(imageBuffer, outputImagePath, boundingBoxes, options = {}) {
    const { boxColor = 'red' } = options;
    try {
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();
        const { width, height } = metadata;

        let svgElements = '';
        boundingBoxes.forEach((boxData, index) => {
            const rect = boxData.rect;
            const boxNumber = index + 1;

            svgElements += `<rect x="${rect.left + 1}" y="${rect.top + 1}" width="${rect.width}" height="${rect.height}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="3" />`;
            svgElements += `<rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="none" stroke="${boxColor}" stroke-width="3" />`;

            const idealSize = Math.max(10, Math.min(rect.height * 0.8, 20));

            svgElements += `<circle cx="${rect.left}" cy="${rect.top}" r="${idealSize + 1}" fill="rgba(0,0,0,0.5)" />`;
            svgElements += `<circle cx="${rect.left}" cy="${rect.top}" r="${idealSize}" fill="${boxColor}" />`;
            svgElements += `<text x="${rect.left}" y="${rect.top}" font-family="sans-serif" font-size="${Math.round(idealSize * 1.2)}" fill="white" text-anchor="middle" dominant-baseline="central" font-weight="bold">${boxNumber}</text>`;
        });

        const svgOverlay = `<svg width="${width}" height="${height}">${svgElements}</svg>`;
        await image
            .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
            .toFile(outputImagePath);

    } catch (error) {
        console.error('❌ Error enhancing image:', error.message);
        throw error;
    }
}


// --- MODIFIED EXPORTED FUNCTION ---
export async function processColorContrastAudit(jsonReportPath, outputImagePath) {
    const AUDIT_ID = 'color-contrast';

    // 1. Add validation for the required outputImagePath
    if (!outputImagePath) {
        throw new Error("outputImagePath is required for processColorContrastAudit.");
    }
    
    console.log(`🔄 Reading report: ${jsonReportPath}`);
    // 2. Use async file read instead of sync
    const lighthouseReport = JSON.parse(await fs.readFile(jsonReportPath, 'utf8'));

    // Screenshots are not required - skip image generation if not available
    const screenshotData = lighthouseReport.fullPageScreenshot?.screenshot?.data;
    if (!screenshotData) {
        return null; // Silently skip if no screenshot
    }
    const screenshotBuffer = Buffer.from(screenshotData.split(',').pop(), 'base64');

    console.log(`🔎 Extracting data for audit: "${AUDIT_ID}"`);
    const allBoxes = extractBoxData(lighthouseReport, AUDIT_ID);

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
        console.log(`\n✅ No color contrast issues found. No image will be generated.`);
        return null; // 3. Return null if no image is created
    }

    console.log('\n📦 Legend for Highlighted Contrast Issues:');
    const tableData = finalBoxes.map((box, index) => ({
        'Box #': index + 1,
        'Element': box.nodeLabel || box.selector,
        'Issue Details': box.explanation,
    }));
    console.table(tableData);

    console.log(`\n🎨 Drawing ${finalBoxes.length} boxes in yellow...`);
    await enhanceAndHighlight(screenshotBuffer, outputImagePath, finalBoxes, { boxColor: 'yellow' });

    console.log(`\n✅ Success! Image saved to: ${outputImagePath}`);

    // 4. Return the path to confirm success and provide the file location to the server
    return outputImagePath;
}