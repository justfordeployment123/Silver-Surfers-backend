// custom-config-lite-enhanced.js
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  // 1. Extend the default config to get access to all built-in audits
  extends: 'lighthouse:default',
  
  // 2. Settings object to control what the runner executes
  settings: {
    // Only run our lite category
    onlyCategories: ['senior-friendly-lite'],
  },
  
  // 3. Add custom gatherer and audit for the font check
  artifacts: [
    { id: 'PageText', gatherer: path.resolve(__dirname, 'custom_gatherers/text-gatherer.js') },
  ],
  
  audits: [
    { path: path.resolve(__dirname, 'custom_audits/text-audit.js') },
  ],
  
  // 4. Lite category with built-in audits plus custom font audit
  categories: {
    'senior-friendly-lite': {
      title: 'Senior Accessibility (Lite)',
      description: 'Essential accessibility checks for senior users using built-in Lighthouse audits plus custom font analysis.',
      
      auditRefs: [
        // --- Essential (Weight: 5 each) ---
        { id: 'color-contrast', weight: 5 },
        { id: 'target-size', weight: 5 },
        { id: 'text-font-audit', weight: 5 },        // Custom font audit instead of built-in
        
        // --- Important (Weight: 3 each) ---
        { id: 'viewport', weight: 3 },
        { id: 'link-name', weight: 3 },
        { id: 'button-name', weight: 3 },
        { id: 'label', weight: 3 },
        
        // --- Basic (Weight: 2 each) ---
        { id: 'heading-order', weight: 2 },
        { id: 'is-on-https', weight: 2 },
        
        // --- Performance (Weight: 1 each) ---
        { id: 'largest-contentful-paint', weight: 1 },
        { id: 'cumulative-layout-shift', weight: 1 },
      ],
    },
  },
};