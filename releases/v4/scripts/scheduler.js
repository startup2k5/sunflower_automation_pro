// ═══════════════════════════════════════════════════════════════════
// BỘ ĐIỀU PHỐI TUẦN TỰ CÁC LUỒNG (scheduler.js)
// Thứ tự 1 chu kỳ:
//   1. Quét dữ liệu (Kho & Map)
//   2. Check-in Thuyền
//   3. Thu hoạch Nấm
//   4. Thu hoạch Hoa
//   5. Thu hoạch Mật ong
//   6. Chặt cây lấy gỗ
// Sau khi hoàn thành hết 6 luồng → NGHỈ 5 GIÂY rồi mới bắt đầu chu kỳ mới.
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  let luongHienTai = "quet_data";

  // Danh sách các luồng theo thứ tự trong 1 chu kỳ
  const CAC_LUONG = [
    { id: "quet_data", ten: "Quét dữ liệu (Kho & Map)", fn: () => S.quetData?.() },
    { id: "checkin", ten: "Check-in Thuyền", fn: () => S.tickCheckin?.() },
    { id: "nam", ten: "Thu hoạch Nấm", fn: () => S.tickThuHoachNam?.() },
    { id: "flowers", ten: "Thu hoạch Hoa", fn: () => S.tickFlowerAction?.() },
    { id: "honey", ten: "Thu hoạch Mật ong", fn: () => S.tickHoney?.() },
    { id: "wood", ten: "Chặt cây lấy gỗ", fn: () => S.tickWoodChop?.() },
    { id: "mining", ten: "Đào đá quặng", fn: () => S.tickMining?.() },
    { id: "crops_harvest", ten: "Thu hoạch ruộng", fn: () => S.tickCropHarvest?.() },
    { id: "fertilise", ten: "Rắc phân Sprout Mix", fn: () => S.tickFertilise?.() },
    { id: "crops_plant", ten: "Trồng ruộng cây trồng", fn: () => S.tickCropPlant?.() },
    { id: "fruit_tree", ten: "Thu hoạch & Chặt cây ăn quả", fn: () => S.tickFruitTree?.() },
    { id: "compost", ten: "Ủ phân hữu cơ", fn: () => S.tickCompost?.() },
  ];

  // Lấy danh sách tài liệu DOM (kể cả iframe và window.top)
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
    try { if (window.top && window.top.document) { them(window.top.document); nganXep.push(window.top.document); } } catch (_e) {}
    try { if (window.parent && window.parent.document) { them(window.parent.document); nganXep.push(window.parent.document); } } catch (_e) {}

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

  // ══════════════════════════════════════════════════════════════
  // PHÁT HIỆN GOBLIN SWARM! POPUP CHÍNH XÁC 100%
  // Nhận diện qua text "Goblin Swarm", "taken over your farm"
  // hoặc ảnh goblin.gif + đồng hồ đếm ngược
  // ══════════════════════════════════════════════════════════════
  function kiemTraGoblinSwarm() {
    for (const doc of layTaiLieuGame()) {
      if (!doc || !doc.body) continue;

      // 1. Quét text cảnh báo Goblin Swarm trong tài liệu
      const cacTheText = doc.querySelectorAll("span, p, h1, h2, h3, div");
      for (const el of cacTheText) {
        if (!xemPhanTuRanh(el)) continue;
        const txt = (el.textContent || "").trim().toLowerCase();
        if (
          txt.includes("goblin swarm") ||
          txt.includes("taken over your farm") ||
          txt.includes("wait for them to leave") ||
          txt.includes("took too long to farm your crops")
        ) {
          const modalBox = el.closest('[class*="bg-"], [role="dialog"], div') || el.parentElement;
          const timerEl = modalBox?.querySelector?.(".font-secondary, [class*='font-secondary'], img[src*='stopwatch']");
          const thoiGianNode = timerEl?.closest?.("div") || timerEl;
          const thoiGian = (thoiGianNode?.textContent || "").trim();
          return { dangXuatHien: true, thoiGian };
        }
      }

      // 2. Quét qua ảnh gif goblin
      const cacAnhGoblin = doc.querySelectorAll('img[src*="goblin.gif"], img[src*="goblin_female.gif"], img[src*="npcs/goblin"]');
      for (const img of cacAnhGoblin) {
        if (!xemPhanTuRanh(img)) continue;
        const container = img.closest('[class*="bg-"], [role="dialog"]') || img.parentElement?.parentElement;
        const txt = (container?.textContent || "").toLowerCase();
        if (txt.includes("goblin") && (txt.includes("swarm") || txt.includes("taken") || txt.includes("wait"))) {
          const timerEl = container?.querySelector?.(".font-secondary, [class*='font-secondary']");
          const thoiGian = (timerEl?.textContent || "").trim();
          return { dangXuatHien: true, thoiGian };
        }
      }
    }
    return { dangXuatHien: false, thoiGian: "" };
  }

  // ══════════════════════════════════════════════════════════════
  // BỘ GIÁM SÁT LIÊN TỤC (Chạy ngầm mỗi 800ms)
  // Ngay cả khi refresh trang hay trong lúc bất kỳ luồng nào đang chạy,
  // nếu phát hiện Goblin Swarm là lập tức khóa mọi luồng và nhả khóa toàn cục.
  // ══════════════════════════════════════════════════════════════
  let goblinSwarmDangDienRa = false;
  let thoiGianGoblinConLai = "";

  function capNhatTrangThaiGoblinSwarm() {
    const res = kiemTraGoblinSwarm();
    if (res.dangXuatHien) {
      if (!goblinSwarmDangDienRa) {
        console.log(
          `%c[SFL Giám Sát] 👺 GOBLIN SWARM ĐANG XUẤT HIỆN! (${res.thoiGian || "đang khóa"}). KHÓA TOÀN BỘ LUỒNG NGAY LẬP TỨC!`,
          "color: #fff; background: #d32f2f; font-weight: bold; font-size: 13px; padding: 4px 8px; border-radius: 4px;"
        );
      }
      goblinSwarmDangDienRa = true;
      thoiGianGoblinConLai = res.thoiGian || "";
      S.goblinSwarmActive = true;
      S.hanhDongCuoi = `👺 Goblin Swarm! Chờ ${thoiGianGoblinConLai || "hết giờ"}...`;

      // Hủy khóa ngay lập tức nếu luồng nào đang giữ
      if (S.luongDangGiu && S.luongDangGiu !== "goblin_lock") {
        console.log(`[SFL Giám Sát] 🚨 Ngắt khóa của luồng "${S.luongDangGiu}" do Goblin Swarm!`);
        S.nhaKhoa();
      }
    } else {
      if (goblinSwarmDangDienRa) {
        console.log("%c[SFL Giám Sát] 🎉 Goblin Swarm đã rời đi! Khôi phục hoạt động cho các luồng.", "color: #4caf50; font-weight: bold; font-size: 13px;");
      }
      goblinSwarmDangDienRa = false;
      thoiGianGoblinConLai = "";
      S.goblinSwarmActive = false;
    }
  }

  // Khởi chạy bộ giám sát liên tục mỗi 800ms ngay từ đầu
  setInterval(capNhatTrangThaiGoblinSwarm, 800);

  // Xuất bản hàm kiểm tra Goblin Swarm
  S.isGoblinSwarm = function () {
    return S.goblinSwarmActive === true || kiemTraGoblinSwarm().dangXuatHien;
  };

  async function chayBuoc(luongObj, luongKeTiep, laCuoiChuKy) {
    // 0. KIỂM TRA GOBLIN SWARM TRƯỚC KHI BẮT ĐẦU BẤT KỲ LUỒNG NÀO!
    if (S.isGoblinSwarm()) {
      console.log(
        `%c[SFL Điều Phối] 👺 GOBLIN SWARM! Dừng luồng "${luongObj.ten}". Kiểm tra lại sau 2 giây...`,
        "color: #ff5252; font-weight: bold;"
      );
      setTimeout(() => chayBuoc(luongObj, luongKeTiep, laCuoiChuKy), 2000);
      return;
    }

    // 1. KIỂM TRA VÀ GIẢI CAPTCHA NẾU CÓ TRƯỚC KHI BẮT ĐẦU LUỒNG
    if (typeof S.kiemTraVaGiaiCaptcha === "function" && S.isCaptchaOpen?.()) {
      await S.kiemTraVaGiaiCaptcha();
    }

    // Nếu Captcha vẫn chưa đóng hẳn thì chờ và thử lại chính luồng này
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
      console.log(`[SFL Điều Phối] ⏸️ Chờ giải quyết Captcha trước khi chạy luồng "${luongObj.ten}"...`);
      setTimeout(() => chayBuoc(luongObj, luongKeTiep, laCuoiChuKy), 1500);
      return;
    }

    // Kiểm tra nếu là luồng checkin đã chạy 1 lần trong phiên tải trang này thì bỏ qua ngay lập tức
    if (luongObj.id === "checkin" && typeof S.daChayCheckinSession === "function" && S.daChayCheckinSession()) {
      luongHienTai = luongKeTiep.id;
      setTimeout(vongDieuPhoi, 100);
      return;
    }

    // LOG THÔNG BÁO ĐẾN LƯỢT LUỒNG NÀO
    console.log(`%c[SFL Điều Phối] ▶️ ĐẾN LƯỢT: ${luongObj.ten.toUpperCase()}`, "color: #00bcd4; font-weight: bold; font-size: 12px;");

    // Đặt cờ theo dõi ngắt Captcha
    S.__captchaInterrupted = false;

    try {
      if (typeof luongObj.fn === "function") {
        await luongObj.fn();
      }
    } catch (err) {
      console.error(`[SFL Điều Phối] Lỗi luồng ${luongObj.ten}:`, err);
    }

    // 2. NẾU TRONG HOẶC SAU KHI CHẠY MÀ GẶP CAPTCHA:
    if (S.__captchaInterrupted || (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen?.())) {
      console.log(`%c[SFL Điều Phối] 🚨 Luồng "${luongObj.ten}" gặp Captcha → Dừng giải Captcha và SẼ TIẾP TỤC LÀM LẠI luồng "${luongObj.ten}" sau khi xong!`, "color: #ff9800; font-weight: bold;");
      if (typeof S.kiemTraVaGiaiCaptcha === "function") {
        await S.kiemTraVaGiaiCaptcha();
      }
      // SAU KHI GIẢI XONG: TIẾP TỤC CHẠY LẠI CHÍNH LUỒNG NÀY (không chuyển sang luồng kế tiếp)
      setTimeout(() => chayBuoc(luongObj, luongKeTiep, laCuoiChuKy), 250);
      return;
    }

    // 3. CHỈ CHUYỂN SANG LUỒNG KẾ TIẾP KHI ĐÃ HOÀN THÀNH TRỌN VẸN
    luongHienTai = luongKeTiep.id;

    if (laCuoiChuKy) {
      // Đã xong 1 chu kỳ đầy đủ → nghỉ 5 giây rồi mới lặp lại chu kỳ mới
      console.log(`%c[SFL Điều Phối] 🔄 Hoàn tất 1 chu kỳ toàn bộ (${CAC_LUONG.length} luồng) → Chờ 5s trước khi bắt đầu chu kỳ mới`, "color: #4caf50; font-weight: bold;");
      setTimeout(vongDieuPhoi, 5000);
    } else {
      // Chuyển sang bước tiếp theo trong chu kỳ sau 2 giây (2000ms)
      console.log(`[SFL Điều Phối] ⏱️ Chờ 2s → Luồng kế tiếp: "${luongKeTiep.ten}"`);
      setTimeout(vongDieuPhoi, 2000);
    }
  }

  async function vongDieuPhoi() {
    // Chỉ chạy ở frame đúng (game nằm trong iframe)
    if (typeof S.chayDungFrame === "function" && !S.chayDungFrame()) return;
    if (dangBan) return;

    // 1. ƯU TIÊN GIẢI CAPTCHA NẾU ĐANG MỞ
    if (typeof S.kiemTraVaGiaiCaptcha === "function" && S.isCaptchaOpen?.()) {
      await S.kiemTraVaGiaiCaptcha();
      setTimeout(vongDieuPhoi, 250);
      return;
    }

    // 2. GOBLIN SWARM ĐANG CHIẾM FARM → DỪNG TOÀN BỘ, KIỂM TRA LẠI MỖI 2 GIÂY
    if (S.isGoblinSwarm()) {
      console.log(
        `%c[SFL Điều Phối] 👺 GOBLIN SWARM! Farm đang bị khóa — DỪNG TOÀN BỘ. Kiểm tra liên tục mỗi 2s...`,
        "color: #ff5252; font-weight: bold; font-size: 13px; background: #2a0000; padding: 3px 6px; border-radius: 3px;"
      );
      setTimeout(vongDieuPhoi, 2000);
      return;
    }

    // 3. Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) {
      S.hanhDongCuoi = "⏸️ Tạm dừng (Chờ bật Master)";
      return;
    }

    // 4. Nhường luồng nếu có Captcha (double-check)
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) {
      setTimeout(vongDieuPhoi, 1500);
      return;
    }

    dangBan = true;
    try {
      const idx = CAC_LUONG.findIndex((l) => l.id === luongHienTai);
      const viTriHienTai = idx >= 0 ? idx : 0;
      const luongObj = CAC_LUONG[viTriHienTai];
      const viTriKeTiep = (viTriHienTai + 1) % CAC_LUONG.length;
      const luongKeTiep = CAC_LUONG[viTriKeTiep];
      const laCuoiChuKy = viTriKeTiep === 0;

      await chayBuoc(luongObj, luongKeTiep, laCuoiChuKy);
    } catch (err) {
      console.error("[SFL Điều Phối] Lỗi vòng điều phối chính:", err);
    } finally {
      dangBan = false;
    }
  }

  // Cho phép luồng khác yêu cầu chạy ngay một nhịp
  S.tickVongDieuPhoi = function () {
    if (dangBan) return;
    setTimeout(() => { vongDieuPhoi(); }, 80);
  };

  // Chờ 5 giây sau khi tab mở lên để game tải xong rồi mới khởi động vòng điều phối tool
  setTimeout(() => {
    if (typeof S.chayDungFrame === "function" && !S.chayDungFrame()) return;
    console.log("[SFL Điều Phối] ⏳ Đã đợi 5s sau khi mở tab → Bắt đầu chu kỳ canh tác đầu tiên");
    vongDieuPhoi();
  }, 5000);

})(window.SFL = window.SFL || {});
