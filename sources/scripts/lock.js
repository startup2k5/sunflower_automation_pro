// ═══════════════════════════════════════════════════════════════════
// HỆ THỐNG KHÓA VÀ ĐIỀU PHỐI ĐỘC QUYỀN LUỒNG (lock.js)
// Đảm bảo tại một thời điểm chỉ có 1 luồng duy nhất được thao tác
// Luồng Captcha luôn có quyền ƯU TIÊN TUYỆT ĐỐI — ĐÓNG BĂNG 100% CÁC LUỒNG KHÁC
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let luongDangGiu = null;
  let thoiDiemGiuKhoa = 0;
  const THOI_GIAN_KHOA_TOI_DA = 45000; // 45 giây tự động giải phóng nếu bị treo

  // Kiểm tra xem luồng có đang bị chặn bởi Captcha hoặc Goblin Swarm hay không
  function isFlowBlocked(tenLuong) {
    if (tenLuong === "captcha") return false;
    if (S.__captchaActive) return true;
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return true;
    return false;
  }

  function xinKhoa(tenLuong) {
    const bayGio = Date.now();

    // Nếu Captcha đang mở -> Chặn tuyệt đối 100% mọi luồng khác
    if (tenLuong !== "captcha" && isFlowBlocked(tenLuong)) {
      return false;
    }

    // Tự động nhả khóa nếu giữ quá lâu
    if (luongDangGiu && bayGio - thoiDiemGiuKhoa > THOI_GIAN_KHOA_TOI_DA) {
      console.warn(`[SFL Khóa] ⚠️ Luồng "${luongDangGiu}" giữ khóa quá 45s -> Tự động thu hồi khóa.`);
      luongDangGiu = null;
    }

    // Luồng Captcha có quyền cướp khóa ngay lập tức
    if (tenLuong === "captcha") {
      if (luongDangGiu && luongDangGiu !== "captcha") {
        console.log(`%c[SFL Khóa] 🚨 CAPTCHA CƯỚP KHÓA TỪ "${luongDangGiu}" ĐỂ GIẢI NGAY!`, "color: #fff; background: #d32f2f; font-weight: bold; padding: 2px 6px; border-radius: 3px;");
        S.__captchaInterrupted = true;
      }
      luongDangGiu = "captcha";
      thoiDiemGiuKhoa = bayGio;
      S.luongDangGiu = luongDangGiu;
      S.__captchaActive = true;
      return true;
    }

    // Nếu không ai giữ hoặc chính luồng này đang giữ
    if (!luongDangGiu || luongDangGiu === tenLuong) {
      luongDangGiu = tenLuong;
      thoiDiemGiuKhoa = bayGio;
      S.luongDangGiu = luongDangGiu;
      return true;
    }

    return false;
  }

  function nhaKhoa(tenLuong) {
    if (tenLuong === "captcha") {
      S.__captchaActive = false;
    }
    if (!tenLuong || luongDangGiu === tenLuong || tenLuong === "force") {
      luongDangGiu = null;
      thoiDiemGiuKhoa = 0;
      S.luongDangGiu = null;
      return true;
    }
    return false;
  }

  function dangGiuKhoa(tenLuong) {
    return luongDangGiu === tenLuong;
  }

  S.xinKhoa = xinKhoa;
  S.nhaKhoa = nhaKhoa;
  S.dangGiuKhoa = dangGiuKhoa;
  S.isFlowBlocked = isFlowBlocked;

})(window.SFL = window.SFL || {});
