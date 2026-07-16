// background.js - Service Worker for FB Comment Scraper (Side Panel Mode)

// Configure the extension to open the Side Panel when the toolbar icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .then(() => console.log("Side Panel behavior set: open on click."))
      .catch((error) => console.error("Error setting panel behavior:", error));
  }
});

// We can still listen for messages from content scripts to handle background tasks if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadFile') {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId: downloadId });
      }
    });
    return true; // Keep channel open
  }

  if (message.action === 'openSidePanel') {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      if (!sender.tab || sender.tab.id === undefined) {
        sendResponse({ success: false, error: 'Cannot open Side Panel without a source tab' });
        return;
      }
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response
    } else {
      sendResponse({ success: false, error: 'SidePanel API not supported or available' });
    }
  }
});
