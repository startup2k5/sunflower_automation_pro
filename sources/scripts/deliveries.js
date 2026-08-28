// ═══════════════════════════════════════════════════════════════════
// LUỒNG GIAO ĐƠN HÀNG NPC (deliveries.js)
// Dựa vào Game Bridge để kiểm tra đơn hàng & kho đồ
// ĐẶC BIỆT: TỰ ĐỘNG BỎ QUA (KHÔNG TRẢ) CÁC ĐƠN HÀNG THEO MÙA (SEASON TICKETS/CURRENCY)
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Danh sách từ khóa phần thưởng theo Season cần LOẠI TRỪ (Không tự động trả)
  const SEASON_REWARD_KEYWORDS = [
    "ticket", "seasonal", "scroll", "crow feather", "mermaid scale",
    "tulip bulb", "amber", "solar flare", "dawn breaker", "witches' eve", "catch the kraken", "clash of factions"
  ];

  function laDonHangSeason(reward) {
    if (!reward || typeof reward !== "object") return false;
    for (const key of Object.keys(reward)) {
      const lowKey = key.toLowerCase();
      if (SEASON_REWARD_KEYWORDS.some((kw) => lowKey.includes(kw))) {
        return true;
      }
    }
    return false;
  }

  function layTaiLieuGame() {
    const out = [];
    const daThay = new Set();
    const them = (doc) => {
      if (!doc || daThay.has(doc)) return;
      daThay.add(doc);
      out.push(doc);
    };
    const nganXep = [];
    them(document);
    nganXep.push(document);
    while (nganXep.length) {
      const doc = nganXep.pop();
      let iframes;
      try { iframes = doc.querySelectorAll("iframe"); } catch (_e) { continue; }
      for (let i = 0; i < iframes.length; i += 1) {
        try {
          const idoc = iframes[i].contentDocument;
          if (idoc) { them(idoc); nganXep.push(idoc); }
        } catch (_e2) {}
      }
    }
    return out;
  }

  function xemPhanTuRanh(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const view = el.ownerDocument?.defaultView || window;
    let style;
    try { style = view.getComputedStyle(el); } catch (_e) { return false; }
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function kichHoatReactProps(el) {
    if (!el) return;
    for (const k in el) {
      if (k.startsWith("__reactProps$") || k.startsWith("__reactEventHandlers$")) {
        const p = el[k];
        if (p) {
          if (typeof p.onPointerDown === "function") {
            try { p.onPointerDown({ stopPropagation: () => {}, preventDefault: () => {}, target: el, currentTarget: el, button: 0 }); } catch (_e) {}
          }
          if (typeof p.onClick === "function") {
            try { p.onClick({ stopPropagation: () => {}, preventDefault: () => {}, target: el, currentTarget: el, button: 0 }); } catch (_e) {}
          }
        }
      }
    }
  }

  function clickTam(el) {
    if (!el) return false;
    const view = el.ownerDocument?.defaultView || window;
    try { if (view && typeof view.focus === "function") view.focus(); } catch (_e) {}
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const baseOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: view,
      clientX: cx,
      clientY: cy,
      screenX: cx,
      screenY: cy,
      pageX: cx + (view.scrollX || 0),
      pageY: cy + (view.scrollY || 0),
      which: 1,
      button: 0,
    };
    const downOpts = { ...baseOpts, buttons: 1 };
    const upOpts = { ...baseOpts, buttons: 0 };

    try { el.focus?.({ preventScroll: true }); } catch (_e) {}

    try {
      if (typeof PointerEvent !== "undefined") {
        el.dispatchEvent(new PointerEvent("pointerover", { ...baseOpts, pointerId: 1, pointerType: "mouse" }));
        el.dispatchEvent(new PointerEvent("pointerenter", { ...baseOpts, pointerId: 1, pointerType: "mouse" }));
        el.dispatchEvent(new PointerEvent("pointerdown", { ...downOpts, pointerId: 1, pointerType: "mouse", isPrimary: true, pressure: 0.5 }));
      }
    } catch (_e2) {}
    el.dispatchEvent(new MouseEvent("mouseover", baseOpts));
    el.dispatchEvent(new MouseEvent("mouseenter", baseOpts));
    el.dispatchEvent(new MouseEvent("mousedown", downOpts));

    try {
      if (typeof PointerEvent !== "undefined") {
        el.dispatchEvent(new PointerEvent("pointerup", { ...upOpts, pointerId: 1, pointerType: "mouse", isPrimary: true, pressure: 0 }));
      }
    } catch (_e3) {}
    el.dispatchEvent(new MouseEvent("mouseup", upOpts));
    el.dispatchEvent(new MouseEvent("click", upOpts));

    try { el.click?.(); } catch (_e4) {}
    kichHoatReactProps(el);
    if (el.parentElement) kichHoatReactProps(el.parentElement);

    setTimeout(() => {
      try {
        if (typeof el.blur === "function") el.blur();
        el.dispatchEvent(new MouseEvent("mouseout", upOpts));
        el.dispatchEvent(new MouseEvent("mouseleave", upOpts));
      } catch (_e5) {}
    }, 40);

    return true;
  }

  async function dongModal(doc) {
    const cacAnhClose = doc.querySelectorAll('img[src*="close"], img[src*="cancel"]');
    for (const img of cacAnhClose) {
      if (xemPhanTuRanh(img)) {
        const pText = (img.parentElement?.textContent || img.closest("div, button")?.textContent || "").toLowerCase();
        if (pText.includes("vip") || (img.src || "").toLowerCase().includes("vip")) continue;
        const nut = img.closest("button, [role='button']") || img;
        clickTam(nut);
        await ngu(250);
        return;
      }
    }
    try {
      const view = doc.defaultView || window;
      view.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    } catch (_e) {}
  }

  // Kiểm tra kho đồ có đủ vật phẩm cho đơn hàng không
  function duVatPham(items, inv) {
    if (!items || typeof items !== "object") return false;
    for (const [item, count] of Object.entries(items)) {
      if ((inv[item] || 0) < count) return false;
    }
    return true;
  }

  async function tickDeliveries() {
    if (dangBan) return false;
    dangBan = true;

    try {
      let state = null;
      if (typeof S.requestBridgeState === "function") {
        state = await S.requestBridgeState(1500);
      }

      const orders = state?.orders || [];
      const inv = state?.inventory || {};

      // Lọc các đơn hàng: chưa hoàn thành + KHÔNG phải đơn Season + ĐỦ vật phẩm trong kho
      const donKhaThi = orders.filter((ord) => {
        if (ord.completedAt) return false;
        if (laDonHangSeason(ord.reward)) {
          return false; // BỎ QUA ĐƠN THEO SEASON!
        }
        return duVatPham(ord.items, inv);
      });

      if (donKhaThi.length === 0) {
        return false;
      }

      console.log(`%c[SFL Đơn Hàng] 📜 Phát hiện ${donKhaThi.length} đơn NPC thường có thể giao (đã bỏ qua đơn Season)...`, "color: #009688; font-weight: bold;");

      // Tìm bảng Delivery Board / NPC trên đảo
      for (const doc of layTaiLieuGame()) {
        const board = doc.querySelector("img[src*='delivery_board'], img[src*='orders'], img[src*='npc/']");
        if (board && xemPhanTuRanh(board)) {
          clickTam(board);
          await ngu(800);

          // Bấm Deliver các đơn hợp lệ
          const cacBtnDeliver = doc.querySelectorAll("button, [role='button']");
          for (const btn of cacBtnDeliver) {
            if (!xemPhanTuRanh(btn) || btn.disabled) continue;
            const txt = (btn.textContent || "").toLowerCase();
            if (txt.includes("deliver") || txt.includes("giao")) {
              clickTam(btn);
              await ngu(500);
              break;
            }
          }
          await dongModal(doc);
          break;
        }
      }

      return true;
    } catch (err) {
      console.error("[SFL Đơn Hàng] Lỗi:", err);
      return false;
    } finally {
      dangBan = false;
    }
  }

  S.tickDeliveries = tickDeliveries;

})(window.SFL = window.SFL || {});
