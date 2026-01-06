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
    
    try {
        console.log(`🐍 Using Python/Camoufox scanner for: ${url}`);
        
        const response = await axios.post(`${PYTHON_SCANNER_URL}/audit`, {
            url: url,
            device: device,
            format: format,
            isLiteVersion: isLiteVersion
        }, {
            timeout: 180000, // 3 minutes timeout
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data && response.data.success) {
            console.log(`✅ Python scanner succeeded for: ${url}`);
            console.log(`📊 Score: ${response.data.report?.categories?.[isLiteVersion ? 'senior-friendly-lite' : 'senior-friendly']?.score * 100 || 'N/A'}%`);
            
            // Convert Python response to Node.js format
            return {
                success: true,
                reportPath: response.data.reportPath,
                isLiteVersion: response.data.isLiteVersion,
                version: response.data.version,
                url: response.data.url,
                device: response.data.device,
                strategy: response.data.strategy || 'Python-Camoufox',
                attemptNumber: response.data.attemptNumber || 1,
                message: response.data.message || 'Audit completed using Python scanner'
            };
        } else {
            console.log(`❌ Python scanner returned failure: ${response.data?.error || 'Unknown error'}`);
            return {
                success: false,
                error: response.data?.error || 'Python scanner failed',
                errorCode: response.data?.errorCode || 'PYTHON_SCANNER_FAILED'
            };
        }
    } catch (error) {
        // Check if Python service is available
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.log(`⚠️ Python scanner service not available at ${PYTHON_SCANNER_URL}`);
            return {
                success: false,
                error: 'Python scanner service not available',
                errorCode: 'SERVICE_UNAVAILABLE'
            };
        }
        
        console.error(`❌ Python scanner error: ${error.message}`);
        return {
            success: false,
            error: error.message,
            errorCode: 'PYTHON_SCANNER_ERROR'
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

