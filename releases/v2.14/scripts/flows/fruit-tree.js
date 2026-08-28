(function (S) {
  "use strict";
  /**
   * Luồng Cây ăn quả: Thu hoạch -> Chặt cây già -> Trồng mới.
   * Sử dụng dữ liệu từ Bridge để tính toán thời gian nghỉ thông minh.
   */
  const runtime = S.runtime;
  const d = S.dom;
  const logFlow = S.time.logFlow;
  const nowMs = S.time.now;
  const sleep = S.time.sleep;
  const rand = S.time.rand;
  const uiJitter = S.time.uiJitter;

  const FRUIT_FLOW_PROBE_MS = 60 * 1000; // 1 phút
  const FRUIT_FLOW_READY_GAP_MS = 1500;

  const SAPLING_NAMES = [
    "Apple Seed",
    "Apple Sapling",
    "Orange Seed",
    "Orange Sapling",
    "Blueberry Seed",
    "Blueberry Seeds",
    "Lemon Seed",
    "Lemon Sapling",
    "Pear Seed",
    "Pear Sapling",
    "Plum Seed",
    "Plum Sapling",
    "Grape Seed",
    "Grape Sapling",
    "Banana Seed",
    "Banana Sapling",
    "Banana Plant",
  ];

  function imgAssetUrl(img) {
    const srcset = String(img?.getAttribute?.("srcset") || "")
      .split(",")[0]
      .trim()
      .split(/\s+/)[0];
    return String(img?.currentSrc || img?.getAttribute?.("src") || srcset || "").toLowerCase();
  }

  /**
   * Tên hạt cây ăn quả → slug CDN.
   * Ví dụ: "Apple Seed" → "apple", "Blueberry Seeds" → "blueberry", "Banana Plant" → "banana"
   */
  function fruitSeedNameToSlug(name) {
    return String(name || "")
      .replace(/\s+(seed|seeds|sapling|plant)$/i, "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  /**
   * Kiểm tra URL ảnh có khớp với fruit seed slug không.
   * SFL CDN: /game-assets/fruit/apple/seed.webp hoặc /fruit/apple/seed.png
   */
  function imgUrlMatchesFruitSeedSlug(u, slug) {
    const s = String(u || "").toLowerCase();
    const sl = String(slug || "").toLowerCase();
    if (!sl || s.startsWith("data:")) return false;
    if (!s.includes("/fruit/")) return false;
    if (!s.includes(`/${sl}/`) && !s.includes(`/${sl}.`)) return false;
    return /\/seed\.(png|webp)(?:\?|$)/i.test(s) || /\/sapling\.(png|webp)(?:\?|$)/i.test(s);
  }

  /**
   * Tìm ảnh hạt cây ăn quả trong inventory strip.
   * Fruit seeds có URL /fruit/<name>/seed.webp — khác với crop seeds (/crops/<name>/seed.webp).
   * Hàm ensureSeedSelectedDom của crop-dom KHÔNG tìm được loại này.
   */
  function findFruitSeedImgInInventory(slug) {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let imgs;
      try {
        imgs = docs[di].querySelectorAll("img[src], img[srcset]");
      } catch (_e) {
        continue;
      }
      for (let ii = 0; ii < imgs.length; ii += 1) {
        const img = imgs[ii];
        const u = imgAssetUrl(img);
        if (!imgUrlMatchesFruitSeedSlug(u, slug)) continue;
        if (!d.isVisible(img)) continue;
        return img;
      }
    }
    // Fallback: tìm theo alt text hoặc text content gần ảnh (SFL đôi khi dùng crop art)
    for (let di = 0; di < docs.length; di += 1) {
      let imgs;
      try {
        imgs = docs[di].querySelectorAll('img[src*="/fruit/"], img[srcset*="/fruit/"]');
      } catch (_e) {
        continue;
      }
      for (let ii = 0; ii < imgs.length; ii += 1) {
        const img = imgs[ii];
        if (!d.isVisible(img)) continue;
        const u = imgAssetUrl(img);
        if (!u.includes(`/${slug}/`) && !u.includes(`/${slug}.`)) continue;
        return img;
      }
    }
    return null;
  }

  /**
   * Chọn hạt cây ăn quả từ inventory strip (tương tự ensureSeedSelectedDom nhưng cho /fruit/ URL).
   * Trả về true nếu chọn được, false nếu không tìm thấy hạt trong inventory UI.
   */
  async function ensureFruitSeedSelectedDom(seedName) {
    const slug = fruitSeedNameToSlug(seedName);

    // Kiểm tra inventory có đang mở chưa, nếu chưa thì mở
    const isStripVisible = () => {
      const cDom = S.cropDom;
      if (typeof cDom?.isInventorySeedStripVisible === "function") {
        return cDom.isInventorySeedStripVisible();
      }
      // Fallback: tìm img fruit trong strip
      const docs = d.collectDocumentsForGameDom();
      for (let di = 0; di < docs.length; di += 1) {
        try {
          const rows = docs[di].querySelectorAll("div.flex.flex-wrap");
          for (let ri = 0; ri < rows.length; ri += 1) {
            const row = rows[ri];
            if (!d.isVisible(row)) continue;
            if (row.querySelector('img[src*="/fruit/"], img[src*="/crops/"]')) return true;
          }
        } catch (_e) { }
      }
      return false;
    };

    // Mở inventory nếu chưa mở
    if (!isStripVisible()) {
      // Dùng findBasketButtonClickTarget từ cropDom nếu có
      let basketEl = null;
      if (typeof S.cropDom?.findBasketButtonClickTarget === "function") {
        basketEl = S.cropDom.findBasketButtonClickTarget();
      }
      if (!basketEl) {
        // Fallback: tìm nút giỏ theo ảnh
        const docs = d.collectDocumentsForGameDom();
        for (let di = 0; di < docs.length && !basketEl; di += 1) {
          try {
            const imgs = docs[di].querySelectorAll('img[src*="basket"], img[src*="backpack"], img[src*="bag"]');
            for (let ii = 0; ii < imgs.length; ii += 1) {
              const img = imgs[ii];
              if (!d.isVisible(img)) continue;
              let el = img.parentElement;
              for (let depth = 0; depth < 10 && el; depth += 1) {
                if (el.classList?.contains("cursor-pointer")) { basketEl = el; break; }
                el = el.parentElement;
              }
              if (basketEl) break;
            }
          } catch (_e) { }
        }
      }
      if (basketEl) {
        d.nativeClickClose(basketEl) || d.click(basketEl);
        for (let wait = 0; wait < 15; wait += 1) {
          await sleep(200);
          if (isStripVisible()) break;
        }
        await sleep(rand(200, 400));
      } else {
        logFlow("Cây ăn quả: không tìm thấy nút giỏ đồ để mở inventory", { seedName });
        return false;
      }
    }

    // Tìm ảnh hạt fruit trong inventory
    let targetImg = findFruitSeedImgInInventory(slug);
    if (!targetImg) {
      await sleep(rand(300, 500));
      targetImg = findFruitSeedImgInInventory(slug);
    }

    if (!targetImg) {
      logFlow("Cây ăn quả: không tìm thấy hạt trong giỏ đồ", { seedName, slug });
      // Đóng inventory
      if (typeof S.cropDom?.closeInventorySeedStripIfOpen === "function") {
        await S.cropDom.closeInventorySeedStripIfOpen();
      }
      return false;
    }

    // Click vào ô hạt
    let clickEl = targetImg;
    let el = targetImg.parentElement;
    for (let depth = 0; depth < 16 && el; depth += 1) {
      if (el.classList?.contains("cursor-pointer") && !el.classList?.contains("cursor-not-allowed")) {
        clickEl = el;
        break;
      }
      el = el.parentElement;
    }
    d.doubleClickAtCenter(clickEl) || d.doubleClick(clickEl) || d.clickAtCenter(clickEl);
    await sleep(rand(300, 500));

    logFlow("Cây ăn quả: đã chọn hạt giống từ inventory", { seedName, slug });

    // Đóng inventory
    if (typeof S.cropDom?.closeInventorySeedStripIfOpen === "function") {
      await S.cropDom.closeInventorySeedStripIfOpen();
    } else {
      // ESC fallback
      const docs = d.collectDocumentsForGameDom();
      for (let di = 0; di < docs.length; di += 1) {
        try {
          docs[di].documentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
        } catch (_e) { }
      }
      await sleep(rand(200, 350));
    }
    return true;
  }

  function isFruitPatchEmpty(root) {
    if (!root) return false;
    const imgs = Array.from(root.querySelectorAll('img'));
    if (imgs.length === 0) return true;
    for (const img of imgs) {
      const src = imgAssetUrl(img);
      const isBg = src.includes("fruit_patch") || src.includes("fruit-patch") || src.includes("fruitpatch");
      const isSoil = src.includes("soil") || src.includes("sand_dug");
      if (!isBg && !isSoil) return false;
    }
    return true;
  }

  let lastNoAxeLogAt = 0;

  function getAxeCount() {
    if (!S.gameBridge?.isReady) return 999;
    const st = S.gameBridge.getLatestState();
    if (!st) return 999;
    const inv = st.inventory || {};
    const axe = inv["Axe"];
    if (typeof axe === "number" && Number.isFinite(axe)) return Math.max(0, Math.floor(axe));
    return Math.max(0, Math.floor(Number(axe) || 0));
  }

  /** Lấy root của fruit patch từ một phần tử bên trong. */
  function getFruitPatchRoot(el) {
    if (!el) return null;
    let n = el;
    for (let i = 0; i < 28 && n; i += 1) {
      if (n.classList?.contains("cursor-pointer") && (n.classList?.contains("hover:img-highlight") || n.classList?.contains("group-hover:img-highlight"))) {
        return n;
      }
      n = n.parentElement;
    }
    // Fallback: Nếu el là ảnh nền fruit_patch nằm ngoài div clickable (sibling)
    let p = el.parentElement;
    for (let i = 0; i < 5 && p; i += 1) {
      const click = p.querySelector('.cursor-pointer.hover\\:img-highlight, .cursor-pointer.group-hover\\:img-highlight');
      if (click) return click;
      p = p.parentElement;
    }
    return null;
  }

  /** Tìm tọa độ DOM gần đúng cho một patch ID từ Bridge. */
  function findDomByPatchId(patchId) {
    const docs = d.collectDocumentsForGameDom();
    // Đây là một kỹ thuật tìm kiếm mờ dựa trên vị trí tương đối hoặc class
    // Thực tế trong SFL, ID thường không có trong DOM trực tiếp.
    // Chúng ta sẽ fallback sang tìm theo hình ảnh "fruit_patch" hoặc ảnh quả.
    return null; 
  }

  function getBestSaplingFromInventory(inventory) {
    if (!inventory) return null;
    
    // Lấy tồn kho (stock) hiện tại từ game để biết hạt nào đang trong mùa và cấp độ tài khoản
    let stock = null;
    let bumpkinLevel = 1; // Mặc định là 1 (an toàn nhất) nếu bridge chưa sẵn sàng
    let seasonKey = "spring";
    if (S.gameBridge?.isReady) {
      const st = S.gameBridge.getLatestState();
      if (st) {
        if (st.stock) stock = st.stock;
        const xp = st.bumpkinExperience || 0;
        if (typeof S.getBumpkinLevel === "function") {
          bumpkinLevel = S.getBumpkinLevel(xp);
        }
        if (st.season) {
          const s = String(st.season).toLowerCase();
          if (s.includes("spring")) seasonKey = "spring";
          else if (s.includes("summer")) seasonKey = "summer";
          else if (s.includes("autumn") || s.includes("fall")) seasonKey = "autumn";
          else if (s.includes("winter")) seasonKey = "winter";
        }
      }
    }

    // Thứ tự ưu tiên theo danh sách SAPLING_NAMES
    for (const name of SAPLING_NAMES) {
      if ((inventory[name] || 0) >= 1) {
        // Chỉ gieo trồng nếu hạt giống này có bán trong shop hiện tại (tức là đúng mùa)
        if (stock && stock[name] === undefined) {
          continue;
        }
        // Kiểm tra đúng mùa từ cấu hình SEASONAL_FRUIT_SEEDS
        if (S.SEASONAL_FRUIT_SEEDS) {
          const allowed = S.SEASONAL_FRUIT_SEEDS[seasonKey] || [];
          if (!allowed.includes(name)) {
            continue; // Bỏ qua nếu trái mùa
          }
        }
        // Kiểm tra yêu cầu cấp độ của hạt
        if (S.SEED_LEVEL_REQUIREMENTS) {
          const reqLevel = S.SEED_LEVEL_REQUIREMENTS[name];
          if (reqLevel && bumpkinLevel < reqLevel) {
            continue; // Bỏ qua nếu cấp độ tài khoản chưa đủ
          }
        }
        return name;
      }
    }
    return null;
  }

  function computeFruitRestSchedule(state, t) {
    const patches = state?.fruitPatches;
    if (!Array.isArray(patches) || patches.length === 0) {
      return { nextAt: t + 5 * 60 * 1000, reason: "Không thấy ô quả" };
    }

    let minReadyAt = Infinity;
    let hasReady = false;
    let hasStump = false;
    let hasEmpty = false;

    for (const p of patches) {
      if (!p.fruit) {
        hasEmpty = true;
        continue;
      }
      
      const harvestsLeft = Number(p.fruit.harvestsLeft || 0);
      if (harvestsLeft <= 0) {
        hasStump = true;
        continue;
      }

      // SFL Fruit readyAt không có trực tiếp trong bridge state này (chỉ có harvestedAt)
      // Tạm thời nếu harvestedAt > 0, chúng ta coi là đang chờ. 
      // Thực tế ta sẽ phụ thuộc vào việc quét DOM để thấy thanh tiến trình đầy.
      hasReady = true; // Fallback cho phép quét DOM
    }

    if (hasReady || hasStump || (hasEmpty && getBestSaplingFromInventory(state.inventory))) {
      return { nextAt: t, reason: "Có việc cần làm", ready: true };
    }

    return { nextAt: t + FRUIT_FLOW_PROBE_MS, reason: "Chờ quả chín" };
  }

  function collectAllFruitPatchRoots() {
    const docs = d.collectDocumentsForGameDom();
    const roots = new Set();
    for (const doc of docs) {
      // Tìm tất cả các loại ảnh quả, gốc cây, và nền fruit_patch
      const imgs = doc.querySelectorAll('img[src*="fruit_patch"], img[src*="/fruit/"], img[src*="fruit_"], img[src*="fruit/"]');
      for (const img of imgs) {
        const root = getFruitPatchRoot(img);
        if (root && d.isVisible(root)) {
          roots.add(root);
        }
      }
    }
    return Array.from(roots);
  }

  async function tryHarvestFruit() {
    const roots = collectAllFruitPatchRoots();
    for (const root of roots) {
      // 1. Check if it's growing (has empty_bar.png)
      const hasProgressBar = !!root.querySelector('img[src*="empty_bar"]');
      if (hasProgressBar) continue;

      // 2. Check if it's dead (requires axe)
      let isDead = false;
      const deadImgs = root.querySelectorAll(FRUIT_DEAD_TREE_IMG_SELECTOR);
      if (deadImgs.length > 0) isDead = true;
      if (!isDead) {
        const imgs = root.querySelectorAll('img[src]');
        for (const img of imgs) {
          if (isFruitDeadTreeViaFiber(img)) {
            isDead = true;
            break;
          }
        }
      }
      if (isDead) continue;

      // 3. Check if it's empty
      if (isFruitPatchEmpty(root)) continue;

      // If all checks pass, it is ripe and ready to harvest!
      logFlow("Cây ăn quả: phát hiện quả chín sẵn sàng thu hoạch", {});
      d.clickAtCenter(root) || d.click(root);
      await uiJitter();
      return true;
    }
    return false;
  }

  /**
   * Selector ảnh cho cây ăn quả hết lượt (cần chặt bằng rìu):
   * - Cây to hết lượt (Dead stage): dead_tree, old_tree, dead.png, withered, dry_tree
   * - Cây bụi hết lượt (Dead bush): stump, dead_bush
   * SFL CDN thường có path dạng: assets/fruit/{name}/dead.webp hoặc assets/fruit/{name}/dead_tree.png
   */
  const FRUIT_DEAD_TREE_IMG_SELECTOR = [
    'img[src*="dead"]',
    'img[src*="stump"]',
    'img[src*="old_tree"]',
    'img[src*="dead_tree"]',
    'img[src*="withered"]',
    'img[src*="dry_tree"]',
    'img[src*="dead_bush"]',
    'img[src*="bush_shrub"]',
  ].join(", ");

  /** Kiểm tra xem một phần tử DOM có phải là DeadTree component qua React Fiber không. */
  function isFruitDeadTreeViaFiber(el) {
    if (!el) return false;
    try {
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
      if (!fiberKey) return false;
      let f = el[fiberKey];
      for (let depth = 0; depth < 40 && f; depth += 1) {
        const name = String(f?.elementType?.displayName || f?.elementType?.name || f?.type?.displayName || f?.type?.name || "");
        if (/DeadTree|dead_tree|FruitStump/i.test(name)) return true;
        // Kiểm tra props patchFruitName kết hợp harvestsLeft = 0
        const props = f.memoizedProps || f.pendingProps;
        if (props && typeof props === "object") {
          if (props.patchFruitName && (props.hasAxes === true || props.hasAxes === false)) return true;
        }
        f = f.return;
      }
    } catch (_e) {
      // ignore
    }
    return false;
  }

  async function tryClearStump() {
    if (getAxeCount() <= 0) {
      const t = nowMs();
      if (t - lastNoAxeLogAt > 30000) {
        lastNoAxeLogAt = t;
        logFlow("Cây ăn quả: phát hiện gốc cần chặt nhưng không còn Rìu trong kho (Axe = 0) — bỏ qua", {});
      }
      return false;
    }
    const docs = d.collectDocumentsForGameDom();
    for (const doc of docs) {
      // Selector mở rộng: nhận cả cây to chết (dead) lẫn gốc khô (stump)
      let imgs;
      try {
        imgs = doc.querySelectorAll(FRUIT_DEAD_TREE_IMG_SELECTOR);
      } catch (_e) {
        continue;
      }
      for (const img of imgs) {
        const src = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
        // Bỏ qua nếu src không liên quan đến fruit (tránh nhầm với crop/rock)
        if (!src.includes("/fruit/") && !src.includes("fruit_") && !src.includes("fruit/")) {
          // Fallback: kiểm tra qua Fiber xem có phải DeadTree component không
          if (!isFruitDeadTreeViaFiber(img)) continue;
        }
        const root = getFruitPatchRoot(img);
        if (root && d.isVisible(root)) {
          const isDeadStage = /dead|stump|old_tree|withered|dry_tree|dead_bush|bush_shrub/i.test(src);
          logFlow("Cây ăn quả: chặt gốc cây già/cây to hết lượt", { src: src.split("/").slice(-2).join("/"), isDeadStage });
          // Đảm bảo chọn rìu
          if (typeof S.workbench?.ensureToolSelectedDom === "function") {
            await S.workbench.ensureToolSelectedDom("Axe");
          }
          d.clickAtCenter(root) || d.click(root);
          await uiJitter();
          return true;
        }
      }
      // Fallback: quét toàn bộ img trong fruit patch và kiểm tra Fiber DeadTree
      try {
        const allImgs = doc.querySelectorAll("img[src]");
        for (const img of allImgs) {
          if (!d.isVisible(img)) continue;
          if (!isFruitDeadTreeViaFiber(img)) continue;
          const root = getFruitPatchRoot(img);
          if (root && d.isVisible(root)) {
            logFlow("Cây ăn quả: chặt gốc (phát hiện qua Fiber DeadTree)", {});
            if (typeof S.workbench?.ensureToolSelectedDom === "function") {
              await S.workbench.ensureToolSelectedDom("Axe");
            }
            d.clickAtCenter(root) || d.click(root);
            await uiJitter();
            return true;
          }
        }
      } catch (_e2) {
        // ignore
      }
    }
    return false;
  }

  async function tryPlantSapling(inventory) {
    const sapling = getBestSaplingFromInventory(inventory);
    if (!sapling) return false;

    // 1. Tìm tất cả các ô đất trống trước
    const docs = d.collectDocumentsForGameDom();
    const emptyRoots = [];
    for (const doc of docs) {
      const imgs = doc.querySelectorAll('img[src*="fruit_patch"]');
      for (const img of imgs) {
        const root = getFruitPatchRoot(img);
        if (root && d.isVisible(root) && isFruitPatchEmpty(root)) {
          emptyRoots.push(root);
        }
      }
    }

    if (emptyRoots.length === 0) return false;

    // 2. Chọn hạt giống cây ăn quả — dùng hàm riêng tìm theo /fruit/ URL
    // (ensureSeedSelectedDom của crop-dom chỉ tìm /crops/ nên KHÔNG áp dụng được cho fruit seeds)
    const selected = await ensureFruitSeedSelectedDom(sapling);
    if (!selected) {
      // Không tìm được hạt trong inventory UI → báo fail để caller thêm cooldown
      return "no_seed_ui";
    }

    // 3. Trồng vào ô trống đầu tiên
    const targetRoot = emptyRoots[0];
    logFlow(`Cây ăn quả: trồng ${sapling}`, {});
    d.clickAtCenter(targetRoot) || d.click(targetRoot);
    await uiJitter();
    return true;
  }

  async function runFruitTreeCycle() {
    if (!runtime.settings.autoFruitTree) return false;

    const bridge = S.gameBridge;
    if (!bridge?.isReady) return false;

    const state = bridge.getLatestState();
    if (!state) return false;

    const t = nowMs();
    let acted = false;

    // 1. Thu hoạch
    if (await tryHarvestFruit()) acted = true;
    // 2. Chặt gốc
    else if (await tryClearStump()) acted = true;
    // 3. Trồng mới
    else {
      const plantResult = await tryPlantSapling(state.inventory);
      if (plantResult === true) {
        acted = true;
        runtime._fruitPlantFailCount = 0;
      } else if (plantResult === "no_seed_ui") {
        // Không tìm được hạt trong inventory UI → thêm cooldown để tránh spam
        const failCount = (runtime._fruitPlantFailCount || 0) + 1;
        runtime._fruitPlantFailCount = failCount;
        const cooldownMs = Math.min(failCount * 20_000, 120_000); // 20s, 40s, 60s... tối đa 2 phút
        logFlow(`Cây ăn quả: không chọn được hạt (lần ${failCount}) — chờ ${Math.round(cooldownMs / 1000)}s`, {});
        runtime.nextFruitTreeFlowAt = t + cooldownMs;
        runtime.fruitTreeFlowState = `Chờ hạt giống (fail ${failCount})`;
        return false;
      } else {
        // false = không có ô trống hoặc không có hạt
        runtime._fruitPlantFailCount = 0;
      }
    }

    // Cập nhật lịch trình
    const schedule = computeFruitRestSchedule(state, nowMs());
    runtime.nextFruitTreeFlowAt = schedule.nextAt;
    runtime.fruitTreeFlowState = schedule.reason;
    runtime.fruitTreeFlowStartedAt = acted ? t : runtime.fruitTreeFlowStartedAt;

    return acted;
  }

  S.fruitTree = {
    runFruitTreeCycle,
  };
})(window.SFL);
