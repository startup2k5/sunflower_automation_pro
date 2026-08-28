// ═══════════════════════════════════════════════════════════════════
// LUỒNG 3 — THU HOẠCH NẤM (mushrooms.js)
// Tự động tìm và tap thu hoạch nấm (Wild Mushroom / Magic Mushroom)
// Đúng theo sơ đồ doc/sodoluong-thu-hoach-nam.drawio
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

    const placement = el.closest?.('[data-map-placement="true"]');
    if (placement && placement !== el) {
      try { placement.dispatchEvent(new MouseEvent("click", upOpts)); } catch (_e5) {}
      kichHoatReactProps(placement);
    }

    // NHẢ CHUỘT VÀ BỎ FOCUS NGAY SAU KHI CLICK (để xóa viền sáng hover / viền chọn trong game)
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

  // Tìm danh sách tất cả các phần tử nấm đang hiển thị trên map
  function timDanhSachPhanTuNam() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    const daThem = new Set();

    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;

      // 1. Tìm các element có class mushroom hoặc sprite sheet move
      const ungVien = doc.querySelectorAll("div.mushroom, div[class*='mushroom'], [class*='mushroom'], .react-responsive-spritesheet-container__move");
      for (const el of ungVien) {
        const rootEl = el.closest("div.mushroom, div[class*='mushroom']") || el;
        if (daThem.has(rootEl) || !xemPhanTuRanh(rootEl)) continue;

        const moveEl = rootEl.querySelector(".react-responsive-spritesheet-container__move") || rootEl;
        const bgImg = layBackgroundImage(moveEl) + " " + layBackgroundImage(rootEl);
        const cacImg = Array.from(rootEl.querySelectorAll("img")).map((i) => (i.src || "").toLowerCase());
        const coNam = bgImg.includes("mushroom") || bgImg.includes("wild_mushroom") || bgImg.includes("magic_mushroom") ||
          cacImg.some((s) => s.includes("mushroom")) || (rootEl.className && String(rootEl.className).toLowerCase().includes("mushroom"));

        if (coNam) {
          daThem.add(rootEl);
          danhSach.push(rootEl);
        }
      }

      // 2. Tìm trong các placement trên map
      const cacO = doc.querySelectorAll('[data-map-placement="true"]');
      for (const el of cacO) {
        if (daThem.has(el) || !xemPhanTuRanh(el)) continue;
        const cacImg = Array.from(el.querySelectorAll("img")).map((i) => (i.src || "").toLowerCase());
        const bgImg = layBackgroundImage(el);
        const coNam = cacImg.some((s) => s.includes("mushroom") || s.includes("wild_mushroom") || s.includes("magic_mushroom")) || bgImg.includes("mushroom");

        if (coNam) {
          daThem.add(el);
          danhSach.push(el);
        }
      }
    }

    return danhSach;
  }

  // Thực hiện thu hoạch tất cả các cây nấm đang có trên đảo
  async function thucHienThuHoachNam() {
    const danhSachNam = timDanhSachPhanTuNam();
    if (danhSachNam.length === 0) {
      return false;
    }

    console.log(`%c[SFL Nấm] 🍄 Phát hiện ${danhSachNam.length} cây nấm trên đảo! Bắt đầu thu hoạch tất cả...`, "color: #ff9800; font-weight: bold;");
    S.hanhDongCuoi = `🍄 Thu hoạch ${danhSachNam.length} cây nấm`;
    let daThu = 0;

    for (let i = 0; i < danhSachNam.length; i += 1) {
      if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) break;
      if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) break;

      const elNam = danhSachNam[i];
      if (!xemPhanTuRanh(elNam)) continue;

      const nutClick = elNam.querySelector(".cursor-pointer, [class*='cursor-pointer']") || elNam;
      clickTam(nutClick);
      daThu += 1;
      console.log(`[SFL Nấm] 🍄 [${daThu}/${danhSachNam.length}] Đã thu hoạch 1 cây nấm`);

      // Khoảng nghỉ tự nhiên giữa các cây nấm (450ms - 650ms)
      await ngu(450 + Math.floor(Math.random() * 200));
    }

    console.log(`%c[SFL Nấm] ✔️ ĐÃ THU HOẠCH XONG TOÀN BỘ ${daThu}/${danhSachNam.length} CÂY NẤM TRÊN ĐẢO!`, "color: #4caf50; font-weight: bold;");
    if (daThu > 0 && typeof S.quetData === "function") {
      await ngu(400);
      await S.quetData();
    }
    return daThu > 0;
  }

  // Hàm nhịp điều phối
  async function tickThuHoachNam() {
    // 1. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return false;

    // 2. Kiểm tra tính năng thu hoạch nấm (ID: 4)
    const tinhNangBat = S.cauHinh?.["4"] !== undefined ? !!S.cauHinh["4"] : true;
    if (!tinhNangBat) return false;

    // 3. Captcha đang mở? → nhường luồng
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return false;

    // 4. Goblin Swarm đang chiếm farm? → dừng ngay
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    // 4. Đang bận?
    if (dangBan) return false;

    // 5. Kiểm tra có nấm trong cache map không (nếu có mapData)
    if (S.mapData && Array.isArray(S.mapData.nam) && S.mapData.nam.length === 0) {
      return false; // không có nấm trên map
    }

    // 6. Xin khóa toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("nam")) {
      return false;
    }

    dangBan = true;
    try {
      await thucHienThuHoachNam();
    } catch (err) {
      console.error("[SFL Nấm] Lỗi luồng thu hoạch nấm:", err);
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickThuHoachNam = tickThuHoachNam;

})(window.SFL = window.SFL || {});
