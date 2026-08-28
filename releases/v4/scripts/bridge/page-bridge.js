// ═══════════════════════════════════════════════════════════════════
// PAGE BRIDGE — MAIN WORLD EXTENSION SCRIPT (page-bridge.js)
// Chạy trong MAIN world để đọc React Fiber & XState Game Service 100%
// Tốc độ cao & Hỗ trợ đầy đủ Goblin, Skeleton (Người xương), Moon Seeker, Zombie
// ═══════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  let cachedGameService = null;

  function toSafeNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, "").trim());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === "object") {
      if (typeof value.toNumber === "function") {
        const parsed = Number(value.toNumber());
        return Number.isFinite(parsed) ? parsed : 0;
      }
      if (typeof value.toString === "function") {
        const parsed = Number(String(value));
        return Number.isFinite(parsed) ? parsed : 0;
      }
    }
    return 0;
  }

  function isGameService(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (typeof obj.getSnapshot !== "function" || typeof obj.send !== "function") {
      return false;
    }
    try {
      const snap = obj.getSnapshot();
      const ctx = snap?.context || snap?.value?.context || {};
      const state = ctx.state || ctx.gameState || ctx;
      return !!(state && (state.inventory || state.season || state.trees || state.crops || state.coins !== undefined));
    } catch (_e) {
      return false;
    }
  }

  function extractService(input) {
    if (!input || typeof input !== "object") return null;
    if (isGameService(input)) return input;
    try {
      for (const key of Object.keys(input)) {
        if (key.startsWith("__")) continue;
        const value = input[key];
        if (isGameService(value)) return value;
        if (!value || typeof value !== "object") continue;
        for (const sub of Object.keys(value)) {
          if (sub.startsWith("__")) continue;
          if (isGameService(value[sub])) return value[sub];
        }
      }
    } catch (_e) {}
    return null;
  }

  function findGameService() {
    if (cachedGameService && isGameService(cachedGameService)) {
      return cachedGameService;
    }
    cachedGameService = null;

    // Tìm từ root hoặc các phần tử đặc trưng của game
    const elements = document.querySelectorAll("#root, [data-map-placement], div, button, img");
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const fiberKey = Object.keys(el).find(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
      );
      if (!fiberKey) continue;
      let f = el[fiberKey];
      for (let depth = 0; depth < 50 && f; depth++) {
        const found = extractService(f.memoizedProps) || extractService(f.memoizedState);
        if (found) {
          cachedGameService = found;
          return cachedGameService;
        }
        f = f.return;
      }
    }
    return null;
  }

  function getGameState() {
    const svc = findGameService();
    if (svc) {
      try {
        const snap = svc.getSnapshot();
        const ctx = snap?.context || snap?.value?.context || {};
        const state = ctx.state || ctx.gameState || ctx;
        if (state) return state;
      } catch (_e) {}
    }
    return null;
  }

  function buildStatePayload() {
    const state = getGameState();
    if (!state) return null;

    // Trích xuất mùa hiện tại
    let season = "spring";
    if (state.season) {
      if (typeof state.season === "string") {
        season = state.season;
      } else if (typeof state.season?.season === "string") {
        season = state.season.season;
      }
    }

    // Trích xuất kho đồ
    const inventory = {};
    if (state.inventory && typeof state.inventory === "object") {
      for (const [k, v] of Object.entries(state.inventory)) {
        inventory[k] = toSafeNumber(v);
      }
    }

    return {
      season: String(season).toLowerCase().trim(),
      inventory: inventory,
      coins: toSafeNumber(state.coins),
      balance: toSafeNumber(state.balance),
      username: typeof state.username === "string" ? state.username : undefined,
      farmActivity: state.farmActivity || undefined,
    };
  }

  // Chuẩn hóa cờ mục tiêu Captcha: Goblin / Moon Seeker / Zombie / Skeleton (Người xương)
  function _normalizeIsTarget(item) {
    if (!item || typeof item !== "object") return false;
    if (item.isGoblin === true || item.isMoonSeeker === true || item.isZombie === true || item.isSkeleton === true) return true;
    if (item.goblin === true || item.moonSeeker === true || item.zombie === true || item.skeleton === true) return true;
    const t = String(item.type || item.kind || item.role || item.name || "").toLowerCase();
    if (t === "goblin" || t.includes("moon") || t.includes("seeker") || t.includes("zomb") || t.includes("skele")) return true;
    if (typeof item.src === "string") {
      const s = item.src.toLowerCase();
      if (s.includes("skeleton") || s.includes("goblin") || s.includes("moon_seeker") || s.includes("zombie")) return true;
    }
    return false;
  }

  // Kiểm tra phần tử đầu tiên có phải item captcha grid hay không
  function _isCaptchaGridItem(first) {
    if (!first || typeof first !== "object") return false;
    if (typeof first.isGoblin === "boolean" || typeof first.isMoonSeeker === "boolean" || typeof first.isZombie === "boolean" || typeof first.isSkeleton === "boolean") return true;
    if (typeof first.goblin === "boolean" || typeof first.moonSeeker === "boolean" || typeof first.skeleton === "boolean" || typeof first.zombie === "boolean") return true;
    if (typeof first.src === "string" && (first.src.startsWith("data:image") || first.src.includes("crops") || first.src.includes("goblin") || first.src.includes("skeleton") || first.src.includes("npc"))) return true;
    return false;
  }

  // Map mảng 16 items thành dạng gọn: { index, isGoblin, src }
  function _mapCaptchaGridItems(st) {
    return st.map((item, idx) => ({
      index: idx,
      isGoblin: _normalizeIsTarget(item),
      src: typeof item.src === "string" ? item.src.slice(0, 120) : "",
    }));
  }

  // Tìm mảng 16 items trong hook chain của một fiber node
  function _findGrid16InFiber(f) {
    if (!f) return null;
    let hook = f.memoizedState;
    for (let hi = 0; hi < 60 && hook; hi += 1) {
      const st = hook.memoizedState;
      if (Array.isArray(st) && st.length === 16 && _isCaptchaGridItem(st[0])) {
        return _mapCaptchaGridItems(st);
      }
      if (st && typeof st === "object" && !Array.isArray(st)) {
        try {
          const keys = Object.keys(st);
          for (let ki = 0; ki < keys.length; ki += 1) {
            const val = st[keys[ki]];
            if (Array.isArray(val) && val.length === 16 && _isCaptchaGridItem(val[0])) {
              return _mapCaptchaGridItems(val);
            }
          }
        } catch (_e) {}
      }
      hook = hook.next;
    }
    return null;
  }

  // Đọc danh sách 16 ô Captcha từ React Fiber
  function readCaptchaGridItems() {
    const candidates = [];
    try {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      for (let i = 0; i < dialogs.length; i += 1) candidates.push(dialogs[i]);
    } catch (_e) {}

    try {
      const wraps = document.querySelectorAll("div.flex.flex-wrap.justify-center.items-center, div.flex.flex-wrap");
      for (let wi = 0; wi < wraps.length; wi += 1) {
        let anc = wraps[wi].parentElement;
        for (let up = 0; up < 12 && anc; up += 1) {
          if (!candidates.includes(anc)) candidates.push(anc);
          anc = anc.parentElement;
        }
      }
    } catch (_e) {}

    for (let ci = 0; ci < candidates.length; ci += 1) {
      const dlg = candidates[ci];
      if (!dlg) continue;

      const wrap =
        dlg.querySelector(".flex.flex-wrap.justify-center.items-center") ||
        dlg.querySelector(".flex.flex-wrap.justify-center") ||
        dlg.querySelector(".flex.flex-wrap");
      if (!wrap) continue;

      const children = Array.from(wrap.children).filter(
        (el) => el && el.tagName === "DIV" && el.classList?.contains("cursor-pointer"),
      );
      if (children.length < 16) continue;
      const cells = children.slice(0, 16);

      for (let ci2 = 0; ci2 < cells.length; ci2 += 1) {
        const cell = cells[ci2];
        const fiberKey = Object.keys(cell).find(
          (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
        );
        if (!fiberKey) continue;
        let f = cell[fiberKey];
        for (let depth = 0; depth < 80 && f; depth += 1) {
          const found = _findGrid16InFiber(f);
          if (found) return found;
          f = f.return;
        }
      }

      // BFS từ dialog fiber
      const dlgFiberKey = Object.keys(dlg).find(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
      );
      if (dlgFiberKey) {
        const queue = [dlg[dlgFiberKey]];
        let steps = 0;
        const visited = new Set();
        while (queue.length && steps < 15000) {
          const f = queue.shift();
          steps += 1;
          if (!f || visited.has(f)) continue;
          visited.add(f);
          const found = _findGrid16InFiber(f);
          if (found) return found;
          let c = f.child;
          while (c) { queue.push(c); c = c.sibling; }
        }
      }
    }

    return null;
  }

  // Lắng nghe yêu cầu từ Content Script
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data._sfl !== true) return;

    if (data.type === "SFL_READ_CAPTCHA_GRID") {
      const items = readCaptchaGridItems();
      window.postMessage({
        _sfl: true,
        type: "SFL_CAPTCHA_GRID_RESULT",
        reqId: data.reqId,
        items: items,
      }, "*");
      return;
    }

    if (data.type === "SFL_GET_STATE") {
      const statePayload = buildStatePayload();
      window.postMessage({
        _sfl: true,
        type: "SFL_STATE",
        reqId: data.reqId,
        data: statePayload,
        error: statePayload ? null : "no_service",
      }, "*");
      return;
    }
  });

  // Thông báo Bridge đã sẵn sàng
  window.postMessage({ _sfl: true, type: "SFL_BRIDGE_READY" }, "*");
})();
