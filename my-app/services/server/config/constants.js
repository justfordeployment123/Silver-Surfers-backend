/**
 * Server Configuration Constants
 */

// Server port
export const PORT = process.env.PORT || 8000;

// Timeout values (in milliseconds)
// Full audits can take up to 3 hours, so set processing timeout to 4 hours to allow buffer
export const PROCESSING_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
export const QUEUED_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

// Watchdog interval (in milliseconds)
export const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes



