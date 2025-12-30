import fs from 'fs/promises';
import path from 'path';

/**
 * Generate a summary CSV file with all pages and their scores
 * @param {Array} pageResults - Array of page audit results
 * @param {string} outputDir - Directory to save the summary file
 * @param {number} threshold - Score threshold for pass/fail (default: 70)
 * @returns {Promise<Object>} - Summary file path and stats
 */
export async function generateSummaryFile(pageResults, outputDir, threshold = 70) {
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Generate CSV content
    const csvRows = [];
    
    // CSV Header
    csvRows.push('Audit Page,Platform,Score,Result');

    // Sort results by URL and device for consistent ordering
    const sortedResults = pageResults.sort((a, b) => {
      if (a.url !== b.url) {
        return a.url.localeCompare(b.url);
      }
      const deviceOrder = { desktop: 1, mobile: 2, tablet: 3 };
      return (deviceOrder[a.device] || 99) - (deviceOrder[b.device] || 99);
    });

    let totalPages = 0;
    let passedPages = 0;
    let warningPages = 0;
    let failedPages = 0;

    // Add data rows
    for (const result of sortedResults) {
      if (!result.filename || result.score === undefined) {
        continue; // Skip invalid entries
      }

      totalPages++;
      const score = parseFloat(result.score);
      let resultStatus = 'Pass';
      
      if (score < threshold) {
        resultStatus = 'Warning';
        warningPages++;
      } else {
        passedPages++;
      }

      // Escape CSV values (handle commas and quotes in filename)
      const filename = escapeCsvValue(result.filename);
      // Capitalize platform name (Desktop, Mobile, Tablet)
      const platformName = result.device ? 
        result.device.charAt(0).toUpperCase() + result.device.slice(1) : 
        'Unknown';
      const platform = escapeCsvValue(platformName);
      const scoreStr = score.toFixed(0);
      
      csvRows.push(`${filename},${platform},${scoreStr}%,${resultStatus}`);
    }

    // Generate summary file name
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const summaryFileName = `audit-summary-${timestamp}.csv`;
    const summaryFilePath = path.join(outputDir, summaryFileName);

    // Write CSV file
    const csvContent = csvRows.join('\n');
    await fs.writeFile(summaryFilePath, csvContent, 'utf8');

    // Also generate JSON version for easier programmatic access
    const jsonFileName = `audit-summary-${timestamp}.json`;
    const jsonFilePath = path.join(outputDir, jsonFileName);
    
    const jsonData = {
      generatedAt: new Date().toISOString(),
      threshold: threshold,
      summary: {
        totalPages: totalPages,
        passed: passedPages,
        warnings: warningPages,
        failed: 0 // We're using Warning instead of Failed
      },
      pages: sortedResults.map(result => ({
        filename: result.filename,
        url: result.url,
        platform: result.device || 'Unknown',
        score: result.score !== undefined ? parseFloat(result.score) : null,
        result: result.score !== undefined && parseFloat(result.score) >= threshold ? 'Pass' : 'Warning',
        reportPath: result.reportPath || null
      }))
    };

    await fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');

    console.log(`📊 Summary files generated: ${summaryFileName} and ${jsonFileName}`);
    console.log(`   Total pages: ${totalPages}, Passed: ${passedPages}, Warnings: ${warningPages}`);

    return {
      success: true,
      csvPath: summaryFilePath,
      jsonPath: jsonFilePath,
      csvFileName: summaryFileName,
      jsonFileName: jsonFileName,
      stats: {
        total: totalPages,
        passed: passedPages,
        warnings: warningPages
      }
    };

  } catch (error) {
    console.error('Error generating summary file:', error);
    throw error;
  }
}

/**
 * Escape CSV value to handle commas, quotes, and newlines
 */
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Determine result status based on score and threshold
 */
export function getResultStatus(score, threshold = 70) {
  if (score === null || score === undefined) {
    return 'Unknown';
  }
  const numScore = parseFloat(score);
  if (isNaN(numScore)) {
    return 'Unknown';
  }
  return numScore >= threshold ? 'Pass' : 'Warning';
}

