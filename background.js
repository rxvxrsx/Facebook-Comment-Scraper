// background.js - Service Worker for FB Comment Scraper (Side Panel Mode)

const PENDING_SCRAPE_PREFIX = 'pendingInlineScrape:';
const PENDING_SCRAPE_TTL_MS = 30_000;

function getPendingScrapeKey(tabId) {
  return `${PENDING_SCRAPE_PREFIX}${tabId}`;
}

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
  if (message.action === 'queueInlineScrape') {
    if (!sender.tab || sender.tab.id === undefined) {
      sendResponse({ success: false, error: 'Cannot queue scrape without a source tab' });
      return;
    }
    const key = getPendingScrapeKey(sender.tab.id);
    chrome.storage.session.set({
      [key]: {
        requestedAt: Date.now(),
        sourceUrl: sender.tab.url || '',
        targetPostId: message.targetPostId || ''
      }
    }).then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'getQueuedInlineScrape') {
    if (!sender.tab || sender.tab.id === undefined) {
      sendResponse({ success: false, pending: null });
      return;
    }
    const key = getPendingScrapeKey(sender.tab.id);
    chrome.storage.session.get(key).then(result => {
      const pending = result[key];
      const expired = !pending || Date.now() - pending.requestedAt > PENDING_SCRAPE_TTL_MS;
      const wrongPost = pending?.targetPostId && message.currentPostId &&
        pending.targetPostId !== message.currentPostId;
      if (expired) {
        return chrome.storage.session.remove(key).then(() => {
          sendResponse({ success: true, pending: null });
        });
      }
      sendResponse({ success: true, pending: wrongPost ? null : pending });
    }).catch(error => sendResponse({ success: false, pending: null, error: error.message }));
    return true;
  }

  if (message.action === 'clearQueuedInlineScrape') {
    if (!sender.tab || sender.tab.id === undefined) {
      sendResponse({ success: false });
      return;
    }
    chrome.storage.session.remove(getPendingScrapeKey(sender.tab.id))
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

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
