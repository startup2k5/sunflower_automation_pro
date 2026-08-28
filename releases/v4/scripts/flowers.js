// ═══════════════════════════════════════════════════════════════════
// LUỒNG 5 — THU HOẠCH HOA (flowers.js)
// Tự động tìm và thu hoạch hoa chín trên các luống hoa.
// Đúng theo sơ đồ doc/sodoluong-thu-hoach-hoa.drawio
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

  // Phân tích tọa độ từ style (50% ± px) của ô trên bản đồ
  function phanTichToaDo(styleStr) {
    if (!styleStr) return { x: 0, y: 0, key: "x_0_y_0" };
    const topMatch = styleStr.match(/top:\s*calc\(50%\s*([-+])\s*(\d+(\.\d+)?)px\)/i);
    const leftMatch = styleStr.match(/left:\s*calc\(50%\s*([-+])\s*(\d+(\.\d+)?)px\)/i);
    let y = topMatch ? (topMatch[1] === "-" ? -parseFloat(topMatch[2]) : parseFloat(topMatch[2])) : 0;
    let x = leftMatch ? (leftMatch[1] === "-" ? -parseFloat(leftMatch[2]) : parseFloat(leftMatch[2])) : 0;
    return { x, y, key: `x_${x}_y_${y}` };
  }

  // Tìm danh sách các luống hoa chín sẵn sàng thu hoạch
  function timDanhSachHoaChin() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];

    // 1. Kiểm tra từ cache mapData trước nếu có
    const mapDataHoa = S.mapData?.hoa || [];
    const hoaSanSang = mapDataHoa.filter((h) => h.trangThai === "sanSang");

    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacO = doc.querySelectorAll('[data-map-placement="true"]');

      for (const el of cacO) {
        if (!xemPhanTuRanh(el)) continue;
        const coords = phanTichToaDo(el.getAttribute("style") || "");
        const duongDan = Array.from(el.querySelectorAll("img")).map((i) => (i.src || "").toLowerCase());

        // Kiểm tra xem ô này có phải luống hoa chín không
        const laHoa = duongDan.some((s) => s.includes("/flowers/") || s.includes("flower_bed") || s.includes("sprout"));
        if (!laHoa) continue;

        const laLuongTrong = duongDan.some((s) => s.includes("flower_bed"));
        const coThanhTien = el.querySelector("div[style*='background-color']");
        const laMamNon = duongDan.some((s) => s.includes("sprout") || s.includes("growing"));

        if (!laLuongTrong && !coThanhTien && !laMamNon) {
          // Hoa đã chín hoàn toàn
          const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer']") || el;
          danhSach.push({ el: nutClick, coords });
        }
      }
    }

    return danhSach;
  }

  // Thực hiện thu hoạch 1 luống hoa chín mỗi nhịp
  async function thucHienThuHoachHoa() {
    const danhSachHoa = timDanhSachHoaChin();
    if (danhSachHoa.length === 0) return false;

    // Chỉ lấy đúng 1 luống hoa đầu tiên trong nhịp này
    const item = danhSachHoa[0];
    if (!xemPhanTuRanh(item.el)) return false;

    console.log(`[SFL Hoa] 🌸 Tiến hành thu hoạch 1 luống hoa tại (x=${item.coords.x}, y=${item.coords.y})`);
    S.hanhDongCuoi = `🌸 Thu hoạch hoa (${item.coords.x}, ${item.coords.y})`;

    clickTam(item.el);

    // Cập nhật trạng thái trong S.mapData
    if (S.mapData && Array.isArray(S.mapData.hoa)) {
      const hoaCache = S.mapData.hoa.find((h) => h.x === item.coords.x && h.y === item.coords.y);
      if (hoaCache) hoaCache.trangThai = "rong";
    }

    console.log(`[SFL Hoa] ✔ Đã thu hoạch xong 1 luống hoa tại (x=${item.coords.x}, y=${item.coords.y})`);
    return true;
  }

  // Hàm nhịp điều phối
  async function tickFlowerAction() {
    // 1. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return false;

    // 2. Kiểm tra tính năng trồng & thu hoạch hoa (ID: 8)
    const tinhNangBat = S.cauHinh?.["8"] !== undefined ? !!S.cauHinh["8"] : true;
    if (!tinhNangBat) return false;

    // 3. Captcha đang mở? → nhường luồng
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return false;

    // 4. Goblin Swarm đang chiếm farm? → dừng ngay
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    // 4. Đang bận?
    if (dangBan) return false;

    // 5. Kiểm tra có hoa chín trong cache map không
    if (S.mapData && Array.isArray(S.mapData.hoa)) {
      const coHoaChin = S.mapData.hoa.some((h) => h.trangThai === "sanSang");
      if (!coHoaChin) return false;
    }

    // 6. Xin khóa toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("flowers")) {
      return false;
    }

    dangBan = true;
    try {
      await thucHienThuHoachHoa();
    } catch (err) {
      console.error("[SFL Hoa] Lỗi luồng hoa:", err);
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickFlowerAction = tickFlowerAction;

})(window.SFL = window.SFL || {});
