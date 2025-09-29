import path from 'path';
import { processLayoutBrittleAudit } from './draw_boxes_layout.js';
import { processInteractiveColorAudit } from './draw_boxes_interactivecolor.js';
import { processColorContrastAudit } from './draw_boxes_contrast.js';
import { processTargetSizeAudit } from './draw_boxes_targetSize.js';
import { processTextFontAudit } from './draw_boxes_fontSize.js';

/**
 * Runs all five image processing audits and saves the images to a specific folder.
 * @param {string} jsonFilePath - The path to the Lighthouse report.
 * @param {string} outputFolder - The unique folder where the server wants the images to be saved.
 * @returns {Promise<object>} A map of audit IDs to the generated image paths.
 */
export async function createAllHighlightedImages(jsonFilePath, outputFolder) {
    console.log(`--- Starting image generation in folder: ${outputFolder} ---`);
    const imagePaths = {};
    const reportName = path.basename(jsonFilePath, '.json');

    // 1. Define the full, unique output path for each image inside the job folder
    const brittlePath = path.join(outputFolder, `${reportName}-layout-brittle.png`);
    const interactivePath = path.join(outputFolder, `${reportName}-interactive-color.png`);
    const contrastPath = path.join(outputFolder, `${reportName}-color-contrast.png`);
    const targetPath = path.join(outputFolder, `${reportName}-target-size.png`);
    const fontPath = path.join(outputFolder, `${reportName}-text-font.png`);

    // Add overall timeout for the entire image generation process
    const overallTimeout = 120000; // 2 minutes
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Image generation timeout')), overallTimeout)
    );

    const processPromise = async () => {
        // 2. Call each of your modified functions, passing the unique output path to each
        // Wrap each in try-catch to prevent one failure from stopping the entire process
        try {
            imagePaths['layout-brittle-audit'] = await processLayoutBrittleAudit(jsonFilePath, brittlePath);
        } catch (error) {
            console.warn(`⚠️  Layout brittle audit failed: ${error.message}`);
        }
        
        try {
            imagePaths['interactive-color-audit'] = await processInteractiveColorAudit(jsonFilePath, interactivePath);
        } catch (error) {
            console.warn(`⚠️  Interactive color audit failed: ${error.message}`);
        }
        
        try {
            imagePaths['color-contrast'] = await processColorContrastAudit(jsonFilePath, contrastPath);
        } catch (error) {
            console.warn(`⚠️  Color contrast audit failed: ${error.message}`);
        }
        
        try {
            imagePaths['target-size'] = await processTargetSizeAudit(jsonFilePath, targetPath);
        } catch (error) {
            console.warn(`⚠️  Target size audit failed: ${error.message}`);
        }
        
        try {
            imagePaths['text-font-audit'] = await processTextFontAudit(jsonFilePath, fontPath);
        } catch (error) {
            console.warn(`⚠️  Text font audit failed: ${error.message}`);
        }
        
        console.log('✅ Image generation process completed (some may have failed gracefully).');
        return imagePaths;
    };

    try {
        return await Promise.race([processPromise(), timeoutPromise]);
    } catch (error) {
        console.error(`❌ Image generation failed: ${error.message}`);
        // Return partial results if some images were created
        return imagePaths;
    }
}