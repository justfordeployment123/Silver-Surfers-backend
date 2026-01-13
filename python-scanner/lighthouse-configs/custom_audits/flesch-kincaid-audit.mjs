import { Audit } from 'lighthouse';
import { calculateFleschKincaid } from './flesch-kincaid-audit-helpers.mjs';
import { classifyWebsiteCategory } from './category-classifier.mjs';

class FleschKincaidAudit extends Audit {
  static get meta() {
    return {
      id: 'flesch-kincaid-audit',
      title: 'Flesch-Kincaid Reading Ease (Older Adult-Adjusted)',
      failureTitle: 'Text is difficult to read for older adult users',
      description: 'Calculates the Flesch-Kincaid reading ease score with category-based adjustments for older adult users. Scores are adjusted based on website category expectations. [Learn more about readability scores](https://en.wikipedia.org/wiki/Flesch%E2%80%93Kincaid_readability_tests).',
      requiredArtifacts: ['PageText'],
    };
  }
  
  static async audit(artifacts) {
    const collectedTextFragments = artifacts.PageText.map(item => item.text);
    if (!collectedTextFragments || collectedTextFragments.length === 0) {
      return { score: 1, notApplicable: true };
    }
    
    // Calculate raw Flesch score
    const result = calculateFleschKincaid(collectedTextFragments);
    const { score: rawScore, words, sentences, syllables, debug } = result;
    
    // Classify website category and get adjustment
    console.log('\n🔍 DETECTING WEBSITE CATEGORY...\n');
    let categoryData;
    try {
      categoryData = await classifyWebsiteCategory(collectedTextFragments);
      console.log('✅ Category Detection Successful!');
    } catch (error) {
      console.warn('⚠️  Category detection failed, using default:', error);
      categoryData = {
        category: 'General',
        adjustment: 0,
        threshold: { min: 60, max: 70 },
        rationale: 'Standard readability expectations',
        confidence: 'N/A'
      };
    }
    
    // Store category info in variables for consistent access
    const detectedCategory = categoryData.category;
    const categoryAdjustment = categoryData.adjustment;
    const categoryRationale = categoryData.rationale;
    const categoryConfidence = categoryData.confidence || 'N/A';
    
    // Apply category adjustment
    const adjustedScore = rawScore + categoryAdjustment;
    const { min: minThreshold, max: maxThreshold } = categoryData.threshold;
    
    // Log debug information with enhanced category display
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     FLESCH-KINCAID ELDERLY-ADJUSTED READABILITY ANALYSIS     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 📂 CATEGORY CLASSIFICATION                                  │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`  ➤ Detected Category: ${detectedCategory}`);
    console.log(`  ➤ Category Adjustment: +${categoryAdjustment} points`);
    console.log(`  ➤ Rationale: ${categoryRationale}`);
    console.log(`  ➤ Elderly-Suitable Threshold: ${minThreshold}–${maxThreshold}`);
    console.log(`  ➤ Confidence: ${categoryConfidence}`);
    
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 📊 READABILITY SCORES                                       │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`  ➤ Raw Flesch Score: ${rawScore}`);
    console.log(`  ➤ Category Adjustment: +${categoryAdjustment}`);
    console.log(`  ➤ Adjusted Score: ${adjustedScore} ${getScoreBar(adjustedScore)}`);
    
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 🔤 TEXT ANALYSIS                                            │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`  ➤ Total Sentences Found: ${debug.totalFragments}`);
    console.log(`  ➤ Non-Content Removed: ${debug.removedCount}`);
    console.log(`  ➤ Content Sentences Analyzed: ${debug.sentenceList.length}`);
    console.log(`  ➤ Content Quality: ${getQualityBadge(debug.contentQuality)}`);
    console.log(`  ➤ Total Words: ${words}`);
    console.log(`  ➤ Total Syllables: ${syllables}`);
    console.log(`  ➤ Avg Words/Sentence: ${debug.avgWordsPerSentence}`);
    console.log(`  ➤ Avg Syllables/Word: ${debug.avgSyllablesPerWord}`);
    
    if (debug.warnings && debug.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      debug.warnings.forEach(warning => console.log(`   • ${warning}`));
    }
    
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 📝 DETECTED CONTENT SENTENCES                               │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`Total: ${debug.sentenceList.length}`);
    debug.sentenceList.forEach((sent, i) => {
      console.log(`  ${i + 1}. "${sent}"`);
    });
    
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 🔢 SAMPLE WORDS WITH SYLLABLES                              │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    debug.wordSamples.slice(0, 15).forEach(({ word, syllables }) => {
      console.log(`  "${word}" → ${syllables} syllable${syllables !== 1 ? 's' : ''}`);
    });
    
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 🧮 CALCULATION BREAKDOWN                                    │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`  Formula: 206.835 - 1.015 × (${words}/${sentences}) - 84.6 × (${syllables}/${words})`);
    console.log(`  Raw Score: ${rawScore}`);
    console.log(`  Category Adjustment: +${categoryAdjustment}`);
    console.log(`  Final Adjusted Score: ${adjustedScore}`);
    
    let suitabilityRating;
    if (adjustedScore >= maxThreshold) {
      suitabilityRating = 'Excellent';
    } else if (adjustedScore >= minThreshold) {
      suitabilityRating = 'Good';
    } else if (adjustedScore >= minThreshold - 10) {
      suitabilityRating = 'Moderately Suitable';
    } else {
      suitabilityRating = 'Needs Improvement';
    }
    
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 👴 ELDERLY SUITABILITY ASSESSMENT                           │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`  ➤ Threshold Range: ${minThreshold}–${maxThreshold}`);
    console.log(`  ➤ Suitability Rating: ${suitabilityRating}`);
    console.log(`  ➤ Category Context: ${detectedCategory}`);
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    // Calculate graduated Lighthouse score (0-1 range)
    let lighthouseScore;
    const hasMinimalContent = words >= 30 && debug.contentQuality !== 'none';
    
    if (!hasMinimalContent) {
      // Absolutely no content to analyze
      lighthouseScore = 0;
    } else {
      // Use full scoring scale for any analyzable content (30+ words)
      if (adjustedScore >= maxThreshold) {
        lighthouseScore = 1.0; // Excellent: 100%
      } else if (adjustedScore >= minThreshold) {
        // Good range: score between 0.80-0.99
        const range = maxThreshold - minThreshold;
        const position = adjustedScore - minThreshold;
        lighthouseScore = 0.80 + (position / range) * 0.19;
      } else if (adjustedScore >= minThreshold - 10) {
        // Moderate range: score between 0.50-0.79
        const position = adjustedScore - (minThreshold - 10);
        lighthouseScore = 0.50 + (position / 10) * 0.29;
      } else if (adjustedScore >= 30) {
        // Poor range: score between 0.20-0.49
        const position = adjustedScore - 30;
        const range = (minThreshold - 10) - 30;
        lighthouseScore = 0.20 + (position / range) * 0.29;
      } else {
        // Very poor: score between 0-0.19
        lighthouseScore = Math.max(0, adjustedScore / 30 * 0.19);
      }
      
      // Round to 2 decimal places
      lighthouseScore = Math.round(lighthouseScore * 100) / 100;
    }
    
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 🎯 LIGHTHOUSE SCORE CALCULATION                             │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`  ➤ Has Analyzable Content: ${hasMinimalContent ? 'Yes' : 'No'} (${words} words, threshold: 30)`);
    console.log(`  ➤ Content Quality: ${getQualityBadge(debug.contentQuality)}`);
    console.log(`  ➤ Adjusted Score: ${adjustedScore}`);
    console.log(`  ➤ Lighthouse Score: ${lighthouseScore} (${(lighthouseScore * 100).toFixed(0)}%)`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const headings = [
      { key: 'metric', itemType: 'text', text: 'Metric' },
      { key: 'value', itemType: 'text', text: 'Value' },
    ];
    
    const items = [
      { metric: 'Website Category', value: `${detectedCategory}` },
      { metric: 'Confidence Level', value: categoryConfidence },
      { metric: 'Raw Flesch-Kincaid Score', value: rawScore.toString() },
      { metric: 'Category Adjustment', value: `+${categoryAdjustment}` },
      { metric: 'Adjusted Score (Elderly)', value: adjustedScore.toString() },
      { metric: 'Elderly-Suitable Range', value: `${minThreshold}–${maxThreshold}` },
      { metric: 'Suitability Rating', value: `${suitabilityRating}` },
      { metric: 'Lighthouse Score', value: `${(lighthouseScore * 100).toFixed(0)}%` },
      { metric: 'Adjustment Rationale', value: categoryRationale },
      { metric: 'Content Quality', value: getQualityBadge(debug.contentQuality) },
      { metric: 'Content Sentences Analyzed', value: sentences.toString() },
      { metric: 'Total Words', value: words.toString() },
      { metric: 'Total Syllables', value: syllables.toString() },
      { metric: 'Avg Words/Sentence', value: debug.avgWordsPerSentence.toString() },
      { metric: 'Avg Syllables/Word', value: debug.avgSyllablesPerWord.toString() },
      { metric: 'Sample Sentences (First 3)', value: debug.sentenceList.slice(0, 3).join(' | ') },
    ];
    
    let interpretation = `${suitabilityRating} for elderly users in ${detectedCategory} context. `;
    interpretation += adjustedScore >= 90 ? 'Very easy to read.'
      : adjustedScore >= 80 ? 'Easy to read.'
      : adjustedScore >= 70 ? 'Fairly easy to read.'
      : adjustedScore >= 60 ? 'Moderately easy to read.'
      : adjustedScore >= 50 ? 'Fairly difficult to read.'
      : adjustedScore >= 30 ? 'Difficult to read.'
      : 'Very difficult to read.';
    
    interpretation += ` (Rationale: ${categoryRationale})`;
    
    if (words < 100) {
      interpretation += ` ⚠️ Limited content (${words} words) - consider this score as indicative rather than definitive.`;
    }
    
    if (debug.warnings && debug.warnings.length > 0) {
      interpretation += ' ⚠️ ' + debug.warnings.join(' ');
    }
    
    return {
      score: lighthouseScore, // Graduated score 0-1
      numericValue: adjustedScore,
      numericUnit: 'adjusted-score',
      displayValue: `${detectedCategory} | Score: ${adjustedScore} (Raw: ${rawScore} +${categoryAdjustment}) | ${suitabilityRating}`,
      details: Audit.makeTableDetails(headings, items),
      extendedInfo: {
        value: {
          interpretation,
          category: detectedCategory,
          confidence: categoryConfidence,
          rawScore,
          adjustedScore,
          adjustment: categoryAdjustment,
          threshold: categoryData.threshold,
          suitabilityRating,
          rationale: categoryRationale,
          lighthouseScore,
          detectedSentences: debug.sentenceList,
          sampleSentences: debug.sentenceList.slice(0, 5)
        }
      }
    };
  }
}

function getQualityBadge(quality) {
  const badges = {
    'good': 'Good',
    'limited': 'Limited',
    'minimal': 'Minimal',
    'none': 'None'
  };
  return badges[quality] || quality;
}

function getScoreBar(score) {
  const normalizedScore = Math.min(Math.max(score, 0), 100);
  const barLength = Math.floor(normalizedScore / 5);
  const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
  return `[${bar}]`;
}

export default FleschKincaidAudit;


