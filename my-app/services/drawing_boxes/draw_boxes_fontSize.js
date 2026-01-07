import fs from 'fs/promises'; // Use the async version of fs
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

function filterContainingBoxes(boxes) {
    const indicesToRemove = new Set();
    for (let i = 0; i < boxes.length; i++) {
        for (let j = 0; j < boxes.length; j++) {
            if (i === j) continue;
            const boxA = boxes[i].rect;
            const boxB = boxes[j].rect;
            const contains = boxA.left <= boxB.left &&
                boxA.top <= boxB.top &&
                (boxA.left + boxA.width) >= (boxB.left + boxB.width) &&
                (boxA.top + boxA.height) >= (boxB.top + boxB.height);
            if (contains && (boxA.width > boxB.width || boxA.height > boxB.height)) {
                indicesToRemove.add(i);
            }
        }
    }
    const kept = [];
    const removed = [];
    boxes.forEach((box, index) => {
        if (indicesToRemove.has(index)) {
            removed.push(box);
        } else {
            kept.push(box);
        }
    });
    return { kept, removed };
}

function extractBoxData(lighthouseReport, auditId) {
    const boxes = [];
    const audit = lighthouseReport.audits[auditId];
    if (!audit?.details?.items) return boxes;
    for (const item of audit.details.items) {
        if (item.rect) {
            boxes.push({
                rect: { left: item.rect.left, top: item.rect.top, width: item.rect.width, height: item.rect.height },
                color: 'red',
                textSnippet: item.textSnippet,
            });
        }
    }
    return boxes;
}

async function enhanceAndHighlightMultiple(imagePathOrBuffer, outputImagePath, boundingBoxes, options = {}) {
    const { scaleFactor = 1, sharpenAmount = 1, boxThickness = 3 } = options;
    try {
        const image = sharp(imagePathOrBuffer);
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
        console.error('❌ Error enhancing image:', error.message); throw error;
    }
}

// --- MODIFIED EXPORTED FUNCTION ---
export async function processTextFontAudit(jsonReportPath, outputImagePath) {
    const AUDIT_ID = 'text-font-audit';

    // 1. Add validation for the required outputImagePath
    if (!outputImagePath) {
        throw new Error("outputImagePath is required for processTextFontAudit.");
    }
    
    console.log(`🔄 Reading report: ${jsonReportPath}`);
    let lighthouseReport;
    try {
        // 2. Use async file read instead of sync
        lighthouseReport = JSON.parse(await fs.readFile(jsonReportPath, 'utf8'));
    } catch (error) {
        console.error('❌ Error parsing JSON report:', error.message);
        return null;
    }

    // Screenshots are not required - skip image generation if not available
    const screenshotData = lighthouseReport.fullPageScreenshot?.screenshot?.data;
    if (!screenshotData) {
        return null; // Silently skip if no screenshot
    }
    
    // 3. Work with the screenshot in memory instead of creating a temp file
    const screenshotBuffer = Buffer.from(screenshotData.split(',').pop(), 'base64');

    console.log(`🔎 Extracting data for audit: "${AUDIT_ID}"`);
    const allBoxes = extractBoxData(lighthouseReport, AUDIT_ID);
    
    const { kept: nonContainerBoxes, removed: containerBoxes } = filterContainingBoxes(allBoxes);

    const finalBoxes = [];
    const visuallyEmptyBoxes = [];
    
    // Limit processing to prevent hanging on large datasets
    const maxBoxesToProcess = 50;
    const boxesToProcess = nonContainerBoxes.slice(0, maxBoxesToProcess);
    
    if (nonContainerBoxes.length > maxBoxesToProcess) {
        console.log(`⚠️  Limiting processing to ${maxBoxesToProcess} boxes out of ${nonContainerBoxes.length} to prevent timeout`);
    }
    
    for (const box of boxesToProcess) {
        // 4. Pass the buffer directly to the helper function
        if (await isVisuallyDistinct(screenshotBuffer, box.rect)) {
            finalBoxes.push(box);
        } else {
            visuallyEmptyBoxes.push(box);
        }
    }

    if (containerBoxes.length > 0) {
        console.log('\n🗑️ Skipped Container Boxes:');
        console.table(containerBoxes.map(box => ({ Text: (box.textSnippet || '').replace(/\s+/g, ' ').trim() })));
    }
    if (visuallyEmptyBoxes.length > 0) {
        console.log('\n🗑️ Skipped Visually Empty Boxes:');
        console.table(visuallyEmptyBoxes.map(box => ({ Text: (box.textSnippet || '').replace(/\s+/g, ' ').trim() })));
    }

    if (finalBoxes.length === 0) {
        console.log('\nℹ️ No elements left to highlight. No image will be generated.');
        return null; // 5. Return null if no image is created
    }

    console.log('\n📦 Legend for Highlighted Boxes:');
    const tableData = finalBoxes.map((box, index) => ({
        'Box #': index + 1,
        'Text Snippet': (box.textSnippet || '').replace(/\s+/g, ' ').trim(),
    }));
    console.table(tableData);

    console.log(`\n🎨 Drawing ${finalBoxes.length} final boxes on screenshot...`);
    await enhanceAndHighlightMultiple(screenshotBuffer, outputImagePath, finalBoxes);

    // No need to delete a temp file anymore.
    console.log(`\n✅ Success! Image saved to: ${outputImagePath}`);
    
    // 6. Return the path to confirm success and provide the file location
    return outputImagePath;
}