// ═══════════════════════════════════════════════════════════════════
// LUỒNG MUA HẠT GIỐNG TẠI CỬA HÀNG BETTY (seeds_buy.js)
// Sử dụng toàn bộ logic mua hạt giống chuẩn mực từ bản v4
// Tự động tìm cửa hàng Betty, vào Tab Buy, chọn từng loại hạt theo mùa & mua số lượng lớn nhất
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  let dangBan = false;
  const ngu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const BUY_BTN_ANY_RE = /\b(buy|mua|comprar|acheter|kaufen)\b/i;
  const BUY_ALL_SEEDS_RE = /buy\s+all\s+seeds?/i;
  const INSUFFICIENT_FUNDS_RE = /not\s+enough|insufficient\s+funds?|không\s+đủ|khong\s+du|need\s+more\s+coins?|too\s+expensive/i;

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
      pageX: cx + (view.scrollX || 0),
      pageY: cy + (view.scrollY || 0),
      which: 1,
      button: 0,
    };
    const downOpts = { ...baseOpts, buttons: 1 };
    const upOpts = { ...baseOpts, buttons: 0 };

    try { el.focus?.({ preventScroll: true }); } catch (_e) {}

    try {
      el.dispatchEvent(new MouseEvent("mousedown", downOpts));
      el.dispatchEvent(new MouseEvent("mouseup", upOpts));
      el.dispatchEvent(new MouseEvent("click", baseOpts));
      try { el.click?.(); } catch (_e4) {}
      kichHoatReactProps(el);
      if (el.parentElement) kichHoatReactProps(el.parentElement);
    } catch (_e) {}

    setTimeout(() => {
      try {
        if (typeof el.blur === "function") el.blur();
        el.dispatchEvent(new MouseEvent("mouseout", upOpts));
        el.dispatchEvent(new MouseEvent("mouseleave", upOpts));
      } catch (_e5) {}
    }, 40);

    return true;
  }

  function laNutCloseChuan(el) {
    if (!el || !xemPhanTuRanh(el)) return false;
    const src = (el.src || el.getAttribute?.("src") || "").toLowerCase();
    const alt = (el.alt || el.getAttribute?.("alt") || "").toLowerCase();

    const pText = (el.parentElement?.textContent || el.closest?.("div, button, [role='button']")?.textContent || "").toLowerCase();
    if (pText.includes("vip") || src.includes("vip")) return false;
    if (el.closest?.('[class*="vip"], [id*="vip"], [data-name*="vip"]')) return false;

    if (src.includes("compost") || src.includes("closed") || src.includes("building") || src.includes("island")) {
      return false;
    }
    const laAnhClose = src.includes("/ui/close") || src.includes("/icons/close") || src.includes("close.png") || src.includes("cancel.png") || alt === "close" || alt === "cancel";
    const laAriaClose = el.getAttribute?.("aria-label") === "close";
    const trongDialog = !!el.closest?.('[role="dialog"], [role="modal"], div[class*="modal"], .fixed.inset-0');
    return (laAnhClose || laAriaClose) && trongDialog;
  }

  async function dongHetTatCaPopup() {
    const taiLieu = layTaiLieuGame();
    for (let loop = 0; loop < 3; loop += 1) {
      let coPopupDong = false;
      for (const doc of taiLieu) {
        if (!doc || !doc.body) continue;
        const cacAnhClose = doc.querySelectorAll('img[src*="/ui/close"], img[src*="close.png"], img[src*="cancel.png"], button[aria-label="close"]');
        for (const img of cacAnhClose) {
          if (!laNutCloseChuan(img)) continue;
          const nut = img.closest("button, [role='button']") || img;
          clickTam(nut);
          coPopupDong = true;
          await ngu(250);
          break;
        }
      }
      if (!coPopupDong) break;
      await ngu(250);
    }
    try {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    } catch (_e) {}
    await ngu(200);
  }

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

        const clickable = img.closest(".cursor-pointer, [data-map-placement], [class*='cursor-pointer']") || img;
        if (clickable && xemPhanTuRanh(clickable)) return clickable;
      }
    }
    return null;
  }

  // Tìm dialog cửa hàng Betty (chuẩn theo v4)
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

  // Đảm bảo tab Buy
  async function damBaoTabBuy(dlg) {
    if (!dlg) return false;
    const txtModal = (dlg.textContent || "").toLowerCase();
    const coSellContent = /sell\s+\d+|sell\s+all|sell\s+max|you\s+have\s+no\s+crops|\bno\s+crops\b|\bno\s+harvest\b|bán\s+\d+|bán\s+tất\s*cả|không\s+có\s+cây/i.test(txtModal);
    const coBuyContent = /buy\s+\d+|buy\s+max|in\s+stock|mua\s+\d+|còn\s+hàng/i.test(txtModal);
    const dangBiOShopSell = coSellContent || (!coBuyContent && (txtModal.includes("sell") || txtModal.includes("bán")));
    if (!dangBiOShopSell) {
      return true;
    }

    console.log("[SFL Mua Hạt Giống] ⚠️ Modal đang ở tab Sell → Chuyển về tab Buy...");
    const rectModal = dlg.getBoundingClientRect();
    const cacTab = Array.from(dlg.querySelectorAll("div, button, [role='tab']"));
    for (const t of cacTab) {
      if (!xemPhanTuRanh(t)) continue;
      const tTxt = (t.textContent || "").trim().toLowerCase();
      // Tab "Buy" / "Mua" (xử lý cả tiếng Việt và các ngôn ngữ khác)
      if (tTxt === "buy" || tTxt === "mua" || tTxt === "comprar" || tTxt === "acheter" || tTxt === "kaufen") {
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

  function laySoLuongNutMua(btn) {
    if (!btn) return 0;
    const text = String(btn.textContent || "").trim();
    if (BUY_ALL_SEEDS_RE.test(text)) return -1;
    if (/max|tối\s*đa|máx|máximo|maximum/i.test(text)) return 999999;
    const match =
      text.match(/\b(buy|mua|comprar|acheter|kaufen|购买|收集|cumpăra)\s+(\d+)/i) ||
      text.match(/(\d+)\s*(?:x|×)?/);
    if (match && match[2] && /\d/.test(match[2])) return parseInt(match[2], 10);
    return 1;
  }

  function laNutMuaKhaDung(btn) {
    if (!btn || !xemPhanTuRanh(btn)) return false;
    if (btn.disabled || btn.getAttribute("disabled") !== null) return false;
    const tokens = String(btn.className || "").split(/\s+/).filter(Boolean);
    if (tokens.includes("cursor-not-allowed")) return false;
    if (tokens.includes("disabled")) return false;
    if (btn.getAttribute("aria-disabled") === "true") return false;
    return true;
  }

  // Xử lý popup xác nhận mua số lượng lớn
  async function xuLyPopupXacNhanMua() {
    for (let w = 0; w < 4; w += 1) {
      await ngu(200);
      for (const doc of layTaiLieuGame()) {
        const dialogs = Array.from(doc.querySelectorAll('[role="dialog"], div.relative, div[class*="bg-[#c28569]"], .sm\\:w-4\\/5'));
        for (const dlg of dialogs) {
          if (!xemPhanTuRanh(dlg)) continue;
          const txt = (dlg.textContent || "");
          const laXacNhanMua =
            (txt.includes("Are you sure you want to spend") && (txt.includes("to buy") || txt.includes("Coins"))) ||
            /bạn\s+có\s+chắc/i.test(txt) || /bạn\s+muốn\s+dùng/i.test(txt) || /xác\s+nhận.*mua/i.test(txt) ||
            /are\s+you\s+sure/i.test(txt) && /buy|mua|spend/i.test(txt);
          if (laXacNhanMua) {
            const buttons = Array.from(dlg.querySelectorAll("button, [role='button']"));
            for (const b of buttons) {
              if (!xemPhanTuRanh(b) || b.disabled) continue;
              const bTxt = (b.textContent || "").trim();
              if (/cancel|hủy|huy/i.test(bTxt)) continue;
              if (/^(buy|mua|comprar|acheter|kaufen|confirm|xác\s*nhận)\b/i.test(bTxt) || /mua/i.test(bTxt)) {
                console.log(`%c[SFL Mua Hạt Giống] 🌟 Bấm xác nhận mua: "${bTxt}"`, "color: #4caf50; font-weight: bold;");
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

  // Tìm nút mua lớn nhất trong panel chi tiết bên phải
  function timNutMuaLonNhat(dlg) {
    if (!dlg) return null;
    const rectModal = dlg.getBoundingClientRect();
    const midX = rectModal.left + rectModal.width * 0.45;

    const buttons = Array.from(dlg.querySelectorAll("button, [role='button'], div.cursor-pointer, [class*='cursor-pointer']"));
    const hopLe = [];

    for (const btn of buttons) {
      if (!laNutMuaKhaDung(btn)) continue;
      const rectB = btn.getBoundingClientRect();
      if (rectB.left < midX) continue;

      const tx = String(btn.textContent || "").replace(/\s+/g, " ").trim();
      if (!tx || tx.length > 25) continue;
      if (/restock|replenish|bổ\s*sung|hoàn\s*lại/i.test(tx)) continue;
      if (/buy\s+all|comprar\s+todos?|acheter\s+tout/i.test(tx)) continue;
      if (/vip/i.test(tx) || btn.querySelector('img[src*="vip"]')) continue;

      // Nút mua có thể hiển thị ngôn ngữ khác nhau (Buy / Mua / Comprar / Acheter / Kaufen / 购买 ...)
      if (
        /^\s*(buy|mua|comprar|acheter|kaufen|购买|收集|cumpăra)(\s|$)/i.test(tx) ||
        /^\s*(buy|mua|comprar|acheter|kaufen|购买|收集|cumpăra)\s+\d+/i.test(tx) ||
        /^\s*(buy|mua|comprar|acheter|kaufen|购买|收集|cumpăra)\s+max/i.test(tx)
      ) {
        hopLe.push(btn);
      }
    }

    if (hopLe.length === 0) return null;
    hopLe.sort((a, b) => laySoLuongNutMua(b) - laySoLuongNutMua(a));
    return hopLe[0];
  }

  // ═══════ QUY TRÌNH MUA HẠT GIỐNG QUA GAME BRIDGE (SIÊU TỐC KHÔNG DÙNG DOM) ═══════
  // CHỈ CHẠY 1 LẦN DUY NHẤT Ở VÒNG 1, TỪ VÒNG 2 BỎ QUA CHO ĐẾN KHI TẢI LẠI TRANG
  async function tickSeedsBuy(force = false) {
    if (dangBan) return false;

    // 0. KIỂM TRA SỐ DƯ TIỀN TỆ: NẾU < 0.01 XU THÌ BỎ QUA LUỒNG MUA HẠT (Sunflower Seed = 0.01)
    const currentCoins = Number(
      S.gameState?.coins ??
      S.gameState?.user?.coins ??
      S.gameState?.balance ??
      S.gameState?.user?.balanceSFL ??
      S.userData?.coins ??
      0
    );
    if (currentCoins < 0.01) {
      console.log(`%c[SFL Mua Hạt Giống] 💰 Số dư hiện tại (${currentCoins.toFixed(3)} xu < 0.01 xu) -> Bỏ qua luồng mua hạt giống để tiết kiệm tiền.`, "color: #ff9800; font-weight: bold;");
      return false;
    }

    if (S.__daMuaHatGiongVongDau && !force) {
      console.log("%c[SFL Mua Hạt Giống] ℹ️ Luồng mua hạt giống đã hoàn thành ở vòng 1 -> Bỏ qua từ vòng 2 cho đến khi tải lại trang.", "color: #9e9e9e;");
      return false;
    }

    if (typeof S.xinKhoa === "function" && !S.xinKhoa("seeds_buy")) {
      return false;
    }
    dangBan = true;
    S.__daMuaHatGiongVongDau = true;

    try {
      if (typeof S.isFlowBlocked === "function" && S.isFlowBlocked("seeds_buy")) {
        return false;
      }

      console.log("%c[SFL Mua Hạt Giống] 🌻 Bắt đầu luồng mua hạt giống tự động qua Game Bridge (không dùng DOM)...", "color: #ff9800; font-weight: bold; font-size: 13px;");

      // ── 1. ƯU TIÊN 100% GAME BRIDGE (MUA TOÀN BỘ CROPS + FRUITS + FLOWERS + GREENHOUSE TỪ RẺ ĐẾN ĐẮT) ──
      if (typeof S.buySeasonalSeedsBridge === "function") {
        const res = await S.buySeasonalSeedsBridge(null, 5000);
        if (res && res.ok) {
          const list = res.boughtList || res.bought || [];
          if (list.length > 0) {
            console.log(
              `%c[SFL Mua Hạt Giống] 🎉 ĐÃ MUA THÀNH CÔNG ${list.length} LOẠI HẠT GIỐNG ĐÚNG MÙA QUA GAME BRIDGE! (Đã chi: ${res.totalCoinsSpent.toLocaleString()} Coins | Còn lại: ${res.remainingCoins?.toLocaleString()} Coins)`,
              "color: #00e676; font-weight: bold; font-size: 14px;"
            );
            console.table(
              list.map((b) => ({
                "Hạt Giống": b.seed,
                "Phân Loại": b.type ? b.type.toUpperCase() : (b.category || "CROP"),
                "Số Lượng": `+${b.amount}`,
                "Đơn Giá": `${b.unitPrice} Coins`,
                "Tổng Chi": `${b.totalCost.toLocaleString()} Coins`,
              }))
            );
          } else {
            console.log(
              "%c[SFL Mua Hạt Giống] ℹ️ Kho hạt giống đã đầy (≥ 400 hạt) hoặc cửa hàng Betty đã hết lượt bán trong đợt này.",
              "color: #4caf50; font-weight: bold;"
            );
          }
          return true;
        }
      }

      // ── 2. FALLBACK DOM NẾU BRIDGE CHƯA KẾT NỐI ──
      // Kiểm tra xem trong kho đã đủ hạt giống chưa, nếu > 30 hạt và không force thì không cần mở popup Betty liên tục
      const inv = S.gameState?.inventory || S.userData?.inventory || {};
      let tongHatDatRuong = 0;
      for (const [k, v] of Object.entries(inv)) {
        if (k.endsWith(" Seed")) tongHatDatRuong += Number(v || 0);
      }
      if (!force && tongHatDatRuong >= 30 && S.__cooldownSeedsBuyDOM && Date.now() < S.__cooldownSeedsBuyDOM) {
        console.log(`[SFL Mua Hạt Giống] ℹ️ Kho đồ còn ${tongHatDatRuong} hạt giống (đủ dùng) -> Bỏ qua mở popup.`);
        return false;
      }

      console.log("[SFL Mua Hạt Giống] ⚠️ Game Bridge chưa sẵn sàng, chuyển sang Fallback DOM...");
      let modalInfo = timModalBetty();
      if (!modalInfo) {
        const shop = timCuaHangBetty();
        if (!shop) {
          console.log("[SFL Mua Hạt Giống] ⚠️ Không tìm thấy cửa hàng Betty trên đảo");
          return false;
        }
        console.log("[SFL Mua Hạt Giống] 🏪 Mở cửa hàng hạt giống Betty...");
        clickTam(shop);
        for (let i = 0; i < 12; i += 1) {
          await ngu(300);
          modalInfo = timModalBetty();
          if (modalInfo) break;
        }
      }

      if (!modalInfo) {
        console.log("[SFL Mua Hạt Giống] ⚠️ Mở cửa hàng Betty thất bại, bỏ qua luồng hạt giống");
        await dongHetTatCaPopup();
        return false;
      }

      const { dlg } = modalInfo;
      await damBaoTabBuy(dlg);
      await ngu(400);

      // Mua các ô hạt giống theo mùa
      let soLoaiDaMua = 0;
      const daXuLySet = new Set();

      for (let round = 0; round < 15; round += 1) {
        const modalHienTai = timModalBetty();
        if (!modalHienTai) break;

        const dlgNow = modalHienTai.dlg;
        if (INSUFFICIENT_FUNDS_RE.test(String(dlgNow.textContent || ""))) {
          console.log("[SFL Mua Hạt Giống] 💰 Không đủ xu để mua tiếp hạt giống.");
          break;
        }

        await damBaoTabBuy(dlgNow);

        const rectModal = dlgNow.getBoundingClientRect();
        const midX = rectModal.left + rectModal.width * 0.52;
        const tabYBoundary = rectModal.top + 65;

        let tatCaSlots = Array.from(dlgNow.querySelectorAll(".bg-brown-600"));
        if (tatCaSlots.length === 0) {
          tatCaSlots = Array.from(dlgNow.querySelectorAll("div.cursor-pointer, [class*='cursor-pointer']"));
        }

        const slotsKhaDung = [];
        for (const s of tatCaSlots) {
          if (!xemPhanTuRanh(s) || daXuLySet.has(s) || (s.className || "").includes("cursor-not-allowed")) continue;
          const rectS = s.getBoundingClientRect();
          if (rectS.top < tabYBoundary) continue;
          if (rectS.left + rectS.width / 2 > midX) continue;
          const txt = (s.textContent || "").trim().toLowerCase();
          if (txt === "sell" || txt === "buy" || txt === "guide" || txt.startsWith("sell") || txt.startsWith("guide")) continue;

          // BỎ QUA Ô ĐÒI HỎI VIP HOẶC CÓ ICON VIP
          if (txt.includes("vip") || s.querySelector('img[src*="vip"]')) continue;
          slotsKhaDung.push(s);
        }

        if (slotsKhaDung.length === 0) {
          console.log("[SFL Mua Hạt Giống] ✔️ Đã duyệt qua tất cả các loại hạt giống khả dụng!");
          break;
        }

        const oChon = slotsKhaDung[0];
        daXuLySet.add(oChon);

        console.log(`[SFL Mua Hạt Giống] 🌾 Chọn ô hạt giống số ${daXuLySet.size}...`);
        clickTam(oChon);
        await ngu(500);

        const nutMua = timNutMuaLonNhat(dlgNow);
        if (nutMua) {
          const tenNut = nutMua.textContent.trim();
          console.log(`%c[SFL Mua Hạt Giống] 🛒 Bấm nút: "${tenNut}"`, "color: #4caf50; font-weight: bold;");
          clickTam(nutMua);
          await ngu(800);
          await xuLyPopupXacNhanMua();
          soLoaiDaMua += 1;
        } else {
          console.log("[SFL Mua Hạt Giống] ℹ️ Loại hạt này đã hết hàng trong shop hoặc chưa đủ level/coins.");
        }

        await ngu(400);
      }

      console.log(`%c[SFL Mua Hạt Giống] ✔️ Hoàn tất phiên mua hạt giống (Đã mua ${soLoaiDaMua} loại hạt)!`, "color: #00e676; font-weight: bold; font-size: 13px;");
      S.__cooldownSeedsBuyDOM = Date.now() + 60000;
      await dongHetTatCaPopup();
      return soLoaiDaMua > 0;
    } catch (err) {
      console.error("[SFL Mua Hạt Giống] Lỗi:", err);
      return false;
    } finally {
      await dongHetTatCaPopup();
      dangBan = false;
      if (typeof S.nhaKhoa === "function") {
        S.nhaKhoa("seeds_buy");
      }
    }
  }

  S.tickSeedsBuy = tickSeedsBuy;

})(window.SFL = window.SFL || {});
