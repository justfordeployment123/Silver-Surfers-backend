/**
 * Python Scanner Client
 * Primary scanner service - all audits go through Python/Camoufox
 */

import axios from 'axios';

const PYTHON_SCANNER_URL = process.env.PYTHON_SCANNER_URL || 'http://localhost:8001';

/**
 * Perform audit using Python/Camoufox scanner service (primary method)
 * @param {object} options - Audit options
 * @param {string} options.url - URL to audit
 * @param {string} [options.device='desktop'] - Device type
 * @param {string} [options.format='json'] - Report format
 * @param {boolean} [options.isLiteVersion=false] - Whether lite version
 * @returns {Promise<object>} Result object
 */
export async function tryPythonScanner(options) {
    const { url, device = 'desktop', format = 'json', isLiteVersion = false } = options;
    
    // Increase timeout: 5 minutes for full audits, 4 minutes for lite audits
    const timeoutMs = isLiteVersion ? 240000 : 300000; // 4 minutes for lite, 5 minutes for full
    const timeoutMinutes = Math.floor(timeoutMs / 60000);
    
    try {
        console.log(`🐍 Using Python/Camoufox scanner for: ${url} (${isLiteVersion ? 'lite' : 'full'} audit, ${timeoutMinutes}min timeout)`);
        
        const response = await axios.post(`${PYTHON_SCANNER_URL}/audit`, {
            url: url,
            device: device,
            format: format,
            isLiteVersion: isLiteVersion
        }, {
            timeout: timeoutMs,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data && response.data.success) {
            console.log(`✅ Python scanner succeeded for: ${url}`);
            console.log(`📊 Score: ${response.data.report?.categories?.[isLiteVersion ? 'senior-friendly-lite' : 'senior-friendly']?.score * 100 || 'N/A'}%`);
            
            // Save report to local temp file since Python container's /tmp is not accessible
            const fs = await import('fs/promises');
            const path = await import('path');
            const os = await import('os');
            
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.replace(/\./g, '-');
            const timestamp = Date.now();
            const versionSuffix = isLiteVersion ? '-lite' : '';
            const reportFilename = `report-${hostname}-${timestamp}${versionSuffix}.json`;
            const localReportPath = path.join(os.tmpdir(), reportFilename);
            
            // Write report JSON to local temp file
            await fs.writeFile(localReportPath, JSON.stringify(response.data.report, null, 2), 'utf-8');
            console.log(`📄 Report saved to local temp file: ${localReportPath}`);
            
            // Convert Python response to Node.js format
            return {
                success: true,
                reportPath: localReportPath, // Use local path instead of Python container path
                report: response.data.report, // Also include report data in response
                isLiteVersion: response.data.isLiteVersion,
                version: response.data.version,
                url: response.data.url,
                device: response.data.device,
                strategy: response.data.strategy || 'Python-Camoufox',
                attemptNumber: response.data.attemptNumber || 1,
                message: response.data.message || 'Audit completed using Python scanner'
            };
        } else {
            const errorMsg = response.data?.error || 'Python scanner failed';
            console.log(`❌ Python scanner returned failure: ${errorMsg}`);
            return {
                success: false,
                error: errorMsg,
                errorCode: response.data?.errorCode || 'PYTHON_SCANNER_FAILED'
            };
        }
    } catch (error) {
        // Extract status code from error.response or error.message
        let status = null;
        if (error.response) {
            status = error.response.status;
        } else if (error.message) {
            // Parse status code from error message (e.g., "Request failed with status code 504")
            const statusMatch = error.message.match(/status code (\d+)/i);
            if (statusMatch) {
                status = parseInt(statusMatch[1], 10);
            }
        }
        
        // Handle specific HTTP status codes with clear messages
        if (status === 504) {
            const clearError = `The website scan timed out after ${timeoutMinutes} minutes. The website may be slow to load or the scanner service is experiencing high load. Please try again in a few moments.`;
            console.error(`❌ Python scanner timeout (504 Gateway Timeout): ${url}`);
            console.error(`   The scan exceeded the ${timeoutMinutes}-minute timeout limit.`);
            return {
                success: false,
                error: clearError,
                errorCode: 'SCAN_TIMEOUT',
                statusCode: 504
            };
        } else if (status === 503) {
            const clearError = `The scanner service is temporarily unavailable. Please try again in a few moments.`;
            console.error(`❌ Python scanner service unavailable (503): ${url}`);
            return {
                success: false,
                error: clearError,
                errorCode: 'SERVICE_UNAVAILABLE',
                statusCode: 503
            };
        } else if (status && status >= 500) {
            const clearError = `The scanner service encountered an internal error (${status}). Please try again later.`;
            console.error(`❌ Python scanner server error (${status}): ${url}`);
            return {
                success: false,
                error: clearError,
                errorCode: 'SERVER_ERROR',
                statusCode: status
            };
        }
        
        // Handle connection errors
        if (error.code === 'ECONNREFUSED') {
            const clearError = `Unable to connect to the scanner service. The service may be down or unreachable.`;
            console.error(`⚠️ Python scanner service connection refused: ${PYTHON_SCANNER_URL}`);
            return {
                success: false,
                error: clearError,
                errorCode: 'SERVICE_UNAVAILABLE'
            };
        }
        
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            const clearError = `The scan request timed out after ${timeoutMinutes} minutes. The website may be taking too long to load. Please try again or contact support if the issue persists.`;
            console.error(`❌ Python scanner request timeout: ${url} (${timeoutMinutes}min limit exceeded)`);
            return {
                success: false,
                error: clearError,
                errorCode: 'REQUEST_TIMEOUT'
            };
        }
        
        // Generic error handling - check if message contains status code pattern
        let clearError;
        if (error.message && error.message.includes('status code')) {
            // If we have a status code in the message but didn't catch it above, provide generic timeout message
            const statusMatch = error.message.match(/status code (\d+)/i);
            if (statusMatch && parseInt(statusMatch[1], 10) === 504) {
                clearError = `The website scan timed out after ${timeoutMinutes} minutes. The website may be slow to load or the scanner service is experiencing high load. Please try again in a few moments.`;
                console.error(`❌ Python scanner timeout (504 from message): ${url}`);
                return {
                    success: false,
                    error: clearError,
                    errorCode: 'SCAN_TIMEOUT',
                    statusCode: 504
                };
            }
        }
        
        // Default generic error message
        clearError = `An error occurred while scanning the website: ${error.message}. Please try again or contact support if the issue persists.`;
        console.error(`❌ Python scanner error: ${error.message}`);
        console.error(`   URL: ${url}`);
        console.error(`   Error details:`, error.response?.data || error.stack);
        return {
            success: false,
            error: clearError,
            errorCode: 'PYTHON_SCANNER_ERROR',
            originalError: error.message
        };
    }
}

/**
 * Lightweight precheck using Python/Camoufox scanner
 * This is much faster than a full audit - just verifies URL is reachable
 * @param {string} url - URL to precheck
 * @returns {Promise<object>} Precheck result
 */
export async function pythonPrecheck(url) {
    const precheckTimeout = 60000; // Increased to 60 seconds for precheck
    
    try {
        console.log(`🐍 Python precheck for: ${url} (60s timeout)`);
        
        const response = await axios.post(`${PYTHON_SCANNER_URL}/precheck`, {
            url: url
        }, {
            timeout: precheckTimeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data && response.data.success) {
            console.log(`✅ Python precheck succeeded: ${url} → ${response.data.finalUrl || url}`);
            return {
                ok: true,
                finalUrl: response.data.finalUrl || url,
                status: response.data.status,
                redirected: response.data.redirected || false
            };
        } else {
            const errorMsg = response.data?.error || 'Precheck failed';
            console.log(`❌ Python precheck failed: ${errorMsg}`);
            return {
                ok: false,
                error: errorMsg
            };
        }
    } catch (error) {
        // Extract status code from error.response or error.message
        let status = null;
        if (error.response) {
            status = error.response.status;
        } else if (error.message) {
            // Parse status code from error message (e.g., "Request failed with status code 504")
            const statusMatch = error.message.match(/status code (\d+)/i);
            if (statusMatch) {
                status = parseInt(statusMatch[1], 10);
            }
        }
        
        // Handle specific HTTP status codes
        if (status === 504) {
            const clearError = `Website precheck timed out. The website may be slow to respond or unreachable.`;
            console.error(`❌ Python precheck timeout (504): ${url}`);
            return {
                ok: false,
                error: clearError
            };
        } else if (status === 503) {
            const clearError = `Scanner service is temporarily unavailable. Please try again in a few moments.`;
            console.error(`❌ Python precheck service unavailable (503): ${url}`);
            return {
                ok: false,
                error: clearError
            };
        }
        
        // Handle connection errors
        if (error.code === 'ECONNREFUSED') {
            const clearError = `Unable to connect to the scanner service. The service may be down.`;
            console.error(`⚠️ Python scanner service connection refused: ${PYTHON_SCANNER_URL}`);
            return {
                ok: false,
                error: clearError
            };
        }
        
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            const clearError = `Website precheck timed out after 60 seconds. The website may be slow to respond.`;
            console.error(`❌ Python precheck timeout: ${url}`);
            return {
                ok: false,
                error: clearError
            };
        }
        
        // Generic error
        const clearError = `Precheck failed: ${error.message}. Please verify the website URL is correct and try again.`;
        console.error(`❌ Python precheck error: ${error.message}`);
        return {
            ok: false,
            error: clearError
        };
    }
}

/**
 * Check if Python scanner service is available
 * @returns {Promise<boolean>}
 */
export async function isPythonScannerAvailable() {
    try {
        const response = await axios.get(`${PYTHON_SCANNER_URL}/health`, {
            timeout: 5000
        });
        return response.data?.status === 'healthy';
    } catch (error) {
        return false;
    }
}

