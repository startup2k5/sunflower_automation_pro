// ═══════════════════════════════════════════════════════════════════
// LUỒNG CHĂM SÓC & TRỒNG HOA TOÀN DIỆN (flowers.js)
// Thu hoạch hoa nở & Tự động gieo trồng hoa theo mùa vụ kèm thụ phấn chéo (Crossbreeding)
// CHỈ XỬ LÝ CÁC LUỐNG HOA ĐÃ ĐẶT TRÊN MAP (BỎ QUA LUỐNG TRONG KHO ĐỒ)
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
    const hasSize = rect.width > 0 && rect.height > 0;
    const hasChildSize = el.firstElementChild ? el.firstElementChild.getBoundingClientRect().width > 0 : false;
    const hasImgSize = el.querySelector("img") ? el.querySelector("img").getBoundingClientRect().width > 0 : false;
    if (!hasSize && !hasChildSize && !hasImgSize && el.offsetWidth <= 0 && el.offsetHeight <= 0) return false;
    const view = el.ownerDocument?.defaultView || window;
    let style;
    try { style = view.getComputedStyle(el); } catch (_e) { return false; }
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function kichHoatReactProps(el) {
    if (!el) return;
    for (const k in el) {
      if (k.startsWith("__reactProps$") || k.startsWith("__reactEventHandlers$") || k.startsWith("__reactFiber$")) {
        const p = el[k]?.memoizedProps || el[k];
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
    const cx = rect.left + (rect.width > 0 ? rect.width / 2 : 16);
    const cy = rect.top + (rect.height > 0 ? rect.height / 2 : 16);

    const baseOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: view,
      clientX: cx,
      clientY: cy,
      pageX: cx + (view.scrollX || 0),
      pageY: cy + (view.scrollY || 0),
      which: 1,
      button: 0,
    };
    const downOpts = { ...baseOpts, buttons: 1 };
    const upOpts = { ...baseOpts, buttons: 0 };

    try { el.focus?.({ preventScroll: true }); } catch (_e) {}

    try {
      try { el.dispatchEvent(new PointerEvent("pointerdown", downOpts)); } catch (_p1) {}
      el.dispatchEvent(new MouseEvent("mousedown", downOpts));
      try { el.dispatchEvent(new PointerEvent("pointerup", upOpts)); } catch (_p2) {}
      el.dispatchEvent(new MouseEvent("mouseup", upOpts));
      el.dispatchEvent(new MouseEvent("click", baseOpts));
      try { el.click?.(); } catch (_e2) {}
      kichHoatReactProps(el);
      if (el.parentElement) kichHoatReactProps(el.parentElement);
      if (el.firstElementChild) kichHoatReactProps(el.firstElementChild);
    } catch (_e2) {}

    const placement = el.closest?.('[data-map-placement]') || el;
    if (placement && placement !== el) {
      try {
        try { placement.dispatchEvent(new PointerEvent("pointerdown", downOpts)); } catch (_p3) {}
        placement.dispatchEvent(new MouseEvent("click", baseOpts));
        kichHoatReactProps(placement);
      } catch (_e3) {}
    }

    setTimeout(() => {
      try {
        if (typeof el.blur === "function") el.blur();
        el.dispatchEvent(new MouseEvent("mouseout", upOpts));
        el.dispatchEvent(new MouseEvent("mouseleave", upOpts));
        if (placement && placement !== el) {
          if (typeof placement.blur === "function") placement.blur();
          placement.dispatchEvent(new MouseEvent("mouseout", upOpts));
          placement.dispatchEvent(new MouseEvent("mouseleave", upOpts));
        }
      } catch (_e6) {}
    }, 40);

    return true;
  }

  // Quét DOM tìm các luống hoa trên đảo
  function timLuongHoaDOM() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacAnhHoa = doc.querySelectorAll("img[src*='flower_bed'], img[src*='/flowers/']");
      for (const img of cacAnhHoa) {
        if (!xemPhanTuRanh(img)) continue;
        const target = img.closest('.cursor-pointer, [class*="cursor-pointer"], [data-map-placement]') || img;
        if (!danhSach.includes(target)) danhSach.push(target);
      }
    }
    return danhSach;
  }

  // ═══════ LUỒNG CHÍNH: THU HOẠCH & TRỒNG HOA ═══════
  async function tickFlowerAction() {
    if (dangBan) return false;

    // 1. Khóa độc quyền luồng hoa
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("flowers")) {
      return false;
    }
    dangBan = true;

    try {
      if (typeof S.isFlowBlocked === "function" && S.isFlowBlocked("flowers")) {
        return false;
      }

      // 1. Lấy dữ liệu Game State tươi mới qua Bridge
      let state = S.gameState;
      if (typeof S.requestBridgeState === "function") {
        try {
          state = await S.requestBridgeState(1500);
        } catch (_e) {}
      }

      const rawBeds = state?.resources?.flowers?.list || [];
      const flowerBeds = rawBeds.filter((b) => b && (b.x !== undefined || b.y !== undefined));

      if (flowerBeds.length > 0) {
        let daLamBridge = false;

        // A. THU HOẠCH HOA NỞ (Ready Flowers)
        const readyBeds = flowerBeds.filter((b) => b.isReady);
        if (readyBeds.length > 0) {
          const tenHoa = readyBeds.map((b) => b.name).join(", ");
          console.log(`%c[SFL Hoa] 🌸 Tìm thấy ${readyBeds.length} luống hoa đã nở (${tenHoa})! Tiến hành thu hoạch qua Game Bridge...`, "color: #00bcd4; font-weight: bold;");

          if (typeof S.harvestFlowersBridge === "function") {
            const resH = await S.harvestFlowersBridge(readyBeds.map((b) => b.id), 2500);
            if (resH && resH.ok) {
              console.log(`%c[SFL Hoa] 🎉 Thu hoạch thành công ${resH.harvestedCount || readyBeds.length} luống hoa nở!`, "color: #00e676; font-weight: bold; font-size: 13px;");
              daLamBridge = true;
            }
          }
        }

        // B. GIEO TRỒNG HOA VÀO CÁC LUỐNG TRỐNG (Empty Flower Beds)
        const emptyBeds = flowerBeds.filter((b) => !b.plantedAt || b.name === "Empty");
        if (emptyBeds.length > 0) {
          console.log(`%c[SFL Hoa] 🌱 Tìm thấy ${emptyBeds.length} luống hoa trống trên đảo! Tiến hành gieo trồng & thụ phấn chéo qua Game Bridge...`, "color: #ff9800; font-weight: bold;");

          if (typeof S.plantFlowersBridge === "function") {
            const resP = await S.plantFlowersBridge(emptyBeds.map((b) => b.id), 2500);
            if (resP && resP.ok && resP.plantedCount > 0) {
              const details = (resP.plantedDetails || []).map((d) => `${d.seed} (+${d.amount} ${d.crossbreed})`).join(" | ");
              console.log(
                `%c[SFL Hoa] 🎉 ĐÃ GIEO TRỒNG THÀNH CÔNG ${resP.plantedCount} LUỐNG HOA MỚI! (${details})`,
                "color: #00e676; font-weight: bold; font-size: 13px;"
              );
              daLamBridge = true;
            } else {
              console.log(`[SFL Hoa] ℹ️ Có ${emptyBeds.length} luống hoa trống nhưng trong kho chưa đủ hạt giống hoa hoặc nông sản thụ phấn chéo.`);
            }
          }
        }

        if (daLamBridge) return true;
        if (readyBeds.length === 0 && emptyBeds.length === 0) return false;
      }

      // 2. FALLBACK DOM NẾU CẦN
      const luongs = timLuongHoaDOM();
      if (luongs.length === 0) return false;

      let daLam = 0;
      for (const l of luongs) {
        if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
          S.__captchaInterrupted = true;
          break;
        }
        clickTam(l);
        daLam++;
        await ngu(300 + Math.floor(Math.random() * 100));
      }

      return daLam > 0;
    } catch (err) {
      console.error("[SFL Hoa] Lỗi:", err);
      return false;
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa("flowers");
      }
    }
  }

  S.tickFlowerAction = tickFlowerAction;
  S.tickFlowers = tickFlowerAction;

})(window.SFL = window.SFL || {});
