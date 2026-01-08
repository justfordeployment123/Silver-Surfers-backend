/**
 * Security Headers Middleware
 * Sets security-related HTTP headers
 */

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const allowedOrigins = [
  frontendUrl,
  // Add any additional allowed origins if needed
  ...(process.env.ADDITIONAL_ALLOWED_ORIGINS ? process.env.ADDITIONAL_ALLOWED_ORIGINS.split(',') : [])
];

export const securityHeaders = (req, res, next) => {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Log security events
  if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
    console.warn(`Security: Unauthorized origin attempt: ${req.headers.origin} from IP: ${req.ip}`);
  }
  
  next();
};


