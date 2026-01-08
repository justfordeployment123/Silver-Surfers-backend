import { Audit } from 'lighthouse';

const MINIMUM_FONT_SIZE = 16; // Set high to flag all text for drawing

class TextAudit extends Audit {
  static get meta() {
    return {
      id: 'text-font-audit',
      title: 'Text is appropriately sized for readability',
      failureTitle: 'Text is too small to be easily readable',
      description: `Clear, readable text is a cornerstone of a good user experience. This audit checks that all text on the page meets a minimum font size of ${MINIMUM_FONT_SIZE}px.`,
      requiredArtifacts: ['PageText'],
    };
  }

  static audit(artifacts) {

    // NEW: Log when the audit starts. The '\n' adds spacing in the console.
    console.log('\n--- Running Text Font Size Audit ---');

    const collectedText = artifacts.PageText;
    
    // NEW: Log how many text items the gatherer found.
    console.log(`[Text Audit] Found ${collectedText.length} total text snippets to analyze.`);
    
    // If no text was found, the audit doesn't apply.
    if (collectedText.length === 0) {
      // NEW: Log the reason for not running the audit.
      console.log('[Text Audit] No text found on the page. Audit is not applicable.');
      console.log('--- Text Font Size Audit Finished ---\n');
      return { score: 1, notApplicable: true };
    }
// 1. Initialize counters and lists
const failingItems = [];
let passedCount = 0;

// 2. Separate collected text into passing and failing lists
for (const textItem of collectedText) {
  if (parseFloat(textItem.fontSize) < MINIMUM_FONT_SIZE) {
    // This item is "incorrect"
    failingItems.push({
      textSnippet: textItem.text,
      fontSize: textItem.fontSize, // Add font size to the table for context
      containerTag: textItem.containerTag,
      containerSelector: textItem.containerSelector,
      // The 'node' details will allow Lighthouse to highlight the element on the page
      node: Audit.makeNodeItem(textItem.containerSelector),
        });
      } else {
        // This item is "correct"
        passedCount++;
      }
    }

    // --- CHANGE: Add headings for the new columns in the report table ---
    // 3. Calculate the total counts and the final score
    const totalCount = collectedText.length;
    const failingCount = failingItems.length;
    // Score is the ratio of passing items to total items.
    const score = passedCount / totalCount;

    // NEW: Log a detailed summary of the results before returning.
    console.log(`[Text Audit] Analysis Complete:`);
    console.log(`  - Passing Snippets (>=${MINIMUM_FONT_SIZE}px): ${passedCount}`);
    console.log(`  - Failing Snippets (<${MINIMUM_FONT_SIZE}px): ${failingCount}`);
    console.log(`  - Final Score: ${(score * 100).toFixed(2)}%`);
    console.log('--- Text Font Size Audit Finished ---\n');

    // 4. Create a user-friendly display value string for the report summary
    let displayValue = '';
    if (failingCount > 0) {
      const plural = failingCount === 1 ? '' : 's';
      displayValue = `${failingCount} text snippet${plural} found with a font size smaller than ${MINIMUM_FONT_SIZE}px`;
    }

    const headings = [
        { key: 'textSnippet', itemType: 'text', text: 'Text Snippet' },
        { key: 'fontSize', itemType: 'text', text: 'Font Size' },
        { key: 'containerTag', itemType: 'code', text: 'Container' },
        { key: 'containerSelector', itemType: 'text', text: 'Selector' },
    ];

    return {
      score: 1, // Score isn't relevant for this tool
      score: score,
      scoreDisplayMode: 'numeric',
      displayValue: displayValue,
      details: Audit.makeTableDetails(headings, failingItems),
    };
  }
}
export default TextAudit;