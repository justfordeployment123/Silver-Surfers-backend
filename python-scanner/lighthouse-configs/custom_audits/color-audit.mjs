// color-audit.js (Complete Version)

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Audit} from 'lighthouse';

const MINIMUM_COLOR_DIFFERENCE = 10;

function rgbToLab(rgbString) {
  const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) {
    return {L: 50, a: 0, b: 0};
  }
  let [, r, g, b] = match.map(Number);
  r /= 255; g /= 255; b /= 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
  x /= 0.95047; y /= 1.00000; z /= 1.08883;
  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
  const L = 116 * y - 16;
  const a = 500 * (x - y);
  const B = 200 * (y - z);
  return {L, a, b: B};
}

function deltaE(color1, color2) {
  const lab1 = rgbToLab(color1);
  const lab2 = rgbToLab(color2);
  const deltaL = lab1.L - lab2.L;
  const deltaA = lab1.a - lab2.a;
  const deltaB = lab1.b - lab2.b;
  return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}

class ColorAudit extends Audit {
  static get meta() {
    return {
      id: 'interactive-color-audit',
      title: 'Links are visually distinct from surrounding text',
      failureTitle: 'Links are not easily distinguishable from surrounding text',
      description: `Interactive elements like links should have a noticeable color difference from the text around them to be easily identifiable. This audit checks if the perceptual color difference (Delta E) is greater than ${MINIMUM_COLOR_DIFFERENCE}.`,
      requiredArtifacts: ['PageLinkColors', 'Accessibility'],
    };
  }

  static getFailureReason(difference, minimum) {
    if (difference === 0) {
      return 'The link color is identical to the surrounding text, making it impossible to distinguish by color alone.';
    }
    const percentageShort = Math.round(((minimum - difference) / minimum) * 100);
    const diffString = difference.toFixed(1);
    return `The color difference is ${diffString} (ΔE), which is ${percentageShort}% below the recommended minimum of ${minimum} for clear distinction.`;
  }

  static audit(artifacts) {
    const collectedLinks = artifacts.PageLinkColors;
    const accessibilityResults = artifacts.Accessibility;

    if (collectedLinks.length === 0) {
      return { score: 1, notApplicable: true };
    }

    const accessibilityNodeMap = new Map();
    const allAccessibilityNodes = (accessibilityResults.violations || [])
      .flatMap(v => v.nodes || [])
      .concat((accessibilityResults.passes || []).flatMap(p => p.nodes || []))
      .concat((accessibilityResults.incomplete || []).flatMap(i => i.nodes || []));

    allAccessibilityNodes.forEach(accessNode => {
      if (accessNode?.node?.boundingRect) {
        const rect = accessNode.node.boundingRect;
        const keys = [
          `${rect.top}-${rect.left}-${rect.width}-${rect.height}`,
          `${Math.round(rect.top)}-${Math.round(rect.left)}-${Math.round(rect.width)}-${Math.round(rect.height)}`,
        ];
        keys.forEach(key => {
          if (!accessibilityNodeMap.has(key)) {
            accessibilityNodeMap.set(key, accessNode.node);
          }
        });
      }
    });

    const failingItems = [];
    for (const link of collectedLinks) {
      let difference = 0;
      let isFailure = false;
      if (link.linkColor === link.parentColor) {
        isFailure = true;
        difference = 0;
      } else {
        difference = deltaE(link.linkColor, link.parentColor);
        if (difference < MINIMUM_COLOR_DIFFERENCE) {
          isFailure = true;
        }
      }

      if (isFailure) {
        const positionKeys = [
          `${link.top}-${link.left}-${link.width}-${link.height}`,
          `${Math.round(link.top)}-${Math.round(link.left)}-${Math.round(link.width)}-${Math.round(link.height)}`,
        ];
        let matchingNode = null;
        for (const key of positionKeys) {
          matchingNode = accessibilityNodeMap.get(key);
          if (matchingNode) break;
        }

        if (!matchingNode) {
          matchingNode = {
            lhId: `link-${link.top}-${link.left}`,
            selector: link.elementId || 'a',
            boundingRect: { top: link.top, left: link.left, width: link.width, height: link.height },
            snippet: `<a href="${link.href || '#'}">${link.text.substring(0, 50)}...</a>`,
            nodeLabel: link.text.substring(0, 50),
          };
        }
        
        failingItems.push({
          node: matchingNode,
          text: link.text,
          linkColor: link.linkColor,
          parentColor: link.parentColor,
          difference: parseFloat(difference.toFixed(2)),
          explanation: ColorAudit.getFailureReason(difference, MINIMUM_COLOR_DIFFERENCE),
        });
      }
    }

    const headings = [
      {key: 'node', itemType: 'node', text: 'Link Element'},
      {key: 'linkColor', itemType: 'text', text: 'Link Color'},
      {key: 'parentColor', itemType: 'text', text: 'Parent Color'},
      {key: 'difference', itemType: 'numeric', text: 'Difference (ΔE)'},
      {key: 'explanation', itemType: 'text', text: 'Details'},
    ];

    if (failingItems.length === 0) {
      return { score: 1 };
    }

    const score = (collectedLinks.length - failingItems.length) / collectedLinks.length;
    const displayValue = `${failingItems.length} link${failingItems.length === 1 ? '' : 's'} have low color distinction`;
    const details = Audit.makeTableDetails(headings, failingItems);

    return {
      score: score,
      displayValue: displayValue,
      // --- THIS LINE IS NOW FIXED ---
      details: details, 
    };
  }
}

export default ColorAudit;


