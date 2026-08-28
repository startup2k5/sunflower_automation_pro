// ═══════════════════════════════════════════════════════════════════
// LUỒNG TỰ ĐỘNG GIAO ĐƠN HÀNG TOÀN DIỆN v6.2 (deliveries.js)
// HỖ TRỢ ĐỘC QUYỀN TÀI KHOẢN VIP (+2 TICKET THƯỞNG) & TÀI KHOẢN THƯỜNG
// TỰ ĐỘNG BỎ QUA MÓN ĐẮT TIỀN / QUẶNG QUÝ — GIAO BOUNTIES POPPY & NHẬN THƯỞNG WEEKLY CHORES
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const LUXURY_SKIP_ITEMS = new Set([
    // Món ăn chế biến phức tạp
    "Tofu Scramble", "Power Smoothie", "Bumpkin Ganoush", "Boiled Eggs", "Mushroom Soup",
    "Bumpkin Broth", "Kale Stew", "Sunflower Cake", "Orange Cake", "Parsnip Cake",
    "Honey Cake", "Honey Cheddar", "Pizza Margherita", "Antipasto", "Rice Bun",
    "Beetroot Salad", "Cauliflower Burger", "Mushroom Salad", "Pancakes", "Roast Veggies",
    "Club Sandwich", "Apple Pie", "Pumpkin Soup", "Fruit Salad", "Chowder", "Gumbo",
    "Fermented Carrots", "Sauerkraut",
    // Cá hiếm & đồ câu biển giá trị cao
    "Tuna", "Squid", "Anchovy", "Crab Pot", "Mariner Pot", "Mahi Mahi", "Swordfish",
    "Oarfish", "Whale", "Sea Horse", "Giant Squid", "Sunfish", "Coelacanth",
    // Cổ vật & báu vật đào cát
    "Hieroglyph", "Sand Shovel", "Pirate Bounty", "Camel Bone", "Cockle Shell", "Pipi Shell", "Clam Shell",
    // Búp bê chế tạo đặc biệt
    "Cluck Doll", "Victoria Sister", "Goblin Doll"
  ]);

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
    } catch (_e2) {}

    setTimeout(() => {
      try {
        if (typeof el.blur === "function") el.blur();
      } catch (_e6) {}
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

  // ═══════ LUỒNG CHÍNH: GIAO ĐƠN HÀNG TỰ ĐỘNG (VIP & THƯỜNG) ═══════
  async function tickDeliveries() {
    if (dangBan) return false;

    if (typeof S.xinKhoa === "function" && !S.xinKhoa("deliveries")) {
      return false;
    }
    dangBan = true;

    try {
      if (typeof S.isFlowBlocked === "function" && S.isFlowBlocked("deliveries")) {
        return false;
      }

      // 1. Lấy dữ liệu Game State tươi mới nhất qua Bridge
      let state = S.gameState;
      if (typeof S.requestBridgeState === "function") {
        try {
          state = await S.requestBridgeState(1500);
        } catch (_e) {}
      }
      if (!state) state = S.gameState;

      const isVip = !!state?.user?.isVip;
      const loaiTaiKhoan = isVip ? "👑 TÀI KHOẢN VIP (+2 Tickets Thưởng)" : "🌾 TÀI KHOẢN THƯỜNG";
      const orders = state?.orders || [];
      const inv = state?.inventory || {};
      const coins = Number(state?.user?.coins ?? state?.coins ?? 0);
      const sfl = Number(state?.user?.balanceSFL ?? state?.balance ?? 0);
      const now = Date.now();

      console.log(
        `%c[SFL Giao Đơn Hàng v6.2] 📦 Quét ${orders.length} đơn hàng NPC / Thuyền (${loaiTaiKhoan})...`,
        isVip ? "color: #ffd700; font-weight: bold; font-size: 13px;" : "color: #00bcd4; font-weight: bold; font-size: 13px;"
      );

      // Hiển thị bảng chi tiết trạng thái tất cả các đơn hàng trong game
      if (orders.length > 0) {
        const orderSummary = orders.map((ord) => {
          let du = true;
          const reqList = [];
          const reqItems = ord.items || {};
          let coVatPhamDatTien = false;

          for (const [item, reqQty] of Object.entries(reqItems)) {
            const numReq = Number(reqQty || 0);
            let inStock = 0;
            if (item === "coins") inStock = coins;
            else if (item === "sfl") inStock = sfl;
            else inStock = Number(inv[item] || 0);

            if (
              LUXURY_SKIP_ITEMS.has(item) ||
              (item === "coins" && numReq > 1000) ||
              (item === "Gold" && numReq > 5) ||
              (item === "Iron" && numReq > 15)
            ) {
              coVatPhamDatTien = true;
            }

            const okItem = inStock >= numReq;
            if (!okItem) du = false;
            reqList.push(`${item}: ${inStock}/${numReq} ${okItem ? "✔️" : "❌"}`);
          }

          let trangThai = "⏳ Chờ nguyên liệu";
          if (ord.completedAt) trangThai = "✅ Đã giao";
          else if (coVatPhamDatTien) trangThai = "🚫 Bỏ qua (Món đắt tiền/quý)";
          else if (ord.readyAt && ord.readyAt > now) trangThai = "⏰ Chưa đến giờ";
          else if (du) trangThai = "🚀 Đủ hàng (Sẵn sàng giao)";

          return {
            "Khách Hàng": (ord.from || "NPC").toUpperCase(),
            "Yêu Cầu (Kho/Cần)": reqList.join(" | "),
            "Trạng Thái": trangThai,
          };
        });
        console.table(orderSummary);
      }

      let coHoatDong = false;

      // ── 1. GIAO ĐƠN HÀNG THUYỀN / NPC TIÊU CHUẨN QUA GAME BRIDGE ──
      if (typeof S.deliverOrdersBridge === "function") {
        const res = await S.deliverOrdersBridge(4000);
        if (res && res.ok && res.deliveredCount > 0) {
          coHoatDong = true;
          const list = res.deliveredList || [];
          console.log(
            `%c[SFL Giao Đơn Hàng] 🎉 ĐÃ GIAO THÀNH CÔNG ${res.deliveredCount} ĐƠN HÀNG QUA GAME BRIDGE! (${loaiTaiKhoan})`,
            "color: #00e676; font-weight: bold; font-size: 14px;"
          );

          console.table(
            list.map((d) => {
              const itemsStr = Object.entries(d.items || {})
                .map(([name, count]) => `${count}x ${name}`)
                .join(", ");
              const rewardCoins = d.reward?.coins ? `${d.reward.coins} Coins` : "";
              const rewardSfl = d.reward?.sfl ? `${d.reward.sfl} SFL` : "";
              const rewardItems = Object.entries(d.reward?.items || {})
                .map(([name, count]) => `${count}x ${name}`)
                .join(", ");
              const rewardStr = [rewardCoins, rewardSfl, rewardItems].filter(Boolean).join(" + ") || "EXP / Friendship";

              return {
                "Khách Hàng (NPC)": (d.from || "NPC").toUpperCase(),
                "Hàng Đã Giao": itemsStr,
                "Phần Thưởng Nhận Được": rewardStr,
                "Chế Độ VIP": d.isVip ? "👑 VIP (+2 Bonus)" : "Thường",
              };
            })
          );
          return true;
        }
      }

      // ── 2. FALLBACK DOM NẾU CẦN ──
      for (const doc of layTaiLieuGame()) {
        const board = doc.querySelector("img[src*='delivery_board'], img[src*='orders'], img[src*='npc/'], [data-map-placement*='delivery']");
        if (board && xemPhanTuRanh(board)) {
          clickTam(board);
          await ngu(800);

          const cacBtnDeliver = doc.querySelectorAll("button, [role='button'], div.cursor-pointer");
          let daGiaoDOM = 0;
          for (const btn of cacBtnDeliver) {
            if (!xemPhanTuRanh(btn) || btn.disabled) continue;
            const txt = (btn.textContent || "").toLowerCase();
            if (txt.includes("deliver") || txt.includes("giao")) {
              clickTam(btn);
              daGiaoDOM++;
              await ngu(500);
              break;
            }
          }
          await dongModal(doc);
          if (daGiaoDOM > 0) return true;
        }
      }

      return false;
    } catch (err) {
      console.error("[SFL Giao Đơn Hàng] Lỗi:", err);
      return false;
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa("deliveries");
      }
    }
  }

  S.tickDeliveries = tickDeliveries;

})(window.SFL = window.SFL || {});
