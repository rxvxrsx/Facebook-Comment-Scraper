// content.js - Pure Web Worker Content Script for Facebook Comment Scraper (Side Panel Mode)

(function() {
  // Prevent duplicate injection
  if (window.hasOwnProperty('__fbCommentScraperInjected')) {
    console.log("FB Comment Scraper worker already active.");
    return;
  }
  window.__fbCommentScraperInjected = true;

  // State variables
  let selectedPostElement = null;
  let isSelectingPost = false;
  let isScraping = false;
  let shouldStopScraping = false;
  let clickedButtons = new Set();
  let lastHoveredElement = null;
  let scrapedComments = [];
  let shouldAutoStart = false;

  // Logger helper: dispatches log to side panel
  function sendLog(message) {
    try {
      chrome.runtime.sendMessage({ action: 'log', message: message });
    } catch (e) {
      // Side Panel might be closed
      console.log(`[Log] ${message}`);
    }
  }

  // Preview helper: dispatches live preview comments list to side panel
  function sendPreviewUpdate() {
    try {
      chrome.runtime.sendMessage({ action: 'previewUpdate', comments: scrapedComments });
    } catch (e) {
      console.log("Failed to send live preview update to Side Panel.");
    }
  }

  // Check and auto-detect post if on single post pages
  function autoDetectPost() {
    const url = window.location.href;
    const isSinglePostUrl = url.includes('/posts/') || url.includes('/permalink.php') || url.includes('/photos/') || url.includes('/videos/');
    
    if (isSinglePostUrl) {
      const articles = Array.from(document.querySelectorAll('[role="article"]'));
      if (articles.length > 0) {
        articles.sort((a, b) => b.innerHTML.length - a.innerHTML.length);
        const mainArticle = articles[0];
        
        // Highlight post
        if (selectedPostElement) selectedPostElement.style.outline = '';
        selectedPostElement = mainArticle;
        selectedPostElement.style.outline = '3px solid #10b981';
        selectedPostElement.style.outlineOffset = '4px';
        selectedPostElement.style.borderRadius = '8px';
        
        sendLog("ระบบอัตโนมัติ: ตรวจพบหน้าเฉพาะโพสต์ ทำการเลือกโพสต์นี้ให้ทันที!");
        return true;
      }
    }
    return false;
  }

  // Listen for messages from the Side Panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'checkSelectedStatus':
        // Try auto detect if nothing selected yet
        if (!selectedPostElement) {
          autoDetectPost();
        }
        sendResponse({ 
          hasSelected: !!selectedPostElement, 
          message: selectedPostElement ? 'เลือกโพสต์เรียบร้อย (ตรวจพบอัตโนมัติ)' : 'ยังไม่ได้เลือกโพสต์',
          autoStart: shouldAutoStart
        });
        shouldAutoStart = false;
        break;

      case 'enterPostSelection':
        enterPostSelectionMode();
        sendResponse({ success: true });
        break;

      case 'exitPostSelection':
        exitPostSelectionMode();
        sendResponse({ success: true });
        break;

      case 'startScrape':
        if (!selectedPostElement) {
          chrome.runtime.sendMessage({ action: 'scrapeFailed', error: 'ยังไม่ได้เลือกโพสต์เป้าหมาย' });
          return;
        }
        // Run scraping asynchronously to let background listener return immediately
        setTimeout(() => startScrapingWorkflow(message.options), 50);
        sendResponse({ success: true });
        break;

      case 'stopScrape':
        shouldStopScraping = true;
        sendLog("ผู้ใช้สั่งหยุดการทำงาน... กำลังสรุปข้อมูลล่าสุด");
        sendResponse({ success: true });
        break;
    }
  });

  // Post Selection Handlers
  function enterPostSelectionMode() {
    isSelectingPost = true;
    sendLog("เข้าสู่โหมดเลือกโพสต์: กรุณาคลิกเลือกโพสต์เป้าหมายบนหน้าเว็บ");
    document.addEventListener('mouseover', handlePostHover, true);
    document.addEventListener('click', handlePostClick, true);
  }

  function exitPostSelectionMode() {
    isSelectingPost = false;
    document.removeEventListener('mouseover', handlePostHover, true);
    document.removeEventListener('click', handlePostClick, true);
    
    if (lastHoveredElement) {
      lastHoveredElement.style.outline = '';
      lastHoveredElement.style.outlineOffset = '';
      lastHoveredElement = null;
    }
  }

  function handlePostHover(e) {
    if (!isSelectingPost) return;
    const postContainer = e.target.closest('[role="article"]');
    if (postContainer) {
      if (lastHoveredElement && lastHoveredElement !== postContainer) {
        lastHoveredElement.style.outline = '';
        lastHoveredElement.style.outlineOffset = '';
      }
      lastHoveredElement = postContainer;
      postContainer.style.outline = '3px solid #ef4444';
      postContainer.style.outlineOffset = '4px';
      postContainer.style.borderRadius = '8px';
    } else {
      if (lastHoveredElement) {
        lastHoveredElement.style.outline = '';
        lastHoveredElement.style.outlineOffset = '';
        lastHoveredElement = null;
      }
    }
  }

  function handlePostClick(e) {
    if (!isSelectingPost) return;
    e.preventDefault();
    e.stopPropagation();

    const postContainer = e.target.closest('[role="article"]');
    if (postContainer) {
      if (selectedPostElement) {
        selectedPostElement.style.outline = '';
        selectedPostElement.style.outlineOffset = '';
      }
      selectedPostElement = postContainer;
      selectedPostElement.style.outline = '3px solid #10b981';
      selectedPostElement.style.outlineOffset = '4px';
      selectedPostElement.style.borderRadius = '8px';

      chrome.runtime.sendMessage({ 
        action: 'postSelected', 
        message: 'เลือกโพสต์เรียบร้อย', 
        log: 'เลือกโพสต์เป้าหมายบนหน้าจอสแกนสำเร็จ!',
        totalComments: getTotalCommentsCount(selectedPostElement)
      });
      exitPostSelectionMode();
    }
  }

  // Inject "Scrape" shortcut button directly on top of each Facebook post container
  function injectScrapeButtons() {
    const articles = Array.from(document.querySelectorAll('[role="article"]'));
    const topLevelPosts = articles.filter(art => {
      if (art.parentElement.closest('[role="article"]')) return false;
      
      // Prevent injecting buttons in Messenger chat windows, sidebars, or message bubbles
      const rect = art.getBoundingClientRect();
      const isChat = art.closest('[role="complementary"]') || 
                     art.closest('[aria-label="Chats"]') || 
                     art.closest('[aria-label="แชท"]') ||
                     art.closest('[role="grid"]') || 
                     rect.width < 400; // Facebook posts are always >= 500px wide, chats are narrower
      
      return !isChat;
    });
    
    topLevelPosts.forEach(post => {
      if (post.dataset.hasScrapeButton === 'true' || post.querySelector('.fb-scraper-inline-btn')) return;
      
      const btn = document.createElement('div');
      btn.className = 'fb-scraper-inline-btn';
      btn.innerText = '📊 ดึงความเห็น';
      
      btn.style.position = 'absolute';
      btn.style.top = '12px';
      btn.style.right = '60px'; // Offset to avoid blocking the three-dots menu
      btn.style.background = 'linear-gradient(135deg, #4f46e5, #06b6d4)';
      btn.style.color = '#ffffff';
      btn.style.padding = '4px 10px';
      btn.style.borderRadius = '12px';
      btn.style.fontSize = '11px';
      btn.style.fontWeight = 'bold';
      btn.style.cursor = 'pointer';
      btn.style.zIndex = '999';
      btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
      btn.style.transition = 'all 0.2s ease-in-out';
      btn.style.userSelect = 'none';
      
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'scale(1.05)';
        btn.style.background = 'linear-gradient(135deg, #4338ca, #0891b2)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'scale(1)';
        btn.style.background = 'linear-gradient(135deg, #4f46e5, #06b6d4)';
      });
      
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (selectedPostElement) {
          selectedPostElement.style.outline = '';
          selectedPostElement.style.outlineOffset = '';
        }
        
        selectedPostElement = post;
        selectedPostElement.style.outline = '3px solid #10b981';
        selectedPostElement.style.outlineOffset = '4px';
        selectedPostElement.style.borderRadius = '8px';
        
        shouldAutoStart = true;

        // Open Side Panel programmatically
        chrome.runtime.sendMessage({ action: 'openSidePanel' });
        
        // Notify Side Panel (in case it is already open)
        chrome.runtime.sendMessage({ 
          action: 'postSelected', 
          message: 'เลือกโพสต์เรียบร้อย (จากปุ่มดึงความเห็น)', 
          log: "เลือกโพสต์เป้าหมายผ่านปุ่มลัด 'ดึงความเห็น' บนโพสต์เรียบร้อย!",
          autoStart: true,
          totalComments: getTotalCommentsCount(selectedPostElement)
        });

        selectedPostElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      
      const style = window.getComputedStyle(post);
      if (style.position === 'static') {
        post.style.position = 'relative';
      }
      
      post.appendChild(btn);
      post.dataset.hasScrapeButton = 'true';
    });
  }

  // Periodic scan to inject buttons dynamically
  setInterval(injectScrapeButtons, 2000);
  setTimeout(injectScrapeButtons, 1000);

  // Helper sleep
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Helper to find the correct search root for comments (expands scope to dialog/modal if present)
  function getCommentsSearchRoot(selectedPost) {
    if (!selectedPost) return null;
    
    // Case 1: In a dialog/modal (lightbox, overlay, popup)
    const dialog = selectedPost.closest('[role="dialog"], [role="presentation"], [aria-label*="โพสต์"], [aria-label*="Post"]');
    if (dialog) {
      sendLog("ตรวจพบหน้าต่าง Pop-up (Dialog): จะค้นหาความคิดเห็นในกรอบหน้าต่างนี้");
      return dialog;
    }
    
    // Case 2: Sibling comments. We search up to the closest container
    // that wraps both the post and its comments, but without spanning to other posts.
    let current = selectedPost;
    while (current && current.parentElement && current.tagName !== 'BODY') {
      const parent = current.parentElement;
      
      // If the parent contains sibling posts (which have the scrape button), stop going up
      const siblingPosts = Array.from(parent.children).filter(child => 
        child !== current && 
        (child.querySelector('.fb-scraper-inline-btn') || child.classList.contains('fb-scraper-inline-btn'))
      );
      
      if (siblingPosts.length > 0) {
        break;
      }
      
      // If parent wraps comments (has reply buttons), use it
      const hasReplies = parent.querySelector('[role="article"]') && Array.from(parent.querySelectorAll('span, div, a')).some(el => {
        const t = el.innerText ? el.innerText.trim() : '';
        return t === 'Reply' || t === 'ตอบกลับ';
      });
      
      if (hasReplies) {
        return parent;
      }
      
      current = parent;
    }
    
    return selectedPost;
  }

  // Helper to clean Facebook photo URL and remove tracking parameters
  function cleanFacebookPhotoUrl(urlStr) {
    if (!urlStr) return '';
    try {
      const url = new URL(urlStr, window.location.origin);
      if (url.pathname.includes('/photo.php') || url.pathname.includes('/photo')) {
        const fbid = url.searchParams.get('fbid');
        const set = url.searchParams.get('set');
        if (fbid) {
          const cleanUrl = new URL('/photo.php', window.location.origin);
          cleanUrl.searchParams.set('fbid', fbid);
          if (set) {
            cleanUrl.searchParams.set('set', set);
          } else {
            cleanUrl.searchParams.set('set', `p.${fbid}`);
          }
          cleanUrl.searchParams.set('type', '3');
          return cleanUrl.href;
        }
      }
      return url.href;
    } catch (e) {
      return urlStr;
    }
  }

  // Fallback helper to extract text directly from the comment bubble by subtracting the author's name
  function getCommentTextFromBubble(nameLink, name) {
    if (!nameLink || !name) return '';
    try {
      let current = nameLink.parentElement;
      let bestBubble = current;
      
      while (current && current.tagName !== 'BODY') {
        const hasActions = Array.from(current.querySelectorAll('a, span[role="button"]')).some(subEl => {
          if (subEl === nameLink || nameLink.contains(subEl)) return false;
          const t = subEl.innerText ? subEl.innerText.trim() : '';
          const href = subEl.getAttribute('href') || '';
          return t === 'Reply' || t === 'ตอบกลับ' || t === 'Like' || t === 'ถูกใจ' || href.includes('comment_id=');
        });
        
        if (hasActions) {
          break;
        }
        
        bestBubble = current;
        current = current.parentElement;
      }
      
      if (bestBubble) {
        const bubbleText = bestBubble.innerText ? bestBubble.innerText.trim() : '';
        const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp('^' + escapedName + '\\s*', 'i');
        const resultText = bubbleText.replace(regex, '').trim();
        if (isActionOrTimestampText(resultText)) {
          return '';
        }
        return resultText;
      }
    } catch (e) {
      console.error("Error in getCommentTextFromBubble:", e);
    }
    return '';
  }

  // Helper to check if a string is a timestamp or a generic action button text
  function isActionOrTimestampText(t) {
    if (!t) return false;
    const clean = t.trim();
    
    // Check if it matches Facebook timestamp pattern
    const isTime = /^[0-9]+[mhdw]/i.test(clean) || 
                   /^[0-9]+\s*(นาที|ชม\.|ชั่วโมง|วัน|สัปดาห์)/.test(clean) || 
                   clean.includes('นาที') || clean.includes('ชม.') || clean.includes('วัน') || clean.includes('สัปดาห์') ||
                   clean.includes('just now') || clean.includes('เมื่อสักครู่') ||
                   clean.includes('Yesterday') || clean.includes('เมื่อวาน') ||
                   (clean.length > 0 && !isNaN(clean.charAt(0)) && (clean.includes(':') || clean.includes('/') || clean.includes('at')));
                   
    if (isTime) return true;
    
    // Check if it is a common action button text
    const isAction = /^(Reply|ตอบกลับ|Like|ถูกใจ|Edit|แก้ไข|Delete|ลบ|Share|แชร์|Translate|แปล|ดูคำแปล|แปลภาษา|See translation)$/i.test(clean);
    return isAction;
  }

  // Helper to check if two Facebook links refer to the same profile
  function isSameProfileLink(url1, url2) {
    if (!url1 || !url2) return false;
    try {
      const u1 = new URL(url1, window.location.origin);
      const u2 = new URL(url2, window.location.origin);
      
      if (u1.pathname.includes('profile.php') && u2.pathname.includes('profile.php')) {
        return u1.searchParams.get('id') === u2.searchParams.get('id');
      }
      
      const getUserIdFromGroupPath = (path) => {
        const parts = path.split('/').filter(Boolean);
        const userIdx = parts.indexOf('user');
        if (userIdx !== -1 && userIdx + 1 < parts.length) {
          return parts[userIdx + 1];
        }
        return null;
      };
      
      const g1 = getUserIdFromGroupPath(u1.pathname);
      const g2 = getUserIdFromGroupPath(u2.pathname);
      if (g1 && g2) {
        return g1 === g2;
      }
      
      const p1 = u1.pathname.split('/').filter(Boolean)[0] || '';
      const p2 = u2.pathname.split('/').filter(Boolean)[0] || '';
      return p1 && p1 === p2;
    } catch (e) {
      const clean1 = url1.split('?')[0].split('#')[0];
      const clean2 = url2.split('?')[0].split('#')[0];
      return clean1 === clean2;
    }
  }

  // Helper to recursively check if element or its children are bold
  function isBoldElement(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const weight = style.fontWeight;
    if (weight === 'bold' || weight === 'bolder' || parseInt(weight) >= 500) {
      return true;
    }
    for (const child of el.children) {
      if (isBoldElement(child)) return true;
    }
    return false;
  }

  // Helper to check if an anchor is a Facebook profile link
  function isFacebookProfileLink(a) {
    const href = a.getAttribute('href') || '';
    if (!href) return false;
    
    const text = a.innerText ? a.innerText.trim() : '';
    if (!text || text.length > 50) return false;
    
    if (href.includes('/posts/') || 
        (href.includes('/groups/') && !href.includes('/user/')) || 
        href.includes('/photo') || 
        href.includes('/permalink') || 
        href.includes('/videos/') ||
        href.includes('/sharer.php') ||
        href.includes('/ads/') ||
        href.includes('/pages/') ||
        href.includes('/events/')) {
      return false;
    }
    
    try {
      const url = new URL(href, window.location.origin);
      const path = url.pathname;
      
      const isProfile = path.includes('/user/') || 
                        path.includes('profile.php') || 
                        path.includes('/people/') ||
                        (path.startsWith('/') && path.substring(1).split('/').filter(Boolean).length === 1);
      
      return isProfile;
    } catch (e) {
      return false;
    }
  }

  // Helper to extract total comments count as reported by Facebook
  function getTotalCommentsCount(postElement) {
    if (!postElement) return 0;
    
    const elements = Array.from(postElement.querySelectorAll('span, a, div'));
    for (const el of elements) {
      const text = el.innerText ? el.innerText.trim() : '';
      if (!text) continue;
      
      const match = text.match(/^([\d.,]+[Kk]?)\s*(ความคิดเห็น|ความเห็น|comments|comment|รายการ)/i);
      if (match) {
        let numStr = match[1].replace(/,/g, '');
        if (numStr.toLowerCase().includes('k')) {
          return Math.round(parseFloat(numStr) * 1000);
        }
        return parseInt(numStr) || 0;
      }
    }
    
    for (const el of elements) {
      const text = el.innerText ? el.innerText.trim() : '';
      if (/^\d+$/.test(text) && text.length < 6) {
        const parentText = el.parentElement ? el.parentElement.innerText : '';
        if (parentText.includes('ความคิดเห็น') || parentText.includes('comments')) {
          return parseInt(text) || 0;
        }
      }
    }
    
    return 0;
  }

  // Helper to switch comment filter dropdown to "All Comments"
  async function switchToAllComments(searchRoot) {
    sendLog("กำลังตรวจสอบตัวกรองความคิดเห็น...");
    
    // Find the dropdown button
    const buttons = Array.from(searchRoot.querySelectorAll('[role="button"], span, div, a'));
    const filterBtn = buttons.find(el => {
      const t = el.innerText ? el.innerText.trim() : '';
      const rect = el.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      return isVisible && /Most relevant|เกี่ยวข้องมากที่สุด|Top comments/i.test(t);
    });
    
    if (!filterBtn) {
      sendLog("ตัวกรองความคิดเห็นตั้งค่าเป็นความคิดเห็นทั้งหมดแล้ว หรือไม่พบปุ่มควบคุมตัวกรอง");
      return;
    }
    
    sendLog(`พบตัวกรองปัจจุบัน: "${filterBtn.innerText.trim()}" - กำลังสลับเป็น "ความคิดเห็นทั้งหมด" เพื่อดึงข้อมูลครบถ้วน...`);
    filterBtn.click();
    await sleep(1500); // Wait for dropdown menu to appear
    
    // Look for "All comments" or "ความคิดเห็นทั้งหมด" option
    const menuOptions = Array.from(document.querySelectorAll('[role="menuitem"], [role="checkbox"], span, div, a'));
    const allCommentsOpt = menuOptions.find(el => {
      const t = el.innerText ? el.innerText.trim() : '';
      const rect = el.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      return isVisible && /All comments|ความคิดเห็นทั้งหมด/i.test(t);
    });
    
    if (allCommentsOpt) {
      sendLog(`คลิกเลือก: "${allCommentsOpt.innerText.trim()}"`);
      allCommentsOpt.click();
      await sleep(3000); // Wait for Facebook to reload the comments list
    } else {
      sendLog("ไม่พบตัวเลือก 'ความคิดเห็นทั้งหมด' ในเมนู");
    }
  }

  // Open comments section if collapsed
  async function openCommentsSection(postElement, searchRoot) {
    // Check if comments section is already visible in searchRoot (contains any reply button)
    const hasRepliesVisible = Array.from(searchRoot.querySelectorAll('span, div, a')).some(el => {
      const t = el.innerText ? el.innerText.trim() : '';
      return t === 'Reply' || t === 'ตอบกลับ';
    });
    
    if (hasRepliesVisible) {
      sendLog("ส่วนความคิดเห็นเปิดอยู่แล้ว ดำเนินการต่อ...");
      return;
    }
    
    sendLog("พบว่ายังไม่ได้เปิดส่วนแสดงความคิดเห็น กำลังส่งคำสั่งเปิด...");
    
    // Find the Comment action button (looks for aria-label or text matching "Comment" / "แสดงความคิดเห็น")
    const commentBtn = Array.from(postElement.querySelectorAll('[role="button"], a, span, div')).find(el => {
      const text = el.innerText ? el.innerText.trim() : '';
      const label = el.getAttribute('aria-label') || '';
      const isCommentBtn = text === 'Comment' || text === 'แสดงความคิดเห็น' || text === 'แสดงความเห็น' ||
                           label.includes('Comment') || label.includes('แสดงความคิดเห็น') || label.includes('แสดงความเห็น');
      const rect = el.getBoundingClientRect();
      return isCommentBtn && rect.width > 0 && rect.height > 0;
    });

    if (commentBtn) {
      sendLog(`คลิกปุ่ม: "${commentBtn.innerText ? commentBtn.innerText.trim() : 'แสดงความคิดเห็น'}"`);
      commentBtn.click();
      await sleep(3000); // Wait for comments container to load/render
    } else {
      sendLog("ไม่พบปุ่มเปิดส่วนความคิดเห็นแบบมาตรฐาน จะลองคลิกสุ่มองค์ประกอบหรือโหลดคอมเมนต์ตรง...");
    }
  }

  // Helper to scroll comments container to the bottom to trigger lazy loading
  function scrollCommentsToBottom(searchRoot) {
    if (!searchRoot) return;
    
    const dialog = searchRoot.getAttribute('role') === 'dialog' ? searchRoot : searchRoot.closest('[role="dialog"], [role="presentation"]');
    
    if (dialog) {
      const divs = Array.from(dialog.querySelectorAll('div'));
      const scrollables = divs.filter(el => {
        const style = window.getComputedStyle(el);
        return style.overflowY === 'auto' || style.overflowY === 'scroll';
      });
      if (scrollables.length > 0) {
        scrollables.forEach(el => {
          el.scrollTop = el.scrollHeight;
        });
        return;
      }
    }
    
    window.scrollTo(0, document.body.scrollHeight);
    if (searchRoot.scrollTo) {
      searchRoot.scrollTo(0, searchRoot.scrollHeight);
    }
  }

  // Expand threads click simulator loop
  async function runExpandCommentsLoop(searchRoot, options) {
    const delay = options.delay || 2;
    const isExpandReplies = options.expandReplies;
    
    sendLog(`เริ่มกระบวนการขยายคอมเมนต์... (หน่วงเวลาคลิก ${delay} วินาที)`);
    
    let cycles = 0;
    let noNewDataAttempts = 0;
    let lastCommentsCount = 0;
    
    while (!shouldStopScraping) {
      cycles++;
      
      if (cycles > 80) {
        sendLog("ขยายความเห็นเกิน 80 รอบ หยุดทำงานอัตโนมัติป้องกันเบราว์เซอร์ค้าง");
        break;
      }

      // Scroll comments section to bottom to trigger infinite scroll or reveal lazy buttons
      scrollCommentsToBottom(searchRoot);
      await sleep(1500); // Wait for potential infinite scroll request to complete

      // Count current comments in DOM (using profile links count)
      const currentLinks = Array.from(searchRoot.querySelectorAll('a'));
      const profileLinks = currentLinks.filter(a => isFacebookProfileLink(a) && isBoldElement(a));
      const currentCommentsCount = profileLinks.length;

      const elements = Array.from(searchRoot.querySelectorAll('[role="button"], span, div, a'));
      const expandButtons = elements.filter(el => {
        if (clickedButtons.has(el) || el.dataset.scraperClicked === 'true') return false;
        
        const text = el.innerText ? el.innerText.trim() : '';
        if (!text || text.length > 100) return false;
        
        const isCommentExpand = text.includes('View more comments') || 
                                text.includes('View previous comments') ||
                                text.includes('ดูความคิดเห็นเพิ่มเติม') ||
                                text.includes('ดูความคิดเห็นก่อนหน้า');
                                
        const isReplyExpand = isExpandReplies && (
          text.toLowerCase().includes('view reply') ||
          text.toLowerCase().includes('view replies') ||
          text.toLowerCase().includes('view previous replies') ||
          text.includes('ดูการตอบกลับ') || 
          text.includes('ดูการตอบกลับเพิ่มเติม') ||
          /(reply|replies|ตอบกลับ).*?\d+|\d+.*?(reply|replies|ตอบกลับ)/i.test(text)
        );
        
        const isCollapse = text.includes('Hide') || text.includes('ซ่อน') || text.includes('ซ่อนการตอบกลับ');
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        return (isCommentExpand || isReplyExpand) && !isCollapse && isVisible;
      });

      // Check if we loaded new data (comments count increased or we have buttons to click)
      const foundNewData = currentCommentsCount > lastCommentsCount || expandButtons.length > 0;
      
      if (foundNewData) {
        lastCommentsCount = currentCommentsCount;
        noNewDataAttempts = 0; // Reset consecutive static attempts
      } else {
        noNewDataAttempts++;
        if (noNewDataAttempts >= 4) { // Try up to 4 scrolls with no changes
          sendLog(`ขยายความคิดเห็นเสร็จสิ้น (พบความเห็นทั้งหมด ${currentCommentsCount} รายการ และไม่พบข้อมูลเพิ่มเติมหลังเลื่อนจอติดต่อกัน)`);
          break;
        }
        sendLog(`ยังไม่พบข้อมูลใหม่ในรอบนี้ (พยายามเลื่อนจอซ้ำครั้งที่ ${noNewDataAttempts}/4)...`);
        await sleep(1500);
        continue;
      }

      if (expandButtons.length > 0) {
        sendLog(`พบปุ่มกดขยายคอมเมนต์ ${expandButtons.length} ปุ่มในรอบที่ ${cycles} (ความเห็นในหน้าจอขณะนี้: ${currentCommentsCount} รายการ)`);
        
        for (const btn of expandButtons) {
          if (shouldStopScraping) break;

          btn.click();
          clickedButtons.add(btn);
          btn.dataset.scraperClicked = 'true';
          
          btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sendLog(`คลิกขยาย: "${btn.innerText.trim()}"`);
          await sleep(delay * 1000);
        }
      }
    }
  }

  // Find comment body container ancestor
  function findCommentBodyContainer(nameLink, root) {
    let current = nameLink;
    while (current && current !== root && current.tagName !== 'BODY') {
      const hasReplyButton = Array.from(current.querySelectorAll('span, div, a')).some(el => {
        const text = el.innerText ? el.innerText.trim() : '';
        return text === 'Reply' || text === 'ตอบกลับ';
      });
      if (hasReplyButton) {
        return current;
      }
      current = current.parentElement;
    }
    return nameLink.parentElement;
  }

  // Run Scraper Engine Core logic
  async function startScrapingWorkflow(options) {
    isScraping = true;
    shouldStopScraping = false;
    scrapedComments = [];
    clickedButtons.clear();

    sendLog("=== เริ่มดึงข้อมูลคอมเมนต์ ===");

    try {
      const searchRoot = getCommentsSearchRoot(selectedPostElement);

      // Step 1: Open comments section if collapsed
      await openCommentsSection(selectedPostElement, searchRoot);

      // Step 1.5: Switch comment filter to "All Comments"
      await switchToAllComments(searchRoot);

      // Step 2: Expand threads
      await runExpandCommentsLoop(searchRoot, options);
      
      // Step 3: Parse DOM
      parsePostComments(searchRoot, options);

      // Step 3: Complete callback
      chrome.runtime.sendMessage({ action: 'scrapeComplete', comments: scrapedComments });

    } catch (e) {
      console.error(e);
      sendLog(`[ข้อผิดพลาด] การดึงข้อมูลติดขัด: ${e.message}`);
      chrome.runtime.sendMessage({ action: 'scrapeFailed', error: e.message });
    } finally {
      isScraping = false;
    }
  }

  // Parse comments in DOM
  function parsePostComments(searchRoot, options) {
    if (!searchRoot) return;

    sendLog("กำลังวิเคราะห์คอมเมนต์บนหน้าจอโครงสร้างเว็บ...");

    // Find all bold profile links in the post container
    const allLinks = Array.from(searchRoot.querySelectorAll('a'));
    const profileLinks = allLinks.filter(a => isFacebookProfileLink(a) && isBoldElement(a));
    
    sendLog(`พบลิงก์ HTML ทั้งหมด ${allLinks.length} รายการ (เป็นลิงก์ profile ตัวหนา ${profileLinks.length} รายการ)`);

    // The first bold profile link is always the post author's profile link in the header container.
    // We isolate and exclude this specific DOM node, which avoids matching the header but still
    // allows the author's own comments (rendered as separate DOM nodes in the comments section).
    const authorNode = profileLinks.length > 0 ? profileLinks[0] : null;
    const nameLinks = profileLinks.filter(a => a !== authorNode);

    sendLog(`พบคอมเมนต์ที่มีสิทธิ์ดึงข้อมูลทั้งหมด ${nameLinks.length} รายการ`);

    const limit = options.limit || 0;
    const includeImages = options.includeImages;
    
    const parsedData = [];
    const processedKeys = new Set();
    let baseLeftOffset = null;

    for (const nameLink of nameLinks) {
      try {
        const name = nameLink.innerText.trim();
        const profileUrl = new URL(nameLink.getAttribute('href'), window.location.origin).href;
        
        const bodyContainer = findCommentBodyContainer(nameLink, searchRoot);
        if (!bodyContainer) continue;

        // Text Content
        let text = '';
        
        // Find all divs, spans, or elements with dir="auto" inside bodyContainer
        const candidates = Array.from(bodyContainer.querySelectorAll('div, span, [dir="auto"]'));
        
        // Filter elements to find potential comment text containers
        const textCandidates = candidates.filter(el => {
          // 1. Must not contain the name link or name text
          if (el.contains(nameLink) || el === nameLink) return false;
          
          // 2. Must not be or contain action links (Like, Reply, timestamp, etc.)
          const hasActionLinks = Array.from(el.querySelectorAll('a, span[role="button"]')).some(subEl => {
            const t = subEl.innerText ? subEl.innerText.trim() : '';
            const href = subEl.getAttribute('href') || '';
            return t === 'Reply' || t === 'ตอบกลับ' || t === 'Like' || t === 'ถูกใจ' || href.includes('comment_id=');
          });
          if (hasActionLinks) return false;
          
          const t = el.innerText ? el.innerText.trim() : '';
          // 3. Must not be empty or equal to name or actions
          if (!t || t === name || t === 'Reply' || t === 'ตอบกลับ' || t === 'Like' || t === 'ถูกใจ') return false;
          
          return true;
        });

        // Pick the best candidate (longest dir="auto", or longest overall text candidate)
        const dirAutoCandidates = textCandidates.filter(el => el.getAttribute('dir') === 'auto');
        let bestCandidate = null;
        if (dirAutoCandidates.length > 0) {
          bestCandidate = dirAutoCandidates.sort((a, b) => b.innerText.length - a.innerText.length)[0];
        } else if (textCandidates.length > 0) {
          bestCandidate = textCandidates.sort((a, b) => b.innerText.length - a.innerText.length)[0];
        }
        
        if (bestCandidate) {
          text = bestCandidate.innerText.trim();
        }
        
        // Double Backup Fallback: If text is still empty, extract directly from the bubble by subtracting the author's name
        if (!text) {
          text = getCommentTextFromBubble(nameLink, name);
        }

        // Final sanitation check: If text is a timestamp/action button (e.g. false positive), leave it empty
        if (text) {
          if (isActionOrTimestampText(text)) {
            text = '';
          }
        }

        // Image Attachment
        let imageUrl = null;
        let photoUrl = null;
        if (includeImages) {
          const imgs = Array.from(bodyContainer.querySelectorAll('img'));
          for (const img of imgs) {
            const rect = img.getBoundingClientRect();
            const width = rect.width || img.width || img.naturalWidth;
            
            const parentLink = img.closest('a');
            const href = parentLink ? parentLink.getAttribute('href') || '' : '';
            const isPhotoLink = href.includes('/photo') || href.includes('/photos') || href.includes('fbid=') || href.includes('/permalink');
            
            const src = img.getAttribute('src') || '';
            const isAvatar = src.includes('profile') || width <= 40;
            const isSticker = src.includes('/stickers/') || src.includes('/emoji/') || src.includes('emoji.php');

            if ((isPhotoLink || width > 45) && !isAvatar && !isSticker && src) {
              imageUrl = src;
              if (href) {
                try {
                  const absoluteUrl = new URL(href, window.location.origin).href;
                  photoUrl = cleanFacebookPhotoUrl(absoluteUrl);
                } catch (e) {
                  photoUrl = href;
                }
              }
              break;
            }
          }
        }

        // Timestamp
        let timestamp = '';
        const links = Array.from(bodyContainer.querySelectorAll('a'));
        for (const link of links) {
          const t = link.innerText ? link.innerText.trim() : '';
          const href = link.getAttribute('href') || '';
          
          const isTimeText = /^[0-9]+[mhdw]/i.test(t) || 
                             /^[0-9]+\s*(นาที|ชม\.|ชั่วโมง|วัน|สัปดาห์)/.test(t) || 
                             t.includes('นาที') || t.includes('ชม.') || t.includes('วัน') || t.includes('สัปดาห์') ||
                             t.includes('just now') || t.includes('เมื่อสักครู่') ||
                             t.includes('Yesterday') || t.includes('เมื่อวาน') ||
                             (t.length > 0 && !isNaN(t.charAt(0)) && (t.includes(':') || t.includes('/') || t.includes('at')));
          
          if (isTimeText || href.includes('comment_id=')) {
            timestamp = t;
            break;
          }
        }

        // Profile Avatar
        let avatar = '';
        const parentRow = bodyContainer.parentElement;
        const targetHref = nameLink.getAttribute('href');
        
        if (targetHref) {
          // 1. Search inside parentRow first (semantic matching using img and SVG image)
          if (parentRow) {
            const links = Array.from(parentRow.querySelectorAll('a'));
            const avatarLink = links.find(l => {
              const href = l.getAttribute('href') || '';
              return href && isSameProfileLink(targetHref, href) && l.querySelector('img, image');
            });
            if (avatarLink) {
              const img = avatarLink.querySelector('img, image');
              avatar = img.getAttribute('xlink:href') || img.getAttribute('href') || img.src || img.getAttribute('src') || img.getAttribute('data-src') || '';
            }
          }
          
          // 2. Fallback: Search inside the entire searchRoot for a profile link containing an img/image
          if (!avatar && searchRoot) {
            const links = Array.from(searchRoot.querySelectorAll('a'));
            const avatarLink = links.find(l => {
              const href = l.getAttribute('href') || '';
              return href && isSameProfileLink(targetHref, href) && l.querySelector('img, image');
            });
            if (avatarLink) {
              const img = avatarLink.querySelector('img, image');
              avatar = img.getAttribute('xlink:href') || img.getAttribute('href') || img.src || img.getAttribute('src') || img.getAttribute('data-src') || '';
            }
          }
        }
        
        // 3. Fallback: Find any small image or SVG-image in the parentRow
        if (!avatar && parentRow) {
          const allImgs = Array.from(parentRow.querySelectorAll('img, image'));
          const avatarImg = allImgs.find(img => {
            const src = img.getAttribute('xlink:href') || img.getAttribute('href') || img.src || img.getAttribute('src') || img.getAttribute('data-src') || '';
            const rect = img.getBoundingClientRect();
            const width = rect.width || img.width || img.naturalWidth;
            return src !== imageUrl && (width <= 50 || src.includes('scontent') || src.includes('profile') || src.startsWith('http'));
          });
          if (avatarImg) {
            avatar = avatarImg.getAttribute('xlink:href') || avatarImg.getAttribute('href') || avatarImg.src || avatarImg.getAttribute('src') || avatarImg.getAttribute('data-src') || '';
          }
        }

        // Layout measurement for indentation mapping
        const rect = bodyContainer.getBoundingClientRect();
        const left = rect.left;

        if (baseLeftOffset === null || left < baseLeftOffset) {
          baseLeftOffset = left;
        }

        const uniqueKey = `${name}_${timestamp}_${text.substring(0, 20)}_${text.length}_${imageUrl ? imageUrl.substring(0, 30) : ''}`;
        
        if (processedKeys.has(uniqueKey)) continue;
        processedKeys.add(uniqueKey);

        const id = `comment_${parsedData.length + 1}`;
        
        parsedData.push({
          id,
          parentId: null,
          type: 'Comment',
          name,
          profileUrl,
          avatar,
          text,
          imageUrl,
          photoUrl,
          timestamp,
          left
        });

      } catch (err) {
        console.error("Error parsing comment:", err);
      }
    }

    // Process hierarchy
    let lastMainCommentId = null;
    let mainLeftBaseline = baseLeftOffset || 0;

    const finalData = parsedData.map(item => {
      const isReply = item.left > mainLeftBaseline + 15;
      if (isReply) {
        item.type = 'Reply';
        item.parentId = lastMainCommentId;
      } else {
        item.type = 'Comment';
        lastMainCommentId = item.id;
      }
      return item;
    });

    // Handle comment limit
    let filteredData = finalData;
    if (limit > 0) {
      let mainCommentCount = 0;
      const limited = [];
      for (const item of finalData) {
        if (item.type === 'Comment') {
          mainCommentCount++;
        }
        if (mainCommentCount > limit && item.type === 'Comment') {
          break;
        }
        if (item.type === 'Reply') {
          const parentIncluded = limited.some(p => p.id === item.parentId);
          if (!parentIncluded) continue;
        }
        limited.push(item);
      }
      filteredData = limited;
    }

    scrapedComments = filteredData;
    sendPreviewUpdate();
  }

  // Initialize auto detect on load
  autoDetectPost();
  
  console.log("FB Comment Scraper page worker ready.");
})();
