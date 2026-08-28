// ═══════════════════════════════════════════════════════════════════
// LUỒNG 11 — TỰ ĐỘNG TRỒNG RUỘNG CÂY TRỒNG (crops_plant.js)
// Tích hợp Game Bridge nhận diện Mùa chuẩn xác 100%:
// 1. Tự động đọc Mùa hiện tại (Spring / Summer / Autumn / Winter) qua Game Bridge hoặc DOM
// 2. Lọc danh sách hạt giống chuẩn mùa (SEASONAL_CROP_PLOT_SEEDS)
// 3. Tìm chính xác ô hạt giống theo slug/tên (CROP_SLUGS) trong giỏ đồ
// 4. Ưu tiên chọn hạt giống đúng mùa còn số lượng (từ ngắn ngày đến dài ngày)
// 5. Nếu hết hạt giống trồng ruộng -> trực tiếp bỏ qua luồng
// 6. Tách biệt tuyệt đối: CHỈ trồng vào ruộng đất, KHÔNG trồng vào hoa và quả
// 7. Gieo hạt trên cả ô đất trống thường (soil2.png) và ô đã rắc phân (icon phân bón)
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ═══════════════════════════════════════════════════════════════════
  // CẤU HÌNH HẠT GIỐNG NÔNG NGHIỆP THEO 4 MÙA (CROP PLOT SEEDS)
  // ═══════════════════════════════════════════════════════════════════
  const SEASONAL_CROP_PLOT_SEEDS = {
    spring: [
      "Sunflower Seed",
      "Rhubarb Seed",
      "Carrot Seed",
      "Cabbage Seed",
      "Soybean Seed",
      "Corn Seed",
      "Wheat Seed",
      "Kale Seed",
      "Barley Seed",
    ],
    summer: [
      "Sunflower Seed",
      "Potato Seed",
      "Zucchini Seed",
      "Pepper Seed",
      "Beetroot Seed",
      "Cauliflower Seed",
      "Eggplant Seed",
      "Radish Seed",
      "Wheat Seed",
    ],
    autumn: [
      "Potato Seed",
      "Pumpkin Seed",
      "Carrot Seed",
      "Yam Seed",
      "Broccoli Seed",
      "Soybean Seed",
      "Wheat Seed",
      "Barley Seed",
      "Artichoke Seed",
    ],
    winter: [
      "Potato Seed",
      "Cabbage Seed",
      "Beetroot Seed",
      "Cauliflower Seed",
      "Parsnip Seed",
      "Onion Seed",
      "Turnip Seed",
      "Wheat Seed",
      "Kale Seed",
    ],
  };

  // Map tên hạt sang Slug thư mục CDN game
  const CROP_SLUGS = {
    "Sunflower Seed": "sunflower",
    "Potato Seed": "potato",
    "Rhubarb Seed": "rhubarb",
    "Pumpkin Seed": "pumpkin",
    "Zucchini Seed": "zucchini",
    "Carrot Seed": "carrot",
    "Yam Seed": "yam",
    "Cabbage Seed": "cabbage",
    "Broccoli Seed": "broccoli",
    "Soybean Seed": "soybean",
    "Beetroot Seed": "beetroot",
    "Pepper Seed": "pepper",
    "Cauliflower Seed": "cauliflower",
    "Parsnip Seed": "parsnip",
    "Eggplant Seed": "eggplant",
    "Corn Seed": "corn",
    "Onion Seed": "onion",
    "Radish Seed": "radish",
    "Wheat Seed": "wheat",
    "Turnip Seed": "turnip",
    "Kale Seed": "kale",
    "Artichoke Seed": "artichoke",
    "Barley Seed": "barley",
  };

  // Thời gian sinh trưởng cơ bản của hạt (giây) để xếp thứ tự ưu tiên gieo
  const CROP_BASE_GROW_SEC = {
    "Sunflower Seed": 60,
    "Potato Seed": 5 * 60,
    "Rhubarb Seed": 10 * 60,
    "Pumpkin Seed": 30 * 60,
    "Zucchini Seed": 30 * 60,
    "Carrot Seed": 60 * 60,
    "Yam Seed": 60 * 60,
    "Cabbage Seed": 2 * 60 * 60,
    "Broccoli Seed": 2 * 60 * 60,
    "Soybean Seed": 3 * 60 * 60,
    "Beetroot Seed": 4 * 60 * 60,
    "Pepper Seed": 4 * 60 * 60,
    "Cauliflower Seed": 8 * 60 * 60,
    "Parsnip Seed": 12 * 60 * 60,
    "Eggplant Seed": 16 * 60 * 60,
    "Corn Seed": 20 * 60 * 60,
    "Onion Seed": 20 * 60 * 60,
    "Radish Seed": 24 * 60 * 60,
    "Wheat Seed": 24 * 60 * 60,
    "Turnip Seed": 24 * 60 * 60,
    "Kale Seed": 36 * 60 * 60,
    "Artichoke Seed": 36 * 60 * 60,
    "Barley Seed": 48 * 60 * 60,
  };

  // Danh sách các loại HOA QUẢ (Fruits / Trees) - TUYỆT ĐỐI KHÔNG ĐƯỢC GIEO VÀO ĐẤT RUỘNG!
  const DANH_SACH_HOA_QUA = [
    "apple", "orange", "blueberry", "banana", "lemon", "tomato", "grape", "olive",
    "sapling", "fruit_patch", "/fruit/"
  ];

  // Danh sách các loại HOA (Flowers) - TUYỆT ĐỐI KHÔNG ĐƯỢC GIEO VÀO ĐẤT RUỘNG!
  const DANH_SACH_HOA = [
    "sunpetal", "bloom", "lily", "edelweiss", "gladiolus", "lavender", "clover", "lotus",
    "daisy", "rose", "tulip", "cosmos", "pansy", "orchid", "carnation", "hyacinth",
    "daffodil", "chamomile", "poppy", "marigold", "bluebell", "dahlia", "/flowers/"
  ];

  // Danh sách các loại cây trồng nông nghiệp (Crops) hợp lệ trên đất ruộng (soil)
  const DANH_SACH_CROPS_RUONG = [
    "sunflower", "potato", "pumpkin", "carrot", "cabbage", "beetroot",
    "cauliflower", "parsnip", "eggplant", "radish", "corn", "wheat",
    "rhubarb", "zucchini", "yam", "broccoli", "artichoke", "pepper",
    "turnip", "onion", "garlic", "soybean", "barley", "rice", "kale", "saltwort"
  ];

  // Lấy danh sách document của game (kể cả iframe và window.top)
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
    try { if (window.top && window.top.document) { them(window.top.document); nganXep.push(window.top.document); } } catch (_e) {}
    try { if (window.parent && window.parent.document) { them(window.parent.document); nganXep.push(window.parent.document); } } catch (_e) {}

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

  // Kiểm tra phần tử đang hiển thị
  function xemPhanTuRanh(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const view = el.ownerDocument?.defaultView || window;
    let style;
    try { style = view.getComputedStyle(el); } catch (_e) { return false; }
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  // NHẬN DIỆN ICON PHÂN BÓN (Sprout Mix / Rapid Root) TRÊN Ô RUỘNG
  function laCoIconPhanBon(el) {
    if (!el) return false;
    const cacIcon = el.querySelectorAll('.z-20 img, [class*="z-20"] img');
    for (const img of cacIcon) {
      if (!xemPhanTuRanh(img)) continue;
      const src = (img.currentSrc || img.src || img.getAttribute("src") || "").toLowerCase();
      if (
        src.includes("sprout_mix") || src.includes("fertiliser") || src.includes("fertilizer") ||
        src.includes("rapid_root") || src.includes("powerup") || src.includes("level_up") ||
        src.includes("stopwatch")
      ) {
        return true;
      }
      const st = img.getAttribute("style") || "";
      const mW = st.match(/width:\s*([\d.]+)px/i);
      const w = mW ? parseFloat(mW[1]) : NaN;
      if (w > 0 && w <= 16.5) return true;
    }
    return false;
  }

  // Kích hoạt trực tiếp handler React nếu có
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

  // Click chuẩn xác vào tâm phần tử
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
      el.dispatchEvent(new PointerEvent("pointerdown", downOpts));
      el.dispatchEvent(new MouseEvent("mousedown", downOpts));
      el.dispatchEvent(new PointerEvent("pointerup", upOpts));
      el.dispatchEvent(new MouseEvent("mouseup", upOpts));
      el.dispatchEvent(new MouseEvent("click", baseOpts));
      try { el.click?.(); } catch (_e) {}
      kichHoatReactProps(el);
    } catch (_e) {}

    const placement = el.closest?.('[data-map-placement="true"]') || el;
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
    }, 60);

    return true;
  }

  // Phân tích tọa độ từ style (50% ± px)
  function phanTichToaDo(styleStr) {
    if (!styleStr) return { x: 0, y: 0, key: "x_0_y_0" };
    const topMatch = styleStr.match(/top:\s*calc\(50%\s*([-+])\s*(\d+(\.\d+)?)px\)/i);
    const leftMatch = styleStr.match(/left:\s*calc\(50%\s*([-+])\s*(\d+(\.\d+)?)px\)/i);
    let y = topMatch ? (topMatch[1] === "-" ? -parseFloat(topMatch[2]) : parseFloat(topMatch[2])) : 0;
    let x = leftMatch ? (leftMatch[1] === "-" ? -parseFloat(leftMatch[2]) : parseFloat(leftMatch[2])) : 0;
    return { x, y, key: `x_${x}_y_${y}` };
  }

  // Kiểm tra ô bị ảnh hưởng bởi thời tiết xấu / thiên tai
  function laOBiAnhHuongThoiTiet(el) {
    if (!el) return false;
    const imgs = Array.from(el.querySelectorAll("img"));
    for (const img of imgs) {
      const src = (img.currentSrc || img.src || img.getAttribute("src") || "").toLowerCase();
      const alt = (img.getAttribute("alt") || "").toLowerCase();
      if (
        src.includes("weather") || src.includes("disaster") ||
        src.includes("tornado") || src.includes("freeze") || src.includes("frozen") ||
        src.includes("ice") || src.includes("snow") || src.includes("tsunami") ||
        src.includes("lightning") || src.includes("storm") || src.includes("drought") ||
        src.includes("caterpillar") || src.includes("locust") || src.includes("pest") ||
        alt.includes("weather") || alt.includes("freeze") || alt.includes("tornado")
      ) {
        return true;
      }
    }
    const txt = (el.textContent || "").toLowerCase();
    if (txt.includes("frozen") || txt.includes("drought") || txt.includes("infested") || txt.includes("disaster")) {
      return true;
    }
    if (el.classList.contains("frozen") || !!el.querySelector('[class*="weather"], [class*="disaster"]')) {
      return true;
    }
    return false;
  }

  // Lấy mùa hiện tại (kết hợp Game Bridge và DOM fallback)
  function layMuaHienTai() {
    // 1. Ưu tiên lấy từ Game Bridge
    if (typeof S.getGameSeason === "function") {
      const bridgeSeason = S.getGameSeason();
      if (bridgeSeason) return bridgeSeason;
    }
    if (S.gameSeason) {
      return S.gameSeason;
    }

    // 2. Dự phòng: Đọc tiêu đề nhóm hạt giống trên DOM giỏ đồ
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      const cacNhan = doc.querySelectorAll("div, span, p");
      for (const n of cacNhan) {
        if (!xemPhanTuRanh(n)) continue;
        const txt = (n.textContent || "").trim().toLowerCase();
        if (txt.includes("spring seeds") || txt === "spring") return "spring";
        if (txt.includes("summer seeds") || txt === "summer") return "summer";
        if (txt.includes("autumn seeds") || txt.includes("fall seeds") || txt === "autumn" || txt === "fall") return "autumn";
        if (txt.includes("winter seeds") || txt === "winter") return "winter";
      }
    }

    return "spring";
  }

  // Kiểm tra xem giỏ đồ (lưới phân bón / hạt giống) có đang mở thật sự trên màn hình không
  function khoDoDangHienThi() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      const cacNhan = doc.querySelectorAll("div, span, p, h1, h2, h3");
      for (const n of cacNhan) {
        if (!xemPhanTuRanh(n)) continue;
        const txt = (n.textContent || "").trim();
        if (
          txt.includes("Seeds") ||
          txt === "Spring Seeds" || txt.startsWith("Spring Seeds") ||
          txt === "Summer Seeds" || txt.startsWith("Summer Seeds") ||
          txt === "Autumn Seeds" || txt.startsWith("Autumn Seeds") ||
          txt === "Winter Seeds" || txt.startsWith("Winter Seeds") ||
          txt === "Season Seeds" || txt.startsWith("Season Seeds")
        ) {
          return true;
        }
      }
      // Hoặc có modal dialog với tab Basket
      const scrollable = doc.querySelector('.scrollable, div[style*="dark_border.png"]');
      if (scrollable && xemPhanTuRanh(scrollable)) return true;
    }
    return false;
  }

  // Đóng TRIỆT ĐỂ tất cả popup đang mở
  async function dongHetPopup() {
    const MAX_VONG = 5;
    for (let vong = 0; vong < MAX_VONG; vong += 1) {
      let daClick = false;
      for (const doc of layTaiLieuGame()) {
        if (!doc || !doc.body) continue;
        const cacAnhClose = doc.querySelectorAll(
          'img[src*="close"], img[src*="cancel"], button[aria-label="close"], [class*="close-btn"], button:has(img[src*="close"])'
        );
        for (const img of cacAnhClose) {
          if (!xemPhanTuRanh(img)) continue;
          const nutDong = img.closest("button, [role='button'], div[class*='cursor-pointer']") || img;
          clickTam(nutDong);
          daClick = true;
          break;
        }
        if (daClick) break;
      }
      await ngu(350);
      if (!khoDoDangHienThi()) return;
    }
  }

  // Tìm icon mở giỏ đồ (Basket) trên HUD ngoài màn hình
  function timIconHoDo() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      const imgs = doc.querySelectorAll('img[src*="basket"]');
      for (const img of imgs) {
        if (!xemPhanTuRanh(img)) continue;
        if (img.closest('.scrollable, [role="dialog"], [role="modal"], div[style*="dark_border.png"]')) continue;
        if (img.getAttribute("alt") === "item") continue;
        const btn = img.closest("button, [role='button'], div.group, div.relative.cursor-pointer") || img;
        console.log(`[SFL Trồng Ruộng] 🔎 Tìm thấy icon Basket HUD: src="${(img.getAttribute("src") || "").substring(0, 60)}"`);
        return btn;
      }
    }
    return null;
  }

  // Đọc số lượng từ badge của một ô slot trong kho (trả về 0 nếu hết hạt hoặc bị mờ)
  function docSoLuongSlot(slot) {
    if (!slot) return 0;
    const text = (slot.textContent || "").trim();
    if (!text) return 0;

    const matches = text.match(/\d+/g);
    if (matches && matches.length > 0) {
      const count = parseInt(matches[matches.length - 1], 10);
      if (Number.isInteger(count) && count > 0) return count;
    }

    return 0;
  }

  // Tìm chính xác ô slot của một loại hạt giống trong DOM kho đồ
  function timSlotHatGiongChuan(doc, seedName) {
    if (!doc) return null;
    const slug = CROP_SLUGS[seedName] || seedName.toLowerCase().replace(/\s*seed\s*/i, "").trim();
    const imgs = Array.from(doc.querySelectorAll("img")).filter(xemPhanTuRanh);

    for (const img of imgs) {
      const src = (img.currentSrc || img.getAttribute("src") || img.src || "").toLowerCase();
      const alt = (img.getAttribute("alt") || "").toLowerCase();

      // Bỏ qua icon hệ thống, hoa, quả
      if (src.includes("game-assets/ui/") || src.includes("/ui/") || src.includes("/icons/") ||
          src.includes("close") || src.includes("cancel") || src.includes("tab_") ||
          src.includes("basket") || src.includes("chest") || src.includes("wardrobe") ||
          src.includes("chevron") || src.includes("arrow") || src.includes("panel/") ||
          src.includes("border") || src.includes("filter") || src.includes("selectbox") ||
          src.includes("search") || src.includes("coin") || src.includes("sfl_icon")) {
        continue;
      }
      if (src.includes("/fruit/") || src.includes("/flowers/")) continue;

      const isBroccoli = slug === "broccoli" || slug === "brocolli";
      const slugMatched = isBroccoli
        ? (src.includes("broccoli") || src.includes("brocolli") || alt.includes("broccoli"))
        : (src.includes(`/${slug}/`) || src.includes(`_${slug}`) || alt.includes(slug));

      if (slugMatched && (src.includes("seed") || src.includes("crop") || src.includes("/crops/") || alt.includes("seed") || alt.includes("item"))) {
        // Đi lên tìm wrapper click chuẩn xác (ô slot vuông)
        let clickTarget = img;
        let el = img.parentElement;
        for (let depth = 0; depth < 8 && el; depth += 1) {
          if (el.classList?.contains("cursor-pointer")) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.width <= 140 && r.height > 0 && r.height <= 140) {
              clickTarget = el;
              break;
            }
          }
          el = el.parentElement;
        }

        // Tìm wrapper cha chứa badge count
        let countWrap = clickTarget;
        let p = clickTarget.parentElement;
        for (let up = 0; up < 5 && p; up++) {
          if (/\d/.test(p.textContent || "")) {
            const r = p.getBoundingClientRect();
            if (r.width <= 140 && r.height <= 140) {
              countWrap = p;
              break;
            }
          }
          p = p.parentElement;
        }

        return { img, clickEl: clickTarget, slotWrap: countWrap };
      }
    }
    return null;
  }

  // Thuật toán chọn hạt giống tốt nhất theo mùa hiện tại
  function chonHatGiongTotNhat(doc) {
    const currentSeason = layMuaHienTai();
    const seasonSeeds = SEASONAL_CROP_PLOT_SEEDS[currentSeason] || SEASONAL_CROP_PLOT_SEEDS.spring;

    console.log(`%c[SFL Trồng Ruộng] 🌸 MÙA HIỆN TẠI: ${currentSeason.toUpperCase()}`, "color: #9c27b0; font-weight: bold; font-size: 14px;");
    console.log(`[SFL Trồng Ruộng] 📋 Danh sách hạt hợp lệ trong mùa ${currentSeason.toUpperCase()}:`, seasonSeeds);

    // 1. Kiểm tra hạt giống do người dùng cấu hình (nếu có)
    const prefSeed = S.cauHinh?.cropSeed || S.cauHinh?.cropDomSeedName;
    if (prefSeed && prefSeed !== "Auto") {
      const matchedPref = seasonSeeds.find((s) => s.toLowerCase().includes(prefSeed.toLowerCase()));
      if (matchedPref) {
        const slotData = timSlotHatGiongChuan(doc, matchedPref);
        if (slotData) {
          const bridgeCount = S.gameState?.inventory?.[matchedPref] ?? null;
          const domCount = docSoLuongSlot(slotData.slotWrap);
          const count = bridgeCount !== null && bridgeCount > 0 ? bridgeCount : domCount;
          if (count > 0) {
            console.log(`%c[SFL Trồng Ruộng] 🎯 Chọn hạt ưu tiên theo cấu hình: ${matchedPref} (Còn: ${count} hạt)`, "color: #4caf50; font-weight: bold;");
            return { slot: slotData.clickEl, ten: matchedPref, soLuong: count, viTri: 1, muc: `Mùa ${currentSeason.toUpperCase()}` };
          }
        }
      }
    }

    // 2. Sắp xếp danh sách hạt trong mùa theo thời gian sinh trưởng (ngắn -> dài)
    const sortedSeasonSeeds = [...seasonSeeds].sort((a, b) => {
      const ta = CROP_BASE_GROW_SEC[a] || 999999;
      const tb = CROP_BASE_GROW_SEC[b] || 999999;
      return ta - tb;
    });

    // 3. Duyệt từng hạt trong mùa để tìm loại đầu tiên còn số lượng > 0
    for (let i = 0; i < sortedSeasonSeeds.length; i += 1) {
      const seedName = sortedSeasonSeeds[i];
      const slotData = timSlotHatGiongChuan(doc, seedName);
      if (!slotData) continue;

      const bridgeCount = S.gameState?.inventory?.[seedName] ?? null;
      const domCount = docSoLuongSlot(slotData.slotWrap);
      const count = (bridgeCount !== null && bridgeCount > 0) ? bridgeCount : domCount;

      if (count > 0) {
        const growMin = Math.round((CROP_BASE_GROW_SEC[seedName] || 0) / 60);
        console.log(
          `%c[SFL Trồng Ruộng] 🌱 ĐÃ CHỌN HẠT GIỐNG ĐÚNG MÙA: ${seedName} (Thời gian: ${growMin}p | Còn: ${count} hạt)`,
          "color: #4caf50; font-weight: bold; font-size: 13px;"
        );
        return {
          slot: slotData.clickEl,
          ten: seedName,
          soLuong: count,
          viTri: i + 1,
          muc: `Mùa ${currentSeason.toUpperCase()}`,
        };
      }
    }

    console.log(`%c[SFL Trồng Ruộng] ℹ️ Không còn hạt giống nào thuộc mùa ${currentSeason.toUpperCase()} trong kho!`, "color: #ff9800; font-weight: bold;");
    return null;
  }

  // Chuẩn bị hạt giống: Mở kho đồ -> Click chọn hạt giống đúng mùa còn số lượng -> Đóng kho đồ
  async function chuanBiHatGiong() {
    console.log("[SFL Trồng Ruộng] 🔍 Bắt đầu kiểm tra hạt giống trong kho đồ theo mùa...");

    // Cập nhật State từ Game Bridge nếu có
    if (typeof S.requestBridgeState === "function") {
      try { await S.requestBridgeState(1200); } catch (_e) {}
    }

    // 1. Mở Giỏ đồ (Basket) nếu chưa mở
    let dangMo = khoDoDangHienThi();
    if (!dangMo) {
      console.log("[SFL Trồng Ruộng] 📦 Giỏ đồ chưa mở → Bấm mở giỏ đồ (Basket)...");
      const iconKho = timIconHoDo();
      if (!iconKho) {
        console.log("[SFL Trồng Ruộng] ⚠️ Không tìm thấy nút mở giỏ đồ trên màn hình.");
        return null;
      }
      clickTam(iconKho);

      for (let i = 0; i < 10; i += 1) {
        await ngu(250);
        if (khoDoDangHienThi()) {
          dangMo = true;
          break;
        }
      }
    }

    if (!dangMo) {
      console.log("[SFL Trồng Ruộng] ⚠️ Không thấy modal giỏ đồ hiển thị sau khi bấm mở.");
      return null;
    }

    let docModal = null;
    for (const doc of layTaiLieuGame()) {
      if (doc && doc.querySelector('.scrollable, div[style*="dark_border.png"]')) {
        docModal = doc;
        break;
      }
    }
    if (!docModal) docModal = document;

    // 2. ĐẢM BẢO ĐANG Ở ĐÚNG TAB "BASKET" (TUYỆT ĐỐI KHÔNG CLICK CHEST!)
    const cacTab = docModal.querySelectorAll(".flex.items-center.cursor-pointer");
    for (const tab of cacTab) {
      if (!xemPhanTuRanh(tab)) continue;
      const txt = (tab.textContent || "").trim();
      const hasBasket = txt.includes("Basket") || !!tab.querySelector('img[src*="basket"]');
      if (hasBasket) {
        clickTam(tab);
        await ngu(400);
        break;
      }
    }

    // 3. Tìm hạt giống đúng mùa trong kho
    let ketQuaHat = chonHatGiongTotNhat(docModal);
    if (!ketQuaHat) {
      for (const doc of layTaiLieuGame()) {
        if (doc !== docModal) {
          ketQuaHat = chonHatGiongTotNhat(doc);
          if (ketQuaHat) break;
        }
      }
    }

    if (!ketQuaHat) {
      console.log("%c[SFL Trồng Ruộng] ℹ️ Đã hết sạch hạt giống ruộng cho mùa hiện tại. Kết thúc luồng gieo hạt!", "color: #ff9800; font-weight: bold; font-size: 13px;");
      await dongHetPopup();
      return null;
    }

    // Click chắc chắn vào slot hạt giống để cầm ngoài tay
    clickTam(ketQuaHat.slot);
    await ngu(450);

    // Đóng hoàn toàn popup sau khi đã chọn hạt giống
    await dongHetPopup();
    await ngu(350);

    return ketQuaHat;
  }

  // Lọc danh sách các ô RUỘNG ĐẤT TRỐNG trên đảo để gieo hạt
  // TÁCH BIỆT TUYỆT ĐỐI: CHỈ LẤY RUỘNG ĐẤT, BỎ QUA HOÀN TOÀN LUỐNG HOA VÀ VƯỜN QUẢ!
  function timDanhSachRuongTrongCanGieo() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    const daThem = new Set();

    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;

      const cacO = doc.querySelectorAll('[data-map-placement="true"]');
      for (const el of cacO) {
        if (daThem.has(el) || !xemPhanTuRanh(el)) continue;

        const cacAnh = Array.from(el.querySelectorAll("img"));
        const duongDan = cacAnh.map((i) => (i.getAttribute("src") || i.src || "").toLowerCase());
        const noiDung = (el.textContent || "").trim().toLowerCase();

        // 1. TÁCH BIỆT: BỎ QUA LUỐNG HOA (flower_bed, /flowers/)
        const laHoa = duongDan.some((s) => s.includes("flower_bed") || s.includes("/flowers/"));
        if (laHoa) continue;

        // 2. TÁCH BIỆT: BỎ QUA VƯỜN QUẢ (fruit_patch, /fruit/)
        const laQua = duongDan.some((s) => s.includes("fruit_patch") || s.includes("/fruit/"));
        if (laQua) continue;

        // 3. TÁCH BIỆT: BỎ QUA THÙNG COMPOST, CÂY GỖ, ĐÁ QUẶNG, TỔ ONG
        const laKhac = duongDan.some((s) =>
          s.includes("composter") || s.includes("compost_bin") ||
          s.includes("tree") || s.includes("rock") || s.includes("beehive") || s.includes("boat")
        );
        if (laKhac) continue;

        // 4. PHẢI LÀ RUỘNG ĐẤT (soil, soil2, sand_dug, crops) HOẶC CÓ PHÂN BÓN TRÊN ĐẤT
        const laRuong = duongDan.some((s) =>
          s.includes("soil") || s.includes("sand_dug") || s.includes("/crops/") ||
          s.includes("sprout_mix") || s.includes("fertiliser") || s.includes("rapid_root")
        ) || (el.innerHTML || "").toLowerCase().includes("soil");
        if (!laRuong) continue;

        // 5. Ô BỊ KHÓA -> BỎ QUA
        const biKhoa = duongDan.some((s) => s.includes("lock")) || noiDung.includes("lock");
        if (biKhoa) continue;

        // 6. Ô BỊ ẢNH HƯỞNG THỜI TIẾT XẤU -> BỎ QUA
        if (laOBiAnhHuongThoiTiet(el)) continue;

        // 7. Ô ĐANG CÓ CÂY (cây chín hoặc cây đang phát triển / đếm giờ) -> BỎ QUA
        const laPhanBon = (s) => s.includes("sprout_mix") || s.includes("fertiliser") || s.includes("fertilizer") || s.includes("rapid_root");
        const coDemGio = /\d+\s*(?:mins?|secs?|hours?|hrs?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung);
        const laCayDangLon = duongDan.some((s) =>
          (s.includes("seedling") || s.includes("halfway") || s.includes("almost") || s.includes("growing") || (s.includes("sprout") && !s.includes("sprout_mix"))) && !laPhanBon(s)
        );
        const anhCayChin = duongDan.some((s) =>
          (s.includes("/crops/") || s.includes("/volcano/crops/")) &&
          (s.includes("plant") || s.includes("crop")) &&
          !s.includes("soil") && !s.includes("seed") && !laPhanBon(s)
        );

        if (coDemGio || laCayDangLon || anhCayChin) {
          continue;
        }

        // ĐÂY LÀ Ô RUỘNG TRỐNG HỢP LỆ (bao gồm cả đất thường và đất đã rắc phân)!
        const coords = phanTichToaDo(el.getAttribute("style") || "");
        const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer']") || el;
        const htmlToanBo = (el.outerHTML || el.innerHTML || "").toLowerCase();
        const coBadgePhan = laCoIconPhanBon(el);
        const daCoPhan = duongDan.some((s) =>
          s.includes("sprout_mix") || s.includes("fertiliser") || s.includes("fertilizer") || s.includes("rapid_root")
        ) || htmlToanBo.includes("sprout_mix") || htmlToanBo.includes("fertiliser") || htmlToanBo.includes("fertilizer") || htmlToanBo.includes("rapid_root") || coBadgePhan || (S.cacODaRacPhan instanceof Set && S.cacODaRacPhan.has(coords.key));

        daThem.add(el);
        danhSach.push({ el: nutClick, rootEl: el, coords, daCoPhan });
      }
    }

    return danhSach;
  }

  // Thực hiện gieo hạt vào tất cả các ô ruộng trống hợp lệ
  async function thucHienTrongRuong() {
    const danhSachRuong = timDanhSachRuongTrongCanGieo();
    if (danhSachRuong.length === 0) {
      console.log("[SFL Trồng Ruộng] ℹ️ Không có ô ruộng trống nào cần gieo hạt.");
      return false;
    }

    console.log(`[SFL Trồng Ruộng] 🌾 Phát hiện ${danhSachRuong.length} ô ruộng trống cần gieo hạt...`);

    // Chuẩn bị hạt giống lần đầu từ kho đồ (theo mùa)
    let hatHienTai = await chuanBiHatGiong();
    if (!hatHienTai) {
      return false;
    }

    let soHatConLai = hatHienTai.soLuong;
    let daTrong = 0;
    S.hanhDongCuoi = `🌱 Trồng ${hatHienTai.ten} (${danhSachRuong.length} ô)`;

    for (let i = 0; i < danhSachRuong.length; i += 1) {
      // Nhường luồng nếu gặp Captcha
      if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
        console.log("[SFL Trồng Ruộng] 🚨 Gặp Captcha khi đang gieo hạt! Tạm dừng luồng.");
        S.__captchaInterrupted = true;
        break;
      }

      // Nhường luồng nếu gặp Goblin Swarm
      if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) {
        console.log("[SFL Trồng Ruộng] 👺 Gặp Goblin Swarm khi đang gieo hạt! Tạm dừng luồng.");
        break;
      }

      // ── NẾU LOẠI HẠT HIỆN TẠI ĐÃ HẾT (hoặc = 0) -> MỞ KHO ĐỒ CHỌN TIẾP LOẠI HẠT MỚI ĐÚNG MÙA! ──
      if (soHatConLai <= 0) {
        console.log(`%c[SFL Trồng Ruộng] 🔄 Đã dùng hết hạt giống ${hatHienTai.ten}! Mở kho đồ để chọn loại hạt mùa mới gieo tiếp các ô còn lại...`, "color: #2196f3; font-weight: bold; font-size: 13px;");
        await dongHetPopup();
        await ngu(350);

        const hatMoi = await chuanBiHatGiong();
        if (!hatMoi) {
          console.log("%c[SFL Trồng Ruộng] ℹ️ Đã hết sạch tất cả các loại hạt giống mùa trong kho! Kết thúc gieo ruộng.", "color: #ff9800; font-weight: bold; font-size: 13px;");
          break;
        }

        hatHienTai = hatMoi;
        soHatConLai = hatHienTai.soLuong;
        S.hanhDongCuoi = `🌱 Trồng ${hatHienTai.ten}`;
        console.log(`%c[SFL Trồng Ruộng] 🌱 Đã chuyển sang loại hạt mùa mới: ${hatHienTai.ten} (Còn: ${soHatConLai} hạt). Tiếp tục gieo...`, "color: #4caf50; font-weight: bold; font-size: 13px;");
      }

      const oRuong = danhSachRuong[i];
      clickTam(oRuong.el || oRuong.rootEl);
      soHatConLai -= 1;
      daTrong += 1;

      // Cập nhật trạng thái trong S.mapData nếu có
      if (S.mapData && Array.isArray(S.mapData.cayTrong)) {
        const itemMap = S.mapData.cayTrong.find((c) => c.key === oRuong.coords.key);
        if (itemMap) {
          itemMap.trangThai = "dangPhatTrien";
          itemMap.laOTrong = false;
        }
      }

      const ghiChuPhan = oRuong.daCoPhan ? " (đã có phân ủ)" : "";
      console.log(`[SFL Trồng Ruộng] 🌱 [${daTrong}/${danhSachRuong.length}] Đã gieo ${hatHienTai.ten} vào ô (${oRuong.coords.key})${ghiChuPhan} (Còn ~${Math.max(0, soHatConLai)} hạt loại này)`);

      // Nghỉ an toàn tự nhiên giữa mỗi ô (450ms - 650ms)
      await ngu(450 + Math.floor(Math.random() * 200));
    }

    console.log(`%c[SFL Trồng Ruộng] ✔️ ĐÃ HOÀN TẤT GIEO HẠT CHO ${daTrong}/${danhSachRuong.length} Ô RUỘNG!`, "color: #4caf50; font-weight: bold; font-size: 14px;");
    return daTrong > 0;
  }

  // Hàm nhịp điều phối Scheduler
  async function tickCropPlant() {
    // 1. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return false;

    // 2. Captcha đang mở? → nhường luồng
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return false;

    // 3. Goblin Swarm đang chiếm farm? → dừng ngay
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    // 3. Đang bận?
    if (dangBan) return false;

    // 4. Xin khóa toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("crops_plant")) {
      return false;
    }

    dangBan = true;
    try {
      const daTrong = await thucHienTrongRuong();
      if (daTrong && typeof S.quetData === "function") {
        await ngu(400);
        await S.quetData();
      }
    } catch (err) {
      console.error("[SFL Trồng Ruộng] Lỗi trong luồng trồng ruộng cây trồng:", err);
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickCropPlant = tickCropPlant;
  S.SEASONAL_CROP_PLOT_SEEDS = SEASONAL_CROP_PLOT_SEEDS;
  S.CROP_SLUGS = CROP_SLUGS;
  S.layMuaHienTai = layMuaHienTai;
  S.chonHatGiongTotNhat = chonHatGiongTotNhat;

})(window.SFL = window.SFL || {});
