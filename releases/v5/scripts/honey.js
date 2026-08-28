// ═══════════════════════════════════════════════════════════════════
// LUỒNG THU HOẠCH MẬT ONG (honey.js)
// Dựa vào Game Bridge để kiểm tra tổ ong đầy mật (produced >= 24)
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  function timToOngDOM() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacAnhBee = doc.querySelectorAll("img[src*='beehive'], img[src*='bee_box'], img[src*='honey']");
      for (const img of cacAnhBee) {
        if (!xemPhanTuRanh(img)) continue;
        const target = img.closest('[data-map-placement="true"]') || img.closest('div.cursor-pointer') || img;
        if (!danhSach.includes(target)) danhSach.push(target);
      }
    }
    return danhSach;
  }

  async function tickHoney() {
    if (dangBan) return false;
    dangBan = true;

    try {
      let state = null;
      if (typeof S.requestBridgeState === "function") {
        state = await S.requestBridgeState(1500);
      }

      const hivesBridge = state?.resources?.beehives?.list || [];
      const hivesReady = hivesBridge.filter((h) => h.isReady);

      const toOngs = timToOngDOM();
      if (toOngs.length === 0 && hivesReady.length === 0) {
        return false;
      }

      console.log(`%c[SFL Mật Ong] 🍯 Có ${hivesReady.length || toOngs.length} tổ ong sẵn sàng. Thu hoạch mật...`, "color: #ffb300; font-weight: bold;");

      let daThu = 0;
      for (const to of toOngs) {
        clickTam(to);
        daThu++;
        await ngu(300 + Math.floor(Math.random() * 100));
      }

      return daThu > 0;
    } catch (err) {
      console.error("[SFL Mật Ong] Lỗi:", err);
      return false;
    } finally {
      dangBan = false;
    }
  }

  S.tickHoney = tickHoney;

})(window.SFL = window.SFL || {});
