(function (S) {
  "use strict";
  /**
   * Luồng ủ phân (Composter):
   * Hỗ trợ 3 loại Composter: Basic Composter (Compost Bin), Turbo Composter, Premium Composter.
   * Logic:
   * 1. Tìm tất cả các composter trên đảo (ảnh composter_basic, composter_turbo, composter_premium...).
   * 2. Nếu composter đang chín (ready to collect, vd ảnh composter_*_ready.webp):
   *    - Click mở composter -> tìm nút "Collect" -> click thu hoạch -> đóng modal.
   * 3. Nếu composter đang trống (rảnh, chưa ủ):
   *    - Click mở composter -> tìm nút "Compost".
   *    - Kiểm tra nút "Compost" có khả dụng (!disabled) không.
   *    - Nếu đủ điều kiện (nút Compost bấm được) -> click "Compost" -> đóng modal.
   *    - Nếu không đủ điều kiện (nút Compost disabled) -> đóng modal (X / ESC).
   */
  const runtime = S.runtime;
  const d = S.dom;
  const logFlow = S.time.logFlow;
  const nowMs = S.time.now;
  const sleep = S.time.sleep;
  const uiJitter = S.time.uiJitter;

  const COMPOST_CHECK_FAST_MS = 60 * 1000; // 1 phút nếu vừa thao tác
  const COMPOST_WORKING_POLL_MS = 3 * 60 * 1000; // 3 phút nếu tất cả đang ủ dở
  const COMPOST_NO_RES_POLL_MS = 10 * 60 * 1000; // 10 phút nếu thiếu nguyên liệu
  const COMPOST_IDLE_POLL_MS = 2 * 60 * 1000; // 2 phút mặc định

  const COMPOSTER_IMG_SELECTORS = [
    'img[src*="composter_basic"]',
    'img[src*="composter_turbo"]',
    'img[src*="composter_premium"]',
    'img[src*="composters/composter"]',
    'img[src*="compost_bin"]',
  ].join(", ");

  /** Lấy root clickable của composter từ phần tử bên trong */
  function getComposterRoot(el) {
    if (!el) return null;
    let n = el;
    for (let i = 0; i < 22 && n; i++) {
      if (n.classList?.contains("cursor-pointer")) {
        return n;
      }
      n = n.parentElement;
    }
    return null;
  }

  /**
   * Phát hiện trạng thái composter trực tiếp trên DOM đảo (không cần mở modal):
   * - "working": Đang ủ dở (có ảnh _closed, empty_bar progress, hoặc timer text như 5h) → BỎ QUA KHÔNG CLICK!
   * - "ready": Đã chín phân (có ảnh _ready) → Click để bấm Collect.
   * - "idle": Đang trống/rảnh → Click mở modal để ủ mới.
   */
  function getComposterStateOnIsland(root) {
    if (!root) return "unknown";

    // 1. Đang ủ dở (closed / composting / progress empty_bar / font-pixel timer)
    const hasClosedImg = !!root.querySelector('img[src*="closed"], img[src*="composting"]');
    const hasEmptyBar = !!root.querySelector('img[src*="empty_bar"], img[src*="progress"]');
    const hasTimerText = !!root.querySelector('span.font-pixel');

    if (hasClosedImg || hasEmptyBar || hasTimerText) {
      return "working";
    }

    // 2. Phân đã chín (ready)
    const hasReadyImg = !!root.querySelector('img[src*="ready"]');
    if (hasReadyImg) {
      return "ready";
    }

    // 3. Trống / rảnh
    return "idle";
  }

  /** Gom tất cả các composter root trên DOM */
  function collectAllComposterRoots() {
    const docs = d.collectDocumentsForGameDom();
    const roots = new Set();
    for (const doc of docs) {
      let imgs;
      try {
        imgs = doc.querySelectorAll(COMPOSTER_IMG_SELECTORS);
      } catch (_e) {
        continue;
      }
      for (const img of imgs) {
        if (!d.isVisible(img)) continue;
        const root = getComposterRoot(img);
        if (root && d.isVisible(root)) {
          roots.add(root);
        }
      }
    }
    return Array.from(roots);
  }

  /** Đóng dialog composter nếu đang mở */
  async function closeComposterDialog(doc) {
    const dialogs = doc.querySelectorAll('[role="dialog"]');
    for (const dlg of dialogs) {
      if (!d.isVisible(dlg)) continue;
      const closeImg = dlg.querySelector('img[src*="close.png"], img[aria-label="close"], .close-btn');
      if (closeImg && d.isVisible(closeImg)) {
        d.nativeClickClose(closeImg) || d.click(closeImg);
        await sleep(300);
        return true;
      }
    }
    d.sendEscapeToGameWindows();
    await sleep(250);
    return true;
  }

  /** Tìm dialog composter đang mở */
  function findOpenComposterDialog() {
    const docs = d.collectDocumentsForGameDom();
    for (const doc of docs) {
      const dialogs = doc.querySelectorAll('[role="dialog"]');
      for (const dlg of dialogs) {
        if (!d.isVisible(dlg)) continue;
        const text = String(dlg.textContent || "").toLowerCase();
        if (text.includes("composter") || text.includes("compost complete") || text.includes("compost")) {
          return { dlg, doc };
        }
      }
    }
    return null;
  }

  /** Thử xử lý 1 composter root (chỉ mở modal khi rảnh hoặc chín) */
  async function processOneComposter(root) {
    logFlow("Ủ phân (Compost): Click mở composter", {});
    d.nativeClickClose(root) || d.clickAtCenter(root) || d.click(root);
    await uiJitter();
    await sleep(400);

    let dlgInfo = findOpenComposterDialog();
    if (!dlgInfo) {
      await sleep(400);
      dlgInfo = findOpenComposterDialog();
    }

    if (!dlgInfo) {
      logFlow("Ủ phân (Compost): Không thấy dialog composter sau khi click", {});
      return false;
    }

    const { dlg, doc } = dlgInfo;

    const buttons = Array.from(dlg.querySelectorAll("button, [role='button']"));
    const collectBtn = buttons.find(b => {
      if (!d.isVisible(b)) return false;
      const t = String(b.textContent || "").trim().toLowerCase();
      return t === "collect" || t.includes("collect") || t === "thu hoạch";
    });

    if (collectBtn) {
      logFlow("Ủ phân (Compost): Bấm Collect thu hoạch phân", {});
      d.nativeClickClose(collectBtn) || d.click(collectBtn);
      await uiJitter();
      await sleep(500);
      await closeComposterDialog(doc);
      return "harvested";
    }

    const compostBtn = buttons.find(b => {
      if (!d.isVisible(b)) return false;
      const t = String(b.textContent || "").trim().toLowerCase();
      return t === "compost" || t.includes("compost") || t === "ủ phân";
    });

    if (compostBtn) {
      const isDisabled = compostBtn.disabled || 
        compostBtn.classList.contains("disabled") || 
        compostBtn.classList.contains("cursor-not-allowed") ||
        compostBtn.getAttribute("disabled") !== null;

      if (!isDisabled) {
        logFlow("Ủ phân (Compost): Bấm Compost để bắt đầu ủ phân mới", {});
        d.nativeClickClose(compostBtn) || d.click(compostBtn);
        await uiJitter();
        await sleep(500);
        await closeComposterDialog(doc);
        return "started";
      } else {
        logFlow("Ủ phân (Compost): Không đủ nguyên liệu ủ (nút Compost bị khóa)", {});
        await closeComposterDialog(doc);
        return "no_resources";
      }
    }

    logFlow("Ủ phân (Compost): Composter đang trong quá trình ủ", {});
    await closeComposterDialog(doc);
    return "composting";
  }

  async function runCompostCycle() {
    if (!runtime.settings.autoCompost) return false;

    const t = nowMs();
    let acted = false;
    let anyWorking = false;
    let anyNoResources = false;

    const roots = collectAllComposterRoots();
    if (roots.length === 0) {
      runtime.nextCompostFlowAt = t + COMPOST_IDLE_POLL_MS;
      runtime.compostFlowState = "Không thấy thùng ủ phân";
      return false;
    }

    for (const root of roots) {
      const stateOnIsland = getComposterStateOnIsland(root);

      if (stateOnIsland === "working") {
        logFlow("Ủ phân: Thùng ủ đang ủ dở (thấy thanh tiến trình/timer) — bỏ qua không click", {});
        anyWorking = true;
        continue;
      }

      if (stateOnIsland === "ready") {
        logFlow("Ủ phân: Thùng ủ chín — mở modal thu hoạch", {});
      } else if (stateOnIsland === "idle") {
        logFlow("Ủ phân: Thùng ủ trống — mở modal ủ phân mới", {});
      }

      const res = await processOneComposter(root);
      if (res === "started" || res === "harvested") {
        acted = true;
        await sleep(600);
      } else if (res === "composting") {
        anyWorking = true;
      } else if (res === "no_resources") {
        anyNoResources = true;
      }
    }

    if (acted) {
      runtime.nextCompostFlowAt = t + COMPOST_CHECK_FAST_MS;
      runtime.compostFlowState = "Vừa xử lý ủ phân";
      runtime.compostFlowStartedAt = t;
    } else if (anyWorking) {
      runtime.nextCompostFlowAt = t + COMPOST_WORKING_POLL_MS;
      runtime.compostFlowState = "Đang ủ dở (bỏ qua quét DOM)";
    } else if (anyNoResources) {
      runtime.nextCompostFlowAt = t + COMPOST_NO_RES_REST_MS;
      runtime.compostFlowState = "Thiếu nông sản ủ phân (nghỉ 10p)";
    } else {
      runtime.nextCompostFlowAt = t + COMPOST_IDLE_POLL_MS;
      runtime.compostFlowState = "Sẵn sàng";
    }

    return acted;
  }

  S.compost = {
    runCompostCycle,
  };
})(window.SFL);
