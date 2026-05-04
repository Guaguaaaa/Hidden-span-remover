const toggle = document.getElementById('toggle');
const highlightToggle = document.getElementById('highlightToggle');
const exportMarkdownButton = document.getElementById('exportMarkdown');

function sendMessageToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, message);
    }
  });
}

// Read the saved state and reflect it in the toggles
chrome.storage.local.get(['enabled', 'highlighted'], ({ enabled, highlighted }) => {
  toggle.checked = !!enabled;
  highlightToggle.checked = !!highlighted;
});

// When the user flips the toggle:
// 1. Save the new state
// 2. Tell the active tab's content script to start/stop
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;

  chrome.storage.local.set({ enabled });
  sendMessageToActiveTab({ type: 'SET_STATE', enabled });
});

highlightToggle.addEventListener('change', () => {
  const enabled = highlightToggle.checked;
  chrome.storage.local.set({ highlighted: enabled });
  sendMessageToActiveTab({ type: 'SET_HIGHLIGHT', enabled });
});

// Export the current page content after removing matching hidden spans from a clone.
// This works even if the removal toggle is currently off.
exportMarkdownButton.addEventListener('click', () => {
  sendMessageToActiveTab({ type: 'EXPORT_MARKDOWN' });
});
