// ═══════════════════════════════════════════════════════════════════
// LUỒNG 7 — ĐÀO ĐÁ QUẶNG (mining.js)
// Tự động khai thác các mỏ khoáng sản (Đá, Sắt, Vàng, Crimstone, Dầu, Muối)
// Đúng theo sơ đồ doc/sodoluong-dao-khoang-san.drawio
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

  // Lấy tên dụng cụ tương ứng với loại quặng
  function layTenCuocChoQuang(loai) {
    if (loai === "Da") return "pickaxe";
    if (loai === "Sat") return "stone_pickaxe";
    if (loai === "Vang") return "iron_pickaxe";
    if (loai === "Crimstone") return "gold_pickaxe";
    if (loai === "Sunstone") return "gold_pickaxe";
    if (loai === "Muoi") return "salt_rake";
    if (loai === "Dau") return "oil_drill";
    return null;
  }

  // Lấy số lượng cuốc / dụng cụ hiện có cho loại quặng (trả về 0 nếu không có hoặc hết)
  function laySoLuongCuocChoQuang(loai) {
    // 0. Nếu cờ xác nhận hết cuốc đã được bật cho loại này
    if (S.__chacChanHetCuoc && S.__chacChanHetCuoc[loai] === true) {
      return 0;
    }

    const tenCuoc = layTenCuocChoQuang(loai);
    if (!tenCuoc) return 0;

    // 1. Kiểm tra trên HUD / thanh công cụ ngoài màn hình (chỉ xét toolbar, bỏ qua modal)
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacImgTool = doc.querySelectorAll(`img[src*="/tools/${tenCuoc}"], img[src*="${tenCuoc}.png"]`);
      for (const img of cacImgTool) {
        if (!xemPhanTuRanh(img)) continue;
        if (img.closest('.scrollable, [role="dialog"], [role="modal"], [class*="modal"]')) continue;
        const slot = img.closest("div, button, [role='button']") || img.parentElement;
        const nhanSo = slot?.querySelector('div[class*="z-10"], span, div.text-xxs, [class*="text-"], div');
        if (nhanSo) {
          const text = (nhanSo.textContent || "").trim().toLowerCase();
          let num = parseFloat(text);
          if (text.includes("k")) num = num * 1000;
          if (!isNaN(num)) return num;
        }
      }
    }

    // 2. Tìm trong kho đồ S.khoDo
    if (S.khoDo && typeof S.khoDo === "object") {
      const kho = S.khoDo;
      let count = 0;
      if (loai === "Da") count = Number(kho.pickaxe || kho.wood_pickaxe || 0);
      else if (loai === "Sat") count = Number(kho.stone_pickaxe || 0);
      else if (loai === "Vang") count = Number(kho.iron_pickaxe || 0);
      else if (loai === "Crimstone") count = Number(kho.gold_pickaxe || 0);
      else if (loai === "Sunstone") count = Number(kho.gold_pickaxe || kho.diamond_pickaxe || 0);
      else if (loai === "Muoi") count = Number(kho.salt_rake || kho.rake || 0);
      else if (loai === "Dau") count = Number(kho.oil_drill || kho.drill || 0);
      else count = Number(kho[tenCuoc] || 0);

      return isNaN(count) ? 0 : Math.max(0, count);
    }

    // Mặc định nếu chưa quét được kho đồ hoặc không có công cụ -> trả về 0 để TUYỆT ĐỐI KHÔNG CLICK BỪA
    return 0;
  }

  // Kiểm tra loại quặng này có được bật trong cài đặt không
  function quangDuocPhepDao(loai) {
    const ch = S.cauHinh || {};
    if (loai === "Da") return ch.mineTargetStone !== undefined ? !!ch.mineTargetStone : (ch.mine_stone !== undefined ? !!ch.mine_stone : true);
    if (loai === "Sat") return ch.mineTargetIron !== undefined ? !!ch.mineTargetIron : (ch.mine_iron !== undefined ? !!ch.mine_iron : true);
    if (loai === "Vang") return ch.mineTargetGold !== undefined ? !!ch.mineTargetGold : (ch.mine_gold !== undefined ? !!ch.mine_gold : true);
    if (loai === "Crimstone") return ch.mineTargetCrimstone !== undefined ? !!ch.mineTargetCrimstone : (ch.mine_crimstone !== undefined ? !!ch.mine_crimstone : true);
    if (loai === "Sunstone") return ch.mineTargetSunstone !== undefined ? !!ch.mineTargetSunstone : (ch.mine_sunstone !== undefined ? !!ch.mine_sunstone : false);
    if (loai === "Dau") return ch.mine_oil !== undefined ? !!ch.mine_oil : true;
    return true;
  }

  // Kiểm tra popup báo thiếu dụng cụ đào
  function kiemTraThieuCuoc(doc) {
    if (!doc) return false;
    const cacNhan = doc.querySelectorAll("span, p, div, h2, h3, button");
    for (const el of cacNhan) {
      if (!xemPhanTuRanh(el)) continue;
      const txt = (el.textContent || "").trim().toLowerCase();
      if (
        (txt.includes("pickaxe") || txt.includes("cuốc")) &&
        (txt.includes("craft") || txt.includes("need") || txt.includes("cần") || txt.includes("thiếu") || txt.includes("không đủ"))
      ) {
        return true;
      }
      if (
        (txt.includes("drill") || txt.includes("rake") || txt.includes("khoan")) &&
        (txt.includes("craft") || txt.includes("need") || txt.includes("cần") || txt.includes("thiếu") || txt.includes("không đủ"))
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
      const nutDong = doc.querySelector('img[src*="close"], button[aria-label*="close" i], img[alt*="close" i]');
      if (nutDong && xemPhanTuRanh(nutDong)) {
        clickTam(nutDong);
        await ngu(400);
        return true;
      }
    }
    return false;
  }

  // Tìm nút đào xác nhận (nếu có popup Mine)
  function timNutMineXacNhan(doc) {
    if (!doc) return null;
    const cacNut = doc.querySelectorAll("button, [role='button'], div[class*='cursor-pointer']");
    for (const btn of cacNut) {
      if (!xemPhanTuRanh(btn)) continue;
      const txt = (btn.textContent || "").trim().toLowerCase();
      if ((txt === "mine" || txt.includes("đào") || txt.includes("khai thác")) && txt.length < 20) {
        return btn;
      }
    }
    return null;
  }

  // Kiểm tra một mỏ quặng có đang trong thời gian hồi phục (cooldown / disable) hay không
  // Dựa trên DOM chuẩn từ game do người dùng cung cấp:
  // - Cục đang hồi: có thẻ div .opacity-50 bọc ngoài ảnh (<div class="opacity-50"><img ...>),
  //   có text đếm giờ (2hrs 59mins, 1hr 9mins...), hoặc có pointer-events-none và KHÔNG CÓ cursor-pointer / hover:img-highlight.
  // - Cục sẵn sàng: có .cursor-pointer, có .hover:img-highlight, TUYỆT ĐỐI KHÔNG CÓ .opacity-50.
  function laQuangDangHoiPhuc(el, cacSrc, noiDung) {
    if (!el) return true;

    // 1. Kiểm tra class opacity-50 hoặc opacity-40 trên bất kỳ thẻ nào (thẻ div bọc ảnh hoặc chính thẻ img)
    const coMoMo = !!el.querySelector(".opacity-50, [class*='opacity-50'], .opacity-40, [class*='opacity-40']") ||
      (el.className && typeof el.className === "string" && el.className.includes("opacity-50"));
    if (coMoMo) return true;

    // 2. Kiểm tra text đếm ngược thời gian hồi (kể cả trong tooltip ẩn opacity-0: 2hrs 59mins, 1hr 9mins, 45secs, 02:15,...)
    const coDemGio = /\d+\s*(?:hrs?|mins?|secs?|hours?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung);
    if (coDemGio) return true;

    // 3. Nếu không có bất kỳ nút/div nào có cursor-pointer hoặc hover:img-highlight -> mỏ đang bị disable (hồi phục)
    const coNutClick = !!el.querySelector(".cursor-pointer, [class*='cursor-pointer'], [class*='hover:img-highlight']") ||
      (el.classList && (el.classList.contains("cursor-pointer") || el.classList.contains("hover:img-highlight")));
    if (!coNutClick) return true;

    // 4. Đường dẫn ảnh chứa từ khóa cooldown / recovering / depleted
    const laSrcHoi = cacSrc.some((s) =>
      s.includes("cooldown") || s.includes("recovering") || s.includes("depleted") || s.includes("empty_rock")
    );
    if (laSrcHoi) return true;

    return false;
  }

  // Tìm danh sách các mỏ quặng có thể khai thác trên bản đồ
  function timDanhSachQuangSanSang() {
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

        // Kiểm tra loại quặng
        let loai = null;
        if (cacSrc.some((s) => s.includes("crimstone") || s.includes("uklgriabaabxrujqvla4tbqba"))) loai = "Crimstone";
        else if (cacSrc.some((s) => s.includes("sunstone"))) loai = "Sunstone";
        else if (cacSrc.some((s) => s.includes("gold_small") || s.includes("gold_rock") || s.includes("l2_gold") || s.includes("gold.png") || s.includes("/gold/"))) loai = "Vang";
        else if (cacSrc.some((s) => s.includes("iron_small") || s.includes("iron_rock") || s.includes("l2_iron") || s.includes("iron.png") || s.includes("/iron/"))) loai = "Sat";
        else if (cacSrc.some((s) => s.includes("stone_small") || s.includes("stone_rock") || s.includes("l2_stone") || s.includes("stone.png") || s.includes("rock.png") || s.includes("/stone/"))) loai = "Da";
        else if (cacSrc.some((s) => s.includes("uklgrqiaaabxrujqvla4tjy") || s.includes("/resources/oil/") || s.includes("oil_reserve")) || cacAnh.some((img) => (img.getAttribute("alt") || "").toLowerCase().includes("oil reserve"))) loai = "Dau";
        else if (cacSrc.some((s) => s.includes("salt") || s.includes("salt_rock"))) loai = "Muoi";

        if (!loai) continue;

        // 1. Kiểm tra loại quặng có được bật trong cấu hình không
        if (!quangDuocPhepDao(loai)) continue;

        // 2. KIỂM TRA CÔNG CỤ: Nếu không có cuốc cho loại này (<= 0) -> BỎ QUA NGAY!
        const soCuoc = laySoLuongCuocChoQuang(loai);
        if (soCuoc <= 0) {
          continue;
        }

        // 3. Với mỏ dầu: phải có alt="Full oil reserve" và không bị mờ opacity-50
        if (loai === "Dau") {
          const coAltFull = cacAnh.some((img) => (img.getAttribute("alt") || "").toLowerCase().includes("full oil reserve"));
          const coMoMo = !!el.querySelector(".opacity-50, [class*='opacity-50'], .opacity-40") ||
            (el.className && typeof el.className === "string" && el.className.includes("opacity-50"));
          if (coMoMo || !coAltFull) {
            continue;
          }
        }

        // 4. KIỂM TRA MỎ ĐANG HỒI PHỤC (COOLDOWN) -> BỎ QUA TUYỆT ĐỐI!
        if (laQuangDangHoiPhuc(el, cacSrc, noiDung)) {
          continue;
        }

        // 5. Bắt buộc phải tìm thấy element có cursor-pointer hoặc hover:img-highlight
        const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer'], [class*='hover:img-highlight']") ||
          (el.classList?.contains("cursor-pointer") ? el : null);
        if (!nutClick) continue;

        if (!daThem.has(el)) {
          daThem.add(el);
          const coords = phanTichToaDo(el.getAttribute("style") || "");
          danhSach.push({ el: nutClick, rootEl: el, coords, loai });
        }
      }
    }

    return danhSach;
  }

  // Thứ tự ưu tiên khai thác theo từng loại quặng (đào hết loại này mới chuyển sang loại khác)
  const DANH_SACH_LOAI_QUANG = [
    { loai: "Da", ten: "Đá thường", tenCuoc: "pickaxe" },
    { loai: "Sat", ten: "Quặng Sắt", tenCuoc: "stone_pickaxe" },
    { loai: "Vang", ten: "Quặng Vàng", tenCuoc: "iron_pickaxe" },
    { loai: "Crimstone", ten: "Quặng Crimstone", tenCuoc: "gold_pickaxe" },
    { loai: "Sunstone", ten: "Quặng Sunstone", tenCuoc: "gold_pickaxe" },
    { loai: "Muoi", ten: "Mỏ Muối", tenCuoc: "salt_rake" },
    { loai: "Dau", ten: "Mỏ Dầu", tenCuoc: "oil_drill" }
  ];

  // Thực hiện đào quặng theo từng loại riêng biệt: đào hết loại này mới chuyển sang loại khác
  async function thucHienDaoQuang() {
    const tatCaQuangSanSang = timDanhSachQuangSanSang();
    if (tatCaQuangSanSang.length === 0) {
      console.log("[SFL Đào Quặng] ⛏️ Không còn mỏ quặng nào sẵn sàng khai thác (hoặc chưa có công cụ tương ứng).");
      return false;
    }

    // Nhóm các mỏ quặng theo từng loại riêng biệt
    const nhomQuangTheoLoai = {};
    for (const q of tatCaQuangSanSang) {
      if (!nhomQuangTheoLoai[q.loai]) nhomQuangTheoLoai[q.loai] = [];
      nhomQuangTheoLoai[q.loai].push(q);
    }

    let daDaoTongCong = 0;

    // Duyệt lần lượt từng loại quặng: ĐÀO HẾT SẠCH LOẠI NÀY MỚI SANG LOẠI KHÁC!
    for (const itemLoai of DANH_SACH_LOAI_QUANG) {
      const loai = itemLoai.loai;
      const danhSachMo = nhomQuangTheoLoai[loai] || [];
      if (danhSachMo.length === 0) continue;

      // 1. Kiểm tra cấu hình có cho phép đào loại quặng này không
      if (!quangDuocPhepDao(loai)) continue;

      // 2. KIỂM TRA CÔNG CỤ: NẾU KHÔNG CÓ CÔNG CỤ (<= 0) -> BỎ QUA TOÀN BỘ NHÓM NÀY NGAY!
      const soLuongCuoc = laySoLuongCuocChoQuang(loai);
      if (soLuongCuoc <= 0) {
        console.log(`[SFL Đào Quặng] ⏭️ Bỏ qua nhóm ${itemLoai.ten.toUpperCase()} vì KHÔNG CÓ CÔNG CỤ (${itemLoai.tenCuoc}: ${soLuongCuoc})`);
        continue;
      }

      console.log(
        `%c[SFL Đào Quặng] ⛏️ BẮT ĐẦU NHÓM: ${itemLoai.ten.toUpperCase()} (${danhSachMo.length} mỏ | Công cụ: ${itemLoai.tenCuoc} - Còn: ${soLuongCuoc})`,
        "color: #ff9800; font-weight: bold; font-size: 13px;"
      );

      let daDaoTrongNhom = 0;

      // Đào lần lượt từng mỏ trong cùng 1 loại
      for (let i = 0; i < danhSachMo.length; i += 1) {
        // Kiểm tra ngắt Captcha
        if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
          console.log("[SFL Đào Quặng] 🚨 Phát hiện Captcha khi đang đào quặng → dừng ngay!");
          S.__captchaInterrupted = true;
          return daDaoTongCong > 0;
        }

        // Kiểm tra ngắt Goblin Swarm
        if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) {
          console.log("[SFL Đào Quặng] 👺 Phát hiện Goblin Swarm khi đang đào quặng → dừng ngay!");
          return daDaoTongCong > 0;
        }

        const quang = danhSachMo[i];
        if (!xemPhanTuRanh(quang.el)) continue;

        // KIỂM TRA LẠI CÔNG CỤ TRƯỚC KHI GÕ: Nếu đã hết cuốc thì dừng nhóm này ngay
        if (laySoLuongCuocChoQuang(loai) <= 0) {
          console.log(`[SFL Đào Quặng] ⚠️ Đã hết ${itemLoai.tenCuoc} cho nhóm ${itemLoai.ten} → Dừng nhóm này!`);
          break;
        }

        // Kiểm tra lại trong DOM thực tế: nếu mỏ đang có thanh hồi phục thì bỏ qua
        const root = quang.rootEl || quang.el;
        const cacSrcHienTai = Array.from(root.querySelectorAll("img")).map((img) => (img.getAttribute("src") || img.src || "").toLowerCase());
        const noiDungHienTai = (root.textContent || "").trim().toLowerCase();
        if (laQuangDangHoiPhuc(root, cacSrcHienTai, noiDungHienTai)) {
          console.log(`[SFL Đào Quặng] ⏳ Mỏ ${itemLoai.ten} tại (${quang.coords.x}, ${quang.coords.y}) đang hồi phục → Bỏ qua.`);
          continue;
        }

        console.log(`[SFL Đào Quặng] ⛏️ [${daDaoTrongNhom + 1}/${danhSachMo.length}] Đang đào ${itemLoai.ten} tại (${quang.coords.x}, ${quang.coords.y})...`);
        S.hanhDongCuoi = `⛏️ Đào ${itemLoai.ten} (${quang.coords.x}, ${quang.coords.y})`;

        // Gõ từng nhát với delay tự nhiên (360ms - 440ms) cho đến khi mỏ vỡ (chuyển cooldown) hoặc tối đa 5 nhát
        let daVo = false;
        let thieuCuocTrongKhiDao = false;
        const MAX_NHAP = loai === "Dau" ? 1 : 5;

        for (let nhap = 0; nhap < MAX_NHAP; nhap += 1) {
          clickTam(quang.el);
          await ngu(360 + Math.floor(Math.random() * 80));

          const doc = quang.el.ownerDocument || document;

          // Kiểm tra ngay sau mỗi nhát gõ xem game có báo thiếu cuốc không
          if (kiemTraThieuCuoc(doc)) {
            console.log(`[SFL Đào Quặng] 🛑 Game báo THIẾU CÔNG CỤ (${itemLoai.tenCuoc}) cho ${itemLoai.ten}! Đóng popup và DỪNG NGAY KHÔNG GÕ TIẾP.`);
            await dongPopupNeuCo();
            S.__chacChanHetCuoc = S.__chacChanHetCuoc || {};
            S.__chacChanHetCuoc[loai] = true;
            const tenCuoc = layTenCuocChoQuang(loai);
            if (tenCuoc && S.khoDo) S.khoDo[tenCuoc] = 0;
            thieuCuocTrongKhiDao = true;
            break;
          }

          // Nếu có nút xác nhận Mine hiện lên → bấm
          const nutMine = timNutMineXacNhan(doc);
          if (nutMine) {
            clickTam(nutMine);
            await ngu(300);
          }

          // Kiểm tra mỏ đã vỡ / chuyển sang cooldown chưa
          const rootCheck = quang.rootEl || quang.el;
          const cacSrcCheck = Array.from(rootCheck.querySelectorAll("img")).map((img) => (img.getAttribute("src") || img.src || "").toLowerCase());
          const noiDungCheck = (rootCheck.textContent || "").trim().toLowerCase();
          if (laQuangDangHoiPhuc(rootCheck, cacSrcCheck, noiDungCheck)) {
            daVo = true;
            break;
          }
        }

        if (thieuCuocTrongKhiDao) {
          // Hết công cụ cho loại này -> dừng loại này ngay, không thử thêm mỏ nào khác của loại này
          break;
        }

        // Trừ 1 cuốc trong cache kho đồ nếu có
        const tenCuoc = layTenCuocChoQuang(loai);
        if (tenCuoc && S.khoDo && S.khoDo[tenCuoc] > 0) {
          S.khoDo[tenCuoc] = Math.max(0, S.khoDo[tenCuoc] - 1);
        }

        // Cập nhật trạng thái mỏ đã đào vào cache mapData
        if (S.mapData && Array.isArray(S.mapData.khoangSan)) {
          const itemMap = S.mapData.khoangSan.find((k) => k.x === quang.coords.x && k.y === quang.coords.y);
          if (itemMap) itemMap.trangThai = "cooldown";
        }

        daDaoTrongNhom += 1;
        daDaoTongCong += 1;
        console.log(`[SFL Đào Quặng] ✔ Đã khai thác xong hoàn toàn mỏ ${itemLoai.ten} tại (${quang.coords.x}, ${quang.coords.y})`);

        // Nghỉ an toàn tự nhiên giữa các mỏ (650ms - 900ms)
        await ngu(650 + Math.floor(Math.random() * 250));
      }

      if (daDaoTrongNhom > 0) {
        console.log(`%c[SFL Đào Quặng] ✔️ ĐÃ ĐÀO XONG HẾT TOÀN BỘ NHÓM ${itemLoai.ten.toUpperCase()} (${daDaoTrongNhom}/${danhSachMo.length} mỏ). Chuẩn bị chuyển loại tiếp theo...`, "color: #4caf50; font-weight: bold;");
        await ngu(800);
      }
    }

    return daDaoTongCong > 0;
  }

  // Hàm nhịp điều phối
  async function tickMining() {
    // 1. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return false;

    // 2. Kiểm tra tính năng đào quặng (ID: 6)
    const tinhNangBat = S.cauHinh?.["6"] !== undefined ? !!S.cauHinh["6"] : true;
    if (!tinhNangBat) return false;

    // 3. Captcha đang mở? → nhường luồng
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return false;

    // 4. Goblin Swarm đang chiếm farm? → dừng ngay
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    // 5. Đang bận?
    if (dangBan) return false;

    // 6. Kiểm tra sơ bộ trong cache map: phải có mỏ sẵn sàng VÀ có đủ công cụ đào tương ứng
    if (S.mapData && Array.isArray(S.mapData.khoangSan) && S.mapData.khoangSan.length > 0) {
      const coQuangCoTheDao = S.mapData.khoangSan.some(
        (k) => k.trangThai === "sanSang" && quangDuocPhepDao(k.loai) && laySoLuongCuocChoQuang(k.loai) > 0
      );
      if (!coQuangCoTheDao) return false;
    }

    // 7. Xin khóa toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("mining")) {
      return false;
    }

    dangBan = true;
    try {
      const daDao = await thucHienDaoQuang();
      if (daDao && typeof S.quetData === "function") {
        await ngu(500);
        await S.quetData();
      }
    } catch (err) {
      console.error("[SFL Đào Quặng] Lỗi luồng đào quặng:", err);
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickMining = tickMining;

})(window.SFL = window.SFL || {});
