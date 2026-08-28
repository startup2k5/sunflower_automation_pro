// ═══════════════════════════════════════════════════════════════════
// LUỒNG 10 — TỰ ĐỘNG RẮC PHÂN SPROUT MIX (fertilise.js)
// Luồng riêng biệt:
// 1. Quét tìm các ô đất TRỐNG
// 2. LOẠI TRỪ 100% các ô bị ảnh hưởng bởi thời tiết xấu
// 3. Tự động mở hòm đồ chọn Sprout Mix rồi đóng hòm đồ
// 4. Lần lượt rắc phân và ghi nhớ các ô đã rắc phân
// 5. Nếu vòng lặp lặp lại, nhận diện ô đã rắc phân dù ô vẫn trống để bỏ qua
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Bộ nhớ toàn cục lưu các ô đất đã rắc phân (Set chứa coords.key: x_${x}_y_${y})
  S.cacODaRacPhan = S.cacODaRacPhan || new Set();

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

  // Kích hoạt trực tiếp handler React nếu có
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

  // Kiểm tra xem một phần tử ô đất có bị ảnh hưởng bởi thời tiết xấu hay không
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

  // Kiểm tra qua React Fiber/Props xem ô đất đã có phân bón hay chưa
  function kiemTraReactPhanBon(el) {
    if (!el) return false;
    const candidates = [el, el.parentElement, el.firstElementChild];
    for (const c of candidates) {
      if (!c) continue;
      for (const k in c) {
        if (k.startsWith("__reactProps$") || k.startsWith("__reactFiber$") || k.startsWith("__reactEventHandlers$")) {
          const p = c[k];
          if (!p) continue;
          const target = p.memoizedProps || p;
          if (target?.crop?.fertiliser || target?.plot?.fertiliser || target?.fertiliser) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Kiểm tra có popup / hòm đồ đang mở không
  function coPopupDangMo() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      // Ưu tiên 1: Role dialog hoặc class modal
      const dlgs = doc.querySelectorAll('[role="dialog"], div[class*="modal"]');
      for (const d of dlgs) {
        if (xemPhanTuRanh(d)) return true;
      }
      // Ưu tiên 2: Phần tử có nút close đang hiển thị
      const closes = doc.querySelectorAll('img[src*="close"], img[src*="cancel"]');
      for (const img of closes) {
        if (xemPhanTuRanh(img)) return true;
      }
    }
    return false;
  }

  // Kiểm tra xem giỏ đồ (lưới phân bón / hạt giống) có đang mở thật sự trên màn hình không
  function khoDoDangHienThi() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      const cacNhan = doc.querySelectorAll("div, span, p");
      for (const n of cacNhan) {
        if (!xemPhanTuRanh(n)) continue;
        const txt = (n.textContent || "").trim();
        if (txt === "Fertilisers" || txt === "Fertiliser" || txt === "Spring Seeds" || txt === "Seeds" || txt.startsWith("Spring Seeds")) {
          return true;
        }
      }
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
        // Cách 1: Tìm nút đóng (close/cancel) trong popup
        const cacAnhClose = doc.querySelectorAll(
          'img[src*="close"], img[src*="cancel"], button[aria-label="close"], [class*="close-btn"]'
        );
        for (const img of cacAnhClose) {
          if (!xemPhanTuRanh(img)) continue;
          const nutDong = img.closest("button, [role='button'], div[class*='cursor-pointer']") || img;
          clickTam(nutDong);
          daClick = true;
          break;
        }
        if (daClick) break;

        // Cách 2: Bắn Escape qua cửa sổ
        try {
          const view = doc.defaultView || window;
          view.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
          daClick = true;
        } catch (_e) {}
      }

      await ngu(400);

      // Kiểm tra giỏ đồ đã đóng chưa
      if (!khoDoDangHienThi()) {
        return;
      }
    }

    // Lần cuối bắn thêm Escape một lần nữa
    try { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true })); } catch (_e) {}
    await ngu(300);
  }

  // Tìm icon mở giỏ đồ (Basket) trên màn hình HUD ngoài màn hình
  function timIconHoDo() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      // 1. Selector chuẩn từ Sunflower Land: img basket KHÔNG có alt="item"
      const basketHud = doc.querySelector('img[src*="basket"]:not([alt]), img[src*="/icons/basket"]:not([alt])');
      if (basketHud && xemPhanTuRanh(basketHud)) {
        const btn = basketHud.closest("button, [role='button'], .cursor-pointer, [class*='cursor-pointer'], div") || basketHud;
        return btn;
      }
      // 2. Dự phòng: tìm img basket không nằm trong modal scrollable
      const imgs = doc.querySelectorAll('img[src*="basket"], img[src*="backpack"], img[src*="bag"]');
      for (const img of imgs) {
        if (!xemPhanTuRanh(img)) continue;
        if (img.closest('.scrollable, [role="dialog"], [role="modal"]')) continue;
        const btn = img.closest("button, [role='button'], .cursor-pointer, [class*='cursor-pointer']") || img;
        if (xemPhanTuRanh(btn)) return btn;
      }
    }
    return null;
  }

  // Chọn Sprout Mix: kiểm tra trên hotbar trước, nếu chưa có thì mở Basket chọn đúng mục Fertilisers
  async function chuanBiSproutMix() {
    console.log("[SFL Rắc Phân] 🔍 Kiểm tra vật phẩm Sprout Mix...");

    // 1. Thử tìm Sprout Mix trên thanh Hotbar (nếu đã có sẵn ngoài màn hình)
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      const imgs = doc.querySelectorAll('img[src*="sprout_mix"]');
      for (const img of imgs) {
        if (!xemPhanTuRanh(img)) continue;
        // Phải nằm ngoài modal
        if (img.closest('.scrollable, .overflow-y-auto')) continue;
        const btn = img.closest("button, [role='button'], .cursor-pointer, [class*='cursor-pointer']") || img;
        if (xemPhanTuRanh(btn) && !khoDoDangHienThi()) {
          console.log("[SFL Rắc Phân] 🌾 Đã chọn Sprout Mix trực tiếp trên Hotbar!");
          clickTam(btn);
          await ngu(500);
          return true;
        }
      }
    }

    // 2. Mở Giỏ đồ (Basket) nếu chưa mở
    let dangMo = khoDoDangHienThi();
    if (!dangMo) {
      console.log("[SFL Rắc Phân] 📦 Giỏ đồ chưa mở → Tiến hành bấm mở giỏ đồ (Basket)...");
      const iconKho = timIconHoDo();
      if (!iconKho) {
        console.log("[SFL Rắc Phân] ⚠️ Không tìm thấy nút mở giỏ đồ trên màn hình.");
        return false;
      }
      clickTam(iconKho);

      for (let i = 0; i < 8; i += 1) {
        await ngu(250);
        if (khoDoDangHienThi()) {
          dangMo = true;
          break;
        }
      }
    } else {
      console.log("[SFL Rắc Phân] 📦 Giỏ đồ đã mở sẵn trên màn hình.");
    }

    if (!dangMo) {
      console.log("[SFL Rắc Phân] ⚠️ Không thấy modal giỏ đồ hiển thị sau khi bấm mở.");
      return false;
    }

    let docModal = null;
    for (const doc of layTaiLieuGame()) {
      if (doc && doc.querySelector('.scrollable, div[style*="dark_border.png"]')) {
        docModal = doc;
        break;
      }
    }
    if (!docModal) docModal = document;

    // 3. ĐẢM BẢO ĐANG Ở ĐÚNG TAB "BASKET" (TUYỆT ĐỐI KHÔNG CLICK CHEST!)
    // Nếu tab Basket có cursor-pointer (chưa active), click để chuyển về Basket
    const cacTab = docModal.querySelectorAll(".flex.items-center.cursor-pointer");
    for (const tab of cacTab) {
      if (!xemPhanTuRanh(tab)) continue;
      const txt = (tab.textContent || "").trim();
      const hasBasket = txt.includes("Basket") || !!tab.querySelector('img[src*="basket"]');
      if (hasBasket) {
        console.log("[SFL Rắc Phân] 🧺 Chuyển về đúng tab Basket...");
        clickTam(tab);
        await ngu(700);
        break;
      }
    }

    // 4. Tìm ô Sprout Mix bên trong mục "Fertilisers" theo DOM chuẩn xác
    let slotSprout = null;
    const cacHeader = docModal.querySelectorAll("div, span, p");
    for (const h of cacHeader) {
      if (!xemPhanTuRanh(h)) continue;
      const txt = (h.textContent || "").trim();
      if (txt === "Fertilisers" || txt === "Fertiliser" || txt.startsWith("Fertilisers")) {
        const secContainer = h.closest(".flex.flex-col") || h.parentElement?.parentElement;
        if (secContainer) {
          const cacSlot = secContainer.querySelectorAll(".bg-brown-600, div.cursor-pointer");
          for (const slot of cacSlot) {
            if (xemPhanTuRanh(slot) && slot !== h) {
              slotSprout = slot;
              break;
            }
          }
        }
      }
      if (slotSprout) break;
    }

    if (!slotSprout) {
      console.log("[SFL Rắc Phân] ⚠️ Không tìm thấy ô phân bón Sprout Mix trong mục Fertilisers.");
      await dongHetPopup();
      return false;
    }

    // Đọc số lượng
    const badge = slotSprout.querySelector("div.text-xs, div[class*='text-'], div.z-10, span");
    const soLuong = badge ? (badge.textContent || "").trim() : "";
    console.log(`%c[SFL Rắc Phân] 🌾 ĐÃ CHỌN PHÂN BÓN SPROUT MIX (Số lượng hiện có: ${soLuong || "có sẵn"})!`, "color: #4caf50; font-weight: bold; font-size: 13px;");

    // Kiểm tra xem ô này đã có selectbox chưa
    const coSelectBox = !!slotSprout.querySelector('img[src*="selectbox_"]');
    if (!coSelectBox) {
      clickTam(slotSprout);
      await ngu(700);
    } else {
      console.log("[SFL Rắc Phân] ✔️ Sprout Mix đã được chọn sẵn trên tay!");
    }

    // Đóng hoàn toàn modal
    console.log("[SFL Rắc Phân] ❌ Đóng modal sau khi đã chọn Sprout Mix...");
    await dongHetPopup();
    await ngu(400);
    return true;
  }


  // Kiểm tra toàn diện xem một ô đất đã được rắc phân hay chưa (icon phân bón, React, bộ nhớ)
  function laODaCoPhan(el, coords) {
    if (!el) return false;

    // 1. Kiểm tra trong Set bộ nhớ toàn cục S.cacODaRacPhan
    if (S.cacODaRacPhan instanceof Set && coords?.key && S.cacODaRacPhan.has(coords.key)) {
      return true;
    }

    // 2. Kiểm tra trong S.mapData nếu có
    if (S.mapData && Array.isArray(S.mapData.cayTrong)) {
      const itemMap = S.mapData.cayTrong.find((c) => c.key === coords?.key);
      if (itemMap && (itemMap.trangThai === "daRacPhan" || itemMap.daCoPhan)) {
        return true;
      }
    }

    // 3. Kiểm tra icon phân bón góc trên (Sprout Mix / Rapid Root).
    // QUAN TRỌNG: soil2.png / volcanoSoil2.png KHÔNG còn là dấu hiệu "đã rắc phân" vì game hiện
    // dùng chúng làm đất thường cho mọi ô ruộng, nên không được dùng để nhận diện phân bón.
    const htmlToanBo = (el.outerHTML || el.innerHTML || "").toLowerCase();
    const coBadgePhan = laCoIconPhanBon(el);
    if (
      htmlToanBo.includes("sprout_mix") ||
      htmlToanBo.includes("fertiliser") ||
      htmlToanBo.includes("fertilizer") ||
      htmlToanBo.includes("rapid_root") ||
      coBadgePhan
    ) {
      if (S.cacODaRacPhan instanceof Set && coords?.key) {
        S.cacODaRacPhan.add(coords.key);
      }
      return true;
    }

    // 4. Kiểm tra từng thẻ <img> bên trong ô đất và phần tử cha
    const imgs = Array.from(el.querySelectorAll("img"));
    for (const img of imgs) {
      const src = (img.currentSrc || img.src || img.getAttribute("src") || "").toLowerCase();
      const alt = (img.getAttribute("alt") || "").toLowerCase();
      if (
        src.includes("sprout_mix") || src.includes("fertiliser") ||
        src.includes("fertilizer") || src.includes("rapid_root") ||
        alt.includes("sprout_mix") ||
        alt.includes("fertiliser") || alt.includes("fertilizer")
      ) {
        if (S.cacODaRacPhan instanceof Set && coords?.key) {
          S.cacODaRacPhan.add(coords.key);
        }
        return true;
      }
    }

    // 5. Kiểm tra qua React Fiber/Props
    if (kiemTraReactPhanBon(el)) {
      if (S.cacODaRacPhan instanceof Set && coords?.key) {
        S.cacODaRacPhan.add(coords.key);
      }
      return true;
    }

    return false;
  }

  // Quét tìm tất cả các ô đất ruộng trống CHƯA RẮC PHÂN trên đảo
  function timDanhSachODatCanRacPhan() {
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

        // 1. Phải là ô đất ruộng
        const laRuong = duongDan.some((s) => s.includes("soil") || s.includes("sand_dug") || s.includes("/crops/")) ||
                        (el.innerHTML || "").toLowerCase().includes("soil");
        if (!laRuong) continue;

        // Bỏ qua luống hoa & vườn quả
        const laHoa = duongDan.some((s) => s.includes("flower_bed") || s.includes("/flowers/"));
        if (laHoa) continue;
        const laQua = duongDan.some((s) => s.includes("fruit_patch") || s.includes("/fruit/"));
        if (laQua) continue;
        const laCompost = duongDan.some((s) => s.includes("composter") || s.includes("compost_bin"));
        if (laCompost) continue;

        // 2. Ô bị khóa -> bỏ qua
        const biKhoa = duongDan.some((s) => s.includes("lock")) || noiDung.includes("lock");
        if (biKhoa) continue;

        // 3. LOẠI TRỪ 100% CÁC Ô BỊ ẢNH HƯỞNG BỞI THỜI TIẾT XẤU / THIÊN TAI
        if (laOBiAnhHuongThoiTiet(el)) {
          continue;
        }

        // 4. Có cây chín, cây non, hoặc đang đếm giờ -> bỏ qua
        const coDemGio = /\d+\s*(?:mins?|secs?|hours?|hrs?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung);
        const laCayDangLon = duongDan.some((s) =>
          (s.includes("seedling") || s.includes("halfway") || s.includes("almost") || s.includes("growing") || (s.includes("sprout") && !s.includes("sprout_mix")))
        );
        const anhCayChin = duongDan.some((s) =>
          (s.includes("/crops/") || s.includes("/volcano/crops/")) &&
          (s.includes("plant") || s.includes("crop")) &&
          !s.includes("soil") && !s.includes("seed") && !s.includes("sprout_mix")
        );

        if (coDemGio || laCayDangLon || anhCayChin) {
          continue;
        }

        const coords = phanTichToaDo(el.getAttribute("style") || "");

        // 5. ĐẶC BIỆT: BỎ QUA 100% NẾU Ô NÀY ĐÃ ĐƯỢC RẮC PHÂN (SOIL2.PNG / BỘ NHỚ / REACT)
        if (laODaCoPhan(el, coords)) {
          continue;
        }

        daThem.add(el);
        const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer']") || el;
        danhSach.push({ el: nutClick, rootEl: el, coords });
      }
    }

    return danhSach;
  }

  // Thực hiện rắc phân vào tất cả các ô đất trống hợp lệ
  async function thucHienRacPhan() {
    const danhSach = timDanhSachODatCanRacPhan();
    if (danhSach.length === 0) {
      console.log("[SFL Rắc Phân] ℹ️ Không có ô đất trống nào cần rắc phân (tất cả ô trống đều đã rắc Sprout Mix / Rapid Root).");
      return false;
    }

    console.log(`[SFL Rắc Phân] 🌱 Phát hiện ${danhSach.length} ô đất trống cần rắc Sprout Mix...`);

    // Chuẩn bị phân bón Sprout Mix
    const sanSang = await chuanBiSproutMix();
    if (!sanSang) {
      console.log("[SFL Rắc Phân] ⚠️ Không thể chuẩn bị Sprout Mix, tạm dừng luồng rắc phân.");
      return false;
    }

    S.hanhDongCuoi = `🌱 Rắc Sprout Mix (${danhSach.length} ô)`;
    let daRac = 0;

    for (let i = 0; i < danhSach.length; i += 1) {
      // Nhường luồng nếu gặp Captcha giữa chừng
      if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
        console.log("[SFL Rắc Phân] 🚨 Gặp Captcha khi đang rắc phân! Tạm dừng luồng.");
        S.__captchaInterrupted = true;
        break;
      }

      const oDat = danhSach[i];

      // KIỂM TRA LẠI NGAY TẠI THỜI ĐIỂM CLICK: Nếu ô này vừa xuất hiện icon phân bón -> BỎ QUA NGAY!
      if (laODaCoPhan(oDat.rootEl || oDat.el, oDat.coords)) {
        console.log(`[SFL Rắc Phân] ⏭️ Ô đất (${oDat.coords.key}) ĐÃ CÓ PHÂN (icon phân bón) → Bỏ qua không rắc trùng!`);
        continue;
      }

      clickTam(oDat.el || oDat.rootEl);

      // Đánh dấu ô đã rắc phân vào Set bộ nhớ
      if (S.cacODaRacPhan instanceof Set) {
        S.cacODaRacPhan.add(oDat.coords.key);
      }

      // Cập nhật trạng thái trong S.mapData nếu có
      if (S.mapData && Array.isArray(S.mapData.cayTrong)) {
        const itemMap = S.mapData.cayTrong.find((c) => c.key === oDat.coords.key);
        if (itemMap) {
          itemMap.trangThai = "daRacPhan";
          itemMap.daCoPhan = true;
        }
      }

      daRac += 1;
      console.log(`[SFL Rắc Phân] 🌱 [${daRac}/${danhSach.length}] Đã rắc Sprout Mix vào ô đất (${oDat.coords.key})`);

      // Nghỉ ngắn tự nhiên giữa mỗi ô (240ms - 340ms)
      await ngu(240 + Math.floor(Math.random() * 100));
    }

    console.log(`%c[SFL Rắc Phân] ✔️ ĐÃ RẮC PHÂN XONG CHO ${daRac}/${danhSach.length} Ô ĐẤT TRỐNG!`, "color: #4caf50; font-weight: bold;");
    return daRac > 0;
  }

  // Hàm nhịp điều phối Scheduler
  async function tickFertilise() {
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
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("fertilise")) {
      return false;
    }

    dangBan = true;
    try {
      await thucHienRacPhan();
    } catch (err) {
      console.error("[SFL Rắc Phân] Lỗi trong luồng rắc phân Sprout Mix:", err);
      try { await dongHetPopup(); } catch (_e) {}
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickFertilise = tickFertilise;

})(window.SFL = window.SFL || {});
