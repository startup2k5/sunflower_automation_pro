// ═══════════════════════════════════════════════════════════════════
// LUỒNG GIÁM SÁT VÀ TỰ ĐỘNG GIẢI CAPTCHA TỐC ĐỘ CAO (captcha.js)
// Tự động nhận diện, chặn luồng khác, giải Captcha & nhận thưởng
// Hỗ trợ: Goblin (Yêu tinh), Skeleton (Người xương), Moon Seeker, Zombie, Rương kho báu
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Lấy danh sách tài liệu DOM
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

  // Kiểm tra phần tử hiển thị
  function xemPhanTuRanh(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const view = el.ownerDocument?.defaultView || window;
    let style;
    try { style = view.getComputedStyle(el); } catch (_e) { return false; }
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  // Kích hoạt React Fiber props
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

  // Click tâm chuẩn xác với độ trễ cực ngắn
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
    kichHoatReactProps(el);
    if (el.parentElement) kichHoatReactProps(el.parentElement);

    // Nhả chuột nhanh sau 20ms
    setTimeout(() => {
      try {
        if (typeof el.blur === "function") el.blur();
        el.dispatchEvent(new MouseEvent("mouseout", upOpts));
        el.dispatchEvent(new MouseEvent("mouseleave", upOpts));
      } catch (_e5) {}
    }, 20);

    return true;
  }

  // ═══════ Giao tiếp với MAIN World Bridge để đọc React Fiber ═══════
  let pendingResolvers = new Map();
  let reqSeq = 0;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data._sfl !== true) return;

    if (data.type === "SFL_CAPTCHA_GRID_RESULT") {
      const reqId = data.reqId;
      if (reqId && pendingResolvers.has(reqId)) {
        const resolve = pendingResolvers.get(reqId);
        pendingResolvers.delete(reqId);
        resolve(data.items || null);
      }
    }
  });

  // Inject script page-bridge vào MAIN world
  let daInjectBridgeCaptcha = false;
  function injectBridge() {
    if (daInjectBridgeCaptcha || document.getElementById("sfl-page-bridge")) return;
    daInjectBridgeCaptcha = true;
    try {
      const script = document.createElement("script");
      script.id = "sfl-page-bridge";
      script.src = chrome.runtime.getURL("scripts/bridge/page-bridge.js");
      (document.head || document.documentElement).appendChild(script);
    } catch (_e) {}
  }
  injectBridge();

  // Yêu cầu Bridge đọc danh sách 16 ô
  function docGridTuBridge(timeoutMs = 1500) {
    injectBridge();
    return new Promise((resolve) => {
      const reqId = `cap_${Date.now().toString(36)}_${(++reqSeq).toString(36)}`;
      const timer = setTimeout(() => {
        pendingResolvers.delete(reqId);
        resolve(null);
      }, timeoutMs);
      pendingResolvers.set(reqId, (items) => {
        clearTimeout(timer);
        resolve(items);
      });
      window.postMessage({ _sfl: true, type: "SFL_READ_CAPTCHA_GRID", reqId }, "*");
    });
  }

  // ═══════ Kiểm tra Captcha đang mở trên màn hình (Siêu nhạy & chính xác) ═══════
  function isCaptchaOpen() {
    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;

      // 1. Quét nhanh textContent của toàn bộ Body (độ trễ < 0.1ms)
      const bodyTxt = (doc.body.textContent || "").toLowerCase();
      const coTextCaptcha =
        bodyTxt.includes("attempts left:") ||
        bodyTxt.includes("stop the goblins") ||
        bodyTxt.includes("stop the moon seeker") ||
        bodyTxt.includes("stop the skeleton") ||
        bodyTxt.includes("stop the zombie") ||
        bodyTxt.includes("tap the chest") ||
        bodyTxt.includes("chest to open") ||
        bodyTxt.includes("verify you are human") ||
        bodyTxt.includes("are you a human");

      if (coTextCaptcha) {
        // Đảm bảo phần tử thật sự hiển thị trên màn hình
        const spans = doc.querySelectorAll("span, p, h1, h2, h3, div");
        for (const s of spans) {
          const t = (s.textContent || "").toLowerCase();
          if (
            (t.includes("attempts left:") || t.includes("stop the goblin") || t.includes("moon seeker") || t.includes("skeleton") || t.includes("tap the chest") || t.includes("chest to open") || t.includes("human")) &&
            xemPhanTuRanh(s)
          ) {
            return true;
          }
        }
      }

      // 2. Kiểm tra Grid 16 ô Stop the Goblins / Skeleton / Moon Seeker / Zombie
      const wraps = doc.querySelectorAll("div.flex.flex-wrap.justify-center.items-center, div.flex.flex-wrap");
      for (const w of wraps) {
        if (!xemPhanTuRanh(w)) continue;
        const cellCount = Array.from(w.children).filter(
          (el) => el && el.tagName === "DIV" && el.classList?.contains("cursor-pointer"),
        ).length;
        if (cellCount >= 16 && (bodyTxt.includes("attempts") || bodyTxt.includes("stop") || bodyTxt.includes("seeker"))) {
          return true;
        }
      }
    }
    return false;
  }

  // ═══════ Chuẩn hóa item từ React State (Goblin, Skeleton, Moon Seeker, Zombie) ═══════
  function chuanHoaGridItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const src = typeof raw.src === "string" ? raw.src : "";
    let isGoblin = false;
    if (typeof raw.isGoblin === "boolean") isGoblin = raw.isGoblin;
    else if (typeof raw.isMoonSeeker === "boolean") isGoblin = raw.isMoonSeeker;
    else if (typeof raw.isZombie === "boolean") isGoblin = raw.isZombie;
    else if (typeof raw.isSkeleton === "boolean") isGoblin = raw.isSkeleton;
    else if (raw.goblin === true || raw.moonSeeker === true || raw.zombie === true || raw.skeleton === true) isGoblin = true;
    else {
      const t = String(raw.type || raw.kind || raw.role || raw.name || "").toLowerCase();
      if (t === "goblin" || t.includes("moon") || t.includes("seeker") || t.includes("zomb") || t.includes("skele")) isGoblin = true;
      if (src && (src.includes("skeleton") || src.includes("goblin") || src.includes("moon_seeker") || src.includes("zombie"))) isGoblin = true;
    }
    return { isGoblin, src };
  }

  // ═══════ Kiểm tra ô đã có icon confirm/cancel (đã click rồi) ═══════
  function oDaClick(cell) {
    const imgs = cell.querySelectorAll("img");
    for (const im of imgs) {
      const u = String(im.currentSrc || im.getAttribute("src") || "").toLowerCase();
      if (u.includes("confirm") || u.includes("cancel") || u.includes("/icons/confirm") || u.includes("/icons/cancel")) return true;
    }
    return false;
  }

  // ═══════ Lấy ảnh mục tiêu bên trong ô để click ═══════
  function layAnhTrongO(cell) {
    const imgs = cell.querySelectorAll("img");
    for (const im of imgs) {
      const low = String(im.currentSrc || im.getAttribute("src") || "").toLowerCase();
      if (!low.startsWith("data:image")) continue;
      const st = String(im.getAttribute("style") || "");
      if (/transform|perspective|skew|rotate|scale/i.test(st)) return im;
    }
    for (const im of imgs) {
      const low = String(im.currentSrc || im.getAttribute("src") || "").toLowerCase();
      if (low.startsWith("data:image")) return im;
    }
    return cell.querySelector("img.h-full.object-contain") || cell.querySelector("img") || cell;
  }

  // ═══════ Quy trình tự động Giải Grid 16 ô Captcha TỐC ĐỘ CAO (TURBO) ═══════
  async function giaiGridCaptcha(doc, wrap) {
    console.log("%c[SFL Captcha] ⚡ Bắt đầu giải Grid 16 ô Captcha (Turbo Mode)...", "color: #00e676; font-weight: bold; font-size: 13px;");
    S.hanhDongCuoi = "🛡️ Đang giải Captcha (Turbo)...";

    // Phản xạ siêu tốc (200ms - 280ms)
    await ngu(200 + Math.floor(Math.random() * 80));

    const cells = Array.from(wrap.children).filter(
      (el) => el && el.tagName === "DIV" && el.classList?.contains("cursor-pointer"),
    ).slice(0, 16);

    if (cells.length < 16) {
      console.log("[SFL Captcha] ⚠️ Không đủ 16 ô grid!");
      return false;
    }

    // Đọc danh sách 16 ô từ MAIN World Bridge
    let items = null;
    for (let lanThu = 1; lanThu <= 3; lanThu += 1) {
      try {
        items = await docGridTuBridge(1200);
      } catch (_e) {
        items = null;
      }
      if (items && Array.isArray(items) && items.length === 16) {
        break;
      }
      if (lanThu < 3) {
        await ngu(200);
      }
    }

    if (!items || !Array.isArray(items) || items.length < 16) {
      console.log("[SFL Captcha] ⚠️ Bridge không đọc được 16 ô React Fiber. Dừng giải để tránh click sai.");
      return false;
    }

    const chuanHoa = items.map((it) => chuanHoaGridItem(it));

    // Lọc ra TẤT CẢ các ô mục tiêu có isGoblin === true (Goblin / Skeleton / Moon Seeker / Zombie)
    const cacMucTieu = [];
    for (let i = 0; i < 16; i += 1) {
      const item = chuanHoa[i];
      if (item && item.isGoblin === true) {
        cacMucTieu.push(i);
      }
    }

    console.log(
      `%c[SFL Captcha] 🎯 Phát hiện ${cacMucTieu.length} ô mục tiêu (Goblin/Người xương): [${cacMucTieu.map((i) => i + 1).join(", ")}]`,
      "color: #4caf50; font-weight: bold; font-size: 13px;"
    );

    if (cacMucTieu.length === 0) {
      console.log("[SFL Captcha] ⚠️ Không tìm thấy ô mục tiêu nào trong dữ liệu Bridge.");
      return false;
    }

    // Click siêu nhanh vào TẤT CẢ các ô mục tiêu (khoảng 80ms - 140ms mỗi ô)
    let daClickCount = 0;
    for (const idx of cacMucTieu) {
      const cell = cells[idx];
      if (!cell || !xemPhanTuRanh(cell) || oDaClick(cell)) continue;
      const inner = layAnhTrongO(cell);
      clickTam(inner !== cell ? inner : cell);
      daClickCount += 1;
      console.log(`[SFL Captcha] ⚡ Click ô mục tiêu số ${idx + 1} (${daClickCount}/${cacMucTieu.length})`);
      await ngu(80 + Math.floor(Math.random() * 60));
    }

    // Đợi ClaimReward popup xuất hiện (onOpen) và bấm nút Claim / Woohoo / Tiếp tục (tối đa 3.5s)
    let daBamClaim = false;
    for (let loop = 0; loop < 15; loop += 1) {
      await ngu(250);
      for (const d of layTaiLieuGame()) {
        const cacNut = d.querySelectorAll("button, [role='button'], div[class*='cursor-pointer']");
        for (const btn of cacNut) {
          if (!xemPhanTuRanh(btn)) continue;
          const txt = (btn.textContent || "").trim().toLowerCase();
          if (
            txt === "claim" ||
            txt.includes("claim") ||
            txt.includes("continue") ||
            txt.includes("tiếp tục") ||
            txt.includes("xác nhận") ||
            txt.includes("open") ||
            txt.includes("sweet") ||
            txt.includes("awesome") ||
            txt.includes("woohoo")
          ) {
            console.log(`%c[SFL Captcha] 🎁 Bấm nút nhận thưởng hoàn tất Captcha: "${txt}"`, "color: #00e676; font-weight: bold;");
            clickTam(btn);
            daBamClaim = true;
            await ngu(400);
            break;
          }
        }
        if (daBamClaim) break;
      }
      if (daBamClaim) break;
    }

    return true;
  }

  // ═══════ Đóng popup thông thường (TUYỆT ĐỐI KHÔNG CHẠY KHI ĐANG CÓ CAPTCHA) ═══════
  async function dongPopupCaptcha() {
    // Captcha trong Sunflower Land KHÔNG CÓ NÚT CLOSE, chỉ đóng khi người chơi giải xong!
    if (isCaptchaOpen()) {
      return false;
    }

    const taiLieu = layTaiLieuGame();
    for (const doc of taiLieu) {
      if (!doc || !doc.body) continue;

      // 1. Tìm nút ảnh close (bỏ qua icon cancel)
      const cacAnhClose = doc.querySelectorAll('img[src*="close"]');
      for (const img of cacAnhClose) {
        if (xemPhanTuRanh(img)) {
          const nut = img.closest("button, [role='button'], div[class*='cursor-pointer']") || img;
          clickTam(nut);
          await ngu(200);
          return true;
        }
      }

      // 2. Tìm nút button có chữ Close, Đóng, OK
      const cacNut = doc.querySelectorAll("button, [role='button'], div[class*='cursor-pointer']");
      for (const btn of cacNut) {
        if (!xemPhanTuRanh(btn)) continue;
        const txt = (btn.textContent || "").trim().toLowerCase();
        if (txt === "close" || txt === "đóng" || txt === "ok") {
          clickTam(btn);
          await ngu(200);
          return true;
        }
      }

      // 3. Gửi phím Escape vào window game
      try {
        const view = doc.defaultView || window;
        view.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      } catch (_e) {}
    }
    return false;
  }

  // ═══════ Giải Captcha Rương Kho Báu ("Tap the chest to open it") Tốc Độ Cao ═══════
  async function giaiTreasureChest(doc) {
    console.log("[SFL Captcha] 📦 Đang giải Rương kho báu siêu tốc...");
    S.hanhDongCuoi = "📦 Đang mở rương kho báu...";

    await ngu(300);

    let nutRuong = null;
    const allSpans = doc.querySelectorAll("span, p, div");
    for (const s of allSpans) {
      if (!xemPhanTuRanh(s)) continue;
      const txt = (s.textContent || "").trim().toLowerCase();
      if (txt.includes("tap the chest") || txt.includes("chest to open")) {
        const parentBox = s.closest("div.cursor-pointer") || s.parentElement;
        const imgChest = parentBox?.querySelector("img.w-16, img[style*='transform'], img.absolute") || parentBox?.querySelector("img");
        nutRuong = imgChest || parentBox;
        break;
      }
    }

    if (!nutRuong) {
      nutRuong = doc.querySelector("img.w-16, img[style*='transform'][style*='perspective']");
    }

    if (nutRuong) {
      clickTam(nutRuong);
      await ngu(400);
    }

    // Bấm nút nhận thưởng / Claim / Continue nếu có
    for (let loop = 0; loop < 6; loop += 1) {
      let coNut = false;
      for (const d of layTaiLieuGame()) {
        const cacNut = d.querySelectorAll("button, [role='button'], div[class*='cursor-pointer']");
        for (const btn of cacNut) {
          if (!xemPhanTuRanh(btn)) continue;
          const txt = (btn.textContent || "").trim().toLowerCase();
          if (txt.includes("claim") || txt.includes("continue") || txt.includes("open") || txt.includes("tiếp tục") || txt.includes("nhận")) {
            console.log(`[SFL Captcha] 🎁 Bấm nút nhận thưởng: "${txt}"`);
            clickTam(btn);
            coNut = true;
            await ngu(300);
            break;
          }
        }
        if (coNut) break;
      }
      if (!coNut) break;
    }

    return true;
  }

  // Giải Popup Claim thông thường
  async function giaiPopupClaim(doc) {
    if (isCaptchaOpen()) return false;
    console.log("[SFL Captcha] 🎁 Đang xử lý Popup Nhận thưởng...");
    await ngu(300);

    for (const d of layTaiLieuGame()) {
      const cacNut = d.querySelectorAll("button, [role='button'], div[class*='cursor-pointer'], img[src*='chest']");
      for (const btn of cacNut) {
        if (!xemPhanTuRanh(btn)) continue;
        const txt = (btn.textContent || "").trim().toLowerCase();
        if (txt.includes("claim") || txt.includes("continue") || txt.includes("tiếp tục") ||
            txt.includes("open") || txt.includes("mở") || txt.includes("close") || txt.includes("đóng") ||
            btn.tagName === "IMG") {
          clickTam(btn);
          await ngu(250);
        }
      }
    }

    await dongPopupCaptcha();
    return true;
  }

  // Điều phối giải Captcha
  async function kiemTraVaGiaiCaptcha() {
    if (!isCaptchaOpen()) return true;

    // Kiểm tra cấu hình bật/tắt từ Popup UI (featureId: 2)
    if (S.cauHinh && S.cauHinh[2] === false) {
      return true;
    }

    // Chiếm khóa ưu tiên cao nhất
    if (typeof S.xinKhoa === "function" && !S.xinKhoa("captcha")) {
      return false;
    }

    dangBan = true;
    console.log("%c[SFL Captcha] 🚨 PHÁT HIỆN CAPTCHA! Tạm dừng mọi luồng để tập trung giải siêu tốc...", "color: #ff3838; font-weight: bold; font-size: 14px;");

    try {
      const taiLieu = layTaiLieuGame();
      let daGiai = false;

      for (const doc of taiLieu) {
        if (!doc || !doc.body) continue;

        // 1. Kiểm tra Grid 16 ô (Stop the Goblins / Moon Seeker / Skeleton / Zombie)
        const wraps = doc.querySelectorAll("div.flex.flex-wrap.justify-center.items-center, div.flex.flex-wrap");
        let coGrid16 = false;
        for (const w of wraps) {
          if (!xemPhanTuRanh(w)) continue;
          const cellCount = Array.from(w.children).filter(
            (el) => el && el.tagName === "DIV" && el.classList?.contains("cursor-pointer"),
          ).length;
          if (cellCount >= 16) {
            coGrid16 = true;
            daGiai = await giaiGridCaptcha(doc, w);
            break;
          }
        }

        // NẾU LÀ GRID 16 Ô: Dừng tại đây, TUYỆT ĐỐI KHÔNG rơi vào xử lý Popup Claim hay bấm nút Close!
        if (coGrid16) {
          break;
        }

        // 2. Kiểm tra Rương kho báu ("Tap the chest to open it")
        const txtBody = (doc.body.textContent || "").toLowerCase();
        const coRuong = txtBody.includes("tap the chest") || txtBody.includes("chest to open");
        if (coRuong) {
          daGiai = await giaiTreasureChest(doc);
          break;
        }

        // 3. Xử lý popup claim thông thường (chỉ chạy khi không phải Captcha challenge)
        if (!isCaptchaOpen()) {
          daGiai = await giaiPopupClaim(doc);
          if (daGiai) break;
        }
      }

      // Đợi modal đóng hẳn với kiểm tra polling
      for (let i = 0; i < 15; i += 1) {
        await ngu(200);
        if (!isCaptchaOpen()) {
          console.log("%c[SFL Captcha] ✔️ ĐÃ GIẢI XONG VÀ ĐÓNG CAPTCHA HOÀN TOÀN!", "color: #00e676; font-weight: bold; font-size: 14px;");
          return true;
        }
      }

      // Nếu Captcha vẫn còn hiển thị, trả về false để hệ thống điều phối TIẾP TỤC ĐÓNG BĂNG, không chạy luồng khác!
      if (isCaptchaOpen()) {
        console.log("%c[SFL Captcha] ⚠️ Captcha vẫn chưa đóng. Tiếp tục giữ khóa và đóng băng toàn bộ luồng...", "color: #ff9800; font-weight: bold;");
        return false;
      }

      return true;
    } catch (err) {
      console.error("[SFL Captcha] Lỗi trong quá trình giải Captcha:", err);
      return false;
    } finally {
      dangBan = false;
      S.__captchaActive = false;
      S.__captchaInterrupted = false;
      if (typeof S.nhaKhoa === "function") S.nhaKhoa("captcha");
    }
  }

  // ═══════ BỘ GIÁM SÁT REAL-TIME ĐỘ NHẠY CAO (XUẤT HIỆN LÀ GIẢI NGAY) ═══════
  let dangGiaiNhanh = false;

  async function tuDongGiaiNgay() {
    if (dangGiaiNhanh || dangBan) return;
    if (!isCaptchaOpen()) return;

    dangGiaiNhanh = true;
    S.__captchaInterrupted = true;
    console.log("%c[SFL Captcha] ⚡ Phát hiện Captcha xuất hiện! Kích hoạt giải ngay lập tức...", "color: #ff3838; font-weight: bold; font-size: 14px;");

    try {
      await kiemTraVaGiaiCaptcha();
    } catch (err) {
      console.error("[SFL Captcha] Lỗi giải nhanh Captcha:", err);
    } finally {
      dangGiaiNhanh = false;
      S.__captchaActive = false;
      S.__captchaInterrupted = false;
      if (typeof S.nhaKhoa === "function") S.nhaKhoa("captcha");
    }
  }

  // 1. Quét liên tục mỗi 300ms
  setInterval(() => {
    if (!dangGiaiNhanh && !dangBan && isCaptchaOpen()) {
      tuDongGiaiNgay();
    }
  }, 300);

  // 2. Bắt ngay lập tức khi DOM thêm phần tử Captcha modal
  try {
    const observer = new MutationObserver(() => {
      if (!dangGiaiNhanh && !dangBan && isCaptchaOpen()) {
        tuDongGiaiNgay();
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (_e) {}

  // Xuất bản sang không gian tên SFL
  S.isCaptchaOpen = isCaptchaOpen;
  S.kiemTraVaGiaiCaptcha = kiemTraVaGiaiCaptcha;
  S.tuDongGiaiNgay = tuDongGiaiNgay;

})(window.SFL = window.SFL || {});
