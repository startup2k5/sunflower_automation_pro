// ═══════════════════════════════════════════════════════════════════
// LUỒNG AUTO TAP — TỰ ĐỘNG BẤM TIẾP TỤC & XỬ LÝ LỖI GAME (tap.js)
// 1. Tự động click: "tap to continue", "click to continue", "press to continue",
//    "tap anywhere", "click anywhere", "claim", "continue", "awesome", "sweet"...
// 2. Tự động xử lý màn hình lỗi & reload trang:
//    "something went wrong", "connection lost", "a new version is ready",
//    "an error occurred", "network error", "session expired", "too many requests"...
// (Dựa trên module tap.js từ bản v3.0.1)
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  let demLoiLienTuc = 0;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Lấy danh sách document của game (kể cả iframe và window.top)
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

  // Kích hoạt React props
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

  // Click chuẩn xác vào tâm phần tử
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
      which: 1,
      button: 0,
    };
    const downOpts = { ...baseOpts, buttons: 1 };
    const upOpts = { ...baseOpts, buttons: 0 };

    try { el.focus?.({ preventScroll: true }); } catch (_e) {}

    // Pointer Events
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

    try {
      if (typeof PointerEvent !== "undefined") {
        el.dispatchEvent(new PointerEvent("pointerup", { ...upOpts, pointerId: 1, pointerType: "mouse", isPrimary: true, pressure: 0 }));
      }
    } catch (_e3) {}

    el.dispatchEvent(new MouseEvent("mouseup", upOpts));
    el.dispatchEvent(new MouseEvent("click", upOpts));

    try { el.click?.(); } catch (_e4) {}
    kichHoatReactProps(el);

    return true;
  }

  // Tìm phần tử cha có thể tương tác (button, a, role=button, cursor-pointer)
  function timClickableAncestor(el) {
    let p = el;
    for (let depth = 0; depth < 6 && p; depth += 1) {
      if (
        p.tagName === "BUTTON" ||
        p.tagName === "A" ||
        p.getAttribute("role") === "button" ||
        p.classList?.contains("cursor-pointer")
      ) {
        return p;
      }
      try {
        const view = el.ownerDocument?.defaultView || window;
        const style = view.getComputedStyle(p);
        if (style && style.cursor === "pointer") {
          return p;
        }
      } catch (_e) {}
      p = p.parentElement;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 1. TỰ ĐỘNG BẤM CÁC NÚT TAP TO CONTINUE, CLAIM, REWARD
  // ═══════════════════════════════════════════════════════════════════
  async function xuLyClaimVaContinue() {
    // KHÔNG can thiệp nếu Captcha hoặc Goblin Swarm đang mở
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return false;
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    // KHÔNG can thiệp nếu luồng checkin đang mở modal mua sắm (tránh tắt nhầm)
    if (S.luongDangGiu === "checkin") return false;

    const docs = layTaiLieuGame();

    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      if (!doc || !doc.body) continue;

      let foundEl = null;
      let clickTarget = null;

      try {
        const elements = doc.querySelectorAll("button, [role='button'], a, div.cursor-pointer, div[class*='cursor-pointer'], span, p");
        const matches = [];

        for (let i = 0; i < elements.length; i += 1) {
          const el = elements[i];
          if (!xemPhanTuRanh(el)) continue;
          if (el.disabled) continue;

          const text = String(el.textContent || "").trim().toLowerCase();
          if (!text || text.length > 80) continue;

          // TUYỆT ĐỐI KHÔNG BẤM VÀO: Captcha, Rương, Goblin, Lệch giờ, hoặc ô item hòm đồ
          if (
            text.includes("chest") ||
            text.includes("rương") ||
            text.includes("goblin") ||
            text.includes("moon seeker") ||
            text.includes("clock not in sync") ||
            text.includes("clock is not in sync") ||
            text.includes("stop the") ||
            text.includes("batch buy") ||
            text.includes("total cost")
          ) {
            continue;
          }

          // Nhận diện theo yêu cầu chuẩn:
          // tap to continue | click to continue | press to continue | tap anywhere | click anywhere
          // claim | continue | awesome | sweet | yay | okay | ok | tiếp tục | nhận
          const laNutTapContinue =
            text.includes("tap to continue") ||
            text.includes("click to continue") ||
            text.includes("press to continue") ||
            text.includes("tap anywhere") ||
            text.includes("click anywhere");

          const laNutClaimNhan =
            /^(claim|nhận|tiếp tục|continue|awesome|sweet|yay|okay|ok)$/i.test(text) ||
            /^tap to continue[!.]*$/i.test(text) ||
            /^click to continue[!.]*$/i.test(text);

          if (laNutTapContinue || laNutClaimNhan) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.width < 900 && rect.height > 0 && rect.height < 600) {
              const clickable = timClickableAncestor(el);
              matches.push({ el, clickable: clickable || el, isRealClickable: !!clickable });
            }
          }
        }

        if (matches.length > 0) {
          matches.sort((a, b) => {
            if (a.isRealClickable !== b.isRealClickable) {
              return a.isRealClickable ? -1 : 1;
            }
            return (a.el.textContent || "").length - (b.el.textContent || "").length;
          });
          foundEl = matches[0].el;
          clickTarget = matches[0].clickable;
        }
      } catch (_e) {}

      if (!foundEl || !clickTarget) continue;

      const txtHien = (foundEl.textContent || "").trim().slice(0, 40);
      console.log(`%c[SFL Auto Tap] 👆 Phát hiện nút "${txtHien}" → Tự động click tiếp tục...`, "color: #ff9800; font-weight: bold;");
      S.hanhDongCuoi = `👆 Bấm: ${txtHien.slice(0, 20)}`;

      clickTam(clickTarget);
      await ngu(600);
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. TỰ ĐỘNG XỬ LÝ MÀN HÌNH LỖI GAME & AUTO RELOAD KHI KẸT
  // ═══════════════════════════════════════════════════════════════════
  async function xuLyManHinhLoiVaUpdate() {
    // KHÔNG can thiệp nếu Captcha hoặc Goblin Swarm đang mở
    if (typeof S.isCaptchaOpen === "function" && S.isCaptchaOpen()) return false;
    if (typeof S.isGoblinSwarm === "function" && S.isGoblinSwarm()) return false;

    const docs = layTaiLieuGame();

    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      if (!doc || !doc.body) continue;

      const bodyText = (doc.body.textContent || "").toLowerCase();

      // Danh sách từ khóa nhận diện lỗi game (chuẩn theo yêu cầu người dùng & v3.0.1)
      const laManHinhLoi =
        bodyText.includes("something went wrong") ||
        bodyText.includes("connection lost") ||
        bodyText.includes("a new version is ready") ||
        bodyText.includes("an error occurred") ||
        bodyText.includes("network error") ||
        bodyText.includes("session expired") ||
        bodyText.includes("too many requests") ||
        bodyText.includes("got it") ||
        bodyText.includes("error code");

      if (!laManHinhLoi) {
        continue;
      }

      console.log("%c[SFL Auto Tap] ⚠️ Phát hiện màn hình cảnh báo lỗi / mất kết nối / phiên bản mới!", "color: #f44336; font-weight: bold;");

      // 1. Trường hợp game có bản Update mới: "A new version is ready"
      if (bodyText.includes("a new version is ready")) {
        const cacNutUpdate = doc.querySelectorAll("button, [role='button'], a, div.cursor-pointer, img[src*='round_button']");
        for (const btn of cacNutUpdate) {
          if (!xemPhanTuRanh(btn)) continue;
          const txt = (btn.textContent || "").trim().toLowerCase();
          const src = (btn.getAttribute?.("src") || "").toLowerCase();
          if (txt === "update" || txt.includes("update") || src.includes("round_button")) {
            console.log("[SFL Auto Tap] 🔄 Bấm nút Update phiên bản mới...");
            clickTam(btn);
            await ngu(2000);
            return true;
          }
        }
        console.log("[SFL Auto Tap] 🔄 Không thấy nút Update riêng, reload trang để cập nhật...");
        window.location.reload();
        await ngu(3000);
        return true;
      }

      // 2. Tìm các nút tương tác: Try again, Refresh, Reload, Retry, Continue, Okay, Got it, Close
      let containers = [];
      try {
        const dialogs = doc.querySelectorAll('[role="dialog"], [data-headlessui-state="open"], div.fixed.inset-0, div[class*="bg-"]');
        containers = Array.from(dialogs).filter((dEl) => xemPhanTuRanh(dEl));
      } catch (_e) {}

      if (containers.length === 0) {
        containers = [doc.body];
      }

      for (const container of containers) {
        const cacNutLoi = Array.from(
          container.querySelectorAll("button, [role='button'], a, div.cursor-pointer, [class*='cursor-pointer']")
        );

        for (const el of cacNutLoi) {
          if (!xemPhanTuRanh(el)) continue;
          const text = String(el.textContent || "").trim().toLowerCase();
          if (!text || text.length > 50) continue;

          const laNutKhoiPhuc =
            /^(try again|refresh|reload|retry|update|continue|okay|got it|close|ok)$/i.test(text) ||
            /\btry\s+again\b|\brefresh\b|\breload\b|\bretry\b|\bgot\s+it\b|\btap\s+to\s+continue\b/i.test(text);

          if (laNutKhoiPhuc) {
            console.log(`%c[SFL Auto Tap] 🛠️ Phát hiện nút khôi phục lỗi ("${text}") → Tiến hành click!`, "color: #2196f3; font-weight: bold;");
            S.hanhDongCuoi = `Khôi phục: ${text}`;
            clickTam(el);
            demLoiLienTuc = 0;
            await ngu(1200);
            return true;
          }
        }
      }

      // 3. Nếu thấy màn hình lỗi mà không có nút nào bấm được hoặc bị kẹt liên tiếp 3 lần:
      demLoiLienTuc += 1;
      console.log(`[SFL Auto Tap] ⏳ Màn hình lỗi game đang treo (Lần ${demLoiLienTuc}/3)...`);

      if (demLoiLienTuc >= 3) {
        console.log("%c[SFL Auto Tap] 🔄 Màn hình lỗi game treo liên tục 3 lần → Tự động reload trang (location.reload)!", "color: #f44336; font-weight: bold; font-size: 13px;");
        demLoiLienTuc = 0;
        window.location.reload();
        await ngu(3000);
        return true;
      }
      return false;
    }

    demLoiLienTuc = 0;
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // VÒNG LẶP AUTO TAP CHẠY ĐỘC LẬP MỖI 1.2 GIÂY
  // ═══════════════════════════════════════════════════════════════════
  async function vongLapAutoTap() {
    if (dangBan) return;
    if (typeof S.chayDungFrame === "function" && !S.chayDungFrame()) return;

    // Kiểm tra Master bật
    const masterBat = S.cauHinh?.masterBat !== undefined ? !!S.cauHinh.masterBat : true;
    if (!masterBat) return;

    dangBan = true;
    try {
      // 1. Kiểm tra và bấm các nút lỗi game trước (ưu tiên cao hơn)
      const daXuLyLoi = await xuLyManHinhLoiVaUpdate();
      if (daXuLyLoi) return;

      // 2. Kiểm tra và bấm các nút claim / tap to continue / click anywhere
      await xuLyClaimVaContinue();
    } catch (err) {
      console.error("[SFL Auto Tap] Lỗi vòng lặp tap:", err);
    } finally {
      dangBan = false;
    }
  }

  // Khởi chạy vòng lặp kiểm tra mỗi 1200ms
  setInterval(vongLapAutoTap, 1200);

  // Xuất bản sang không gian tên SFL
  S.xuLyClaimVaContinue = xuLyClaimVaContinue;
  S.xuLyManHinhLoiVaUpdate = xuLyManHinhLoiVaUpdate;

})(window.SFL = window.SFL || {});
