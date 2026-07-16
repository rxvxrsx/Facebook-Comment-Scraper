// sidepanel.js - Script for native Chrome Side Panel interface

const {
  DEFAULT_EXPORT_FIELD_KEYS,
  EXPORT_FIELDS,
  buildCsvTable,
  buildJsonTree,
  normalizeFieldKeys
} = globalThis.FbExportCore;
const {
  INLINE_BUTTON_ENABLED_STORAGE_KEY,
  SCRAPE_OPTIONS_STORAGE_KEY,
  normalizeScrapeOptions
} = globalThis.FbScraperCore;

let activeTabId = null;
let scrapeTabId = null;
let currentRunId = null;
let isScraping = false;
let hasSelectedPost = false;
let scrapedComments = [];
let totalCommentsCount = 0;
let isPreviewLocked = false;
const MAX_PREVIEW_COMMENTS = 200;

// DOM References
const pageStatusDot = document.getElementById('page-status-dot');
const pageStatusText = document.getElementById('page-status-text');
const btnSelectPost = document.getElementById('btn-select-post');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnExportCsv = document.getElementById('btn-export-csv');
const btnExportJson = document.getElementById('btn-export-json');
const logMonitor = document.getElementById('log-monitor');
const btnClearLog = document.getElementById('btn-clear-log');
const previewList = document.getElementById('preview-list');
const scrapingIndicator = document.getElementById('scraping-indicator');
const btnLockPreview = document.getElementById('btn-lock-preview');

const statTotal = document.getElementById('stat-total');
const statComments = document.getElementById('stat-comments');
const statImages = document.getElementById('stat-images');

// Options
const optInlineButton = document.getElementById('opt-inline-button');
const optExpand = document.getElementById('opt-expand');
const optImages = document.getElementById('opt-images');
const optLimit = document.getElementById('opt-limit');
const optDelay = document.getElementById('opt-delay');
const exportFieldInputs = Array.from(document.querySelectorAll('.export-field'));
const exportFieldCount = document.getElementById('export-field-count');
const exportFieldsPanel = document.getElementById('export-fields-panel');
const exportFieldChevron = document.getElementById('export-field-chevron');
const btnToggleFields = document.getElementById('btn-toggle-fields');
const btnFieldsAll = document.getElementById('btn-fields-all');
const btnFieldsDefault = document.getElementById('btn-fields-default');
const EXPORT_FIELDS_STORAGE_KEY = 'fbScraperExportFields';

// Helper: Add log entry
function addLog(message) {
  const time = new Date().toLocaleTimeString();
  logMonitor.appendChild(document.createTextNode(`\n[${time}] ${String(message)}`));
  logMonitor.scrollTop = logMonitor.scrollHeight;
}

function showPreviewMessage(message) {
  const emptyState = document.createElement('div');
  emptyState.className = 'preview-empty';
  emptyState.textContent = message;
  previewList.replaceChildren(emptyState);
}

function isFacebookUrl(urlString) {
  try {
    const hostname = new URL(urlString).hostname.toLowerCase();
    return hostname === 'facebook.com' || hostname.endsWith('.facebook.com') ||
           hostname === 'fb.com' || hostname.endsWith('.fb.com');
  } catch (error) {
    return false;
  }
}

function normalizeExternalUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.href;
    }
  } catch (error) {
    // Ignore malformed URLs scraped from the page.
  }
  return '';
}

function setOptionsDisabled(disabled) {
  [optExpand, optImages, optLimit, optDelay].forEach(option => {
    option.disabled = disabled;
  });
}

function getCurrentScrapeOptions() {
  return normalizeScrapeOptions({
    expandReplies: optExpand.checked,
    includeImages: optImages.checked,
    limit: optLimit.value,
    delay: optDelay.value
  });
}

function applyScrapeOptions(options) {
  const normalized = normalizeScrapeOptions(options);
  optExpand.checked = normalized.expandReplies;
  optImages.checked = normalized.includeImages;
  optLimit.value = normalized.limit;
  optDelay.value = normalized.delay;
}

async function restoreScrapeOptions() {
  try {
    const stored = await chrome.storage.local.get(SCRAPE_OPTIONS_STORAGE_KEY);
    applyScrapeOptions(stored[SCRAPE_OPTIONS_STORAGE_KEY]);
  } catch (error) {
    applyScrapeOptions(null);
    console.warn('Cannot restore scrape options:', error);
  }
}

async function restoreInlineButtonPreference() {
  try {
    const stored = await chrome.storage.local.get(INLINE_BUTTON_ENABLED_STORAGE_KEY);
    optInlineButton.checked = stored[INLINE_BUTTON_ENABLED_STORAGE_KEY] !== false;
  } catch (error) {
    optInlineButton.checked = true;
    console.warn('Cannot restore inline button preference:', error);
  }
}

function updateInlineButtonPreference() {
  const enabled = optInlineButton.checked;
  chrome.storage.local.set({
    [INLINE_BUTTON_ENABLED_STORAGE_KEY]: enabled
  }).catch(error => console.warn('Cannot persist inline button preference:', error));

  if (activeTabId !== null) {
    chrome.tabs.sendMessage(activeTabId, {
      action: 'setInlineButtonEnabled',
      enabled
    }, () => {
      void chrome.runtime.lastError;
    });
  }
  addLog(enabled ? 'เปิดปุ่มดึงความเห็นบน Facebook' : 'ซ่อนปุ่มดึงความเห็นบน Facebook');
}

function persistScrapeOptions() {
  chrome.storage.local.set({
    [SCRAPE_OPTIONS_STORAGE_KEY]: getCurrentScrapeOptions()
  }).catch(error => console.warn('Cannot persist scrape options:', error));
}

function getSelectedExportFields() {
  return normalizeFieldKeys(exportFieldInputs.filter(input => input.checked).map(input => input.value));
}

function setExportFieldsExpanded(expanded) {
  btnToggleFields.setAttribute('aria-expanded', String(expanded));
  exportFieldsPanel.hidden = !expanded;
  exportFieldChevron.textContent = expanded ? '▲' : '▼';
}

function applyExportFieldSelection(fieldKeys) {
  const selected = new Set(normalizeFieldKeys(fieldKeys));
  exportFieldInputs.forEach(input => {
    input.checked = selected.has(input.value);
  });
}

function updateExportButtons() {
  const canExport = scrapedComments.length > 0 && getSelectedExportFields().length > 0;
  btnExportCsv.disabled = !canExport;
  btnExportJson.disabled = !canExport;
}

function updateExportFieldState(shouldPersist = true) {
  const selectedFields = getSelectedExportFields();
  exportFieldCount.textContent = `${selectedFields.length}/${EXPORT_FIELDS.length} หัวข้อ`;
  updateExportButtons();
  if (!shouldPersist) return;
  try {
    localStorage.setItem(EXPORT_FIELDS_STORAGE_KEY, JSON.stringify(selectedFields));
  } catch (error) {
    console.warn('Cannot persist export field selection:', error);
  }
}

function restoreExportFieldSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPORT_FIELDS_STORAGE_KEY));
    applyExportFieldSelection(Array.isArray(saved) ? saved : DEFAULT_EXPORT_FIELD_KEYS);
  } catch (error) {
    applyExportFieldSelection(DEFAULT_EXPORT_FIELD_KEYS);
  }
  updateExportFieldState(false);
}

function setPreviewLocked(locked, shouldLog = true) {
  isPreviewLocked = locked && scrapedComments.length > 0;
  btnLockPreview.setAttribute('aria-pressed', String(isPreviewLocked));
  btnLockPreview.textContent = isPreviewLocked ? '🔒 ล็อกแล้ว' : '🔓 ล็อกผลลัพธ์';
  btnLockPreview.disabled = scrapedComments.length === 0 || isScraping;
  if (shouldLog) {
    addLog(isPreviewLocked
      ? 'ล็อก Live Preview แล้ว ผลลัพธ์จะไม่หายเมื่อเปิดชื่อหรือรูปในแท็บใหม่'
      : 'ปลดล็อก Live Preview แล้ว');
  }
}

function updatePreviewLockButton() {
  btnLockPreview.disabled = scrapedComments.length === 0 || isScraping;
}

function resetResults() {
  scrapedComments = [];
  totalCommentsCount = 0;
  updateLivePreview([]);
  statTotal.textContent = '0';
  updateExportButtons();
}

function resetForTabChange(nextTabId) {
  const previousActiveTabId = activeTabId;
  const previousScrapeTabId = scrapeTabId;
  const previousRunId = currentRunId;
  if (previousActiveTabId !== null) {
    chrome.tabs.sendMessage(previousActiveTabId, { action: 'exitPostSelection' }, () => {
      void chrome.runtime.lastError;
    });
  }
  if (isScraping && previousScrapeTabId !== null) {
    chrome.tabs.sendMessage(previousScrapeTabId, { action: 'stopScrape', runId: previousRunId }, () => {
      void chrome.runtime.lastError;
    });
  }

  activeTabId = nextTabId;
  scrapeTabId = null;
  currentRunId = null;
  isScraping = false;
  hasSelectedPost = false;
  if (!isPreviewLocked) resetResults();
  btnStart.disabled = true;
  btnStop.disabled = true;
  btnSelectPost.disabled = true;
  btnSelectPost.textContent = '🔍 เลือกโพสต์บนหน้า Facebook';
  btnSelectPost.className = 'btn btn-select';
  setOptionsDisabled(false);
  scrapingIndicator.textContent = 'พร้อมใช้งาน (ระบบ Side Panel)';
  scrapingIndicator.style.color = '';
}

// Initial connection check
document.addEventListener('DOMContentLoaded', async () => {
  restoreExportFieldSelection();
  await Promise.all([restoreScrapeOptions(), restoreInlineButtonPreference()]);
  addLog("ส่วนควบคุม Side Panel เริ่มทำงาน...");
  await checkCurrentTab();
  
  // Set up tab change listeners to dynamically update connection state
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await checkCurrentTab();
  });
  
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!tab.active) return;
    if (tabId === activeTabId && (changeInfo.status === 'loading' || changeInfo.url)) {
      resetForTabChange(tabId);
    }
    if (changeInfo.status === 'complete') {
      await checkCurrentTab();
    }
  });

  // Action listeners
  btnSelectPost.addEventListener('click', togglePostSelection);
  btnStart.addEventListener('click', startScraping);
  btnStop.addEventListener('click', stopScraping);
  btnExportCsv.addEventListener('click', exportCsv);
  btnExportJson.addEventListener('click', exportJson);
  btnClearLog.addEventListener('click', clearLog);
  btnLockPreview.addEventListener('click', () => setPreviewLocked(!isPreviewLocked));
  optInlineButton.addEventListener('change', updateInlineButtonPreference);
  btnToggleFields.addEventListener('click', () => {
    setExportFieldsExpanded(btnToggleFields.getAttribute('aria-expanded') !== 'true');
  });
  exportFieldInputs.forEach(input => input.addEventListener('change', () => updateExportFieldState()));
  btnFieldsAll.addEventListener('click', () => {
    applyExportFieldSelection(EXPORT_FIELDS.map(field => field.key));
    updateExportFieldState();
  });
  btnFieldsDefault.addEventListener('click', () => {
    applyExportFieldSelection(DEFAULT_EXPORT_FIELD_KEYS);
    updateExportFieldState();
  });
  [optExpand, optImages, optLimit, optDelay].forEach(option => {
    option.addEventListener('change', persistScrapeOptions);
  });
});

// Check current active tab and verify if it's Facebook
async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url) {
      const tabChanged = activeTabId !== null && activeTabId !== tab.id;
      if (tabChanged) {
        resetForTabChange(tab.id);
      } else {
        activeTabId = tab.id;
      }
      const queriedTabId = tab.id;
      const isFacebook = isFacebookUrl(tab.url);
      
      if (isFacebook) {
        pageStatusDot.className = 'status-dot active';
        pageStatusText.textContent = 'เชื่อมต่อกับหน้า Facebook แล้ว';
        btnSelectPost.removeAttribute('disabled');
        addLog("เชื่อมต่อหน้า Facebook สำเร็จ พร้อมสำหรับเลือกโพสต์");
        
        // Ask content script if it already has a selected post (e.g. from auto detect)
        chrome.tabs.sendMessage(activeTabId, { action: 'checkSelectedStatus' }, (response) => {
          if (activeTabId !== queriedTabId) return;
          if (chrome.runtime.lastError) {
            console.log("Content script not ready yet:", chrome.runtime.lastError.message);
            addLog("กรุณารีเฟรชหน้าเว็บเฟซบุ๊กเพื่อโหลดระบบสคริปต์...");
            btnSelectPost.disabled = true;
            updatePostSelectedState(false);
            return;
          }
          if (response && response.hasSelected) {
            updatePostSelectedState(true, response.message || 'ตรวจพบโพสต์อัตโนมัติ');
            if (response.isScraping && response.runId) {
              restoreScrapingState(queriedTabId, response.runId);
              addLog("เชื่อมต่อกลับเข้าการดึงข้อมูลที่กำลังทำงาน...");
            }
          } else {
            updatePostSelectedState(false);
          }
        });
      } else {
        resetConnectionState('ไม่ได้อยู่บนหน้าเว็บ Facebook');
      }
    } else {
      resetConnectionState('ตรวจไม่พบแท็บที่กำลังเปิดใช้งาน');
    }
  } catch (error) {
    console.error("Error checking active tab:", error);
    resetConnectionState('เกิดข้อผิดพลาดในการตรวจสอบหน้าเว็บ');
  }
}

function resetConnectionState(reasonText) {
  const previousActiveTabId = activeTabId;
  const previousRunId = currentRunId;
  if (previousActiveTabId !== null) {
    chrome.tabs.sendMessage(previousActiveTabId, { action: 'exitPostSelection' }, () => {
      void chrome.runtime.lastError;
    });
  }
  if (isScraping && scrapeTabId !== null) {
    chrome.tabs.sendMessage(scrapeTabId, { action: 'stopScrape', runId: previousRunId }, () => {
      void chrome.runtime.lastError;
    });
  }
  activeTabId = null;
  scrapeTabId = null;
  currentRunId = null;
  isScraping = false;
  hasSelectedPost = false;
  if (!isPreviewLocked) resetResults();
  pageStatusDot.className = 'status-dot';
  pageStatusText.textContent = reasonText;
  btnSelectPost.disabled = true;
  btnSelectPost.textContent = '🔍 เลือกโพสต์บนหน้า Facebook';
  btnSelectPost.className = 'btn btn-select';
  btnStart.disabled = true;
  btnStop.disabled = true;
  setOptionsDisabled(false);
  scrapingIndicator.textContent = 'พร้อมใช้งาน (ระบบ Side Panel)';
  scrapingIndicator.style.color = '';
  addLog(`ตัดการเชื่อมต่อ: ${reasonText}`);
}

// Toggle Post Selection Mode in content script
function togglePostSelection() {
  if (activeTabId === null) return;

  const targetTabId = activeTabId;
  const isSelecting = btnSelectPost.classList.contains('selecting');
  const action = isSelecting ? 'exitPostSelection' : 'enterPostSelection';
  chrome.tabs.sendMessage(targetTabId, { action }, (response) => {
    if (activeTabId !== targetTabId) return;
    if (chrome.runtime.lastError || !response || response.success !== true) {
      addLog(`[ผิดพลาด] เปิดโหมดเลือกโพสต์ไม่ได้: ${chrome.runtime.lastError?.message || response?.error || 'content script ไม่ตอบกลับ'}`);
      if (isSelecting) updateSelectingState(false);
      return;
    }
    updateSelectingState(!isSelecting);
  });
}

function updateSelectingState(isSelecting) {
  if (isSelecting) {
    btnSelectPost.textContent = '🛑 กำลังเลือก... (คลิกที่โพสต์)';
    btnSelectPost.className = 'btn btn-select selecting';
    pageStatusDot.className = 'status-dot selecting';
    pageStatusText.textContent = 'กรุณาคลิกเลือกโพสต์เป้าหมายบนหน้าเว็บ...';
    btnStart.setAttribute('disabled', 'true');
    addLog("กรุณาเลื่อนเมาส์ไปชี้และกดคลิกเลือกโพสต์ที่ต้องการบนหน้าเว็บ");
  } else {
    btnSelectPost.textContent = '🔍 เลือกโพสต์บนหน้า Facebook';
    btnSelectPost.className = 'btn btn-select';
    pageStatusDot.className = 'status-dot active';
    pageStatusText.textContent = 'เชื่อมต่อกับหน้า Facebook แล้ว';
    btnStart.disabled = !hasSelectedPost || isScraping;
  }
}

function updatePostSelectedState(hasSelected, text, totalComments = 0) {
  hasSelectedPost = hasSelected;
  if (hasSelected) {
    pageStatusDot.className = 'status-dot active';
    pageStatusText.textContent = text || 'เลือกโพสต์เรียบร้อย';
    btnStart.disabled = isScraping;
    totalCommentsCount = totalComments || 0;
    statTotal.textContent = totalCommentsCount;
  } else {
    pageStatusDot.className = 'status-dot active';
    pageStatusText.textContent = 'เชื่อมต่อกับหน้า Facebook แล้ว (ยังไม่ได้เลือกโพสต์)';
    btnStart.disabled = true;
    totalCommentsCount = 0;
    statTotal.textContent = '0';
  }
}

function restoreScrapingState(tabId, runId) {
  isScraping = true;
  scrapeTabId = tabId;
  currentRunId = runId;
  setPreviewLocked(false, false);
  scrapedComments = [];
  btnStart.disabled = true;
  btnStop.disabled = false;
  btnSelectPost.disabled = true;
  btnExportCsv.disabled = true;
  btnExportJson.disabled = true;
  setOptionsDisabled(true);
  scrapingIndicator.textContent = 'กำลังดึงข้อมูล...';
  scrapingIndicator.style.color = 'var(--warning)';
  showPreviewMessage('กำลังรอข้อมูลดิบจากสคริปต์หน้าเพจ...');
}

// Message Listener from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Verify message is from the active tab
  if (sender.tab && sender.tab.id !== activeTabId) return;
  if (message.action !== 'postSelected' && message.runId && message.runId !== currentRunId) return;

  switch (message.action) {
    case 'postSelected':
      updateSelectingState(false);
      updatePostSelectedState(true, message.message, message.totalComments);
      addLog(message.log || "ล็อกเป้าหมายโพสต์สำเร็จ!");
      if (message.isScraping && message.runId && sender.tab) {
        restoreScrapingState(sender.tab.id, message.runId);
      }
      break;
      
    case 'selectionCancelled':
      updateSelectingState(false);
      updatePostSelectedState(false);
      addLog("ยกเลิกการเลือกโพสต์");
      break;

    case 'log':
      addLog(message.message);
      break;
      
    case 'previewUpdate':
      scrapedComments = message.comments || [];
      updateLivePreview(scrapedComments);
      break;
      
    case 'scrapeComplete':
      scrapedComments = message.comments || [];
      updateLivePreview(scrapedComments);
      finishScrapingState('complete');
      addLog(`[เสร็จสิ้น] ดึงข้อมูลเสร็จสมบูรณ์! คอมเมนต์ทั้งหมด ${scrapedComments.length} รายการ`);
      break;
      
    case 'scrapeFailed':
      finishScrapingState('failed');
      addLog(`[ผิดพลาด] การดึงข้อมูลล้มเหลว: ${message.error}`);
      break;
  }
});

// Start scraping
function startScraping() {
  if (activeTabId === null || !hasSelectedPost || isScraping) return;

  const targetTabId = activeTabId;
  const runId = `${targetTabId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  isScraping = true;
  scrapeTabId = targetTabId;
  currentRunId = runId;
  setPreviewLocked(false, false);
  scrapedComments = [];
  
  // Update UI State
  btnStart.setAttribute('disabled', 'true');
  btnStop.removeAttribute('disabled');
  btnSelectPost.setAttribute('disabled', 'true');
  btnExportCsv.setAttribute('disabled', 'true');
  btnExportJson.setAttribute('disabled', 'true');
  
  setOptionsDisabled(true);

  scrapingIndicator.textContent = 'กำลังดึงข้อมูล...';
  scrapingIndicator.style.color = 'var(--warning)';
  
  showPreviewMessage('กำลังรอข้อมูลดิบจากสคริปต์หน้าเพจ...');

  // Send start scrape message to content script
  const options = getCurrentScrapeOptions();
  persistScrapeOptions();
  chrome.tabs.sendMessage(targetTabId, {
    action: 'startScrape',
    runId,
    options
  }, (response) => {
    if (currentRunId !== runId) return;
    if (chrome.runtime.lastError || !response || response.success !== true) {
      const error = chrome.runtime.lastError?.message || response?.error || 'content script ไม่ตอบกลับ';
      finishScrapingState('failed');
      if (response?.selectionInvalid) updatePostSelectedState(false);
      addLog(`[ผิดพลาด] เริ่มดึงข้อมูลไม่ได้: ${error}`);
    }
  });
}

// Stop scraping
function stopScraping() {
  if (scrapeTabId === null || !isScraping) return;
  chrome.tabs.sendMessage(scrapeTabId, { action: 'stopScrape', runId: currentRunId }, () => {
    if (chrome.runtime.lastError) {
      addLog(`[ผิดพลาด] ส่งคำสั่งหยุดไม่ได้: ${chrome.runtime.lastError.message}`);
      finishScrapingState('failed');
    }
  });
  addLog("ส่งคำสั่งหยุดการทำงาน... กำลังสรุปข้อมูลล่าสุด");
}

// Scrape finished UI reset
function finishScrapingState(outcome = 'complete') {
  isScraping = false;
  scrapeTabId = null;
  currentRunId = null;
  btnStart.disabled = !hasSelectedPost || activeTabId === null;
  btnStop.disabled = true;
  btnSelectPost.disabled = activeTabId === null;
  
  setOptionsDisabled(false);

  if (outcome === 'failed') {
    scrapingIndicator.textContent = 'ดึงข้อมูลล้มเหลว';
    scrapingIndicator.style.color = 'var(--danger)';
  } else {
    scrapingIndicator.textContent = 'ดึงข้อมูลเสร็จสิ้น';
    scrapingIndicator.style.color = 'var(--success)';
  }
  
  updateExportButtons();
  updatePreviewLockButton();
}

// Update Live Preview UI list and stats
function updateLivePreview(comments) {
  statComments.textContent = comments.length;
  const imageCount = comments.filter(c => !!c.imageUrl).length;
  statImages.textContent = imageCount;

  previewList.replaceChildren();
  
  if (comments.length === 0) {
    showPreviewMessage('ไม่มีข้อมูลดิบแสดงผล');
    updatePreviewLockButton();
    return;
  }

  const fragment = document.createDocumentFragment();
  comments.slice(0, MAX_PREVIEW_COMMENTS).forEach(comment => {
    const card = document.createElement('div');
    card.className = `comment-card ${comment.type === 'Reply' ? 'reply' : ''}`;

    const header = document.createElement('div');
    header.className = 'comment-card-header';

    const profileUrl = normalizeExternalUrl(comment.profileUrl);
    const avatar = document.createElement('img');
    avatar.className = 'comment-avatar';
    avatar.alt = 'avatar';
    avatar.loading = 'lazy';
    avatar.decoding = 'async';
    const defaultAvatar = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22%3E%3Crect width=%2224%22 height=%2224%22 fill=%22%23475569%22/%3E%3C/svg%3E';
    avatar.src = normalizeExternalUrl(comment.avatar) || defaultAvatar;

    const author = document.createElement('a');
    author.className = 'comment-author';
    author.textContent = comment.name || 'ไม่ทราบชื่อ';
    if (profileUrl) {
      author.href = profileUrl;
      author.target = '_blank';
      author.rel = 'noopener noreferrer';
    }

    const timestamp = document.createElement('span');
    timestamp.className = 'comment-time';
    timestamp.textContent = comment.timestamp || '';
    let avatarNode = avatar;
    if (profileUrl) {
      const avatarLink = document.createElement('a');
      avatarLink.className = 'comment-avatar-link';
      avatarLink.href = profileUrl;
      avatarLink.target = '_blank';
      avatarLink.rel = 'noopener noreferrer';
      avatarLink.title = `เปิดโปรไฟล์ ${comment.name || ''}`.trim();
      avatarLink.appendChild(avatar);
      avatarNode = avatarLink;
    }
    header.append(avatarNode, author, timestamp);

    const commentText = document.createElement('div');
    commentText.className = 'comment-text';
    commentText.textContent = comment.text || '';
    card.append(header, commentText);

    const imageUrl = normalizeExternalUrl(comment.imageUrl);
    if (imageUrl) {
      const attachment = document.createElement('img');
      attachment.className = 'comment-attachment';
      attachment.src = imageUrl;
      attachment.alt = 'ภาพแนบ';
      attachment.loading = 'lazy';
      attachment.decoding = 'async';
      attachment.title = 'เปิดหน้าต่างใหม่เพื่อดูรูปใหญ่';
      const photoUrl = normalizeExternalUrl(comment.photoUrl) || normalizeExternalUrl(comment.imageUrl);
      if (photoUrl) {
        const attachmentLink = document.createElement('a');
        attachmentLink.className = 'comment-attachment-link';
        attachmentLink.href = photoUrl;
        attachmentLink.target = '_blank';
        attachmentLink.rel = 'noopener noreferrer';
        attachmentLink.appendChild(attachment);
        card.appendChild(attachmentLink);
      } else {
        card.appendChild(attachment);
      }
    }

    fragment.appendChild(card);
  });
  if (comments.length > MAX_PREVIEW_COMMENTS) {
    const notice = document.createElement('div');
    notice.className = 'preview-empty';
    notice.textContent = `แสดงตัวอย่าง ${MAX_PREVIEW_COMMENTS} จาก ${comments.length} รายการ — ข้อมูลส่งออกยังครบทั้งหมด`;
    fragment.appendChild(notice);
  }
  previewList.appendChild(fragment);
  updatePreviewLockButton();
}

// Export CSV
function exportCsv() {
  if (scrapedComments.length === 0) return;

  const selectedFields = getSelectedExportFields();
  if (selectedFields.length === 0) {
    addLog('[ผิดพลาด] กรุณาเลือกหัวข้อข้อมูลอย่างน้อย 1 รายการ');
    return;
  }
  const { headers, rows } = buildCsvTable(scrapedComments, selectedFields);

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    let str = String(val);
    // Prevent spreadsheet applications from interpreting scraped text as a formula.
    if (/^(?:[=+\-@\t\r]|\s+[=+\-@])/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(escapeCsv).join(','))
  ].join('\r\n');

  // Excel UTF-8 BOM indicator (\uFEFF)
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `fb_comments_${dateStr}.csv`;

  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  }, (downloadId) => {
    if (chrome.runtime.lastError || downloadId === undefined) {
      addLog(`[ผิดพลาด] ส่งออก CSV ไม่สำเร็จ: ${chrome.runtime.lastError?.message || 'ไม่ทราบสาเหตุ'}`);
    } else {
      addLog(`ส่งออกข้อมูลเป็น CSV เรียบร้อย: ${filename}`);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}

// Export JSON
function exportJson() {
  if (scrapedComments.length === 0) return;

  const selectedFields = getSelectedExportFields();
  if (selectedFields.length === 0) {
    addLog('[ผิดพลาด] กรุณาเลือกหัวข้อข้อมูลอย่างน้อย 1 รายการ');
    return;
  }
  const jsonContent = JSON.stringify(buildJsonTree(scrapedComments, selectedFields), null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `fb_comments_${dateStr}.json`;

  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  }, (downloadId) => {
    if (chrome.runtime.lastError || downloadId === undefined) {
      addLog(`[ผิดพลาด] ส่งออก JSON ไม่สำเร็จ: ${chrome.runtime.lastError?.message || 'ไม่ทราบสาเหตุ'}`);
    } else {
      addLog(`ส่งออกข้อมูลเป็น JSON เรียบร้อย: ${filename}`);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}

// Clear Logs and Preview
function clearLog() {
  logMonitor.textContent = '';
  addLog("ล้างบันทึกการทำงานเรียบร้อย");
  
  // Clear preview and scraped data
  setPreviewLocked(false, false);
  resetResults();
}
