// ═══════════════════════════════════════════════════════════════════
// LUỒNG TRỒNG HẠT GIỐNG CHUẨN THEO MÙA (crops_plant.js)
// Sử dụng toàn bộ logic gieo hạt theo mùa chuẩn mực từ bản v4
// 1. Quét danh sách các ô ruộng đất trống (bỏ qua luống hoa & vườn quả)
// 2. Mở giỏ đồ chọn hạt giống đúng mùa có sẵn trong kho
// 3. Lần lượt gieo vào các ô ruộng đất trống (tự động đổi loại hạt nếu hết)
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Danh sách hạt giống cho đất thường theo 4 Mùa
  const SEASONAL_CROP_PLOT_SEEDS = {
    spring: ["Sunflower Seed", "Potato Seed", "Rhubarb Seed", "Carrot Seed", "Cabbage Seed", "Soybean Seed"],
    summer: ["Sunflower Seed", "Potato Seed", "Pepper Seed", "Corn Seed", "Zucchini Seed", "Soybean Seed"],
    autumn: ["Sunflower Seed", "Potato Seed", "Pumpkin Seed", "Carrot Seed", "Broccoli Seed", "Beetroot Seed"],
    winter: ["Sunflower Seed", "Potato Seed", "Yam Seed", "Beetroot Seed", "Cauliflower Seed", "Parsnip Seed", "Wheat Seed", "Kale Seed", "Barley Seed"],
  };

  const CROP_SLUGS = {
    "Sunflower Seed": ["sunflower", "sunflower_seed"],
    "Potato Seed": ["potato", "potato_seed"],
    "Rhubarb Seed": ["rhubarb", "rhubarb_seed"],
    "Carrot Seed": ["carrot", "carrot_seed"],
    "Cabbage Seed": ["cabbage", "cabbage_seed"],
    "Soybean Seed": ["soybean", "soybean_seed"],
    "Pepper Seed": ["pepper", "pepper_seed"],
    "Corn Seed": ["corn", "corn_seed"],
    "Zucchini Seed": ["zucchini", "zucchini_seed"],
    "Pumpkin Seed": ["pumpkin", "pumpkin_seed"],
    "Broccoli Seed": ["broccoli", "broccoli_seed"],
    "Beetroot Seed": ["beetroot", "beetroot_seed"],
    "Yam Seed": ["yam", "yam_seed"],
    "Cauliflower Seed": ["cauliflower", "cauliflower_seed"],
    "Parsnip Seed": ["parsnip", "parsnip_seed"],
    "Wheat Seed": ["wheat", "wheat_seed"],
    "Kale Seed": ["kale", "kale_seed"],
    "Barley Seed": ["barley", "barley_seed"],
  };

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
      el.dispatchEvent(new MouseEvent("mousedown", downOpts));
      el.dispatchEvent(new MouseEvent("mouseup", upOpts));
      el.dispatchEvent(new MouseEvent("click", baseOpts));
      try { el.click?.(); } catch (_e2) {}
      kichHoatReactProps(el);
      if (el.parentElement) kichHoatReactProps(el.parentElement);
    } catch (_e2) {}

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

  function phanTichToaDo(styleStr) {
    if (!styleStr) return { x: 0, y: 0, key: "x_0_y_0" };
    const topMatch = styleStr.match(/top:\s*calc\(50%\s*([-+])\s*(\d+(\.\d+)?)px\)/i);
    const leftMatch = styleStr.match(/left:\s*calc\(50%\s*([-+])\s*(\d+(\.\d+)?)px\)/i);
    let y = topMatch ? (topMatch[1] === "-" ? -parseFloat(topMatch[2]) : parseFloat(topMatch[2])) : 0;
    let x = leftMatch ? (leftMatch[1] === "-" ? -parseFloat(leftMatch[2]) : parseFloat(leftMatch[2])) : 0;
    return { x, y, key: `x_${x}_y_${y}` };
  }

  function timIconHoDo() {
    const docs = layTaiLieuGame();
    for (const doc of docs) {
      if (!doc || !doc.body) continue;
      const imgs = doc.querySelectorAll("img");
      for (const img of imgs) {
        const u = (img.currentSrc || img.src || img.getAttribute("src") || "").toLowerCase();
        if (u.includes("basket") || u.includes("inventory") || u.includes("chest.png")) {
          const btn = img.closest("button, [role='button'], div.cursor-pointer, [class*='cursor-pointer']") || img;
          if (xemPhanTuRanh(btn)) return btn;
        }
      }
    }
    return null;
  }

  function khoDoDangHienThi() {
    const docs = layTaiLieuGame();
    for (const doc of docs) {
      if (!doc || !doc.body) continue;
      const cacModal = doc.querySelectorAll('.scrollable, div[style*="dark_border.png"], [role="dialog"]');
      for (const m of cacModal) {
        if (!xemPhanTuRanh(m)) continue;
        const txt = (m.textContent || "").toLowerCase();
        if (txt.includes("basket") || txt.includes("chest") || txt.includes("inventory") || txt.includes("seeds")) {
          return true;
        }
      }
    }
    return false;
  }

  function laNutCloseChuan(el) {
    if (!el || !xemPhanTuRanh(el)) return false;
    const src = (el.src || el.getAttribute?.("src") || "").toLowerCase();
    const alt = (el.alt || el.getAttribute?.("alt") || "").toLowerCase();

    const pText = (el.parentElement?.textContent || el.closest?.("div, button, [role='button']")?.textContent || "").toLowerCase();
    if (pText.includes("vip") || src.includes("vip")) return false;
    if (el.closest?.('[class*="vip"], [id*="vip"], [data-name*="vip"]')) return false;

    // TUYỆT ĐỐI KHÔNG ĐƯỢC NHẬN NHẦM THÙNG COMPOST CLOSED HOẶC ĐỒ TRÊN ĐẢO!
    if (src.includes("compost") || src.includes("closed") || src.includes("building") || src.includes("island")) {
      return false;
    }
    const laAnhClose = src.includes("/ui/close") || src.includes("/icons/close") || src.includes("close.png") || src.includes("cancel.png") || alt === "close" || alt === "cancel";
    const laAriaClose = el.getAttribute?.("aria-label") === "close";
    const trongDialog = !!el.closest?.('[role="dialog"], [role="modal"], div[class*="modal"], .fixed.inset-0');
    return (laAnhClose || laAriaClose) && trongDialog;
  }

  async function dongHetPopup() {
    const docs = layTaiLieuGame();
    for (const doc of docs) {
      if (!doc || !doc.body) continue;
      const cacBtnClose = doc.querySelectorAll('img[src*="/ui/close"], img[src*="close.png"], img[src*="cancel.png"], button[aria-label="close"]');
      for (const img of cacBtnClose) {
        if (!laNutCloseChuan(img)) continue;
        const btn = img.closest("button, [role='button']") || img;
        clickTam(btn);
        await ngu(250);
        break;
      }
    }
    try {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    } catch (_e) {}
    await ngu(200);
  }

  // Tìm slot hạt giống trong kho đồ
  function timSlotHatGiong(doc, seedName) {
    const slugs = CROP_SLUGS[seedName] || [seedName.toLowerCase().replace(/\s+/g, "_")];
    const imgs = doc.querySelectorAll("img");
    for (const img of imgs) {
      const src = (img.currentSrc || img.src || img.getAttribute("src") || "").toLowerCase();
      const khop = slugs.some((s) => src.includes(s));
      if (khop) {
        const slot = img.closest(".cursor-pointer, button, [class*='cursor-pointer']") || img;
        if (xemPhanTuRanh(slot)) {
          return slot;
        }
      }
    }
    return null;
  }

  // Tìm và chọn hạt giống trên thanh Hotbar ngoài màn hình nếu có
  function chonHatTrenHotbar(tenHat) {
    const docs = layTaiLieuGame();
    const baseCrop = tenHat.toLowerCase().replace(/\s*seed\s*/i, "").trim();
    for (const doc of docs) {
      if (!doc || !doc.body) continue;
      const imgs = doc.querySelectorAll("img");
      for (const img of imgs) {
        if (!xemPhanTuRanh(img)) continue;
        if (img.closest('[role="dialog"], .scrollable, .overflow-y-auto')) continue;
        const src = (img.src || img.getAttribute("src") || "").toLowerCase();
        const alt = (img.alt || img.getAttribute("alt") || "").toLowerCase();
        const matchSeed =
          (src.includes(baseCrop) && src.includes("seed")) ||
          src.includes(`${baseCrop}_seed`) ||
          (alt.includes(baseCrop) && alt.includes("seed"));

        if (matchSeed) {
          const btn = img.closest("button, [role='button'], div.cursor-pointer, [class*='cursor-pointer']") || img;
          if (xemPhanTuRanh(btn)) {
            console.log(`%c[SFL Trồng Ruộng] 🌾 Chọn hạt ${tenHat} trực tiếp trên Hotbar!`, "color: #4caf50; font-weight: bold;");
            clickTam(btn);
            return true;
          }
        }
      }
    }
    return false;
  }

  // Chuẩn bị hạt giống: ƯU TIÊN 100% GAME BRIDGE & HOTBAR (KHÔNG MỞ KHO ĐỒ)
  async function chuanBiHatGiong(tenHatChon, soLuongHat) {
    console.log(`%c[SFL Trồng Ruộng] 🌱 Lấy hạt giống "${tenHatChon}" qua Game Bridge (không mở kho đồ)...`, "color: #00bcd4; font-weight: bold;");

    // 1. Thử chọn qua Game Bridge (gọi shortcutItem trong React Context)
    if (typeof S.selectItemBridge === "function") {
      const ok = await S.selectItemBridge(tenHatChon, 1500);
      if (ok) {
        console.log(`%c[SFL Trồng Ruộng] ✔️ Game Bridge đã chọn ${tenHatChon} thành công trên tay!`, "color: #4caf50; font-weight: bold;");
        return { tenHat: tenHatChon, soLuong: soLuongHat };
      }
    }

    // 2. Thử chọn trực tiếp trên Hotbar ngoài màn hình
    if (chonHatTrenHotbar(tenHatChon)) {
      await ngu(400);
      return { tenHat: tenHatChon, soLuong: soLuongHat };
    }

    // 3. Fallback: Nếu không có Game Bridge và không có trên Hotbar, mở Basket chọn nhanh và đóng ngay
    console.log(`[SFL Trồng Ruộng] 📦 Mở giỏ đồ chọn nhanh hạt ${tenHatChon}...`);
    let dangMo = khoDoDangHienThi();
    if (!dangMo) {
      const iconKho = timIconHoDo();
      if (!iconKho) return null;
      clickTam(iconKho);
      for (let i = 0; i < 8; i++) {
        await ngu(250);
        if (khoDoDangHienThi()) { dangMo = true; break; }
      }
    }

    if (!dangMo) return null;

    for (const doc of layTaiLieuGame()) {
      const cacTab = doc.querySelectorAll(".flex.items-center.cursor-pointer, button, [role='tab']");
      for (const tab of cacTab) {
        if (!xemPhanTuRanh(tab)) continue;
        const txt = (tab.textContent || "").trim();
        if (txt.includes("Basket") || !!tab.querySelector('img[src*="basket"]')) {
          clickTam(tab);
          await ngu(400);
          break;
        }
      }

      const slot = timSlotHatGiong(doc, tenHatChon);
      if (slot) {
        console.log(`%c[SFL Trồng Ruộng] 🌱 Đã click chọn ${tenHatChon} trong giỏ đồ!`, "color: #4caf50; font-weight: bold;");
        clickTam(slot);
        await ngu(400);
        await dongHetPopup();
        return { tenHat: tenHatChon, soLuong: soLuongHat };
      }
    }

    await dongHetPopup();
    return null; // KHÔNG CẦM ĐƯỢC HẠT TRÊN TAY -> TRẢ VỀ NULL, TUYỆT ĐỐI KHÔNG CLICK KHỐNG!
  }

  // Quét danh sách các ô RUỘNG ĐẤT TRỐNG trên đảo để gieo hạt
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

        // Bỏ qua hoa, quả, composter, cây, đá
        if (duongDan.some((s) => s.includes("flower_bed") || s.includes("/flowers/") || s.includes("fruit_patch") || s.includes("/fruit/") || s.includes("composter") || s.includes("tree") || s.includes("rock") || s.includes("beehive"))) continue;

        // Phải là đất ruộng
        const laRuong = duongDan.some((s) => s.includes("soil") || s.includes("sand_dug") || s.includes("/crops/")) || (el.innerHTML || "").toLowerCase().includes("soil");
        if (!laRuong) continue;

        // Bỏ qua đất khô cằn / infertile (thiếu giếng nước)
        const laDatKho = duongDan.some((s) => s.includes("soil_dry") || s.includes("soil_not_fertile"));
        if (laDatKho) continue;

        // Đang có cây hoặc đếm giờ -> Bỏ qua
        const coDemGio = /\d+\s*(?:mins?|secs?|hours?|hrs?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung);
        const laCayDangLon = duongDan.some((s) => s.includes("seedling") || s.includes("halfway") || s.includes("growing") || (s.includes("sprout") && !s.includes("sprout_mix")));
        const anhCayChin = duongDan.some((s) => (s.includes("/crops/") || s.includes("/volcano/crops/")) && (s.includes("plant") || s.includes("crop")) && !s.includes("soil") && !s.includes("seed"));
        if (coDemGio || laCayDangLon || anhCayChin) continue;

        const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer']") || el;
        const coords = phanTichToaDo(el.getAttribute("style") || "");
        daThem.add(el);
        danhSach.push({ el: nutClick, rootEl: el, coords });
      }
    }
    return danhSach;
  }

  // Thực hiện quy trình gieo hạt
  async function tickCropPlant() {
    if (dangBan) return false;

    // 1. Khóa độc quyền toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("crops_plant")) {
      return false;
    }
    dangBan = true;

    try {
      if (typeof S.isFlowBlocked === "function" && S.isFlowBlocked("crops_plant")) {
        return false;
      }

      // 2. Quét các ô ruộng đất trống
      const danhSachRuong = timDanhSachRuongTrongCanGieo();
      if (danhSachRuong.length === 0) {
        return false;
      }

      // 3. Đọc hạt giống từ Game Bridge / S.gameState
      let state = S.gameState;
      if (!state && typeof S.requestBridgeState === "function") {
        state = await S.requestBridgeState(1500);
      }

      const season = (state?.user?.season || S.gameSeason || "spring").toLowerCase();
      const seedsCuaMua = SEASONAL_CROP_PLOT_SEEDS[season] || SEASONAL_CROP_PLOT_SEEDS.spring;
      const inv = state?.inventory || S.userData?.inventory || {};

      // Tìm loại hạt giống mùa có số lượng > 0
      let tenHatChon = null;
      let soLuongHat = 0;
      for (const seedName of seedsCuaMua) {
        if ((inv[seedName] || 0) > 0) {
          tenHatChon = seedName;
          soLuongHat = inv[seedName];
          break;
        }
      }

      // Fallback bất kỳ hạt giống nào trong kho
      if (!tenHatChon) {
        for (const [k, v] of Object.entries(inv)) {
          if (k.endsWith(" Seed") && v > 0) {
            tenHatChon = k;
            soLuongHat = v;
            break;
          }
        }
      }

      if (!tenHatChon || soLuongHat <= 0) {
        console.log(`[SFL Trồng Ruộng] ℹ️ Đã hết hạt giống trong kho -> Bỏ qua gieo hạt.`);
        return false;
      }

      // 4. LẤY HẠT GIỐNG QUA GAME BRIDGE (KHÔNG CẦN MỞ KHO ĐỒ)
      let hatInfo = await chuanBiHatGiong(tenHatChon, soLuongHat);
      if (!hatInfo) {
        console.log(`%c[SFL Trồng Ruộng] ⚠️ Chưa cầm được hạt giống trên tay -> Hủy gieo hạt (tránh click khống).`, "color: #ff9800; font-weight: bold;");
        return false;
      }

      console.log(`%c[SFL Trồng Ruộng] 🌾 Bắt đầu gieo hạt ${hatInfo.tenHat} cho ${danhSachRuong.length} ô ruộng trống...`, "color: #4caf50; font-weight: bold; font-size: 13px;");

      let soHatConLai = hatInfo.soLuong;
      let daTrong = 0;

      for (let i = 0; i < danhSachRuong.length; i += 1) {
        if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
          console.log("%c[SFL Trồng Ruộng] 🚨 GẶP CAPTCHA! Tạm dừng để giải ngay...", "color: #ff3838; font-weight: bold; font-size: 13px;");
          S.__captchaInterrupted = true;
          if (typeof S.kiemTraVaGiaiCaptcha === "function") {
            await S.kiemTraVaGiaiCaptcha();
          }
          await ngu(800);
          if (!S.isCaptchaOpen || !S.isCaptchaOpen()) {
            S.__captchaInterrupted = false;
            console.log("%c[SFL Trồng Ruộng] 🔄 Đã giải xong Captcha! TIẾP TỤC gieo hạt...", "color: #4caf50; font-weight: bold;");
            i--;
            continue;
          }
          break;
        }

        if (soHatConLai <= 0) {
          console.log(`[SFL Trồng Ruộng] 🔄 Hết loại hạt hiện tại, tìm tiếp loại hạt khác...`);
          let tenHatTiep = null;
          let soLuongTiep = 0;
          for (const sName of seedsCuaMua) {
            if (sName !== hatInfo.tenHat && (inv[sName] || 0) > 0) {
              tenHatTiep = sName;
              soLuongTiep = inv[sName];
              break;
            }
          }
          if (!tenHatTiep) {
            for (const [k, v] of Object.entries(inv)) {
              if (k.endsWith(" Seed") && k !== hatInfo.tenHat && v > 0) {
                tenHatTiep = k;
                soLuongTiep = v;
                break;
              }
            }
          }
          if (!tenHatTiep) {
            console.log(`[SFL Trồng Ruộng] ℹ️ Đã hết toàn bộ hạt giống trong kho.`);
            break;
          }
          const hatMoi = await chuanBiHatGiong(tenHatTiep, soLuongTiep);
          if (!hatMoi) break;
          hatInfo = hatMoi;
          soHatConLai = hatInfo.soLuong;
        }

        const oRuong = danhSachRuong[i];
        clickTam(oRuong.el);
        if (oRuong.rootEl && oRuong.rootEl !== oRuong.el) {
          kichHoatReactProps(oRuong.rootEl);
        }
        soHatConLai -= 1;
        daTrong += 1;
        console.log(`[SFL Trồng Ruộng] 🌱 Gieo ${hatInfo.tenHat} vào ô ${daTrong}/${danhSachRuong.length} (${oRuong.coords.key})`);
        await ngu(300 + Math.floor(Math.random() * 150));
      }

      console.log(`%c[SFL Trồng Ruộng] ✔️ Đã gieo thành công ${daTrong}/${danhSachRuong.length} ô ruộng!`, "color: #00e676; font-weight: bold; font-size: 13px;");
      return daTrong > 0;
    } catch (err) {
      console.error("[SFL Trồng Ruộng] Lỗi:", err);
      return false;
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa("crops_plant");
      }
    }
  }

  S.tickCropPlant = tickCropPlant;

})(window.SFL = window.SFL || {});
