/**
 * Server Configuration Constants
 */

// Server port
export const PORT = process.env.PORT || 8000;

// Timeout values (in milliseconds)
export const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const QUEUED_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

// Watchdog interval (in milliseconds)
export const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes



