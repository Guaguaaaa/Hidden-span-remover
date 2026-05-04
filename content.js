// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/**
 * Returns true if `el` is a hidden span we want to remove.
 * Matches hidden spans with `aria-hidden="true"` and either:
 * - `font-size:0.0pt`
 * - `color:rgba(1,1,1,0)`
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

  const hasColor = /color:rgba\(1,1,1,0\)/.test(style);
  const hasFontSize = /font-size:0\.0pt/.test(style);

  return hasColor || hasFontSize;
}

// ---------------------------------------------------------------------------
// Removal helpers
// ---------------------------------------------------------------------------

/** Remove every matching span already present inside `root`. */
function removeExisting(root = document) {
  // Pre-filter with a CSS selector to avoid walking the whole DOM
  root.querySelectorAll('span[aria-hidden="true"]').forEach(el => {
    if (isHiddenSpan(el)) el.remove();
  });
}

// ---------------------------------------------------------------------------
// Observer — watches for dynamically added nodes
// ---------------------------------------------------------------------------

let observer = null;

function startRemoving() {
  // Avoid creating duplicate observers if the popup sends ON more than once.
  if (observer) observer.disconnect();

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
// Highlight helpers — make hidden spans visible in red
// ---------------------------------------------------------------------------

const HIGHLIGHT_ATTR = 'data-hidden-highlight';

function highlightEl(el) {
  if (el.hasAttribute(HIGHLIGHT_ATTR)) return;
  el.setAttribute(HIGHLIGHT_ATTR, el.getAttribute('style') || '');
  el.style.cssText = '';
  el.style.setProperty('color', 'red', 'important');
  el.style.setProperty('font-size', '12pt', 'important');
  el.style.setProperty('background', 'rgba(255,0,0,0.1)', 'important');
  el.style.setProperty('outline', '1px solid red', 'important');
}

function highlightExisting(root = document) {
  root.querySelectorAll('span[aria-hidden="true"]').forEach(el => {
    if (isHiddenSpan(el)) highlightEl(el);
  });
}

function unHighlightExisting(root = document) {
  root.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach(el => {
    const original = el.getAttribute(HIGHLIGHT_ATTR);
    el.style.cssText = '';
    if (original) {
      el.setAttribute('style', original);
    } else {
      el.removeAttribute('style');
    }
    el.removeAttribute(HIGHLIGHT_ATTR);
  });
}

let highlightObserver = null;

function startHighlighting() {
  if (highlightObserver) highlightObserver.disconnect();

  highlightExisting();

  highlightObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (isHiddenSpan(node)) { highlightEl(node); continue; }
        node.querySelectorAll('span[aria-hidden="true"]').forEach(el => {
          if (isHiddenSpan(el)) highlightEl(el);
        });
      }
    }
  });

  highlightObserver.observe(document.body, { childList: true, subtree: true });
}

function stopHighlighting() {
  if (highlightObserver) {
    highlightObserver.disconnect();
    highlightObserver = null;
  }
  unHighlightExisting();
}

// ---------------------------------------------------------------------------
// Markdown export helpers
// ---------------------------------------------------------------------------

function getExportRootClone() {
  // Prefer the useful document body from Just the Docs pages, but fall back to
  // semantic containers and finally the whole body for general pages.
  const source =
    document.querySelector('#main-content') ||
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.body;

  const clone = source.cloneNode(true);

  // Remove hidden spans from the cloned content even if the live page toggle is off.
  removeExisting(clone);

  // Drop decorative heading anchor links, scripts, styles, and SVG icons.
  clone.querySelectorAll('.anchor-heading, script, style, svg').forEach(el => el.remove());

  return clone;
}

function escapeMarkdown(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([*_`\[\]])/g, '\\$1');
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ');
}

function getPlainText(node) {
  return normalizeText(node.textContent || '').trim();
}

function inlineMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdown(normalizeText(node.textContent || ''));
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map(inlineMarkdown).join('');

  switch (tag) {
    case 'br':
      return '  \n';
    case 'code':
      return '`' + (node.textContent || '').replace(/`/g, '\\`') + '`';
    case 'strong':
    case 'b':
      return `**${children.trim()}**`;
    case 'em':
    case 'i':
      return `*${children.trim()}*`;
    case 'a': {
      const href = node.getAttribute('href');
      const label = children.trim() || href || '';
      return href ? `[${label}](${href})` : label;
    }
    case 'img': {
      const alt = node.getAttribute('alt') || '';
      const src = node.getAttribute('src') || '';
      return src ? `![${escapeMarkdown(alt)}](${src})` : '';
    }
    default:
      return children;
  }
}

function blockMarkdown(node, listDepth = 0) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = getPlainText(node);
    return text ? escapeMarkdown(text) : '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  const childBlocks = () => Array.from(node.childNodes)
    .map(child => blockMarkdown(child, listDepth))
    .filter(Boolean)
    .join('\n\n');

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag.slice(1));
      return `${'#'.repeat(level)} ${inlineMarkdown(node).trim()}`;
    }
    case 'p': {
      const text = inlineMarkdown(node).trim();
      const className = node.getAttribute('class') || '';
      if (!text) return '';
      if (/\b(warn|danger|hint)\b/.test(className)) {
        return `> **${className}:** ${text}`;
      }
      return text;
    }
    case 'pre': {
      const code = node.textContent.replace(/^\n|\n$/g, '');
      return '```\n' + code + '\n```';
    }
    case 'blockquote': {
      return childBlocks().split('\n').map(line => `> ${line}`).join('\n');
    }
    case 'ul':
    case 'ol': {
      return Array.from(node.children)
        .filter(child => child.tagName && child.tagName.toLowerCase() === 'li')
        .map((li, index) => listItemMarkdown(li, tag === 'ol', index + 1, listDepth))
        .join('\n');
    }
    case 'table':
      return tableMarkdown(node);
    case 'hr':
      return '---';
    case 'img':
      return inlineMarkdown(node).trim();
    default:
      return childBlocks();
  }
}

function listItemMarkdown(li, ordered, index, depth) {
  const marker = ordered ? `${index}. ` : '- ';
  const indent = '  '.repeat(depth);
  const nested = [];
  const inlineParts = [];

  Array.from(li.childNodes).forEach(child => {
    if (child.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes(child.tagName.toLowerCase())) {
      nested.push(blockMarkdown(child, depth + 1));
    } else {
      inlineParts.push(inlineMarkdown(child));
    }
  });

  const firstLine = `${indent}${marker}${inlineParts.join('').trim()}`;
  return [firstLine, ...nested].filter(Boolean).join('\n');
}

function tableMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr')).map(row =>
    Array.from(row.children).map(cell => inlineMarkdown(cell).replace(/\|/g, '\\|').trim())
  );

  if (rows.length === 0) return '';

  const columnCount = Math.max(...rows.map(row => row.length));
  const normalizedRows = rows.map(row => {
    while (row.length < columnCount) row.push('');
    return row;
  });

  const header = normalizedRows[0];
  const separator = Array(columnCount).fill('---');
  const body = normalizedRows.slice(1);

  return [header, separator, ...body]
    .map(row => `| ${row.join(' | ')} |`)
    .join('\n');
}

function htmlToMarkdown(root) {
  return Array.from(root.childNodes)
    .map(node => blockMarkdown(node))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

function safeFileName(name) {
  return (name || 'cleaned-page')
    .trim()
    .replace(/[^a-z0-9\-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'cleaned-page';
}

function downloadMarkdown() {
  const clone = getExportRootClone();
  const markdown = htmlToMarkdown(clone);
  const pageTitle = document.querySelector('h1')?.textContent || document.title || 'cleaned-page';
  const filename = `${safeFileName(pageTitle)}.md`;

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Initialise on page load
// ---------------------------------------------------------------------------

chrome.storage.local.get(['enabled', 'highlighted'], ({ enabled, highlighted }) => {
  if (enabled) startRemoving();
  if (highlighted) startHighlighting();
});

// ---------------------------------------------------------------------------
// Listen for messages from the popup
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SET_STATE') {
    if (msg.enabled) {
      startRemoving();
    } else {
      stopRemoving();
    }
    return;
  }

  if (msg.type === 'SET_HIGHLIGHT') {
    if (msg.enabled) {
      startHighlighting();
    } else {
      stopHighlighting();
    }
    return;
  }

  if (msg.type === 'EXPORT_MARKDOWN') {
    downloadMarkdown();
  }
});
