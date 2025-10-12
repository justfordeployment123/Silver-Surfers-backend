// ===================================================================================
// CONFIGURATION
// Each strategy now includes 'reason' and a more detailed 'calculate' function
// to explain its decision-making process during verbose logging.
// ===================================================================================
const config = {
    calculationStrategies: [
        {
            name: 'Preferred: 60% base + 40% level-1',
            requirements: (averages) => averages.has(0) && averages.has(1),
            // The 'calculate' function now returns an object with the score and an explanation string.
            calculate: (averages) => {
                const baseAvg = averages.get(0);
                const level1Avg = averages.get(1);
                const score = (baseAvg * 0.6) + (level1Avg * 0.4);
                return {
                    score: score,
                    explanation: `Calculation: (${baseAvg.toFixed(2)} * 0.6) + (${level1Avg.toFixed(2)} * 0.4)`
                };
            },
            // The 'reason' function explains why a strategy was skipped.
            reason: (averages) => {
                if (!averages.has(0)) return 'Missing data for Base URLs (level 0).';
                if (!averages.has(1)) return 'Missing data for Level-1 URLs.';
                return 'An unknown error occurred.';
            }
        },
        {
            name: 'Fallback: 60% base + 40% level-2',
            requirements: (averages) => averages.has(0) && averages.has(2),
            calculate: (averages) => {
                const baseAvg = averages.get(0);
                const level2Avg = averages.get(2);
                const score = (baseAvg * 0.6) + (level2Avg * 0.4);
                return {
                    score: score,
                    explanation: `Calculation: (${baseAvg.toFixed(2)} * 0.6) + (${level2Avg.toFixed(2)} * 0.4)`
                };
            },
            reason: (averages) => {
                if (!averages.has(0)) return 'Missing data for Base URLs (level 0).';
                if (!averages.has(2)) return 'Missing data for Level-2 URLs.';
                return 'An unknown error occurred.';
            }
        },
        {
            name: 'Base URLs only',
            requirements: (averages) => averages.has(0),
            calculate: (averages) => {
                const baseAvg = averages.get(0);
                return {
                    score: baseAvg,
                    explanation: 'Calculation: Using the average score of Base URLs directly.'
                };
            },
            reason: () => 'Missing data for Base URLs (level 0).'
        },
        {
            name: 'Level-1 URLs only',
            requirements: (averages) => averages.has(1),
            calculate: (averages) => {
                const level1Avg = averages.get(1);
                return {
                    score: level1Avg,
                    explanation: 'Calculation: Using the average score of Level-1 URLs directly.'
                };
            },
            reason: () => 'Missing data for Level-1 URLs.'
        },
        {
            name: 'Level-2 URLs only',
            requirements: (averages) => averages.has(2),
             calculate: (averages) => {
                const level2Avg = averages.get(2);
                return {
                    score: level2Avg,
                    explanation: 'Calculation: Using the average score of Level-2 URLs directly.'
                };
            },
            reason: () => 'Missing data for Level-2 URLs.'
        },
        {
            name: 'Overall average of all URLs',
            requirements: (averages, allScores) => allScores.length > 0,
            calculate: (averages, allScores) => {
                const sum = allScores.reduce((a, b) => a + b, 0);
                const score = sum / allScores.length;
                 return {
                    score: score,
                    explanation: `Calculation: Averaging all ${allScores.length} available scores.`
                };
            },
            reason: () => 'No valid URLs with scores were found in the provided data.'
        }
    ]
};

// ===================================================================================
// CORE LOGIC (with enhanced logging)
// ===================================================================================

function parseUrl(urlString) {
    try {
        const url = new URL(urlString);
        const pathSegments = url.pathname.split('/').filter(seg => seg.length > 0);
        return {
            original: urlString,
            domain: url.hostname,
            childLevel: pathSegments.length,
        };
    } catch (e) {
        // Suppress console.error in favor of a clear log message in the main function
        return null;
    }
}

function calculateWeightedScore(data, options = {}) {
    const { verbose = false } = options;

    if (verbose) {
        console.log('===================================================');
        console.log('   STARTING WEIGHTED SCORE CALCULATION');
        console.log('===================================================');
        console.log(`[STEP 1] Reading and Parsing Input Data (${data.length} entries provided)`);
    }

    const groupedByLevel = new Map();
    const allScores = [];

    data.forEach(entry => {
        const parsed = parseUrl(entry.Url);
        if (!parsed) {
            if (verbose) console.log(`  - Skipping invalid URL: "${entry.Url}"`);
            return;
        }

        const { childLevel } = parsed;
        if (!groupedByLevel.has(childLevel)) {
            groupedByLevel.set(childLevel, []);
        }
        const score = parseFloat(entry.score);
        groupedByLevel.get(childLevel).push(score);
        allScores.push(score);
        if(verbose) console.log(`  - Read URL: "${entry.Url}" (Level: ${childLevel}, Score: ${score})`);
    });

    const averageScores = new Map();
    for (const [level, scores] of groupedByLevel.entries()) {
        const sum = scores.reduce((acc, score) => acc + score, 0);
        averageScores.set(level, sum / scores.length);
    }

    if (verbose) {
        console.log('\n[STEP 2] Calculating Average Scores per Level');
        if (averageScores.size === 0) {
            console.log('  - No valid URLs found to calculate averages.');
        } else {
            averageScores.forEach((avg, level) => {
                console.log(`  - Level ${level} Average: ${avg.toFixed(2)} (from ${groupedByLevel.get(level).length} URL(s))`);
            });
        }
    }

    let finalScore = 0;
    let method = 'No valid calculation method found';

    if (verbose) console.log('\n[STEP 3] Finding a Calculation Strategy (checking in order of priority)');

    for (const strategy of config.calculationStrategies) {
        if (verbose) console.log(`\n  -> Checking Strategy: "${strategy.name}"`);

        if (strategy.requirements(averageScores, allScores)) {
            const result = strategy.calculate(averageScores, allScores);
            finalScore = result.score;
            method = strategy.name;
            if (verbose) {
                console.log('     [✓] SUCCESS: Requirements met.');
                console.log(`     ${result.explanation}`);
                console.log(`     --> STRATEGY SELECTED. Final Score: ${finalScore.toFixed(2)}`);
            }
            break; 
        } else {
            if (verbose) {
                const reason = strategy.reason(averageScores);
                console.log(`     [✗] SKIPPED: ${reason}`);
            }
        }
    }

    const getAvg = (level) => averageScores.get(level) || null;
    const getCount = (level) => groupedByLevel.has(level) ? groupedByLevel.get(level).length : 0;

    return {
        finalScore,
        method,
        breakdown: { baseAvg: getAvg(0), level1Avg: getAvg(1), level2Avg: getAvg(2), counts: { base: getCount(0), level1: getCount(1), level2: getCount(2), other: allScores.length - (getCount(0) + getCount(1) + getCount(2)) } }
    };
}

function checkScoreThreshold(data, threshold = 70, options = {}) {
    const { verbose = false } = options;

    if (threshold < 0 || threshold > 100) {
        throw new Error('Threshold must be between 0 and 100');
    }

    const result = calculateWeightedScore(data, { verbose });
    const pass = result.finalScore >= threshold;

    if (verbose) {
        console.log('\n[STEP 4] Final Result & Threshold Check');
        console.log(`  - Threshold: ${threshold}`);
        console.log(`  - Final Score: ${result.finalScore.toFixed(2)}`);
        if (pass) {
            console.log(`  - Result: ✓ PASS (Score of ${result.finalScore.toFixed(2)} meets or exceeds threshold of ${threshold})`);
        } else {
            console.log(`  - Result: ✗ FAIL (Score of ${result.finalScore.toFixed(2)} is less than threshold of ${threshold})`);
        }
        console.log('===================================================\n');
    }

    return {
        pass,
        score: result.finalScore,
        threshold,
        method: result.method,
        breakdown: result.breakdown
    };
}

// ===================================================================================
// EXAMPLE USAGE
// ===================================================================================
if (typeof require !== 'undefined' && require.main === module) {
    const testData = [
        { Url: 'https://mywebsite.com', score: 95 },                     // Base URL (level 0)
        { Url: 'https://mywebsite.com/blog/post-1', score: 82 },        // Level 2 URL
        { Url: 'https://mywebsite.com/products/archive', score: 80 },    // Level 2 URL
        { Url: 'htp:/invalid-url', score: 50 }                           // Invalid URL
    ];

    console.log("--- Running Example with Missing Level 1 URLs ---");
    // The 'verbose: true' flag is what activates all the detailed logging.
    checkScoreThreshold(testData, 90, { verbose: true });
}


// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        checkScoreThreshold,
        calculateWeightedScore,
        parseUrl
    };
}