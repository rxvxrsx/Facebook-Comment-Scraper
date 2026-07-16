(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.FbScraperCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SCRAPE_OPTIONS_STORAGE_KEY = 'fbScraperOptions';
  const INLINE_BUTTON_ENABLED_STORAGE_KEY = 'fbScraperInlineButtonEnabled';
  const DEFAULT_SCRAPE_OPTIONS = Object.freeze({
    expandReplies: true,
    includeImages: true,
    limit: 0,
    delay: 2
  });

  function normalizeScrapeOptions(value) {
    const options = value && typeof value === 'object' ? value : {};
    const parsedLimit = Number.parseInt(options.limit, 10);
    const parsedDelay = Number.parseInt(options.delay, 10);
    return {
      expandReplies: options.expandReplies !== false,
      includeImages: options.includeImages !== false,
      limit: Number.isFinite(parsedLimit) ? Math.max(0, parsedLimit) : DEFAULT_SCRAPE_OPTIONS.limit,
      delay: Number.isFinite(parsedDelay)
        ? Math.min(10, Math.max(1, parsedDelay))
        : DEFAULT_SCRAPE_OPTIONS.delay
    };
  }

  function getFacebookProfileKey(value, origin = 'https://www.facebook.com') {
    if (!value) return '';
    try {
      const url = new URL(value, origin);
      const parts = url.pathname.split('/').filter(Boolean);

      if (url.pathname.includes('profile.php')) {
        const id = url.searchParams.get('id');
        return id ? `id:${id}` : '';
      }

      const userIndex = parts.indexOf('user');
      if (userIndex !== -1 && parts[userIndex + 1]) {
        return `id:${parts[userIndex + 1]}`;
      }

      if (parts[0] === 'people' && parts.length >= 3) {
        return `people:${parts[parts.length - 1].toLowerCase()}`;
      }

      return parts.length === 1
        ? `path:${parts[0].toLowerCase()}`
        : `path:/${parts.join('/').toLowerCase()}`;
    } catch (error) {
      return String(value).split('?')[0].split('#')[0].toLowerCase();
    }
  }

  function getFacebookPostId(value, origin = 'https://www.facebook.com') {
    if (!value) return '';
    try {
      const url = new URL(value, origin);
      const parts = url.pathname.split('/').filter(Boolean);
      for (const segment of ['permalink', 'posts', 'videos', 'reel', 'reels']) {
        const index = parts.indexOf(segment);
        if (index !== -1 && /^\d+$/.test(parts[index + 1] || '')) {
          return parts[index + 1];
        }
      }

      for (const parameter of ['story_fbid', 'fbid', 'video_id']) {
        const id = url.searchParams.get(parameter);
        if (/^\d+$/.test(id || '')) return id;
      }
      if (parts[0] === 'watch' || parts[0] === 'video.php') {
        const id = url.searchParams.get('v');
        if (/^\d+$/.test(id || '')) return id;
      }
    } catch (error) {
      return '';
    }
    return '';
  }

  function classifyExpandControlText(value, expandReplies) {
    const text = String(value || '').trim();
    if (!text || text.length > 100 || /Hide|ซ่อน/i.test(text)) return null;

    if (
      text.includes('View more comments') ||
      text.includes('View previous comments') ||
      text.includes('ดูความคิดเห็นเพิ่มเติม') ||
      text.includes('ดูความคิดเห็นก่อนหน้า')
    ) {
      return 'comments';
    }

    if (expandReplies && (
      text.toLowerCase().includes('view reply') ||
      text.toLowerCase().includes('view replies') ||
      text.toLowerCase().includes('view previous replies') ||
      text.includes('ดูการตอบกลับ') ||
      text.includes('ดูการตอบกลับเพิ่มเติม') ||
      /(reply|replies|ตอบกลับ).*?\d+|\d+.*?(reply|replies|ตอบกลับ)/i.test(text)
    )) {
      return 'replies';
    }

    return null;
  }

  function countMainCommentsByOffsets(offsets, tolerance = 15) {
    const validOffsets = offsets.filter(Number.isFinite);
    if (validOffsets.length === 0) return 0;
    let baseline = Infinity;
    for (const left of validOffsets) baseline = Math.min(baseline, left);
    return validOffsets.filter(left => left <= baseline + tolerance).length;
  }

  function pruneNestedCandidates(candidates) {
    return candidates.filter((candidate, index) => !candidates.some((other, otherIndex) =>
      index !== otherIndex && candidate.element.contains(other.element)
    ));
  }

  function findExpandCandidates(elements, options = {}) {
    const {
      expandReplies = false,
      limitReached = false,
      isClicked = () => false,
      isVisible = () => true
    } = options;

    const candidates = Array.from(elements).map(element => {
      const text = element.innerText || element.textContent || '';
      const type = classifyExpandControlText(text, expandReplies);
      if (!type || (limitReached && type === 'comments') || !isVisible(element)) return null;
      return { element, type };
    }).filter(Boolean);

    return pruneNestedCandidates(candidates).filter(candidate => !isClicked(candidate.element));
  }

  function getMutationObserver(rootNode) {
    const view = rootNode?.ownerDocument?.defaultView || rootNode?.defaultView || root;
    return view?.MutationObserver;
  }

  function waitForCondition(rootNode, predicate, timeoutMs = 2000) {
    let initialValue;
    try {
      initialValue = predicate();
    } catch (error) {
      return Promise.reject(error);
    }
    if (initialValue) return Promise.resolve(initialValue);

    const Observer = getMutationObserver(rootNode);
    if (!rootNode || !Observer) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      let timer;
      const finish = value => {
        observer.disconnect();
        clearTimeout(timer);
        resolve(value || null);
      };
      const observer = new Observer(() => {
        try {
          const value = predicate();
          if (value) finish(value);
        } catch (error) {
          observer.disconnect();
          clearTimeout(timer);
          reject(error);
        }
      });

      observer.observe(rootNode, { childList: true, subtree: true, attributes: true, characterData: true });
      timer = setTimeout(() => finish(null), timeoutMs);
    });
  }

  function waitForDomChange(rootNode, timeoutMs = 1500) {
    const Observer = getMutationObserver(rootNode);
    if (!rootNode || !Observer) return Promise.resolve(false);

    return new Promise(resolve => {
      let timer;
      const finish = changed => {
        observer.disconnect();
        clearTimeout(timer);
        resolve(changed);
      };
      const observer = new Observer(() => finish(true));
      observer.observe(rootNode, { childList: true, subtree: true, characterData: true });
      timer = setTimeout(() => finish(false), timeoutMs);
    });
  }

  return {
    DEFAULT_SCRAPE_OPTIONS,
    INLINE_BUTTON_ENABLED_STORAGE_KEY,
    SCRAPE_OPTIONS_STORAGE_KEY,
    classifyExpandControlText,
    countMainCommentsByOffsets,
    findExpandCandidates,
    getFacebookPostId,
    getFacebookProfileKey,
    normalizeScrapeOptions,
    pruneNestedCandidates,
    waitForCondition,
    waitForDomChange
  };
});
