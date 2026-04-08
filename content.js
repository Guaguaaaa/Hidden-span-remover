// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/**
 * Returns true if `el` is a hidden span we want to remove.
 * Matches: <span aria-hidden="true" style="color:rgba(1,1,1,0); font-size:0.0pt ...">
 *
 * We strip all whitespace from the style string before testing so that minor
 * formatting differences (spaces around colons, commas, etc.) don't matter.
 */
function isHiddenSpan(el) {
  if (el.nodeType !== Node.ELEMENT_NODE) return false;
  if (el.tagName !== 'SPAN') return false;
  if (el.getAttribute('aria-hidden') !== 'true') return false;

  // Collapse all whitespace so "color: rgba(1, 1, 1, 0)" → "color:rgba(1,1,1,0)"
  const style = (el.getAttribute('style') || '').replace(/\s/g, '');

  const hasColor    = /color:rgba\(1,1,1,0\)/.test(style);
  const hasFontSize = /font-size:0\.0pt/.test(style);

  return hasColor && hasFontSize;
}

// ---------------------------------------------------------------------------
// Removal helpers
// ---------------------------------------------------------------------------

/** Remove every matching span already present in the document. */
function removeExisting() {
  // Pre-filter with a CSS selector to avoid walking the whole DOM
  document.querySelectorAll('span[aria-hidden="true"]').forEach(el => {
    if (isHiddenSpan(el)) el.remove();
  });
}

// ---------------------------------------------------------------------------
// Observer — watches for dynamically added nodes
// ---------------------------------------------------------------------------

let observer = null;

function startRemoving() {
  // Clean up what's already on the page
  removeExisting();

  // Then watch for anything the page adds later
  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Check the node itself
        if (isHiddenSpan(node)) {
          node.remove();
          continue; // no need to inspect its children after removal
        }

        // Check any matching descendants inside the added subtree
        node.querySelectorAll('span[aria-hidden="true"]').forEach(el => {
          if (isHiddenSpan(el)) el.remove();
        });
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function stopRemoving() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  // Note: nodes already removed are gone — that is intentional per the spec.
}

// ---------------------------------------------------------------------------
// Initialise on page load
// ---------------------------------------------------------------------------

chrome.storage.local.get('enabled', ({ enabled }) => {
  if (enabled) startRemoving();
});

// ---------------------------------------------------------------------------
// Listen for toggle messages from the popup
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'SET_STATE') return;
  if (msg.enabled) {
    startRemoving();
  } else {
    stopRemoving();
  }
});
