// ═══════════════════════════════════════════════════════════════════
// BỘ QUÉT DỮ LIỆU GAME (scan_data.js)
// Giai đoạn A: Quét kho đồ (mở hòm đồ, đọc item/công cụ HUD, đóng hòm)
// Giai đoạn B: Quét bản đồ (cây rừng, khoáng sản, nấm, hoa, mật ong, ruộng...)
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Bộ nhớ các ô đất đã được rắc phân Sprout Mix
  S.cacODaRacPhan = S.cacODaRacPhan || new Set();

  // Kiểm tra frame chạy tool
  function chayDungFrame() {
    try {
      const coGameDom = !!document.querySelector('[data-map-placement="true"], div.mushroom, img[src*="sunflower"], #root');
      if (coGameDom) return true;
      if (window !== window.top) return true;
      const coIframe = !!document.querySelector("iframe");
      return !coIframe;
    } catch (_e) {
      return true;
    }
  }
  S.chayDungFrame = chayDungFrame;

  // Lấy danh sách document của game (kể cả iframe)
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
      try {
        iframes = doc.querySelectorAll("iframe");
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < iframes.length; i += 1) {
        try {
          const idoc = iframes[i].contentDocument;
          if (idoc) { them(idoc); nganXep.push(idoc); }
        } catch (_e2) {}
      }
    }
    return out;
  }

  // Lấy background-image thực tế kể cả từ CSS
  function layBackgroundImage(el) {
    if (!el) return "";
    try {
      if (el.style?.backgroundImage && el.style.backgroundImage !== "none") {
        return String(el.style.backgroundImage).toLowerCase();
      }
      const view = el.ownerDocument?.defaultView || window;
      return String(view.getComputedStyle(el).backgroundImage || "").toLowerCase();
    } catch (_e) {
      return "";
    }
  }

  // Kiểm tra phần tử đang hiển thị
  function xemPhanTuRanh(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const view = el.ownerDocument?.defaultView || window;
    let style;
    try {
      style = view.getComputedStyle(el);
    } catch (_e) {
      return false;
    }
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  // Click chuẩn xác vào tâm phần tử (chuột trái, pointer, touch + react fiber)
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

    // Pointer & Mouse Down
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

    // Pointer & Mouse Up
    try {
      if (typeof PointerEvent !== "undefined") {
        el.dispatchEvent(new PointerEvent("pointerup", { ...upOpts, pointerId: 1, pointerType: "mouse", isPrimary: true, pressure: 0 }));
      }
    } catch (_e3) {}
    el.dispatchEvent(new MouseEvent("mouseup", upOpts));
    el.dispatchEvent(new MouseEvent("click", upOpts));

    try { el.click?.(); } catch (_e4) {}

    // Kích hoạt React Fiber Props nếu có
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

    // NHẢ CHUỘT VÀ BỎ FOCUS NGAY SAU KHI CLICK (xóa viền sáng hover / viền chọn trong game)
    setTimeout(() => {
      try {
        if (typeof el.blur === "function") el.blur();
        el.dispatchEvent(new MouseEvent("mouseout", upOpts));
        el.dispatchEvent(new MouseEvent("mouseleave", upOpts));
        if (typeof PointerEvent !== "undefined") {
          el.dispatchEvent(new PointerEvent("pointerout", { ...upOpts, pointerId: 1, pointerType: "mouse" }));
          el.dispatchEvent(new PointerEvent("pointerleave", { ...upOpts, pointerId: 1, pointerType: "mouse" }));
        }
      } catch (_e6) {}
    }, 60);

    return true;
  }

  // Khớp từ khóa trong text/title/alt của phần tử
  function chuaTuKhoa(el, cacTuKhoa) {
    if (!el) return false;
    const txt = (el.textContent || "").toLowerCase();
    const alt = (el.getAttribute("alt") || "").toLowerCase();
    const title = (el.getAttribute("title") || "").toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    const hopNhat = `${txt} ${alt} ${title} ${aria}`;
    return cacTuKhoa.some((k) => hopNhat.includes(k.toLowerCase()));
  }

  // Tìm icon hòm đồ / giỏ đồ trên HUD
  function timIconHoDo() {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      // 1. Selector chuẩn từ Sunflower Land v3.0.1: img[src*="basket"]:not([alt])
      const basket = doc.querySelector('img[src*="basket"]:not([alt]), img[src*="/basket."], img[src*="chest"]');
      if (basket && xemPhanTuRanh(basket)) return basket;

      // 2. Tìm tất cả ảnh giỏ đồ/hòm đồ trên màn hình
      const cacAnh = doc.querySelectorAll('img[src*="basket"], img[src*="chest"], img[src*="inventory"], img[src*="bag"]');
      for (const img of cacAnh) {
        if (xemPhanTuRanh(img)) return img;
      }

      // 3. Tìm qua nút bấm có text Basket / Chest / Giỏ / Hòm
      const cacNut = doc.querySelectorAll("button, [role='button'], div[class*='cursor-pointer']");
      for (const btn of cacNut) {
        if (!xemPhanTuRanh(btn)) continue;
        if (chuaTuKhoa(btn, ["basket", "chest", "giỏ đồ", "hòm đồ", "inventory", "túi đồ"])) {
          return btn;
        }
      }
    }
    return null;
  }

  // Kiểm tra hòm đồ đang mở trên màn hình
  function hoDoDangMo() {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      const cacNhan = doc.querySelectorAll("span, p, div, h1, h2");
      for (const n of cacNhan) {
        if (chuaTuKhoa(n, ["basket", "chest", "giỏ đồ", "hòm đồ", "inventory"])) {
          if (xemPhanTuRanh(n)) return true;
        }
      }
    }
    return false;
  }

  // Đóng hòm đồ bằng nút Close
  async function dongHoDo() {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      const cacAnhClose = doc.querySelectorAll('img[src*="close"], img[src*="cancel"]');
      let nutDong = null;
      for (const img of cacAnhClose) {
        if (xemPhanTuRanh(img)) { nutDong = img; break; }
      }
      if (!nutDong) {
        const cacNut = doc.querySelectorAll("button, [role='button']");
        for (const btn of cacNut) {
          if (xemPhanTuRanh(btn) && chuaTuKhoa(btn, ["close", "đóng", "x"])) {
            nutDong = btn;
            break;
          }
        }
      }
      if (nutDong) {
        clickTam(nutDong);
        for (let i = 0; i < 4; i += 1) {
          await ngu(200);
          if (!hoDoDangMo()) return;
        }
        return;
      }
    }
  }

  // Phân tích tọa độ từ style (50% ± px) của ô trên bản đồ
  function phanTichToaDo(styleStr) {
    if (!styleStr) return { x: 0, y: 0, key: "x_0_y_0" };
    const topMatch = styleStr.match(/top:\s*calc\(50%\s*([-+])\s*(\d+(\.\d+)?)px\)/i);
    const leftMatch = styleStr.match(/left:\s*calc\(50%\s*([-+])\s*(\d+(\.\d+)?)px\)/i);
    let y = topMatch ? (topMatch[1] === "-" ? -parseFloat(topMatch[2]) : parseFloat(topMatch[2])) : 0;
    let x = leftMatch ? (leftMatch[1] === "-" ? -parseFloat(leftMatch[2]) : parseFloat(leftMatch[2])) : 0;
    return { x, y, key: `x_${x}_y_${y}` };
  }

  // NHẬN DIỆN ICON PHÂN BÓN (Sprout Mix / Rapid Root) TRÊN Ô RUỘNG
  // QUAN TRỌNG: Từ game mới, ảnh soil2.png / volcanoSoil2.png là ĐẤT THƯỜNG của MỌI ô ruộng
  // (SOIL_IMAGES[biome].regular), kể cả ô CHƯA rắc phân, nên tuyệt đối KHÔNG được dùng soil2
  // làm dấu hiệu "đã rắc phân". Dấu hiệu DOM duy nhất là icon phân bón nhỏ ở góc trên (thẻ
  // z-20), kích thước ≈ PIXEL_SCALE*6 = 15.75px (icon thời tiết ≈ 26px, ong ≈ 21px, boost ≈ 18px).
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

  // Quét công cụ từ HUD/Toolbar trên màn hình
  function quetCongCuTuHUD(doc, kho) {
    if (!doc) return;
    const danhSachTools = ["axe", "pickaxe", "stone_pickaxe", "iron_pickaxe", "gold_pickaxe", "salt_rake", "oil_drill", "rod", "fishing_rod"];
    danhSachTools.forEach((t) => {
      if (kho[t] === undefined) kho[t] = 0;
    });

    const cacAnhCongCu = doc.querySelectorAll('img[src*="/tools/"], img[src*="game-assets/tools/"]');
    cacAnhCongCu.forEach((img) => {
      const src = (img.src || "").toLowerCase();
      const phan = src.split("/");
      const ten = (phan[phan.length - 1] || "").split(".")[0];
      if (!ten) return;

      const slot = img.closest("div, button, [role='button']");
      const view = img.ownerDocument?.defaultView || window;
      let opacityVal = 1;
      try {
        opacityVal = parseFloat(view.getComputedStyle(img).opacity || "1");
      } catch (_e) {}

      const biMo = opacityVal < 0.8 || (img.className || "").includes("opacity-50") || (slot?.className || "").includes("opacity-50");
      const biKhoa = !!slot?.querySelector("img[src*='lock']");

      if (biMo || biKhoa) {
        kho[ten] = 0;
        return;
      }

      const nhan = slot?.querySelector('div[class*="z-10"], span, div.text-xxs, div[class*="text-"], div[class*="badge"]');
      let count = 0;
      if (nhan) {
        const text = (nhan.textContent || "").trim().toLowerCase();
        let val = parseFloat(text);
        if (text.includes("k")) val = val * 1000;
        if (!isNaN(val) && val > 0) count = val;
      }
      kho[ten] = count;
    });
  }

  // ──────────────────────────────────────────────
  // GIAI ĐOẠN A — QUÉT KHO ĐỒ
  // ──────────────────────────────────────────────

  // Quét nội dung từng ô trong hòm đồ, trả object {ten: soLuong}
  async function quetNoiDungHoDo() {
    const taiLieu = layTaiLieuGame();

    for (const doc of taiLieu) {
      const cacNhan = doc.querySelectorAll("span, p, div, h1, h2");
      const coHoDo = Array.from(cacNhan).some((n) => chuaTuKhoa(n, ["basket", "chest", "giỏ đồ", "hòm đồ"]));
      if (!coHoDo) continue;

      const kho = {};
      let mua = "Unknown";

      // Mặc định tất cả các loại công cụ = 0 nếu không tìm thấy trong hòm hoặc HUD
      const danhSachToolsChuan = ["axe", "wood_pickaxe", "pickaxe", "stone_pickaxe", "iron_pickaxe", "gold_pickaxe", "salt_rake", "oil_drill", "rod", "fishing_rod"];
      danhSachToolsChuan.forEach((t) => { kho[t] = 0; });

      // 1. Quét các ô bên trong modal hòm đồ
      const cacO = doc.querySelectorAll('div[class*="bg-brown-"]');
      const danhSachO = [];

      cacO.forEach((o) => {
        const img = o.querySelector("img");
        if (!img) return;

        const nhan = o.querySelector('div[class*="z-10"], span, div.text-xxs');
        const src = (img.src || "").toLowerCase();
        const soLuongHien = nhan ? (nhan.textContent || "").trim() : "";
        const biMo = (img.className || "").includes("opacity-50") || (o.className || "").includes("opacity-50");
        const biKhoa = !!o.querySelector("img[src*='lock']");

        if (biMo || biKhoa) return; // Bỏ qua ô bị khóa hoặc không có

        let ten = "";
        const laCongCu = src.includes("/tools/") || src.includes("game-assets/tools/");
        if (src.includes("/crops/")) {
          const kh = src.match(/\/crops\/([a-z0-9_]+)\/([a-z0-9_]+)/i);
          ten = kh ? (kh[2] === "seed" ? kh[1] + "_seed" : kh[1]) : "";
        } else if (src.includes("/fruit/")) {
          const kh = src.match(/\/fruit\/([a-z0-9_]+)\/([a-z0-9_]+)/i);
          ten = kh ? (kh[2] === "seed" || kh[2] === "sapling" ? kh[1] + "_seed" : kh[1]) : "";
        } else {
          const phan = src.split("/");
          ten = (phan[phan.length - 1] || "").split(".")[0];
        }

        if (!ten || ten === "close" || ten === "cancel") return;

        let soLuong = 0;
        if (nhan && soLuongHien) {
          let val = parseFloat(soLuongHien.toLowerCase());
          if (soLuongHien.toLowerCase().includes("k")) val = val * 1000;
          if (!isNaN(val) && val > 0) soLuong = val;
        } else if (!laCongCu) {
          soLuong = 1;
        }

        if (soLuong > 0) {
          kho[ten] = soLuong;
          danhSachO.push(`${ten}×${soLuong}`);
        } else if (laCongCu) {
          kho[ten] = 0;
        }
      });

      // 1.5. Quét mục Fertilisers (Phân bón) trong hòm đồ
      const tatCaNhan = doc.querySelectorAll("div, span, p");
      tatCaNhan.forEach((n) => {
        const txt = (n.textContent || "").trim();
        if (txt === "Fertilisers" || txt.startsWith("Fertilisers")) {
          const container = n.closest(".flex.flex-col") || n.parentElement?.parentElement;
          if (container) {
            const cacSlot = container.querySelectorAll(".bg-brown-600, div.cursor-pointer, [class*='cursor-pointer']");
            cacSlot.forEach((slot) => {
              const badge = slot.querySelector("div.text-xs, div[class*='text-'], div.z-10");
              const valText = badge ? (badge.textContent || "").trim().toLowerCase() : "";
              let val = parseFloat(valText);
              if (valText.includes("k")) val = val * 1000;
              if (!isNaN(val) && val > 0) {
                kho["sprout_mix"] = val;
                danhSachO.push(`sprout_mix×${val}`);
              }
            });
          }
        }
      });

      // 2. Quét công cụ từ HUD/Toolbar trên màn hình
      quetCongCuTuHUD(doc, kho);

      // Đồng bộ số lượng cuốc cơ bản giữa pickaxe và wood_pickaxe
      const soPickaxe = Math.max(Number(kho["wood_pickaxe"] || 0), Number(kho["pickaxe"] || 0));
      kho["pickaxe"] = soPickaxe;
      kho["wood_pickaxe"] = soPickaxe;

      // 3. Đọc mùa hạt giống
      const cacTieuDe = doc.querySelectorAll('div[class*="gray_border"], div[style*="background: rgb(192, 203, 220)"]');
      cacTieuDe.forEach((h) => {
        const txt = (h.textContent || "").trim();
        const txtLower = txt.toLowerCase();
        if (txtLower.includes("seeds") || txtLower.includes("spring") || txtLower.includes("summer") ||
            txtLower.includes("autumn") || txtLower.includes("fall") || txtLower.includes("winter")) {
          const kh = txt.match(/^([a-z0-9_]+)\s+seeds/i);
          if (kh) mua = kh[1].charAt(0).toUpperCase() + kh[1].slice(1);
        }
      });

      S.muaHienTai = mua;

      // 4. Phân loại chuẩn xác: Hạt giống ruộng theo mùa, Hoa quả, Hoa, Công cụ, Phân bón
      const phanLoai = {
        mua: mua,
        hatGiongRuong: {},   // Hạt giống cây trồng ruộng đất
        hoaQua: {},          // Hoa quả & Cây giống ăn quả
        hoa: {},             // Hoa & Hạt giống hoa
        congCu: {},          // Công cụ
        phanBon: {}          // Phân bón
      };

      const DANH_SACH_HOA_QUA = ["apple", "orange", "blueberry", "banana", "lemon", "tomato", "grape"];
      const DANH_SACH_HOA = ["sunpetal", "bloom", "lily", "edelweiss", "gladiolus", "lavender", "clover", "lotus"];

      for (const [key, qty] of Object.entries(kho)) {
        if (danhSachToolsChuan.includes(key)) {
          phanLoai.congCu[key] = qty;
        } else if (key.includes("sprout_mix") || key.includes("fertiliser") || key.includes("rapid_root")) {
          phanLoai.phanBon[key] = qty;
        } else if (DANH_SACH_HOA_QUA.some((f) => key.includes(f))) {
          phanLoai.hoaQua[key] = qty;
        } else if (DANH_SACH_HOA.some((fl) => key.includes(fl))) {
          phanLoai.hoa[key] = qty;
        } else if (key.includes("seed") || key.includes("crop")) {
          phanLoai.hatGiongRuong[key] = qty;
        }
      }

      S.khoDoPhanLoai = phanLoai;

      console.groupCollapsed(`[SFL Kho] 📦 ${Object.keys(kho).length} loại item | mùa: ${mua}`);
      console.log("Danh sách item:", kho);
      console.log(`%c🌾 Hạt giống ruộng mùa ${mua}:`, "color: #4caf50; font-weight: bold;", phanLoai.hatGiongRuong);
      console.log(`%c🍎 Hoa quả / Cây giống ăn quả:`, "color: #ff9800; font-weight: bold;", phanLoai.hoaQua);
      console.log(`%c🌸 Hoa / Hạt giống hoa:`, "color: #e91e63; font-weight: bold;", phanLoai.hoa);
      console.groupEnd();

      await dongHoDo();
      return kho;
    }

    await dongHoDo();
    return null;
  }

  // Quét kho đồ: mở hòm, đọc item, đóng hòm
  async function quetKhoDo() {
    console.log("[SFL Kho] 📦 Bắt đầu quy trình mở hòm đồ để quét dữ liệu...");
    const iconHoDo = timIconHoDo();
    if (!iconHoDo) {
      console.log("[SFL Kho] ⚠️ Không tìm thấy icon hòm đồ trên màn hình");
      return false;
    }

    console.log("[SFL Kho] 🖱️ Click mở icon hòm đồ...");
    clickTam(iconHoDo);
    await ngu(1500); // Chờ 1.5s để hòm đồ mở hẳn

    const duLieuKho = await quetNoiDungHoDo();
    if (!duLieuKho) {
      console.log("[SFL Kho] ⚠️ Không đọc được nội dung sau khi mở hòm đồ");
      await dongHoDo();
      return false;
    }

    S.khoDo = duLieuKho;
    S.thoiGianQuetKhoCuoi = Date.now();
    try {
      chrome.storage.local.set({
        sfl_kho_do: duLieuKho,
        sfl_mua: S.muaHienTai,
        sfl_thoi_gian_quet_kho: S.thoiGianQuetKhoCuoi,
      });
    } catch (_e) {}

    console.log("[SFL Kho] ✔ Đã quét thực tế xong hòm đồ:", S.khoDo);
    return true;
  }

  // ──────────────────────────────────────────────
  // GIAI ĐOẠN B — QUÉT MAP
  // ──────────────────────────────────────────────

  // Quét toàn bộ bản đồ, phân loại từng ô
  async function quetBanDo() {
    const taiLieu = layTaiLieuGame();

    const cay = [];
    const khoangSan = [];
    const cayTrong = [];
    const toOng = [];
    const nam = [];
    const thuyen = [];
    const qua = [];
    const hoa = [];

    // BƯỚC 1: Quét NẤM độc lập (nấm hiển thị dạng div.mushroom trên khắp map)
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacNodeNam = doc.querySelectorAll("div.mushroom, [class*='mushroom'], .react-responsive-spritesheet-container__move");
      const daThemNam = new Set();

      for (const node of cacNodeNam) {
        const rootEl = node.closest("div.mushroom") || node;
        if (!rootEl || daThemNam.has(rootEl) || !xemPhanTuRanh(rootEl)) continue;

        const moveEl = rootEl.querySelector(".react-responsive-spritesheet-container__move") || rootEl;
        const bgImg = layBackgroundImage(moveEl) + " " + layBackgroundImage(rootEl);
        const cacImg = Array.from(rootEl.querySelectorAll("img")).map((i) => (i.src || "").toLowerCase());
        const coNam = bgImg.includes("mushroom") || bgImg.includes("wild_mushroom") || bgImg.includes("magic_mushroom") ||
          cacImg.some((s) => s.includes("mushroom")) || (rootEl.className && String(rootEl.className).toLowerCase().includes("mushroom"));

        if (coNam) {
          daThemNam.add(rootEl);
          let loai = "wild";
          if (bgImg.includes("magic") || cacImg.some((s) => s.includes("magic"))) loai = "magic";
          const coords = phanTichToaDo(rootEl.getAttribute("style") || "");
          nam.push({ x: coords.x, y: coords.y, key: coords.key, loai, el: rootEl });
        }
      }
    }

    // BƯỚC 2: Quét các ô [data-map-placement="true"]
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacO = doc.querySelectorAll('[data-map-placement="true"]');

      cacO.forEach((el) => {
        if (!xemPhanTuRanh(el)) return;

        const coords = phanTichToaDo(el.getAttribute("style") || "");
        const cacAnh = Array.from(el.querySelectorAll("img"));
        const duongDan = cacAnh.map((img) => (img.currentSrc || img.src || img.getAttribute("src") || "").toLowerCase());
        const noiDung = (el.textContent || "").trim().toLowerCase();

        const biKhoa = duongDan.some((s) => s.includes("lock")) || noiDung.includes("lock");

        // CÂY RỪNG
        if (duongDan.some((s) => s.includes("resources/tree") || s.includes("/tree/") || s.includes("tree.png") || s.includes("bush_shrub") || s.includes("tree_stump") || s.includes("autumn_tree") || s.includes("spring_tree") || s.includes("summer_tree") || s.includes("winter_tree"))) {
          const laStumpSrc = duongDan.some((s) => s.includes("stump") || s.includes("tree_stump"));
          const coDemGio = /\d+\s*(?:mins?|secs?|hours?|hrs?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung);
          const coMoMo = cacAnh.some((i) => (i.className || "").includes("opacity-50"));
          const laGoc = laStumpSrc || coDemGio || coMoMo;
          cay.push({
            x: coords.x, y: coords.y, key: coords.key,
            trangThai: laGoc ? "goc" : "chatDuoc",
            src: duongDan
          });
          return;
        }

        // MỎ DẦU
        const coDau =
          duongDan.some((s) => s.includes("uklgrqiaaabxrujqvla4tjy") || s.includes("/resources/oil/") || s.includes("oil_reserve")) ||
          cacAnh.some((img) => (img.getAttribute("alt") || "").toLowerCase().includes("oil reserve"));
        if (coDau) {
          const coAltFull = cacAnh.some((img) => (img.getAttribute("alt") || "").toLowerCase().includes("full oil reserve"));
          const coMoMo = !!el.querySelector(".opacity-50, [class*='opacity-50'], .opacity-40, [class*='opacity-40']") ||
            (el.className && typeof el.className === "string" && el.className.includes("opacity-50"));
          const coDemGio = /\d+\s*(?:hrs?|mins?|secs?|hours?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung);
          const coNutClick = !!el.querySelector(".cursor-pointer, [class*='cursor-pointer'], [class*='hover:img-highlight']");
          const laSanSang = (coAltFull || coNutClick) && !coMoMo && !coDemGio;

          khoangSan.push({
            x: coords.x, y: coords.y, key: coords.key,
            loai: "Dau",
            trangThai: laSanSang ? "sanSang" : "cooldown",
            src: duongDan
          });
          return;
        }

        // KHOÁNG SẢN (Đá, Sắt, Vàng, Crimstone, Sunstone, Muối)
        const laKhoang = duongDan.some((s) =>
          s.includes("stone_small") || s.includes("stone_rock") || s.includes("l2_stone") || s.includes("stone.png") || s.includes("rock.png") ||
          s.includes("iron_small") || s.includes("iron_rock") || s.includes("l2_iron") || s.includes("iron.png") ||
          s.includes("gold_small") || s.includes("gold_rock") || s.includes("l2_gold") || s.includes("gold.png") ||
          s.includes("crimstone") || s.includes("sunstone") || s.includes("salt") ||
          s.includes("uklgriabaabxrujqvla4tbqba"));
        if (laKhoang) {
          let loai = "Da";
          if (duongDan.some((s) => s.includes("crimstone") || s.includes("uklgriabaabxrujqvla4tbqba"))) loai = "Crimstone";
          else if (duongDan.some((s) => s.includes("sunstone"))) loai = "Sunstone";
          else if (duongDan.some((s) => s.includes("gold"))) loai = "Vang";
          else if (duongDan.some((s) => s.includes("iron"))) loai = "Sat";
          else if (duongDan.some((s) => s.includes("salt"))) loai = "Muoi";

          // Chuẩn hóa theo cấu trúc DOM thực tế của game:
          // Mỏ đang hồi: có thẻ div .opacity-50 bọc ảnh, có đếm giờ trong tooltip (2hrs 59mins...), hoặc pointer-events-none
          const coMoMo = !!el.querySelector(".opacity-50, [class*='opacity-50'], .opacity-40, [class*='opacity-40']") ||
            (el.className && typeof el.className === "string" && el.className.includes("opacity-50"));
          const coDemGio = /\d+\s*(?:hrs?|mins?|secs?|hours?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung);
          const coNutClick = !!el.querySelector(".cursor-pointer, [class*='cursor-pointer'], [class*='hover:img-highlight']");
          const laCooldown = coMoMo || coDemGio || !coNutClick;

          khoangSan.push({
            x: coords.x, y: coords.y, key: coords.key,
            loai,
            trangThai: laCooldown ? "cooldown" : "sanSang",
            src: duongDan
          });
          return;
        }

        // TỔ ONG (Beehive)
        if (duongDan.some((s) => s.includes("beehive") || s.includes("bee_hive") || s.includes("honey"))) {
          const coThanhTien = el.querySelector("div[style*='background-color']");
          toOng.push({
            x: coords.x, y: coords.y, key: coords.key,
            trangThai: coThanhTien ? "dangChuanBi" : "sanSang",
            src: duongDan
          });
          return;
        }

        // THUYỀN CHECK-IN
        if (duongDan.some((s) => s.includes("ivborw0kggoaaaansuheugaaae") || s.includes("boat"))) {
          thuyen.push({ x: coords.x, y: coords.y, key: coords.key });
          return;
        }

        // VƯỜN QUẢ (Fruit Trees / Fruit Patches)
        const coQua = duongDan.some((s) =>
          s.includes("fruit_patch") || s.includes("fruit-patch") || s.includes("fruitpatch") ||
          s.includes("/fruit/") || s.includes("fruit_") || s.includes("apple") || s.includes("orange") ||
          s.includes("blueberry") || s.includes("banana") || s.includes("peach") || s.includes("lemon") ||
          s.includes("pear") || s.includes("plum") || s.includes("grape") || s.includes("tomato"));
        if (coQua) {
          let coAnhKhac = false;
          for (const s of duongDan) {
            const laNen = s.includes("fruit_patch") || s.includes("fruit-patch") || s.includes("fruitpatch");
            const laDat = s.includes("soil") || s.includes("sand_dug");
            if (!laNen && !laDat) { coAnhKhac = true; break; }
          }

          let trangThai = "rong";
          let loaiQua = "Cây quả";
          const anhQua = duongDan.find((s) => s.includes("/fruit/"));
          if (anhQua) {
            const m = anhQua.match(/\/fruit\/([a-z0-9_]+)/i);
            if (m && m[1]) loaiQua = m[1].charAt(0).toUpperCase() + m[1].slice(1);
          } else {
            for (const name of ["apple", "orange", "blueberry", "banana", "lemon", "tomato", "grape"]) {
              if (duongDan.some((s) => s.includes(name))) {
                loaiQua = name.charAt(0).toUpperCase() + name.slice(1);
                break;
              }
            }
          }

          if (coAnhKhac) {
            const laCayKho = duongDan.some((s) => s.includes("dead") || s.includes("stump") || s.includes("withered") || s.includes("dry_tree") || s.includes("fruit_stump") || s.includes("dead_bush"));
            if (laCayKho) {
              trangThai = "kho"; // Cây khô hết lượt, cần chặt bằng rìu
            } else {
              const coDemGio = /\d+\s*(?:hrs?|mins?|secs?|hours?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung) || !!el.querySelector('img[src*="empty_bar"], div[style*="background-color"]');
              const laCayNon = duongDan.some((s) => s.includes("seedling") || s.includes("growing") || s.includes("seed") || s.includes("sapling"));
              trangThai = (coDemGio || laCayNon) ? "dangLon" : "sanSang";
            }
          }

          const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer'], [class*='hover:img-highlight']") || el;
          qua.push({ x: coords.x, y: coords.y, key: coords.key, el: nutClick, rootEl: el, loai: loaiQua, trangThai, biKhoa });
          return;
        }

        // VƯỜN HOA
        if (duongDan.some((s) => s.includes("/flowers/") || s.includes("flower_bed"))) {
          let trangThai = "sanSang";
          const laLuongHoa = duongDan.some((s) => s.includes("flower_bed"));
          const coThanhTien = el.querySelector("div[style*='background-color']");
          if (laLuongHoa) trangThai = "rong";
          else if (duongDan.some((s) => s.includes("sprout") || s.includes("growing")) || coThanhTien) trangThai = "dangLon";
          hoa.push({ x: coords.x, y: coords.y, key: coords.key, trangThai });
          return;
        }

        // RUỘNG TRỒNG (Phân loại chính xác 5 trạng thái theo yêu cầu)
        const laRuong = duongDan.some((s) => s.includes("soil") || s.includes("sand_dug") || s.includes("/crops/") || s.includes("soil2"));
        if (laRuong) {
          let trangThai = "rong";
          let loai = "";
          let thoiGianCon = "";

          // 1. KIỂM TRA Ô BỊ KHÓA
          if (biKhoa) {
            trangThai = "biKhoa";
          } else {
            // 2. KIỂM TRA Ô BỊ ẢNH HƯỞNG BỞI THỜI TIẾT XẤU / THIÊN TAI / SÂU BỌ
            const laBiThoiTiet = duongDan.some((s) =>
              s.includes("weather") || s.includes("tornado") || s.includes("freeze") ||
              s.includes("frozen") || s.includes("ice") || s.includes("snow") ||
              s.includes("lightning") || s.includes("storm") || s.includes("drought") ||
              s.includes("caterpillar") || s.includes("locust") || s.includes("pest") ||
              s.includes("tsunami") || s.includes("disaster")
            ) || noiDung.includes("frozen") || noiDung.includes("weather") || noiDung.includes("disaster") ||
            el.classList.contains("frozen") || !!el.querySelector('[class*="weather"], [class*="disaster"]');

            if (laBiThoiTiet) {
              trangThai = "biAnhHuongThoiTiet";
            } else {
              const laPhanBon = (s) =>
                s.includes("soil2") || s.includes("volcanosoil2") ||
                s.includes("sprout_mix") || s.includes("fertiliser") || s.includes("fertilizer") || s.includes("rapid_root");
              const coDemGio = /\d+\s*(?:mins?|secs?|hours?|hrs?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung);

              // Cây đang lớn: Chỉ tính nếu là giai đoạn cây (seedling/halfway/almost/growing), TUYỆT ĐỐI KHÔNG tính sprout_mix/soil2 là cây!
              const coAnhCayDangLon = duongDan.some((s) =>
                (s.includes("seedling") || s.includes("halfway") || s.includes("almost") || s.includes("growing") || (s.includes("sprout") && !s.includes("sprout_mix"))) && !laPhanBon(s)
              );

              // Cây bất kỳ (loại trừ đất, hạt giống và phân bón/soil2)
              const coAnhCayBatKy = duongDan.some((s) =>
                (s.includes("/crops/") || s.includes("/volcano/crops/")) && !s.includes("soil") && !s.includes("seed") && !laPhanBon(s)
              );

              // Cây chín: Chứa plant hoặc crop, loại trừ hoàn toàn phân bón và đất
              const anhCayChin = duongDan.find((s) =>
                (s.includes("/crops/") || s.includes("/volcano/crops/")) && (s.includes("plant") || s.includes("crop")) && !s.includes("soil") && !s.includes("seed") && !laPhanBon(s)
              );

              const laCayDangLon = coAnhCayDangLon || (coAnhCayBatKy && coDemGio && !anhCayChin);

              // 3. CÂY CÓ THỂ THU HOẠCH (Chín / Sẵn sàng)
              if (anhCayChin && !laCayDangLon) {
                trangThai = "sanSang";
                const kh = anhCayChin.match(/\/crops\/([a-z0-9_]+)/i) || anhCayChin.match(/\/volcano\/crops\/([a-z0-9_]+)/i);
                loai = kh ? kh[1] : "cây trồng";
              }
              // 4. CÂY ĐANG PHÁT TRIỂN (Cây non / đang lớn / đếm giờ)
              else if (laCayDangLon) {
                trangThai = "dangPhatTrien";
                const mDem = noiDung.match(/\d+\s*(?:mins?|secs?|hours?|hrs?|m\b|s\b|h\b)|\d+:\d+/i);
                thoiGianCon = mDem ? mDem[0] : "";
                const anhC = duongDan.find((s) => s.includes("/crops/") && !s.includes("soil") && !laPhanBon(s));
                if (anhC) {
                  const kh = anhC.match(/\/crops\/([a-z0-9_]+)/i);
                  loai = kh ? kh[1] : "";
                }
              }
              // 5. Ô TRỐNG: KIỂM TRA ĐÃ RẮC PHÂN HAY CHƯA
              else {
                // QUAN TRỌNG: Game hiện dùng soil2.png / volcanoSoil2.png làm ĐẤT THƯỜNG cho MỌI ô
                // ruộng (kể cả chưa rắc phân) nên KHÔNG dùng soil2 để xác định "đã rắc phân".
                // Chỉ nhận diện qua icon phân bón góc trên (Sprout Mix / Rapid Root), React props,
                // hoặc bộ nhớ S.cacODaRacPhan.
                const coBadgePhan = laCoIconPhanBon(el);
                const htmlPhan = (el.outerHTML || el.innerHTML || "").toLowerCase();
                const coAnhPhan = coBadgePhan ||
                  htmlPhan.includes("sprout_mix") || htmlPhan.includes("fertiliser") ||
                  htmlPhan.includes("fertilizer") || htmlPhan.includes("rapid_root");
                const daGhiNhoRac = S.cacODaRacPhan instanceof Set && S.cacODaRacPhan.has(coords.key);

                if (coAnhPhan || daGhiNhoRac) {
                  trangThai = "daRacPhan"; // Ô TRỐNG ĐÃ ĐƯỢC RẮC PHÂN (icon phân bón)
                  if (coAnhPhan && S.cacODaRacPhan instanceof Set) {
                    S.cacODaRacPhan.add(coords.key);
                  }
                } else {
                  trangThai = "rong"; // Ô TRỐNG THƯỜNG CHƯA RẮC PHÂN -> Chờ rắc phân!
                }
              }
            }
          }

          const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer']") || el;
          const laOTrong = (trangThai === "rong" || trangThai === "daRacPhan");
          const daCoPhan = (trangThai === "daRacPhan");

          cayTrong.push({
            x: coords.x,
            y: coords.y,
            key: coords.key,
            el: nutClick,
            rootEl: el,
            trangThai,
            laOTrong,
            daCoPhan,
            loai,
            thoiGianCon,
            biKhoa
          });
          return;
        }
      });
    }

    // Gộp kết quả
    S.mapData = {
      cay,
      khoangSan,
      cayTrong,
      toOng,
      nam,
      thuyen,
      qua,
      hoa,
      thoiGianQuet: Date.now()
    };

    // ── IN KẾT QUẢ QUÉT RUỘNG CHI TIẾT RA MÀN HÌNH CONSOLE ──
    const demRuong = {
      rongChuaPhan: cayTrong.filter((c) => c.trangThai === "rong").length,
      rongCoPhan: cayTrong.filter((c) => c.trangThai === "daRacPhan").length,
      biAnhHuongThoiTiet: cayTrong.filter((c) => c.trangThai === "biAnhHuongThoiTiet").length,
      sanSang: cayTrong.filter((c) => c.trangThai === "sanSang").length,
      dangPhatTrien: cayTrong.filter((c) => c.trangThai === "dangPhatTrien").length,
      biKhoa: cayTrong.filter((c) => c.trangThai === "biKhoa").length,
    };
    const tongOTrong = demRuong.rongChuaPhan + demRuong.rongCoPhan;

    console.log(
      `%c[SFL Map] 🌾 QUÉT RUỘNG ĐẤT: TỔNG ${cayTrong.length} Ô | ` +
      `🟫 Tổng ô trống: ${tongOTrong} (Chưa phân: ${demRuong.rongChuaPhan} | Đã có phân: ${demRuong.rongCoPhan}) | ` +
      `🌾 Cây chín: ${demRuong.sanSang} | ` +
      `⏳ Đang lớn: ${demRuong.dangPhatTrien} | ` +
      `🌪️ Bị thời tiết: ${demRuong.biAnhHuongThoiTiet} | ` +
      `🔒 Khóa: ${demRuong.biKhoa}`,
      "color: #ffb74d; font-weight: bold; font-size: 13px; background: #2a180b; padding: 4px 10px; border-radius: 4px; border: 1px solid #e5a93b;"
    );

    // In bảng chi tiết từng ô ruộng
    if (cayTrong.length > 0) {
      console.table(
        cayTrong.map((c, idx) => ({
          STT: idx + 1,
          "Tọa độ": `(${c.x}, ${c.y})`,
          "Phân loại ô": c.laOTrong ? (c.daCoPhan ? "🟫 Ô TRỐNG (ĐÃ CÓ PHÂN)" : "🟫 Ô TRỐNG (CHƯA PHÂN)") : "🌱 Ô ĐANG CÓ CÂY",
          "Trạng thái": c.trangThai === "rong" ? "🟫 Ô trống (chờ rắc phân)" :
                        c.trangThai === "daRacPhan" ? "🧪 Ô trống đã có phân (chờ gieo hạt)" :
                        c.trangThai === "sanSang" ? "🌾 Cây chín (sẵn sàng thu hoạch)" :
                        c.trangThai === "dangPhatTrien" ? "⏳ Cây đang phát triển" :
                        c.trangThai === "biAnhHuongThoiTiet" ? "🌪️ Bị thời tiết xấu" : "🔒 Bị khóa",
          "Cây trồng": c.loai || "-",
          "Thời gian": c.thoiGianCon || "-",
        }))
      );
    } else {
      console.log("%c[SFL Map] ⚠️ Chưa tìm thấy ô ruộng nào trên màn hình hiện tại!", "color: #ff9800; font-style: italic;");
    }

    // ── IN DỮ LIỆU ĐÁ & KHOÁNG SẢN RA CONSOLE GIỐNG NHƯ RUỘNG ──
    const demQuang = {
      tong: khoangSan.length,
      sanSang: khoangSan.filter((k) => k.trangThai === "sanSang").length,
      cooldown: khoangSan.filter((k) => k.trangThai === "cooldown").length,
      da: khoangSan.filter((k) => k.loai === "Da"),
      sat: khoangSan.filter((k) => k.loai === "Sat"),
      vang: khoangSan.filter((k) => k.loai === "Vang"),
      crimstone: khoangSan.filter((k) => k.loai === "Crimstone"),
      sunstone: khoangSan.filter((k) => k.loai === "Sunstone"),
      dau: khoangSan.filter((k) => k.loai === "Dau"),
      muoi: khoangSan.filter((k) => k.loai === "Muoi"),
    };

    console.log(
      `%c[SFL Map] ⛏️ QUÉT ĐÁ & KHOÁNG SẢN: TỔNG ${demQuang.tong} MỎ | ` +
      `⛏️ Sẵn sàng: ${demQuang.sanSang} | ` +
      `⏳ Đang hồi: ${demQuang.cooldown} | ` +
      `🪨 Đá: ${demQuang.da.filter((k) => k.trangThai === "sanSang").length}/${demQuang.da.length} | ` +
      `⛓️ Sắt: ${demQuang.sat.filter((k) => k.trangThai === "sanSang").length}/${demQuang.sat.length} | ` +
      `🪙 Vàng: ${demQuang.vang.filter((k) => k.trangThai === "sanSang").length}/${demQuang.vang.length} | ` +
      `💎 Crimstone: ${demQuang.crimstone.filter((k) => k.trangThai === "sanSang").length}/${demQuang.crimstone.length} | ` +
      `🛢️ Dầu: ${demQuang.dau.filter((k) => k.trangThai === "sanSang").length}/${demQuang.dau.length} | ` +
      `🧂 Muối: ${demQuang.muoi.filter((k) => k.trangThai === "sanSang").length}/${demQuang.muoi.length}`,
      "color: #80d8ff; font-weight: bold; font-size: 13px; background: #002233; padding: 4px 10px; border-radius: 4px; border: 1px solid #00bcd4;"
    );

    // In bảng chi tiết từng mỏ quặng / khoáng sản
    if (khoangSan.length > 0) {
      const TEN_LOAI_QUANG = {
        Da: "🪨 Đá thường (Stone)",
        Sat: "⛓️ Quặng Sắt (Iron)",
        Vang: "🪙 Quặng Vàng (Gold)",
        Crimstone: "💎 Crimstone (Đá đỏ)",
        Sunstone: "☀️ Sunstone",
        Muoi: "🧂 Mỏ Muối (Salt)",
        Dau: "🛢️ Mỏ Dầu (Oil)",
      };

      const CONG_CU_QUANG = {
        Da: "⛏️ Cuốc gỗ/thường (Pickaxe)",
        Sat: "🪨 Cuốc đá (Stone Pickaxe)",
        Vang: "⛓️ Cuốc sắt (Iron Pickaxe)",
        Crimstone: "🪙 Cuốc vàng (Gold Pickaxe)",
        Sunstone: "🪙 Cuốc vàng (Gold Pickaxe)",
        Muoi: "🧂 Cào muối (Salt Rake)",
        Dau: "🛢️ Khoan dầu (Oil Drill)",
      };

      console.table(
        khoangSan.map((k, idx) => ({
          STT: idx + 1,
          "Tọa độ": `(${k.x}, ${k.y})`,
          "Loại khoáng sản": TEN_LOAI_QUANG[k.loai] || k.loai,
          "Trạng thái": k.trangThai === "sanSang"
            ? "⛏️ SẴN SÀNG KHAI THÁC"
            : "⏳ ĐANG HỒI PHỤC (Cooldown)",
          "Công cụ cần": CONG_CU_QUANG[k.loai] || "Cuốc",
        }))
      );
    } else {
      console.log("%c[SFL Map] ⚠️ Chưa tìm thấy mỏ đá hay khoáng sản nào trên bản đồ!", "color: #ff9800; font-style: italic;");
    }

    // In tổng quan bản đồ
    console.log(
      `%c[SFL Map] 🗺️ TỔNG QUAN MAP | 🌾 ${cayTrong.length} Ruộng | 🌲 ${cay.length} Cây rừng | ⛏️ ${khoangSan.length} Khoáng sản | 🍄 ${nam.length} Nấm | 🌸 ${hoa.length} Hoa | 🍯 ${toOng.length} Tổ ong`,
      "color: #4fc3f7; font-weight: bold; font-size: 11px;"
    );

    return S.mapData;
  }

  // Quét dữ liệu master: kho đồ + map
  async function quetData(lenhBuoc = false) {
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) {
      S.hanhDongCuoi = "⏸️ Tạm dừng (chờ bật master)";
      return null;
    }

    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return null;
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return null;

    if (typeof S.xinKhoa === "function" && !S.xinKhoa("quet-data")) return null;

    S.dangQuetData = true;
    try {
      const tuoiKhoPhut = S.thoiGianQuetKhoCuoi ? Math.round((Date.now() - S.thoiGianQuetKhoCuoi) / 60000) : -1;
      let quetKho = lenhBuoc || !S.khoDo || tuoiKhoPhut >= 5;
      if (quetKho) await quetKhoDo();

      await quetBanDo();

      // IN DỮ LIỆU CHI TIẾT RA CONSOLE CHO NGƯỜI DÙNG DỄ THEO DÕI
      const kho = S.khoDo || {};
      const map = S.mapData || {};
      const cayChatDuoc = (map.cay || []).filter((c) => c.trangThai === "chatDuoc").length;
      const quangSanSang = (map.khoangSan || []).filter((k) => k.trangThai === "sanSang").length;
      const namSanSang = (map.nam || []).length;
      const hoaSanSang = (map.hoa || []).filter((h) => h.trangThai === "sanSang").length;
      const ongSanSang = (map.toOng || []).filter((o) => o.trangThai === "sanSang").length;

      const quaSanSang = (map.qua || []).filter((q) => q.trangThai === "sanSang").length;
      const cayKhoCanChat = (map.qua || []).filter((q) => q.trangThai === "kho").length;

      const logCongCu = `🪓Rìu:${kho.axe || 0} | ⛏️CuốcGỗ:${kho.pickaxe || kho.wood_pickaxe || 0} | 🪨CuốcĐá:${kho.stone_pickaxe || 0} | ⛓️CuốcSắt:${kho.iron_pickaxe || 0} | 🪙CuốcVàng:${kho.gold_pickaxe || 0} | 🧂CàoMuối:${kho.salt_rake || 0} | 🛢️KhoanDầu:${kho.oil_drill || kho.drill || 0} | 🎣CầnCâu:${kho.rod || kho.fishing_rod || 0}`;
      const logBanDo = `🌲CâyGỗ:${cayChatDuoc} | 🍎QuảChín:${quaSanSang} | 🍂CâyKhô:${cayKhoCanChat} | ⛏️QuặngSẵnSàng:${quangSanSang} | 🍄Nấm:${namSanSang} | 🌸HoaChín:${hoaSanSang} | 🍯TổOngChín:${ongSanSang}`;

      console.log(`%c[SFL QUÉT DỮ LIỆU] 📦 KHO CÔNG CỤ (Mùa ${S.muaHienTai || "Unknown"}):\n   ➔ ${logCongCu}`, "color: #e5a93b; font-weight: bold;");
      console.log(`%c[SFL QUÉT DỮ LIỆU] 🗺️ TÀI NGUYÊN BẢN ĐỒ:\n   ➔ ${logBanDo}`, "color: #4caf50; font-weight: bold;");

      return { khoDo: S.khoDo, mapData: S.mapData };
    } finally {
      S.dangQuetData = false;
      if (typeof S.nhaKhoa === "function") S.nhaKhoa();
    }
  }

  // Xuất bản các hàm sang không gian tên SFL
  S.quetData = quetData;
  S.quetKhoDo = quetKhoDo;
  S.quetBanDo = quetBanDo;
  S.timIconHoDo = timIconHoDo;
  S.hoDoDangMo = hoDoDangMo;
  S.dongHoDo = dongHoDo;
  S.phanTichToaDo = phanTichToaDo;
  S.laCoIconPhanBon = laCoIconPhanBon;

})(window.SFL = window.SFL || {});
