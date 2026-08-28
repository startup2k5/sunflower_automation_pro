(function (S) {
  "use strict";
  /**
   * Ruộng: thu hoạch + mua hạt (Market Betty) + chọn hạt + gieo — chủ yếu DOM.
   * Danh sách ô trống lấy từ bridge (emptyCropPlots + plotKey); DOM chỉ bấm ô khớp plotKey.
   * Ưu tiên: thu hết cây sẵn sàng trong tầm nhìn trước, rồi mới mua/gieo (kể cả khi vẫn còn ô trống).
   */
  const runtime = S.runtime;
  const d = S.dom;
  const logFlow = S.time.logFlow;
  const now = S.time.now;
  const sleep = S.time.sleep;
  const rand = S.time.rand;
  const uiJitter = S.time.uiJitter;

  /** Một số crop folder trong CDN khác tên hiển thị (theo plant.ts IMAGES). */
  const SEED_SLUG_OVERRIDES = {
    Broccoli: "brocolli",
    Artichoke: "artichoke",
  };

  /**
   * Hạt ruộng (Crop Plot) theo mùa — cùng logic game (SEASONAL_SEEDS ∩ CROP_SEEDS).
   * Không gồm hoa, nhà kính, quả patch (Tomato/Banana Plant/…).
   */
  const SEASONAL_CROP_PLOT_SEEDS = {
    spring: [
      "Sunflower Seed",
      "Rhubarb Seed",
      "Carrot Seed",
      "Cabbage Seed",
      "Soybean Seed",
      "Corn Seed",
      "Wheat Seed",
      "Kale Seed",
      "Barley Seed",
    ],
    summer: [
      "Sunflower Seed",
      "Potato Seed",
      "Zucchini Seed",
      "Pepper Seed",
      "Beetroot Seed",
      "Cauliflower Seed",
      "Eggplant Seed",
      "Radish Seed",
      "Wheat Seed",
    ],
    autumn: [
      "Potato Seed",
      "Pumpkin Seed",
      "Carrot Seed",
      "Yam Seed",
      "Broccoli Seed",
      "Soybean Seed",
      "Wheat Seed",
      "Barley Seed",
      "Artichoke Seed",
    ],
    winter: [
      "Potato Seed",
      "Cabbage Seed",
      "Beetroot Seed",
      "Cauliflower Seed",
      "Parsnip Seed",
      "Onion Seed",
      "Turnip Seed",
      "Wheat Seed",
      "Kale Seed",
    ],
  };

  /**
   * Thời gian lớn **cơ bản** trong catalogue game (CROP_SEEDS) — không phải lúc thu thực tế:
   * buff, phân, sự kiện… có thể làm cây sẵn sàng sớm hơn. Chỉ dùng để **xếp thứ tự** ưu tiên mua/gieo, không dùng để dự đoán harvest.
   */
  const CROP_DOM_BASE_PLANT_SEC = {
    "Sunflower Seed": 60,
    "Potato Seed": 5 * 60,
    "Rhubarb Seed": 10 * 60,
    "Pumpkin Seed": 30 * 60,
    "Zucchini Seed": 30 * 60,
    "Carrot Seed": 60 * 60,
    "Yam Seed": 60 * 60,
    "Cabbage Seed": 2 * 60 * 60,
    "Broccoli Seed": 2 * 60 * 60,
    "Soybean Seed": 3 * 60 * 60,
    "Beetroot Seed": 4 * 60 * 60,
    "Pepper Seed": 4 * 60 * 60,
    "Cauliflower Seed": 8 * 60 * 60,
    "Parsnip Seed": 12 * 60 * 60,
    "Eggplant Seed": 16 * 60 * 60,
    "Corn Seed": 20 * 60 * 60,
    "Onion Seed": 20 * 60 * 60,
    "Radish Seed": 24 * 60 * 60,
    "Wheat Seed": 24 * 60 * 60,
    "Turnip Seed": 24 * 60 * 60,
    "Kale Seed": 36 * 60 * 60,
    "Artichoke Seed": 36 * 60 * 60,
    "Barley Seed": 48 * 60 * 60,
  };

  // ── Mua hạt qua XState event (seed.bought) — port từ SunFlower Land Extension ──

  /** Giá mua cơ bản (coins) của từng loại hạt mùa thường. */
  const NORMAL_SEED_BUY_PRICES_DOM = {
    "Sunflower Seed": 0.01,
    "Potato Seed": 0.1,
    "Rhubarb Seed": 0.15,
    "Pumpkin Seed": 0.2,
    "Zucchini Seed": 0.2,
    "Carrot Seed": 0.5,
    "Yam Seed": 0.5,
    "Cabbage Seed": 1,
    "Broccoli Seed": 1,
    "Soybean Seed": 1.5,
    "Beetroot Seed": 2,
    "Pepper Seed": 2,
    "Cauliflower Seed": 3,
    "Wheat Seed": 5,
    "Turnip Seed": 5,
    "Parsnip Seed": 5,
    "Eggplant Seed": 6,
    "Corn Seed": 7,
    "Onion Seed": 7,
    "Radish Seed": 7,
    "Kale Seed": 7,
    "Artichoke Seed": 7,
    "Barley Seed": 10,
    "Apple Seed": 50.0,
    "Apple Sapling": 50.0,
    "Orange Seed": 50.0,
    "Orange Sapling": 50.0,
    "Blueberry Seed": 12.0,
    "Blueberry Seeds": 12.0,
    "Lemon Seed": 50.0,
    "Lemon Sapling": 50.0,
    "Pear Seed": 50.0,
    "Pear Sapling": 50.0,
    "Plum Seed": 60.0,
    "Plum Sapling": 60.0,
    "Grape Seed": 50.0,
    "Grape Sapling": 50.0,
    "Banana Seed": 70.0,
    "Banana Sapling": 70.0,
    "Banana Plant": 70.0,
    "Sunpetal Seed": 5.0,
    "Bloom Seed": 10.0,
    "Lily Seed": 20.0,
  };

  /** Thứ tự ưu tiên mua hạt — rẻ nhất / phổ biến nhất trước. */
  const SEED_BUY_ORDER_DOM = [
    "Sunflower Seed", "Potato Seed", "Rhubarb Seed", "Zucchini Seed",
    "Pumpkin Seed", "Carrot Seed", "Cabbage Seed", "Yam Seed",
    "Soybean Seed", "Broccoli Seed", "Beetroot Seed", "Pepper Seed",
    "Cauliflower Seed", "Parsnip Seed", "Eggplant Seed", "Corn Seed",
    "Onion Seed", "Turnip Seed", "Radish Seed", "Wheat Seed",
    "Kale Seed", "Artichoke Seed", "Barley Seed",
  ];

  /** Hạt giống cây ăn quả (Fruit) */
  const FRUIT_SAPLINGS_DOM = [
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

  /** Hạt giống hoa (Flower) */
  const FLOWER_SEEDS_DOM = [
    "Sunpetal Seed",
    "Bloom Seed",
    "Lily Seed",
  ];

  const SEED_LEVEL_REQUIREMENTS = {
    "Sunflower Seed": 1,
    "Potato Seed": 1,
    "Rhubarb Seed": 2,
    "Pumpkin Seed": 3,
    "Zucchini Seed": 4,
    "Carrot Seed": 5,
    "Yam Seed": 6,
    "Cabbage Seed": 7,
    "Broccoli Seed": 8,
    "Soybean Seed": 9,
    "Beetroot Seed": 10,
    "Pepper Seed": 11,
    "Cauliflower Seed": 12,
    "Wheat Seed": 12,
    "Turnip Seed": 13,
    "Parsnip Seed": 13,
    "Eggplant Seed": 14,
    "Corn Seed": 14,
    "Onion Seed": 15,
    "Radish Seed": 15,
    "Kale Seed": 16,
    "Artichoke Seed": 17,
    "Barley Seed": 18,
    "Tomato Seed": 10,
    "Apple Seed": 13,
    "Apple Sapling": 13,
    "Orange Seed": 15,
    "Orange Sapling": 15,
    "Blueberry Seed": 14,
    "Blueberry Seeds": 14,
    "Lemon Seed": 16,
    "Lemon Sapling": 16,
    "Pear Seed": 17,
    "Pear Sapling": 17,
    "Plum Seed": 18,
    "Plum Sapling": 18,
    "Grape Seed": 18,
    "Grape Sapling": 18,
    "Banana Seed": 16,
    "Banana Sapling": 16,
    "Banana Plant": 16,
    "Sunpetal Seed": 13,
    "Bloom Seed": 16,
    "Lily Seed": 19,
  };

  const SEASONAL_FRUIT_SEEDS = {
    spring: [
      "Apple Seed", "Apple Sapling",
      "Orange Seed", "Orange Sapling",
      "Blueberry Seed", "Blueberry Seeds",
      "Plum Seed", "Plum Sapling",
      "Olive Seed",
    ],
    summer: [
      "Orange Seed", "Orange Sapling",
      "Blueberry Seed", "Blueberry Seeds",
      "Banana Seed", "Banana Sapling", "Banana Plant",
      "Olive Seed",
    ],
    autumn: [
      "Apple Seed", "Apple Sapling",
      "Blueberry Seed", "Blueberry Seeds",
      "Banana Seed", "Banana Sapling", "Banana Plant",
      "Tomato Seed",
      "Grape Seed", "Grape Sapling",
    ],
    winter: [
      "Apple Seed", "Apple Sapling",
      "Orange Seed", "Orange Sapling",
      "Banana Seed", "Banana Sapling", "Banana Plant",
      "Tomato Seed",
      "Grape Seed", "Grape Sapling",
      "Pear Seed", "Pear Sapling",
    ],
  };

  const SEASONAL_FLOWER_SEEDS = {
    spring: ["Sunpetal Seed"],
    summer: ["Bloom Seed"],
    autumn: ["Lily Seed"],
    winter: ["Sunpetal Seed"],
  };

  function getBumpkinLevel(xp) {
    if (!xp || xp < 0) return 1;
    const reqs = [0, 50, 150, 350, 750, 1500, 2500];
    let currentXp = 2500;
    let diff = 1000;
    for (let l = 7; l <= 150; l++) {
      diff += 500;
      currentXp += diff;
      reqs.push(currentXp);
    }
    for (let i = 0; i < reqs.length; i++) {
      if (xp < reqs[i]) return i;
    }
    return reqs.length;
  }

  S.SEED_LEVEL_REQUIREMENTS = SEED_LEVEL_REQUIREMENTS;
  S.SEASONAL_FRUIT_SEEDS = SEASONAL_FRUIT_SEEDS;
  S.SEASONAL_FLOWER_SEEDS = SEASONAL_FLOWER_SEEDS;
  S.getBumpkinLevel = getBumpkinLevel;

  /** Hạt nhà kính — không mua vào plot thường. */
  const GREENHOUSE_SEED_NAMES_DOM = ["Grape Seed", "Olive Seed", "Rice Seed"];

  /** Ngưỡng hạt mọc lâu: > 3h. */
  const LONG_SEED_THRESHOLD_SEC_DOM = 3 * 60 * 60;

  function getNormalSeedBuyPriceDom(seedName) {
    return Number(NORMAL_SEED_BUY_PRICES_DOM[seedName] ?? Number.MAX_SAFE_INTEGER);
  }

  function isLongGrowthSeedDom(seedName) {
    const sec = CROP_DOM_BASE_PLANT_SEC[seedName];
    if (sec == null) return false;
    return sec > LONG_SEED_THRESHOLD_SEC_DOM;
  }

  /**
   * Chọn hạt tốt nhất để mua từ stock game (từ gameBridge state).
   * Ưu tiên: hạt ưu tiên người dùng → rẻ nhất theo mùa → ngắn nhất nếu skipLongGrow.
   */
  function getNextSeedToBuyViaEvent(stock, seasonKey, preferredSeed, skipLongGrow) {
    let bumpkinLevel = 1; // Mặc định là 1 (an toàn nhất, chỉ Sunflower/Potato) nếu bridge chưa sẵn sàng hoặc chưa reload trang
    if (S.gameBridge?.isReady) {
      const st = S.gameBridge.getLatestState();
      if (st) {
        const xp = st.bumpkinExperience || 0;
        bumpkinLevel = getBumpkinLevel(xp);
      }
    }

    // Nếu người dùng chọn hạt cụ thể -> Ưu tiên mua hạt này NẾU đúng mùa và đủ cấp độ
    if (preferredSeed && preferredSeed !== "Auto") {
      const allowedForPref = SEASONAL_CROP_PLOT_SEEDS[seasonKey] || SEASONAL_CROP_PLOT_SEEDS.spring;
      if (allowedForPref.includes(preferredSeed) && (stock[preferredSeed] || 0) > 0) {
        const reqLevel = SEED_LEVEL_REQUIREMENTS[preferredSeed];
        if (!reqLevel || bumpkinLevel >= reqLevel) {
          return preferredSeed;
        }
      }
    }

    const allowed = SEASONAL_CROP_PLOT_SEEDS[seasonKey] || SEASONAL_CROP_PLOT_SEEDS.spring;
    const allowedSet = new Set(allowed);

    const available = SEED_BUY_ORDER_DOM.filter((s) => {
      if ((stock[s] || 0) <= 0) return false;
      if (GREENHOUSE_SEED_NAMES_DOM.includes(s)) return false;
      if (!allowedSet.has(s)) return false;
      if (runtime.lockedSeeds?.has(s)) return false; // Bỏ qua hạt đã được phát hiện là bị khóa (Locked)
      
      const reqLevel = SEED_LEVEL_REQUIREMENTS[s];
      if (reqLevel && bumpkinLevel < reqLevel) return false; // Bỏ qua nếu chưa đủ cấp độ mở khóa
      
      return true;
    });
    if (available.length === 0) return null;

    const buyable = skipLongGrow
      ? (available.filter((s) => !isLongGrowthSeedDom(s)).length > 0
        ? available.filter((s) => !isLongGrowthSeedDom(s))
        : available)
      : available;
    if (buyable.length === 0) return null;

    buyable.sort((a, b) => {
      const pa = getNormalSeedBuyPriceDom(a);
      const pb = getNormalSeedBuyPriceDom(b);
      if (pa !== pb) return pa - pb;
      const sa = CROP_DOM_BASE_PLANT_SEC[a] ?? Number.MAX_SAFE_INTEGER;
      const sb = CROP_DOM_BASE_PLANT_SEC[b] ?? Number.MAX_SAFE_INTEGER;
      return sa - sb;
    });
    return buyable[0];
  }

  /**
   * Chọn hạt tốt nhất từ inventory để gieo (ưu tiên ngắn → dài, theo mùa).
   * @returns {string|null}
   */
  function getBestSeedFromInventory(inventory, seasonKey, preferredSeed, skipLongGrow) {
    // Nếu người dùng chọn hạt cụ thể -> Ưu tiên gieo hạt này NẾU đúng mùa. Nếu hết hoặc sai mùa thì chuyển qua hạt khác.
    if (preferredSeed && preferredSeed !== "Auto") {
      const allowedForPref = SEASONAL_CROP_PLOT_SEEDS[seasonKey] || SEASONAL_CROP_PLOT_SEEDS.spring;
      if (allowedForPref.includes(preferredSeed) && Math.floor(Number(inventory[preferredSeed] || 0)) > 0) return preferredSeed;
    }

    const allowed = SEASONAL_CROP_PLOT_SEEDS[seasonKey] || SEASONAL_CROP_PLOT_SEEDS.spring;
    const allowedSet = new Set(allowed);
    const candidates = SEED_BUY_ORDER_DOM.filter((s) => {
      if (!allowedSet.has(s)) return false;
      if (GREENHOUSE_SEED_NAMES_DOM.includes(s)) return false;
      return Math.floor(Number(inventory[s] || 0)) > 0;
    });
    if (candidates.length === 0) return null;

    const shortCands = candidates.filter((s) => !isLongGrowthSeedDom(s));
    const longCands = candidates.filter((s) => isLongGrowthSeedDom(s));
    const pool = skipLongGrow
      ? (shortCands.length > 0 ? shortCands : longCands)
      : candidates;
    if (pool.length === 0) return null;

    pool.sort((a, b) => {
      const sa = CROP_DOM_BASE_PLANT_SEC[a] ?? Number.MAX_SAFE_INTEGER;
      const sb = CROP_DOM_BASE_PLANT_SEC[b] ?? Number.MAX_SAFE_INTEGER;
      return sa - sb;
    });
    return pool[0];
  }

  function normalizeSeasonName(raw) {
    const x = String(raw || "spring").toLowerCase().trim();
    if (x === "fall") return "autumn";
    return ["spring", "summer", "autumn", "winter"].includes(x) ? x : "spring";
  }

  /** Thứ tự hạt ruộng theo mùa — trùng hàng lưới trong giỏ (trái → phải, flex-wrap). */
  function seasonalCropPlotSeedList() {
    const st = S.gameBridge?.getLatestState?.();
    const key = normalizeSeasonName(st?.season);
    const list = SEASONAL_CROP_PLOT_SEEDS[key];
    return Array.isArray(list) && list.length > 0 ? list : SEASONAL_CROP_PLOT_SEEDS.spring;
  }

  function orderedCropDomSeedsForSeason() {
    const list = seasonalCropPlotSeedList();
    const pref = String(runtime.settings.cropDomSeedName || "Auto").trim() || "Auto";
    // Nếu user chọn hạt cụ thể VÀ hạt đó thuộc mùa hiện tại, ưu tiên đưa hạt đó lên đầu mảng
    const first = (pref !== "Auto" && list.includes(pref)) ? pref : list[0];
    const rest = list.filter((n) => n !== first);
    return [first, ...rest];
  }

  /**
   * Danh sách mùa dùng cho mua/gieo. Nếu bật cropDomSkipLongGrow: **sắp xếp** phần còn lại
   * theo thời gian lớn catalogue (ngắn → dài); hạt lâu vẫn nằm trong list, vẫn mua/gieo được khi tới lượt.
   */
  function allowedCropDomSeedsOrdered() {
    const base = orderedCropDomSeedsForSeason();
    if (!runtime.settings.cropDomSkipLongGrow) return base;
    const head = base[0];
    const tail = base.slice(1);
    const rank = (n) => {
      const s = CROP_DOM_BASE_PLANT_SEC[n];
      return s == null ? 1e12 : s;
    };
    tail.sort((a, b) => rank(a) - rank(b));
    return [head, ...tail];
  }

  /** Ngưỡng «cây ngắn»: ưu tiên mua/gieo trước; hết lựa chọn khả dụng mới tới cây ≥ ngưỡng này. */
  const CROP_DOM_SHORT_GROW_MAX_SEC = 5 * 60 * 60;

  /**
   * Cùng nguồn với allowedCropDomSeedsOrdered, nhưng gom hạt có thời gian lớn catalogue dưới 5 giờ trước,
   * rồi mới các hạt từ 5 giờ trở lên (hoặc không có trong bảng).
   */
  function allowedCropDomSeedsOrderedShortThenLong() {
    const base = allowedCropDomSeedsOrdered();
    const short = [];
    const long = [];
    for (let i = 0; i < base.length; i += 1) {
      const n = base[i];
      const sec = CROP_DOM_BASE_PLANT_SEC[n];
      if (sec != null && sec < CROP_DOM_SHORT_GROW_MAX_SEC) short.push(n);
      else long.push(n);
    }
    return short.concat(long);
  }

  function clampBuyCursor(ordLen) {
    if (ordLen <= 0) return 0;
    const c = Math.floor(Number(runtime.cropDomBuyCursor) || 0);
    const m = ((c % ordLen) + ordLen) % ordLen;
    return m;
  }

  /** Hạt đang ưu tiên tại Market (ô 1 → 2 → 3… sau mỗi lần mua OK). */
  function getBuyTargetSeedName() {
    const ord = allowedCropDomSeedsOrderedShortThenLong();
    if (ord.length <= 0) return "Sunflower Seed";
    return ord[clampBuyCursor(ord.length)] || ord[0];
  }

  /**
   * Gieo: cùng nguồn thứ tự với mua (`allowedCropDomSeedsOrderedShortThenLong`), xoay từ `cropDomBuyCursor`
   * — giống tinh thần đào đá (một «ô» ưu tiên rồi lần lượt các loại kế), không nhảy theo lưới mùa UI.
   */
  function pickSeedForPlanting() {
    const buyOrd = allowedCropDomSeedsOrderedShortThenLong();
    if (buyOrd.length <= 0) return orderedCropDomSeedsForSeason()[0] || "Sunflower Seed";
    const len = buyOrd.length;
    const start = clampBuyCursor(len);
    for (let k = 0; k < len; k += 1) {
      const name = buyOrd[(start + k) % len];
      if (seedCountFromBridge(name) > 0) return name;
    }
    return buyOrd[start] || buyOrd[0];
  }

  function bumpCropDomBuyAfterFail(failedName) {
    const ord = allowedCropDomSeedsOrderedShortThenLong();
    if (ord.length <= 1) {
      logThrottled("crop_dom_one_seed_season", 25000, "Ruộng DOM: trong mùa chỉ còn một loại hạt ruộng — không đổi ô mua được", {
        failedName,
        season: normalizeSeasonName(S.gameBridge?.getLatestState?.()?.season),
      });
      return;
    }
    const idx = ord.indexOf(failedName);
    const nextIdx = idx >= 0 ? (idx + 1) % ord.length : (clampBuyCursor(ord.length) + 1) % ord.length;
    runtime.cropDomBuyCursor = nextIdx;
    logFlow("Ruộng DOM: sang ô hạt kế (lỗi mua/gieo / Restock)", {
      from: failedName,
      to: ord[nextIdx],
      cursor: nextIdx,
      season: normalizeSeasonName(S.gameBridge?.getLatestState?.()?.season),
    });
  }

  function advanceCropDomBuyAfterPurchase(purchasedName) {
    const ord = allowedCropDomSeedsOrderedShortThenLong();
    if (ord.length <= 1) return;
    const idx = ord.indexOf(purchasedName);
    const nextIdx = idx >= 0 ? (idx + 1) % ord.length : (clampBuyCursor(ord.length) + 1) % ord.length;
    runtime.cropDomBuyCursor = nextIdx;
    logFlow("Ruộng DOM: đã mua — đóng shop; lần mua sau chọn hạt kế (ô kế)", {
      purchased: purchasedName,
      next: ord[nextIdx],
      cursor: nextIdx,
    });
  }

  const CROP_LIFECYCLE_RE =
    /\/crops\/[^/]+\/(seedling|halfway|almost|plant|crop)\.png|\/volcano\/crops\/[^/]+\/(seedling|halfway|almost|plant|crop)\.png/i;

  /**
   * DOM ô ruộng (FertilePlot + Soil) — tham chiếu khi sửa selector:
   *
   * 1) Đất trống: một lớp bấm được bọc ảnh đất (vd game-assets/crops/soil2.png):
   *    div.w-full.h-full.relative.cursor-pointer.hover:img-highlight > div.absolute > img[src*=soil2]
   *
   * 2) Sẵn thu: lớp ngoài không có cursor-pointer, trong cùng có cursor-pointer + plant.png:
   *    div.w-full.h-full.relative > div.cursor-pointer.hover:img-highlight > … > img …/crop/plant.png
   *
   * 3) Đang lớn: lớp giữa w-full h-full KHÔNG có cursor-pointer (chỉ almost/seedling/halfway + timer/bar):
   *    findReadyHarvest chỉ bám plant.png; tìm ô trống chỉ bám ảnh đất (không dùng lifecycle).
   */
  const SOIL_IMG_SELECTOR =
    'img[src*="soil2"],img[srcset*="soil2"],img[src*="volcanoSoil2"],img[srcset*="volcanoSoil2"],img[src*="soil_not_fertile"],img[srcset*="soil_not_fertile"],img[src*="soil_dry"],img[srcset*="soil_dry"],img[src*="sand_dug"],img[srcset*="sand_dug"]';

  /** Chỉ ảnh đất “trơ”. Khớp CDN + game-assets; cho phép png|webp. */
  const BARE_SOIL_URL_RE =
    /\/crops\/(?:soil2|soil_dry|soil_not_fertile|sand_dug)\.(?:png|webp)|\/volcano\/crops\/(?:soil2|soil_dry)\.(?:png|webp)/i;

  /**
   * Ô đất khô / không mầu mỡ — do thiếu giếng nước hoặc giếng chưa nâng cấp.
   * Game hiển thị ảnh soil_dry.png hoặc soil_not_fertile.png cho các ô này.
   * Bot KHÔNG được gieo vào ô này — luôn bỏ qua ở tầng DOM.
   */
  const DRY_INFERTILE_SOIL_URL_RE =
    /\/crops\/(?:soil_dry|soil_not_fertile)\.(?:png|webp)|\/volcano\/crops\/soil_dry\.(?:png|webp)/i;

  /** Kiểm tra URL ảnh đất có phải loại khô / infertile (thiếu giếng nước). */
  function isDrySoilImgUrl(u) {
    const s = String(u || "").toLowerCase();
    return DRY_INFERTILE_SOIL_URL_RE.test(s) || s.includes("soil_dry") || s.includes("soil_not_fertile");
  }

  function imgAssetUrl(img) {
    const srcset = String(img?.getAttribute?.("srcset") || "")
      .split(",")[0]
      .trim()
      .split(/\s+/)[0];
    return String(img?.currentSrc || img?.getAttribute?.("src") || srcset || "").toLowerCase();
  }

  /** URL là giai đoạn cây (không phải file đất tên soil2…). */
  const CROP_STAGE_IN_URL_RE =
    /\/crops\/[^/]+\/(?:seedling|halfway|almost|plant|crop)\.(?:png|webp)|\/volcano\/crops\/[^/]+\/(?:seedling|halfway|almost|plant|crop)\.(?:png|webp)/i;

  const VIEWPORT_PAD_PLOT = 200;
  const VIEWPORT_PAD_PLOT_AGGRESSIVE = 280;

  /**
   * Ô plot là phần tử w-full h-full đầu tiên khi đi lên từ img — KHÔNG phải tổ tiên xa nhất.
   * Lấy nhầm ô ngoài cùng sẽ gom innerHTML cả cụm map → plotHtmlHasGrowingCrop luôn true → không thấy ô trống.
   */
  function innermostWFullHFullFromImg(img) {
    let c = img && img.parentElement;
    for (let dpt = 0; dpt < 22 && c; dpt += 1) {
      if (c.classList?.contains("w-full") && c.classList?.contains("h-full")) return c;
      c = c.parentElement;
    }
    return img ? img.parentElement : null;
  }

  function isBareSoilImgUrlStrict(u) {
    return BARE_SOIL_URL_RE.test(String(u || "").toLowerCase());
  }

  /**
   * Kiểm tra xem phần tử DOM (tile / container) có phải là fruit patch / cây ăn quả không.
   * Nếu đúng → KHÔNG được gieo hạt ruộng vào ô này.
   */
  const FRUIT_PATCH_IMG_RE = /orange|apple|blueberry|lemon|pear|plum|grape|banana|tomato|peach|cherry|mango|durian|olive/i;
  const FRUIT_PATCH_SRC_RE = /\/fruit[_\-]?patch|\/fruit[_\-]?patches|\/fruit\/|fruit_patch|fruitPatch|fruit-patch|fruitpatch/i;

  function normalizePlotKindName(value) {
    return String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
  }

  function isCropPlotKindName(value) {
    const n = normalizePlotKindName(value);
    return n === "cropplot" || n === "fertileplot" || n.includes("cropplot") || n.includes("fertileplot");
  }

  function isNonCropPlotKindName(value) {
    const n = normalizePlotKindName(value);
    return (
      n === "fruitpatch" ||
      n.includes("fruitpatch") ||
      n === "flowerbed" ||
      n.includes("flowerbed") ||
      n === "flower" ||
      n === "flowers" ||
      n === "greenhousepot" ||
      n.includes("greenhousepot") ||
      n === "greenhouse" ||
      n === "beehive" ||
      n.includes("beehive") ||
      n === "beebox" ||
      n.includes("beebox")
    );
  }

  function cropPlotFiberVerdict(el) {
    if (!el) return "unknown";
    let fiberKey;
    try {
      fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
    } catch (_e) {
      return "unknown";
    }
    if (!fiberKey) return "unknown";

    let f = el[fiberKey];
    for (let depth = 0; depth < 72 && f; depth += 1) {
      const componentName = fiberDisplayName(f);
      if (isNonCropPlotKindName(componentName)) return "non_crop";
      if (isCropPlotKindName(componentName)) return "crop";

      const sources = [f.memoizedProps, f.pendingProps];
      for (let si = 0; si < sources.length; si += 1) {
        const p = sources[si];
        if (!p || typeof p !== "object") continue;
        const name = String(p.name || "").trim();
        if (isNonCropPlotKindName(name)) return "non_crop";
        if (isCropPlotKindName(name)) return "crop";
      }
      f = f.return;
    }
    return "unknown";
  }

  function hasCropPlotFiberContext(el) {
    return cropPlotFiberVerdict(el) === "crop";
  }

  function fiberDisplayName(fiber) {
    const t = fiber?.elementType || fiber?.type;
    return String(t?.displayName || t?.name || "");
  }

  function rectCenter(rect) {
    return {
      x: Number(rect?.left || 0) + Number(rect?.width || 0) / 2,
      y: Number(rect?.top || 0) + Number(rect?.height || 0) / 2,
    };
  }

  function elementCenterDistance(a, b) {
    if (!a || !b) return Number.MAX_SAFE_INTEGER;
    let ar;
    let br;
    try {
      ar = a.getBoundingClientRect();
      br = b.getBoundingClientRect();
    } catch (_e) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (!ar || !br || ar.width <= 0 || ar.height <= 0 || br.width <= 0 || br.height <= 0) {
      return Number.MAX_SAFE_INTEGER;
    }
    const ac = rectCenter(ar);
    const bc = rectCenter(br);
    return Math.hypot(ac.x - bc.x, ac.y - bc.y);
  }

  function hasNearbyFruitPatchImage(el) {
    if (!el) return false;
    let rect;
    try {
      rect = el.getBoundingClientRect();
    } catch (_e) {
      return false;
    }
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const maxDistance = Math.max(22, Math.min(rect.width, rect.height) * 0.6);
    const doc = el.ownerDocument || document;
    let imgs;
    try {
      imgs = doc.querySelectorAll("img[src], img[srcset]");
    } catch (_e) {
      return false;
    }
    for (let i = 0; i < imgs.length; i += 1) {
      const img = imgs[i];
      const src = imgAssetUrl(img);
      if (!FRUIT_PATCH_SRC_RE.test(src)) continue;
      if (!d.isVisible(img)) continue;
      if (elementCenterDistance(el, img) <= maxDistance) return true;
    }
    return false;
  }

  function isFruitPatchOrFlowerElement(el) {
    if (!el) return false;

    // 1) Kiểm tra React Fiber: nếu component tên "Fruit Patch" → chắc chắn không phải crop plot
    try {
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      if (fiberKey) {
        let f = el[fiberKey];
        for (let depth = 0; depth < 40 && f; depth += 1) {
          const componentName = fiberDisplayName(f);
          if (isNonCropPlotKindName(componentName)) return true;
          if (isCropPlotKindName(componentName)) return false;
          const sources = [f.memoizedProps, f.pendingProps];
          for (let si = 0; si < sources.length; si += 1) {
            const p = sources[si];
            if (!p || typeof p !== "object") continue;
            const name = String(p.name || "").trim();
            if (isNonCropPlotKindName(name)) return true;
            // Crop Plot → chắc chắn là ruộng
            if (isCropPlotKindName(name)) return false;
          }
          f = f.return;
        }
      }
    } catch (_e) {
      // ignore
    }

    // 2) Kiểm tra ảnh bên trong: có ảnh quả / hoa?
    let html = "";
    try {
      html = String(el.innerHTML || "").toLowerCase();
    } catch (_e) {
      return false;
    }
    if (html.includes("/flowers/") || html.includes("flowers/")) return true;
    if (FRUIT_PATCH_SRC_RE.test(html)) return true;
    if (hasNearbyFruitPatchImage(el)) return true;

    let imgs;
    try {
      imgs = el.querySelectorAll("img[src], img[srcset]");
    } catch (_e) {
      return false;
    }
    for (let i = 0; i < imgs.length; i += 1) {
      const src = String(imgs[i].currentSrc || imgs[i].getAttribute("src") || "").toLowerCase();
      if (src.includes("fruit") && !src.includes("soil")) return true;
      if (FRUIT_PATCH_IMG_RE.test(src)) return true;
      const alt = String(imgs[i].getAttribute("alt") || "").trim();
      if (alt.length >= 3 && FRUIT_PATCH_IMG_RE.test(alt)) return true;
    }

    return false;
  }

  /** Dự phòng khi CDN đổi path: vẫn loại URL giai đoạn cây. */
  function isBareSoilImgUrlLoose(u) {
    const s = String(u || "").toLowerCase();
    if (isBareSoilImgUrlStrict(s)) return true;
    if (CROP_STAGE_IN_URL_RE.test(s)) return false;
    if (
      s.includes("/crops/soil2") ||
      s.includes("/crops/soil_dry") ||
      s.includes("soil_not_fertile") ||
      s.includes("sand_dug") ||
      s.includes("/volcano/crops/soil2") ||
      s.includes("/volcano/crops/soil_dry")
    ) {
      return true;
    }
    return false;
  }

  const logAt = new Map();

  function logThrottled(key, minMs, msg, detail) {
    const t = now();
    if (t - (logAt.get(key) || 0) < minMs) return;
    logAt.set(key, t);
    logFlow(msg, detail);
  }

  function seedNameToSlug(seedName) {
    const base = String(seedName || "")
      .replace(/\s+Seed$/i, "")
      .trim();
    if (SEED_SLUG_OVERRIDES[base]) return SEED_SLUG_OVERRIDES[base];
    return base.replace(/\s+/g, "").toLowerCase();
  }

  function seedCountFromBridge(seedName) {
    if (!S.gameBridge?.getLatestState) return 999;
    const inv = S.gameBridge.getLatestState()?.inventory;
    if (!inv || !seedName) return 0;
    const v = inv[seedName];
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
    return Math.max(0, Math.floor(Number(v) || 0));
  }

  function plotRootFromInner(el) {
    let n = el;
    for (let i = 0; i < 28 && n; i += 1) {
      const cls = n.classList;
      if (
        cls &&
        cls.contains("cursor-pointer") &&
        (cls.contains("hover:img-highlight") || cls.contains("group-hover:img-highlight"))
      ) {
        return n;
      }
      n = n.parentElement;
    }
    n = el;
    for (let i = 0; i < 28 && n; i += 1) {
      const cls = n.classList;
      if (cls && cls.contains("cursor-pointer")) {
        try {
          const win = d.viewForElement(n);
          if (win.getComputedStyle(n).pointerEvents !== "none") return n;
        } catch (_e) {
          return n;
        }
      }
      n = n.parentElement;
    }
    n = el?.parentElement;
    for (let i = 0; i < 10 && n; i += 1) {
      const cls = n.classList;
      if (cls && cls.contains("w-full") && cls.contains("h-full") && cls.contains("relative")) {
        try {
          const win = d.viewForElement(n);
          if (win.getComputedStyle(n).pointerEvents !== "none") return n;
        } catch (_e2) {
          return n;
        }
      }
      n = n.parentElement;
    }
    return null;
  }

  /** Lấy index ô ruộng từ bridge (plotKey = key trong state.crops). */
  function buildBridgeCropIndex() {
    const st = S.gameBridge?.getLatestState?.();
    const crops = st?.crops;
    if (!Array.isArray(crops) || crops.length === 0) return null;
    const occupied = new Set();
    const allKeys = new Set();
    for (let i = 0; i < crops.length; i += 1) {
      const p = crops[i];
      const key = String(p?.plotKey || "").trim();
      if (!key) continue;
      allKeys.add(key);
      const name = String(p?.cropName || "").trim();
      const planted = Number(p?.plantedAt) || 0;
      if (name || planted > 0) occupied.add(key);
    }
    if (allKeys.size === 0) return null;

    // ── Ô trống bị chặn (thời tiết / thiếu giếng nước) ──
    // Bridge đã lọc ô bị chặn khỏi emptyCropPlots → ô trống không nằm trong danh sách
    // bridge = bị chặn → đánh dấu "occupied" để DOM heuristic bỏ qua.
    const bridgeEmpty = Array.isArray(st.emptyCropPlots) ? st.emptyCropPlots : [];
    const emptyKeys = new Set();
    if (Array.isArray(st.emptyCropPlots)) {
      for (let i = 0; i < bridgeEmpty.length; i += 1) {
        const key = String(bridgeEmpty[i]?.plotKey || "").trim();
        if (key) emptyKeys.add(key);
      }
    }
    
    // Đếm số lượng ô trống thô (theo crops array)
    let rawEmptyCount = 0;
    for (let i = 0; i < crops.length; i += 1) {
      const p = crops[i];
      const key = String(p?.plotKey || "").trim();
      const name = String(p?.cropName || "").trim();
      const planted = Number(p?.plantedAt) || 0;
      if (!name && planted <= 0) {
        rawEmptyCount += 1;
        if (!Array.isArray(st.emptyCropPlots) && key) emptyKeys.add(key);
      }
    }
    const weather = st?.activeWeather;
    const weatherBlocking = !!(weather && weather.name && !weather.isProtected && weather.blockedPlotCount > 0);
    const hasBlockedPlots = weatherBlocking || (rawEmptyCount > bridgeEmpty.length);

    if (hasBlockedPlots) {
      // Ô trống theo crops array nhưng KHÔNG trong emptyCropPlots bridge = bị chặn
      for (let i = 0; i < crops.length; i += 1) {
        const p = crops[i];
        const key = String(p?.plotKey || "").trim();
        if (!key || occupied.has(key)) continue;
        const name = String(p?.cropName || "").trim();
        const planted = Number(p?.plantedAt) || 0;
        const isEmpty = !name && planted <= 0;
        if (isEmpty && !emptyKeys.has(key)) {
          occupied.add(key); // weather-blocked or infertile → treat as occupied
        }
      }
    }

    return { occupied, allKeys, emptyKeys, hasBlockedPlots };
  }

  /**
   * Plot component nhận prop `id` = plotKey. Leo fiber từ DOM để khớp với bridge, tránh gieo nhầm ô đã có cây trong state.
   */
  function plotKeyFromDomEl(el, allKeys) {
    if (!el || !allKeys || allKeys.size === 0) return null;
    let fiberKey;
    try {
      fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
    } catch (_e) {
      return null;
    }
    if (!fiberKey) return null;
    let f = el[fiberKey];
    let cropContext = false;
    let candidateId = null;
    for (let depth = 0; depth < 72 && f; depth += 1) {
      const componentName = fiberDisplayName(f);
      if (isNonCropPlotKindName(componentName)) return null;
      if (isCropPlotKindName(componentName)) cropContext = true;
      const sources = [f.memoizedProps, f.pendingProps];
      for (let si = 0; si < sources.length; si += 1) {
        const p = sources[si];
        if (!p || typeof p !== "object") continue;
        const name = String(p.name || "").trim();
        if (isNonCropPlotKindName(name)) return null;
        if (isCropPlotKindName(name)) cropContext = true;
        if (cropContext && p.id != null && String(p.id).trim()) {
          const id = String(p.id).trim();
          if (allKeys.has(id)) return id;
        }
        if (p.id != null && String(p.id).trim()) {
          const id = String(p.id).trim();
          if (allKeys.has(id) && !candidateId) candidateId = id;
        }
      }
      f = f.return;
    }
    return candidateId;
  }

  /** Find a crop plot key from the clickable root or its soil image children. */
  function plotKeyFromPlotRoot(root, allKeys) {
    const direct = plotKeyFromDomEl(root, allKeys);
    if (direct) return direct;
    if (!root?.querySelectorAll) return null;
    let imgs;
    try {
      imgs = root.querySelectorAll(SOIL_IMG_SELECTOR);
    } catch (_e) {
      return null;
    }
    for (let i = 0; i < imgs.length; i += 1) {
      const pk = plotKeyFromDomEl(imgs[i], allKeys);
      if (pk) return pk;
    }
    return null;
  }

  /** Ô đất trống theo state game (ưu tiên payload emptyCropPlots từ page-bridge). */
  function listEmptyCropPlotsFromState() {
    const st = S.gameBridge?.getLatestState?.();
    if (!st) return [];
    if (Array.isArray(st.emptyCropPlots)) return st.emptyCropPlots;
    const crops = st.crops;
    if (!Array.isArray(crops)) return [];
    const out = [];
    for (let i = 0; i < crops.length; i += 1) {
      const p = crops[i];
      const key = String(p?.plotKey || "").trim();
      if (!key) continue;
      const name = String(p?.cropName || "").trim();
      const planted = Number(p?.plantedAt) || 0;
      if (name || planted > 0) continue;
      out.push({
        plotKey: key,
        x: Number(p?.x) || 0,
        y: Number(p?.y) || 0,
      });
    }
    out.sort((a, b) => a.y - b.y || a.x - b.x || String(a.plotKey).localeCompare(String(b.plotKey)));
    return out;
  }

  /**
   * Mỗi plotKey (ô trống theo bridge) → một root DOM trong tầm nhìn (gần tâm màn hình nhất nếu trùng).
   */
  function collectVisibleEmptyPlotRootsByPlotKey(bridgeIdx) {
    const map = new Map();
    if (!bridgeIdx) return map;
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      let imgs;
      try {
        imgs = doc.querySelectorAll(SOIL_IMG_SELECTOR);
      } catch (_e) {
        continue;
      }
      for (let ii = 0; ii < imgs.length; ii += 1) {
        const img = imgs[ii];
        const u = imgAssetUrl(img);
        if (!isBareSoilImgUrlStrict(u)) continue;
        // Bỏ qua ô đất khô / infertile (thiếu giếng nước hoặc giếng chưa nâng cấp)
        if (isDrySoilImgUrl(u)) continue;
        const container = innermostWFullHFullFromImg(img);
        if (!container || plotHtmlHasGrowingCrop(container)) continue;
        const root = plotRootFromInner(img);
        if (!root || !d.isVisible(root) || !d.isInViewportLoose(root, VIEWPORT_PAD_PLOT)) continue;
        // ── Bỏ qua fruit patch / hoa / nhà kính ──
        if (isFruitPatchOrFlowerElement(container) || isFruitPatchOrFlowerElement(root)) continue;
        const pk = plotKeyFromPlotRoot(root, bridgeIdx.allKeys) || plotKeyFromDomEl(img, bridgeIdx.allKeys);
        if (!pk || bridgeIdx.occupied.has(pk)) continue;
        if (bridgeIdx.emptyKeys?.size > 0 && !bridgeIdx.emptyKeys.has(pk)) continue;
        const dist = d.centerDistance(root);
        const prev = map.get(pk);
        if (!prev || dist < prev.dist) map.set(pk, { root, dist });
      }
    }
    return map;
  }

  function findReadyHarvestTargets() {
    const docs = d.collectDocumentsForGameDom();
    const list = [];
    const seen = new Set();
    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      let imgs;
      try {
        imgs = doc.querySelectorAll("img[src*='plant.png']");
      } catch (_e) {
        continue;
      }
      for (let ii = 0; ii < imgs.length; ii += 1) {
        const img = imgs[ii];
        const u = imgAssetUrl(img);
        if (!/\/crops\/[^/]+\/plant\.png|\/volcano\/crops\/[^/]+\/plant\.png/.test(u)) continue;
        const root = plotRootFromInner(img);
        if (!root || !d.isVisible(root) || !d.isInViewportLoose(root, VIEWPORT_PAD_PLOT)) continue;

        // Tránh nhầm với Compost Bin có biểu tượng crop (sử dụng nhận diện ảnh thay vì React Fiber để an toàn hơn)
        let isCompost = false;
        try {
          const checkNode = root.parentElement ? (root.parentElement.parentElement || root.parentElement) : root;
          const allImgs = checkNode.querySelectorAll('img');
          for (let k = 0; k < allImgs.length; k++) {
            const src = String(allImgs[k].src || '').toLowerCase();
            if (src.includes("compost") || src.includes("turbo") || src.includes("premium")) {
               isCompost = true;
               break;
            }
          }
        } catch(e) {}
        if (isCompost) continue;

        if (seen.has(root)) continue;
        seen.add(root);
        list.push({ root, dist: d.centerDistance(root) });
      }
    }
    list.sort((a, b) => a.dist - b.dist);
    return list.map((x) => x.root);
  }

  function plotHtmlHasGrowingCrop(container) {
    if (!container) return false;
    let html = "";
    try {
      html = String(container.innerHTML || "").toLowerCase();
    } catch (_e) {
      return true; // an toàn
    }
    // Cây đang mọc
    if (CROP_LIFECYCLE_RE.test(html)) return true;
    
    // Nhận diện icon thời tiết phá hoại đè lên ô đất (lốc xoáy, sóng thần, đóng băng/nhiệt kế)
    // Nếu có các icon này, ô đất đang bị chặn, coi như không gieo được.
    if (
      html.includes("thermometer") || 
      html.includes("tornado") || 
      html.includes("tsunami") || 
      html.includes("freeze") ||
      html.includes("frozen")
    ) {
      return true;
    }

    return false;
  }

  /** Heuristic DOM khi bridge chưa sẵn sàng hoặc chưa có danh sách ô trống. */
  function isSafeUnkeyedCropSoilRoot(root) {
    if (!root || isFruitPatchOrFlowerElement(root)) return false;
    let imgs;
    try {
      imgs = root.querySelectorAll(SOIL_IMG_SELECTOR);
    } catch (_e) {
      return false;
    }
    for (let i = 0; i < imgs.length; i += 1) {
      const img = imgs[i];
      const u = imgAssetUrl(img);
      if (!isBareSoilImgUrlStrict(u) || isDrySoilImgUrl(u)) continue;
      const container = innermostWFullHFullFromImg(img);
      if (!container || plotHtmlHasGrowingCrop(container)) continue;
      if (isFruitPatchOrFlowerElement(container)) continue;
      return true;
    }
    return false;
  }

  function findEmptyPlotRootsByDomHeuristic() {
    const bridgeIdx = buildBridgeCropIndex();
    const docs = d.collectDocumentsForGameDom();
    const verified = [];
    const fallback = [];
    const seenV = new Set();
    const seenF = new Set();
    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      let imgs;
      try {
        imgs = doc.querySelectorAll(SOIL_IMG_SELECTOR);
      } catch (_e) {
        continue;
      }
      for (let ii = 0; ii < imgs.length; ii += 1) {
        const img = imgs[ii];
        const u = imgAssetUrl(img);
        if (!isBareSoilImgUrlStrict(u)) continue;
        // Bỏ qua ô đất khô / infertile (thiếu giếng nước hoặc giếng chưa nâng cấp)
        if (isDrySoilImgUrl(u)) continue;
        const container = innermostWFullHFullFromImg(img);
        if (!container || plotHtmlHasGrowingCrop(container)) continue;
        const root = plotRootFromInner(img);
        if (!root || !d.isVisible(root) || !d.isInViewportLoose(root, VIEWPORT_PAD_PLOT)) continue;
        // ── Bỏ qua fruit patch / hoa / nhà kính ──
        if (isFruitPatchOrFlowerElement(container) || isFruitPatchOrFlowerElement(root)) continue;
        if (bridgeIdx) {
          const pk = plotKeyFromPlotRoot(root, bridgeIdx.allKeys) || plotKeyFromDomEl(img, bridgeIdx.allKeys);
          if (pk) {
            if (bridgeIdx.occupied.has(pk)) continue;
            if (bridgeIdx.emptyKeys?.size > 0 && !bridgeIdx.emptyKeys.has(pk)) continue;
            if (seenV.has(root)) continue;
            seenV.add(root);
            verified.push({ root, dist: d.centerDistance(root) });
            continue;
          }
          if (bridgeIdx.emptyKeys?.size > 0 && isSafeUnkeyedCropSoilRoot(root)) {
            if (seenF.has(root)) continue;
            seenF.add(root);
            fallback.push({ root, dist: d.centerDistance(root) });
          }
          continue;
        }
        if (!isSafeUnkeyedCropSoilRoot(root)) continue;
        if (seenF.has(root)) continue;
        seenF.add(root);
        fallback.push({ root, dist: d.centerDistance(root) });
      }
    }
    verified.sort((a, b) => a.dist - b.dist);
    fallback.sort((a, b) => a.dist - b.dist);

    return verified.map((x) => x.root).concat(fallback.map((x) => x.root));
  }

  /**
   * Quét mọi img: URL đất lỏng hơn + viewport pad lớn — khi heuristic chính vẫn 0 ô.
   */
  function findEmptyPlotRootsAggressive() {
    const bridgeIdx = buildBridgeCropIndex();
    const docs = d.collectDocumentsForGameDom();
    const verified = [];
    const fallback = [];
    const seenV = new Set();
    const seenF = new Set();
    const pad = VIEWPORT_PAD_PLOT_AGGRESSIVE;
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
        if (!isBareSoilImgUrlLoose(u)) continue;
        // Bỏ qua ô đất khô / infertile (thiếu giếng nước hoặc giếng chưa nâng cấp)
        if (isDrySoilImgUrl(u)) continue;
        const container = innermostWFullHFullFromImg(img);
        if (!container || plotHtmlHasGrowingCrop(container)) continue;
        const root = plotRootFromInner(img);
        if (!root || !d.isVisible(root) || !d.isInViewportLoose(root, pad)) continue;
        // ── Bỏ qua fruit patch / hoa / nhà kính ──
        if (isFruitPatchOrFlowerElement(container) || isFruitPatchOrFlowerElement(root)) continue;
        if (bridgeIdx) {
          const pk = plotKeyFromPlotRoot(root, bridgeIdx.allKeys) || plotKeyFromDomEl(img, bridgeIdx.allKeys);
          if (pk) {
            if (bridgeIdx.occupied.has(pk)) continue;
            if (bridgeIdx.emptyKeys?.size > 0 && !bridgeIdx.emptyKeys.has(pk)) continue;
            if (seenV.has(root)) continue;
            seenV.add(root);
            verified.push({ root, dist: d.centerDistance(root) });
            continue;
          }
          if (bridgeIdx.emptyKeys?.size > 0 && isBareSoilImgUrlStrict(u) && isSafeUnkeyedCropSoilRoot(root)) {
            if (seenF.has(root)) continue;
            seenF.add(root);
            fallback.push({ root, dist: d.centerDistance(root) });
          }
          continue;
        }
        if (!isSafeUnkeyedCropSoilRoot(root)) continue;
        if (seenF.has(root)) continue;
        seenF.add(root);
        fallback.push({ root, dist: d.centerDistance(root) });
      }
    }
    verified.sort((a, b) => a.dist - b.dist);
    fallback.sort((a, b) => a.dist - b.dist);

    return verified.map((x) => x.root).concat(fallback.map((x) => x.root));
  }

  /**
   * Gieo theo thứ tự bridge (y,x,plotKey) khi map được DOM+fiber; nếu không map được vẫn gieo bằng heuristic.
   * Bridge báo hết ô trống → thường không quét DOM để gieo (tránh lệch state).
   * Ngoại lệ: ngay sau khi vừa thu hoạch, cho phép fallback theo DOM vài giây vì bridge có thể cập nhật chậm.
   */
  function findEmptyPlotRoots() {
    const bridgeReady = !!S.gameBridge?.isReady;
    const bridgeIdx = buildBridgeCropIndex();
    const emptyPlots = listEmptyCropPlotsFromState();
    const justHarvested =
      runtime.lastAction === "crop_harvest_dom" && now() - Number(runtime.lastActionAt || 0) <= 3500;

    if (bridgeReady && bridgeIdx && emptyPlots.length === 0) {
      // ── Kiểm tra: emptyPlots = 0 vì thời tiết / thiếu giếng nước hay vì bridge chậm? ──
      // Nếu có ô bị chặn bởi thời tiết / infertile → KHÔNG fallback DOM (tránh spam).
      const st = S.gameBridge?.getLatestState?.();
      const hasBlockedPlots = !!(st?.activeWeather && !st.activeWeather.isProtected && st.activeWeather.blockedPlotCount > 0);
      // Đếm ô trống thực tế trong crops array (trước khi bridge lọc)
      let rawEmptyCount = 0;
      if (Array.isArray(st?.crops)) {
        for (let ci = 0; ci < st.crops.length; ci += 1) {
          const c = st.crops[ci];
          const n = String(c?.cropName || "").trim();
          const p = Number(c?.plantedAt) || 0;
          if (!n && p <= 0) rawEmptyCount += 1;
        }
      }
      const plotsFilteredByBridge = rawEmptyCount > 0 && emptyPlots.length === 0;
      if (hasBlockedPlots || plotsFilteredByBridge) {
        // Ô trống bị chặn bởi thời tiết hoặc infertile — KHÔNG fallback DOM
        return [];
      }

      if (justHarvested) {
        let roots = findEmptyPlotRootsByDomHeuristic();
        if (roots.length > 0) {
          logThrottled(
            "crop_dom_post_harvest_dom_fallback",
            6000,
            "Ruộng DOM: vừa thu hoạch, bridge chưa kịp báo ô trống — tạm gieo theo DOM",
            { afterMs: Math.round(now() - Number(runtime.lastActionAt || 0)) },
          );
          return roots;
        }
        roots = findEmptyPlotRootsAggressive();
        if (roots.length > 0) {
          logThrottled(
            "crop_dom_post_harvest_dom_fallback",
            6000,
            "Ruộng DOM: vừa thu hoạch, quét aggressive thấy ô trống trước khi bridge cập nhật",
            { count: roots.length, afterMs: Math.round(now() - Number(runtime.lastActionAt || 0)) },
          );
          return roots;
        }
      }
      return [];
    }

    if (bridgeReady && bridgeIdx && emptyPlots.length > 0) {
      const byKey = collectVisibleEmptyPlotRootsByPlotKey(bridgeIdx);
      const ordered = [];
      for (let i = 0; i < emptyPlots.length; i += 1) {
        const hit = byKey.get(emptyPlots[i].plotKey);
        if (hit) ordered.push(hit.root);
      }
      if (ordered.length > 0) return ordered;
      
      logThrottled(
        "crop_dom_bridge_dom_fallback",
        14000,
        "Ruộng DOM: bridge còn ô trống nhưng chưa khớp DOM/fiber trong view — gieo theo quét đất (đã nới tìm nút + fiber)",
        { bridgeEmpty: emptyPlots.length },
      );
      let roots = findEmptyPlotRootsByDomHeuristic();
      if (roots.length > 0) return roots;
      roots = findEmptyPlotRootsAggressive();
      if (roots.length > 0) {
        logThrottled("crop_dom_aggressive_ok", 20000, "Ruộng DOM: quét dự phòng (aggressive) tìm được ô trống", {
          count: roots.length,
        });
      }
      return roots;
    }

    let roots = findEmptyPlotRootsByDomHeuristic();
    if (roots.length > 0) return roots;
    roots = findEmptyPlotRootsAggressive();
    if (roots.length > 0) {
      logThrottled("crop_dom_aggressive_ok", 20000, "Ruộng DOM: quét dự phòng (aggressive) tìm được ô trống", {
        count: roots.length,
      });
    }
    return roots;
  }

  function findMarketClickTarget() {
    const docs = d.collectDocumentsForGameDom();
    const list = [];
    const seen = new Set();
    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      let imgs;
      try {
        imgs = doc.querySelectorAll("img[src], img[srcset]");
      } catch (_e) {
        continue;
      }
      for (let ii = 0; ii < imgs.length; ii += 1) {
        const img = imgs[ii];
        const u = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
        if (u.includes("fish_market")) continue;
        const ok =
          u.includes("bettys_market") ||
          (u.includes("/buildings/") && u.includes("market.webp") && !u.includes("fish")) ||
          (u.includes("desert") && u.includes("market.webp")) ||
          (u.includes("volcano") && u.includes("market.webp"));
        if (!ok) continue;
        let el = img;
        let clickTarget = null;
        for (let depth = 0; depth < 24 && el; depth += 1) {
          if (
            el.classList &&
            el.classList.contains("cursor-pointer") &&
            d.isClickablePointerEventsOk(el) &&
            !el.classList.contains("pointer-events-none")
          ) {
            clickTarget = el;
            break;
          }
          el = el.parentElement;
        }
        if (
          clickTarget &&
          d.isVisible(clickTarget) &&
          d.isInViewportLoose(clickTarget, 140) &&
          !seen.has(clickTarget)
        ) {
          seen.add(clickTarget);
          list.push({ root: clickTarget, dist: d.centerDistance(clickTarget) });
        }
      }
    }
    list.sort((a, b) => a.dist - b.dist);
    return list[0]?.root || null;
  }

  function findBasketButtonClickTarget() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      let imgs;
      try {
        imgs = doc.querySelectorAll('img[src*="basket"], img[src*="backpack"], img[src*="bag"], img[src*="inventory"]');
      } catch (_e) {
        continue;
      }
      for (let ii = 0; ii < imgs.length; ii += 1) {
        const img = imgs[ii];
        const u = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
        if (!u.includes("basket") && !u.includes("backpack") && !u.includes("bag") && !u.includes("inventory")) continue;
        if (!d.isVisible(img)) continue;
        let el = img.parentElement;
        for (let depth = 0; depth < 12 && el; depth += 1) {
          if (el.classList?.contains("cursor-pointer") && d.isClickablePointerEventsOk(el)) {
            if (d.isInViewportLoose(el, 80)) return el;
            break;
          }
          el = el.parentElement;
        }
      }
    }
    return null;
  }

  function imgUrlMatchesSeedSlugInAssets(u, slug, allowCropArt) {
    const s = String(u || "").toLowerCase();
    const sl = String(slug || "").toLowerCase();
    if (!sl || s.startsWith("data:")) return false;
    if (!s.includes("/crops/") && !s.includes("crops/")) return false;

    const isBroccoli = sl === "broccoli" || sl === "brocolli";
    const slugMatch = isBroccoli
      ? (s.includes("/broccoli/") || s.includes("/brocolli/"))
      : s.includes(`/${sl}/`);
    if (!slugMatch) return false;

    const seedPath = /\/seed\.(png|webp|jpg)(?:\?|$)/i.test(s) || s.includes("seed");
    const cropPath = allowCropArt && (/\/crop\.(png|webp|jpg)(?:\?|$)/i.test(s) || s.includes("crop"));
    return seedPath || cropPath;
  }

  function findSeedPackImgInDoc(doc, slug, allowCropArt) {
    const allowCrop = !!allowCropArt;
    let imgs;
    try {
      imgs = doc.querySelectorAll("img[src], img[srcset]");
    } catch (_e) {
      return null;
    }
    for (let ii = 0; ii < imgs.length; ii += 1) {
      const img = imgs[ii];
      const u = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
      if (!imgUrlMatchesSeedSlugInAssets(u, slug, allowCrop)) continue;
      if (!d.isVisible(img)) continue;
      return img;
    }
    return null;
  }

  /** Giống findSeedPackImgInDoc nhưng bỏ qua ô Restock / khóa — dùng khi chọn hạt trong giỏ. */
  function findSelectableSeedPackImgInDoc(doc, slug, allowCropArt) {
    const allowCrop = !!allowCropArt;
    let imgs;
    try {
      imgs = doc.querySelectorAll("img[src], img[srcset]");
    } catch (_e) {
      return null;
    }
    for (let ii = 0; ii < imgs.length; ii += 1) {
      const img = imgs[ii];
      const u = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
      if (!imgUrlMatchesSeedSlugInAssets(u, slug, allowCrop)) continue;
      if (!d.isVisible(img)) continue;
      if (isBettyShopSlotRestockOrLocked(img)) continue;
      return img;
    }
    return null;
  }

  function shopBrownSlotFromItemImg(img) {
    let el = img;
    for (let depth = 0; depth < 22 && el; depth += 1) {
      if (
        el.classList &&
        el.classList.contains("bg-brown-600") &&
        el.classList.contains("cursor-pointer")
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  /** Ô shop / hàng giỏ hạt: Restock, khóa, phủ trắng, hoặc nhãn «Restock» gần ảnh. */
  function isBettyShopSlotRestockOrLocked(img) {
    if (!img) return true;
    const box = shopBrownSlotFromItemImg(img);
    if (box) {
      if (box.classList.contains("cursor-not-allowed")) return true;
      try {
        if (box.querySelector(".bg-overlay-white")) return true;
        // Kiểm tra xem ô chứa có ảnh ổ khóa (lock icon) nào khác ảnh chính không
        const lockImg = box.querySelector('img[src*="lock"]');
        if (lockImg && lockImg !== img) return true;
      } catch (_e) {
        // ignore
      }
    }
    let el = img.parentElement;
    for (let d = 0; d < 14 && el; d += 1) {
      const t = String(el.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (t.length > 0 && t.length < 56 && /\brestock|replenish|locked|lacking|yêu cầu\b/.test(t)) return true;
      try {
        const lockImg = el.querySelector('img[src*="lock"]');
        if (lockImg && lockImg !== img) return true;
      } catch (_e) { }
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Chọn hạt gieo dựa trên inventory bridge, không scan DOM để đánh giá mặt hàng khả dụng.
   * Nếu bridge chưa có dữ liệu, vẫn fallback về thứ tự mặc định.
   */
  function pickSeedForPlantingFromBridge() {
    const buyOrd = allowedCropDomSeedsOrderedShortThenLong();
    if (buyOrd.length <= 0) return pickSeedForPlanting();

    const available = [];
    for (let i = 0; i < buyOrd.length; i += 1) {
      const name = buyOrd[i];
      if (seedCountFromBridge(name) > 0) available.push(name);
    }
    if (available.length <= 0) return pickSeedForPlanting();

    available.sort((a, b) => {
      const sa = Number.isFinite(CROP_DOM_BASE_PLANT_SEC[a]) ? CROP_DOM_BASE_PLANT_SEC[a] : Number.MAX_SAFE_INTEGER;
      const sb = Number.isFinite(CROP_DOM_BASE_PLANT_SEC[b]) ? CROP_DOM_BASE_PLANT_SEC[b] : Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return buyOrd.indexOf(a) - buyOrd.indexOf(b);
    });

    return available[0];
  }

  /**
   * Tab Buy Betty: có `#SeasonSeeds` + lưới ô nâu — kể cả Sold out chỉ còn nút Restock (không còn «Mua 1»).
   * @see markup: `#SeasonSeeds` ⊂ cột trái; nút Restock/Mua 1 ở cột phải (không nằm trong `#SeasonSeeds`).
   */
  function dialogHasBuyOneSeedUi(dlg) {
    if (!dlg || !d.isVisible(dlg)) return false;
    try {
      const season = dlg.querySelector("#SeasonSeeds");
      if (season && season.querySelector(".bg-brown-600")) return true;
    } catch (_e) {
      // ignore
    }
    let hasBuy1 = false;
    try {
      const buttons = dlg.querySelectorAll("button,[role='button']");
      for (let bi = 0; bi < buttons.length; bi += 1) {
        const b = buttons[bi];
        if (!d.isVisible(b) || b.disabled) continue;
        if (/buy\s*1|mua\s*1|comprar\s*1|acheter\s*1|kaufen\s*1|收集\s*1/i.test(d.textOf(b))) {
          hasBuy1 = true;
          break;
        }
      }
    } catch (_e2) {
      return false;
    }
    if (!hasBuy1) return false;
    try {
      return !!(
        dlg.querySelector('img[src*="/crops/"][src*="/seed."]') ||
        dlg.querySelector('img[src*="/crops/"][src*="/crop."]')
      );
    } catch (_e3) {
      return false;
    }
  }

  /** Cửa NPC mua hạt (tab Buy / lưới mùa) — có `#SeasonSeeds`, kể cả khi chỉ «Restock» / Sold out (không còn nút Mua 1). */
  function dialogIsBettyMarketSeedShop(dlg) {
    if (!dlg || !d.isVisible(dlg)) return false;
    try {
      return !!dlg.querySelector("#SeasonSeeds");
    } catch (_e) {
      return false;
    }
  }

  /** Mọi ảnh trong dialog Betty mua hạt (có `#SeasonSeeds`) — kể cả panel mô tả bên phải, không phải giỏ. */
  function imageExcludedAsInventoryBecauseBettyMarket(img) {
    try {
      const dlg = img?.closest?.('[role="dialog"]');
      if (dlg && d.isVisible(dlg) && dialogIsBettyMarketSeedShop(dlg)) return true;
    } catch (_e) {
      // ignore
    }
    return false;
  }

  /**
   * Tìm ảnh hạt giống trong giỏ inventory (2 lượt):
   * Lượt 1: chỉ khớp seed.webp/png  (phân biệt tuyệt đối hạt vs rau thu hoạch).
   * Lượt 2: cho phép crop.webp/png nhưng kiểm tra text "Seed" trong slot cha
   *          để phân biệt "Potato Seed" (có "Seed") với "Potato" thu hoạch (không có).
   */
  function findInventorySelectableSeedImg(doc, slug) {
    let imgs;
    try {
      imgs = doc.querySelectorAll("img[src], img[srcset]");
    } catch (_e) {
      return null;
    }

    // Lượt 1: seed.webp/png — chắc chắn là hạt giống
    for (let ii = 0; ii < imgs.length; ii += 1) {
      const img = imgs[ii];
      if (imageExcludedAsInventoryBecauseBettyMarket(img)) continue;
      const u = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
      if (!imgUrlMatchesSeedSlugInAssets(u, slug, false)) continue; // chỉ seed.webp
      if (!d.isVisible(img)) continue;
      if (isBettyShopSlotRestockOrLocked(img)) continue;
      return img;
    }

    // Lượt 2: crop.webp/png — chỉ chấp nhận nếu slot cha có chứa text "seed"
    // (SFL đôi khi hiển thị hạt bằng ảnh crop art trong inventory)
    for (let ii = 0; ii < imgs.length; ii += 1) {
      const img = imgs[ii];
      if (imageExcludedAsInventoryBecauseBettyMarket(img)) continue;
      const u = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
      if (!imgUrlMatchesSeedSlugInAssets(u, slug, true)) continue; // seed.webp + crop.webp
      if (imgUrlMatchesSeedSlugInAssets(u, slug, false)) continue; // đã xử lý lượt 1
      if (!d.isVisible(img)) continue;
      if (isBettyShopSlotRestockOrLocked(img)) continue;

      // Kiểm tra slot cha có chứa "Seed" không (title, tooltip, label...)
      let isSeedSlot = false;
      const altAttr = String(img.getAttribute("alt") || "").toLowerCase();
      if (altAttr.includes("seed")) { isSeedSlot = true; }
      if (!isSeedSlot) {
        let el = img.parentElement;
        for (let depth = 0; depth < 8 && el; depth += 1) {
          const t = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
          if (t.length > 1 && t.length < 80 && /\bseed\b/.test(t)) {
            isSeedSlot = true;
            break;
          }
          // Dừng khi tới container lớn (chứa nhiều item khác)
          const r = el.getBoundingClientRect();
          if (r.width > 300 || r.height > 300) break;
          el = el.parentElement;
        }
      }
      if (isSeedSlot) return img;
    }

    return null;
  }

  /**
   * Ô nâu chọn hạt trong giỏ — cùng kiểu markup Blacksmith (bg-brown + dark_border / viền panel).
   */
  function findCropInventoryBrownSlot(itemImg) {
    if (!itemImg) return null;
    let el = itemImg;
    for (let depth = 0; depth < 22 && el; depth += 1) {
      const cl = el.classList;
      const clsStr = el.getAttribute("class") || "";
      const st = (el.getAttribute("style") || "").toLowerCase();
      if (cl && cl.contains("cursor-pointer")) {
        if (cl.contains("cursor-not-allowed")) {
          el = el.parentElement;
          continue;
        }
        if (cl.contains("bg-brown-600")) return el;
        if (/\bbg-brown-/.test(clsStr) || (/\bbrown-/i.test(clsStr) && /\bbg-/.test(clsStr))) return el;
        if (st.includes("dark_border") || st.includes("panel/dark_border")) return el;
        try {
          const win = d.viewForElement(el);
          const bi = String(win.getComputedStyle(el).borderImageSource || "").toLowerCase();
          if (bi.includes("dark_border") && el.querySelector?.('img[alt="item"],img[src*="/crops/"]')) return el;
        } catch (_e) {
          // ignore
        }
      }
      el = el.parentElement;
    }
    el = itemImg;
    for (let depth = 0; depth < 16 && el; depth += 1) {
      const cl = el.classList;
      if (cl && cl.contains("cursor-pointer") && !cl.contains("cursor-not-allowed")) {
        const r = el.getBoundingClientRect();
        const hasCrop = !!el.querySelector?.('img[alt="item"],img[src*="/crops/"]');
        if (hasCrop && r.width >= 28 && r.width <= 100 && r.height >= 28 && r.height <= 100) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function getItemCountFromInventorySlot(brown) {
    if (!brown) return null;
    const text = (brown.textContent || "").trim();
    if (!text) return null;
    const matches = text.match(/\d+/g);
    if (matches && matches.length > 0) {
      const count = parseInt(matches[matches.length - 1], 10);
      if (Number.isInteger(count)) return count;
    }
    return null;
  }

  /** Góc selectbox quanh ô (anh em `img` selectbox_* trong `div.relative`) — giống Workbench. */
  function cropInventoryBrownSlotHasSelectboxCorners(brown) {
    if (!brown) return false;
    const wrap = brown.parentElement;
    if (!wrap) return false;
    try {
      const scoped =
        wrap.querySelector?.(":scope > img[src*='selectbox']") ||
        wrap.querySelector?.(":scope > img[src*='/select/']") ||
        brown.querySelector?.("img[src*='selectbox']") ||
        brown.querySelector?.("img[src*='/select/']");
      if (scoped) return true;
      for (let i = 0; i < wrap.children.length; i += 1) {
        const ch = wrap.children[i];
        if (ch === brown) continue;
        if (String(ch.tagName || "").toLowerCase() !== "img") continue;
        const s = String(ch.getAttribute("src") || "").toLowerCase();
        if (s.includes("selectbox") || s.includes("ui/select")) return true;
      }
    } catch (_e) {
      // ignore
    }
    return false;
  }

  function isCropSeedInventorySlotSelected(itemImg, slug) {
    if (!itemImg?.isConnected || !d.isVisible(itemImg)) return false;
    if (imageExcludedAsInventoryBecauseBettyMarket(itemImg)) return false;

    const u = String(itemImg.currentSrc || itemImg.getAttribute("src") || "").toLowerCase();
    let isSeed = false;

    if (imgUrlMatchesSeedSlugInAssets(u, slug, false)) {
      isSeed = true;
    } else if (imgUrlMatchesSeedSlugInAssets(u, slug, true)) {
      const altAttr = String(itemImg.getAttribute("alt") || "").toLowerCase();
      if (altAttr.includes("seed")) {
        isSeed = true;
      } else {
        let el = itemImg.parentElement;
        for (let depth = 0; depth < 8 && el; depth += 1) {
          const t = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
          if (t.length > 1 && t.length < 80 && /\bseed\b/.test(t)) {
            isSeed = true;
            break;
          }
          const r = el.getBoundingClientRect();
          if (r.width > 300 || r.height > 300) break;
          el = el.parentElement;
        }
      }
    }

    if (!isSeed) return false;

    const brown = findCropInventoryBrownSlot(itemImg);
    return cropInventoryBrownSlotHasSelectboxCorners(brown);
  }

  /** Có ô hạt nào của `slug` đang có selectbox góc (đã chọn). */
  function inventorySeedSlugAppearsSelected(slug) {
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
        if (!isCropSeedInventorySlotSelected(img, slug)) continue;
        return true;
      }
    }
    return false;
  }

  /** Hàng lưới hạt trong giỏ đã hiện (đừng bấm nút giỏ — tránh toggle đóng/mở nhấp nháy). */
  function isInventorySeedStripVisible() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let rows;
      try {
        rows = docs[di].querySelectorAll("div.flex.flex-wrap");
      } catch (_e) {
        continue;
      }
      for (let ri = 0; ri < rows.length; ri += 1) {
        const row = rows[ri];
        if (!d.isVisible(row)) continue;
        const dlgRow = row.closest('[role="dialog"]');
        if (dlgRow && dialogIsBettyMarketSeedShop(dlgRow)) continue;
        if (dlgRow && d.isVisible(dlgRow)) {
          const t = String(dlgRow.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
          if (
            (t.includes("land tools") || t.includes("water tools") || t.includes("animal tools")) &&
            (t.includes("craft") || t.includes("in stock"))
          ) {
            continue;
          }
        }
        // Check 1: có img hạt crop trong row (kiểm tra chính)
        let hasSeedImg = false;
        try {
          hasSeedImg = !!row.querySelector(
            'img[src*="crops/"][src*="seed"],img[src*="crops/"][src*="crop"],img[src*="crops/"],img[src*="/crops/"]',
          );
        } catch (_e2) {
          // ignore
        }
        if (hasSeedImg) return true;
        // Check 2 (fallback): row có đủ ô nâu (bg-brown) — QuickSelect inventory
        // Tránh nhầm với UI nhỏ (workbench slot đơn lẻ), yêu cầu >= 3 ô nâu
        try {
          const brownSlots = row.querySelectorAll(".bg-brown-600,.bg-brown-400,.bg-brown-300");
          if (brownSlots.length >= 3) {
            // Đảm bảo đây không phải shop Betty
            const nearestDlg = row.closest('[role="dialog"]');
            if (!nearestDlg || !dialogIsBettyMarketSeedShop(nearestDlg)) {
              return true;
            }
          }
        } catch (_e3) {
          // ignore
        }
      }
    }
    return false;
  }

  /** Giỏ inventory: double-click để chọn hạt chắc chắn không bị dính trạng thái hover. */
  async function clickCropInventoryBrown(el) {
    if (!el || !d.isVisible(el)) return;
    d.doubleClickAtCenter(el) || d.doubleClick(el) || d.nativeClickClose(el);
    await sleep(rand(180, 320));
  }

  /**
   * Chỉ lưới trong `#SeasonSeeds` (cột trái) — không quét ảnh panel phải / seed.png chuỗi tiến trình (tránh nhầm slug).
   */
  function findPurchasableBettyShopSeedImg(slug) {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let ds;
      try {
        ds = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let j = 0; j < ds.length; j += 1) {
        const dlg = ds[j];
        if (!dialogIsBettyMarketSeedShop(dlg)) continue;
        const seasonRoot = dlg.querySelector("#SeasonSeeds");
        if (!seasonRoot) continue;
        let imgs;
        try {
          imgs = seasonRoot.querySelectorAll("img[src], img[srcset]");
        } catch (_e2) {
          continue;
        }
        for (let ii = 0; ii < imgs.length; ii += 1) {
          const img = imgs[ii];
          const u = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
          if (!imgUrlMatchesSeedSlugInAssets(u, slug, true)) continue;
          if (!d.isVisible(img)) continue;
          if (isBettyShopSlotRestockOrLocked(img)) continue;
          return img;
        }
      }
    }
    return null;
  }

  function clickInventoryBoxFromSeedImg(img) {
    return findCropInventoryBrownSlot(img);
  }

  function clickSeedImageRoot(targetSeedImg) {
    if (!targetSeedImg) return;
    // Bắt đầu từ parentElement (bỏ qua img) vì React onClick gắn trên div wrapper,
    // không phải trên thẻ img. Click img trực tiếp chỉ gây hover, không select hạt.
    let el = targetSeedImg.parentElement;
    let clickTarget = null;
    for (let depth = 0; depth < 16 && el; depth += 1) {
      if (
        el.classList?.contains("cursor-pointer") &&
        d.isVisible(el) &&
        d.isClickablePointerEventsOk(el) &&
        !el.classList?.contains("cursor-not-allowed")
      ) {
        const r = el.getBoundingClientRect();
        // Chọn element nhỏ nhất có thể click (ô hạt), bỏ qua container lớn
        if (r.width > 0 && r.width <= 140 && r.height > 0 && r.height <= 140) {
          clickTarget = el;
          break;
        }
      }
      el = el.parentElement;
    }
    // Fallback: nếu không tìm thấy wrapper phù hợp, click thẻ img
    if (!clickTarget) clickTarget = targetSeedImg;
    d.doubleClickAtCenter(clickTarget) || d.doubleClick(clickTarget) || d.nativeClickClose(clickTarget);
  }

  async function closeInventorySeedStripIfOpen() {
    if (!isInventorySeedStripVisible()) return true;

    const docs = d.collectDocumentsForGameDom();

    // Thử bấm nút Equip / Select / Plant nếu có (SFL UI mới thường có nút này để xác nhận)
    for (let di = 0; di < docs.length; di += 1) {
      try {
        const btns = docs[di].querySelectorAll('button');
        for (let i = 0; i < btns.length; i += 1) {
          const t = (btns[i].textContent || '').trim().toLowerCase();
          if (t === 'select' || t === 'equip' || t === 'chọn' || t === 'trang bị' || t === 'plant' || t === 'gieo') {
            if (d.isVisible(btns[i])) {
              d.click(btns[i]);
              await sleep(rand(300, 500));
              if (!isInventorySeedStripVisible()) {
                logFlow("Ruộng DOM: đã đóng (qua nút Equip/Select)");
                return true;
              }
            }
          }
        }
      } catch (e) {}
    }

    // Ưu tiên tìm nút X trong các dialog/drawer đang mở (ảnh hoặc aria-label)
    let clickTarget = null;
    for (let di = 0; di < docs.length; di += 1) {
      try {
        const closeSelectors = [
          'img[src*="cancel"]', 'img[src*="close"]', 'img[src*="cross"]', 'img[src*="x.png"]', 'img[src*="x.webp"]',
          'button[aria-label="close"]', 'button[aria-label="Close"]', 'button[title="close"]', 'button[title="Close"]',
          '.close-button', '.close-btn'
        ];
        const cancelImgs = docs[di].querySelectorAll(closeSelectors.join(', '));
        for (let i = 0; i < cancelImgs.length; i += 1) {
          if (d.isVisible(cancelImgs[i])) {
            let el = cancelImgs[i].parentElement;
            let foundClickable = false;
            for (let depth = 0; depth < 5 && el; depth += 1) {
              if (el.tagName === 'BUTTON' || (el.classList?.contains("cursor-pointer") && d.isClickablePointerEventsOk(el))) {
                clickTarget = el;
                foundClickable = true;
                break;
              }
              el = el.parentElement;
            }
            if (!foundClickable) {
              clickTarget = cancelImgs[i]; // Bấm thẳng vào ảnh/nút nếu không thấy wrapper
            }
          }
          if (clickTarget) break;
        }
      } catch (_e) {}
      if (clickTarget) break;
    }

    if (clickTarget) {
      for (let round = 0; round < 3; round += 1) {
        d.nativeClickClose(clickTarget) || d.click(clickTarget);
        await sleep(rand(220, 420));
        if (!isInventorySeedStripVisible()) {
          logFlow("Ruộng DOM: đã đóng cửa sổ chọn hạt (qua nút X)", { round });
          return true;
        }
      }
    }

    // Fallback 1: Nhấn ESC để đóng drawer
    for (let di = 0; di < docs.length; di += 1) {
      try {
        docs[di].documentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
        docs[di].documentElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      } catch (e) {}
    }
    await sleep(rand(220, 420));
    if (!isInventorySeedStripVisible()) {
      logFlow("Ruộng DOM: đã đóng cửa sổ chọn hạt (qua phím ESC)");
      return true;
    }

    // Fallback 1.5: Click outside (góc trên giữa màn hình)
    for (let di = 0; di < docs.length; di += 1) {
      try {
        const doc = docs[di];
        const x = Math.floor(doc.defaultView.innerWidth / 2);
        const y = 20;
        const el = doc.elementFromPoint(x, y);
        if (el) {
          d.nativeClickClose(el) || d.click(el);
        }
      } catch (e) {}
    }
    await sleep(rand(220, 420));
    if (!isInventorySeedStripVisible()) {
      logFlow("Ruộng DOM: đã đóng cửa sổ chọn hạt (qua click ngoài)");
      return true;
    }

    // Fallback 2: bấm lại nút giỏ
    clickTarget = findBasketButtonClickTarget();
    if (clickTarget) {
      for (let round = 0; round < 3; round += 1) {
        d.nativeClickClose(clickTarget) || d.click(clickTarget);
        await sleep(rand(220, 420));
        if (!isInventorySeedStripVisible()) {
          logFlow("Ruộng DOM: đã đóng cửa sổ chọn hạt (qua nút Giỏ)", { round });
          return true;
        }
      }
    }

    return !isInventorySeedStripVisible();
  }

  async function ensureSeedSelectedDom(seedName) {
    const slug = seedNameToSlug(seedName);

    if (isBettySeedShopDialogOpen()) {
      logThrottled(
        "crop_dom_seed_shop_blocks_inventory",
        10000,
        "Ruộng DOM: đang mở cửa mua hạt Betty — đóng shop rồi mới chọn hạt trong giỏ để gieo",
        { seedName },
      );
      return false;
    }

    if (S.gameBridge?.isReady) {
      await S.gameBridge?.requestState?.().catch(() => { });
    }

    if (seedCountFromBridge(seedName) <= 0) {
      runtime.cropDomLastSelectedSeedName = null;
      runtime.cropDomLastSelectedSeedAt = 0;
      logThrottled(
        "crop_dom_no_seed_inventory",
        10000,
        "Ruộng DOM: không có hạt trong inventory để chọn",
        { seedName },
      );
      return false;
    }

    // ── Smart cache ──
    // Inventory đóng + cache khớp → tin cache, không mở lại (tránh nhảy nhảy inventory mọi lần gieo).
    // Inventory mở → verify selectbox nhanh rồi đóng.
    // Cache bị xóa khi: thu hoạch (tryHarvestOne), dialog "Wrong seed", đổi mùa, đổi loại hạt.
    // Cache timeout 45s: sau 45s buộc verify lại để tránh trường hợp game reset active item mà
    // bot vẫn nghĩ đang cầm hạt → click ô đất → game mở holder popup thay vì gieo.
    const SEED_CACHE_TTL_MS = 45_000;
    if (runtime.cropDomLastSelectedSeedName === seedName) {
      const cacheAge = now() - (runtime.cropDomLastSelectedSeedAt || 0);
      if (isInventorySeedStripVisible()) {
        // Inventory đang mở (user mở thủ công, hoặc chưa đóng kịp) → verify nhanh rồi đóng
        await sleep(rand(80, 140));
        if (!inventorySeedSlugAppearsSelected(slug)) {
          // Selectbox không thấy → xóa cache, chọn lại
          logFlow("Ruộng DOM: cache hạt — inventory mở nhưng không thấy selectbox — chọn lại", { seedName });
          runtime.cropDomLastSelectedSeedName = null;
          runtime.cropDomLastSelectedSeedAt = 0;
          // Thực hiện chọn lại bên dưới
        } else {
          runtime.cropDomLastSelectedSeedAt = now(); // gia hạn TTL khi vừa verify OK
          await closeInventorySeedStripIfOpen();
          return true;
        }
      } else if (cacheAge < SEED_CACHE_TTL_MS) {
        // Inventory đóng + cache còn mới → tin cache (hạt đang cầm), không mở lại
        return true;
      } else {
        // Cache quá cũ (> 45s) → có thể game đã reset active item — xóa cache, verify lại
        logFlow("Ruộng DOM: cache hạt quá hạn (" + Math.round(cacheAge / 1000) + "s) — verify lại", { seedName });
        runtime.cropDomLastSelectedSeedName = null;
        runtime.cropDomLastSelectedSeedAt = 0;
      }
    }

    // ── Mở inventory nếu chưa mở (cần thấy selectbox để verify) ──
    if (!isInventorySeedStripVisible()) {
      const basketEl = findBasketButtonClickTarget();
      if (basketEl) {
        d.nativeClickClose(basketEl) || d.click(basketEl);
        // Chờ tối đa 3 giây để inventory render — tăng từ 15×200ms lên 20×200ms + thêm delay cuối
        for (let wait = 0; wait < 20; wait += 1) {
          await sleep(200);
          if (isInventorySeedStripVisible()) break;
        }
        // Đợi thêm để UI ổn định dù chưa thấy seed strip (kho có thể mở nhưng chưa render img kịp)
        await sleep(rand(300, 500));
      } else {
        logThrottled("crop_dom_no_basket", 10000, "Ruộng DOM: Không tìm thấy nút giỏ đồ (inventory) trên màn hình");
      }
    }

    // ── Chưa chọn hoặc item khác đang chọn → tiến hành click chọn hạt giống ──
    logFlow("Ruộng DOM: tiến hành click chọn hạt giống", { seedName });
    runtime.cropDomLastSelectedSeedName = null;

    // Tìm ô hạt trong inventory strip
    const docs = d.collectDocumentsForGameDom();
    let targetSeedImg = null;
    for (let di = 0; di < docs.length; di += 1) {
      targetSeedImg = findInventorySelectableSeedImg(docs[di], slug);
      if (targetSeedImg) break;
    }

    if (!targetSeedImg) {
      // ── Retry: đợi thêm để inventory UI render hoàn toàn rồi tìm lại ──
      // Trường hợp thường gặp: mở kho, UI chưa kịp render hạt vào DOM → tìm ngay sẽ trả null
      await sleep(rand(300, 500));
      for (let di = 0; di < docs.length; di += 1) {
        targetSeedImg = findInventorySelectableSeedImg(docs[di], slug);
        if (targetSeedImg) break;
      }
    }

    if (!targetSeedImg) {
      // ── Fallback mở rộng: tìm bất kỳ ảnh crop nào khớp slug (không kiểm tra Restock) ──
      for (let di = 0; di < docs.length; di += 1) {
        targetSeedImg = findSeedPackImgInDoc(docs[di], slug, false) || findSeedPackImgInDoc(docs[di], slug, true);
        if (targetSeedImg && !imageExcludedAsInventoryBecauseBettyMarket(targetSeedImg)) break;
        targetSeedImg = null;
      }
    }

    if (!targetSeedImg) {
      logThrottled("crop_dom_no_seed_found", 10000, "Ruộng DOM: không tìm thấy hạt trong kho", { seedName, slug });
      // Đóng inventory nếu đang mở (tránh để trần)
      await closeInventorySeedStripIfOpen();
      return false;
    }

    // Click vào ô hạt — thử brown slot trước (chính xác hơn), fallback sang clickSeedImageRoot
    const brown = findCropInventoryBrownSlot(targetSeedImg);
    if (brown && d.isVisible(brown)) {
      const domCount = getItemCountFromInventorySlot(brown);
      if (domCount === 0) {
        logFlow("Ruộng DOM: Hạt giống hiển thị số lượng bằng 0 trong kho — bỏ qua không chọn", { seedName });
        await closeInventorySeedStripIfOpen();
        return false;
      }
      await clickCropInventoryBrown(brown);
    } else {
      clickSeedImageRoot(targetSeedImg);
      await sleep(rand(280, 480));
    }

    // ── Verify selectbox sau click ──
    // SFL React cần thời gian xử lý sự kiện trước khi render selectbox.
    // Thử tối đa 3 lần với delay tăng dần.
    let selected = false;
    for (let attempt = 0; attempt < 3 && !selected; attempt += 1) {
      await sleep(rand(400, 600) + attempt * 150);
      selected = inventorySeedSlugAppearsSelected(slug);
      if (selected) {
        logFlow(`Ruộng DOM: đã chọn hạt (lần ${attempt + 1})`, { seedName });
        break;
      }
      if (attempt < 2) {
        // Click lại trước lần thử tiếp theo
        logFlow(`Ruộng DOM: chưa thấy selectbox sau click ${attempt + 1} — click lại`, { seedName });
        if (brown && d.isVisible(brown)) {
          await clickCropInventoryBrown(brown);
        } else {
          clickSeedImageRoot(targetSeedImg);
          await sleep(rand(200, 350));
        }
      }
    }

    if (!selected) {
      // Sau 3 lần vẫn không thấy selectbox → KHÔNG set cache, trả false
      // Để tránh bot nghĩ đã cầm hạt trong khi thực tế chưa chọn được
      logFlow("Ruộng DOM: ✕ không thấy selectbox sau 3 lần click — trả false", { seedName });
      await closeInventorySeedStripIfOpen();
      return false;
    }

    // Đặt cache sau khi đã xác nhận chọn hạt thành công
    runtime.cropDomLastSelectedSeedName = seedName;
    runtime.cropDomLastSelectedSeedAt = now();

    // Đóng kho đồ để chuẩn bị gieo
    await closeInventorySeedStripIfOpen();
    return true;
  }

  function tryBettyIntroBuySeeds() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      let dialogs;
      try {
        dialogs = doc.querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < dialogs.length; i += 1) {
        const dialog = dialogs[i];
        if (!d.isVisible(dialog)) continue;
        let buttons;
        try {
          buttons = dialog.querySelectorAll("button,[role='button']");
        } catch (_e2) {
          continue;
        }
        for (let j = 0; j < buttons.length; j += 1) {
          const btn = buttons[j];
          if (!d.isVisible(btn) || btn.disabled) continue;
          const tx = d.textOf(btn);
          if (
            /buy.*seed|mua.*hạt|mua.*hat|semilla|semillas|acheter.*graine|kaufen.*samen|comprar.*semente/i.test(
              tx,
            )
          ) {
            d.nativeClickClose(btn) || d.click(btn);
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Thanh tab Buy / Sell / Guide — **không** dùng `querySelector` một selector (thường trúng thanh scroll **trong** `#SeasonSeeds`).
   */
  function bettyMarketTabStripFromDialog(dialog) {
    if (!dialog) return null;
    let seedsPanel = null;
    try {
      seedsPanel = dialog.querySelector("#SeasonSeeds");
    } catch (_e) {
      seedsPanel = null;
    }
    let list;
    try {
      list = dialog.querySelectorAll(
        ".absolute.flex > .flex.overflow-x-auto.scrollbar-hide, .absolute.flex > .flex.overflow-x-auto, .flex.overflow-x-auto.scrollbar-hide.mr-auto, .flex.overflow-x-auto.scrollbar-hide, .flex.overflow-x-auto",
      );
    } catch (_e2) {
      return null;
    }
    const candidates = [];
    for (let li = 0; li < list.length; li += 1) {
      const el = list[li];
      if (!el || !d.isVisible(el)) continue;
      try {
        if (el.closest("#SeasonSeeds")) continue;
      } catch (_e3) {
        continue;
      }
      if (seedsPanel && seedsPanel.contains(el)) continue;
      const nc = el.children ? el.children.length : 0;
      if (nc < 2 || nc > 14) continue;
      candidates.push(el);
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top;
    });
    return candidates[0];
  }

  function bettyBuySeasonSeedsPanelVisible(dialog) {
    try {
      const el = dialog.querySelector("#SeasonSeeds");
      return !!(el && d.isVisible(el));
    } catch (_e) {
      return false;
    }
  }

  function bettyAnyBuySeasonPanelVisible() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let dialogs;
      try {
        dialogs = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < dialogs.length; i += 1) {
        if (bettyBuySeasonSeedsPanelVisible(dialogs[i])) return true;
      }
    }
    return false;
  }

  /** Icon kệ hạt tab Buy — chỉ `.../icons/seeds...`, tránh `icons/seed` (khớp `seedling`). */
  function bettyBuyTabSeedsShelfImg(tab) {
    if (!tab) return null;
    let imgs;
    try {
      imgs = tab.querySelectorAll("img[src]");
    } catch (_e) {
      return null;
    }
    for (let ii = 0; ii < imgs.length; ii += 1) {
      const im = imgs[ii];
      if (!d.isVisible(im)) continue;
      const s = String(im.getAttribute("src") || "").toLowerCase();
      if (!s.includes("/icons/seeds")) continue;
      if (/\/icons\/seedling/i.test(s) || s.includes("/icons/seedling")) continue;
      return im;
    }
    return null;
  }

  /** Tab Sell / bán — chữ sell/bán **bất kỳ đâu** trong chip (tránh Sell chỉ icon). */
  function bettyTabChipIsSellTab(tab) {
    if (!tab || !d.isVisible(tab)) return true;
    const tx = String(tab.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (/\bsell\b/.test(tx)) return true;
    if (/\bbán\b/.test(tx) || tx === "bán") return true;
    try {
      const imgs = tab.querySelectorAll("img[src]");
      let hasShelf = false;
      let hasCropBag = false;
      for (let ii = 0; ii < imgs.length; ii += 1) {
        const s = String(imgs[ii].getAttribute("src") || "").toLowerCase();
        if (/\/icons\/seedling/i.test(s)) continue;
        if (/\/icons\/seeds/.test(s) || s.includes("/icons/seeds.png") || s.includes("/icons/seeds.webp")) {
          hasShelf = true;
        }
        if (/\/crops\/[^/]+\/crop\.(png|webp)/i.test(s)) hasCropBag = true;
      }
      if (hasCropBag && !hasShelf) return true;
    } catch (_e2) {
      return true;
    }
    return false;
  }

  /**
   * Chỉ khi panel Buy (`#SeasonSeeds`) chưa hiện: bấm **trung tâm ảnh** kệ `icons/seeds` (không bấm cả hàng chip — dễ trúng Sell kế bên).
   */
  function clickBuyTabIfNeeded() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let dialogs;
      try {
        dialogs = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < dialogs.length; i += 1) {
        const dialog = dialogs[i];
        if (!d.isVisible(dialog)) continue;
        if (!dialogIsBettyMarketSeedShop(dialog) && !dialogHasBuyOneSeedUi(dialog)) continue;

        if (bettyBuySeasonSeedsPanelVisible(dialog)) return false;

        const strip = bettyMarketTabStripFromDialog(dialog);
        if (!strip) continue;

        for (let ti = 0; ti < strip.children.length; ti += 1) {
          const tab = strip.children[ti];
          if (!tab || !d.isVisible(tab)) continue;
          if (bettyTabChipIsSellTab(tab)) continue;
          const tabTx = String(tab.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
          if (/\bguide\b|hướng\s*dẫn/i.test(tabTx)) continue;
          const shelfImg = bettyBuyTabSeedsShelfImg(tab);
          if (!shelfImg) continue;

          d.clickAtCenter(shelfImg);
          return true;
        }
      }
    }
    return false;
  }

  function isBettySeedShopDialogOpen() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let ds;
      try {
        ds = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let j = 0; j < ds.length; j += 1) {
        const dlg = ds[j];
        if (!d.isVisible(dlg)) continue;
        if (dialogHasBuyOneSeedUi(dlg) || dialogIsBettyMarketSeedShop(dlg)) return true;
      }
    }
    return false;
  }

  function playCoinsFromBridge() {
    try {
      const st = S.gameBridge?.getLatestState?.();
      if (!st) return null;
      const c = st.coins;
      if (typeof c === "number" && Number.isFinite(c)) return c;
      const n = Number(c);
      return Number.isFinite(n) ? n : null;
    } catch (_e) {
      return null;
    }
  }

  const CROP_DOM_SKIP_BUY_MS = 5 * 60 * 1000;

  function shouldSkipCropDomSeedPurchase() {
    const until = Math.floor(Number(runtime.cropDomSkipBuySeedsUntil) || 0);
    return until > 0 && now() < until;
  }

  function armCropDomSkipBuySeeds(reason, ms) {
    const skipMs = Math.max(1000, Math.min(ms || CROP_DOM_SKIP_BUY_MS, 60 * 60 * 1000));
    runtime.cropDomSkipBuySeedsUntil = now() + skipMs;
    logFlow("Ruộng: tạm dừng mua hạt " + Math.round(skipMs / 60000) + " phút", {
      reason,
      untilMs: runtime.cropDomSkipBuySeedsUntil,
      skipMinutes: Math.round(skipMs / 60000),
    });
  }

  function bettySeasonSeedsGridHasBrownSlots() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let ds;
      try {
        ds = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let j = 0; j < ds.length; j += 1) {
        const dlg = ds[j];
        if (!d.isVisible(dlg) || !dialogIsBettyMarketSeedShop(dlg)) continue;
        const season = dlg.querySelector("#SeasonSeeds");
        if (!season) continue;
        try {
          if (season.querySelectorAll(".bg-brown-600").length > 0) return true;
        } catch (_e2) {
          // ignore
        }
      }
    }
    return false;
  }

  const BETTY_BUY_ONE_BTN_RE = /buy\s*1|mua\s*1|comprar\s*1|acheter\s*1|kaufen\s*1|收集\s*1/i;

  const BETTY_INSUFFICIENT_FUNDS_RE =
    /not\s+enough|insufficient\s+funds?|không\s+đủ|khong\s+du|need\s+more\s+coins?|余额|不足|too\s+expensive/i;

  const BETTY_SHOP_CLOSE_LABEL_RE =
    /^(close|đóng|cerrar|fermer|fechar|chiudi|закрыть|关闭|schließen|schliessen)$/i;

  function bettyTabStripContainsEl(dialog, el) {
    const strip = bettyMarketTabStripFromDialog(dialog);
    try {
      return !!(strip && el && strip.contains(el));
    } catch (_e) {
      return false;
    }
  }

  /** Ảnh `game-assets/icons/close.png` (float-right) — đóng shop Betty đúng UI game. */
  function findBettySeedShopCloseIconImg() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let dialogs;
      try {
        dialogs = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < dialogs.length; i += 1) {
        const dialog = dialogs[i];
        if (!d.isVisible(dialog)) continue;
        if (!dialogIsBettyMarketSeedShop(dialog) && !dialogHasBuyOneSeedUi(dialog)) continue;
        let imgs;
        try {
          imgs = dialog.querySelectorAll("img[src], img[srcset]");
        } catch (_e2) {
          continue;
        }
        for (let ii = 0; ii < imgs.length; ii += 1) {
          const im = imgs[ii];
          if (!d.isVisible(im)) continue;
          const s = String(im.getAttribute("src") || "").toLowerCase();
          if (!s.includes("icons/close") && !/close\.(png|webp)/i.test(s)) continue;
          if (bettyTabStripContainsEl(dialog, im)) continue;
          try {
            if (im.closest("#SeasonSeeds")) continue;
          } catch (_e3) {
            // ignore
          }
          return im;
        }
      }
    }
    return null;
  }

  /**
   * Nút đóng modal — ưu tiên **góc phải trên** dialog (tránh nút/tab giữa màn hình).
   * Không lấy chip Sell/Buy/Guide; không lấy nút Mua 1.
   */
  function findBettySeedShopCloseButton() {
    const docs = d.collectDocumentsForGameDom();
    const candidates = [];
    for (let di = 0; di < docs.length; di += 1) {
      let dialogs;
      try {
        dialogs = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < dialogs.length; i += 1) {
        const dialog = dialogs[i];
        if (!d.isVisible(dialog)) continue;
        if (!dialogIsBettyMarketSeedShop(dialog) && !dialogHasBuyOneSeedUi(dialog)) continue;
        const dr = dialog.getBoundingClientRect();
        let buttons;
        try {
          buttons = dialog.querySelectorAll("button,[role='button']");
        } catch (_e2) {
          continue;
        }
        for (let j = 0; j < buttons.length; j += 1) {
          const btn = buttons[j];
          if (!d.isVisible(btn) || btn.disabled) continue;
          if (bettyTabStripContainsEl(dialog, btn)) continue;
          if (bettyTabChipIsSellTab(btn)) continue;
          const raw = String(d.textOf(btn) || "")
            .trim()
            .replace(/\s+/g, " ");
          const tlo = raw.toLowerCase();
          if (/^(sell|bán|buy|mua|guide)(\s|$)/i.test(tlo) && raw.length <= 12) continue;
          if (BETTY_BUY_ONE_BTN_RE.test(raw)) continue;
          const aria = String(btn.getAttribute("aria-label") || btn.getAttribute("title") || "").trim();
          const br = btn.getBoundingClientRect();
          const nearTopRight =
            br.width > 0 &&
            br.height > 0 &&
            dr.width > 0 &&
            dr.right - br.right <= 88 &&
            br.top - dr.top <= 80;
          let score = 0;
          if (/(^|\s)(close|đóng|dismiss|exit)(\s|$)/i.test(aria)) score += 50;
          if (BETTY_SHOP_CLOSE_LABEL_RE.test(tlo)) score += 50;
          if (tlo === "×" || tlo === "✕" || raw === "×") score += 40;
          if (nearTopRight) score += 30;
          if (score < 40) continue;
          candidates.push({ btn, score });
        }
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].btn;
  }

  async function closeBettySeedShopDom() {
    const closeImg = findBettySeedShopCloseIconImg();
    if (closeImg) {
      d.nativeClickClose(closeImg) || d.clickAtCenter(closeImg);
      await sleep(rand(240, 420));
    }
    if (isBettySeedShopDialogOpen()) {
      d.sendEscapeToGameWindows();
      await sleep(rand(200, 360));
    }
    if (isBettySeedShopDialogOpen()) {
      d.sendEscapeToGameWindows();
      await sleep(rand(160, 300));
    }
    if (isBettySeedShopDialogOpen()) {
      const closeBtn = findBettySeedShopCloseButton();
      if (closeBtn) {
        d.nativeClickClose(closeBtn) || d.click(closeBtn);
        await sleep(rand(200, 380));
      }
    }
  }

  function bettyBuyDialogLooksLikeInsufficientFunds() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let dialogs;
      try {
        dialogs = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < dialogs.length; i += 1) {
        const dlg = dialogs[i];
        if (!d.isVisible(dlg)) continue;
        if (!dialogIsBettyMarketSeedShop(dlg) && !dialogHasBuyOneSeedUi(dlg)) continue;
        const t = String(dlg.textContent || "").replace(/\s+/g, " ");
        if (BETTY_INSUFFICIENT_FUNDS_RE.test(t)) return true;
      }
    }
    return false;
  }

  /**
   * Hết xu (bridge) hoặc UI báo không đủ tiền → đóng shop (Close / Escape).
   * Không quét từng hạt (dễ click lệch sang tab Sell).
   */
  async function tryCloseBettyShopIfBrokeOrNoAffordableSeed() {
    if (!isBettySeedShopDialogOpen()) return false;
    try {
      await S.gameBridge?.requestState?.();
    } catch (_e) {
      // ignore
    }
    const coins = playCoinsFromBridge();
    if (coins !== null && coins <= 0) {
      await closeBettySeedShopDom();
      armCropDomSkipBuySeeds("het_xu_bridge", 30 * 60 * 1000);
      logFlow("Ruộng DOM: đóng shop Betty — hết xu (coins)", { coins });
      return true;
    }
    if (bettyBuyDialogLooksLikeInsufficientFunds()) {
      await closeBettySeedShopDom();
      armCropDomSkipBuySeeds("khong_du_tien_ui", 30 * 60 * 1000);
      logFlow("Ruộng DOM: đóng shop Betty — UI báo không đủ tiền", {});
      return true;
    }
    return false;
  }

  /**
   * Nút «Mua 1» — chỉ trong dialog có `#SeasonSeeds`, không nằm thanh tab, không nằm trong `#SeasonSeeds`
   * (nút ở cột phải theo markup game).
   */
  function findBettyMarketBuyOneButton() {
    const buyRe = /buy\s*1|mua\s*1|comprar\s*1|acheter\s*1|kaufen\s*1|收集\s*1/i;
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let ds;
      try {
        ds = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let j = 0; j < ds.length; j += 1) {
        const dlg = ds[j];
        if (!d.isVisible(dlg) || !dlg.querySelector("#SeasonSeeds")) continue;
        const strip = bettyMarketTabStripFromDialog(dlg);
        let buttons;
        try {
          buttons = dlg.querySelectorAll("button,[role='button']");
        } catch (_e2) {
          continue;
        }
        for (let bi = 0; bi < buttons.length; bi += 1) {
          const btn = buttons[bi];
          if (!d.isVisible(btn) || btn.disabled) continue;
          if (strip && strip.contains(btn)) continue;
          try {
            if (btn.closest("#SeasonSeeds")) continue;
          } catch (_e3) {
            // ignore
          }
          if (buyRe.test(d.textOf(btn))) return btn;
        }
      }
    }
    return null;
  }

  /**
   * Một lần mở shop: **một vòng** rà soát các loại (theo cursor) trong `#SeasonSeeds` → chọn ô mua đầu tiên khả dụng
   * → Mua 1 → đóng (ảnh close.png). Hết slot mua / lỗi → đóng + niêm phong 1h (không mở lại mua từng tick).
   */
  /**
   * Mua hạt qua XState event `seed.bought` — không cần mở UI Betty (DOM).
   * Port từ SunFlower Land Extension: buySeedsBatch.
   * Trả về true nếu gửi event thành công.
   */
  async function tryBuyOneSeedViaEvent() {
    if (shouldSkipCropDomSeedPurchase()) return false;
    if (!S.gameBridge?.isReady) return false;

    // Xóa penalty cũ nếu đã hết hạn trước khi thử mua (tránh bị block từ lần trước)
    const skipUntil = Math.floor(Number(runtime.cropDomSkipBuySeedsUntil) || 0);
    if (skipUntil > 0 && now() >= skipUntil) {
      runtime.cropDomSkipBuySeedsUntil = 0;
    }

    // Refresh state trước khi mua
    try {
      await S.gameBridge.requestState();
    } catch (_e) { /* ignore */ }
    await sleep(rand(80, 150));

    const st = S.gameBridge.getLatestState();
    if (!st) return false;

    const seasonKey = normalizeSeasonName(st.season);
    const coins = typeof st.coins === "number" && Number.isFinite(st.coins) ? st.coins : 0;
    let stock = st.stock || {};
    const preferredSeed = String(runtime.settings.cropDomSeedName || "Auto").trim();
    const skipLong = !!runtime.settings.cropDomSkipLongGrow;

    // Kiểm tra xu: lấy giá rẻ nhất trong mùa
    const allowedThisSeason = SEASONAL_CROP_PLOT_SEEDS[seasonKey] || SEASONAL_CROP_PLOT_SEEDS.spring;
    const cheapestPrice = allowedThisSeason.reduce((min, s) => {
      const p = NORMAL_SEED_BUY_PRICES_DOM[s];
      return p != null && p < min ? p : min;
    }, Number.MAX_SAFE_INTEGER);
    if (cheapestPrice === Number.MAX_SAFE_INTEGER || coins < cheapestPrice) {
      armCropDomSkipBuySeeds("het_xu", 30 * 60 * 1000); // 30 phút nếu hết xu
      logFlow("Ruộng: không đủ xu để mua hạt rẻ nhất", { coins, cheapestPrice });
      return false;
    }

    let seedToBuy = getNextSeedToBuyViaEvent(stock, seasonKey, preferredSeed, skipLong);

    // Nếu stock hết hàng (hoặc không còn hạt nào phù hợp theo mùa)
    if (!seedToBuy) {
      // Không còn hạt phù hợp → Khóa 30 giây rồi thử lại (stock Betty có thể refresh).
      // KHÔNG TỰ ĐỘNG RESTOCK (tốn Gem/SFL của người dùng).
      armCropDomSkipBuySeeds("khong_co_hat_trong_stock", 30 * 1000);
      logFlow("Ruộng: không có hạt phù hợp trong stock game (Betty hết hàng / Chờ mùa mới)", { seasonKey });
      return false;
    }

    const available = Math.floor(Number(stock[seedToBuy] || 0));
    if (available < 1) return false;

    // Tính toán số lượng cần mua: Chỉ mua đủ số ô trống còn lại (hoặc tối thiểu 1), không mua dồn
    const emptyPlots = listEmptyCropPlotsFromState();
    const emptyLeft = emptyPlots.length > 0 ? emptyPlots.length : 1;
    const unitPrice = getNormalSeedBuyPriceDom(seedToBuy);
    const affordableByCoins = unitPrice > 0 ? Math.floor(coins / unitPrice) : 200;
    
    // Mua số lượng ít nhất giữa: Sức mua, Hàng còn, Số ô đang trống trên ruộng
    const amount = Math.max(1, Math.min(available, affordableByCoins, emptyLeft));

    // Cố gắng mua bằng vòng lặp thử lại nội bộ (6 lần, chờ ngắn hơn giữa các lần)
    let result;
    for (let attempt = 1; attempt <= 6; attempt++) {
      result = await S.gameBridge.sendEvent(
        { type: "seed.bought", item: seedToBuy, amount },
        2800,
      );
      if (result?.ok) break; // Thành công thì thoát vòng lặp
      
      const errReason = String(result?.error || "unknown");
      if (/insufficient|not_enough|no_coins|funds/i.test(errReason)) {
        break; // Lỗi cứng (hết tiền) thì không thử lại
      }
      
      // Game báo bận (pending_actions) → đợi ngắn hơn để phản hồi nhanh hơn
      const waitMs = attempt <= 2 ? 600 : attempt <= 4 ? 900 : 1200;
      await sleep(waitMs);
    }

    if (result?.ok) {
      runtime.cropDomSkipBuySeedsUntil = 0;
      if (!result.state) S.gameBridge.requestState().catch(() => { });
      logFlow("Ruộng: đã mua hạt " + seedToBuy, { amount, coins });
      return true;
    }

    const errReason = String(result?.error || "unknown");
    logFlow("Ruộng: không mua được hạt", { seedToBuy, amount, error: errReason });
    
    const err = errReason.toLowerCase();
    if (/locked|level|requirement|experience|bumpkin|rank|unlock/i.test(err)) {
      runtime.lockedSeeds = runtime.lockedSeeds || new Set();
      runtime.lockedSeeds.add(seedToBuy);
      logFlow(`Ruộng: Đã phát hiện hạt ${seedToBuy} chưa mở khóa (Locked) — tự động bỏ qua ở các chu kỳ tiếp theo`, {});
      armCropDomSkipBuySeeds("hat_chua_mo_khoa", 10 * 60 * 1000);
    } else if (/insufficient|not_enough|no_coins|funds/i.test(errReason)) {
      armCropDomSkipBuySeeds("khong_du_tien", 30 * 60 * 1000);
    } else {
      // Game lag → penalty ngắn hơn (3 giây) để thử lại nhanh
      armCropDomSkipBuySeeds("game_qua_lag", 3000);
    }
    return false;
  }

  async function tryHarvestOne() {
    const targets = findReadyHarvestTargets();
    if (targets.length <= 0) return false;
    const root = targets[0];
    d.doubleClickAtCenter(root) || d.clickAtCenter(root) || d.nativeClickClose(root) || d.click(root);
    await uiJitter();
    try {
      await S.gameBridge?.requestState?.();
    } catch (_e) {
      // ignore
    }
    await sleep(rand(180, 320));
    runtime.lastAction = "crop_harvest_dom";
    runtime.lastActionAt = now();
    runtime.cropDomLastSelectedSeedName = null;
    logFlow("Ruộng DOM: thu hoạch (plant.png)", {});
    return true;
  }

  async function tryPlantOne(seedName) {
    try {
      await S.gameBridge?.requestState?.();
    } catch (_e) {
      // ignore
    }
    await sleep(rand(50, 100));

    const roots = findEmptyPlotRoots();
    if (roots.length <= 0) {
      const emptyList = listEmptyCropPlotsFromState();
      logThrottled("crop_dom_no_empty", 14000, "Ruộng DOM: không thấy ô trống (đất) trong tầm nhìn", {
        bridgeEmptyPlots: emptyList.length,
        bridgeReady: !!S.gameBridge?.isReady,
      });
      return "no_plots";
    }

    const okSel = await ensureSeedSelectedDom(seedName);
    if (!okSel) return "no_seed_ui";

    // Tìm một ô trống TRÊN DOM mà chưa bị CHIẾM trong State
    let targetRoot = null;
    const bridgeIdx = buildBridgeCropIndex();
    const hasKeys = bridgeIdx && bridgeIdx.allKeys && bridgeIdx.allKeys.size > 0;

    for (let i = 0; i < roots.length; i++) {
      const r = roots[i];
      if (hasKeys) {
        const pk = plotKeyFromPlotRoot(r, bridgeIdx.allKeys);
        if (!pk) {
          if (!isSafeUnkeyedCropSoilRoot(r)) continue;
        } else if (bridgeIdx.emptyKeys?.size > 0 && !bridgeIdx.emptyKeys.has(pk)) continue;
        if (pk && bridgeIdx.occupied.has(pk)) continue; // Bỏ qua ô đã có cây (do state đi trước UI)
      }
      targetRoot = r;
      break;
    }

    if (!targetRoot) {
      logThrottled("crop_dom_skip_occupied", 8000, "Tất cả ô đất trên màn hình đều đã gieo hạt (đang chờ hình ảnh cập nhật)", {});
      return "no_plots";
    }

    // ── Kiểm tra lần cuối: không gieo vào fruit patch / hoa / nhà kính ──
    if (isFruitPatchOrFlowerElement(targetRoot)) {
      logFlow("Ruộng DOM: bỏ qua ô — phát hiện fruit patch / hoa (không phải crop plot)", {});
      return "no_plots";
    }
    
    d.doubleClickAtCenter(targetRoot) || d.clickAtCenter(targetRoot) || d.nativeClickClose(targetRoot) || d.click(targetRoot);
    await uiJitter();
    S.gameBridge?.requestState?.().catch(() => {});
    await sleep(rand(120, 220));

    // ── Kiểm tra sau khi click ô đất ──
    // Nếu click ô đất mà bị bật mở cửa sổ giỏ đồ (inventory strip / holder popup),
    // chứng tỏ game chưa nhận hạt đang cầm -> Xóa cache hạt, đóng cửa sổ popup để chọn lại dứt điểm.
    if (isInventorySeedStripVisible() || isBettySeedShopDialogOpen()) {
      logFlow("Ruộng DOM: ✕ click ô đất nhưng mở popup giỏ đồ (chưa cầm hạt thành công) — xóa cache, đóng popup để chọn lại", { seedName });
      runtime.cropDomLastSelectedSeedName = null;
      runtime.cropDomLastSelectedSeedAt = 0;
      await closeInventorySeedStripIfOpen();
      return "no_seed_ui";
    }

    runtime.lastAction = "crop_plant_dom";
    runtime.lastActionAt = now();
    logFlow("Ruộng DOM: đã gieo", { seedName });
    return true;
  }

  /**
   * Nhận thưởng / captcha sau thu hoạch (ChestReward) — 3 dạng trong game:
   * 1) Tap rương — ChestCaptcha (text statements.chest.captcha + img.absolute.w-16).
   * 2) Stop the Goblins / Moon Seekers — lưới 4×4: đọc fiber (isGoblin / isMoonSeeker / …) rồi tap từng ô qua ảnh hoặc div ô, một ô mỗi lần gọi.
   * 3) Màn tóm tắt — ClaimReward (nút Close sau khi qua captcha).
   */
  const CHEST_CAPTCHA_TEXT_RE =
    /tap\s+the\s+chest|chest\s+to\s+open|click\s+the\s+箱|ketuk\s+peti|toca\s+el\s+cofre|appuyez\s+sur\s+le\s+coffre|tippe\s+auf\s+die\s+truhe|нажми\s+на\s+сундук|チェストをタップ|点击箱子|chạm\s+vào\s+rương|chạm\s+rương|toque\s+no\s+ba[uú]/i;

  const GOBLIN_CAPTCHA_TITLE_RE =
    /stop\s+the\s+goblins|stop\s+the\s+moon\s+seekers?|moon\s+seekers?|goblins\s*!|ăn\s+hết|steal\s+your\s+resources|eat\s+your\s+food|tap\s+the\s+moon\s+seekers?|tap\s+the\s+goblins|zombie|skeleton|thây\s+ma|xương|bộ\s+xương/i;

  const CLAIM_REWARD_SUMMARY_RE = /woohoo|hidden\s+reward|reward\s+discovered|phần\s+thưởng|you\s+found|you\s+received|congratulations/i;

  const CLOSE_BUTTON_LABEL_RE =
    /^(close|đóng|cerrar|fermer|fechar|chiudi|закрыть|关闭|schließen|schliessen|awesome|continue|claim|okay|sweet|cool|nhận|tiếp\s+tục|tuyệt\s+vời|yay)[!.]*$/i;

  function findChestCaptchaImgInDialog(dlg) {
    let list;
    try {
      list = dlg.querySelectorAll("img");
    } catch (_e) {
      return null;
    }
    const candidates = [];
    for (let i = 0; i < list.length; i += 1) {
      const img = list[i];
      const cls = img.classList;
      if (!cls || !cls.contains("w-16") || !cls.contains("absolute")) continue;
      if (!d.isVisible(img) || !d.isInViewportLoose(img, 80)) continue;
      candidates.push(img);
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    for (let j = 0; j < candidates.length; j += 1) {
      const st = String(candidates[j].getAttribute("style") || "");
      if (/transform|rotate|skew|scale|perspective|bottom|top|left|right/i.test(st)) return candidates[j];
    }
    return candidates[0];
  }

  function isStopTheGoblinsItemsArrayStrict(st) {
    if (!Array.isArray(st) || st.length !== 16 || !st[0] || typeof st[0].src !== "string") return false;
    const a = st[0];
    if (typeof a.isGoblin === "boolean") return true;
    if (typeof a.isMoonSeeker === "boolean") return true;
    if (typeof a.isZombie === "boolean") return true;
    if (typeof a.isSkeleton === "boolean") return true;
    return false;
  }

  /**
   * Goblins + Moon Seekers + Zombies: game có thể dùng isGoblin / isMoonSeeker / isZombie / type.
   * Chuẩn hóa về isGoblin (cờ «cần tap») cho một ô.
   */
  function normalizeStopTheGoblinsItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const src = typeof raw.src === "string" ? raw.src : "";
    let isGoblin = false;
    if (typeof raw.isGoblin === "boolean") isGoblin = raw.isGoblin;
    else if (typeof raw.isMoonSeeker === "boolean") isGoblin = raw.isMoonSeeker;
    else if (typeof raw.isZombie === "boolean") isGoblin = raw.isZombie;
    else if (typeof raw.isSkeleton === "boolean") isGoblin = raw.isSkeleton;
    else if (raw.goblin === true || raw.moonSeeker === true || raw.zombie === true || raw.skeleton === true) isGoblin = true;
    else {
      const t = String(raw.type || raw.kind || raw.role || "").toLowerCase();
      if (t === "goblin" || t === "moon_seeker" || t === "moonseeker" || t.includes("moon") || t.includes("zomb") || t.includes("skele")) isGoblin = true;
    }
    return { isGoblin, src };
  }

  /**
   * Bypass captcha: Tìm callback (onSuccess/onComplete/onAcknowledged/…) hoặc
   * React state-setter trong Fiber tree và gọi trực tiếp — không cần tap grid.
   * Chiến lược:
   *  1) Duyệt xuống (child/sibling) VÀ lên (.return) từ NHIỀU DOM seed.
   *  2) Quét memoizedProps tìm callback phổ biến.
   *  3) Quét hook chain tìm useState setter — gọi setter(true) / setter("solved").
   */
  const BYPASS_CALLBACK_KEYS = [
    "onSuccess", "onComplete", "onSolved", "onDone", "onClaim",
    "onAcknowledged", "onClose", "onFinish", "onWin", "onReward",
    "handleSuccess", "handleComplete", "handleSolved", "handleClaim",
    "handleClose", "handleFinish", "resolve",
  ];

  function tryCallFiberCallbacks(fiber, visited) {
    if (!fiber || visited.has(fiber)) return false;
    visited.add(fiber);
    const props = fiber.memoizedProps;
    if (props && typeof props === "object") {
      for (const key of BYPASS_CALLBACK_KEYS) {
        if (typeof props[key] === "function") {
          try {
            props[key]();
            logFlow("Ruộng DOM: Bypassed Captcha qua Fiber prop", { key });
            return true;
          } catch (_e) { /* ignore */ }
        }
      }
    }
    // Thử gọi useState setter: hook chain → queue.pending → action
    let hook = fiber.memoizedState;
    for (let hi = 0; hi < 60 && hook; hi += 1) {
      const q = hook.queue;
      if (q && typeof q.dispatch === "function") {
        const st = hook.memoizedState;
        // Chỉ thử nếu state hiện tại là boolean false hoặc string chưa solved
        if (st === false || st === "pending" || st === "playing" || st === "idle") {
          try {
            q.dispatch(true);
            logFlow("Ruộng DOM: Bypassed Captcha qua useState dispatch", { prevState: st });
            return true;
          } catch (_e) { /* ignore */ }
        }
      }
      hook = hook.next;
    }
    return false;
  }

  function tryBypassCaptchaViaFiber(dlg) {
    // Disabled: blindly dispatching state true causes 5 minute bans in new updates
    // if the state variable represents "hasFailed". Acts like "minesweeper".
    return false;
  }

  /**
   * NEW IDEA: 1x1 Average Color Snapshot
   * Rút gọn ảnh về 1x1 pixel để lấy màu trung bình.
   * Cực kỳ trâu bò (robust) trước các loại noise ngẫu nhiên, đổi src, Blob URL, hay đổi Canvas.
   */
  function tryClickMoonSeekersByImageHeuristic(dlg, cells) {
    if (!cells || cells.length < 16) return false;
    const srcMap = new Map();
    const cellData = [];

    const cvs = document.createElement("canvas");
    cvs.width = 1;
    cvs.height = 1;
    const ctx = cvs.getContext("2d", { willReadFrequently: true });

    let pendingLoads = 0;

    for (let i = 0; i < 16; i += 1) {
      const cell = cells[i];
      if (!cell || !d.isVisible(cell)) continue;
      if (cellShowsResultIcon(cell)) continue; // Ô đã giải

      const inner = goblinCaptchaClickTargetInCell(cell);
      let visualEl = (inner && (inner.tagName === "IMG" || inner.tagName === "CANVAS")) ? inner : cell.querySelector("img, canvas");

      if (!visualEl) {
        if (cell.style && cell.style.backgroundImage) visualEl = cell;
        else continue;
      }

      let hashKey = "unknown_" + i;

      if (visualEl.tagName === "CANVAS") {
        try {
          ctx.clearRect(0, 0, 1, 1);
          ctx.drawImage(visualEl, 0, 0, 1, 1);
          const data = ctx.getImageData(0, 0, 1, 1).data;
          hashKey = `color_${Math.floor(data[0] / 16)}_${Math.floor(data[1] / 16)}_${Math.floor(data[2] / 16)}`;
        } catch (e) {
          hashKey = "cvs_err";
        }
      } else if (visualEl.tagName === "IMG") {
        if (visualEl.complete && visualEl.naturalWidth > 0) {
          try {
            ctx.clearRect(0, 0, 1, 1);
            ctx.drawImage(visualEl, 0, 0, 1, 1);
            const data = ctx.getImageData(0, 0, 1, 1).data;
            hashKey = `color_${Math.floor(data[0] / 16)}_${Math.floor(data[1] / 16)}_${Math.floor(data[2] / 16)}`;
          } catch (_e) {
            hashKey = String(visualEl.currentSrc || visualEl.getAttribute("src") || "");
          }
        } else {
          pendingLoads++;
          continue;
        }
      } else {
        hashKey = String(visualEl.style.backgroundImage);
      }

      if (!srcMap.has(hashKey)) srcMap.set(hashKey, []);
      srcMap.get(hashKey).push({ cell, inner: visualEl });
      cellData.push({ cell, inner: visualEl, hashKey });
    }

    if (pendingLoads > 0) return false; // Chờ tất cả ảnh load xong
    if (srcMap.size === 0) return false;

    // Tìm nhóm đa số (ảnh nền/nhân vật thường)
    let majorityKey = null;
    let maxCount = 0;
    for (const [k, group] of srcMap.entries()) {
      if (group.length > maxCount) {
        maxCount = group.length;
        majorityKey = k;
      }
    }

    if (maxCount < 6) {
      logThrottled("debug_captcha_heuristic", 10000, "Ruộng DOM: Heuristic thất bại do ảnh chưa rõ ràng", {
        maxCount, mapSize: srcMap.size, keys: Array.from(srcMap.keys())
      });
      return false;
    }

    // Tìm một ô KHÔNG thuộc nhóm đa số để bấm
    for (const data of cellData) {
      if (data.hashKey !== majorityKey) {
        const { cell, inner } = data;
        if (d.isVisible(cell)) {
          d.nativeClickClose(cell) || d.clickAtCenter(cell);
        }
        if (inner && inner !== cell && d.isVisible(inner)) {
          d.nativeClickClose(inner) || d.clickAtCenter(inner);
        }
        logFlow("Ruộng DOM: đã tap ô thiểu số (1x1 Color Snapshot)", { majorityCount: maxCount, hash: data.hashKey });
        return true; // 1 ô mỗi lần gọi
      }
    }
    return false;
  }

  /**
   * Fallback: Khi fiber hoàn toàn thất bại, phân loại ảnh trong grid theo
  /**
   * Fallback: Khi đọc mảng 16 items từ fiber thất bại (build minify),
   * thử đọc fiber CỦA TỪNG Ô riêng lẻ. Mỗi cell div có __reactFiber →
   * từ đó đi lên/xuống vài cấp tìm prop chứa isGoblin/isMoonSeeker.
   */
  function readPerCellIsTarget(cellEl) {
    if (!cellEl) return null; // null = không biết
    const fiberKey = Object.keys(cellEl).find(
      (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
    );
    if (!fiberKey) return null;
    const startFiber = cellEl[fiberKey];
    if (!startFiber) return null;

    // Quét lên + xuống vài cấp tìm prop/state chứa cờ target
    const fibers = [startFiber];
    // Đi lên
    let up = startFiber.return;
    for (let u = 0; u < 12 && up; u += 1) { fibers.push(up); up = up.return; }
    // Đi xuống (child chain)
    let down = startFiber.child;
    for (let d2 = 0; d2 < 12 && down; d2 += 1) { fibers.push(down); down = down.child; }

    for (const f of fibers) {
      // Check props
      for (const p of [f.memoizedProps, f.pendingProps]) {
        if (!p || typeof p !== "object") continue;
        // Trực tiếp trên props
        if (typeof p.isGoblin === "boolean") return p.isGoblin;
        if (typeof p.isMoonSeeker === "boolean") return p.isMoonSeeker;
        if (typeof p.isZombie === "boolean") return p.isZombie;
        if (typeof p.isSkeleton === "boolean") return p.isSkeleton;
        // Lồng trong p.item / p.data / p.cell / p.tile
        for (const sub of [p.item, p.data, p.cell, p.tile, p.gridItem]) {
          if (!sub || typeof sub !== "object") continue;
          if (typeof sub.isGoblin === "boolean") return sub.isGoblin;
          if (typeof sub.isMoonSeeker === "boolean") return sub.isMoonSeeker;
          if (typeof sub.isZombie === "boolean") return sub.isZombie;
          if (typeof sub.isSkeleton === "boolean") return sub.isSkeleton;
        }
      }
      // Check hooks (memoizedState chain)
      let hook = f.memoizedState;
      for (let hi = 0; hi < 20 && hook; hi += 1) {
        const st = hook.memoizedState;
        if (st && typeof st === "object" && !Array.isArray(st)) {
          if (typeof st.isGoblin === "boolean") return st.isGoblin;
          if (typeof st.isMoonSeeker === "boolean") return st.isMoonSeeker;
          if (typeof st.isZombie === "boolean") return st.isZombie;
          if (typeof st.isSkeleton === "boolean") return st.isSkeleton;
        }
        hook = hook.next;
      }
    }

    // Thử tìm onClick handler trên cell → inspect nếu closure chứa item data
    const imgEl = cellEl.querySelector("img");
    if (imgEl) {
      const imgFKey = Object.keys(imgEl).find(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
      );
      if (imgFKey) {
        let imgF = imgEl[imgFKey];
        for (let d3 = 0; d3 < 8 && imgF; d3 += 1) {
          for (const p of [imgF.memoizedProps, imgF.pendingProps]) {
            if (!p || typeof p !== "object") continue;
            if (typeof p.isGoblin === "boolean") return p.isGoblin;
            if (typeof p.isMoonSeeker === "boolean") return p.isMoonSeeker;
            if (typeof p.isZombie === "boolean") return p.isZombie;
            if (typeof p.isSkeleton === "boolean") return p.isSkeleton;
          }
          imgF = imgF.return;
        }
      }
    }

    return null; // Không xác định được
  }

  function tryClickMoonSeekersByPerCellFiber(dlg, cells) {
    if (!cells || cells.length < 16) return false;
    let foundAny = false;
    for (let i = 0; i < 16; i += 1) {
      const cell = cells[i];
      if (!cell || !d.isVisible(cell)) continue;
      if (cellShowsResultIcon(cell)) continue;
      const isTarget = readPerCellIsTarget(cell);
      if (isTarget !== true) continue; // Chỉ tap khi CHẮC CHẮN là target
      foundAny = true;
      const inner = goblinCaptchaClickTargetInCell(cell);
      if (d.isVisible(cell)) {
        d.nativeClickClose(cell) || d.clickAtCenter(cell);
      }
      if (inner && inner !== cell && d.isVisible(inner)) {
        d.nativeClickClose(inner) || d.clickAtCenter(inner);
      }
      logFlow("Ruộng DOM: Tap Moon Seeker (per-cell fiber fallback)", { index: i });
      return true; // 1 ô mỗi lần gọi
    }
    return foundAny;
  }

  function gridItemLooksLikeCaptchaTile(raw) {
    if (!raw || typeof raw !== "object") return false;
    const n = normalizeStopTheGoblinsItem(raw);
    if (!n) return false;
    if (typeof n.src === "string" && n.src.length > 0) return true;
    return typeof raw.isGoblin === "boolean" || typeof raw.isMoonSeeker === "boolean";
  }

  function isStopTheGoblinsItemsArrayRelaxed(st) {
    if (!Array.isArray(st) || st.length !== 16) return false;
    let ok = 0;
    for (let i = 0; i < 16; i += 1) {
      if (gridItemLooksLikeCaptchaTile(st[i])) ok += 1;
    }
    if (ok < 10) return false;
    return st.some((raw) => normalizeStopTheGoblinsItem(raw)?.isGoblin);
  }

  /** Đôi khi mảng 16 nằm lồng trong object state (hook không phải mảng trần). */
  function extractGrid16FromUnknown(value, depth) {
    if (depth > 8 || value == null) return null;
    if (Array.isArray(value) && value.length === 16) {
      const z = value[0];
      if (z && typeof z === "object" && (gridItemLooksLikeCaptchaTile(z) || "isGoblin" in z || "isMoonSeeker" in z || "src" in z)) {
        return value;
      }
    }
    const t = typeof value;
    if (t !== "object" || value instanceof Date) return null;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const r = extractGrid16FromUnknown(value[i], depth + 1);
        if (r) return r;
      }
      return null;
    }
    let keys;
    try {
      keys = Object.keys(value);
    } catch (_e) {
      return null;
    }
    for (let ki = 0; ki < keys.length; ki += 1) {
      const r = extractGrid16FromUnknown(value[keys[ki]], depth + 1);
      if (r) return r;
    }
    return null;
  }

  function coerceStopTheGoblinsItems(st) {
    if (!Array.isArray(st) || st.length !== 16) return null;
    const out = [];
    for (let i = 0; i < 16; i += 1) {
      const n = normalizeStopTheGoblinsItem(st[i]);
      if (!n) return null;
      out.push(n);
    }
    return out;
  }

  function getReactFiberFromDom(el) {
    if (!el || typeof el !== "object") return null;
    let key;
    try {
      key = Object.keys(el).find((k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
    } catch (_e) {
      return null;
    }
    return key ? el[key] : null;
  }

  function tryCoerceGridFromStateLike(st) {
    if (!st) return null;
    if (isStopTheGoblinsItemsArrayStrict(st)) return coerceStopTheGoblinsItems(st) || st;
    if (isStopTheGoblinsItemsArrayRelaxed(st)) return coerceStopTheGoblinsItems(st);
    if (typeof st === "object" && !Array.isArray(st)) {
      const inner = extractGrid16FromUnknown(st, 0);
      if (inner) {
        if (isStopTheGoblinsItemsArrayStrict(inner)) return coerceStopTheGoblinsItems(inner) || inner;
        if (isStopTheGoblinsItemsArrayRelaxed(inner)) return coerceStopTheGoblinsItems(inner);
      }
    }
    return null;
  }

  /** BFS cây fiber (child + sibling) — tìm hook chứa mảng 16 ô goblin. */
  function bfsFiberFindStopTheGoblinsItems(startFiber) {
    if (!startFiber) return null;
    const queue = [startFiber];
    let steps = 0;
    const maxSteps = 28000;
    while (queue.length && steps < maxSteps) {
      const f = queue.shift();
      steps += 1;
      if (!f) continue;

      let hook = f.memoizedState;
      for (let hi = 0; hi < 120 && hook; hi += 1) {
        const st = hook.memoizedState != null ? hook.memoizedState : hook.baseState;
        const got = tryCoerceGridFromStateLike(st);
        if (got) return got;
        hook = hook.next;
      }

      try {
        const mp = f.memoizedProps;
        const pend = f.pendingProps;
        for (const p of [mp, pend]) {
          if (!p || typeof p !== "object") continue;
          const cand =
            p.items ||
            p.grid ||
            p.cells ||
            p.tiles ||
            p.board ||
            p.gameItems ||
            p.challenge ||
            p.puzzle;
          if (Array.isArray(cand) && cand.length === 16) {
            const got = tryCoerceGridFromStateLike(cand);
            if (got) return got;
          }
          const nested = tryCoerceGridFromStateLike(p);
          if (nested) return nested;
        }
      } catch (_e2) {
        // ignore
      }

      let c = f.child;
      while (c) {
        queue.push(c);
        c = c.sibling;
      }
    }
    return null;
  }

  function readStopTheGoblinsItemsFromFiberStart(startEl) {
    if (!startEl) return null;
    const fiberKeys = Object.keys(startEl).filter(
      (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
    );
    for (let ki = 0; ki < fiberKeys.length; ki += 1) {
      let f = startEl[fiberKeys[ki]];
      for (let depth = 0; depth < 180 && f; depth += 1) {
        let hook = f.memoizedState;
        for (let hi = 0; hi < 96 && hook; hi += 1) {
          const st = hook.memoizedState != null ? hook.memoizedState : hook.baseState;
          const got = tryCoerceGridFromStateLike(st);
          if (got) return got;
          hook = hook.next;
        }
        f = f.return;
      }
      const rootF = startEl[fiberKeys[ki]];
      const bfs = bfsFiberFindStopTheGoblinsItems(rootF);
      if (bfs) return bfs;
    }
    return null;
  }

  function readStopTheGoblinsItemsFromFiber(dlg, cells, wrap) {
    const seeds = [
      wrap,
      dlg,
      cells[0],
      cells[1],
      cells[2],
      cells[3],
      cells[4],
      cells[5],
      cells[8],
      cells[12],
      cells[15],
    ].filter(Boolean);
    for (let si = 0; si < seeds.length; si += 1) {
      const found = readStopTheGoblinsItemsFromFiberStart(seeds[si]);
      if (found) return found;
    }
    const dlgFiber = getReactFiberFromDom(dlg);
    if (dlgFiber) {
      const fromDlg = bfsFiberFindStopTheGoblinsItems(dlgFiber);
      if (fromDlg) return fromDlg;
    }
    if (wrap) {
      const wf = getReactFiberFromDom(wrap);
      if (wf) {
        const fromWrap = bfsFiberFindStopTheGoblinsItems(wf);
        if (fromWrap) return fromWrap;
      }
    }
    return null;
  }

  /** Thứ tự ô = hàng → cột (trùng mảng state 16 của game). */
  function sortGoblinCellsReadingOrder(cells) {
    return cells.slice().sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const rowTol = Math.min(ra.height, rb.height, 14) * 0.65;
      const dy = ra.top - rb.top;
      if (Math.abs(dy) > rowTol) return dy;
      return ra.left - rb.left;
    });
  }

  function collectGoblinGridCells(dlg) {
    const tryTake16 = (list, preserveDomOrder) => {
      if (!list || list.length < 16) return null;
      const slice = list.slice(0, Math.min(list.length, 64));
      const ordered = preserveDomOrder ? slice : sortGoblinCellsReadingOrder(slice);
      return ordered.length >= 16 ? ordered.slice(0, 16) : null;
    };

    const wrap =
      dlg.querySelector(".flex.flex-wrap.justify-center.items-center") ||
      dlg.querySelector(".flex.flex-wrap.justify-center") ||
      dlg.querySelector(".flex.flex-wrap");
    if (wrap) {
      const cells = Array.from(wrap.children).filter(
        (el) =>
          el &&
          el.tagName === "DIV" &&
          el.classList?.contains("cursor-pointer") &&
          (el.classList?.contains("group") || el.querySelector("img")),
      );
      /** Thứ tự con của flex-wrap trùng mảng game — không sort lại (tránh lệch index / fiber). */
      const hit = tryTake16(cells, true);
      if (hit) return hit;
    }

    try {
      const grids = dlg.querySelectorAll('[class*="grid-cols-4"], [class*="grid-cols-5"]');
      for (let gi = 0; gi < grids.length; gi += 1) {
        const g = grids[gi];
        const ch = Array.from(g.children).filter(
          (el) => el && el.tagName === "DIV" && el.classList?.contains("cursor-pointer"),
        );
        const hit = tryTake16(ch);
        if (hit) return hit;
      }
    } catch (_e) {
      // ignore
    }

    try {
      const q = dlg.querySelectorAll("div.cursor-pointer.group");
      let cells = Array.from(q).filter((el) => el.classList?.contains("h-12") || el.className.includes("w-1/4"));
      let hit = tryTake16(cells);
      if (hit) return hit;
      cells = Array.from(q);
      hit = tryTake16(cells);
      if (hit) return hit;
    } catch (_e2) {
      // ignore
    }

    try {
      let el = dlg.firstElementChild;
      while (el) {
        if (el.children && el.children.length >= 16) {
          const kids = Array.from(el.children);
          const cp = kids.filter(
            (k) => k && k.tagName === "DIV" && k.classList?.contains("cursor-pointer"),
          );
          const hit = tryTake16(cp);
          if (hit) return hit;
        }
        el = el.nextElementSibling;
      }
      const deepParents = dlg.querySelectorAll("div");
      for (let pi = 0; pi < deepParents.length; pi += 1) {
        const p = deepParents[pi];
        if (p.children.length < 16) continue;
        const kids = Array.from(p.children);
        const cp = kids.filter(
          (k) => k && k.tagName === "DIV" && k.classList?.contains("cursor-pointer"),
        );
        if (cp.length >= 16) {
          const hit = tryTake16(cp);
          if (hit) return hit;
        }
      }
    } catch (_e3) {
      // ignore
    }

    return [];
  }

  /**
   * Goblin / Moon Seekers: ô đúng → `icons/confirm.png`, ô sai → cancel tương tự (CDN).
   * Phải quét **mọi** img: nếu chỉ xem ảnh đầu (data:) sẽ tưởng ô chưa xong và bấm lại dù đã confirm.
   */
  function cellShowsResultIcon(cell) {
    if (!cell) return true;
    let imgs;
    try {
      imgs = cell.querySelectorAll("img");
    } catch (_e) {
      return true;
    }
    if (!imgs || imgs.length <= 0) return true;
    for (let i = 0; i < imgs.length; i += 1) {
      const u = String(imgs[i].currentSrc || imgs[i].getAttribute("src") || "").toLowerCase();
      if (u.startsWith("data:")) continue;
      if (
        u.includes("confirm") ||
        u.includes("cancel") ||
        u.includes("/icons/confirm") ||
        u.includes("/icons/cancel")
      ) {
        return true;
      }
    }
    return false;
  }

  /** Ảnh lưới: thường data: + noise/transform; bản mới có thể chỉ data: hoặc CDN — fallback bấm ô. */
  function goblinCaptchaClickTargetInCell(cell) {
    const imgs = cell.querySelectorAll("img");
    for (let i = 0; i < imgs.length; i += 1) {
      const im = imgs[i];
      if (!im.classList?.contains("h-full") || !im.classList?.contains("object-contain")) continue;
      const low = String(im.currentSrc || im.getAttribute("src") || "").toLowerCase();
      if (!low.startsWith("data:image")) continue;
      const st = String(im.getAttribute("style") || "");
      if (/transform|perspective|skew|rotate|scale/i.test(st)) return im;
    }
    for (let j = 0; j < imgs.length; j += 1) {
      const im = imgs[j];
      const low = String(im.currentSrc || im.getAttribute("src") || "").toLowerCase();
      if (low.startsWith("data:image")) return im;
    }
    const withClasses = cell.querySelector("img.h-full.object-contain") || cell.querySelector("img");
    if (withClasses && d.isVisible(withClasses)) return withClasses;
    return cell;
  }

  function tryTapClaimRewardCloseSync() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let dialogs;
      try {
        dialogs = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let j = 0; j < dialogs.length; j += 1) {
        const dlg = dialogs[j];
        if (!d.isVisible(dlg)) continue;
        const tx = String(dlg.textContent || "");
        if (!CLAIM_REWARD_SUMMARY_RE.test(tx)) continue;
        let buttons;
        try {
          buttons = dlg.querySelectorAll("button,[role='button']");
        } catch (_e2) {
          continue;
        }
        for (let bi = 0; bi < buttons.length; bi += 1) {
          const btn = buttons[bi];
          if (!d.isVisible(btn) || btn.disabled) continue;
          const label = d.textOf(btn);
          if (!CLOSE_BUTTON_LABEL_RE.test(label.trim())) continue;
          d.nativeClickClose(btn) || d.click(btn);
          logFlow("Ruộng DOM: đã đóng màn nhận thưởng (Close)", {});
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Captcha Goblin/Moon đôi khi **không** nằm trong `[role="dialog"]` (chỉ overlay div).
   * Gom: mọi dialog + khối có lưới flex-wrap đủ 16 ô và text tiêu đề khớp.
   */
  function collectGoblinCaptchaRootElements(doc) {
    const roots = [];
    const seen = new Set();

    function pushRoot(el) {
      if (!el || seen.has(el)) return;
      seen.add(el);
      roots.push(el);
    }

    try {
      const roleDialogs = doc.querySelectorAll('[role="dialog"]');
      for (let i = 0; i < roleDialogs.length; i += 1) pushRoot(roleDialogs[i]);
    } catch (_e) {
      // ignore
    }

    try {
      const grids = doc.querySelectorAll("div.flex.flex-wrap.justify-center.items-center");
      for (let gi = 0; gi < grids.length; gi += 1) {
        const grid = grids[gi];
        let nDirect = 0;
        try {
          const ch = grid.children;
          for (let ci = 0; ci < ch.length; ci += 1) {
            const c = ch[ci];
            if (c && c.tagName === "DIV" && c.classList?.contains("cursor-pointer") && c.classList?.contains("group")) {
              nDirect += 1;
            }
          }
        } catch (_e2) {
          continue;
        }
        if (nDirect < 16) continue;
        let anc = grid;
        for (let up = 0; up < 24 && anc; up += 1) {
          const tx = String(anc.textContent || "").replace(/\s+/g, " ");
          if (GOBLIN_CAPTCHA_TITLE_RE.test(tx)) {
            pushRoot(anc);
            break;
          }
          anc = anc.parentElement;
        }
      }
    } catch (_e3) {
      // ignore
    }

    return roots;
  }

  /**
   * TÌM MẢNG items[16] CỦA StopTheGoblins BẰNG CÁCH ĐI LÊN FIBER TỪ CELL.
   * Game lưu items trong useState: [{src, isGoblin, rotation, skew, scale, flip}, ...]
   * Từ cell div → __reactFiber → đi LÊN (.return) tìm fiber cha có hook chứa mảng 16 phần tử.
   * Đây là cách đáng tin nhất vì ta đi thẳng lên component tree, không BFS rộng.
   */
  function findItemsArrayFromCellFiber(cell) {
    if (!cell) return null;
    const fiberKey = Object.keys(cell).find(
      (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
    );
    if (!fiberKey) return null;
    let f = cell[fiberKey];

    // Đi LÊN (.return) tối đa 80 cấp — tìm hook chứa mảng 16 phần tử với isGoblin
    for (let depth = 0; depth < 80 && f; depth += 1) {
      let hook = f.memoizedState;
      for (let hi = 0; hi < 40 && hook; hi += 1) {
        const st = hook.memoizedState;
        if (Array.isArray(st) && st.length === 16) {
          const first = st[0];
          if (first && typeof first === "object" && typeof first.isGoblin === "boolean") {
            return st;
          }
        }
        // Đôi khi state được gói trong object
        if (st && typeof st === "object" && !Array.isArray(st)) {
          try {
            const keys = Object.keys(st);
            for (let ki = 0; ki < keys.length; ki += 1) {
              const val = st[keys[ki]];
              if (Array.isArray(val) && val.length === 16) {
                const f2 = val[0];
                if (f2 && typeof f2 === "object" && typeof f2.isGoblin === "boolean") {
                  return val;
                }
              }
            }
          } catch (_e) { /* ignore */ }
        }
        hook = hook.next;
      }
      f = f.return;
    }
    return null;
  }

  /**
   * Tìm mảng items[16] từ onClick closure của cell.
   * React gắn onClick trên cell div → fiber node có memoizedProps.onClick.
   * Từ onClick closure ta có thể truy cập biến items captured bên trong.
   * Ta dùng trick: lấy fiber.memoizedProps.children → tìm callback check(index).
   */
  function findItemsViaOnClickClosure(cells) {
    for (let ci = 0; ci < Math.min(cells.length, 16); ci += 1) {
      const cell = cells[ci];
      if (!cell) continue;
      const fiberKey = Object.keys(cell).find(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
      );
      if (!fiberKey) continue;
      let f = cell[fiberKey];
      // Tìm fiber có props.onClick
      for (let depth = 0; depth < 16 && f; depth += 1) {
        const onClick = f.memoizedProps?.onClick;
        if (typeof onClick === "function") {
          // Thử gọi toString() để kiểm tra closure captures items
          try {
            const fnStr = onClick.toString();
            if (fnStr.includes("isGoblin") || fnStr.includes("check") || fnStr.includes("items")) {
              // Tìm items array bằng cách đi lên từ fiber này
              const items = findItemsArrayFromCellFiber(f);
              if (items) return items;
            }
          } catch (_e) { /* ignore */ }
        }
        f = f.return;
      }
    }
    return null;
  }

  /**
   * ASYNC captcha solver — dùng MAIN world bridge để đọc React fiber.
   * Content scripts chạy trong Isolated World → KHÔNG thể đọc __reactFiber.
   * Bridge (page-bridge.js) chạy trong MAIN world → CÓ thể đọc fiber.
   *
   * Chiến lược giải (theo thứ tự ưu tiên):
   *  1) Bridge MAIN world → đọc fiber items[16] → tap ô target.
   *  2) Per-cell fiber → đọc từng ô riêng lẻ (fallback khi bridge không lấy được mảng).
   *  3) Image heuristic → phân loại ảnh 1×1 pixel → tap ô thiểu số.
   *  4) Stuck detection → nếu captcha kẹt >30s → Escape / Close / reload.
   */
  async function tryStopGoblinsCaptchaAsync() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let roots;
      try {
        roots = collectGoblinCaptchaRootElements(docs[di]);
      } catch (_e) {
        continue;
      }
      for (let j = 0; j < roots.length; j += 1) {
        const dlg = roots[j];
        if (!d.isVisible(dlg)) continue;
        const tx = String(dlg.textContent || "").replace(/\s+/g, " ");
        if (!GOBLIN_CAPTCHA_TITLE_RE.test(tx)) continue;

        const cells = collectGoblinGridCells(dlg);
        if (cells.length < 16) continue;

        // ═══════ Strategy 1 (PRIMARY): Đọc fiber qua MAIN world bridge ═══════
        let items = null;
        if (S.gameBridge && S.gameBridge.isReady && typeof S.gameBridge.requestCaptchaGrid === "function") {
          try {
            items = await S.gameBridge.requestCaptchaGrid(2500);
          } catch (_e) {
            items = null;
          }
        }

        if (items && items.length === 16) {
          let tappedOne = false;
          let allTargetsDone = true;
          for (let i = 0; i < 16; i += 1) {
            const item = items[i];
            if (!item || typeof item !== "object") continue;
            if (item.isGoblin !== true) continue;
            const cell = cells[i];
            if (!cell || !d.isVisible(cell)) continue;
            if (cellShowsResultIcon(cell)) continue;
            allTargetsDone = false;
            /** Game gắn onClick trên ô div — ưu tiên bấm ô. */
            d.nativeClickClose(cell) || d.clickAtCenter(cell);
            const inner = goblinCaptchaClickTargetInCell(cell);
            if (inner && inner !== cell && d.isVisible(inner)) {
              d.nativeClickClose(inner) || d.clickAtCenter(inner);
            }
            runtime.captchaSolvedCount = (runtime.captchaSolvedCount || 0) + 1;
            runtime._captchaStuckSince = 0;
            logFlow("Ruộng DOM: đã tap ô Goblin/Moon (MAIN bridge)", { index: i, isGoblin: true, solved: runtime.captchaSolvedCount });
            tappedOne = true;
            break; // 1 ô mỗi lần gọi
          }
          if (tappedOne) return true;

          // Tất cả target đã tap nhưng dialog vẫn hiện → xử lý kẹt
          if (allTargetsDone) {
            return handleCaptchaStuck(dlg, "bridge_all_tapped");
          }
          continue;
        }

        // ═══════ Strategy 2: Per-cell fiber fallback ═══════
        if (tryClickMoonSeekersByPerCellFiber(dlg, cells)) {
          runtime.captchaSolvedCount = (runtime.captchaSolvedCount || 0) + 1;
          runtime._captchaStuckSince = 0;
          return true;
        }

        // ═══════ Strategy 3: Image heuristic (không cần fiber) ═══════
        if (tryClickMoonSeekersByImageHeuristic(dlg, cells)) {
          runtime.captchaSolvedCount = (runtime.captchaSolvedCount || 0) + 1;
          runtime._captchaStuckSince = 0;
          return true;
        }

        // Tất cả strategy thất bại → xử lý kẹt
        runtime.captchaFailedCount = (runtime.captchaFailedCount || 0) + 1;
        logThrottled("crop_dom_goblin_no_fiber", 15000, "Ruộng DOM: captcha Goblin/Moon — tất cả chiến lược thất bại", {
          cells: cells.length,
          bridgeReady: !!(S.gameBridge && S.gameBridge.isReady),
          bridgeResult: items ? "found_but_no_targets" : "null",
          failed: runtime.captchaFailedCount,
        });

        return handleCaptchaStuck(dlg, "all_strategies_failed");
      }
    }
    return false;
  }

  /**
   * Xử lý captcha bị kẹt — khi đã tap hết target nhưng dialog vẫn hiện,
   * hoặc khi không strategy nào giải được.
   * - <15s: chờ game xử lý (return true để giữ flow).
   * - 15-30s: thử Escape / Close button.
   * - >30s: thử reload nếu đã bật reloadPageOnGoblinMoonCaptcha.
   */
  function handleCaptchaStuck(dlg, reason) {
    const t = now();
    if (!runtime._captchaStuckSince || runtime._captchaStuckSince <= 0) {
      runtime._captchaStuckSince = t;
    }
    const stuckMs = t - runtime._captchaStuckSince;

    if (stuckMs < 12000) {
      // Chờ game tự xử lý (animation confirm/dismiss)
      logThrottled("crop_dom_captcha_stuck_wait", 5000,
        "Ruộng DOM: captcha kẹt (" + reason + ") — chờ game xử lý (" + Math.round(stuckMs / 1000) + "s)", { reason, stuckMs });
      return true; // return true để flow không chạy luồng khác khi captcha đang mở
    }

    if (stuckMs < 25000) {
      // Thử Escape hoặc Close button
      logFlow("Ruộng DOM: captcha kẹt >12s — thử Escape/Close", { reason, stuckMs });
      d.sendEscapeToGameWindows();

      // Tìm nút Close/OK trong dialog
      try {
        const buttons = dlg.querySelectorAll("button,[role='button']");
        for (let bi = 0; bi < buttons.length; bi += 1) {
          const btn = buttons[bi];
          if (!d.isVisible(btn) || btn.disabled) continue;
          const label = String(d.textOf(btn) || "").trim();
          if (CLOSE_BUTTON_LABEL_RE.test(label)) {
            d.nativeClickClose(btn) || d.click(btn);
            logFlow("Ruộng DOM: đã bấm nút Close/OK trong captcha kẹt", { label });
            break;
          }
        }
      } catch (_e) { /* ignore */ }
      return true;
    }

    // >25s kẹt → thử reload
    logFlow("Ruộng DOM: captcha kẹt >25s — thử reload nếu bật cài đặt", { reason, stuckMs });
    runtime._captchaStuckSince = 0; // Reset để không loop reload
    if (tryReloadPageForStuckGridCaptcha()) {
      return true;
    }
    // Không bật reload → vẫn Escape liên tục
    d.sendEscapeToGameWindows();
    return true;
  }

  function tryTapChestCaptchaModalSync() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let dialogs;
      try {
        dialogs = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let j = 0; j < dialogs.length; j += 1) {
        const dlg = dialogs[j];
        if (!d.isVisible(dlg)) continue;
        const tx = String(dlg.textContent || "").replace(/\s+/g, " ");
        if (!CHEST_CAPTCHA_TEXT_RE.test(tx)) continue;
        const chestImg = findChestCaptchaImgInDialog(dlg);
        if (!chestImg) continue;
        d.nativeClickClose(chestImg) || d.clickAtCenter(chestImg);
        logFlow("Ruộng DOM: đã tap rương (captcha chest)", {});
        return true;
      }
    }
    return false;
  }

  async function tryResolveHarvestRewardCaptchas() {
    if (tryTapClaimRewardCloseSync()) return true;
    if (await tryStopGoblinsCaptchaAsync()) return true;
    if (tryTapChestCaptchaModalSync()) return true;
    return false;
  }

  /** Chest + Goblin/Moon grid + Close reward — gọi đầu tick / đầu bước ruộng. */
  async function tryTapChestCaptchaIfPresent() {
    if (!(await tryResolveHarvestRewardCaptchas())) return false;
    await sleep(rand(160, 360));
    runtime.lastAction = "reward_captcha_resolve";
    runtime.lastActionAt = now();
    return true;
  }

  /**
   * Kiểm tra inventory có hạt nào thuộc mùa hiện tại không.
   */
  function cropDomHasSeedForCurrentSeason() {
    const st = S.gameBridge?.getLatestState?.();
    const seasonKey = normalizeSeasonName(st?.season);
    const inv = st?.inventory || {};
    const preferredSeed = String(runtime.settings.cropDomSeedName || "Auto").trim();
    const skipLong = !!runtime.settings.cropDomSkipLongGrow;
    return getBestSeedFromInventory(inv, seasonKey, preferredSeed, skipLong) !== null;
  }

  // ── Mùa rìa (Axe) qua XState — port từ SunFlower Land Extension:buyAxeOnce ──

  const AXE_COIN_PRICE = 20;

  /**
   * Mua 1 Axe qua XState event (tool.crafted).
   * Nếu shop hết hàng → restock Blacksmith trước.
   * Khi mua thành công → reset nextTreeFlowAt + nextRockFlowAt → các luồng chặt/đào khởi động lại ngay.
   * @returns {Promise<boolean>}
   */
  async function tryBuyAxeViaEvent() {
    if (!S.gameBridge?.isReady) return false;

    const st = S.gameBridge.getLatestState();
    if (!st) return false;

    const coins = typeof st.coins === "number" && Number.isFinite(st.coins) ? st.coins : 0;
    if (coins < AXE_COIN_PRICE) {
      logFlow("Mua rìa: không đủ xu", { coins, cần: AXE_COIN_PRICE });
      return false;
    }

    const axeInInv = Math.floor(Number(st.inventory?.Axe || 0));
    if (axeInInv > 0) {
      logFlow("Mua rìa: đã có rìa trong kho — không cần mua", { axeInInv });
      return false;
    }

    // Restock blacksmith nếu shop hết hàng
    const stockAxe = Math.floor(Number((st.stock || {})['Axe'] || 0));
    if (stockAxe < 1) {
      const restockResult = await S.gameBridge.sendEvent(
        { type: "npc.restocked", npc: "blacksmith" },
        2400,
      );
      logFlow("Mua rìa: restock blacksmith", { ok: restockResult?.ok });
      await sleep(rand(300, 500));
    }

    const result = await S.gameBridge.sendEvent(
      { type: "tool.crafted", tool: "Axe" },
      3200,
    );

    if (result?.ok) {
      logFlow("Mua rìa: thành công — khởi động lại luồng chặt/đào", { coins });
      // Restart luồng chặt cây và đào đá ngay lập tức
      const t = now();
      runtime.nextTreeFlowAt = t;
      runtime.nextRockFlowAt = t;
      runtime.treeFlowState = "Sẵn sàng (vừa mua rìa)";
      return true;
    }

    logFlow("Mua rìa: thất bại", { error: result?.error });
    return false;
  }

  /**
   * Đóng dialog "Wrong seed" (hạt sai mùa) nếu game hiện lên.
   * Xóa cache hạt đã chọn để bot chọn lại hạt đúng mùa trong lần tiếp theo.
   */
  const WRONG_SEED_DIALOG_RE =
    /wrong\s*seed|cannot\s+be\s+planted\s+in|please\s+select\s+a\s+different\s+seed|sai\s+h[a\u1ea1]t|kh\u00f4ng\s+th\u1ec3\s+tr\u1ed3ng/i;

  function tryCloseWrongSeedDialogSync() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let dialogs;
      try {
        dialogs = docs[di].querySelectorAll('[role="dialog"]');
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < dialogs.length; i += 1) {
        const dlg = dialogs[i];
        if (!d.isVisible(dlg)) continue;
        const t = String(dlg.textContent || "").replace(/\s+/g, " ");
        if (!WRONG_SEED_DIALOG_RE.test(t)) continue;

        // Tìm nút Close và bấm
        let buttons;
        try {
          buttons = dlg.querySelectorAll("button,[role='button']");
        } catch (_e2) {
          continue;
        }
        let closed = false;
        for (let j = 0; j < buttons.length; j += 1) {
          const btn = buttons[j];
          if (!d.isVisible(btn) || btn.disabled) continue;
          const tx = String(d.textOf(btn) || "").trim().toLowerCase();
          if (/^(close|\u0111\u00f3ng|cerrar|fermer|fechar|ok)$/i.test(tx)) {
            d.nativeClickClose(btn) || d.click(btn);
            closed = true;
            break;
          }
        }
        if (!closed) {
          // Fallback: Escape
          d.sendEscapeToGameWindows();
        }

        // Xóa cache hạt sai mùa → lần sau chọn lại hạt đúng
        runtime.cropDomLastSelectedSeedName = null;
        logFlow("Ru\u1ed9ng DOM: đ\u00f3ng dialog \"Wrong seed\" — xóa cache hạt, chọn lại mùa này", {});
        return true;
      }
    }
    return false;
  }

  /**
   * Một bước nhỏ ruộng: giải modal thưởng (nếu có) → thu hoạch (nếu có cây sẵn) → mua/gieo.
   * Toàn bộ quyết định mua + gieo đều dùng **mùa hiện tại** từ bridge state.
   * @returns {Promise<boolean>}
   */
  async function tryOneFarmStep() {
    if (!runtime.settings.autoFarmCropsDom) return false;

    if (await tryTapChestCaptchaIfPresent()) return true;

    // Đóng dialog "Wrong seed" (hạt sai mùa) nếu game hiện — xóa cache để chọn lại
    if (tryCloseWrongSeedDialogSync()) {
      await sleep(rand(200, 400));
      return true;
    }

    const bridgeReady = !!S.gameBridge?.isReady;

    // ── Đọc state bridge một lần duy nhất ──
    const st = S.gameBridge?.getLatestState?.();

    // ── Kiểm tra THỜI TIẾT phá hoại (lốc xoáy / sóng thần / đóng băng) ──
    // Bridge đã lọc bỏ ô bị hư khỏi emptyCropPlots → flow bình thường chỉ thấy ô gieo được an toàn.
    const weather = st?.activeWeather;
    const weatherBlocking = !!(weather && weather.name && !weather.isProtected && weather.blockedPlotCount > 0);
    if (weatherBlocking) {
      logThrottled(
        "crop_dom_weather_block",
        60000,
        "Ruộng DOM: ⛈ thời tiết " + weather.name + " đang hoạt động — " +
          weather.blockedPlotCount + " ô bị chặn, chỉ gieo trên các ô an toàn",
        { weather: weather.name, blocked: weather.blockedPlotCount },
      );
    }

    // ── Xác định MÙA hiện tại ──
    const seasonKey = normalizeSeasonName(st?.season);

    // Reset cursor khi chuyển mùa
    if (runtime.cropDomLastSeasonKey !== seasonKey) {
      runtime.cropDomLastSeasonKey = seasonKey;
      runtime.cropDomBuyCursor = 0;
      runtime.cropDomSkipBuySeedsUntil = 0;
      runtime.cropDomLastSelectedSeedName = null;
      logFlow("Ruộng DOM: phát hiện mùa mới — reset cursor mua hạt", { seasonKey });
    }

    // ── Thông tin inventory + cài đặt người dùng ──
    const invNow = st?.inventory || {};
    const preferredSeed = String(runtime.settings.cropDomSeedName || "Auto").trim();
    const skipLong = !!runtime.settings.cropDomSkipLongGrow;

    // ── Chọn hạt gieo ──
    // Ưu tiên: hạt đang cầm (cache) nếu vẫn còn trong inventory → gieo hết loại này rồi mới đổi.
    // Không tính lại hạt tốt nhất mỗi tick (tránh đổi hạt giữa chừng).
    const cachedSeedName = runtime.cropDomLastSelectedSeedName;
    let plantName;
    if (cachedSeedName && seedCountFromBridge(cachedSeedName) > 0) {
      // Vẫn còn hạt đang cầm → tiếp tục gieo loại đó
      plantName = cachedSeedName;
    } else {
      // Hết hoặc chưa chọn → chọn hạt tốt nhất theo mùa
      if (cachedSeedName && !seedCountFromBridge(cachedSeedName)) {
        logFlow("Ruộng DOM: hạt " + cachedSeedName + " đã hết — đổi sang loại khác", { cachedSeedName });
        runtime.cropDomLastSelectedSeedName = null;
      }
      plantName = getBestSeedFromInventory(invNow, seasonKey, preferredSeed, skipLong)
        || pickSeedForPlantingFromBridge();
    }
    let stock = seedCountFromBridge(plantName);

    const emptyPlots = listEmptyCropPlotsFromState();
    const emptyLeft = emptyPlots.length;

    logThrottled(
      "crop_dom_season_tick",
      30000,
      "Ruộng DOM: tick — mùa / hạt / ô trống",
      { seasonKey, plantName, stock, emptyLeft, preferredSeed },
    );

    if (bridgeReady && emptyLeft > 0) {
      runtime.cropDomWhenFullPollAt = 0;
    }

    // ── Phát hiện stuck: gieo liên tục nhưng emptyLeft không giảm ──
    // Xảy ra khi: cache sai (hạt không thực sự trong tay), game idle/mobile không nhận click.
    // Bot log "gieo thành công" nhưng thực tế không có gì được trồng.
    // Giải pháp: nếu emptyLeft không đổi sau >= 5 lần gieo liên tiếp → xóa cache, force re-select.
    if (emptyLeft > 0 && emptyLeft === runtime._cropDomLastEmptyLeft && runtime.lastAction === "crop_plant_dom") {
      runtime._cropDomStuckPlantCount = (runtime._cropDomStuckPlantCount || 0) + 1;
      // Giảm ngưỡng 5→2: reset cache sớm hơn khi game mở holder popup thay vì gieo
      if (runtime._cropDomStuckPlantCount >= 2) {
        logFlow(
          "Ruộng DOM: ⚠ stuck — gieo " + runtime._cropDomStuckPlantCount + " lần mà ô trống không giảm — xóa cache hạt, force re-select",
          { emptyLeft, cachedSeedName, stuckCount: runtime._cropDomStuckPlantCount },
        );
        runtime.cropDomLastSelectedSeedName = null;
        runtime.cropDomLastSelectedSeedAt = 0;
        runtime._cropDomStuckPlantCount = 0;
      }
    } else {
      // emptyLeft đã thay đổi hoặc action khác → reset bộ đếm stuck
      runtime._cropDomLastEmptyLeft = emptyLeft;
      runtime._cropDomStuckPlantCount = 0;
    }

    // (Khối tự động mua trước khi thu hoạch đã được xóa để ưu tiên Thu Hoạch trước theo yêu cầu của người dùng)

    const lastIsPlant = runtime.lastAction === "crop_plant_dom";

    if (bridgeReady && emptyLeft === 0 && now() < (runtime.cropDomWhenFullPollAt || 0)) {
      return false;
    }

    // ── Ưu tiên thu hoạch (nếu không đang dở tay gieo) ──
    if (await tryHarvestOne()) {
      runtime.cropDomWhenFullPollAt = 0;
      return true;
    }

    // ── Gieo liên tục (nếu vừa gieo tick trước) ──
    if (lastIsPlant && (stock > 0 || !bridgeReady) && emptyLeft > 0) {
      const plantRes = await tryPlantOne(plantName);
      if (plantRes === true) return true;
      if (plantRes === "no_plots") {
        await sleep(600); // UI chưa kịp hiện hình cây, đứng chờ không chuyển luồng
        return true;
      }
    }

    if (bridgeReady && emptyLeft === 0) {
      // ── Tính thời gian cây gần nhất chín (readyAt) để nghỉ đúng, không spam ──
      const crops = st?.crops;
      let nearestReadyMs = 0;
      if (Array.isArray(crops) && crops.length > 0) {
        const t = now();
        let minWait = Number.MAX_SAFE_INTEGER;
        for (let ci = 0; ci < crops.length; ci += 1) {
          const c = crops[ci];
          let readyAt = Number(c?.readyAt) || 0;
          if (readyAt <= 0) continue;
          // Auto-detect: nếu readyAt < 1e12 → game lưu bằng giây, cần nhân 1000
          if (readyAt > 0 && readyAt < 1e12) readyAt *= 1000;
          const wait = readyAt - t;
          if (wait > 0 && wait < minWait) {
            minWait = wait;
          }
        }
        if (minWait < Number.MAX_SAFE_INTEGER) {
          nearestReadyMs = minWait;
        }
      }

      // Dùng readyAt gần nhất + buffer 2-4 giây; nếu không tính được thì fallback 30 giây
      // Cap tối đa 5 phút để không bỏ lỡ cây chín sớm do buff/phân bón
      const MIN_POLL_MS = 5000;
      const MAX_POLL_MS = 5 * 60 * 1000;
      const bufferMs = rand(2000, 4000);
      const smartWaitMs = nearestReadyMs > 0
        ? Math.max(MIN_POLL_MS, Math.min(nearestReadyMs + bufferMs, MAX_POLL_MS))
        : rand(25000, 35000); // fallback nếu không có readyAt

      runtime.cropDomWhenFullPollAt = now() + smartWaitMs;
      const waitSec = Math.round(smartWaitMs / 1000);
      const waitMin = Math.floor(waitSec / 60);
      const waitSecRem = waitSec % 60;
      const waitLabel = waitMin > 0 ? waitMin + "p" + (waitSecRem > 0 ? waitSecRem + "s" : "") : waitSec + "s";
      logThrottled("crop_dom_full_wait", 18000,
        "Ruộng DOM: tất cả ô đã trồng — nghỉ " + waitLabel + " (cây gần nhất chín sau " +
          (nearestReadyMs > 0 ? Math.ceil(nearestReadyMs / 1000) + "s" : "không rõ") + ")",
        { pollAfterMs: smartWaitMs, nearestReadySec: nearestReadyMs > 0 ? Math.ceil(nearestReadyMs / 1000) : null },
      );
      return false;
    }

    // ── Gieo hạt (nếu không có gì thu hoạch và có ô trống) ──
    if (stock > 0 || !bridgeReady) {
      const plantRes = await tryPlantOne(plantName);
      if (plantRes === true) return true;
      
      if (bridgeReady) {
        if (plantRes === "no_plots") {
          // KHÔNG bump cropDomBuy cursor! Vì lỗi không phải do thiếu hạt, mà là không thấy ô đất.
          // Đợi một chút rồi lặp lại để nhường cho UI kịp cập nhật hạt mọc lên, hoặc tool tự scroll tới chỗ khác.
          await sleep(600);
          return true; // GIỮ CHO VÒNG LẶP TIẾP TỤC ĐỂ CHẠY HẾT RỘNG
        }
        if (plantRes === "no_seed_ui") {
          // State nói có hạt nhưng UI nói không có (do game update chậm sau khi gieo)
          logFlow("Ruộng: UI báo hết hạt (chờ state cập nhật lại)", {});
          S.gameBridge?.requestState?.().catch(() => {});
          await sleep(800); // Chờ state thực sự về
          return true; // Vòng lặp sẽ tiếp tục và gọi lại, lúc này state đã là 0 -> nhảy đi mua
        }
        // Chỉ bump nếu rớt vào lỗi khác
        bumpCropDomBuyAfterFail(plantName);
        return true;
      }
    }

    // Hết hạt + có ô trống → Không tự động mua hạt lẻ nữa (sẽ mua gối đầu 12h một lần)
    if (bridgeReady && emptyLeft > 0 && stock <= 0) {
      logThrottled("crop_dom_out_of_seeds_waiting", 15000, "Ruộng: Hết hạt giống trong kho, chờ luồng Reset mua gối đầu", { emptyLeft });
      return false;
    }

    return false;
  }

  function isStopTheGoblinsOrMoonCaptchaVisibleInDoc(doc) {
    try {
      const roots = collectGoblinCaptchaRootElements(doc);
      for (let j = 0; j < roots.length; j += 1) {
        const el = roots[j];
        if (!el || !d.isVisible(el)) continue;
        const tx = String(el.textContent || "").replace(/\s+/g, " ");
        if (GOBLIN_CAPTCHA_TITLE_RE.test(tx)) return true;
      }
    } catch (_e) {
      // ignore
    }
    return false;
  }

  function isStopTheGoblinsOrMoonCaptchaVisible() {
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      if (isStopTheGoblinsOrMoonCaptchaVisibleInDoc(docs[di])) return true;
    }
    return false;
  }

  function hardReloadLikeShiftF5() {
    // Force next navigation to bypass normal URL cache by changing a query token.
    // This mimics a hard reload behavior closer to Shift+F5 than location.reload().
    // Tắt cảnh báo beforeunload trước khi reload
    window.onbeforeunload = null;
    const u = new URL(window.location.href);
    u.searchParams.set("_sfl_hard_reload", String(Date.now()));
    window.location.replace(u.toString());
  }

  /**
   * Khi bật trong cài đặt: thấy modal Goblin / Moon Seekers → hard reload (kiểu Shift+F5) để thoát kẹt.
   * Cooldown ~35s (sessionStorage) tránh lặp reload liên tục nếu captcha vẫn hiện sau tải lại.
   */
  function tryReloadPageForStuckGridCaptcha() {
    if (!runtime.settings.reloadPageOnGoblinMoonCaptcha) return false;
    if (!isStopTheGoblinsOrMoonCaptchaVisible()) return false;
    const tsKey = "sfl_ui_goblin_moon_cap_reload_ts";
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(tsKey) || 0);
    } catch (_e) {
      // ignore
    }
    const nowMs = Date.now();
    if (nowMs - last < 35000) return false;

    const countKey = S.CAPTCHA_GOBLIN_MOON_RELOAD_SKIP_COUNT_KEY;
    try {
      chrome.storage.local.get([countKey], (r) => {
        const n = Math.max(0, Math.floor(Number(r?.[countKey]) || 0)) + 1;
        try {
          sessionStorage.setItem(tsKey, String(nowMs));
        } catch (_e2) {
          // ignore
        }
        chrome.storage.local.set({ [countKey]: n }, () => {
          runtime.captchaGoblinMoonReloadSkipCount = n;
          logFlow("Captcha Goblin/Moon — tải lại trang (thoát captcha, lần thứ " + n + ")", {});
          try {
            hardReloadLikeShiftF5();
          } catch (_e3) {
            // ignore
          }
        });
      });
    } catch (_e4) {
      return false;
    }
    return true;
  }

  let skipExpandUntil = 0;
  async function tryExpandIslandViaEvent() {
    if (!runtime.settings.autoExpandIsland) return false;
    if (now() < skipExpandUntil) return false;
    if (!S.gameBridge?.isReady) return false;

    const result = await S.gameBridge.sendEvent({ type: "island.expanded" }, 3200);
    
    if (result?.ok) {
      logFlow("Nâng đảo: thành công!", {});
      S.gameBridge.requestState().catch(() => {});
      return true;
    }

    const err = String(result?.error || "unknown");
    if (/insufficient|missing|not_enough|resources/i.test(err)) {
      // Không đủ tài nguyên -> đợi 4 tiếng
      skipExpandUntil = now() + 4 * 60 * 60 * 1000;
      logFlow("Nâng đảo: chưa đủ tài nguyên, bỏ qua 4h", { error: err });
    } else if (/already|max|locked/i.test(err)) {
      // Đã max level hoặc khóa -> đợi 24 tiếng
      skipExpandUntil = now() + 24 * 60 * 60 * 1000;
      logFlow("Nâng đảo: đã đạt tối đa hoặc chưa mở khóa, bỏ qua 24h", { error: err });
    } else {
      // Lỗi khác -> đợi 15 phút
      skipExpandUntil = now() + 15 * 60 * 1000;
      logFlow("Nâng đảo: lỗi không xác định, bỏ qua 15p", { error: err });
    }
    return false;
  }

  /**
   * Mua hết tất cả các loại hạt giống có thể mua của mùa hiện tại (dùng khi reset 12h).
   * Không giới hạn số lượng theo ô đất trống, mua tối đa stock của cửa hàng trong tầm coins.
   */
  async function waitForGameReady(maxWaitMs = 12000) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      try {
        await S.gameBridge.requestState();
      } catch (_e) { }
      const st = S.gameBridge.getLatestState();
      if (st && st.machineReady && !st.machineBusy) {
        return true;
      }
      await sleep(500);
    }
    return false;
  }

  async function buyAllPossibleSeedsViaEvent() {
    if (!S.gameBridge?.isReady) return { ok: false };
    logFlow("Reset Purchase: Bắt đầu mua hết hạt giống có thể mua...", {});

    try {
      await S.gameBridge.requestState();
    } catch (_e) { /* ignore */ }
    await sleep(400);

    const st = S.gameBridge.getLatestState();
    if (!st) return { ok: false };

    const seasonKey = normalizeSeasonName(st.season);
    let coins = typeof st.coins === "number" && Number.isFinite(st.coins) ? st.coins : 0;

    const stock = st.stock || {};
    const allowed = SEASONAL_CROP_PLOT_SEEDS[seasonKey] || SEASONAL_CROP_PLOT_SEEDS.spring;
    const allowedSet = new Set(allowed);

    // Lọc các hạt ruộng thuộc mùa hiện tại
    const cropSeeds = SEED_BUY_ORDER_DOM.filter((s) => {
      if (GREENHOUSE_SEED_NAMES_DOM.includes(s)) return false;
      return allowedSet.has(s);
    });

    // Gom hạt giống theo cấu hình bật/tắt (autoFruitTree và autoHoney) của người dùng, có lọc theo mùa
    const extraSeeds = [];
    if (runtime.settings.autoFruitTree) {
      const allowedFruits = SEASONAL_FRUIT_SEEDS[seasonKey] || [];
      extraSeeds.push(...FRUIT_SAPLINGS_DOM.filter(s => allowedFruits.includes(s)));
    }
    if (runtime.settings.autoHoney) {
      const allowedFlowers = SEASONAL_FLOWER_SEEDS[seasonKey] || [];
      extraSeeds.push(...FLOWER_SEEDS_DOM.filter(s => allowedFlowers.includes(s)));
    }

    const seedsToBuy = [...cropSeeds, ...extraSeeds];

    const xp = st.bumpkinExperience || 0;
    const bumpkinLevel = getBumpkinLevel(xp);

    // Lọc và in ra màn hình danh sách hạt giống thực tế có thể mua trong mùa hiện tại (tồn tại trong stock và đã mở khóa)
    const activeCrops = cropSeeds.filter(s => stock[s] !== undefined && (!SEED_LEVEL_REQUIREMENTS[s] || bumpkinLevel >= SEED_LEVEL_REQUIREMENTS[s]));
    const activeFruits = extraSeeds.filter(s => FRUIT_SAPLINGS_DOM.includes(s) && stock[s] !== undefined && (!SEED_LEVEL_REQUIREMENTS[s] || bumpkinLevel >= SEED_LEVEL_REQUIREMENTS[s]));
    const activeFlowers = extraSeeds.filter(s => FLOWER_SEEDS_DOM.includes(s) && stock[s] !== undefined && (!SEED_LEVEL_REQUIREMENTS[s] || bumpkinLevel >= SEED_LEVEL_REQUIREMENTS[s]));

    logFlow(`=== DANH SÁCH HẠT MUA THEO MÙA (${seasonKey.toUpperCase()}) ===`, {});
    logFlow(`-> Hạt ruộng đúng mùa: ` + (activeCrops.length > 0 ? activeCrops.join(", ") : "Không có"), {});
    logFlow(`-> Cây quả đúng mùa: ` + (activeFruits.length > 0 ? activeFruits.join(", ") : "Không có"), {});
    logFlow(`-> Hạt hoa đúng mùa: ` + (activeFlowers.length > 0 ? activeFlowers.join(", ") : "Không có"), {});
    logFlow(`===================================================`, {});

    logFlow(`Reset Purchase: Mùa hiện tại là ${seasonKey} (Bumpkin Cấp ${bumpkinLevel}). Có ${seedsToBuy.length} loại hạt cần check.`, { coins });

    let anyBought = false;
    for (const seed of seedsToBuy) {
      if (runtime.lockedSeeds?.has(seed)) continue; // Bỏ qua nếu hạt này đã bị khóa (chưa mở khóa)

      // Kiểm tra cấp độ Bumpkin để tránh mua hạt chưa được mở khóa
      const reqLevel = SEED_LEVEL_REQUIREMENTS[seed];
      if (reqLevel && bumpkinLevel < reqLevel) {
        continue; // Bỏ qua vì cấp độ tài khoản chưa đủ để mở khóa
      }

      const available = Math.floor(Number(stock[seed] || 0));
      if (available <= 0) continue;

      const price = getNormalSeedBuyPriceDom(seed);
      if (price === Number.MAX_SAFE_INTEGER) continue;

      if (coins < price) {
        continue; // Không đủ xu để mua hạt này
      }

      // Chờ cho đến khi game sẵn sàng (hết trạng thái autosaving/pending_actions của giao dịch trước)
      const isReady = await waitForGameReady(15000);
      if (!isReady) {
        logFlow(`Reset Purchase: Game bận quá lâu, tạm bỏ qua hạt ${seed}`, {});
        continue;
      }

      // Cập nhật lại số xu và tồn kho mới nhất từ máy chủ sau khi game sẵn sàng
      const currentSt = S.gameBridge.getLatestState();
      if (currentSt) {
        coins = typeof currentSt.coins === "number" && Number.isFinite(currentSt.coins) ? currentSt.coins : coins;
        if (currentSt.stock) {
          Object.assign(stock, currentSt.stock);
        }
      }

      const freshAvailable = Math.floor(Number(stock[seed] || 0));
      if (freshAvailable <= 0) continue;

      // Mua tối đa số lượng affordable trong stock
      const amount = Math.min(freshAvailable, Math.floor(coins / price));
      if (amount <= 0) continue;

      logFlow(`Reset Purchase: Đang tiến hành mua ${amount} hạt ${seed} (giá ${price} xu/hạt)`, {});

      let result;
      for (let attempt = 1; attempt <= 6; attempt++) {
        result = await S.gameBridge.sendEvent(
          { type: "seed.bought", item: seed, amount },
          3200
        );
        if (result?.ok) break;

        const errReason = String(result?.error || "unknown");
        if (/insufficient|not_enough|no_coins|funds/i.test(errReason)) {
          break; // Hết tiền thì dừng thử lại
        }
        
        const waitMs = attempt <= 2 ? 800 : attempt <= 4 ? 1200 : 1800;
        await sleep(waitMs);
      }

      if (result?.ok) {
        anyBought = true;
        // Cập nhật lại state từ game để lấy signature/sequence mới từ máy chủ
        try {
          await S.gameBridge.requestState();
        } catch (_e) { /* ignore */ }
        await sleep(500);

        const freshSt = S.gameBridge.getLatestState();
        if (freshSt) {
          coins = typeof freshSt.coins === "number" && Number.isFinite(freshSt.coins) ? freshSt.coins : (coins - amount * price);
          if (freshSt.stock) {
            Object.assign(stock, freshSt.stock);
          }
        } else {
          coins -= amount * price;
          stock[seed] = Math.max(0, freshAvailable - amount);
        }

        logFlow(`Reset Purchase: Đã mua thành công ${amount} hạt ${seed}`, { coinsLeft: coins });
        // Đợi 10 giây trước khi tiếp tục mua hạt tiếp theo để bảo đảm giao dịch lưu hoàn tất
        await sleep(rand(10000, 11000));
      } else {
        logFlow(`Reset Purchase: Mua hạt ${seed} thất bại`, { error: result?.error });
        const err = String(result?.error || "").toLowerCase();
        if (/locked|level|requirement|experience|bumpkin|rank|unlock/i.test(err)) {
          runtime.lockedSeeds = runtime.lockedSeeds || new Set();
          runtime.lockedSeeds.add(seed);
          logFlow(`Reset Purchase: Đã đánh dấu hạt ${seed} là chưa mở khóa (Locked) — sẽ bỏ qua ở các lượt sau`, {});
        }
        await sleep(800);
      }
    }

    logFlow("Reset Purchase: Hoàn tất mua hạt giống gối đầu!", { anyBought });
    return { ok: true, anyBought };
  }

  S.cropDom = {
    tryOneFarmStep,
    tryTapChestCaptchaIfPresent,
    tryReloadPageForStuckGridCaptcha,
    seedNameToSlug,
    isBettySeedShopDialogOpen,
    tryBuyAxeViaEvent,
    tryExpandIslandViaEvent,
    buyAllPossibleSeedsViaEvent,
  };
})(window.SFL);
