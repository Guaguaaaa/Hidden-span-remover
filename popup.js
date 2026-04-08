const toggle = document.getElementById('toggle');

// Read the saved state and reflect it in the toggle
chrome.storage.local.get('enabled', ({ enabled }) => {
  toggle.checked = !!enabled;
});

// When the user flips the toggle:
// 1. Save the new state
// 2. Tell the active tab's content script to start/stop
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;

  chrome.storage.local.set({ enabled });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, { type: 'SET_STATE', enabled });
    }
  });
});
