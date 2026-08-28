// ═══════════════════════════════════════════════════════════════════
// LUỒNG 9 — TỰ ĐỘNG Ủ PHÂN HỮU CƠ (compost.js)
// Tự động thu hoạch phân hữu cơ đã chín & bắt đầu ủ mẻ mới
// Đúng theo sơ đồ doc/sodoluong-u-phan.drawio
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Bộ nhớ đệm trạng thái thùng ủ để tránh click liên tục khi đang ủ hoặc thiếu nguyên liệu
  let boNhoCompost = {};

  // Lấy danh sách tài liệu DOM (kể cả iframe)
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

  // Kiểm tra phần tử hiển thị
  function xemPhanTuRanh(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const view = el.ownerDocument?.defaultView || window;
    let style;
    try { style = view.getComputedStyle(el); } catch (_e) { return false; }
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  // Kiểm tra nút có THỰC SỰ khả dụng không
  // QUAN TRỌNG: Game dùng class Tailwind VARIANT "disabled:opacity-50" trên MỌI nút (kể cả nút
  // đang bấm được!) -> KHÔNG được check chuỗi con; chỉ check token chính xác + thuộc tính disabled thật.
  function laNutThatSuKhaDung(btn) {
    if (!btn || !xemPhanTuRanh(btn)) return false;
    if (btn.disabled || btn.getAttribute("disabled") !== null) return false;
    if (btn.getAttribute("aria-disabled") === "true") return false;
    const tokens = String(btn.className || "").split(/\s+/).filter(Boolean);
    if (tokens.includes("cursor-not-allowed")) return false;
    if (tokens.includes("disabled")) return false;
    return true;
  }

  // Kích hoạt React Fiber props
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

  // Click tâm chuẩn xác
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
    kichHoatReactProps(el);
    if (el.parentElement) kichHoatReactProps(el.parentElement);

    // Gửi event cho ô cha
    const placement = el.closest?.('[data-map-placement="true"]');
    if (placement && placement !== el) {
      try { placement.dispatchEvent(new MouseEvent("click", upOpts)); } catch (_e5) {}
      kichHoatReactProps(placement);
    }

    // Nhả chuột
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

  // Kiểm tra có popup đang mở không
  function coPopupDangMo() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      const dlgs = doc.querySelectorAll('[role="dialog"], div[class*="modal"]');
      for (const d of dlgs) { if (xemPhanTuRanh(d)) return true; }
      const closes = doc.querySelectorAll('img[src*="close"], img[src*="cancel"]');
      for (const img of closes) { if (xemPhanTuRanh(img)) return true; }
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
        try {
          const view = doc.defaultView || window;
          view.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
          daClick = true;
        } catch (_e) {}
      }
      await ngu(400);
      if (!coPopupDangMo()) return;
    }
    try { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true })); } catch (_e) {}
    await ngu(300);
  }

  // Kiểm tra modal Composter đang mở
  function timModalCompost() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      const dialogs = doc.querySelectorAll('[role="dialog"], div[class*="modal"]');
      for (const dlg of dialogs) {
        if (!xemPhanTuRanh(dlg)) continue;
        const txt = (dlg.textContent || "").toLowerCase();
        if (txt.includes("composter") || txt.includes("compost") || txt.includes("fertiliser") || txt.includes("worm")) {
          return { dlg, doc };
        }
      }
    }
    return null;
  }

  // Tìm các thùng ủ phân trên đảo
  function timDanhSachThungCompost() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    const daThem = new Set();
    const now = Date.now();

    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacAnh = doc.querySelectorAll('img[src*="composter"], img[src*="compost_bin"]');

      for (const img of cacAnh) {
        if (!xemPhanTuRanh(img)) continue;
        const root = img.closest('[data-map-placement="true"], div.cursor-pointer, [class*="cursor-pointer"]') || img.parentElement;
        if (!root || daThem.has(root) || !xemPhanTuRanh(root)) continue;

        const src = (img.src || "").toLowerCase();
        let loai = "basic";
        if (src.includes("premium")) loai = "premium";
        else if (src.includes("turbo")) loai = "turbo";

        // 1. Kiểm tra cooldown ghi nhớ của thùng này
        if (boNhoCompost[loai] && now < boNhoCompost[loai]) {
          continue; // Đang trong thời gian chờ (đang ủ hoặc thiếu nguyên liệu)
        }

        // 2. Kiểm tra trực quan trên đảo: nếu có thanh tiến trình ủ dở → bỏ qua
        const coThanhTienTrinh = !!root.querySelector("div[style*='background-color']");
        const noiDung = (root.textContent || "").toLowerCase();
        const coDemGio = /\d+\s*(?:mins?|secs?|hours?|hrs?|h\b|m\b)/i.test(noiDung);
        if (coThanhTienTrinh || coDemGio) {
          boNhoCompost[loai] = now + 5 * 60 * 1000; // Đang ủ, kiểm tra lại sau 5 phút
          continue;
        }

        daThem.add(root);
        const nutClick = root.querySelector(".cursor-pointer, [class*='cursor-pointer']") || root;
        danhSach.push({ el: nutClick, rootEl: root, loai });
      }
    }

    return danhSach;
  }

  // Xử lý 1 thùng ủ phân: mở modal -> collect nếu chín -> compost mẻ mới -> đóng modal
  async function xuLyThungCompost(thung) {
    console.log(`[SFL Compost] 💩 Mở thùng ủ phân: ${thung.loai.toUpperCase()}...`);
    S.hanhDongCuoi = `💩 Mở thùng ủ ${thung.loai}`;

    clickTam(thung.el);
    await ngu(1200);

    const modalInfo = timModalCompost();
    if (!modalInfo) {
      console.log("[SFL Compost] ⚠️ Không mở được modal thùng ủ phân");
      return false;
    }

    const { dlg, doc } = modalInfo;
    const now = Date.now();

    // ── BƯỚC 1: TỰ ĐỘNG CLAIM (Thu hoạch phân chín nếu có) ──
    const cacNutBanDau = Array.from(dlg.querySelectorAll("button, [role='button'], div[class*='cursor-pointer']"));
    const nutCollect = cacNutBanDau.find((b) => {
      if (!xemPhanTuRanh(b)) return false;
      const t = (b.textContent || "").trim().toLowerCase();
      return t === "collect" || t.includes("collect") || t === "thu hoạch";
    });

    const isCollectDisabled = !laNutThatSuKhaDung(nutCollect);

    if (nutCollect && !isCollectDisabled) {
      console.log(`%c[SFL Compost] 🎁 [Bước 1] Thu hoạch (Claim) phân chín từ thùng ${thung.loai.toUpperCase()}!`, "color: #4caf50; font-weight: bold;");
      S.hanhDongCuoi = `🎁 Thu hoạch phân ${thung.loai}`;
      clickTam(nutCollect);
      await ngu(1200);
      delete boNhoCompost[thung.loai];
    }

    // ── BƯỚC 2: TỰ ĐỘNG KHỞI ĐỘNG MẺ Ủ MỚI (Compost) ──
    // Kiểm tra xem modal còn mở không, nếu game tự đóng sau collect thì click mở lại
    let modalHienTai = timModalCompost();
    if (!modalHienTai) {
      console.log(`[SFL Compost] 🔄 Mở lại thùng ${thung.loai.toUpperCase()} để khởi động mẻ ủ mới...`);
      clickTam(thung.el);
      await ngu(1200);
      modalHienTai = timModalCompost();
    }

    if (modalHienTai) {
      const dlgCompost = modalHienTai.dlg;
      const cacNutMoi = Array.from(dlgCompost.querySelectorAll("button, [role='button'], div[class*='cursor-pointer']"));
      const nutCompost = cacNutMoi.find((b) => {
        if (!xemPhanTuRanh(b)) return false;
        const t = (b.textContent || "").trim().toLowerCase();
        return t === "compost" || t.includes("compost") || t === "ủ phân";
      });

      if (nutCompost) {
        const isDisabled = !laNutThatSuKhaDung(nutCompost);

        if (!isDisabled) {
          console.log(`%c[SFL Compost] 🚀 [Bước 2] Tự động khởi động mẻ ủ phân mới (${thung.loai.toUpperCase()})!`, "color: #2196f3; font-weight: bold;");
          S.hanhDongCuoi = `🚀 Khởi động ủ phân ${thung.loai}`;
          clickTam(nutCompost);
          await ngu(1200);

          // Ghi nhớ thời gian ủ: Basic = 6h, Turbo = 8h, Premium = 24h
          const thoiGianU = thung.loai === "premium" ? 24 * 3600000 : (thung.loai === "turbo" ? 8 * 3600000 : 6 * 3600000);
          boNhoCompost[thung.loai] = now + thoiGianU;
          console.log(`[SFL Compost] ⏳ Thùng ${thung.loai.toUpperCase()} đang ủ (thời gian dự kiến: ${thung.loai === "premium" ? "24h" : (thung.loai === "turbo" ? "8h" : "6h")}).`);
        } else {
          console.log(`[SFL Compost] ⚠️ Thùng ${thung.loai.toUpperCase()} không đủ nguyên liệu để bắt đầu mẻ ủ mới (chờ 15 phút).`);
          boNhoCompost[thung.loai] = now + 15 * 60 * 1000;
        }
      }
    }

    // ── BƯỚC 3: ĐÓNG MODAL (dongModalCompost KHÔNG được định nghĩa ở đâu -> dùng dongHetPopup) ──
    await dongHetPopup();
    await ngu(500);
    return true;
  }

  // Thực hiện luồng Compost (duyệt qua TẤT CẢ các thùng ủ trên đảo)
  async function thucHienCompost() {
    const danhSach = timDanhSachThungCompost();
    if (danhSach.length === 0) {
      console.log("[SFL Compost] ℹ️ Hiện không có thùng ủ phân nào cần thu hoạch hoặc khởi động.");
      return false;
    }

    console.log(`[SFL Compost] 🔍 Phát hiện ${danhSach.length} thùng ủ phân cần kiểm tra trên đảo.`);

    for (let i = 0; i < danhSach.length; i += 1) {
      const thung = danhSach[i];
      await xuLyThungCompost(thung);
      await ngu(800);
    }
    return true;
  }

  // Hàm nhịp điều phối
  async function tickCompost() {
    // 1. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return false;

    // 2. Kiểm tra tính năng tự động ủ phân (ID: 10)
    const tinhNangBat = S.cauHinh?.["10"] !== undefined ? !!S.cauHinh["10"] : true;
    if (!tinhNangBat) return false;

    // 3. Captcha đang mở? → nhường luồng
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
      S.__captchaInterrupted = true;
      return false;
    }

    // 4. Goblin Swarm đang chiếm farm? → dừng ngay
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    // 4. Đang bận?
    if (dangBan) return false;

    // 5. Xin khóa toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("compost")) {
      return false;
    }

    dangBan = true;
    try {
      await thucHienCompost();
    } catch (err) {
      console.error("[SFL Compost] Lỗi trong luồng ủ phân:", err);
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickCompost = tickCompost;

})(window.SFL = window.SFL || {});
