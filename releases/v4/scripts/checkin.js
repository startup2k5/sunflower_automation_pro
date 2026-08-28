// ═══════════════════════════════════════════════════════════════════
// LUỒNG 2 — CHECK-IN THUYỀN (checkin.js)
// Tự động tap vào chiếc thuyền check-in xuất hiện trên bản đồ.
// Đúng theo sơ đồ doc/sodoluong-checkin-thuyen.drawio
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

  // Tìm element thuyền check-in đang hiển thị
  function timElementThuyen() {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;

      // 1. Tìm theo placement trên bản đồ
      const cacO = doc.querySelectorAll('[data-map-placement="true"]');
      for (const el of cacO) {
        const cacAnh = el.querySelectorAll("img");
        for (const img of cacAnh) {
          const src = (img.getAttribute("src") || "").toLowerCase();
          if (src.includes("ivborw0kggoaaaansuheugaaae")) {
            if (xemPhanTuRanh(img)) return img;
            if (xemPhanTuRanh(el)) return el;
          }
        }
      }

      // 2. Fallback tìm trực tiếp ảnh thuyền trong document
      const cacAnhThuyen = doc.querySelectorAll('img[src*="ivborw0kggoaaaansuheugaaae"]');
      for (const img of cacAnhThuyen) {
        if (xemPhanTuRanh(img)) return img;
      }
    }
    return null;
  }

  let thoiGianCheckinCuoi = 0;
  let thoiGianMuaCongCuCuoi = 0;

  // Tìm chính xác nút bấm trong popup thuyền ("Replenish stock" hoặc "Claim" / "Restock")
  function timNutThuyenCheckin() {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacNut = doc.querySelectorAll("button, [role='button']");
      for (const btn of cacNut) {
        if (!xemPhanTuRanh(btn) || btn.disabled) continue;
        const txt = (btn.textContent || "").trim().toLowerCase();
        if (txt.length < 35 && (txt.includes("replenish stock") || txt.includes("claim") || txt.includes("restock"))) {
          return btn;
        }
      }
    }
    return null;
  }

  // ĐÓNG DỨT KHOÁT POPUP ĐANG MỞ (Bấm nút Close + Escape, không lặp lại)
  async function dongHetTatCaPopup() {
    console.log("[SFL Checkin] ❌ Bấm nút đóng modal / popup...");
    const taiLieu = layTaiLieuGame();

    // 1. Tìm và click nút ảnh Close / Cancel
    let daClick = false;
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacImgClose = doc.querySelectorAll('img[src*="close"], img[src*="cancel"], button[aria-label="close"]');
      for (const imgClose of cacImgClose) {
        if (!xemPhanTuRanh(imgClose)) continue;
        const nut = imgClose.closest("button, [role='button'], div[class*='cursor-pointer']") || imgClose;
        clickTam(nut);
        daClick = true;
        await ngu(300);
        break;
      }
      if (daClick) break;
    }

    // 2. Nếu không có nút ảnh close, tìm nút văn bản Close / Cancel / Đóng
    if (!daClick) {
      for (const doc of taiLieu) {
        if (!doc || !doc.body) continue;
        const cacNut = doc.querySelectorAll("button, [role='button']");
        for (const btn of cacNut) {
          if (!xemPhanTuRanh(btn) || btn.disabled) continue;
          const t = (btn.textContent || "").trim().toLowerCase();
          if (t === "close" || t === "đóng" || t === "cancel" || t === "x") {
            clickTam(btn);
            daClick = true;
            await ngu(300);
            break;
          }
        }
        if (daClick) break;
      }
    }

    // 3. Luôn gửi phím Escape vào toàn bộ game để đóng triệt để mọi popup
    for (const doc of taiLieu) {
      try {
        const view = doc.defaultView || window;
        const opts = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
        view.dispatchEvent(new KeyboardEvent("keydown", opts));
        view.dispatchEvent(new KeyboardEvent("keyup", opts));
        doc.dispatchEvent(new KeyboardEvent("keydown", opts));
        doc.dispatchEvent(new KeyboardEvent("keyup", opts));
      } catch (_e) {}
    }

    // Nghỉ 600ms để game hoàn tất đóng popup
    await ngu(600);
    console.log("[SFL Checkin] ✔️ Đã đóng popup!");
  }

  // Thực hiện click vào thuyền check-in và ấn nút Replenish stock / Claim
  async function thucHienCheckinThuyen() {
    const elThuyen = timElementThuyen();
    if (!elThuyen) return false;

    console.log("[SFL Checkin] ⛵ Phát hiện thuyền check-in → mở thuyền");
    S.hanhDongCuoi = "⛵ Tap thuyền check-in";

    clickTam(elThuyen);
    await ngu(1200);

    const nutCheckin = timNutThuyenCheckin();
    if (nutCheckin) {
      const tenNut = (nutCheckin.textContent || "").trim();
      console.log(`[SFL Checkin] 📦 Đã tìm thấy nút "${tenNut}" → tiến hành bấm`);
      clickTam(nutCheckin);
      await ngu(1500);
      await dongHetTatCaPopup();
      thoiGianCheckinCuoi = Date.now();
      return true;
    } else {
      console.log("[SFL Checkin] ⚠️ Đã mở thuyền nhưng không thấy nút nhận → đóng modal");
      await dongHetTatCaPopup();
      thoiGianCheckinCuoi = Date.now();
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // MUA CÔNG CỤ TỪ WORKBENCH / BLACKSMITH (Chuẩn theo v2.14)
  // ═══════════════════════════════════════════════════════════════════

  // Tìm bàn chế tạo Workbench trên đảo
  function timWorkbench() {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      // 1. Ưu tiên cao nhất: div cursor-pointer chứa cả workbench và blacksmith
      const divs = doc.querySelectorAll("div.cursor-pointer, div[class*='cursor-pointer']");
      for (const div of divs) {
        if (!xemPhanTuRanh(div)) continue;
        const hasWb = !!div.querySelector("img[src*='workbench']");
        const hasBs = !!div.querySelector("img[src*='blacksmith']");
        if (hasWb && hasBs) return div;
      }
      // 2. Tìm theo ảnh workbench / blacksmith
      const imgs = doc.querySelectorAll("img[src*='game-assets/buildings/workbench'], img[src*='buildings/workbench'], img[src*='workbench.png'], img[src*='workbench'], img[src*='blacksmith']");
      for (const img of imgs) {
        if (!xemPhanTuRanh(img)) continue;
        const src = (img.getAttribute("src") || "").toLowerCase();
        if (src.includes("icon") || src.includes("tutorial")) continue;
        const clickable = img.closest(".cursor-pointer, [data-map-placement='true'], [class*='cursor-pointer']") || img;
        if (xemPhanTuRanh(clickable)) return clickable;
      }
    }
    return null;
  }

  // Kiểm tra bảng Blacksmith / Land Tools đã mở hay chưa
  function laBangToolsDangMo() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      const roots = doc.querySelectorAll('[data-headlessui-state="open"], [role="dialog"], div.relative, div.scrollable, div[class*="modal"]');
      for (const root of roots) {
        if (!xemPhanTuRanh(root)) continue;
        const t = (root.textContent || "").replace(/\s+/g, " ").toLowerCase();
        if ((t.includes("land tools") || t.includes("tools")) && (t.includes("craft") || t.includes("batch buy") || t.includes("in stock"))) {
          return true;
        }
      }
    }
    return false;
  }

  // Tìm nút "Batch Buy" trên toàn bộ giao diện game (cả button lẫn div cursor-pointer)
  function timNutBatchBuy() {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      // 1. Quét button, [role='button'], div.cursor-pointer
      const cacNut = doc.querySelectorAll("button, [role='button'], div.cursor-pointer, [class*='cursor-pointer'], a");
      for (const btn of cacNut) {
        if (!xemPhanTuRanh(btn) || btn.disabled) continue;
        const txt = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (txt === "batch buy" || /^batch\s*buy$/i.test(txt) || txt.includes("batch buy")) {
          return { btn, doc };
        }
      }
      // 2. Quét qua text node "Batch Buy"
      const cacText = doc.querySelectorAll("span, p, b, strong, div");
      for (const el of cacText) {
        if (!xemPhanTuRanh(el)) continue;
        const txt = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (txt === "batch buy") {
          const nutCha = el.closest("button, [role='button'], div.cursor-pointer, [class*='cursor-pointer']") || el;
          if (xemPhanTuRanh(nutCha)) return { btn: nutCha, doc };
        }
      }
    }
    return null;
  }

  // Tìm nút Batch Buy ở bảng danh sách công cụ (Bước 3/4)
  function timNutBatchBuyBangDanhSach(nutCu) {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const buttons = Array.from(doc.querySelectorAll("button, [role='button'], div.cursor-pointer, [class*='cursor-pointer']"));
      for (let i = buttons.length - 1; i >= 0; i -= 1) {
        const btn = buttons[i];
        if (!xemPhanTuRanh(btn) || btn.disabled) continue;
        if (nutCu && btn === nutCu) continue;
        const txt = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (txt === "batch buy" || txt === "confirm" || txt === "buy" || txt === "xác nhận" || txt === "purchase") {
          return { btn, doc };
        }
      }
    }
    return null;
  }

  // Tìm nút "Batch Buy" xác nhận cuối cùng trong popup "Buy the max affordable amount" (Bước 4/4)
  function timNutBatchBuyXacNhanCuoi(nutCu1, nutCu2) {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;

      // 1. Tìm chính xác qua container chứa text "Buy the max affordable amount" (chuẩn theo HTML game)
      const cacSpan = doc.querySelectorAll("span, p, div");
      for (const sp of cacSpan) {
        if (!xemPhanTuRanh(sp)) continue;
        const txt = (sp.textContent || "").toLowerCase();
        if (txt.includes("buy the max affordable amount") || txt.includes("tool types?")) {
          const modalBox = sp.closest("div.bg-\\[\\#c28569\\], div.sm\\:w-4\\/5, div.relative") || sp.parentElement?.parentElement;
          if (modalBox) {
            const buttons = modalBox.querySelectorAll("button, [role='button']");
            for (const b of buttons) {
              if (!xemPhanTuRanh(b) || b.disabled) continue;
              if ((nutCu1 && b === nutCu1) || (nutCu2 && b === nutCu2)) continue;
              const bTxt = (b.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
              if (bTxt.includes("batch buy") && !bTxt.includes("cancel")) {
                return { btn: b, doc };
              }
            }
          }
        }
      }

      // 2. Quét qua tất cả button có div con "Batch Buy" đứng cạnh nút "Cancel"
      const allButtons = doc.querySelectorAll("button, [role='button']");
      for (let i = allButtons.length - 1; i >= 0; i -= 1) {
        const btn = allButtons[i];
        if (!xemPhanTuRanh(btn) || btn.disabled) continue;
        if ((nutCu1 && btn === nutCu1) || (nutCu2 && btn === nutCu2)) continue;
        const t = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (t === "batch buy") {
          const cha = btn.parentElement;
          if (cha && (cha.textContent || "").toLowerCase().includes("cancel")) {
            return { btn, doc };
          }
        }
      }
    }
    return null;
  }

  // Kiểm tra xem ở Bước 3 bảng danh sách công cụ Total Cost có bằng 0 hay không
  function kiemTraTotalCostBangZero() {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const allNodes = doc.querySelectorAll("div, span, p");
      for (const node of allNodes) {
        if (!xemPhanTuRanh(node)) continue;
        const txt = (node.textContent || "").trim();
        if (txt === "Total Cost" || txt.toLowerCase() === "total cost") {
          const box = node.closest(".flex.flex-col") || node.parentElement;
          if (box) {
            // 1. Kiểm tra coin = 0
            const coinImg = box.querySelector('img[src*="coins.png"], img[src*="coin"]');
            if (coinImg) {
              const coinParent = coinImg.parentElement;
              const coinSpan = coinParent?.querySelector("span, div") || coinImg.nextElementSibling;
              const coinVal = coinSpan ? parseInt((coinSpan.textContent || "").trim(), 10) : NaN;
              if (coinVal === 0) {
                return true;
              }
            }
            // 2. Kiểm tra nếu nút Batch Buy trong box Total Cost bị disabled
            const btn = box.querySelector("button, [role='button']");
            if (btn) {
              const laDisabled = btn.disabled ||
                btn.classList.contains("cursor-not-allowed") ||
                btn.classList.contains("disabled") ||
                btn.getAttribute("disabled") !== null;
              if (laDisabled) {
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  // Tự động Mua công cụ tại Workbench ĐẦY ĐỦ 4 BƯỚC:
  // Bước 1: Mở Workbench
  // Bước 2: Bấm nút Batch Buy ở bảng Workbench
  // Bước 3: Bấm nút Batch Buy ở bảng danh sách công cụ (nếu Total Cost = 0 -> trực tiếp đóng popup)
  // Bước 4: Bấm nút Batch Buy ở popup xác nhận cuối (Buy the max affordable amount...)
  async function muaCongCuTuWorkbench() {
    const bench = timWorkbench();
    if (!bench) {
      console.log("[SFL Checkin] ⚠️ Không tìm thấy bàn chế tạo Workbench trên đảo");
      return false;
    }

    // ── BƯỚC 1/4: MỞ BÀN CHẾ TẠO WORKBENCH ──
    if (!laBangToolsDangMo()) {
      console.log("%c[SFL Checkin] 🛠️ [Bước 1/4] Mở bàn chế tạo Workbench...", "color: #2196f3; font-weight: bold;");
      S.hanhDongCuoi = "🛠️ Mở bàn chế tạo Workbench";
      clickTam(bench);
      await ngu(1500);
    } else {
      console.log("%c[SFL Checkin] 🛠️ [Bước 1/4] Bàn chế tạo Workbench đã mở sẵn", "color: #2196f3; font-weight: bold;");
    }

    // ── BƯỚC 2/4: BẤM NÚT BATCH BUY Ở PANEL WORKBENCH ──
    let nutBatch1 = null;
    for (let lan = 0; lan < 15; lan += 1) {
      nutBatch1 = timNutBatchBuy();
      if (nutBatch1) break;
      await ngu(250);
    }

    if (!nutBatch1) {
      console.log("[SFL Checkin] ⚠️ Không tìm thấy nút 'Batch Buy' trong panel Workbench, đóng modal...");
      await dongHetTatCaPopup();
      return false;
    }

    console.log(`%c[SFL Checkin] 🛒 [Bước 2/4] ĐÃ TÌM THẤY NÚT BATCH BUY (LẦN 1)! Click mở danh sách công cụ...`, "color: #00bcd4; font-weight: bold;");
    clickTam(nutBatch1.btn);
    await ngu(1500);

    // ── BƯỚC 3/4: BẤM NÚT BATCH BUY TRONG BẢNG DANH SÁCH CÔNG CỤ ──
    console.log("%c[SFL Checkin] 🛒 [Bước 3/4] Đang kiểm tra Total Cost và tìm nút Batch Buy trong danh sách công cụ...", "color: #00bcd4; font-weight: bold;");

    // KIỂM TRA ĐẶC BIỆT THEO YÊU CẦU: Nếu Total Cost = 0 (hoặc nút Batch Buy bị vô hiệu hóa) -> TRỰC TIẾP ĐÓNG POPUP!
    if (kiemTraTotalCostBangZero()) {
      console.log("%c[SFL Checkin] ℹ️ [Bước 3/4] Total Cost = 0 coin (kho đã đầy công cụ hoặc không cần mua thêm) → TRỰC TIẾP ĐÓNG TẤT CẢ POPUP!", "color: #ff9800; font-weight: bold; font-size: 13px;");
      await ngu(400);
      await dongHetTatCaPopup();
      thoiGianMuaCongCuCuoi = Date.now();
      return true;
    }

    let nutBatch2 = null;
    for (let lan = 0; lan < 15; lan += 1) {
      if (kiemTraTotalCostBangZero()) {
        console.log("%c[SFL Checkin] ℹ️ [Bước 3/4] Total Cost = 0 coin → TRỰC TIẾP ĐÓNG TẤT CẢ POPUP!", "color: #ff9800; font-weight: bold; font-size: 13px;");
        await ngu(400);
        await dongHetTatCaPopup();
        thoiGianMuaCongCuCuoi = Date.now();
        return true;
      }
      nutBatch2 = timNutBatchBuyBangDanhSach(nutBatch1.btn);
      if (nutBatch2) break;
      await ngu(250);
    }

    if (nutBatch2) {
      console.log(`%c[SFL Checkin] 💳 [Bước 3/4] Bấm nút "${nutBatch2.btn.textContent.trim()}" ở bảng danh sách công cụ...`, "color: #00bcd4; font-weight: bold;");
      clickTam(nutBatch2.btn);
      await ngu(1500);
    } else {
      console.log("[SFL Checkin] ℹ️ Không thấy nút bước 3 riêng biệt, chuyển sang kiểm tra bước 4...");
    }

    // ── BƯỚC 4/4: BẤM NÚT BATCH BUY Ở POPUP XÁC NHẬN CUỐI (Buy the max affordable amount...) ──
    console.log("%c[SFL Checkin] 🎯 [Bước 4/4] Đang chờ popup xác nhận cuối (Buy the max affordable amount of 2 tool types?)...", "color: #ff9800; font-weight: bold;");
    let nutXacNhanCuoi = null;
    for (let j = 0; j < 16; j += 1) {
      await ngu(250);
      nutXacNhanCuoi = timNutBatchBuyXacNhanCuoi(nutBatch1?.btn, nutBatch2?.btn);
      if (nutXacNhanCuoi) break;
    }

    if (nutXacNhanCuoi) {
      console.log(`%c[SFL Checkin] 🎯 [Bước 4/4 - BƯỚC CUỐI] ĐÃ TÌM THẤY CHUẨN XÁC NÚT "BATCH BUY" XÁC NHẬN! Tiến hành click mua...`, "color: #4caf50; font-weight: bold; font-size: 14px;");
      clickTam(nutXacNhanCuoi.btn);

      // Chờ 2.5s để game xử lý giao dịch và lưu vào tài khoản
      console.log("[SFL Checkin] ⏳ Đang chờ game lưu giao dịch mua công cụ...");
      await ngu(2500);
      // Reset cờ hết rìu, cuốc và yêu cầu quét lại kho thực tế ở chu kỳ sau
      S.__chacChanHetRiu = false;
      S.__chacChanHetCuoc = {};
      S.thoiGianQuetKhoCuoi = 0; // Buộc quét lại kho thực tế để cập nhật đúng số lượng vừa mua
      console.log("%c[SFL Checkin] ✔️ [HOÀN TẤT 4 BƯỚC] ĐÃ MUA THÀNH CÔNG TẤT CẢ CÔNG CỤ QUA BATCH BUY!", "color: #4caf50; font-weight: bold; font-size: 14px;");
    } else {
      console.log("[SFL Checkin] ⚠️ Không tìm thấy popup xác nhận cuối hoặc nút Batch Buy xác nhận");
    }

    // ── ĐÓNG SẠCH SẼ TẤT CẢ POPUP ──
    await ngu(800);
    await dongHetTatCaPopup();
    thoiGianMuaCongCuCuoi = Date.now();
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════
  // MUA HẠT GIỐNG TỪ CỬA HÀNG BETTY (Lấy từ bản v3.0.1)
  // ═══════════════════════════════════════════════════════════════════

  const BUY_BTN_ANY_RE = /\b(buy|mua|comprar|acheter|kaufen)\b/i;
  const RESTOCK_BTN_RE = /restock|replenish/i;
  const BUY_ALL_SEEDS_RE = /buy\s+all\s+seeds?/i;
  const BUY_ALL_RE = /buy\s+all/i;
  const INSUFFICIENT_FUNDS_RE = /not\s+enough|insufficient\s+funds?|không\s+đủ|khong\s+du|need\s+more\s+coins?|too\s+expensive/i;
  const BLOCKED_LABEL_RE = /\brestock|replenish|locked|lacking|yêu\s+cầu\b/i;

  // Tìm tòa nhà cửa hàng Betty trên đảo (bettys_market hoặc market.webp)
  function timCuaHangBetty() {
    const docs = layTaiLieuGame();
    for (const doc of docs) {
      if (!doc || !doc.body) continue;
      const imgs = doc.querySelectorAll("img[src], img[srcset]");
      for (const img of imgs) {
        if (!xemPhanTuRanh(img)) continue;
        const u = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
        if (u.includes("fish_market")) continue;
        const ok =
          u.includes("bettys_market") ||
          (u.includes("/buildings/") && u.includes("market.webp")) ||
          (u.includes("desert") && u.includes("market.webp")) ||
          (u.includes("volcano") && u.includes("market.webp")) ||
          u.includes("betty");
        if (!ok) continue;

        const clickable = img.closest(".cursor-pointer, [data-map-placement='true'], [class*='cursor-pointer']") || img;
        if (clickable && xemPhanTuRanh(clickable)) return clickable;
      }
    }
    return null;
  }

  // Tìm dialog cửa hàng Betty (chứa tab Buy/Sell, in stock, Buy 1, hoặc #SeasonSeeds)
  // QUAN TRỌNG: Các ô hạt giống / panel con đều là div.relative chứa chữ "in stock"/"Buy 1"
  // nên MUỐN tránh chọn nhầm phần tử con: luôn chọn ỨNG VIÊN CÓ DIỆN TÍCH LỚN NHẤT (khung modal thật).
  function laDialogBetty(dlg) {
    if (!dlg || !xemPhanTuRanh(dlg)) return false;
    const rect = dlg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const txt = (dlg.textContent || "");
    const coBuySell = txt.includes("Buy") || txt.includes("in stock");
    const coNutBuy = /buy\s+\d+/i.test(txt);
    return (coBuySell && (coNutBuy || txt.includes("in stock") || txt.includes("Seeds"))) || dlg.querySelector("#SeasonSeeds");
  }
  function timModalBetty() {
    const docs = layTaiLieuGame();
    let totNhat = null;
    for (const doc of docs) {
      if (!doc || !doc.body) continue;
      const dialogs = doc.querySelectorAll('[role="dialog"], div.relative, div[style*="border-image"]');
      for (const dlg of dialogs) {
        if (!laDialogBetty(dlg)) continue;
        const r = dlg.getBoundingClientRect();
        const vpW = doc.defaultView?.innerWidth || 0;
        const vpH = doc.defaultView?.innerHeight || 0;
        const laFullScreen = vpW > 0 && vpH > 0 && r.width >= vpW * 0.95 && r.height >= vpH * 0.95;
        const area = r.width * r.height;
        // Ưu tiên: KHÔNG phải wrapper fullscreen, và có diện tích lớn nhất
        if (totNhat === null) {
          totNhat = { dlg, doc, area, laFullScreen };
          continue;
        }
        if (laFullScreen && !totNhat.laFullScreen) continue;
        if (!laFullScreen && totNhat.laFullScreen) { totNhat = { dlg, doc, area, laFullScreen }; continue; }
        if (area > totNhat.area) totNhat = { dlg, doc, area, laFullScreen };
      }
    }
    if (!totNhat) return null;
    return { dlg: totNhat.dlg, doc: totNhat.doc };
  }

  // Chỉ chuyển về tab Buy nếu modal đang thật sự hiển thị giao diện Sell
  async function damBaoTabBuy(dlg) {
    if (!dlg) return false;
    const txtModal = (dlg.textContent || "").toLowerCase();
    // Nhận diện RỘNG hơn: có hành động SELL (Sell 1/10/All/Max) HOẶC "không có nông sản",
    // và KHÔNG có nội dung BUY ("buy N" hoặc "in stock") -> chắc chắn đang ở tab Sell
    const coSellContent = /sell\s+\d+|sell\s+all|sell\s+max|you\s+have\s+no\s+crops|\bno\s+crops\b|\bno\s+harvest\b/i.test(txtModal);
    const coBuyContent = /buy\s+\d+|buy\s+max|in\s+stock/i.test(txtModal);
    const dangBiOShopSell = coSellContent || (!coBuyContent && txtModal.includes("sell"));
    if (!dangBiOShopSell) {
      return true; // Đang ở tab Buy bình thường -> TUYỆT ĐỐI KHÔNG CLICK VÀO BẤT KỲ TAB NÀO!
    }

    console.log("[SFL Checkin-Betty] ⚠️ Modal đang bị ở tab Sell → Bấm chuyển về tab Buy...");
    const rectModal = dlg.getBoundingClientRect();
    const cacTab = Array.from(dlg.querySelectorAll("div, button, [role='tab']"));
    for (const t of cacTab) {
      if (!xemPhanTuRanh(t)) continue;
      const tTxt = (t.textContent || "").trim().toLowerCase();
      if (tTxt === "buy") {
        const rectT = t.getBoundingClientRect();
        if (rectT.top < rectModal.top + 70) {
          const nutClick = t.closest(".cursor-pointer, button, [role='tab']") || t;
          clickTam(nutClick);
          await ngu(900);
          return true;
        }
      }
    }
    return true;
  }

  // Trích xuất số lượng mua từ nút (Buy 160 -> 160, Buy Max -> 999999)
  function laySoLuongNutMua(btn) {
    if (!btn) return 0;
    const text = String(btn.textContent || "").trim();
    if (BUY_ALL_SEEDS_RE.test(text)) return -1;
    if (/max|tối\s*đa/i.test(text)) return 999999;
    const match = text.match(/buy\s+(\d+)/i) || text.match(/mua\s+(\d+)/i) || text.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
    return 1;
  }

  // Kiểm tra xem nút có thực sự khả dụng không (không bị disabled, không cursor-not-allowed)
  function laNutMuaKhaDung(btn) {
    if (!btn || !xemPhanTuRanh(btn)) return false;
    if (btn.disabled || btn.getAttribute("disabled") !== null) return false;
    const tokens = String(btn.className || "").split(/\s+/).filter(Boolean);
    // QUAN TRỌNG: Game dùng class TAILWIND VARIANT "disabled:opacity-50" trên MỌI nút (kể cả nút
    // đang bấm được!) -> KHÔNG được check chuỗi con; chỉ check TOKEN CHÍNH XÁC.
    if (tokens.includes("cursor-not-allowed")) return false;
    if (tokens.includes("disabled")) return false;
    if (btn.getAttribute("aria-disabled") === "true") return false;
    return true;
  }

  // Kiểm tra xem người chơi có bị hết sạch tiền xu không (khi cả nút "Buy 1" cũng bị disabled / cursor-not-allowed)
  function kiemTraHetTien(dlg) {
    if (!dlg) return false;
    const rectModal = dlg.getBoundingClientRect();
    const midX = rectModal.left + rectModal.width * 0.45;
    const buttons = Array.from(dlg.querySelectorAll("button, [role='button'], div.cursor-pointer"));
    for (const btn of buttons) {
      const rectB = btn.getBoundingClientRect();
      if (rectB.left < midX) continue;
      const tx = (btn.textContent || "").trim();
      if (tx === "Buy 1" || tx.toLowerCase() === "buy 1") {
        if (!laNutMuaKhaDung(btn)) return true; // Cả Buy 1 cũng bị khóa -> ĐÃ HẾT TIỀN!
      }
    }
    return false;
  }

  // Xử lý popup xác nhận mua số lượng lớn (Ví dụ: "Are you sure you want to spend 5 Coins to buy 500 Sunflower Seeds?")
  async function xuLyPopupXacNhanMua() {
    // Chờ tối đa 800ms xem popup xác nhận có xuất hiện không
    for (let w = 0; w < 4; w += 1) {
      await ngu(200);
      for (const doc of layTaiLieuGame()) {
        const dialogs = Array.from(doc.querySelectorAll('[role="dialog"], div.relative, div[class*="bg-[#c28569]"], .sm\\:w-4\\/5'));
        for (const dlg of dialogs) {
          if (!xemPhanTuRanh(dlg)) continue;
          const txt = (dlg.textContent || "");
          if (txt.includes("Are you sure you want to spend") && (txt.includes("to buy") || txt.includes("Coins"))) {
            const buttons = Array.from(dlg.querySelectorAll("button, [role='button']"));
            for (const b of buttons) {
              if (!xemPhanTuRanh(b) || b.disabled) continue;
              const bTxt = (b.textContent || "").trim();
              if (/cancel|hủy/i.test(bTxt)) continue;
              if (/^buy\b/i.test(bTxt) || /mua/i.test(bTxt) || /confirm/i.test(bTxt)) {
                console.log(`%c[SFL Checkin-Betty] 🌟 Phát hiện popup xác nhận mua! Bấm nút: "${bTxt}"`, "color: #4caf50; font-weight: bold;");
                clickTam(b);
                await ngu(800);
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  // Lấy nút mua có số lượng lớn nhất trong panel chi tiết bên phải (Buy 500 > Buy 10 > Buy 1)
  function timNutMuaLonNhat(dlg) {
    if (!dlg) return null;
    const rectModal = dlg.getBoundingClientRect();
    const midX = rectModal.left + rectModal.width * 0.45;

    const buttons = Array.from(dlg.querySelectorAll("button, [role='button'], div.cursor-pointer, [class*='cursor-pointer']"));
    const hopLe = [];

    for (const btn of buttons) {
      if (!laNutMuaKhaDung(btn)) continue;

      // Nút mua BẮT BUỘC nằm ở panel chi tiết bên phải
      const rectB = btn.getBoundingClientRect();
      if (rectB.left < midX) continue;

      const tx = String(btn.textContent || "").replace(/\s+/g, " ").trim();
      if (!tx || tx.length > 25) continue;
      if (/restock|replenish/i.test(tx)) continue;
      if (/buy\s+all/i.test(tx)) continue;

      if (/^buy\s+\d+/i.test(tx) || /buy\s+max/i.test(tx) || tx === "Buy" || /^buy\b/i.test(tx)) {
        hopLe.push(btn);
      }
    }

    if (hopLe.length === 0) return null;
    hopLe.sort((a, b) => laySoLuongNutMua(b) - laySoLuongNutMua(a));
    return hopLe[0];
  }

  // Tự động Mua hạt giống từ cửa hàng Betty (Bấm từng ô hạt giống bên trái, bấm nút mua bên phải)
  async function muaHatGiongTuBetty() {
    console.log("%c[SFL Checkin] 🌻 [BƯỚC 3] Bắt đầu luồng mua hạt giống tại cửa hàng Betty...", "color: #ff9800; font-weight: bold;");
    S.hanhDongCuoi = "🌻 Mua hạt giống Betty";

    try {
    // Kiểm tra xem cửa hàng Betty đã mở sẵn trên màn hình chưa
    let modalInfo = timModalBetty();
    if (!modalInfo) {
      const shop = timCuaHangBetty();
      if (!shop) {
        console.log("[SFL Checkin-Betty] ⚠️ Không tìm thấy cửa hàng Betty trên đảo");
        return false;
      }
      console.log("[SFL Checkin-Betty] 🏪 Bấm click mở cửa hàng hạt giống Betty...");
      clickTam(shop);
      for (let i = 0; i < 12; i += 1) {
        await ngu(300);
        modalInfo = timModalBetty();
        if (modalInfo) break;
      }
    } else {
      console.log("[SFL Checkin-Betty] 🏪 Cửa hàng Betty đã mở sẵn trên màn hình!");
    }

    if (!modalInfo) {
      console.log("[SFL Checkin-Betty] ⚠️ Mở cửa hàng Betty thất bại, bỏ qua luồng hạt giống");
      await dongHetTatCaPopup();
      return false;
    }

    const { dlg } = modalInfo;
    const rDlg = dlg.getBoundingClientRect();
    console.log("[SFL Checkin-Betty] 🟪 Modal Betty nhận diện:", dlg.tagName, "w=" + Math.round(rDlg.width), "h=" + Math.round(rDlg.height), "cls=" + (dlg.className || "").toString().slice(0, 60));
    await damBaoTabBuy(dlg);
    await ngu(400);

    // Hàm đọc số lượng tồn kho của loại hạt đang chọn (ví dụ "500 in stock" -> 500)
    function laySoLuongTonKho(d) {
      if (!d) return null;
      const txt = (d.textContent || "");
      const m = txt.match(/(\d+)\s+in\s+stock/i);
      if (m) return parseInt(m[1], 10);
      return null;
    }

    // 2. Mua từng ô hạt giống cho tài khoản NON-VIP:
    // Đúng theo yêu cầu người dùng: Đợi mua xong hẳn loại hạt này rồi mới chuyển sang loại hạt khác, không lướt vội vàng!
    let soLoaiDaMua = 0;
    const daXuLySet = new Set();

    for (let round = 0; round < 25; round += 1) {
      const modalHienTai = timModalBetty();
      if (!modalHienTai) break;

      const dlgNow = modalHienTai.dlg;
      if (INSUFFICIENT_FUNDS_RE.test(String(dlgNow.textContent || ""))) {
        console.log("[SFL Checkin-Betty] 💰 Không đủ xu để mua tiếp hạt giống — dừng phiên mua.");
        break;
      }

      // 1. Luôn đảm bảo đang ở tab BUY trước mỗi lượt mua
      await damBaoTabBuy(dlgNow);

      // 2. Phân tách hình học: Lấy các ô hạt giống ở nửa bên trái của modal
      const rectModal = dlgNow.getBoundingClientRect();
      const midX = rectModal.left + rectModal.width * 0.52;
      const tabYBoundary = rectModal.top + 65; // Khu vực tab (Buy, Sell, Guide) luôn ở < 65px từ đỉnh modal

      // ƯU TIÊN 1 TUYỆT ĐỐI: Chỉ lấy các ô hạt giống có class chuẩn .bg-brown-600
      let tatCaSlots = Array.from(dlgNow.querySelectorAll(".bg-brown-600"));
      if (tatCaSlots.length === 0) {
        // Fallback trong trường hợp đặc biệt nhưng loại trừ hoàn toàn khu vực tab
        tatCaSlots = Array.from(dlgNow.querySelectorAll("div.cursor-pointer, [class*='cursor-pointer']"));
      }

      const slotsKhaDung = [];

      for (const s of tatCaSlots) {
        if (!xemPhanTuRanh(s) || daXuLySet.has(s) || s.dataset.sflSkip === "1" || (s.className || "").includes("cursor-not-allowed")) continue;

        const rectS = s.getBoundingClientRect();

        // 🚨 TUYỆT ĐỐI CHỐNG CLICK VÀO CÁC TAB ĐIỀU HƯỚNG TRÊN CÙNG (Buy, Sell, Guide)
        if (rectS.top < tabYBoundary) continue;

        // Tọa độ phải nằm ở nửa bên trái modal
        if (rectS.left + rectS.width / 2 > midX) continue;

        const txt = (s.textContent || "").trim().toLowerCase();

        // 🚨 BỎ QUA 100% NẾU CÓ CHỮ SELL, GUIDE, BUY HOẶC NẰM TRONG THANH ĐIỀU HƯỚNG
        if (txt === "sell" || txt === "buy" || txt === "guide" || txt.startsWith("sell") || txt.startsWith("guide") || BUY_ALL_SEEDS_RE.test(txt)) {
          continue;
        }
        if (s.closest("nav") || s.closest("[role='tablist']") || s.closest(".flex.overflow-x-auto")) {
          continue;
        }

        // Phải chứa ảnh (icon hạt giống/cây trồng)
        const img = s.querySelector("img");
        if (!img || !xemPhanTuRanh(img)) continue;

        // Bỏ qua nếu bị khóa (lock)
        if (s.querySelector(".bg-overlay-white") || s.querySelector('img[src*="lock"]')) continue;
        if (BLOCKED_LABEL_RE.test(txt)) continue;

        slotsKhaDung.push(s);
      }

      if (slotsKhaDung.length === 0) {
        console.log("[SFL Checkin-Betty] ℹ️ Đã duyệt hết tất cả các loại hạt giống có sẵn trong cửa hàng.");
        break;
      }

      console.log(`[SFL Checkin-Betty] 🔎 Tìm thấy ${slotsKhaDung.length} slot hạt giống khả dụng (round ${round + 1}).`);

      // ── BƯỚC A: CHỌN Ô HẠT GIỐNG BÊN TRÁI ──
      const slot = slotsKhaDung[0];
      daXuLySet.add(slot);
      console.log(`%c[SFL Checkin-Betty] 🖱️ [Hạt #${round + 1}] Bấm chọn hạt giống ở bảng bên trái...`, "color: #2196f3; font-weight: bold;");
      clickTam(slot);

      // Chờ panel bên phải cập nhật và nút Buy xuất hiện (chờ tối đa 2.5s)
      let nutMuaBanDau = null;
      for (let w = 0; w < 10; w += 1) {
        await ngu(250);
        const modalSub = timModalBetty();
        if (!modalSub) break;
        nutMuaBanDau = timNutMuaLonNhat(modalSub.dlg);
        if (nutMuaBanDau) break;
      }

      // Kiểm tra nếu người chơi đã hết sạch tiền xu (cả nút Buy 1 cũng bị khóa / cursor-not-allowed)
      const modalCheck = timModalBetty();
      if (modalCheck && kiemTraHetTien(modalCheck.dlg)) {
        console.log("%c[SFL Checkin-Betty] 💰 Không đủ tiền xu để mua thêm bất kỳ hạt giống nào (Buy 1 bị khóa) → Kết thúc phiên mua!", "color: #ff9800; font-weight: bold;");
        break;
      }

      // Kiểm tra nếu loại hạt này đã hết hàng (Sold out)
      if (modalCheck && (modalCheck.dlg.textContent || "").includes("Sold out")) {
        console.log(`[SFL Checkin-Betty] ℹ️ [Hạt #${round + 1}] Loại hạt này đã hết hàng (Sold out) → Chuyển sang hạt tiếp theo.`);
        try { slot.dataset.sflSkip = "1"; } catch (_e) {}
        continue;
      }

      if (!nutMuaBanDau) {
        console.log(`[SFL Checkin-Betty] ℹ️ [Hạt #${round + 1}] Không tìm thấy nút mua khả dụng (hết hàng hoặc không đủ tiền) → Chuyển sang hạt tiếp theo.`);
        try { slot.dataset.sflSkip = "1"; } catch (_e) {}
        continue;
      }

      // ── BƯỚC B: MUA HẠT LIÊN TỤC CHO ĐẾN KHI HẾT NÚT MUA ──
      let daMuaDuocLoaiNay = false;
      let soLanMuaSlot = 0;

      while (soLanMuaSlot < 50) {
        const modalSub = timModalBetty();
        if (!modalSub) break;

        // Nếu cả Buy 1 cũng bị khóa -> ĐÃ HẾT SẠCH TIỀN
        if (kiemTraHetTien(modalSub.dlg)) {
          console.log("[SFL Checkin-Betty] 💰 Không đủ xu để mua thêm loại hạt này — chuyển tiếp.");
          break;
        }

        // Nếu modal báo không đủ tiền -> dừng phiên mua ngay
        if (INSUFFICIENT_FUNDS_RE.test(String(modalSub.dlg.textContent || ""))) {
          console.log("[SFL Checkin-Betty] 💰 Modal báo không đủ tiền — dừng phiên mua.");
          break;
        }

        const nutMua = timNutMuaLonNhat(modalSub.dlg);
        if (!nutMua) {
          // Không còn nút mua nào bấm được nữa (đã mua hết tồn kho hoặc hết tiền)
          break;
        }

        const nhanNut = (nutMua.textContent || "").trim();
        const soLuong = laySoLuongNutMua(nutMua);
        soLanMuaSlot += 1;
        console.log(`%c[SFL Checkin-Betty] 🛒 [Lượt ${soLanMuaSlot}] Bấm mua: "${nhanNut}"...`, "color: #ff9800; font-weight: bold;");
        clickTam(nutMua);
        daMuaDuocLoaiNay = true;

        // NẾU MUA SỐ LƯỢNG LỚN (> 10 như Buy 500, Buy 400, Buy 100...) THÌ TỰ ĐỘNG BẤM XÁC NHẬN POPUP
        if (soLuong > 10) {
          console.log("[SFL Checkin-Betty] 🔍 Kiểm tra popup xác nhận mua số lượng lớn...");
          await xuLyPopupXacNhanMua();
        }

        // Chờ giao dịch hoàn tất và server cập nhật (1.6s - 2.0s)
        console.log("[SFL Checkin-Betty] ⏳ Đang chờ giao dịch lưu và hoàn tất...");
        await ngu(1600 + Math.floor(Math.random() * 400));
      }

      if (daMuaDuocLoaiNay) {
        soLoaiDaMua += 1;
        console.log(`%c[SFL Checkin-Betty] ✔️ ĐÃ MUA XONG HOÀN TẤT LOẠI HẠT THỨ #${soLoaiDaMua}!`, "color: #4caf50; font-weight: bold;");
      }

      try {
        slot.dataset.sflSkip = "1";
      } catch (_e) {}

      // Nghỉ an toàn 700ms trước khi chọn sang ô hạt giống tiếp theo
      await ngu(700);
    }

    console.log(`%c[SFL Checkin-Betty] ✔️ [HOÀN TẤT] Đã quét và mua xong ${soLoaiDaMua} loại hạt giống tại Betty!`, "color: #4caf50; font-weight: bold;");
    S.thoiGianQuetKhoCuoi = 0; // Buộc quét lại kho đồ để cập nhật hạt giống vừa mua
    await ngu(800);
    await dongHetTatCaPopup();
    return true;
    } catch (err) {
      console.error("[SFL Checkin-Betty] 🚨 LỖI trong muaHatGiongTuBetty:", err, err?.stack || "");
      S.hanhDongCuoi = "❌ Mua hạt giống LỖI";
      try { await dongHetTatCaPopup(); } catch (_e) {}
      return false;
    }
  }

  let daChayCheckinSession = false;

  // Hàm nhịp điều phối
  async function tickCheckin() {
    // 0. Nếu đã chạy 1 lần trong phiên này rồi thì bỏ qua hoàn toàn
    if (daChayCheckinSession) {
      return false;
    }

    // 1. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return false;

    // 2. Captcha đang mở? -> nhường luồng
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
      S.__captchaInterrupted = true;
      return false;
    }

    // 2.5. Goblin Swarm đang xuất hiện? -> nhường luồng
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) {
      return false;
    }

    // 3. Đang bận?
    if (dangBan) return false;

    // 4. Xin khóa toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("checkin")) {
      return false;
    }

    dangBan = true;
    try {
      // ── BƯỚC 1: Check-in thuyền (nếu có thuyền) ──
      await thucHienCheckinThuyen();

      // Đóng popup thuyền và nghỉ 1s
      await dongHetTatCaPopup();
      await ngu(1000);

      // ── BƯỚC 2: Tự động mua công cụ tại Workbench (4 bước) ──
      await muaCongCuTuWorkbench();

      // Đóng dứt khoát popup Workbench và chờ 1.5s để đóng hẳn trước khi mở cửa hàng Betty
      await dongHetTatCaPopup();
      await ngu(1500);

      // ── BƯỚC 3: Tự động mua hạt giống tại cửa hàng Betty ──
      await muaHatGiongTuBetty();

      // Đóng dứt khoát popup Betty sau khi mua xong
      await dongHetTatCaPopup();
      await ngu(1000);

      // Đánh dấu đã chạy 1 lần trong phiên này
      daChayCheckinSession = true;
      console.log("%c[SFL Checkin] 🏁 Luồng Check-in & Mua công cụ & Mua hạt giống đã hoàn tất!", "color: #4caf50; font-weight: bold; font-size: 13px;");
    } catch (err) {
      console.error("[SFL Checkin] Lỗi luồng check-in và mua công cụ/hạt giống:", err);
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickCheckin = tickCheckin;
  S.daChayCheckinSession = () => daChayCheckinSession;
  S.muaHatGiongTuBetty = muaHatGiongTuBetty;

})(window.SFL = window.SFL || {});

