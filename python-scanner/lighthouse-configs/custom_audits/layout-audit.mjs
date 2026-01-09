// layout-audit.js
import {Audit} from 'lighthouse';

class LayoutAudit extends Audit {
  static get meta() {
    return {
      id: 'layout-brittle-audit',
      title: 'Containers allow for text spacing adjustments',
      failureTitle: 'Fixed-height containers may prevent text spacing adjustments',
      description: `A critical accessibility feature (WCAG 1.4.12) is allowing users to adjust text spacing. When text containers have a fixed height or max-height in pixels, they are likely to break when the user increases line or paragraph spacing, causing text to be cut off or hidden.`,
      requiredArtifacts: ['BrittleLayoutElements', 'Accessibility'],
    };
  }

  static getFailureReason(overflowStyle) {
    switch (overflowStyle) {
      case 'hidden':
      case 'clip':
        return 'This container has a fixed size and will hide any content that overflows. Text will be cut off and become unreadable if it grows.';
      case 'scroll':
      case 'auto':
        return 'This container has a fixed size and will show a scrollbar if content overflows. This can create a poor, nested scrolling experience on text resize.';
      case 'visible':
      default:
        return 'This container has a fixed size and its content may overflow, overlapping and obscuring other elements on the page.';
    }
  }

  static audit(artifacts) {
    const brittleElements = artifacts.BrittleLayoutElements;
    const accessibilityResults = artifacts.Accessibility;

    if (brittleElements.length === 0) {
      return { score: 1, notApplicable: false };
    }

    const accessibilityNodeMap = new Map();
    const allAccessibilityNodes = (accessibilityResults.violations || [])
      .flatMap(v => v.nodes || [])
      .concat((accessibilityResults.passes || []).flatMap(p => p.nodes || []))
      .concat((accessibilityResults.incomplete || []).flatMap(i => i.nodes || []));

    for (const accessNode of allAccessibilityNodes) {
      if (accessNode?.node?.boundingRect) {
        const rect = accessNode.node.boundingRect;
        const key = `${Math.round(rect.top)}-${Math.round(rect.left)}-${Math.round(rect.width)}-${Math.round(rect.height)}`;
        if (!accessibilityNodeMap.has(key)) {
          accessibilityNodeMap.set(key, accessNode.node);
        }
      }
    }

    const failingItems = [];
    for (const element of brittleElements) {
        const key = `${element.top}-${element.left}-${element.width}-${element.height}`;
        let matchingNode = accessibilityNodeMap.get(key);
        if (!matchingNode) {
            matchingNode = {
                lhId: `brittle-element-${key}`,
                selector: element.selector,
                boundingRect: { top: element.top, left: element.left, width: element.width, height: element.height },
                snippet: `<div style="${element.failingProperty}: ${element.propertyValue}">${element.textSnippet}</div>`,
                nodeLabel: element.textSnippet,
            };
        }
        
        failingItems.push({
            node: matchingNode,
            failingProperty: `${element.failingProperty}: ${element.propertyValue}`,
            overflow: element.overflow,
            reason: LayoutAudit.getFailureReason(element.overflow),
        });
    }

    // --- ENHANCEMENT: Update headings for the new, more specific data ---
    const headings = [
      {key: 'node', itemType: 'node', text: 'Element'},
      {key: 'failingProperty', itemType: 'text', text: 'Problematic Style'},
      {key: 'overflow', itemType: 'text', text: 'Overflow Style'},
      {key: 'reason', itemType: 'text', text: 'Potential Issue'},
    ];

    const displayValue = `${failingItems.length} container(s) with fixed heights may break when text is resized.`;
    const details = Audit.makeTableDetails(headings, failingItems);

    return {
      score: 0,
      displayValue: displayValue,
      details: details,
    };
  }
}

export default LayoutAudit;

