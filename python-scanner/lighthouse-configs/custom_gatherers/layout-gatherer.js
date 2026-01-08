import {Gatherer} from 'lighthouse';

function collectBrittleLayoutElements() {
  function getCssSelector(el) {
    if (!(el instanceof Element)) return '';
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += '#' + el.id;
        path.unshift(selector);
        break;
      } else {
        let sib = el, nth = 1;
        while ((sib = sib.previousElementSibling)) {
          if (sib.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(' > ');
  }

  // --- NEW LOGIC: Two-pass filtering to find only the innermost elements ---

  // Pass 1: Find all candidate elements that have a fixed height and visible text.
  const candidates = [];
  const allElements = document.querySelectorAll('body *:not(script):not(style):not(meta):not(link)');
  for (const element of allElements) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    const hasVisibleText = rect.width > 0 && rect.height > 0 && element.textContent.trim().length > 10;
    if (!hasVisibleText) continue;

    const hasFixedPixelHeight = style.height.endsWith('px');
    const hasFixedPixelMaxHeight = style.maxHeight.endsWith('px') && style.maxHeight !== 'none';

    if (hasFixedPixelHeight || hasFixedPixelMaxHeight) {
      candidates.push(element);
    }
  }

  // Pass 2: Filter the candidates to keep only the "leaf" elements.
  // A leaf is an element that does not contain any OTHER candidate element.
  const finalElements = candidates.filter(elementA => {
    return !candidates.some(elementB => elementA !== elementB && elementA.contains(elementB));
  });

  // Pass 3: Generate the results from our clean list of final elements.
  const results = [];
  for (const element of finalElements) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const hasFixedPixelHeight = style.height.endsWith('px');

      results.push({
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        selector: getCssSelector(element),
        textSnippet: element.textContent.trim().substring(0, 100),
        failingProperty: hasFixedPixelHeight ? 'height' : 'max-height',
        propertyValue: hasFixedPixelHeight ? style.height : style.maxHeight,
        overflow: style.overflowY,
      });
  }

  return results;
}

class LayoutGatherer extends Gatherer {
  meta = { supportedModes: ['snapshot', 'timespan', 'navigation'] };
  async getArtifact(passContext) {
    const driver = passContext.driver;
    return driver.executionContext.evaluate(collectBrittleLayoutElements, {
      args: [],
      useIsolation: true,
    });
  }
}

export default LayoutGatherer;