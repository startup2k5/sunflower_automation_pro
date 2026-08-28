// ═══════════════════════════════════════════════════════════════════
// KHÓA TOÀN CỤC (lock.js) — dùng chung cho mọi luồng
// Đảm bảo các luồng KHÔNG chồng chéo nhau.
// Chỉ chứa cơ chế khóa. Các helper khác nằm riêng trong từng luồng.
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  // Biến trạng thái khóa
  S.khoaDenLuc = S.khoaDenLuc || 0;
  S.luongDangGiu = S.luongDangGiu || null;

  // Xin khóa toàn cục. Trả về true nếu giành được, false nếu luồng khác đang giữ (bỏ lượt).
  S.xinKhoa = function xinKhoa(tenLuong, thoiGianToiDa = 25000) {
    // NẾU GOBLIN SWARM ĐANG XUẤT HIỆN: CHẶN 100% MỌI LUỒNG!
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) {
      return false;
    }
    // NẾU CAPTCHA ĐANG MỞ: CHỈ DUY NHẤT LUỒNG "captcha" ĐƯỢC XIN KHÓA!
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen() && tenLuong !== "captcha") {
      return false;
    }
    const hienTai = Date.now();
    if (S.khoaDenLuc && hienTai < S.khoaDenLuc && S.luongDangGiu !== tenLuong) {
      return false;
    }
    S.khoaDenLuc = hienTai + thoiGianToiDa;
    S.luongDangGiu = tenLuong;
    return true;
  };

  // Nhả khóa toàn cục
  S.nhaKhoa = function nhaKhoa() {
    S.khoaDenLuc = 0;
    S.luongDangGiu = null;
  };

})(window.SFL = window.SFL || {});
