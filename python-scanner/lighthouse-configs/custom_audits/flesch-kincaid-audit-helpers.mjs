/**
 * @fileoverview Helper functions for calculating readability scores.
 * @version 4.0 (Definitive Rule-Based Filtering)
 */

import nlp from 'compromise';

// ... countSyllables function remains the same ...
function countSyllables(word) {
  if (word.length <= 3) return 1;
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length === 0) return 1;
  word = word.replace(/e$/, '');
  const vowelMatches = word.match(/[aeiouy]+/g);
  return vowelMatches ? vowelMatches.length : 1;
}

/**
 * FINAL: An aggressive pre-processing function to clean sentences.
 * @param {string} sentence The raw sentence.
 * @return {string} The cleaned sentence.
 */
function preProcessSentence(sentence) {
    // This more robust regex handles variations like '.. Label', '. Label', etc.
    let cleaned = sentence.replace(/\s*\.{1,}\s*.*$/, '.');

    // Remove common CTA and UI phrases
    const cruftRegex = /\b(learn more|read more|click here|get started|accept|to know more)\b\.?$/i;
    cleaned = cleaned.replace(cruftRegex, '');
    
    // Normalize whitespace and remove leading/trailing punctuation
    cleaned = cleaned.replace(/\s+/g, ' ').trim().replace(/^[.,\s]+|[.,\s]+$/g, '');
    
    return cleaned;
}


/**
 * FINAL: A strict, rule-based filter using "guard clauses".
 * A sentence must pass all checks to be considered content.
 * @param {string} sentence The sentence to evaluate.
 * @return {boolean}
 */
function isContentSentence(sentence) {
    const doc = nlp(sentence);
    const words = doc.terms().json().map(t => t.text);

    // Guard 1: Word Count. Must have at least 5 words.
    // This eliminates "Built For Your Specialty", "EHR for iOS/Android", etc.
    if (words.length < 5) {
        return false;
    }

    // Guard 2: Junk Keywords. Must not contain obvious non-content phrases.
    const junkRegex = /\b(all rights reserved|privacy policy|cookie policy|log in|sign up|specialty-focused)\b/i;
    if (junkRegex.test(sentence)) {
        return false;
    }

    // Guard 3: Grammatical Structure. MUST have a noun and a verb.
    // This is the most powerful filter for fragments like "The only specialty-driven EHR."
    if (!doc.has('#Noun') || !doc.has('#Verb')) {
        return false;
    }

    // Guard 4: Adjective/Noun Lists. Reject if it's mostly a list without a verb.
    // Catches "Secure, Integrated and easy to use."
    const terms = doc.json(0).terms;
    const nonVerbCount = terms.filter(t => t.tags.includes('Noun') || t.tags.includes('Adjective')).length;
    if (!doc.has('#Verb') && (nonVerbCount / terms.length) > 0.7) {
        return false;
    }
    
    // Guard 5: Fragment Detection. Reject imperative fragments like "Also view charts..."
    const firstTerm = doc.terms().first();
    if (firstTerm.has('#Verb') && !doc.match('#Noun').before(firstTerm).found) {
        // Starts with a verb, but has no preceding noun subject.
        return false;
    }
    
    // If it passes all guards, it's a content sentence.
    return true;
}

/**
 * Check if a sentence is a complete sentence (ends with proper punctuation).
 * @param {string} sentence The sentence to check.
 * @return {boolean}
 */
function isCompleteSentence(sentence) {
    return /[.!?]$/.test(sentence.trim());
}

/**
 * Get the best sample sentences, prioritizing complete sentences.
 * @param {string[]} sentences All content sentences.
 * @param {number} count Number of sample sentences to return.
 * @return {string[]}
 */
function getBestSampleSentences(sentences, count = 3) {
    if (sentences.length === 0) return [];
    
    // Separate complete and incomplete sentences
    const completeSentences = sentences.filter(isCompleteSentence);
    const incompleteSentences = sentences.filter(s => !isCompleteSentence(s));
    
    // Prioritize complete sentences
    const samples = [];
    
    // First, add complete sentences
    samples.push(...completeSentences.slice(0, count));
    
    // If we need more, add incomplete sentences
    if (samples.length < count) {
        const remaining = count - samples.length;
        samples.push(...incompleteSentences.slice(0, remaining));
    }
    
    return samples.slice(0, count);
}

/**
 * FINAL: The main extraction function using the new rule-based pipeline.
 * @param {string[]} textFragments An array of raw text strings from the page.
 * @return {{contentSentences: string[], removedCount: number, totalFragments: number, contentQuality: string}}
 */
function extractContentSentences(textFragments) {
    const fullText = textFragments.join('. ').replace(/\s+/g, ' ').trim();
    
    const doc = nlp(fullText);
    const allSentences = doc.sentences().out('array');
    
    const processedSentences = allSentences.map(preProcessSentence);
    const uniqueSentences = [...new Set(processedSentences)];
    const contentSentences = uniqueSentences.filter(isContentSentence);
    const removedCount = allSentences.length - contentSentences.length;

    // ... contentQuality assessment remains the same ...
    let contentQuality = 'good';
    if (contentSentences.length === 0) {
        contentQuality = 'none';
    } else if (contentSentences.length < 3) {
        contentQuality = 'minimal';
    } else if (contentSentences.length < 10) {
        contentQuality = 'limited';
    }

    return {
        contentSentences,
        removedCount,
        totalFragments: allSentences.length,
        contentQuality,
    };
}


// ... calculateFleschKincaid function remains the same ...
export function calculateFleschKincaid(textFragments) {
  const { contentSentences, removedCount, totalFragments, contentQuality } = extractContentSentences(textFragments);
  const cleanedText = contentSentences.join(' ');
  const words = cleanedText.match(/\b[a-zA-Z]{2,}\b/g) || [];
  const wordCount = words.length;
  const sentenceCount = contentSentences.length > 0 ? contentSentences.length : 1;
  const sentenceList = contentSentences;
  const syllableCount = words.reduce((acc, word) => acc + countSyllables(word), 0);
  const wordSamples = words.slice(0, 20).map(word => ({ word: word, syllables: countSyllables(word) }));
  
  let warnings = [];
  if (contentQuality === 'none') {
    warnings.push('No prose content found - page appears to be navigation/UI only');
  } else if (contentQuality === 'minimal') {
    warnings.push('Very limited prose content - score may not be meaningful');
  } else if (contentQuality === 'limited') {
    warnings.push('Limited prose content - consider adding more explanatory text');
  }
  if (wordCount < 100) {
    warnings.push(`Only ${wordCount} words analyzed - readability scores are most accurate with 100+ words`);
  }
  if (wordCount === 0 || sentenceCount === 0) {
    return { 
      score: 0, words: 0, sentences: 0, syllables: 0,
      debug: { 
        sentenceList: [], wordSamples: [], cleanedTextPreview: '',
        originalTextPreview: textFragments.join(' ').substring(0, 200),
        removedCount: totalFragments, totalFragments: totalFragments,
        contentQuality: contentQuality, warnings: ['No valid content found for analysis']
      }
    };
  }
  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / wordCount;
  const score = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
  
  // Get best sample sentences (prioritizing complete sentences)
  const sampleSentences = getBestSampleSentences(sentenceList, 3);
  
  return {
    score: Math.round(score * 10) / 10,
    words: wordCount,
    sentences: sentenceCount,
    syllables: syllableCount,
    debug: {
      sentenceList, 
      wordSamples,
      sampleSentences, // Add prioritized sample sentences
      avgWordsPerSentence: Math.round(avgWordsPerSentence * 100) / 100,
      avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100,
      cleanedTextPreview: cleanedText.substring(0, 500),
      originalTextPreview: textFragments.join(' ').substring(0, 300),
      removedCount, totalFragments, contentQuality, warnings
    }
  };
}


