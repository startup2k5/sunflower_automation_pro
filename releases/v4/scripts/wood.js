// ═══════════════════════════════════════════════════════════════════
// LUỒNG 6 — CHẶT CÂY LẤY GỖ (wood.js)
// Tự động chặt lần lượt tất cả cây rừng sẵn sàng trên bản đồ.
// Mỗi lần chặt trừ 1 rìu trong cache. Chặt liên tục đến khi hết cây hoặc hết rìu.
// Đúng theo sơ đồ doc/sodoluong-chat-cay.drawio
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

  // Lấy số lượng rìu hiện có (-1 nếu chưa rõ / chưa quét kho)
  function laySoLuongRiu() {
    // 1. Kiểm tra trên HUD / thanh công cụ nếu có
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacImgAxe = doc.querySelectorAll('img[src*="tools/axe"], img[src*="game-assets/tools/axe"], img[src*="axe.png"]');
      for (const img of cacImgAxe) {
        if (!xemPhanTuRanh(img)) continue;
        const slot = img.closest("div, button, [role='button']") || img.parentElement;
        const nhanSo = slot?.querySelector('div[class*="z-10"], span, div.text-xxs, [class*="text-"], div');
        if (nhanSo) {
          const num = parseFloat((nhanSo.textContent || "").trim());
          if (!isNaN(num) && num > 0) return num;
        }
      }
    }

    // 2. Tìm trong kho đồ S.khoDo
    if (S.khoDo && typeof S.khoDo === "object") {
      for (const [k, v] of Object.entries(S.khoDo)) {
        const ten = k.toLowerCase();
        if (ten === "axe" || ten.includes("axe") || ten === "rìu" || ten.includes("riu")) {
          const num = Number(v);
          if (!isNaN(num) && num > 0) return num;
        }
      }
    }

    return -1; // Chưa chắc chắn, KHÔNG chặn luồng
  }

  // Kiểm tra popup báo thiếu rìu hoặc cần chế tạo rìu
  function kiemTraThieuRiu(doc) {
    if (!doc) return false;
    const cacNhan = doc.querySelectorAll("span, p, div, h2, h3, button");
    for (const el of cacNhan) {
      if (!xemPhanTuRanh(el)) continue;
      const txt = (el.textContent || "").trim().toLowerCase();
      if (
        txt.includes("craft an axe") ||
        txt.includes("you need an axe") ||
        txt.includes("need an axe") ||
        txt.includes("không đủ rìu") ||
        txt.includes("craft 1 axe")
      ) {
        return true;
      }
    }
    return false;
  }

  // Đóng popup nếu xuất hiện
  async function dongPopupNeuCo() {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      const imgClose = doc.querySelector('img[src*="close"]');
      if (imgClose && xemPhanTuRanh(imgClose)) {
        clickTam(imgClose);
        await ngu(300);
        return true;
      }
    }
    return false;
  }

  // Tìm danh sách các cây có thể chặt trên bản đồ
  function timDanhSachCayChatDuoc() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    const daThem = new Set();

    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacO = doc.querySelectorAll('[data-map-placement="true"]');

      for (const el of cacO) {
        if (!xemPhanTuRanh(el)) continue;
        const cacAnh = Array.from(el.querySelectorAll("img"));
        const cacSrc = cacAnh.map((i) => (i.getAttribute("src") || i.src || "").toLowerCase());
        const noiDung = (el.textContent || "").trim().toLowerCase();

        // Kiểm tra xem ô có chứa ảnh cây rừng không (tất cả các mùa)
        const laCayRung = cacSrc.some((s) =>
          s.includes("resources/tree") ||
          s.includes("/tree/") ||
          s.includes("tree.png") ||
          s.includes("autumn_tree") ||
          s.includes("spring_tree") ||
          s.includes("summer_tree") ||
          s.includes("winter_tree") ||
          s.includes("bush_shrub") ||
          s.includes("tree_stump")
        );
        if (!laCayRung) continue;

        // Cây là GỐC CÂY (stump) nếu:
        // 1. Src chứa "stump"
        // 2. Có text thời gian đếm ngược đang mọc lại
        // 3. Ảnh có class opacity-50
        const laStumpSrc = cacSrc.some((s) => s.includes("stump") || s.includes("tree_stump"));
        const coDemGio = /\d+\s*(?:mins?|secs?|hours?|hrs?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung);
        const coMoMo = cacAnh.some((i) => (i.className || "").includes("opacity-50"));
        const laGocCay = laStumpSrc || coDemGio || coMoMo;

        if (!laGocCay && !daThem.has(el)) {
          daThem.add(el);
          const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer'], [class*='hover:img-highlight']") || el;
          const coords = phanTichToaDo(el.getAttribute("style") || "");
          danhSach.push({ el: nutClick, rootEl: el, coords });
        }
      }
    }
    return danhSach;
  }

  // Tìm nút chặt xác nhận (nếu có popup nút Chop/Timber)
  function timNutChopXacNhan(doc) {
    if (!doc) return null;
    const cacNut = doc.querySelectorAll("button, [role='button'], div[class*='cursor-pointer']");
    for (const btn of cacNut) {
      if (!xemPhanTuRanh(btn)) continue;
      const txt = (btn.textContent || "").trim().toLowerCase();
      if ((txt === "chop" || txt === "timber" || txt.includes("chặt")) && txt.length < 20) {
        return btn;
      }
    }
    return null;
  }

  // Thực hiện chặt lần lượt các cây rừng sẵn sàng
  async function thucHienChatCay() {
    const danhSachCay = timDanhSachCayChatDuoc();
    if (danhSachCay.length === 0) {
      console.log("[SFL Gỗ] 🌲 Không còn cây rừng nào có thể chặt.");
      return false;
    }

    console.log(`[SFL Gỗ] 🌲 Phát hiện ${danhSachCay.length} cây rừng sẵn sàng chặt...`);

    let daChatSoLuong = 0;
    for (let i = 0; i < danhSachCay.length; i += 1) {
      // 1. Dừng ngay nếu có Captcha
      if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
        console.log("[SFL Gỗ] 🚨 Phát hiện Captcha khi đang chặt cây → dừng ngay!");
        S.__captchaInterrupted = true;
        break;
      }

      // 2. Dừng ngay nếu có Goblin Swarm
      if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) {
        console.log("[SFL Gỗ] 👺 Phát hiện Goblin Swarm khi đang chặt cây → dừng ngay!");
        break;
      }

      const cay = danhSachCay[i];
      if (!xemPhanTuRanh(cay.el)) continue;

      console.log(`[SFL Gỗ] 🪓 [${daChatSoLuong + 1}/${danhSachCay.length}] Đang chặt cây tại (${cay.coords.x}, ${cay.coords.y})...`);
      S.hanhDongCuoi = `🪓 Chặt cây (${cay.coords.x}, ${cay.coords.y})`;

      // Click liên tiếp 3 lần mô phỏng chặt rìu
      clickTam(cay.el);
      await ngu(130);
      clickTam(cay.el);
      await ngu(130);
      clickTam(cay.el);
      await ngu(250);

      // Nếu có nút xác nhận Chop hiện lên → bấm
      const doc = cay.el.ownerDocument || document;
      const nutChop = timNutChopXacNhan(doc);
      if (nutChop) {
        clickTam(nutChop);
        await ngu(200);
      }

      // Kiểm tra xem game có hiện popup báo thiếu rìu không
      if (kiemTraThieuRiu(doc)) {
        console.log("[SFL Gỗ] ⚠️ Game hiện thông báo thiếu Rìu → đóng popup và dừng chặt cây");
        await dongPopupNeuCo();
        S.__chacChanHetRiu = true;
        if (S.khoDo && typeof S.khoDo === "object") {
          S.khoDo["axe"] = 0;
        }
        break;
      }

      // Đánh dấu cây đã chặt trong cache mapData
      if (S.mapData && Array.isArray(S.mapData.cay)) {
        const itemMap = S.mapData.cay.find((c) => c.x === cay.coords.x && c.y === cay.coords.y);
        if (itemMap) itemMap.trangThai = "goc";
      }

      daChatSoLuong += 1;
      console.log(`[SFL Gỗ] ✔ Đã chặt xong cây tại (${cay.coords.x}, ${cay.coords.y})`);

      // Nghỉ an toàn tự nhiên giữa các cây (650ms - 900ms)
      await ngu(650 + Math.floor(Math.random() * 250));
    }

    return daChatSoLuong > 0;
  }

  // Hàm nhịp điều phối
  async function tickWoodChop() {
    // 1. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return false;

    // 2. Kiểm tra tính năng chặt cây (ID: 5)
    const tinhNangBat = S.cauHinh?.["5"] !== undefined ? !!S.cauHinh["5"] : true;
    if (!tinhNangBat) return false;

    // 3. Captcha đang mở? → nhường luồng
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return false;

    // 4. Goblin Swarm đang chiếm farm? → dừng ngay
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    // 5. Đang bận?
    if (dangBan) return false;

    // 6. Chỉ bỏ qua nếu đã chắc chắn hết rìu (được xác nhận qua popup thiếu rìu của game)
    if (S.__chacChanHetRiu === true && laySoLuongRiu() <= 0) {
      return false;
    }

    // 7. Kiểm tra có cây chặt được trong cache map không (nếu có cache và có cây)
    if (S.mapData && Array.isArray(S.mapData.cay) && S.mapData.cay.length > 0) {
      const coCay = S.mapData.cay.some((c) => c.trangThai === "chatDuoc");
      if (!coCay) return false; // Không có cây nào có thể chặt
    }

    // 8. Xin khóa toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("wood")) {
      return false;
    }

    dangBan = true;
    try {
      await thucHienChatCay();
    } catch (err) {
      console.error("[SFL Gỗ] Lỗi luồng chặt cây:", err);
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickWoodChop = tickWoodChop;

})(window.SFL = window.SFL || {});
