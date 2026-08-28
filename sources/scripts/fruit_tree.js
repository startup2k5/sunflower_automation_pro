// ═══════════════════════════════════════════════════════════════════
// LUỒNG THU HOẠCH & ĐỐN CÂY ĂN QUẢ (fruit_tree.js)
// Dựa vào Game Bridge để kiểm tra quả chín & đốn cây chết khi hết lượt hái
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

  function timCayAnQuaDOM() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacAnhFruit = doc.querySelectorAll(
        "img[src*='fruit/'], img[src*='apple'], img[src*='orange'], img[src*='blueberry'], img[src*='banana'], img[src*='lemon'], img[src*='tomato'], img[src*='dead_tree'], img[src*='dead'], img[src*='bushShrub'], img[src*='shrub'], img[src*='replenished']"
      );
      for (const img of cacAnhFruit) {
        if (!xemPhanTuRanh(img)) continue;
        const clickable = img.closest('.cursor-pointer, [class*="cursor-pointer"], [data-map-placement="true"]') || img;
        if (!danhSach.includes(clickable)) danhSach.push(clickable);
      }
    }
    return danhSach;
  }

  async function tickFruitTree() {
    if (dangBan) return false;

    if (typeof S.xinKhoa === "function" && !S.xinKhoa("fruit_tree")) {
      return false;
    }
    dangBan = true;

    try {
      if (typeof S.isFlowBlocked === "function" && S.isFlowBlocked("fruit_tree")) {
        return false;
      }

      // 1. Cập nhật dữ liệu từ Game Bridge
      let state = S.gameState;
      if (typeof S.requestBridgeState === "function") {
        try {
          state = await S.requestBridgeState(1200);
        } catch (_e) {}
      }

      // 2. ƯU TIÊN GAME BRIDGE (SIÊU TỐC & CHÍNH XÁC 100%)
      const fruitList = state?.resources?.fruitPatches?.list;
      if (Array.isArray(fruitList) && fruitList.length > 0) {
        let daLamBridge = false;

        // A. Thu hoạch quả chín (isReady)
        const readyPatches = fruitList.filter((f) => f.isReady);
        if (readyPatches.length > 0) {
          const tenQua = readyPatches.map((p) => p.name).join(", ");
          console.log(`%c[SFL Cây Ăn Quả] 🍎 Tìm thấy ${readyPatches.length} cây ăn quả chín (${tenQua})! Thu hoạch qua Game Bridge...`, "color: #00bcd4; font-weight: bold;");

          if (typeof S.harvestFruitBridge === "function") {
            const resH = await S.harvestFruitBridge(readyPatches.map((p) => p.id), 2500);
            if (resH && resH.ok) {
              console.log(`%c[SFL Cây Ăn Quả] 🎉 Thu hoạch thành công ${resH.harvestedCount || readyPatches.length} cây ăn quả!`, "color: #00e676; font-weight: bold; font-size: 13px;");
              daLamBridge = true;
            }
          }
        }

        // B. Đốn hạ gốc cây ăn quả chết (isDead)
        const deadPatches = fruitList.filter((f) => f.isDead);
        if (deadPatches.length > 0) {
          const bumpkin = state?.bumpkin || {};
          const skills = bumpkin?.skills || {};
          const collectibles = state?.collectibles || {};
          const hasForemanBeaver = !!(collectibles["Foreman Beaver"] && collectibles["Foreman Beaver"].length);
          const hasNoAxeNoWorries = !!skills["No Axe No Worries"];
          const freeAxes = hasForemanBeaver || hasNoAxeNoWorries;

          let axes = Number(state?.inventory?.["Axe"] || 0);

          // Nếu chưa có rìu và không được rìu miễn phí, tự động chế tạo Rìu qua Bridge
          if (!freeAxes && axes <= 0 && typeof S.craftToolBridge === "function") {
            try {
              console.log(`[SFL Cây Ăn Quả] 🪓 Cần đốn ${deadPatches.length} gốc cây chết, tiến hành chế tạo Rìu...`);
              const resCraft = await S.craftToolBridge("Axe", Math.min(deadPatches.length, 5), 2500);
              if (resCraft && resCraft.ok) {
                axes = Math.min(deadPatches.length, 5);
              }
            } catch (_e) {}
          }

          if (freeAxes || axes > 0) {
            console.log(`%c[SFL Cây Ăn Quả] 🪓 Tìm thấy ${deadPatches.length} gốc cây ăn quả chết (Rìu: ${freeAxes ? "Miễn phí (Skill/Beaver)" : axes}). Tiến hành đốn hạ qua Game Bridge...`, "color: #ff9800; font-weight: bold;");
            if (typeof S.removeDeadFruitTreeBridge === "function") {
              const resR = await S.removeDeadFruitTreeBridge(deadPatches.map((p) => p.id), 2500);
              if (resR && resR.ok) {
                console.log(`%c[SFL Cây Ăn Quả] 🎉 Đã đốn hạ thành công ${resR.removedCount || deadPatches.length} gốc cây ăn quả chết!`, "color: #00e676; font-weight: bold; font-size: 13px;");
                daLamBridge = true;
              }
            }
          } else {
            console.log(`[SFL Cây Ăn Quả] ℹ️ Có ${deadPatches.length} gốc cây chết nhưng không có Rìu (Axe = 0) và chưa đủ tài nguyên tạo Rìu.`);
          }
        }

        // C. Tự động gieo trồng cây ăn quả vào các ô đất trống (isEmpty)
        const emptyPatches = fruitList.filter((f) => f.isEmpty || f.name === "Empty" || !f.plantedAt);
        if (emptyPatches.length > 0) {
          if (typeof S.plantFruitBridge === "function") {
            console.log(`%c[SFL Cây Ăn Quả] 🌱 Tìm thấy ${emptyPatches.length} ô đất cây ăn quả trống! Tiến hành gieo trồng qua Game Bridge...`, "color: #00bcd4; font-weight: bold;");
            const resP = await S.plantFruitBridge(null, emptyPatches.map((p) => p.id), 2500);
            if (resP && resP.ok && resP.plantedCount > 0) {
              const details = (resP.plantedDetails || []).map((d) => d.seed).join(", ");
              console.log(
                `%c[SFL Cây Ăn Quả] 🎉 ĐÃ GIEO TRỒNG THÀNH CÔNG ${resP.plantedCount} CÂY ĂN QUẢ MỚI! (${details})`,
                "color: #00e676; font-weight: bold; font-size: 13px;"
              );
              daLamBridge = true;
            } else {
              console.log(`[SFL Cây Ăn Quả] ℹ️ Có ${emptyPatches.length} ô đất trống nhưng trong kho không còn hạt giống ăn quả theo mùa.`);
            }
          }
        }

        if (daLamBridge) return true;
        if (readyPatches.length === 0 && deadPatches.length === 0 && emptyPatches.length === 0) return false;
      }

      // 3. FALLBACK DOM NẾU BRIDGE CHƯA KẾT NỐI
      const trees = timCayAnQuaDOM();
      if (trees.length === 0) return false;

      let daLam = 0;
      for (const t of trees) {
        if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
          S.__captchaInterrupted = true;
          break;
        }
        clickTam(t);
        daLam++;
        await ngu(300 + Math.floor(Math.random() * 100));
      }

      return daLam > 0;
    } catch (err) {
      console.error("[SFL Cây Ăn Quả] Lỗi:", err);
      return false;
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa("fruit_tree");
      }
    }
  }

  S.tickFruitTree = tickFruitTree;

})(window.SFL = window.SFL || {});
