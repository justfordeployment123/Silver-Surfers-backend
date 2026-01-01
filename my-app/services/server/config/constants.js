export const PORT = process.env.PORT || 5000;
export const PROCESSING_TIMEOUT_MS = Number(process.env.PROCESSING_TIMEOUT_MS || 2 * 60 * 60 * 1000); // 2 hours default
export const QUEUED_TIMEOUT_MS = Number(process.env.QUEUED_TIMEOUT_MS || 12 * 60 * 60 * 1000); // 12 hours default
export const WATCHDOG_INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS || 10 * 60 * 1000); // run every 10 minutes



