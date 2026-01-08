import {Gatherer} from 'lighthouse';

function collectPageText() {
  const results = [];
  const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);



  const getSelector = (element) => {
    if (!element || !element.tagName) return '';
    if (element.tagName.toLowerCase() === 'body') return 'body';
    const parts = [];
    let current = element;
    while (current && current.tagName.toLowerCase() !== 'body') {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part = `#${current.id}`;
        parts.unshift(part);
        break;
      }
      if (current.classList && current.classList.length > 0) {
        part += '.' + Array.from(current.classList).join('.');
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  };

  let currentNode;
  while (currentNode = treeWalker.nextNode()) {
    const text = currentNode.textContent.trim();
    if (text.length === 0) continue;


    const container = currentNode.parentElement;
    if (!container) continue;

    const tagName = container.tagName.toLowerCase();
    if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') continue;
    
    // --- CHANGE: Use a Range to get the tight bounding box of the TEXT itself ---
    const range = document.createRange();
    range.selectNode(currentNode);
    const rect = range.getBoundingClientRect();
    // --- END CHANGE ---
    
    // Check for visibility using the new, tighter rect
    if (rect.width === 0 || rect.height === 0) continue;

    const style = window.getComputedStyle(container); // Style is still inherited from the container
    if (style.fontSize) {
      results.push({
        text: text.substring(0, 100),
        fontSize: style.fontSize,
        // Use the new, tight coordinates from the Range object
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        // Keep the container info as it's still useful context
        containerTag: tagName,
        containerSelector: getSelector(container),
      });
    }
  }
  return results;
}

class TextGatherer extends Gatherer {
  meta = { supportedModes: ['snapshot', 'timespan', 'navigation'] };
  async getArtifact(passContext) {
    return passContext.driver.executionContext.evaluate(collectPageText, { args: [], useIsolation: true });
  }
}
export default TextGatherer;