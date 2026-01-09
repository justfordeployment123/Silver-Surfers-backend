// custom-config.js


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

  // 1. We still extend the default config to get access to all the audits and gatherers.

  extends: 'lighthouse:default',



  // 2. Add a 'settings' object to control what the runner executes. 

  settings: {
    // Reduce surface area to our custom category and tune for container deployments
    onlyCategories: ['senior-friendly'],
    maxWaitForLoad: 120000,
    throttlingMethod: 'simulate',
    disableStorageReset: true,

  },



  artifacts: [
    { id: 'PageText', gatherer: path.resolve(__dirname, 'custom_gatherers/text-gatherer.js') },
    { id: 'PageLinkColors', gatherer: path.resolve(__dirname, 'custom_gatherers/color-gatherer.js') },
    { id: 'BrittleLayoutElements', gatherer: path.resolve(__dirname, 'custom_gatherers/layout-gatherer.js') },
    { id: 'PageContentGatherer', gatherer: path.resolve(__dirname, 'custom_gatherers/page-content-gatherer.js') },
  ],

  audits: [
    { path: path.resolve(__dirname, 'custom_audits/text-audit.js') },
    { path: path.resolve(__dirname, 'custom_audits/color-audit.js') },
    { path: path.resolve(__dirname, 'custom_audits/layout-audit.js') },
    { path: path.resolve(__dirname, 'custom_audits/flesch-kincaid-audit.js') },
  ],




  // 4. The categories section defines the content of your custom category.

  categories: {

    'senior-friendly': {

      title: 'Senior Friendliness',

      description: 'A comprehensive score based on audits for readability, ease of use, and a stable, non-confusing experience.',

      auditRefs: [

        // --- Tier 1: Critical (Weight: 10 each) ---

        { id: 'color-contrast', weight: 10 },

        { id: 'target-size', weight: 10 },

        { id: 'viewport', weight: 10 },

        { id: 'cumulative-layout-shift', weight: 10 },

        { id: 'text-font-audit', weight: 15 },
        { id: 'layout-brittle-audit', weight: 2 },
        { id: 'flesch-kincaid-audit', weight: 15 },



        // --- Tier 2: Important (Weight: 5 each) ---

        { id: 'largest-contentful-paint', weight: 5 },

        { id: 'total-blocking-time', weight: 5 },

        { id: 'link-name', weight: 5 },

        { id: 'button-name', weight: 5 },

        { id: 'label', weight: 5 },

        { id: 'interactive-color-audit', weight: 5 },



        // --- Tier 3: Foundational (Weight: 2 each) ---

        { id: 'is-on-https', weight: 2 },

        { id: 'dom-size', weight: 2 },

        { id: 'heading-order', weight: 2 },

        { id: 'errors-in-console', weight: 2 },

        { id: 'geolocation-on-start', weight: 2 },

      ],

    },

  },

};

