import https from 'https';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// This line MUST be at the very top to ensure environment variables are loaded
// before they are used.
// We are explicitly telling dotenv where to find the .env file based on your
// project structure (F:\silver-surfers\.env).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');
dotenv.config({ path: path.join(rootDir, '.env') });

/**
 * Classifies website category using Jina AI.
 * This version uses async/await for cleaner, more modern error handling.
 * @param {string[]} textFragments - Array of text samples from the page.
 * @returns {Promise<{category: string, adjustment: number, threshold: {min: number, max: number}, confidence: string, rationale: string, jinaAccessible: boolean}>}
 */
export async function classifyWebsiteCategory(textFragments) {
  // 1. Check if the API key is loaded correctly.
  if (!process.env.JINA_API_KEY) {
    console.error('❌ Missing JINA_API_KEY. Make sure you have a .env file with the key defined.');
    // Fallback immediately if the key isn't even present.
    return getFallbackResponse('Missing API Key');
  }

  const sampleText = textFragments
    .slice(0, 5)
    .join(' ')
    .substring(0, 500);

  console.log('🔍 Sample text for classification:');
  console.log(`   "${sampleText.substring(0, 200)}..."\n`);

  const data = JSON.stringify({
    model: "jina-embeddings-v3",
    input: [sampleText],
    labels: [
      "Healthcare Medical", "Government Legal", "Financial Banking",
      "E-commerce Retail", "News Media", "Educational",
      "Entertainment Leisure", "Insurance", "Technology SaaS",
      "Utilities Services", "Travel Hospitality", "Non-profit Community"
    ]
  });

  const options = {
    hostname: 'api.jina.ai',
    path: '/v1/classify',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Correctly reference the environment variable
      'Authorization': `Bearer ${process.env.JINA_API_KEY}`,
    }
  };

  try {
    const response = await makeApiRequest(options, data);
    console.log('📊 Jina AI Classification Response:');
    console.log(JSON.stringify(response, null, 2));
    console.log('🟢 Jina AI API is accessible and responded successfully.');

    const predictions = response.data?.[0]?.predictions;

    if (predictions && predictions.length > 0) {
      console.log('\n🎯 Top Predictions:');
      predictions.slice(0, 3).forEach((pred, idx) => {
        const confidence = (pred.score * 100).toFixed(1);
        console.log(`   ${idx + 1}. ${pred.label} - ${confidence}%`);
      });

      const detectedCategory = predictions[0].label;
      const confidenceScore = `${(predictions[0].score * 100).toFixed(1)}%`;
      console.log(`\n✅ Selected Category: ${detectedCategory} (Confidence: ${confidenceScore})\n`);

      const categoryData = getCategoryAdjustment(detectedCategory);

      return {
        category: detectedCategory,
        adjustment: categoryData.adjustment,
        threshold: categoryData.threshold,
        rationale: categoryData.rationale,
        confidence: confidenceScore,
        jinaAccessible: true
      };
    } else {
      // The API responded, but there were no predictions.
      console.warn('⚠️ Jina AI responded but returned no predictions.');
      return getFallbackResponse('No predictions returned');
    }
  } catch (error) {
    console.error(`❌ Category classification failed: ${error.message}`);
    return getFallbackResponse(error.message);
  }
}

/**
 * A helper function to promisify the https.request call.
 * @param {object} options - The request options.
 * @param {string} data - The JSON string data to send.
 * @returns {Promise<object>} - The parsed JSON response.
 */
function makeApiRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let result = '';
      res.on('data', (d) => {
        result += d;
      });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(result));
          } else {
            reject(new Error(`API request failed with status ${res.statusCode}: ${result}`));
          }
        } catch (error) {
          reject(new Error('Failed to parse JSON response from API.'));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Returns a standardized fallback response object.
 * @param {string} reason - The reason for the fallback.
 * @returns {{category: string, adjustment: number, threshold: {min: number, max: number}, rationale: string, confidence: string, jinaAccessible: boolean}}
 */
function getFallbackResponse(reason) {
  return {
    category: 'General',
    adjustment: 0,
    threshold: { min: 60, max: 70 },
    rationale: `Standard readability expectations (${reason} fallback)`,
    confidence: 'N/A',
    jinaAccessible: false
  };
}

/**
 * Maps category to adjustment values.
 * @param {string} category - The classified category.
 * @returns {{adjustment: number, threshold: {min: number, max: number}, rationale: string}}
 */
function getCategoryAdjustment(category) {
  const adjustments = {
    'Healthcare Medical': { adjustment: 15, threshold: { min: 45, max: 60 }, rationale: 'Medical terminology density increases sentence difficulty' },
    'Government Legal': { adjustment: 12, threshold: { min: 48, max: 62 }, rationale: 'Legalese and statutory references are unavoidable' },
    'Financial Banking': { adjustment: 10, threshold: { min: 50, max: 65 }, rationale: 'Financial jargon is domain-specific' },
    'E-commerce Retail': { adjustment: 5, threshold: { min: 55, max: 70 }, rationale: 'Product specs use technical descriptors' },
    'News Media': { adjustment: 8, threshold: { min: 52, max: 68 }, rationale: 'Specialized reporting terms' },
    'Educational': { adjustment: 7, threshold: { min: 53, max: 70 }, rationale: 'Academic vocabulary is inherent' },
    'Entertainment Leisure': { adjustment: 3, threshold: { min: 57, max: 75 }, rationale: 'Should be easily accessible' },
    'Insurance': { adjustment: 12, threshold: { min: 48, max: 62 }, rationale: 'Policy language is legally required' },
    'Technology SaaS': { adjustment: 8, threshold: { min: 52, max: 68 }, rationale: 'Technical specifications are inherent' },
    'Utilities Services': { adjustment: 6, threshold: { min: 54, max: 70 }, rationale: 'Service terms add complexity' },
    'Travel Hospitality': { adjustment: 5, threshold: { min: 55, max: 72 }, rationale: 'Booking details use specialized language' },
    'Non-profit Community': { adjustment: 4, threshold: { min: 56, max: 73 }, rationale: 'Mission statements use advocacy terms' },
  };

  return adjustments[category] || {
    adjustment: 0,
    threshold: { min: 60, max: 70 },
    rationale: 'Standard readability expectations'
  };
}
