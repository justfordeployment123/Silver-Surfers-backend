/**
 * CORS Middleware
 * Handles Cross-Origin Resource Sharing configuration
 */

import cors from 'cors';

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const allowedOrigins = [
  frontendUrl,
  // Add any additional allowed origins if needed
  ...(process.env.ADDITIONAL_ALLOWED_ORIGINS ? process.env.ADDITIONAL_ALLOWED_ORIGINS.split(',') : [])
];

/**
 * Get both www and non-www versions of an origin
 */
function getOriginVariants(origin) {
  if (!origin) return [];
  
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    const baseUrl = `${url.protocol}//${hostname}${url.port ? ':' + url.port : ''}`;
    
    const variants = [origin]; // Always include the original
    
    // Add www variant if it doesn't start with www
    if (!hostname.startsWith('www.')) {
      variants.push(`${url.protocol}//www.${hostname}${url.port ? ':' + url.port : ''}`);
    } else {
      // Add non-www variant if it starts with www
      variants.push(`${url.protocol}//${hostname.substring(4)}${url.port ? ':' + url.port : ''}`);
    }
    
    return variants;
  } catch (e) {
    return [origin]; // Return as-is if URL parsing fails
  }
}

/**
 * Check if origin matches any allowed origin (including www/non-www variations)
 */
function isOriginAllowed(origin) {
  // Direct match
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  
  // Check all variants of the origin against allowed origins
  const originVariants = getOriginVariants(origin);
  
  // Check if any variant matches any allowed origin or its variants
  return originVariants.some(variant => {
    if (allowedOrigins.includes(variant)) {
      return true;
    }
    
    // Check if any allowed origin's variants match this variant
    return allowedOrigins.some(allowed => {
      const allowedVariants = getOriginVariants(allowed);
      return allowedVariants.includes(variant);
    });
  });
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow Stripe webhooks (they don't send origin header)
    if (origin === undefined) return callback(null, true);
    
    // Check if origin is in allowed list (handles www/non-www variations)
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    
    console.warn(`CORS: Blocked request from unauthorized origin: ${origin}`);
    console.warn(`CORS: Allowed origins are: ${allowedOrigins.join(', ')}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Allow cookies and authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600, // Cache preflight request for 10 minutes
  preflightContinue: false,
  optionsSuccessStatus: 204
};

export const corsMiddleware = cors(corsOptions);



