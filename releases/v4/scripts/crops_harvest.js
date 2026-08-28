// ═══════════════════════════════════════════════════════════════════
// LUỒNG 8 — THU HOẠCH RUỘNG CÂY TRỒNG (crops_harvest.js)
// Luồng riêng CHUYÊN THU HOẠCH các ô ruộng nông sản đã chín
// Đúng theo sơ đồ doc/sodoluong-thu-hoach-ruong.drawio
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

    // Kích hoạt React Fiber handler
    kichHoatReactProps(el);
    if (el.parentElement) kichHoatReactProps(el.parentElement);

    // Gửi sự kiện cho cả ô placement cha nếu có
    const placement = el.closest?.('[data-map-placement="true"]');
    if (placement && placement !== el) {
      try { placement.dispatchEvent(new MouseEvent("click", upOpts)); } catch (_e5) {}
      kichHoatReactProps(placement);
    }

    // Nhả chuột và bỏ focus ngay sau khi click
    setTimeout(() => {
      try {
        if (typeof el.blur === "function") el.blur();
        el.dispatchEvent(new MouseEvent("mouseout", upOpts));
        el.dispatchEvent(new MouseEvent("mouseleave", upOpts));
        if (typeof PointerEvent !== "undefined") {
          el.dispatchEvent(new PointerEvent("pointerout", { ...upOpts, pointerId: 1, pointerType: "mouse" }));
          el.dispatchEvent(new PointerEvent("pointerleave", { ...upOpts, pointerId: 1, pointerType: "mouse" }));
        }
        if (placement && placement !== el) {
          if (typeof placement.blur === "function") placement.blur();
          placement.dispatchEvent(new MouseEvent("mouseout", upOpts));
          placement.dispatchEvent(new MouseEvent("mouseleave", upOpts));
        }
      } catch (_e6) {}
    }, 60);

    return true;
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

  // Tìm danh sách các ô ruộng cây trồng đã chín sẵn sàng thu hoạch
  function timDanhSachCayChin() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    const daThem = new Set();

    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;

      // 1. Tìm trực tiếp qua các ảnh plant.png / crop chín trong game
      const cacAnhPlant = doc.querySelectorAll("img[src*='plant.png'], img[src*='plant.webp'], img[src*='/crops/'], img[src*='/volcano/crops/']");
      for (const img of cacAnhPlant) {
        if (!xemPhanTuRanh(img)) continue;
        const src = (img.currentSrc || img.src || img.getAttribute("src") || "").toLowerCase();

        // Kiểm tra đúng là ảnh cây chín (plant.png / crop.png), loại trừ hoàn toàn phân bón
        const laPlantChin = (src.includes("/crops/") || src.includes("/volcano/crops/")) &&
                            (src.includes("plant") || src.includes("crop")) &&
                            !src.includes("soil") && !src.includes("seed") &&
                            !src.includes("sprout_mix") && !src.includes("fertiliser") && !src.includes("rapid_root") &&
                            !src.includes("seedling") && !src.includes("halfway") && !src.includes("almost");
        if (!laPlantChin) continue;

        const placement = img.closest('[data-map-placement="true"]') || img.closest('div.cursor-pointer, [class*="cursor-pointer"]') || img.parentElement;
        if (!placement || daThem.has(placement) || !xemPhanTuRanh(placement)) continue;

        // Tránh nhầm với Compost Bin, Fruit Patch, Flower
        const textToanBo = (placement.textContent || "").toLowerCase();
        const cacSrcTrongO = Array.from(placement.querySelectorAll("img")).map((i) => (i.src || "").toLowerCase());
        const laCompost = cacSrcTrongO.some((s) => s.includes("compost") || s.includes("turbo") || s.includes("premium"));
        const coThanhTienTrinh = !!placement.querySelector("div[style*='background-color']");
        const coDemGio = /\d+\s*(?:mins?|secs?|hours?|hrs?|m\b|s\b|h\b)|\d+:\d+/i.test(textToanBo);

        if (laCompost || coThanhTienTrinh || coDemGio) continue;

        daThem.add(placement);
        const kh = src.match(/\/crops\/([a-z0-9_]+)/i) || src.match(/\/volcano\/crops\/([a-z0-9_]+)/i);
        const loai = kh ? kh[1] : "cây trồng";
        const nutClick = img.closest(".cursor-pointer, [class*='cursor-pointer']") || img;
        const coords = phanTichToaDo(placement.getAttribute("style") || "");

        danhSach.push({ el: nutClick, rootEl: placement, coords, loai });
      }

      // 2. Tìm qua các ô [data-map-placement="true"]
      const cacO = doc.querySelectorAll('[data-map-placement="true"]');
      for (const el of cacO) {
        if (daThem.has(el) || !xemPhanTuRanh(el)) continue;
        const cacAnh = Array.from(el.querySelectorAll("img"));
        const duongDan = cacAnh.map((i) => (i.getAttribute("src") || i.src || "").toLowerCase());
        const noiDung = (el.textContent || "").trim().toLowerCase();

        const laRuong = duongDan.some((s) => s.includes("soil") || s.includes("sand_dug") || s.includes("/crops/"));
        if (!laRuong) continue;

        const biKhoa = duongDan.some((s) => s.includes("lock")) || noiDung.includes("lock");
        const coThanhTienTrinh = !!el.querySelector("div[style*='background-color']");
        const coDemGio = /\d+\s*(?:mins?|secs?|hours?|hrs?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung);
        const laCayDangLon = duongDan.some((s) => s.includes("seedling") || s.includes("halfway") || s.includes("almost") || (s.includes("sprout") && !s.includes("sprout_mix")));

        if (biKhoa || coThanhTienTrinh || coDemGio || laCayDangLon) continue;

        const anhCayChin = duongDan.find((s) =>
          (s.includes("/crops/") || s.includes("/volcano/crops/")) &&
          (s.includes("plant") || s.includes("crop")) &&
          !s.includes("soil") && !s.includes("seed") &&
          !s.includes("sprout_mix") && !s.includes("fertiliser") && !s.includes("rapid_root")
        );
        if (!anhCayChin) continue;

        daThem.add(el);
        const kh = anhCayChin.match(/\/crops\/([a-z0-9_]+)/i) || anhCayChin.match(/\/volcano\/crops\/([a-z0-9_]+)/i);
        const loai = kh ? kh[1] : "cây trồng";
        const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer']") || el;
        const coords = phanTichToaDo(el.getAttribute("style") || "");
        danhSach.push({ el: nutClick, rootEl: el, coords, loai });
      }
    }

    return danhSach;
  }

  // Thực hiện thu hoạch HẾT toàn bộ các ô ruộng cây trồng đã chín
  async function thucHienThuHoachRuong() {
    const danhSachCay = timDanhSachCayChin();
    if (danhSachCay.length === 0) {
      return false; // Không có cây chín nào
    }

    console.log(`[SFL Ruộng] 🌾 Bắt đầu thu hoạch toàn bộ ${danhSachCay.length} ô cây trồng đã chín...`);
    let soLuongDaThu = 0;

    for (let i = 0; i < danhSachCay.length; i += 1) {
      // 1. Kiểm tra ngắt Captcha ngay lập tức nếu xuất hiện
      if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
        console.log("[SFL Ruộng] 🚨 Phát hiện Captcha trong lúc thu hoạch → Tạm dừng ngay!");
        S.__captchaInterrupted = true;
        break;
      }

      // 2. Kiểm tra ngắt Goblin Swarm ngay lập tức nếu xuất hiện
      if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) {
        console.log("[SFL Ruộng] 👺 Phát hiện Goblin Swarm trong lúc thu hoạch → Tạm dừng ngay!");
        break;
      }

      const cay = danhSachCay[i];
      if (!xemPhanTuRanh(cay.el)) continue;

      S.hanhDongCuoi = `🌾 Thu hoạch ${cay.loai || "cây"} (${i + 1}/${danhSachCay.length})`;
      clickTam(cay.el);
      soLuongDaThu += 1;

      // Xóa cờ nhớ phân bón của ĐÚNG ô vừa gặt xong (để ô này có thể nhận phân cho vụ mới sau này)
      // TUYỆT ĐỐI KHÔNG clear toàn bộ Set vì sẽ làm mất cờ nhớ của các ô trống khác đang ủ phân!
      if (S.cacODaRacPhan instanceof Set && cay.coords?.key) {
        S.cacODaRacPhan.delete(cay.coords.key);
      }

      console.log(`[SFL Ruộng] 🌾 [${soLuongDaThu}/${danhSachCay.length}] Thu hoạch ${cay.loai || "cây trồng"} tại (${cay.coords.key})`);

      // Nghỉ an toàn tự nhiên giữa các ô (650ms - 950ms) để chống click quá nhanh gây chồng 2 Captcha
      await ngu(650 + Math.floor(Math.random() * 300));
    }

    console.log(`%c[SFL Ruộng] ✔ ĐÃ THU HOẠCH XONG TOÀN BỘ ${soLuongDaThu}/${danhSachCay.length} Ô RUỘNG CHÍN!`, "color: #4caf50; font-weight: bold;");

    // SAU KHI THU HOẠCH XONG HOÀN TOÀN MỚI CẬP NHẬT LẠI BẢN ĐỒ MỘT LẦN DUY NHẤT
    if (soLuongDaThu > 0) {
      if (typeof S.quetBanDo === "function") {
        console.log("%c[SFL Ruộng] 🗺️ ĐÃ THU HOẠCH XONG HOÀN TOÀN → CẬP NHẬT LẠI BẢN ĐỒ CHO LUỒNG RẮC PHÂN...", "color: #00bcd4; font-weight: bold;");
        await ngu(800);
        await S.quetBanDo();
      }
    }

    return soLuongDaThu > 0;
  }

  // Hàm nhịp điều phối
  async function tickCropHarvest() {
    // 1. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return false;

    // 2. Kiểm tra tính năng thu hoạch cây trồng (ID: 7)
    const tinhNangBat = S.cauHinh?.["7"] !== undefined ? !!S.cauHinh["7"] : true;
    if (!tinhNangBat) return false;

    // 3. Captcha đang mở? → nhường luồng
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return false;

    // 4. Goblin Swarm đang chiếm farm? → dừng ngay
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    // 4. Đang bận?
    if (dangBan) return false;

    // 5. Kiểm tra có cây chín trong cache map không (nếu có cache)
    if (S.mapData && Array.isArray(S.mapData.cayTrong) && S.mapData.cayTrong.length > 0) {
      const coCay = S.mapData.cayTrong.some((c) => c.trangThai === "sanSang");
      if (!coCay) return false; // Không có ô nào chín
    }

    // 6. Xin khóa toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("crops_harvest")) {
      return false;
    }

    dangBan = true;
    try {
      await thucHienThuHoachRuong();
    } catch (err) {
      console.error("[SFL Ruộng] Lỗi luồng thu hoạch ruộng:", err);
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickCropHarvest = tickCropHarvest;

})(window.SFL = window.SFL || {});
