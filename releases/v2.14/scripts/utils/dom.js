(function (S) {
  "use strict";
  const d = {};

  /** Tab đang ở /play (frame hiện tại hoặc top — vì iframe game thường không có #/play trên URL riêng). */
  d.isOnPlayTopOrSelf = function isOnPlayTopOrSelf() {
    const hash = String(window.location.hash || "");
    const path = String(window.location.pathname || "");
    if (/^#\/play(\/|$)/i.test(hash) || /^\/play(\/|$)/i.test(path)) return true;
    try {
      if (window.top && window.top !== window) {
        const th = String(window.top.location.hash || "");
        const tp = String(window.top.location.pathname || "");
        if (/^#\/play(\/|$)/i.test(th) || /^\/play(\/|$)/i.test(tp)) return true;
      }
    } catch (_e) {
      if (window !== window.top && typeof d.isLikelyGameFarmDocument === "function") {
        return d.isLikelyGameFarmDocument(document);
      }
    }
    return false;
  };

  d.isOnPlayPage = function isOnPlayPage() {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host !== "sunflower-land.com" && host !== "www.sunflower-land.com") return false;
    return d.isOnPlayTopOrSelf();
  };

  /**
   * Chính xác hơn isOnPlayPage: chỉ true khi URL đang ở TRANG FARM (/play/ gốc),
   * không chấp nhận các sub-route (/play/housefire, /play/plaza, /play/kingdom...).
   */
  d.isOnFarmRoute = function isOnFarmRoute() {
    const PLAY_HOSTS = new Set(["sunflower-land.com", "www.sunflower-land.com"]);
    const host = String(window.location.hostname || "").toLowerCase();
    if (!PLAY_HOSTS.has(host)) {
      // Kiểm tra top window nếu đang trong iframe
      try {
        if (window.top && window.top !== window) {
          const th = String(window.top.location.hostname || "").toLowerCase();
          if (!PLAY_HOSTS.has(th)) return false;
        }
      } catch (_e) { /* cross-origin */ }
      if (!PLAY_HOSTS.has(host)) return false;
    }

    // Kiểm tra hash và pathname — chỉ chấp nhận /play/ gốc (không có sub-path)
    // SFL dùng hash-based routing: #/world/plaza, #/housefire, ...
    // → Khi hash bắt đầu bằng #/ thì ưu tiên check hash, bỏ qua pathname
    const checkPlayRoot = (hash, path) => {
      if (hash && hash.startsWith("#/")) {
        // Hash routing đang hoạt động → route được xác định bởi hash
        // Farm root: #/ hoặc #/play/ (không có sub-path sau đó)
        return /^#\/(play\/?)?$/i.test(hash);
      }
      // Không có hash routing → dùng pathname
      return /^\/play\/?$/i.test(path);
    };

    const hash = String(window.location.hash || "");
    const path = String(window.location.pathname || "");
    if (checkPlayRoot(hash, path)) return true;

    try {
      if (window.top && window.top !== window) {
        const th = String(window.top.location.hash || "");
        const tp = String(window.top.location.pathname || "");
        if (checkPlayRoot(th, tp)) return true;
      }
    } catch (_e) {
      // Cross-origin iframe: fallback — dùng isLikelyGameFarmDocument
      if (window !== window.top && typeof d.isLikelyGameFarmDocument === "function") {
        return d.isLikelyGameFarmDocument(document);
      }
    }
    return false;
  };

  /** Document có vẻ là map farm — heuristic rộng (CDN đổi URL, ít tile, v.v.). */
  d.isLikelyGameFarmDocument = function isLikelyGameFarmDocument(doc) {
    const root = doc || document;
    try {
      if (
        root.querySelector(
          "img[src*='stone_small'],img[src*='iron_small'],img[src*='gold_small'],img[src*='stone_rock'],img[src*='l2_stone_rock']",
        )
      ) {
        return true;
      }
      const tiles = root.querySelectorAll(".relative.w-full.h-full");
      const res = root.querySelectorAll("img[src*='resources'], img[srcset*='resources']");
      if (tiles.length >= 3 && res.length >= 2) return true;
      if (tiles.length >= 4 && root.querySelector("[class*='cursor-pointer'][class*='img-highlight'], .cursor-pointer.hover\\:img-highlight")) {
        return true;
      }
      const imgs = root.querySelectorAll("img[src], img[srcset]");
      let anyRes = 0;
      for (let i = 0; i < Math.min(imgs.length, 400); i += 1) {
        const u = String(
          imgs[i].currentSrc || imgs[i].getAttribute("src") || imgs[i].getAttribute("srcset") || "",
        ).toLowerCase();
        if (u.includes("resources") && /stone|iron|gold|rock|tree|plot|crop/.test(u)) anyRes += 1;
        if (anyRes >= 3) return true;
      }
      const deep = root.body ? root.body.getElementsByTagName("*").length : 0;
      if (deep > 120 && tiles.length >= 2 && res.length >= 1) return true;
    } catch (_e) {
      // ignore
    }
    return false;
  };

  /**
   * Top: không chạy nếu có iframe và DOM top không giống map (game trong frame).
   * Frame con: gần như luôn chạy khi tab đang /play — tránh false negative do heuristic.
   */
  d.shouldRunAutomationInThisFrame = function shouldRunAutomationInThisFrame() {
    const onPlay = d.isOnPlayPage();
    if (!onPlay) return false;
    
    if (window !== window.top) {
      try {
        const body = document.body;
        const deep = body ? body.getElementsByTagName("*").length : 0;
        const hasTile = !!document.querySelector(".relative.w-full.h-full");
        const hasImg = !!document.querySelector("img[src], img[srcset]");
        
        // If it's an iframe, we want to be sure it's the game frame.
        // If it's too empty, it's probably not the game yet.
        if (deep < 15 && !hasTile && !hasImg) return false;
      } catch (_e) {
        // Cross-origin: if we are here, manifest matched, so it's likely our frame.
      }
      return true;
    }
    
    // Top frame
    if (d.isLikelyGameFarmDocument(document)) return true;
    
    const hasIframe = !!document.querySelector("iframe");
    if (hasIframe) {
      // If there is an iframe, we assume the game is in the iframe.
      // We log this once to help user debug.
      if (!window._sfl_frame_logged) {
        console.log("[SFL UI] Detected iframe, delegating automation to frame content script.");
        window._sfl_frame_logged = true;
      }
      return false;
    }
    return true;
  };

  d.isVisible = function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const win = d.viewForElement(el);
    let style;
    try {
      style = win.getComputedStyle(el);
    } catch (_e) {
      return false;
    }
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  };

  d.viewForElement = function viewForElement(el) {
    try {
      const v = el?.ownerDocument?.defaultView;
      return v && v.innerWidth ? v : window;
    } catch (_e) {
      return window;
    }
  };

  d.isInViewport = function isInViewport(el) {
    if (!el) return false;
    const view = d.viewForElement(el);
    const rect = el.getBoundingClientRect();
    return (
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= view.innerHeight &&
      rect.left <= view.innerWidth
    );
  };

  /** Same as isInViewport but expands edges (map tiles near screen border). */
  d.isInViewportLoose = function isInViewportLoose(el, pad) {
    const p = Number(pad) >= 0 ? Number(pad) : 120;
    if (!el) return false;
    const view = d.viewForElement(el);
    const rect = el.getBoundingClientRect();
    return (
      rect.bottom >= -p &&
      rect.right >= -p &&
      rect.top <= view.innerHeight + p &&
      rect.left <= view.innerWidth + p
    );
  };

  d.isClickablePointerEventsOk = function isClickablePointerEventsOk(el) {
    if (!el) return false;
    try {
      return d.viewForElement(el).getComputedStyle(el).pointerEvents !== "none";
    } catch (_e) {
      return true;
    }
  };

  d.click = function click(el) {
    if (!el || !d.isVisible(el)) return false;
    try {
      const vw = d.viewForElement(el);
      if (vw && typeof vw.focus === "function") vw.focus();
    } catch (_e) {}
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  };

  d.clickAtCenter = function clickAtCenter(el) {
    if (!el) return false;
    const vw = d.viewForElement(el);
    try {
      if (vw && typeof vw.focus === "function") vw.focus();
    } catch (_e) {}
    
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: vw };
    
    try {
      if (typeof el.focus === "function") {
        el.focus({ preventScroll: true });
      }
    } catch (_e) {
      // ignore
    }
    
    // Touch events (mobile / tablet) — gửi trước để game SFL nhận được khi idle
    try {
      if (typeof TouchEvent !== "undefined" && typeof Touch !== "undefined") {
        const touch = new Touch({
          identifier: Date.now(),
          target: el,
          clientX: cx,
          clientY: cy,
          screenX: cx,
          screenY: cy,
          pageX: cx + (vw.scrollX || 0),
          pageY: cy + (vw.scrollY || 0),
          radiusX: 1,
          radiusY: 1,
          rotationAngle: 0,
          force: 1,
        });
        const touchOpts = { bubbles: true, cancelable: true, touches: [touch], changedTouches: [touch], targetTouches: [touch] };
        el.dispatchEvent(new TouchEvent("touchstart", touchOpts));
        el.dispatchEvent(new TouchEvent("touchend", touchOpts));
      }
    } catch (_e) {
      // ignore — môi trường không hỗ trợ TouchEvent
    }

    try {
      if (typeof PointerEvent !== "undefined") {
        el.dispatchEvent(new PointerEvent("pointerover", { ...opts, pointerId: 1, pointerType: "mouse" }));
        el.dispatchEvent(new PointerEvent("pointerenter", { ...opts, pointerId: 1, pointerType: "mouse" }));
        el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, pointerType: "mouse" }));
      }
    } catch (_e) {
      // ignore
    }
    el.dispatchEvent(new MouseEvent("mouseover", opts));
    el.dispatchEvent(new MouseEvent("mouseenter", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    try {
      if (typeof PointerEvent !== "undefined") {
        el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1, pointerType: "mouse" }));
      }
    } catch (_e) {
      // ignore
    }
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));

    try {
      if (typeof el.click === "function") {
        el.click();
      }
    } catch (_e) {
      // ignore
    }

    return true;
  };

  d.doubleClick = function doubleClick(el) {
    if (!el || !d.isVisible(el)) return false;
    try {
      const vw = d.viewForElement(el);
      if (vw && typeof vw.focus === "function") vw.focus();
    } catch (_e) {}
    
    d.click(el);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    try {
      if (typeof el.click === "function") {
        el.click();
      }
    } catch (_e) {}
    return true;
  };

  d.doubleClickAtCenter = function doubleClickAtCenter(el) {
    if (!el || !d.isVisible(el)) return false;
    const vw = d.viewForElement(el);
    try {
      if (vw && typeof vw.focus === "function") vw.focus();
    } catch (_e) {}
    
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: vw };

    d.clickAtCenter(el);

    try {
      if (typeof PointerEvent !== "undefined") {
        el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, pointerType: "mouse" }));
      }
    } catch (_e) {}
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    try {
      if (typeof PointerEvent !== "undefined") {
        el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1, pointerType: "mouse" }));
      }
    } catch (_e) {}
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
    el.dispatchEvent(new MouseEvent("dblclick", opts));
    
    try {
      if (typeof el.click === "function") {
        el.click();
      }
    } catch (_e) {}
    
    return true;
  };

  d.nativeClickClose = function nativeClickClose(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = d.viewForElement(el).getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    
    let done = d.clickAtCenter(el);
    try {
      if (typeof el.click === "function") {
        el.click();
        done = true;
      }
    } catch (_e) {
      // ignore
    }
    return done;
  };

  d.textOf = function textOf(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  };

  d.findInteractiveButtonByText = function findInteractiveButtonByText(regex) {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      let nodes;
      try {
        nodes = doc.querySelectorAll("button,[role='button'],a");
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (d.isVisible(node) && regex.test(d.textOf(node))) return node;
      }
    }
    return null;
  };

  /** Nút trong modal HeadlessUI — tránh bấm nhầm nút ngoài dialog. */
  d.findVisibleDialogButtonByText = function findVisibleDialogButtonByText(regex) {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      let dialogs;
      try {
        dialogs = doc.querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < dialogs.length; i += 1) {
        const dialog = dialogs[i];
        if (!d.isVisible(dialog)) continue;
        let buttons;
        try {
          buttons = dialog.querySelectorAll("button,[role='button']");
        } catch (_e2) {
          continue;
        }
        for (let j = 0; j < buttons.length; j += 1) {
          const btn = buttons[j];
          if (!d.isVisible(btn) || btn.disabled) continue;
          if (regex.test(d.textOf(btn))) return btn;
        }
      }
    }
    return null;
  };

  d.sendEscapeToGameWindows = function sendEscapeToGameWindows() {
    const docs = d.collectDocumentsForGameDom();
    for (let i = 0; i < docs.length; i += 1) {
      const w = docs[i].defaultView;
      if (!w) continue;
      try {
        w.dispatchEvent(
          new w.KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
      } catch (_e) {
        // ignore
      }
    }
  };

  /** Nút Mine / Đào (mọi document game, iframe cùng origin). Chỉ tìm — click qua click / nativeClickClose. */
  d.findMineActionButton = function findMineActionButton() {
    const labels = ["mine", "đào", "chipped", "crush", "excavate", "ore.mined"];
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      let buttons;
      try {
        buttons = doc.querySelectorAll("button,[role='button']");
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < buttons.length; i += 1) {
        const btn = buttons[i];
        if (!d.isVisible(btn) || btn.disabled) continue;
        const text = (btn.textContent || "").trim().toLowerCase();
        if (!text) continue;
        if (labels.some((label) => text.includes(label))) {
          return btn;
        }
      }
    }
    return null;
  };

  d.centerDistance = function centerDistance(el) {
    if (!el) return Number.POSITIVE_INFINITY;
    const view = d.viewForElement(el);
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = cx - view.innerWidth / 2;
    const dy = cy - view.innerHeight / 2;
    return Math.sqrt(dx * dx + dy * dy);
  };

  /**
   * Game có thể nằm trong iframe cùng origin; content script chạy trên top document
   * thì querySelector trên document sẽ ra 0 node. Gom mọi document có thể truy cập.
   */
  d.collectDocumentsForGameDom = function collectDocumentsForGameDom() {
    const out = [];
    const seen = new Set();
    const add = (doc) => {
      if (!doc || seen.has(doc)) return;
      seen.add(doc);
      out.push(doc);
    };
    const stack = [];
    add(document);
    stack.push(document);
    while (stack.length) {
      const doc = stack.pop();
      let iframes;
      try {
        iframes = doc.querySelectorAll("iframe");
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < iframes.length; i += 1) {
        try {
          const idoc = iframes[i].contentDocument;
          if (idoc) {
            add(idoc);
            stack.push(idoc);
          }
        } catch (_e) {
          // cross-origin
        }
      }
    }
    return out;
  };

  d.isWorkbenchItemImgFindable = function isWorkbenchItemImgFindable(img) {
    if (!img) return false;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = d.viewForElement(img).getComputedStyle(img);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const src = String(img.getAttribute("src") || "").toLowerCase();
    const alt = String(img.getAttribute("alt") || "").toLowerCase();
    if (alt === "item" && (src.includes("tools/") || src.includes("axe"))) {
      return true;
    }
    return style.opacity !== "0";
  };

  d.findClickableToolBoxFromItemImg = function findClickableToolBoxFromItemImg(img) {
    let el = img.parentElement;
    for (let depth = 0; depth < 14 && el; depth += 1) {
      const cls = el.classList;
      const win = d.viewForElement(el);
      if (cls && cls.contains("cursor-pointer") && win.getComputedStyle(el).pointerEvents !== "none") {
        return el;
      }
      el = el.parentElement;
    }
    return img;
  };

  S.dom = d;
})(window.SFL);
