import fs from 'fs';
import { promises as fsPromises } from 'fs';
import sharp from 'sharp';

function extractBoxData(lighthouseReport, auditId) {
    const boxes = [];
    const audit = lighthouseReport.audits[auditId];
    if (!audit?.details?.items) return boxes;

    for (const item of audit.details.items) {
        const rect = item.node?.boundingRect;
        if (rect) {
            boxes.push({
                rect: {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                },
                color: 'blue',
                textSnippet: item.node?.nodeLabel || '',
                // The 'thickness' property is added to be compatible with the function below
                thickness: 3 
            });
        }
    }
    return boxes;
}

// MODIFIED: This function now accepts a buffer or a path
async function enhanceAndHighlightMultiple(imagePathOrBuffer, outputImagePath, boundingBoxes, options = {}) {
    const { scaleFactor = 1, sharpenAmount = 1, boxThickness = 3 } = options;
    try {
        const image = sharp(imagePathOrBuffer); // sharp can handle both paths and buffers
        const metadata = await image.metadata();

        if (!metadata.width || !metadata.height) {
            throw new Error("Could not read image metadata.");
        }

        const newWidth = Math.round(metadata.width * scaleFactor);
        const newHeight = Math.round(metadata.height * scaleFactor);
        let processedImage = image.resize(newWidth, newHeight, { kernel: sharp.kernel.lanczos3 });
        if (sharpenAmount > 0) processedImage = processedImage.sharpen({ sigma: sharpenAmount * 0.5 });

        let svgElements = '';
        boundingBoxes.forEach((boxData, index) => {
            const rect = boxData.rect;
            const boxNumber = index + 1;
            const scaledX = Math.round(rect.left * scaleFactor);
            const scaledY = Math.round(rect.top * scaleFactor);
            const scaledWidth = Math.round(rect.width * scaleFactor);
            const scaledHeight = Math.round(rect.height * scaleFactor);
            const scaledThickness = Math.round((boxData.thickness || boxThickness) * scaleFactor);
            
            svgElements += `<rect x="${scaledX + 1}" y="${scaledY + 1}" width="${scaledWidth}" height="${scaledHeight}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="${scaledThickness}" />`;
            svgElements += `<rect x="${scaledX}" y="${scaledY}" width="${scaledWidth}" height="${scaledHeight}" fill="none" stroke="${boxData.color}" stroke-width="${scaledThickness}" />`;
            
            const idealSize = Math.max(8, Math.min(scaledHeight * 0.8, 20));
            const circleRadius = idealSize;
            const fontSize = Math.round(idealSize * 1.2);
            
            svgElements += `<circle cx="${scaledX}" cy="${scaledY}" r="${circleRadius + 1}" fill="rgba(0,0,0,0.5)" />`;
            svgElements += `<circle cx="${scaledX}" cy="${scaledY}" r="${circleRadius}" fill="${boxData.color}" />`;
            svgElements += `<text x="${scaledX}" y="${scaledY}" font-family="sans-serif" font-size="${fontSize}" fill="white" text-anchor="middle" dominant-baseline="central" font-weight="bold">${boxNumber}</text>`;
        });

        const svgOverlay = `<svg width="${newWidth}" height="${newHeight}">${svgElements}</svg>`;
        await processedImage.composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }]).png({ quality: 95, adaptiveFiltering: true }).toFile(outputImagePath);
    } catch (error) {
        console.error('❌ Error enhancing image:', error.message);
        throw error;
    }
}

// --- MODIFIED EXPORTED FUNCTION ---
export async function processLayoutBrittleAudit(jsonReportPath, outputImagePath) {
    const AUDIT_ID = 'layout-brittle-audit';

    // 1. Add validation for the required outputImagePath
    if (!outputImagePath) {
        throw new Error("outputImagePath is required for processLayoutBrittleAudit.");
    }

    console.log(`🔄 Reading report: ${jsonReportPath}`);
    let lighthouseReport;
    try {
        const reportContent = await fsPromises.readFile(jsonReportPath, 'utf8');
        lighthouseReport = JSON.parse(reportContent);
    } catch (error) {
        console.error('❌ Error parsing JSON report:', error.message);
        return null; // Return null on failure
    }

    const screenshotData = lighthouseReport.fullPageScreenshot?.screenshot?.data;
    if (!screenshotData) {
        console.error('❌ Error: Report does not contain a full-page screenshot');
        return null;
    }
    
    // 2. Work with the screenshot in memory (more efficient) instead of creating a temp file.
    const screenshotBuffer = Buffer.from(screenshotData.split(',').pop(), 'base64');

    console.log(`🔎 Extracting data for audit: "${AUDIT_ID}"`);
    const finalBoxes = extractBoxData(lighthouseReport, AUDIT_ID);

    if (finalBoxes.length === 0) {
        console.log('✅ No elements with fixed heights found for this audit.');
        return null; // Return null to signal no image was created
    }

    console.log('\n📦 Legend for Highlighted Layout Boxes:');
    const tableData = finalBoxes.map((box, index) => ({
        'Box #': index + 1,
        'Text Snippet': (box.textSnippet || '').replace(/\s+/g, ' ').trim(),
    }));
    console.table(tableData);

    console.log(`\n🎨 Drawing ${finalBoxes.length} boxes on screenshot...`);
    // 3. Pass the buffer directly to the drawing function instead of a temp file path.
    await enhanceAndHighlightMultiple(screenshotBuffer, outputImagePath, finalBoxes);

    // No need to delete a temp file anymore.
    console.log(`\n✅ Success! Image saved to: ${outputImagePath}`);
    
    // 4. Return the path to confirm success and provide the file location to the server.
    return outputImagePath;
}