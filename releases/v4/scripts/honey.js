// ═══════════════════════════════════════════════════════════════════
// LUỒNG 4 — THU HOẠCH MẬT ONG (honey.js)
// Tự động tìm và thu hoạch mật ong khi tổ ong chín mật.
// Đúng theo sơ đồ doc/sodoluong-thu-hoach-mat-ong.drawio
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

  // Lấy node gốc của tổ ong (Beehive)
  function layRootToOng(el) {
    let n = el;
    for (let i = 0; i < 20 && n; i++) {
      if (n.classList?.contains("cursor-pointer") || n.querySelector?.('img[alt="Beehive"]')) {
        return n;
      }
      n = n.parentElement;
    }
    return el;
  }

  // Tìm danh sách tổ ong có mật chín
  function timToOngChinMat() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    const daThem = new Set();

    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;

      // 1. Tìm bằng class 'honey-drop-ready' (giọt mật chín trên tổ ong)
      const giotMat = doc.querySelectorAll('img.honey-drop-ready, img[src*="honey_drop"], img[alt*="Honey"]');
      for (const gm of giotMat) {
        if (!xemPhanTuRanh(gm)) continue;
        const root = layRootToOng(gm);
        if (root && !daThem.has(root) && xemPhanTuRanh(root)) {
          daThem.add(root);
          danhSach.push(gm);
        }
      }

      // 2. Tìm bằng thanh tiến trình tổ ong đầy màu vàng cam rgb(255, 176, 30)
      const thanhTienTrinh = doc.querySelectorAll('div[style*="background-color: rgb(255, 176, 30)"]');
      for (const thanh of thanhTienTrinh) {
        const w = thanh.style.width || "";
        if (w === "100%" || w === "100.00%" || w.includes("28.875px") || parseFloat(w) >= 28) {
          const root = layRootToOng(thanh);
          const interactive = root?.querySelector?.('img[alt="Beehive"]') || root?.querySelector?.(".cursor-pointer") || root;
          if (interactive && !daThem.has(interactive) && xemPhanTuRanh(interactive)) {
            daThem.add(interactive);
            danhSach.push(interactive);
          }
        }
      }
    }

    return danhSach;
  }

  // Thực hiện thu hoạch 1 tổ ong mỗi nhịp
  async function thucHienThuHoachMat() {
    const danhSachMat = timToOngChinMat();
    if (danhSachMat.length === 0) return false;

    // Chỉ lấy đúng 1 tổ ong chín đầu tiên trong nhịp này
    const target = danhSachMat[0];
    if (!xemPhanTuRanh(target)) return false;

    console.log("[SFL Mật Ong] 🍯 Tiến hành thu hoạch 1 tổ ong chín mật");
    S.hanhDongCuoi = "🍯 Thu hoạch mật ong";

    clickTam(target);

    console.log("[SFL Mật Ong] ✔ Đã thu hoạch xong 1 tổ mật ong");
    return true;
  }

  // Hàm nhịp điều phối
  async function tickHoney() {
    // 1. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return false;

    // 2. Kiểm tra tính năng mật ong (ID: 3)
    const tinhNangBat = S.cauHinh?.["3"] !== undefined ? !!S.cauHinh["3"] : true;
    if (!tinhNangBat) return false;

    // 3. Captcha đang mở? → nhường luồng
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return false;

    // 4. Goblin Swarm đang chiếm farm? → dừng ngay
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    // 4. Đang bận?
    if (dangBan) return false;

    // 5. Tìm nhanh xem có tổ ong chín mật không trước khi xin khóa
    const danhSachMat = timToOngChinMat();
    if (danhSachMat.length === 0) return false;

    // 6. Xin khóa toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("honey")) {
      return false;
    }

    dangBan = true;
    try {
      await thucHienThuHoachMat();
    } catch (err) {
      console.error("[SFL Mật Ong] Lỗi luồng mật ong:", err);
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickHoney = tickHoney;

})(window.SFL = window.SFL || {});
