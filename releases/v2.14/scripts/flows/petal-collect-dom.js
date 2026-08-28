(function (S) {
  "use strict";
  /**
   * Petal / hoa / quả / mật ong (DOM): thanh tiến độ game (empty_bar + fill màu) đầy → tap ô;
   * tổ ong / bee box: tap ảnh trên map → modal → Collect.
   */
  const runtime = S.runtime;
  const d = S.dom;
  const logFlow = S.time.logFlow;
  const now = S.time.now;
  const sleep = S.time.sleep;
  const rand = S.time.rand;
  const uiJitter = S.time.uiJitter;

  const VIEWPORT_PAD = 200;
  const PROGRESS_READY_RATIO = 0.86;
  const COLLECT_BTN_RE =
    /collect|recoger|coletar|sammle|raccogli|收集|収集|собрать|topla|nhận|thu/i;

  /** Ảnh tổ ong / hộp ong trên map (CDN có thể đổi — thêm chuỗi nếu cần). */
  const HONEY_BUILDING_URL_SNIPPETS = ["beehive", "bee_box", "bee-box", "bee_house", "honeycomb"];

  /** Hoa đang lớn — không tap (vd sprout.webp). */
  const FLOWER_GROWING_URL_RE =
    /\/flowers\/[^"'?]+\/(?:sprout|bud|seedling|halfway)\.webp/i;

  const logAt = new Map();

  function logThrottled(key, minMs, message, detail) {
    const t = now();
    if (t - (logAt.get(key) || 0) < minMs) return;
    logAt.set(key, t);
    logFlow(message, detail);
  }

  function parseStylePx(styleStr, prop) {
    const m = String(styleStr || "").match(new RegExp(`${prop}\\s*:\\s*([0-9.]+)\\s*px`, "i"));
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function scanProgressTrackAndFill(root) {
    let trackW = 0;
    let fillW = 0;
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node || node.nodeType !== 1) continue;
      const st = node.getAttribute("style") || "";
      if (st.includes("background-color") && st.includes("width")) {
        const w = parseStylePx(st, "width");
        if (w != null && w >= 4) {
          if (/rgb\s*\(\s*25\s*,\s*60\s*,\s*62\s*\)/i.test(st) || /rgb\s*\(\s*84\s*,\s*58\s*,\s*43\s*\)/i.test(st)) {
            trackW = Math.max(trackW, w);
          }
          if (/rgb\s*\(\s*99\s*,\s*199\s*,\s*77\s*\)/i.test(st) || /rgb\s*\(\s*255\s*,\s*176\s*,\s*30\s*\)/i.test(st)) {
            fillW = Math.max(fillW, w);
          }
        }
      }
      let c = node.firstElementChild;
      while (c) {
        stack.push(c);
        c = c.nextElementSibling;
      }
    }
    return { trackW, fillW };
  }

  function plotRootFromInner(el) {
    let n = el;
    for (let i = 0; i < 28 && n; i += 1) {
      const cls = n.classList;
      if (
        cls &&
        cls.contains("cursor-pointer") &&
        (cls.contains("hover:img-highlight") || cls.contains("group-hover:img-highlight"))
      ) {
        return n;
      }
      n = n.parentElement;
    }
    n = el;
    for (let i = 0; i < 28 && n; i += 1) {
      const cls = n.classList;
      if (cls && cls.contains("cursor-pointer")) {
        try {
          if (d.viewForElement(n).getComputedStyle(n).pointerEvents !== "none") return n;
        } catch (_e) {
          return n;
        }
      }
      n = n.parentElement;
    }
    return null;
  }

  function hasLikelyFruitImg(root) {
    if (!root) return false;
    let imgs;
    try {
      imgs = root.querySelectorAll("img");
    } catch (_e) {
      return false;
    }
    const fruitNames = /orange|apple|blueberry|lemon|pear|plum|grape|banana|tomato|peach|cherry|mango|durian|olive/i;
    for (let i = 0; i < imgs.length; i += 1) {
      const a = String(imgs[i].getAttribute("alt") || "").trim();
      const s = String(imgs[i].getAttribute("src") || "").toLowerCase();
      
      if (a.length >= 3 && !/seed|soil|bar|empty|icon|panel|progress|coin|gem/i.test(a)) {
        if (fruitNames.test(a)) return true;
      }
      
      if (s.includes("fruit") || fruitNames.test(s)) return true;
    }
    return false;
  }

  function tileHasBridgeFruitName(root) {
    if (!root) return false;
    let html = "";
    try {
      html = String(root.innerHTML || "").toLowerCase();
    } catch (_e) {
      return false;
    }
    const fruitPatches = S.gameBridge?.getLatestState?.()?.fruitPatches;
    if (!Array.isArray(fruitPatches) || fruitPatches.length <= 0) return false;
    for (let i = 0; i < fruitPatches.length; i += 1) {
      const name = String(fruitPatches[i]?.fruit?.name || "")
        .trim()
        .toLowerCase();
      if (!name) continue;
      const slug = name.replace(/\s+/g, "_");
      if (html.includes(name) || html.includes(slug)) return true;
    }
    return false;
  }

  function tileSeemsFlowerOrFruit(root) {
    if (!root) return false;
    let html = "";
    try {
      html = String(root.innerHTML || "").toLowerCase();
    } catch (_e) {
      return false;
    }
    if (html.includes("/flowers/") || html.includes("flowers/")) return true;
    if (tileHasBridgeFruitName(root)) return true;
    if (hasLikelyFruitImg(root)) return true;
    return false;
  }

  function tileNotReadyOrBlocked(root) {
    if (!root) return false;
    let html = "";
    try {
      html = String(root.innerHTML || "").toLowerCase();
    } catch (_e) {
      return false;
    }
    
    // Kiểm tra icon thời tiết phá hoại (nhiệt kế, lốc xoáy, v.v.)
    if (
      html.includes("thermometer") || 
      html.includes("tornado") || 
      html.includes("tsunami") || 
      html.includes("freeze") ||
      html.includes("frozen")
    ) {
      return true;
    }

    let imgs;
    try {
      imgs = root.querySelectorAll("img[src], img[srcset]");
    } catch (_e) {
      return false;
    }
    for (let i = 0; i < imgs.length; i += 1) {
      const u = String(imgs[i].currentSrc || imgs[i].getAttribute("src") || "").toLowerCase();
      if (FLOWER_GROWING_URL_RE.test(u)) return true;
    }
    return false;
  }

  function findProgressHarvestTargets() {
    const docs = d.collectDocumentsForGameDom();
    const list = [];
    const seen = new Set();
    for (let di = 0; di < docs.length; di += 1) {
      let imgs;
      try {
        imgs = docs[di].querySelectorAll('img[src*="empty_bar"],img[srcset*="empty_bar"]');
      } catch (_e) {
        continue;
      }
      for (let ii = 0; ii < imgs.length; ii += 1) {
        const img = imgs[ii];
        const u = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
        if (!u.includes("empty_bar")) continue;
        let scope = img.parentElement;
        for (let up = 0; up < 14 && scope; up += 1) {
          const { trackW, fillW } = scanProgressTrackAndFill(scope);
          if (trackW < 12 || fillW < 3) {
            scope = scope.parentElement;
            continue;
          }
          if (fillW < trackW * PROGRESS_READY_RATIO) {
            scope = scope.parentElement;
            continue;
          }
          const root = plotRootFromInner(img);
          if (!root || !d.isVisible(root) || !d.isInViewportLoose(root, VIEWPORT_PAD)) break;
          if (!tileSeemsFlowerOrFruit(root)) break;
          if (tileNotReadyOrBlocked(root)) break;
          if (seen.has(root)) break;
          seen.add(root);
          list.push({ root, dist: d.centerDistance(root), fillW, trackW });
          break;
        }
      }
    }
    list.sort((a, b) => a.dist - b.dist);
    return list;
  }

  function findBeehiveClickTarget() {
    const docs = d.collectDocumentsForGameDom();
    const seen = new Set();
    const list = [];
    for (let di = 0; di < docs.length; di += 1) {
      let imgs;
      try {
        imgs = docs[di].querySelectorAll("img[src], img[srcset]");
      } catch (_e) {
        continue;
      }
      for (let ii = 0; ii < imgs.length; ii += 1) {
        const img = imgs[ii];
        const u = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
        if (u.startsWith("data:") || !u.includes("game-assets")) continue;
        if (!HONEY_BUILDING_URL_SNIPPETS.some((h) => u.includes(h))) continue;
        let el = img;
        let clickTarget = null;
        for (let depth = 0; depth < 24 && el; depth += 1) {
          if (
            el.classList &&
            el.classList.contains("cursor-pointer") &&
            d.isClickablePointerEventsOk(el) &&
            !el.classList.contains("pointer-events-none")
          ) {
            clickTarget = el;
            break;
          }
          el = el.parentElement;
        }
        if (
          clickTarget &&
          d.isVisible(clickTarget) &&
          d.isInViewportLoose(clickTarget, VIEWPORT_PAD) &&
          !seen.has(clickTarget)
        ) {
          seen.add(clickTarget);
          list.push({ root: clickTarget, dist: d.centerDistance(clickTarget) });
        }
      }
    }
    list.sort((a, b) => a.dist - b.dist);
    return list[0]?.root || null;
  }

  async function tryHarvestProgressTileOnce() {
    const hits = findProgressHarvestTargets();
    if (hits.length <= 0) return false;
    const { root, fillW, trackW } = hits[0];
    d.nativeClickClose(root) || d.click(root);
    await uiJitter();
    S.gameBridge?.requestState?.().catch(() => { });
    await sleep(rand(80, 180));
    runtime.lastAction = "petal_progress_harvest_dom";
    runtime.lastActionAt = now();
    logFlow("Petal DOM: thu (hoa/quả — thanh tiến độ đầy)", { fillW, trackW });
    return true;
  }

  async function tryBeehiveCollectDom() {
    const target = findBeehiveClickTarget();
    if (!target) return false;
    d.nativeClickClose(target) || d.click(target);
    await sleep(rand(380, 720));
    const collectBtn = d.findVisibleDialogButtonByText(COLLECT_BTN_RE);
    if (collectBtn && !collectBtn.disabled) {
      d.nativeClickClose(collectBtn) || d.click(collectBtn);
      await uiJitter();
      logFlow("Petal DOM: thu mật ong (Collect sau tổ ong)", {});
      d.sendEscapeToGameWindows();
      await sleep(rand(100, 220));
      runtime.lastAction = "honey_collect_dom";
      runtime.lastActionAt = now();
      S.gameBridge?.requestState?.().catch(() => { });
      return true;
    }
    d.sendEscapeToGameWindows();
    logThrottled("petal_hive_no_collect", 14000, "Petal DOM: bấm tổ ong nhưng không thấy Collect (chưa đủ mật?)", {});
    return false;
  }

  /**
   * Một bước: captcha (dùng chung cropDom) → thu hoa/quả (thanh đầy) → thử tổ ong.
   * @returns {Promise<boolean>}
   */
  async function tryOnePetalStep() {
    if (!runtime.settings.autoPetalHarvestDom) return false;

    if (typeof S.cropDom?.tryTapChestCaptchaIfPresent === "function") {
      if (await S.cropDom.tryTapChestCaptchaIfPresent()) return true;
    }

    if (await tryHarvestProgressTileOnce()) return true;
    if (await tryBeehiveCollectDom()) return true;
    return false;
  }

  S.petalDom = { tryOnePetalStep, findProgressHarvestTargets, findBeehiveClickTarget };
})(window.SFL);
