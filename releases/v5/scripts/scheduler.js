// ═══════════════════════════════════════════════════════════════════
// BỘ ĐIỀU PHỐI TUẦN TỰ TOÀN BỘ CÁC LUỒNG (scheduler.js)
// ĐIỀU PHỐI TUẦN TỰ 100% (STRICT SEQUENTIAL) — CHỐNG CHỒNG LẤN TUYỆT ĐỐI
// Đóng sạch sẽ modal giữa các bước, nhịp bước rõ ràng, không bao giờ chạy đè luồng
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangChayVongLap = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Danh sách 15 luồng tuần tự nghiêm ngặt (kèm featureId khớp Popup UI)
  const CAC_LUONG = [
    { id: "load_data", ten: "1. Quét Dữ Liệu", fn: () => S.loadData?.(false) },
    { id: "checkin", ten: "2. Check-in Rương & Thuyền", featureId: 14, fn: () => S.tickCheckin?.() },
    { id: "tools_buy", ten: "3. Mua Công Cụ Đủ Điều Kiện", featureId: 15, fn: () => S.tickToolsBuy?.() },
    { id: "seeds_buy", ten: "4. Mua Hạt Giống Theo Mùa", featureId: 9, fn: () => S.tickSeedsBuy?.() },
    // ── CHU KỲ CANH TÁC RUỘNG ĐẤT BẮT BUỘC ──
    { id: "crops_harvest", ten: "5. Thu Hoạch Ruộng", featureId: 7, fn: () => S.tickCropHarvest?.() },
    { id: "compost", ten: "6. Thu Hoạch & Ủ Phân Compost", featureId: 10, fn: () => S.tickCompost?.() },
    { id: "fertilise", ten: "7. Rắc Phân Sprout Mix", featureId: 7, fn: () => S.tickFertilise?.() },
    { id: "crops_plant", ten: "8. Gieo Hạt Theo Mùa", featureId: 7, fn: () => S.tickCropPlant?.() },
    // ── CÁC TÀI NGUYÊN & HOẠT ĐỘNG KHÁC ──
    { id: "mushrooms", ten: "9. Nhặt Nấm Rừng", featureId: 4, fn: () => S.tickThuHoachNam?.() },
    { id: "flowers", ten: "10. Chăm Sóc & Trồng Hoa", featureId: 8, fn: () => S.tickFlowerAction?.() },
    { id: "honey", ten: "11. Thu Hoạch Mật Ong", featureId: 3, fn: () => S.tickHoney?.() },
    { id: "wood", ten: "12. Chặt Cây Lấy Gỗ", featureId: 5, fn: () => S.tickWoodChop?.() },
    { id: "mining", ten: "13. Đào Khoáng Sản & Dầu", featureId: 6, fn: () => S.tickMining?.() },
    { id: "fruit_tree", ten: "14. Cây Ăn Quả (Thu hoạch & Trồng)", featureId: 11, fn: () => S.tickFruitTree?.() },
    { id: "cooking", ten: "15. Nấu Ăn & Chế Biến", featureId: 12, fn: () => S.tickCooking?.() },
    { id: "deliveries", ten: "16. Giao Đơn Hàng Tàu/NPC", featureId: 13, fn: () => S.tickDeliveries?.() },
  ];

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

  function xemPhanTuRanh(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const view = el.ownerDocument?.defaultView || window;
    let style;
    try { style = view.getComputedStyle(el); } catch (_e) { return false; }
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isGoblinSwarm() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;
      const txt = (doc.body.textContent || "").toLowerCase();
      if (txt.includes("goblin swarm") || txt.includes("taken over your farm") || txt.includes("wait for them to leave")) {
        return true;
      }
    }
    return false;
  }
  S.isGoblinSwarm = isGoblinSwarm;

  // Tự động tắt vĩnh viễn banner "VIP expired" của game trong localStorage
  try {
    localStorage.setItem("vipExpiryAcknowledged", new Date(Date.now() + 86400000 * 365).toISOString());
  } catch (_e) {}

  function laNutCloseChuan(el) {
    if (!el || !xemPhanTuRanh(el)) return false;
    const src = (el.src || el.getAttribute?.("src") || "").toLowerCase();
    const alt = (el.alt || el.getAttribute?.("alt") || "").toLowerCase();

    // TUYỆT ĐỐI BỎ QUA MỌI THỨ LIÊN QUAN ĐẾN VIP (TRÁNH BẤM MUA VIP)
    const pText = (el.parentElement?.textContent || el.closest?.("div, button, [role='button']")?.textContent || "").toLowerCase();
    if (pText.includes("vip") || src.includes("vip")) {
      return false;
    }
    const vipContainer = el.closest?.('[class*="vip"], [id*="vip"], [data-name*="vip"]');
    if (vipContainer) return false;

    // TUYỆT ĐỐI KHÔNG ĐƯỢC NHẬN NHẦM THÙNG COMPOST CLOSED HOẶC ĐỒ TRÊN ĐẢO!
    if (src.includes("compost") || src.includes("closed") || src.includes("building") || src.includes("island")) {
      return false;
    }
    const laAnhClose = src.includes("/ui/close") || src.includes("/icons/close") || src.includes("close.png") || src.includes("cancel.png") || alt === "close" || alt === "cancel";
    const laAriaClose = el.getAttribute?.("aria-label") === "close";

    // Phải nằm trong modal/dialog thực sự (loại trừ các panel HUD trên màn hình như widget VIP)
    const trongDialog = !!el.closest?.('[role="dialog"], [role="modal"], div[class*="modal"], .fixed.inset-0');
    return (laAnhClose || laAriaClose) && trongDialog;
  }

  // Dọn dẹp sạch sẽ toàn bộ popup giữa các bước (trừ Captcha)
  async function donDepPopupGiuaCacBuoc() {
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return;
    for (let loop = 0; loop < 2; loop++) {
      let daDong = false;
      for (const doc of layTaiLieuGame()) {
        if (!doc || !doc.body) continue;
        const cacAnhClose = doc.querySelectorAll('img[src*="/ui/close"], img[src*="close.png"], img[src*="cancel.png"], button[aria-label="close"]');
        for (const img of cacAnhClose) {
          if (!laNutCloseChuan(img)) continue;
          // Chỉ click button hoặc chính thẻ img close, KHÔNG click div.cursor-pointer cha tránh kích hoạt nội dung bên trong
          const btn = img.closest("button, [role='button']") || img;
          try {
            btn.click();
          } catch (_e) {}
          daDong = true;
          await ngu(200);
          break;
        }
      }
      if (!daDong) break;
    }
    for (const doc of layTaiLieuGame()) {
      try {
        const view = doc.defaultView || window;
        view.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      } catch (_e) {}
    }
    await ngu(150);
  }

  // ═══════ VÒNG LẶP ĐIỀU PHỐI TUẦN TỰ ĐỘC QUYỀN (STRICT SEQUENTIAL) ═══════
  async function vongLapChinh() {
    if (dangChayVongLap) return;
    dangChayVongLap = true;

    console.log("%c[SFL Điều Phối] 🚀 KHỞI ĐỘNG HỆ THỐNG ĐIỀU PHỐI TUẦN TỰ 100% (STRICT SEQUENTIAL)...", "color: #00e676; font-weight: bold; font-size: 14px;");

    // Đợi game và dữ liệu State sẵn sàng (tối đa 10s)
    for (let wait = 0; wait < 20; wait++) {
      if (S.gameState || document.querySelector('[data-map-placement], #root, canvas')) break;
      await ngu(500);
    }

    let soThuTuVongLap = 0;

    while (true) {
      const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
      if (!masterBat) {
        await ngu(2000);
        continue;
      }

      soThuTuVongLap++;
      console.log(`%c[SFL Điều Phối] 🔄 BẮT ĐẦU CHU KỲ VÒNG ${soThuTuVongLap}...`, "color: #2196f3; font-weight: bold; font-size: 13px;");

      // Cập nhật Game State tươi mới nhất qua Bridge cho vòng lặp hiện tại
      if (typeof S.requestBridgeState === "function") {
        try { await S.requestBridgeState(1500); } catch (_e) {}
      }

      // Duyệt tuần tự lần lượt qua từng bước một (1 -> 15)
      for (let i = 0; i < CAC_LUONG.length; i++) {
        const luongObj = CAC_LUONG[i];

        // 0. Kiểm tra cấu hình bật/tắt từ Popup UI (nếu người dùng chủ động tắt)
        if (luongObj.featureId !== undefined && S.cauHinh && S.cauHinh[luongObj.featureId] === false) {
          continue;
        }

        // Bỏ qua luồng Checkin nếu hôm nay đã check-in xong (hoặc localStorage đã ghi nhận)
        const todayKey = new Date().toISOString().slice(0, 10);
        if (
          luongObj.id === "checkin" &&
          (S.__daCheckinHomNay ||
            localStorage.getItem("sfl_checkin_done_date") === todayKey ||
            (S.__cooldownCheckin && Date.now() < S.__cooldownCheckin))
        ) {
          continue;
        }

        // Bỏ qua luồng Mua Công Cụ từ vòng 2 trở đi (chỉ chạy 1 lần duy nhất ở vòng 1 cho đến khi tải lại trang)
        if (luongObj.id === "tools_buy" && (soThuTuVongLap > 1 || S.__daMuaCongCuVongDau)) {
          continue;
        }

        // Bỏ qua luồng Mua Hạt Giống nếu số tiền < 1 xu hoặc đã mua ở vòng trước
        if (luongObj.id === "seeds_buy") {
          const coins = Number(S.gameState?.coins ?? S.userData?.coins ?? 0);
          if (coins < 1) {
            console.log(`%c[SFL Scheduler] 💰 Số dư hiện tại (${coins.toFixed(2)} xu < 1 xu) -> Bỏ qua luồng Mua Hạt Giống.`, "color: #ff9800;");
            continue;
          }
          if (soThuTuVongLap > 1 || S.__daMuaHatGiongVongDau) {
            continue;
          }
        }

        // Bỏ qua luồng Compost nếu đang trong thời gian nghỉ cooldown (ngăn chặn spam 100%)
        if (luongObj.id === "compost" && S.__thoiGianNghiCompost && Date.now() < S.__thoiGianNghiCompost) {
          continue;
        }

        // Bỏ qua luồng Rắc Phân nếu số lượng phân bón trong kho <= 0 (ngăn ngừa hành động thừa)
        if (luongObj.id === "fertilise") {
          const inv = S.gameState?.inventory || S.userData?.inventory || {};
          const sproutMix = Number(inv["Sprout Mix"] || 0);
          const rapidRoot = Number(inv["Rapid Root"] || 0);
          const sproutSurprise = Number(inv["Sproutroot Surprise"] || 0);
          const fertiliser = Number(inv["Fertiliser"] || 0);
          const totalPhan = sproutMix + rapidRoot + sproutSurprise + fertiliser;
          if (totalPhan <= 0) {
            continue;
          }
        }

        // Bỏ qua luồng Hoa nếu không có hoa nở và không đủ hạt giống/nguyên liệu trồng
        if (luongObj.id === "flowers") {
          const state = S.gameState;
          const flowerBeds = (state?.resources?.flowers?.list || []).filter((b) => b && (b.x !== undefined || b.y !== undefined));
          const hasReady = flowerBeds.some((b) => b.isReady);
          const hasEmpty = flowerBeds.some((b) => !b.plantedAt || b.name === "Empty");
          const inv = state?.inventory || S.userData?.inventory || {};
          const FLOWER_SEEDS = ["Sunpetal Seed", "Bloom Seed", "Lily Seed", "Edelweiss Seed", "Gladiolus Seed", "Lavender Seed", "Clover Seed"];
          const hasSeed = FLOWER_SEEDS.some((s) => Number(inv[s] || 0) >= 1);
          if (!hasReady && (!hasEmpty || !hasSeed)) {
            continue;
          }
        }

        // 1. Kiểm tra và giải Captcha trước mỗi bước (ĐÓNG BĂNG TUYỆT ĐỐI, KHÔNG ĐƯỢC CHUYỂN LUỒNG)
        while (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
          console.log("%c[SFL Điều Phối] 🚨 Đang có Captcha trên màn hình! Đóng băng hệ thống để tập trung giải...", "color: #ff3838; font-weight: bold; font-size: 13px;");
          if (typeof S.kiemTraVaGiaiCaptcha === "function") {
            await S.kiemTraVaGiaiCaptcha();
          }
          await ngu(800);
        }

        // 2. Kiểm tra Goblin Swarm
        while (isGoblinSwarm()) {
          console.log("%c[SFL Điều Phối] 👺 Goblin Swarm đang chiếm farm! Đợi 3s...", "color: #ff5252; font-weight: bold;");
          await ngu(3000);
        }

        // 3. Đóng sạch sẽ các popup còn sót lại của bước trước
        await donDepPopupGiuaCacBuoc();

        // Đảm bảo cờ Captcha và khóa Captcha được giải phóng hoàn toàn nếu Captcha đã đóng
        if (typeof S.isCaptchaOpen === "function" && !S.isCaptchaOpen()) {
          S.__captchaActive = false;
          S.__captchaInterrupted = false;
          if (S.luongDangGiu === "captcha" && typeof S.nhaKhoa === "function") {
            S.nhaKhoa("captcha");
          }
        }

        // 4. Bắt đầu thực thi DUY NHẤT luồng hiện tại và ĐỢI KẾT THÚC HOÀN TOÀN
        console.log(`%c[SFL Điều Phối] ▶️ [BƯỚC ${i + 1}/${CAC_LUONG.length}] BẮT ĐẦU: ${luongObj.ten.toUpperCase()}`, "color: #00bcd4; font-weight: bold; font-size: 12px;");
        S.__captchaInterrupted = false;

        try {
          if (typeof luongObj.fn === "function") {
            await luongObj.fn();
          }
        } catch (err) {
          console.error(`[SFL Điều Phối] Lỗi trong bước ${luongObj.ten}:`, err);
        }

        // 5. Nếu bị ngắt bởi Captcha trong lúc thực thi hoặc sau bước:
        // ĐÓNG BĂNG VÀ GIẢI ĐẾN KHI XONG, RỒI TIẾP TỤC QUAY LẠI CHẠY TIẾP CHÍNH LUỒNG ĐÓ TỪ CHỖ DỪNG!
        if (S.__captchaInterrupted || (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen())) {
          while (S.__captchaInterrupted || (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen())) {
            console.log(`%c[SFL Điều Phối] 🚨 Bị ngắt bởi Captcha ở [BƯỚC ${i + 1}: ${luongObj.ten}]! Đóng băng mọi luồng để tập trung giải...`, "color: #ff9800; font-weight: bold;");
            if (typeof S.kiemTraVaGiaiCaptcha === "function") {
              await S.kiemTraVaGiaiCaptcha();
            }
            await ngu(800);
            if (typeof S.isCaptchaOpen === "function" && !S.isCaptchaOpen()) {
              S.__captchaInterrupted = false;
              break;
            }
          }

          console.log(`%c[SFL Điều Phối] 🔄 ĐÃ GIẢI XONG CAPTCHA! TIẾP TỤC QUAY LẠI HOÀN THÀNH LUỒNG: ${luongObj.ten.toUpperCase()} TỪ CHỖ DỪNG...`, "color: #00e676; font-weight: bold; font-size: 13px;");
          await donDepPopupGiuaCacBuoc();
          i--; // Giảm i để vòng lặp for chạy lại chính bước này
          await ngu(800);
          continue;
        }

        console.log(`[SFL Điều Phối] ✔️ [BƯỚC ${i + 1}/${CAC_LUONG.length}] XONG: ${luongObj.ten}`);

        // 6. Giãn cách tự nhiên như người thật giữa các luồng (1.5s - 2.5s)
        const delay = 1500 + Math.floor(Math.random() * 1000);
        await ngu(delay);
      }

      // Kết thúc 1 chu kỳ hoàn chỉnh (15 bước) -> Nghỉ giải lao 5s - 7s
      console.log(`%c[SFL Điều Phối] 🔄 HOÀN TẤT 1 CHU KỲ (15 LUỒNG) → Nghỉ giải lao 5s trước khi lặp lại...`, "color: #4caf50; font-weight: bold; font-size: 13px;");
      await ngu(5000 + Math.floor(Math.random() * 2000));
    }
  }

  S.vongDieuPhoi = vongLapChinh;

  // Khởi động sau khi vào game 4 giây (chỉ ở frame game chính)
  setTimeout(() => {
    if (window !== window.top && !document.querySelector('#root, [data-map-placement], canvas')) return;
    vongLapChinh();
  }, 4000);

})(window.SFL = window.SFL || {});
