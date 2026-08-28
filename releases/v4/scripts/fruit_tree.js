// ═══════════════════════════════════════════════════════════════════
// LUỒNG 11 — THU HOẠCH & CHẶT CÂY ĂN QUẢ KHÔ (fruit_tree.js)
// 1. Tự động thu hoạch tất cả cây ăn quả chín (Apple, Orange, Blueberry, Banana, Lemon, Tomato...).
// 2. Tự động kiểm tra rìu và chặt sạch các gốc cây ăn quả khô/chết hết lượt.
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

  // Kiểm tra phần tử hiển thị
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

  // Click vào phần tử an toàn
  function clickTam(el) {
    if (!el) return false;
    const doc = el.ownerDocument || document;
    const view = doc.defaultView || window;
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const opts = { bubbles: true, cancelable: true, view, clientX: x, clientY: y };
    el.dispatchEvent(new MouseEvent("mousemove", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
    if (typeof el.click === "function") {
      try { el.click(); } catch (_e) {}
    }
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

  // Lấy số lượng rìu hiện có (trả về 0 nếu hết, -1 nếu chưa rõ)
  function laySoLuongRiu() {
    if (S.__chacChanHetRiu === true) return 0;

    // 1. Kiểm tra trên HUD
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;
      const cacImgAxe = doc.querySelectorAll('img[src*="tools/axe"], img[src*="game-assets/tools/axe"], img[src*="axe.png"]');
      for (const img of cacImgAxe) {
        if (!xemPhanTuRanh(img)) continue;
        if (img.closest('.scrollable, [role="dialog"]')) continue;
        const slot = img.closest("div, button, [role='button']") || img.parentElement;
        const nhanSo = slot?.querySelector('div[class*="z-10"], span, div.text-xxs, [class*="text-"], div');
        if (nhanSo) {
          const num = parseFloat((nhanSo.textContent || "").trim());
          if (!isNaN(num)) return num;
        }
      }
    }

    // 2. Tìm trong kho đồ S.khoDo
    if (S.khoDo && typeof S.khoDo === "object") {
      for (const [k, v] of Object.entries(S.khoDo)) {
        const ten = k.toLowerCase();
        if (ten === "axe" || ten.includes("axe") || ten === "rìu") {
          const num = Number(v);
          if (!isNaN(num)) return num;
        }
      }
    }

    return -1; // Chưa chắc chắn
  }

  // Kiểm tra popup báo thiếu rìu
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

  // Đóng tất cả popup cảnh báo nếu có
  async function dongPopupThieuRiu() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      const cacAnhClose = doc.querySelectorAll('img[src*="close"], img[src*="cancel"]');
      for (const img of cacAnhClose) {
        if (xemPhanTuRanh(img)) {
          const nutDong = img.closest("button, [role='button'], div[class*='cursor-pointer']") || img;
          clickTam(nutDong);
          await ngu(300);
          break;
        }
      }
      try {
        const view = doc.defaultView || window;
        view.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
      } catch (_e) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 1. TÌM DANH SÁCH CÂY ĂN QUẢ SẴN SÀNG THU HOẠCH
  // ═══════════════════════════════════════════════════════════════════
  function timDanhSachQuaSanSang() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    const daThem = new Set();

    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;

      const cacO = doc.querySelectorAll('[data-map-placement="true"]');
      for (const el of cacO) {
        if (daThem.has(el) || !xemPhanTuRanh(el)) continue;

        const cacAnh = Array.from(el.querySelectorAll("img"));
        const duongDan = cacAnh.map((img) => (img.getAttribute("src") || img.src || "").toLowerCase());
        const noiDung = (el.textContent || "").trim().toLowerCase();

        // 1. Kiểm tra phải là ô vườn quả (fruit_patch hoặc có ảnh quả)
        const laFruitPatch = duongDan.some((s) =>
          s.includes("fruit_patch") || s.includes("fruit-patch") || s.includes("fruitpatch") ||
          s.includes("/fruit/") || s.includes("fruit_") || s.includes("apple") || s.includes("orange") ||
          s.includes("blueberry") || s.includes("banana") || s.includes("peach") || s.includes("lemon") ||
          s.includes("pear") || s.includes("plum") || s.includes("grape") || s.includes("tomato"));
        if (!laFruitPatch) continue;

        // 2. Ô bị khóa → bỏ qua
        const biKhoa = duongDan.some((s) => s.includes("lock")) || noiDung.includes("lock");
        if (biKhoa) continue;

        // 3. Cây khô/chết → bỏ qua (xử lý ở luồng chặt)
        const laCayKho = duongDan.some((s) => s.includes("dead") || s.includes("stump") || s.includes("withered") || s.includes("dry_tree") || s.includes("fruit_stump") || s.includes("dead_bush"));
        if (laCayKho) continue;

        // 4. Ô trống không có cây → bỏ qua
        let coAnhKhac = false;
        for (const s of duongDan) {
          const laNen = s.includes("fruit_patch") || s.includes("fruit-patch") || s.includes("fruitpatch");
          const laDat = s.includes("soil") || s.includes("sand_dug");
          if (!laNen && !laDat) { coAnhKhac = true; break; }
        }
        if (!coAnhKhac) continue;

        // 5. Cây đang đếm giờ hoặc đang lớn → bỏ qua
        const coDemGio = /\d+\s*(?:hrs?|mins?|secs?|hours?|m\b|s\b|h\b)|\d+:\d+/i.test(noiDung) || !!el.querySelector('img[src*="empty_bar"], div[style*="background-color"]');
        const laCayNon = duongDan.some((s) => s.includes("seedling") || s.includes("growing") || s.includes("sapling"));
        if (coDemGio || laCayNon) continue;

        // XÁC NHẬN CÂY CÓ QUẢ CHÍN SẴN SÀNG THU HOẠCH!
        let loaiQua = "Cây ăn quả";
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

        const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer'], [class*='hover:img-highlight']") || el;
        const coords = phanTichToaDo(el.getAttribute("style") || "");

        daThem.add(el);
        danhSach.push({ el: nutClick, rootEl: el, coords, loai: loaiQua });
      }
    }

    return danhSach;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. TÌM DANH SÁCH CÂY ĂN QUẢ KHÔ / CHẾT CẦN CHẶT
  // ═══════════════════════════════════════════════════════════════════
  function timDanhSachCayKho() {
    const taiLieu = layTaiLieuGame();
    const danhSach = [];
    const daThem = new Set();

    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;

      const cacO = doc.querySelectorAll('[data-map-placement="true"]');
      for (const el of cacO) {
        if (daThem.has(el) || !xemPhanTuRanh(el)) continue;

        const cacAnh = Array.from(el.querySelectorAll("img"));
        const duongDan = cacAnh.map((img) => (img.getAttribute("src") || img.src || "").toLowerCase());
        const noiDung = (el.textContent || "").trim().toLowerCase();

        // 1. Phải là ô vườn quả
        const laFruitPatch = duongDan.some((s) =>
          s.includes("fruit_patch") || s.includes("fruit-patch") || s.includes("fruitpatch") ||
          s.includes("/fruit/") || s.includes("fruit_") || s.includes("apple") || s.includes("orange") ||
          s.includes("blueberry") || s.includes("banana") || s.includes("peach") || s.includes("lemon") ||
          s.includes("pear") || s.includes("plum") || s.includes("grape") || s.includes("tomato"));
        if (!laFruitPatch) continue;

        // 2. Bị khóa → bỏ qua
        const biKhoa = duongDan.some((s) => s.includes("lock")) || noiDung.includes("lock");
        if (biKhoa) continue;

        // 3. Phải là cây khô / chết hết lượt hái quả
        const laCayKho = duongDan.some((s) => s.includes("dead") || s.includes("stump") || s.includes("withered") || s.includes("dry_tree") || s.includes("fruit_stump") || s.includes("dead_bush"));
        if (!laCayKho) continue;

        let loaiQua = "Cây quả khô";
        const anhQua = duongDan.find((s) => s.includes("/fruit/"));
        if (anhQua) {
          const m = anhQua.match(/\/fruit\/([a-z0-9_]+)/i);
          if (m && m[1]) loaiQua = `Gốc ${m[1]}`;
        }

        const nutClick = el.querySelector(".cursor-pointer, [class*='cursor-pointer'], [class*='hover:img-highlight']") || el;
        const coords = phanTichToaDo(el.getAttribute("style") || "");

        daThem.add(el);
        danhSach.push({ el: nutClick, rootEl: el, coords, loai: loaiQua });
      }
    }

    return danhSach;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. THỰC HIỆN THU HOẠCH QUẢ CHÍN
  // ═══════════════════════════════════════════════════════════════════
  async function thucHienThuHoachQua() {
    const danhSachQua = timDanhSachQuaSanSang();
    if (danhSachQua.length === 0) {
      return 0;
    }

    console.log(`%c[SFL Cây Ăn Quả] 🍎 Phát hiện ${danhSachQua.length} cây có quả chín sẵn sàng thu hoạch...`, "color: #4caf50; font-weight: bold; font-size: 13px;");
    let daHai = 0;

    for (let i = 0; i < danhSachQua.length; i += 1) {
      if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
        console.log("[SFL Cây Ăn Quả] 🚨 Gặp Captcha khi đang thu hoạch quả! Tạm dừng luồng.");
        S.__captchaInterrupted = true;
        break;
      }
      if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) {
        console.log("[SFL Cây Ăn Quả] 👺 Gặp Goblin Swarm khi đang thu hoạch quả! Tạm dừng luồng.");
        break;
      }

      const cay = danhSachQua[i];
      if (!xemPhanTuRanh(cay.el)) continue;

      S.hanhDongCuoi = `🍎 Hái ${cay.loai} (${i + 1}/${danhSachQua.length})`;
      clickTam(cay.el);

      daHai += 1;
      console.log(`[SFL Cây Ăn Quả] 🍎 [${daHai}/${danhSachQua.length}] Đã thu hoạch ${cay.loai} (${cay.coords.key})`);

      // Cập nhật trạng thái trong S.mapData nếu có
      if (S.mapData && Array.isArray(S.mapData.qua)) {
        const item = S.mapData.qua.find((q) => q.key === cay.coords.key);
        if (item) item.trangThai = "dangLon";
      }

      // Nghỉ an toàn tự nhiên giữa mỗi cây
      await ngu(500 + Math.floor(Math.random() * 250));
    }

    if (daHai > 0) {
      console.log(`%c[SFL Cây Ăn Quả] ✔️ ĐÃ THU HOẠCH HOÀN TẤT ${daHai}/${danhSachQua.length} CÂY ĂN QUẢ!`, "color: #4caf50; font-weight: bold;");
    }
    return daHai;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 4. THỰC HIỆN CHẶT CÂY ĂN QUẢ KHÔ
  // ═══════════════════════════════════════════════════════════════════
  async function thucHienChatCayKho() {
    const danhSachKho = timDanhSachCayKho();
    if (danhSachKho.length === 0) {
      return 0;
    }

    // Kiểm tra số lượng Rìu
    const soRiu = laySoLuongRiu();
    if (soRiu === 0) {
      console.log(`%c[SFL Cây Ăn Quả] ⚠️ Phát hiện ${danhSachKho.length} cây ăn quả khô nhưng KHÔNG CÒN RÌU (Rìu = 0) → Bỏ qua luồng chặt cây khô!`, "color: #ff9800; font-weight: bold;");
      return 0;
    }

    console.log(`%c[SFL Cây Ăn Quả] 🪓 Phát hiện ${danhSachKho.length} cây ăn quả khô cần chặt dọn dẹp (Số rìu còn: ${soRiu > 0 ? soRiu : "sẵn sàng"})...`, "color: #ff9800; font-weight: bold; font-size: 13px;");
    let daChat = 0;

    for (let i = 0; i < danhSachKho.length; i += 1) {
      if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
        console.log("[SFL Cây Ăn Quả] 🚨 Gặp Captcha khi đang chặt cây khô! Tạm dừng luồng.");
        S.__captchaInterrupted = true;
        break;
      }
      if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) {
        console.log("[SFL Cây Ăn Quả] 👺 Gặp Goblin Swarm khi đang chặt cây khô! Tạm dừng luồng.");
        break;
      }

      const cay = danhSachKho[i];
      if (!xemPhanTuRanh(cay.el)) continue;

      S.hanhDongCuoi = `🪓 Chặt ${cay.loai} (${i + 1}/${danhSachKho.length})`;
      clickTam(cay.el);

      // Chờ phản hồi của game
      await ngu(700 + Math.floor(Math.random() * 250));

      // Kiểm tra xem game có báo thiếu rìu không
      let thieuRiu = false;
      for (const doc of layTaiLieuGame()) {
        if (kiemTraThieuRiu(doc)) {
          thieuRiu = true;
          break;
        }
      }

      if (thieuRiu) {
        console.log("%c[SFL Cây Ăn Quả] 🛑 Game báo THIẾU RÌU khi chặt cây khô! Đóng popup và dừng luồng chặt.", "color: #f44336; font-weight: bold;");
        S.__chacChanHetRiu = true;
        await dongPopupThieuRiu();
        break;
      }

      daChat += 1;
      console.log(`[SFL Cây Ăn Quả] 🪓 [${daChat}/${danhSachKho.length}] Đã chặt gốc cây ăn quả khô (${cay.coords.key})`);

      // Cập nhật số lượng rìu nếu có
      if (S.khoDo && typeof S.khoDo.axe === "number" && S.khoDo.axe > 0) {
        S.khoDo.axe -= 1;
      }

      // Cập nhật trạng thái trong S.mapData nếu có
      if (S.mapData && Array.isArray(S.mapData.qua)) {
        const item = S.mapData.qua.find((q) => q.key === cay.coords.key);
        if (item) item.trangThai = "rong";
      }

      await ngu(500 + Math.floor(Math.random() * 200));
    }

    if (daChat > 0) {
      console.log(`%c[SFL Cây Ăn Quả] ✔️ ĐÃ HOÀN TẤT CHẶT ${daChat}/${danhSachKho.length} GỐC CÂY ĂN QUẢ KHÔ!`, "color: #4caf50; font-weight: bold;");
    }
    return daChat;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5. HÀM ĐIỀU PHỐI CHÍNH CỦA LUỒNG (SCHEDULER TICK)
  // ═══════════════════════════════════════════════════════════════════
  async function tickFruitTree() {
    // 1. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return false;

    // 2. Kiểm tra tính năng Cây ăn quả (ID: 11)
    const tinhNangBat = S.cauHinh?.["11"] !== undefined ? !!S.cauHinh["11"] : true;
    if (!tinhNangBat) return false;

    // 3. Captcha đang mở? → nhường luồng
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return false;

    // 4. Goblin Swarm đang chiếm farm? → dừng ngay
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    // 5. Đang bận?
    if (dangBan) return false;

    // 6. Kiểm tra cache bản đồ (nếu có cache và không có quả chín lẫn cây khô thì bỏ qua nhanh)
    if (S.mapData && Array.isArray(S.mapData.qua) && S.mapData.qua.length > 0) {
      const coViec = S.mapData.qua.some((q) => q.trangThai === "sanSang" || q.trangThai === "kho");
      if (!coViec) return false;
    }

    // 7. Xin khóa toàn cục
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("fruit_tree")) {
      return false;
    }

    dangBan = true;
    try {
      // Bước A: Thu hoạch toàn bộ quả chín
      const soQuaHai = await thucHienThuHoachQua();

      // Bước B: Chặt dọn dẹp các cây ăn quả khô/chết (nếu có)
      const soGocChat = await thucHienChatCayKho();

      // Nếu có bất kỳ hành động nào, quét cập nhật lại bản đồ nhẹ
      if ((soQuaHai > 0 || soGocChat > 0) && typeof S.quetBanDo === "function") {
        await ngu(800);
        await S.quetBanDo();
      }
    } catch (err) {
      console.error("[SFL Cây Ăn Quả] Lỗi trong luồng thu hoạch & chặt cây ăn quả:", err);
    } finally {
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa();
      }
    }
  }

  // Xuất bản hàm sang không gian tên SFL
  S.tickFruitTree = tickFruitTree;

})(window.SFL = window.SFL || {});
