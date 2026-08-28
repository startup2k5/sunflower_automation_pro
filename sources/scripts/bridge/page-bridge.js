// ═══════════════════════════════════════════════════════════════════
// PAGE BRIDGE — MAIN WORLD EXTENSION SCRIPT (page-bridge.js)
// Chạy trong MAIN world để trích xuất 100% dữ liệu Game State
// ═══════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  if (window.__SFL_PAGE_BRIDGE_LOADED__) {
    return;
  }
  window.__SFL_PAGE_BRIDGE_LOADED__ = true;

  let cachedGameService = null;

  function toSafeNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, "").trim());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === "object") {
      if (typeof value.toNumber === "function") {
        const parsed = Number(value.toNumber());
        return Number.isFinite(parsed) ? parsed : 0;
      }
      if (typeof value.toString === "function") {
        const parsed = Number(String(value));
        return Number.isFinite(parsed) ? parsed : 0;
      }
    }
    return 0;
  }

  function isGameService(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (typeof obj.getSnapshot !== "function" || typeof obj.send !== "function") {
      return false;
    }
    try {
      const snap = obj.getSnapshot();
      const ctx = snap?.context || snap?.value?.context || {};
      const state = ctx.state || ctx.gameState || ctx;
      return !!(state && (state.inventory || state.season || state.trees || state.crops || state.coins !== undefined));
    } catch (_e) {
      return false;
    }
  }

  function extractService(input) {
    if (!input || typeof input !== "object") return null;
    if (typeof input.shortcutItem === "function") {
      cachedShortcutItem = input.shortcutItem;
    }
    if (isGameService(input)) return input;
    try {
      for (const key of Object.keys(input)) {
        if (key.startsWith("__")) continue;
        const value = input[key];
        if (value && typeof value === "object" && typeof value.shortcutItem === "function") {
          cachedShortcutItem = value.shortcutItem;
        }
        if (isGameService(value)) return value;
        if (!value || typeof value !== "object") continue;
        for (const sub of Object.keys(value)) {
          if (sub.startsWith("__")) continue;
          if (value[sub] && typeof value[sub] === "object" && typeof value[sub].shortcutItem === "function") {
            cachedShortcutItem = value[sub].shortcutItem;
          }
          if (isGameService(value[sub])) return value[sub];
        }
      }
    } catch (_e) {}
    return null;
  }

  function findGameService() {
    if (cachedGameService && isGameService(cachedGameService)) {
      return cachedGameService;
    }
    cachedGameService = null;

    const elements = document.querySelectorAll("#root, [data-map-placement], div, button, img");
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const fiberKey = Object.keys(el).find(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
      );
      if (!fiberKey) continue;
      let f = el[fiberKey];
      for (let depth = 0; depth < 50 && f; depth++) {
        const val = f.memoizedProps?.value;
        if (val && typeof val === "object" && typeof val.shortcutItem === "function") {
          cachedShortcutItem = val.shortcutItem;
        }
        const found = extractService(f.memoizedProps) || extractService(f.memoizedState);
        if (found) {
          cachedGameService = found;
          return cachedGameService;
        }
        f = f.return;
      }
    }
    return null;
  }

  function getGameState() {
    const svc = findGameService();
    if (svc) {
      try {
        const snap = svc.getSnapshot();
        const ctx = snap?.context || snap?.value?.context || {};
        const state = ctx.state || ctx.gameState || ctx;
        if (state) return state;
      } catch (_e) {}
    }
    return null;
  }

  // Trích xuất TOÀN BỘ dữ liệu game chi tiết
  function buildStatePayload() {
    const state = getGameState();
    if (!state) return null;

    const now = Date.now();

    // 1. Thông tin người dùng (User & Farm Profile)
    let season = "spring";
    if (state.season) {
      if (typeof state.season === "string") season = state.season;
      else if (typeof state.season?.season === "string") season = state.season.season;
    }

    const exp = toSafeNumber(state.bumpkin?.experience);
    // Tính level cơ bản của Bumpkin từ XP
    const level = Math.max(1, Math.floor(Math.sqrt(exp / 100)) + 1);

    const user = {
      farmId: state.id || state.farmId || "N/A",
      username: typeof state.username === "string" ? state.username : (state.bumpkin?.name || "Player"),
      coins: toSafeNumber(state.coins),
      gems: toSafeNumber(state.inventory?.Gem),
      balanceSFL: toSafeNumber(state.balance),
      season: String(season).toLowerCase().trim(),
      bumpkinLevel: level,
      bumpkinExp: exp,
      islandType: state.island?.type || "basic",
      islandExpansions: toSafeNumber(state.island?.expansions || state.inventory?.["Basic Land"] || 1),
      skills: state.bumpkin?.skills || {},
      equipped: state.bumpkin?.equipped || {},
      achievements: state.bumpkin?.achievements || {},
      dailyRewards: (() => {
        const todayUTC = new Date();
        todayUTC.setUTCHours(0, 0, 0, 0);
        const todayUTCMs = todayUTC.getTime();

        // Game lưu thời điểm nhận vào dailyRewards?.chest?.collectedAt
        const rawCollected =
          state.dailyRewards?.chest?.collectedAt ??
          state.dailyRewards?.collectedAt ??
          state.dailyRewards?.collectedDate;
        const collectedAt = toSafeNumber(rawCollected);
        const isCollectedToday = collectedAt > todayUTCMs;

        return {
          streaks: toSafeNumber(state.dailyRewards?.streaks),
          collectedAt: collectedAt,
          collectedAtText: collectedAt > 0 ? new Date(collectedAt).toLocaleTimeString("vi-VN") + " " + new Date(collectedAt).toLocaleDateString("vi-VN") : "Chưa có",
          isCollectedToday: isCollectedToday,
          isReady: !isCollectedToday,
        };
      })(),
      shipments: (() => {
        const todayUTC = new Date();
        todayUTC.setUTCHours(0, 0, 0, 0);
        const todayUTCMs = todayUTC.getTime();

        const restockedAt = toSafeNumber(state.shipments?.restockedAt);
        const isRestockedToday = restockedAt > todayUTCMs;

        return {
          restockedAt: restockedAt,
          restockedAtText: restockedAt > 0 ? new Date(restockedAt).toLocaleTimeString("vi-VN") + " " + new Date(restockedAt).toLocaleDateString("vi-VN") : "Chưa có",
          isRestockedToday: isRestockedToday,
          canRestock: !isRestockedToday,
        };
      })(),
    };

    // 2. Kho đồ toàn bộ (Full Inventory)
    const inventory = {};
    if (state.inventory && typeof state.inventory === "object") {
      for (const [k, v] of Object.entries(state.inventory)) {
        const val = toSafeNumber(v);
        if (val > 0) inventory[k] = val;
      }
    }

    // 3. Tài nguyên bản đồ: Cây gỗ (Trees)
    const trees = [];
    if (state.trees && typeof state.trees === "object") {
      for (const [id, t] of Object.entries(state.trees)) {
        const choppedAt = toSafeNumber(t?.wood?.choppedAt ?? t?.choppedAt);
        const recoveredAt = toSafeNumber(t?.wood?.recoveredAt ?? t?.recoveredAt);
        const isReady = choppedAt <= 0 || (recoveredAt > 0 && recoveredAt <= now);
        trees.push({ id, x: toSafeNumber(t?.x), y: toSafeNumber(t?.y), isReady, choppedAt });
      }
    }

    // 4. Tài nguyên khoáng sản (Rocks: Stones, Iron, Gold, Crimstone, Sunstone, Oil)
    function serializeRocks(rockMap) {
      const list = [];
      if (!rockMap || typeof rockMap !== "object") return list;
      for (const [id, r] of Object.entries(rockMap)) {
        const minedAt = toSafeNumber(r?.stone?.minedAt ?? r?.minedAt);
        const recoveredAt = toSafeNumber(r?.stone?.recoveredAt ?? r?.recoveredAt);
        const isReady = minedAt <= 0 || (recoveredAt > 0 && recoveredAt <= now);
        list.push({ id, x: toSafeNumber(r?.x ?? r?.coordinates?.x), y: toSafeNumber(r?.y ?? r?.coordinates?.y), isReady, minedAt });
      }
      return list;
    }

    const oilList = [];
    if (state.oilReserves && typeof state.oilReserves === "object") {
      for (const [id, o] of Object.entries(state.oilReserves)) {
        const drilledAt = toSafeNumber(o?.drilledAt);
        oilList.push({
          id,
          x: toSafeNumber(o?.x ?? o?.coordinates?.x),
          y: toSafeNumber(o?.y ?? o?.coordinates?.y),
          drilled: toSafeNumber(o?.drilled),
          drilledAt,
          isReady: drilledAt <= 0 || drilledAt <= now - 20 * 60 * 1000,
        });
      }
    }

    const minerals = {
      stones: serializeRocks(state.stones),
      iron: serializeRocks(state.iron),
      gold: serializeRocks(state.gold),
      crimstones: serializeRocks(state.crimstones),
      sunstones: serializeRocks(state.sunstones),
      oilReserves: oilList,
    };

    // 5. Đất ruộng & Cây trồng (Crops) với tọa độ x, y
    const crops = [];
    let emptyCropsCount = 0;
    let growingCropsCount = 0;
    let readyCropsCount = 0;

    if (state.crops && typeof state.crops === "object") {
      for (const [id, plot] of Object.entries(state.crops)) {
        const plantedAt = toSafeNumber(plot?.crop?.plantedAt ?? plot?.plantedAt);
        const readyAt = toSafeNumber(plot?.crop?.readyAt ?? plot?.readyAt);
        const cropName = String(plot?.crop?.name || plot?.cropName || "").trim();
        const isEmpty = !cropName && plantedAt <= 0;
        const isReady = !isEmpty && readyAt > 0 && readyAt <= now;

        if (isEmpty) emptyCropsCount++;
        else if (isReady) readyCropsCount++;
        else growingCropsCount++;

        crops.push({
          id,
          plotKey: String(id),
          x: toSafeNumber(plot?.x ?? plot?.coordinates?.x),
          y: toSafeNumber(plot?.y ?? plot?.coordinates?.y),
          cropName: cropName || "Empty",
          isEmpty,
          isReady,
          plantedAt,
          readyAt,
          fertiliser: plot?.fertiliser?.name || null,
        });
      }
    }

    // 6. Cây ăn quả (Fruit Patches) với tọa độ x, y
    const FRUIT_GROW_SECONDS = {
      "Tomato": 2 * 3600,
      "Lemon": 4 * 3600,
      "Blueberry": 6 * 3600,
      "Orange": 8 * 3600,
      "Apple": 12 * 3600,
      "Banana": 12 * 3600,
      "Celestine": 6 * 3600,
      "Lunara": 12 * 3600,
      "Duskberry": 24 * 3600,
    };

    const fruitPatches = [];
    if (state.fruitPatches && typeof state.fruitPatches === "object") {
      for (const [id, patch] of Object.entries(state.fruitPatches)) {
        const fruit = patch?.fruit;
        const fruitName = fruit?.name || "";
        const harvestsLeft = toSafeNumber(fruit?.harvestsLeft);
        const startedAt = toSafeNumber(fruit?.harvestedAt || fruit?.plantedAt);
        const growSecs = FRUIT_GROW_SECONDS[fruitName] || (12 * 3600);
        const readyAt = startedAt > 0 ? (startedAt + growSecs * 1000) : 0;
        const isReady = !!fruitName && harvestsLeft > 0 && readyAt > 0 && readyAt <= now;
        const isDead = !!fruitName && harvestsLeft <= 0;
        const isGrowing = !!fruitName && harvestsLeft > 0 && readyAt > now;

        fruitPatches.push({
          id: String(id),
          x: toSafeNumber(patch?.x ?? patch?.coordinates?.x),
          y: toSafeNumber(patch?.y ?? patch?.coordinates?.y),
          name: fruitName || "Empty",
          harvestsLeft,
          harvestedAt: toSafeNumber(fruit?.harvestedAt),
          plantedAt: toSafeNumber(fruit?.plantedAt),
          readyAt,
          isReady,
          isDead,
          isGrowing,
          isEmpty: !fruitName || !fruit?.plantedAt,
          fertiliser: patch?.fertiliser?.name || null,
        });
      }
    }

    // 7. Hoa & Mật ong (Flowers & Beehives) với tọa độ x, y
    const beehives = [];
    if (state.beehives && typeof state.beehives === "object") {
      for (const [id, hive] of Object.entries(state.beehives)) {
        const honey = toSafeNumber(hive?.honey?.produced);
        beehives.push({
          id,
          x: toSafeNumber(hive?.x ?? hive?.coordinates?.x),
          y: toSafeNumber(hive?.y ?? hive?.coordinates?.y),
          honeyProduced: honey,
          isReady: honey >= 24 || toSafeNumber(hive?.honey?.updatedAt) <= now - 24 * 60 * 1000,
          swarm: !!hive?.swarm,
        });
      }
    }

    const flowers = [];
    if (state.flowers && typeof state.flowers?.flowerBeds === "object") {
      for (const [id, bed] of Object.entries(state.flowers.flowerBeds)) {
        const flower = bed?.flower;
        flowers.push({
          id,
          x: toSafeNumber(bed?.x ?? bed?.coordinates?.x),
          y: toSafeNumber(bed?.y ?? bed?.coordinates?.y),
          name: flower?.name || "Empty",
          plantedAt: toSafeNumber(flower?.plantedAt),
          isReady: flower?.plantedAt ? (toSafeNumber(flower?.readyAt) <= now) : false,
        });
      }
    }

    // 8. Nấm (Mushrooms) với tọa độ x, y
    const mushrooms = [];
    if (state.mushrooms?.mushrooms && typeof state.mushrooms.mushrooms === "object") {
      for (const [id, m] of Object.entries(state.mushrooms.mushrooms)) {
        mushrooms.push({ id, name: m?.name || "Mushroom", x: toSafeNumber(m?.x), y: toSafeNumber(m?.y) });
      }
    }

    // 9. Công trình xây dựng & Tọa độ (Buildings with Coordinates)
    const buildings = {};
    if (state.buildings && typeof state.buildings === "object") {
      for (const [name, list] of Object.entries(state.buildings)) {
        const arr = Array.isArray(list) ? list : (typeof list === "object" ? Object.values(list) : [list]);
        buildings[name] = arr.map((b) => ({
          id: String(b?.id || ""),
          x: toSafeNumber(b?.coordinates?.x ?? b?.x),
          y: toSafeNumber(b?.coordinates?.y ?? b?.y),
          readyAt: toSafeNumber(b?.readyAt),
          createdAt: toSafeNumber(b?.createdAt),
        }));
      }
    }

    // 10. Vật phẩm trang trí & NFT Booster (Collectibles with Coordinates)
    const collectibles = {};
    if (state.collectibles && typeof state.collectibles === "object") {
      for (const [name, list] of Object.entries(state.collectibles)) {
        const arr = Array.isArray(list) ? list : (typeof list === "object" ? Object.values(list) : [list]);
        collectibles[name] = arr.map((c) => ({
          id: String(c?.id || ""),
          x: toSafeNumber(c?.coordinates?.x ?? c?.x),
          y: toSafeNumber(c?.coordinates?.y ?? c?.y),
          readyAt: toSafeNumber(c?.readyAt),
          createdAt: toSafeNumber(c?.createdAt),
        }));
      }
    }

    // 11. Đơn hàng giao nhận (Deliveries / Orders)
    const orders = [];
    if (Array.isArray(state.delivery?.orders)) {
      for (const ord of state.delivery.orders) {
        orders.push({
          id: ord.id,
          from: ord.from,
          items: ord.items,
          reward: ord.reward,
          completedAt: ord.completedAt || null,
        });
      }
    }

    // 12. Dữ liệu Thùng ủ phân (Composters)
    const SEASON_COMPOST_REQUIREMENTS = {
      "Compost Bin": {
        spring: { Rhubarb: 10, Carrot: 5 },
        summer: { Zucchini: 10, Pepper: 2 },
        autumn: { Yam: 15 },
        winter: { Potato: 10, Cabbage: 3 },
      },
      "Turbo Composter": {
        spring: { Soybean: 5, Corn: 3 },
        summer: { Cauliflower: 4, Eggplant: 3 },
        autumn: { Broccoli: 10, Artichoke: 2 },
        winter: { Onion: 5, Turnip: 2 },
      },
      "Premium Composter": {
        spring: { Blueberry: 8, Egg: 5 },
        summer: { Banana: 3, Egg: 5 },
        autumn: { Apple: 4, Tomato: 5 },
        winter: { Lemon: 3, Apple: 3 },
      },
    };

    const compostersList = [];
    const COMPOSTER_NAMES = ["Compost Bin", "Turbo Composter", "Premium Composter"];
    const curSeason = state.season?.season || "spring";

    for (const cName of COMPOSTER_NAMES) {
      const bList = state.buildings?.[cName];
      if (Array.isArray(bList) && bList.length > 0) {
        for (const b of bList) {
          if (!b) continue;
          const startedAt = toSafeNumber(b.producing?.startedAt);
          const readyAt = toSafeNumber(b.producing?.readyAt);
          const isReady = !!b.producing && readyAt > 0 && readyAt <= now;
          const isProducing = !!b.producing && readyAt > now;
          const isIdle = !b.producing || (!isReady && !isProducing);

          const reqs = SEASON_COMPOST_REQUIREMENTS[cName]?.[curSeason] || {};
          let hasRequirements = Object.keys(reqs).length > 0;
          for (const [item, reqQty] of Object.entries(reqs)) {
            const curQty = toSafeNumber(state.inventory?.[item]);
            if (curQty < reqQty) {
              hasRequirements = false;
              break;
            }
          }

          compostersList.push({
            id: String(b.id || ""),
            name: cName,
            x: toSafeNumber(b.coordinates?.x ?? b.x),
            y: toSafeNumber(b.coordinates?.y ?? b.y),
            isReady,
            isProducing,
            isIdle,
            readyAt,
            startedAt,
            hasRequirements,
            requires: reqs,
          });
        }
      }
    }

    return {
      timestamp: new Date().toLocaleTimeString(),
      user,
      inventory,
      resources: {
        trees: { total: trees.length, ready: trees.filter((t) => t.isReady).length, list: trees },
        minerals,
        crops: { total: crops.length, empty: emptyCropsCount, growing: growingCropsCount, ready: readyCropsCount, list: crops },
        fruitPatches: { total: fruitPatches.length, list: fruitPatches },
        beehives: { total: beehives.length, list: beehives },
        flowers: { total: flowers.length, list: flowers },
        mushrooms: { total: mushrooms.length, list: mushrooms },
      },
      buildings,
      collectibles,
      orders,
      composters: compostersList,
      farmActivity: state.farmActivity || {},
    };
  }

  // Chuẩn hóa cờ mục tiêu Captcha: Goblin / Moon Seeker / Zombie / Skeleton (Người xương)
  function _normalizeIsTarget(item) {
    if (!item || typeof item !== "object") return false;
    if (item.isGoblin === true || item.isMoonSeeker === true || item.isZombie === true || item.isSkeleton === true) return true;
    if (item.goblin === true || item.moonSeeker === true || item.zombie === true || item.skeleton === true) return true;
    const t = String(item.type || item.kind || item.role || item.name || "").toLowerCase();
    if (t === "goblin" || t.includes("moon") || t.includes("seeker") || t.includes("zomb") || t.includes("skele")) return true;
    if (typeof item.src === "string") {
      const s = item.src.toLowerCase();
      if (s.includes("skeleton") || s.includes("goblin") || s.includes("moonseeker") || s.includes("moon_seeker") || s.includes("zombie")) return true;
    }
    return false;
  }

  function _isCaptchaGridItem(first) {
    if (!first || typeof first !== "object") return false;
    if (typeof first.isGoblin === "boolean" || typeof first.isMoonSeeker === "boolean" || typeof first.isZombie === "boolean" || typeof first.isSkeleton === "boolean") return true;
    if (typeof first.goblin === "boolean" || typeof first.moonSeeker === "boolean" || typeof first.skeleton === "boolean" || typeof first.zombie === "boolean") return true;
    if (typeof first.src === "string" && (first.src.startsWith("data:image") || first.src.includes("crops") || first.src.includes("goblin") || first.src.includes("skeleton") || first.src.includes("npc") || first.src.includes("moonseeker"))) return true;
    return false;
  }

  function _mapCaptchaGridItems(st) {
    return st.map((item, idx) => ({
      index: idx,
      isGoblin: _normalizeIsTarget(item),
      src: typeof item.src === "string" ? item.src.slice(0, 120) : "",
    }));
  }

  function _findGrid16InFiber(f) {
    if (!f) return null;
    let hook = f.memoizedState;
    for (let hi = 0; hi < 80 && hook; hi += 1) {
      const st = hook.memoizedState;
      if (Array.isArray(st) && st.length === 16 && _isCaptchaGridItem(st[0])) {
        return _mapCaptchaGridItems(st);
      }
      if (st && typeof st === "object" && !Array.isArray(st)) {
        try {
          const keys = Object.keys(st);
          for (let ki = 0; ki < keys.length; ki += 1) {
            const val = st[keys[ki]];
            if (Array.isArray(val) && val.length === 16 && _isCaptchaGridItem(val[0])) {
              return _mapCaptchaGridItems(val);
            }
          }
        } catch (_e) {}
      }
      hook = hook.next;
    }
    return null;
  }

  function readCaptchaGridItems() {
    // 1. Quét tất cả các container chứa grid 16 ô trên toàn bộ trang (kể cả trong Headless UI Modal Portal)
    const allWraps = Array.from(
      document.querySelectorAll("div.flex.flex-wrap.justify-center.items-center, div.flex.flex-wrap.justify-center, div.flex.flex-wrap")
    );

    for (let wi = 0; wi < allWraps.length; wi += 1) {
      const wrap = allWraps[wi];
      if (!wrap) continue;

      const children = Array.from(wrap.children).filter(
        (el) => el && el.tagName === "DIV" && el.classList?.contains("cursor-pointer")
      );
      if (children.length !== 16) continue;
      const cells = children;

      // ── CHIẾN LƯỢC 1: Quét trực tiếp React Props & Fiber của từng ô cell và thẻ <img> bên trong ──
      const itemsDirect = [];
      let directTargetCount = 0;

      for (let i = 0; i < 16; i += 1) {
        const cell = cells[i];
        const img = cell.querySelector("img") || cell;

        let rawSrc = "";
        let isTarget = false;

        // A. Thử đọc từ React Props (thường chứa nguyên bản JSX props trước khi bị addNoise đổi thành data:image)
        const imgPropsKey = Object.keys(img).find((k) => k.startsWith("__reactProps") || k.startsWith("__reactEventHandlers"));
        if (imgPropsKey && img[imgPropsKey] && typeof img[imgPropsKey].src === "string") {
          rawSrc = img[imgPropsKey].src;
        }

        // B. Thử đọc từ React Fiber của thẻ <img>
        if (!rawSrc) {
          const imgFiberKey = Object.keys(img).find((k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
          if (imgFiberKey && img[imgFiberKey]) {
            const ifib = img[imgFiberKey];
            rawSrc = ifib.memoizedProps?.src || ifib.pendingProps?.src || "";
          }
        }

        // C. Thử đọc từ React Props/Fiber của ô cell chứa <img>
        if (!rawSrc) {
          const cellFiberKey = Object.keys(cell).find((k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
          if (cellFiberKey && cell[cellFiberKey]) {
            const cfib = cell[cellFiberKey];
            const ch = cfib.memoizedProps?.children || cfib.pendingProps?.children;
            if (ch && ch.props && typeof ch.props.src === "string") {
              rawSrc = ch.props.src;
            }
          }
        }

        // D. Fallback nếu thẻ <img> trên DOM chưa bị addNoise đổi thành base64
        if (!rawSrc || rawSrc.startsWith("data:")) {
          const domSrc = img.getAttribute("src") || img.currentSrc || "";
          if (domSrc && !domSrc.startsWith("data:")) {
            rawSrc = domSrc;
          }
        }

        const sLow = String(rawSrc).toLowerCase();
        if (
          sLow.includes("goblin") ||
          sLow.includes("moonseeker") ||
          sLow.includes("moon_seeker") ||
          sLow.includes("skeleton") ||
          sLow.includes("zombie")
        ) {
          isTarget = true;
          directTargetCount += 1;
        }

        itemsDirect.push({
          index: i,
          isGoblin: isTarget,
          src: sLow.slice(0, 120),
        });
      }

      // Sunflower Land Captcha luôn có đúng 3 mục tiêu (GOBLIN_COUNT = 3)
      if (directTargetCount >= 1 && directTargetCount <= 6) {
        console.log(`%c[SFL Bridge] 🎯 Đọc thành công ${directTargetCount} mục tiêu từ React Props/Fiber trực tiếp của 16 ô!`, "color: #00e676; font-weight: bold;");
        return itemsDirect;
      }

      // ── CHIẾN LƯỢC 2: Duyệt ngược cây React Fiber (f.return) để tìm State items của StopTheGoblins ──
      for (let ci2 = 0; ci2 < cells.length; ci2 += 1) {
        const cell = cells[ci2];
        const fiberKey = Object.keys(cell).find(
          (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
        );
        if (!fiberKey) continue;
        let f = cell[fiberKey];
        for (let depth = 0; depth < 100 && f; depth += 1) {
          const found = _findGrid16InFiber(f);
          if (found) {
            console.log("%c[SFL Bridge] 🎯 Tìm thấy 16 ô Captcha từ Hook State của StopTheGoblins!", "color: #00e676; font-weight: bold;");
            return found;
          }
          f = f.return;
        }
      }
    }

    // ── CHIẾN LƯỢC 3: Quét toàn bộ React Fiber từ tất cả các Dialog / Modal Portal ──
    const dialogs = document.querySelectorAll('[role="dialog"], div.fixed.inset-0, #root');
    for (let di = 0; di < dialogs.length; di += 1) {
      const dlg = dialogs[di];
      const dlgFiberKey = Object.keys(dlg).find(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
      );
      if (!dlgFiberKey) continue;

      const queue = [dlg[dlgFiberKey]];
      let steps = 0;
      const visited = new Set();
      while (queue.length && steps < 15000) {
        const f = queue.shift();
        steps += 1;
        if (!f || visited.has(f)) continue;
        visited.add(f);
        const found = _findGrid16InFiber(f);
        if (found) {
          console.log("%c[SFL Bridge] 🎯 Tìm thấy 16 ô Captcha qua BFS Portal Tree!", "color: #00e676; font-weight: bold;");
          return found;
        }
        let c = f.child;
        while (c) {
          queue.push(c);
          c = c.sibling;
        }
      }
    }

    return null;
  }

  // Tìm hàm shortcutItem từ React Fiber để chọn vật phẩm trực tiếp không cần mở kho
  let cachedShortcutItem = null;
  function findShortcutItemFn() {
    if (typeof cachedShortcutItem === "function") return cachedShortcutItem;
    findGameService();
    if (typeof cachedShortcutItem === "function") return cachedShortcutItem;

    // 2. Thử tìm trên Phaser Game Registry
    try {
      const phaserGame = window.Phaser?.GAMES?.[0] || document.querySelector("canvas")?.__phaserGame;
      const fn = phaserGame?.registry?.get?.("shortcutItem");
      if (typeof fn === "function") {
        cachedShortcutItem = fn;
        return cachedShortcutItem;
      }
    } catch (_e) {}

    // 3. Thử tìm từ các phần tử DOM trên trang bằng cách duyệt ngược f.return
    const elements = document.querySelectorAll('[data-map-placement], [role="button"], button, .cursor-pointer, #root');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
      if (!fiberKey) continue;
      let f = el[fiberKey];
      for (let depth = 0; depth < 50 && f; depth++) {
        const val = f.memoizedProps?.value || f.memoizedProps;
        if (val && typeof val === "object") {
          if (typeof val.shortcutItem === "function") {
            cachedShortcutItem = val.shortcutItem;
            return cachedShortcutItem;
          }
        }
        f = f.return;
      }
    }

    return null;
  }

  // Chọn vật phẩm trên thanh Hotbar ngoài màn hình nếu có
  function selectItemFromHotbar(itemName) {
    const slug = itemName.toLowerCase().replace(/\s+/g, "_");
    const baseCrop = itemName.toLowerCase().replace(/\s*seed\s*/i, "").trim();
    const imgs = document.querySelectorAll("img");
    for (const img of imgs) {
      if (img.closest('[role="dialog"], .scrollable, .overflow-y-auto')) continue;
      const src = (img.src || img.getAttribute("src") || "").toLowerCase();
      const alt = (img.alt || img.getAttribute("alt") || "").toLowerCase();
      const match =
        src.includes(slug) ||
        (src.includes(baseCrop) && src.includes("seed")) ||
        src.includes(`${baseCrop}_seed`) ||
        (alt.includes(baseCrop) && alt.includes("seed")) ||
        (slug.includes("sprout") && (src.includes("sprout_mix") || src.includes("fertiliser"))) ||
        (slug.includes("rapid") && src.includes("rapid_root"));

      if (match) {
        const btn = img.closest("button, [role='button'], div.cursor-pointer, [class*='cursor-pointer']") || img;
        try {
          btn.click();
          return true;
        } catch (_e) {}
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // TÍNH NĂNG CHẾ TẠO / MUA CÔNG CỤ QUA GAME SERVICE (XState Engine)
  // ═══════════════════════════════════════════════════════════════════
  const WORKBENCH_TOOL_SPECS = [
    {
      name: "Gold Pickaxe",
      basePrice: 100,
      ingredients: { Wood: 3, Gold: 3 },
      stockDefault: 5,
      skillName: "Frugal Miner",
      isPickaxe: true,
    },
    {
      name: "Iron Pickaxe",
      basePrice: 80,
      ingredients: { Wood: 3, Iron: 5 },
      stockDefault: 5,
      skillName: "Frugal Miner",
      isPickaxe: true,
    },
    {
      name: "Stone Pickaxe",
      basePrice: 20,
      ingredients: { Wood: 3, Stone: 5 },
      stockDefault: 20,
      skillName: "Frugal Miner",
      isPickaxe: true,
    },
    {
      name: "Pickaxe",
      basePrice: 20,
      ingredients: { Wood: 3 },
      stockDefault: 60,
      skillName: "Frugal Miner",
      isPickaxe: true,
    },
    {
      name: "Oil Drill",
      basePrice: 100,
      ingredients: { Wood: 20, Iron: 9, Leather: 10 },
      stockDefault: 5,
      requiredIsland: "desert",
    },
    {
      name: "Rod",
      basePrice: 20,
      ingredients: { Wood: 3, Stone: 1 },
      stockDefault: 50,
      skillName: "Reel Deal",
    },
    {
      name: "Axe",
      basePrice: 20,
      ingredients: {},
      stockDefault: 200,
      skillName: "Feller's Discount",
    },
  ];

  function calculateToolPrice(toolSpec, state) {
    let price = toolSpec.basePrice;
    const bumpkin = state?.bumpkin;
    const skills = bumpkin?.skills || {};

    if (toolSpec.name === "Axe") {
      const rank = toSafeNumber(skills["Feller's Discount"]);
      if (rank > 0) {
        const multipliers = [0.8, 0.6, 0.5];
        price = price * (multipliers[rank - 1] || 0.5);
      }
    } else if (toolSpec.isPickaxe) {
      const rank = toSafeNumber(skills["Frugal Miner"]);
      if (rank > 0) {
        const multipliers = [0.8, 0.6, 0.5];
        price = price * (multipliers[rank - 1] || 0.5);
      }
    } else if (toolSpec.name === "Rod") {
      const rank = toSafeNumber(skills["Reel Deal"]);
      if (rank > 0) {
        const multipliers = [0.5, 0.4, 0.3];
        price = price * (multipliers[rank - 1] || 0.3);
      }
    }

    if (toSafeNumber(state?.inventory?.["Artist"]) >= 1) {
      price = price * 0.9;
    }

    return Math.max(1, Math.round(price));
  }

  function getMaxCraftableAmount(toolSpec, state, currentCoins, currentInv) {
    const name = toolSpec.name;
    const unitPrice = calculateToolPrice(toolSpec, state);

    // Kiểm tra đảo yêu cầu
    if (toolSpec.requiredIsland) {
      const islandType = String(state?.island?.type || "").toLowerCase();
      if (!islandType.includes(toolSpec.requiredIsland) && !islandType.includes("volcano")) {
        return 0;
      }
    }

    // 1. Kiểm tra stock
    let stock = 0;
    if (state.stock && state.stock[name] !== undefined) {
      stock = toSafeNumber(state.stock[name]);
    } else {
      stock = toolSpec.stockDefault;
    }
    if (stock <= 0) return 0;

    // 2. Giới hạn bởi Coins
    const maxAffordable = Math.floor(currentCoins / unitPrice);
    if (maxAffordable <= 0) return 0;

    let maxAmount = Math.min(stock, maxAffordable);

    // 3. Giới hạn bởi nguyên liệu (Ingredients)
    for (const [ingName, ingReq] of Object.entries(toolSpec.ingredients)) {
      const available = toSafeNumber(currentInv[ingName]);
      const maxByIng = Math.floor(available / ingReq);
      maxAmount = Math.min(maxAmount, maxByIng);
      if (maxAmount <= 0) return 0;
    }

    return maxAmount;
  }

  function craftSingleToolViaService(toolName, amount = 1) {
    const svc = findGameService();
    if (!svc) return { ok: false, error: "no_service", message: "Game Service chưa sẵn sàng" };

    const state = getGameState();
    if (!state) return { ok: false, error: "no_state", message: "Không lấy được Game State" };

    const spec = WORKBENCH_TOOL_SPECS.find((t) => t.name.toLowerCase() === String(toolName).toLowerCase()) || {
      name: toolName,
      basePrice: 20,
      ingredients: {},
      stockDefault: 100,
    };

    const currentCoins = toSafeNumber(state.coins);
    const currentInv = {};
    if (state.inventory) {
      for (const [k, v] of Object.entries(state.inventory)) {
        currentInv[k] = toSafeNumber(v);
      }
    }

    const maxQty = getMaxCraftableAmount(spec, state, currentCoins, currentInv);
    const targetAmount = Math.min(amount, maxQty > 0 ? maxQty : amount);

    if (targetAmount <= 0) {
      return { ok: false, error: "not_enough_resources", message: "Không đủ coin hoặc nguyên liệu để chế tạo" };
    }

    try {
      svc.send({
        type: "tool.crafted",
        tool: spec.name,
        amount: targetAmount,
      });

      try { svc.send({ type: "SAVE" }); } catch (_e) {}

      return {
        ok: true,
        tool: spec.name,
        amount: targetAmount,
        cost: calculateToolPrice(spec, state) * targetAmount,
      };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  function batchBuyToolsViaService() {
    const svc = findGameService();
    if (!svc) return { ok: false, error: "no_service", message: "Game Service chưa sẵn sàng" };

    const state = getGameState();
    if (!state) return { ok: false, error: "no_state", message: "Không lấy được Game State" };

    let currentCoins = toSafeNumber(state.coins);
    const currentInv = {};
    if (state.inventory) {
      for (const [k, v] of Object.entries(state.inventory)) {
        currentInv[k] = toSafeNumber(v);
      }
    }

    const craftedList = [];
    let totalCoinsSpent = 0;

    for (const spec of WORKBENCH_TOOL_SPECS) {
      if (currentCoins <= 0) break;

      const qty = getMaxCraftableAmount(spec, state, currentCoins, currentInv);
      if (qty <= 0) continue;

      const unitPrice = calculateToolPrice(spec, state);
      const cost = unitPrice * qty;

      try {
        svc.send({
          type: "tool.crafted",
          tool: spec.name,
          amount: qty,
        });

        currentCoins -= cost;
        totalCoinsSpent += cost;
        for (const [ingName, ingReq] of Object.entries(spec.ingredients)) {
          currentInv[ingName] = Math.max(0, (currentInv[ingName] || 0) - ingReq * qty);
        }
        currentInv[spec.name] = (currentInv[spec.name] || 0) + qty;

        craftedList.push({
          tool: spec.name,
          amount: qty,
          unitPrice: unitPrice,
          totalCost: cost,
        });
      } catch (err) {
        console.warn(`[SFL Bridge] Bỏ qua ${spec.name} do lỗi:`, err?.message || err);
      }
    }

    if (craftedList.length > 0) {
      try { svc.send({ type: "SAVE" }); } catch (_e) {}
    }

    return {
      ok: true,
      crafted: craftedList,
      totalCoinsSpent: totalCoinsSpent,
      remainingCoins: currentCoins,
    };
  }

  // Lắng nghe yêu cầu từ Content Script
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data._sfl !== true) return;

    if (data.type === "SFL_READ_CAPTCHA_GRID") {
      const items = readCaptchaGridItems();
      window.postMessage({
        _sfl: true,
        type: "SFL_CAPTCHA_GRID_RESULT",
        reqId: data.reqId,
        items: items,
      }, "*");
      return;
    }

    if (data.type === "SFL_SELECT_ITEM") {
      const itemName = data.itemName || "Sprout Mix";
      let ok = false;

      // 1. Thử gọi qua shortcutItem của React Context
      try {
        const fn = findShortcutItemFn();
        if (typeof fn === "function") {
          fn(itemName);
          ok = true;
          console.log(`%c[SFL Bridge] ✔️ shortcutItem("${itemName}") thành công qua React Context!`, "color: #00e676; font-weight: bold;");
        }
      } catch (e) {
        console.warn("[SFL Bridge] shortcutItem lỗi:", e);
      }

      // 2. Thử click trực tiếp trên Hotbar DOM
      if (!ok) {
        ok = selectItemFromHotbar(itemName);
        if (ok) {
          console.log(`%c[SFL Bridge] ✔️ Đã click chọn "${itemName}" trên Hotbar DOM!`, "color: #00e676; font-weight: bold;");
        }
      }

      window.postMessage({
        _sfl: true,
        type: "SFL_SELECT_ITEM_RESULT",
        reqId: data.reqId,
        ok: ok,
        itemName: itemName,
      }, "*");
      return;
    }

    if (data.type === "SFL_BULK_FERTILISE") {
      const svc = findGameService();
      let ok = false;
      let count = 0;
      let error = null;

      if (svc) {
        try {
          const snap = svc.getSnapshot();
          const ctx = snap?.context || snap?.value?.context || {};
          const state = ctx.state || ctx.gameState || ctx;
          const fertName = data.fertiliser || "Sprout Mix";
          let availableFert = toSafeNumber(state?.inventory?.[fertName]);

          if (state && state.crops && availableFert > 0) {
            const plotIds = Object.keys(state.crops);
            for (const id of plotIds) {
              if (availableFert <= 0) break;
              const plot = state.crops[id];
              if (!plot) continue;
              if (plot.fertiliser) continue; // Đã bón phân rồi thì bỏ qua

              try {
                svc.send({
                  type: "plot.fertilised",
                  plotID: String(id),
                  fertiliser: fertName,
                });
                count++;
                availableFert--;
              } catch (_e) {}
            }

            if (count > 0) {
              ok = true;
              try { svc.send({ type: "SAVE" }); } catch (_e) {}
            }
          }
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }

      window.postMessage({
        _sfl: true,
        type: "SFL_BULK_FERTILISE_RESULT",
        reqId: data.reqId,
        ok: ok,
        count: count,
        error: error,
      }, "*");
      return;
    }

    if (data.type === "SFL_BULK_PLANT") {
      const svc = findGameService();
      let ok = false;
      let count = 0;
      let error = null;

      if (svc) {
        try {
          const snap = svc.getSnapshot();
          const ctx = snap?.context || snap?.value?.context || {};
          const state = ctx.state || ctx.gameState || ctx;
          const seedName = data.seedName;
          let availableSeeds = toSafeNumber(state?.inventory?.[seedName]);

          if (state && state.crops && availableSeeds > 0) {
            const plotIds = Object.keys(state.crops);
            for (const id of plotIds) {
              if (availableSeeds <= 0) break;
              const plot = state.crops[id];
              if (!plot) continue;
              if (plot.crop) continue; // Đã có cây đang lớn thì bỏ qua

              try {
                svc.send({
                  type: "seed.planted",
                  index: String(id),
                  item: seedName,
                  cropId: Math.random().toString(36).slice(2, 10),
                });
                count++;
                availableSeeds--;
              } catch (_e) {}
            }

            if (count > 0) {
              ok = true;
              try { svc.send({ type: "SAVE" }); } catch (_e) {}
            }
          }
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }

      window.postMessage({
        _sfl: true,
        type: "SFL_BULK_PLANT_RESULT",
        reqId: data.reqId,
        ok: ok,
        count: count,
        error: error,
      }, "*");
      return;
    }

    if (data.type === "SFL_CRAFT_TOOL") {
      const res = craftSingleToolViaService(data.toolName, data.amount || 1);
      window.postMessage({
        _sfl: true,
        type: "SFL_CRAFT_TOOL_RESULT",
        reqId: data.reqId,
        ...res,
      }, "*");
      return;
    }

    if (data.type === "SFL_BATCH_BUY_TOOLS") {
      const res = batchBuyToolsViaService();
      window.postMessage({
        _sfl: true,
        type: "SFL_BATCH_BUY_TOOLS_RESULT",
        reqId: data.reqId,
        ...res,
      }, "*");
      return;
    }

    if (data.type === "SFL_CLAIM_DAILY_REWARD") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      let alreadyClaimed = false;
      if (svc) {
        try {
          const state = svc.state?.context?.state;
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          const chestCollectedAt = toSafeNumber(state?.dailyRewards?.chest?.collectedAt ?? state?.dailyRewards?.collectedAt);

          if (chestCollectedAt > today.getTime()) {
            alreadyClaimed = true;
            ok = true;
          } else {
            svc.send("dailyReward.claimed");
            svc.send("CONTINUE");
            try { svc.send({ type: "SAVE" }); } catch (_e) {}
            ok = true;
          }
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }
      window.postMessage({
        _sfl: true,
        type: "SFL_CLAIM_DAILY_REWARD_RESULT",
        reqId: data.reqId,
        ok,
        alreadyClaimed,
        error,
      }, "*");
      return;
    }

    if (data.type === "SFL_RESTOCK_SHIPMENT") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      let alreadyRestocked = false;
      if (svc) {
        try {
          const state = svc.state?.context?.state;
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          const restockedAt = toSafeNumber(state?.shipments?.restockedAt);

          if (restockedAt > today.getTime()) {
            alreadyRestocked = true;
            ok = true;
          } else {
            svc.send("shipment.restocked");
            try { svc.send({ type: "SAVE" }); } catch (_e) {}
            ok = true;
          }
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }
      window.postMessage({
        _sfl: true,
        type: "SFL_RESTOCK_SHIPMENT_RESULT",
        reqId: data.reqId,
        ok,
        alreadyRestocked,
        error,
      }, "*");
      return;
    }

    if (data.type === "SFL_COLLECT_COMPOST") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      if (svc) {
        try {
          svc.send({
            type: "compost.collected",
            building: data.building,
            buildingId: data.buildingId,
          });
          try { svc.send({ type: "SAVE" }); } catch (_e) {}
          ok = true;
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }
      window.postMessage({
        _sfl: true,
        type: "SFL_COLLECT_COMPOST_RESULT",
        reqId: data.reqId,
        ok,
        error,
      }, "*");
      return;
    }

    if (data.type === "SFL_START_COMPOSTER") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      if (svc) {
        try {
          svc.send({
            type: "composter.started",
            building: data.building,
            buildingId: data.buildingId,
          });
          try { svc.send({ type: "SAVE" }); } catch (_e) {}
          ok = true;
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }
      window.postMessage({
        _sfl: true,
        type: "SFL_START_COMPOSTER_RESULT",
        reqId: data.reqId,
        ok,
        error,
      }, "*");
      return;
    }

    if (data.type === "SFL_BULK_FERTILISE") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      let applied = 0;
      if (svc) {
        const fertiliser = data.fertiliser || "Sprout Mix";
        try {
          // Thử plots.bulkFertilised (áp dụng cả đất trống và cây đang lớn)
          try {
            svc.send({
              type: "plots.bulkFertilised",
              fertiliser: fertiliser,
            });
            ok = true;
          } catch (_bulkErr) {
            // Fallback: Duyệt từng ô ruộng đủ điều kiện (đất trống hoặc cây đang lớn chưa có phân)
            const gState = svc.state?.context?.state;
            const crops = gState?.crops || {};
            const invCount = toSafeNumber(gState?.inventory?.[fertiliser]);
            let rem = invCount;
            for (const [pId, p] of Object.entries(crops)) {
              if (rem <= 0) break;
              if (p.fertiliser) continue;
              const isCropReady = p.crop && p.crop.readyAt && p.crop.readyAt <= Date.now();
              if (isCropReady) continue;
              svc.send({
                type: "plot.fertilised",
                plotId: pId,
                fertiliser: fertiliser,
              });
              applied++;
              rem--;
            }
            ok = applied > 0;
          }
          try { svc.send({ type: "SAVE" }); } catch (_e) {}
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }
      window.postMessage({
        _sfl: true,
        type: "SFL_BULK_FERTILISE_RESULT",
        reqId: data.reqId,
        ok,
        error,
        applied,
      }, "*");
      return;
    }

    if (data.type === "SFL_HARVEST_FRUIT") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      let harvestedCount = 0;
      if (svc) {
        try {
          const patches = svc.state?.context?.state?.fruitPatches || {};
          const patchIds = data.patchIds || (data.patchId !== undefined ? [data.patchId] : Object.keys(patches));
          for (const pId of patchIds) {
            try {
              svc.send({
                type: "fruit.harvested",
                index: String(pId),
              });
              harvestedCount++;
            } catch (_e) {}
          }
          if (harvestedCount > 0) {
            try { svc.send({ type: "SAVE" }); } catch (_e) {}
            ok = true;
          }
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }
      window.postMessage({
        _sfl: true,
        type: "SFL_HARVEST_FRUIT_RESULT",
        reqId: data.reqId,
        ok,
        error,
        harvestedCount,
      }, "*");
      return;
    }

    if (data.type === "SFL_REMOVE_DEAD_FRUIT_TREE") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      let removedCount = 0;
      if (svc) {
        try {
          const state = svc.state?.context?.state;
          const patches = state?.fruitPatches || {};
          const skills = state?.bumpkin?.skills || {};
          const collectibles = state?.collectibles || {};
          const hasForemanBeaver = !!(collectibles["Foreman Beaver"] && collectibles["Foreman Beaver"].length);
          const hasNoAxeNoWorries = !!skills["No Axe No Worries"];
          const freeAxes = hasForemanBeaver || hasNoAxeNoWorries;

          const axes = toSafeNumber(state?.inventory?.["Axe"]);
          let remAxes = freeAxes ? 9999 : axes;
          const patchIds = data.patchIds || (data.patchId !== undefined ? [data.patchId] : Object.keys(patches));
          for (const pId of patchIds) {
            if (remAxes <= 0) break;
            const p = patches[pId];
            // Cây ăn quả chết: có fruit nhưng harvestsLeft hết (bị xóa hoặc <= 0)
            const isDeadTree = p?.fruit && (!p.fruit.harvestsLeft || toSafeNumber(p.fruit.harvestsLeft) <= 0);
            if (isDeadTree) {
              try {
                svc.send({
                  type: "fruitTree.removed",
                  index: String(pId),
                  selectedItem: "Axe",
                });
                removedCount++;
                if (!freeAxes) remAxes--;
              } catch (_e) {}
            }
          }
          if (removedCount > 0) {
            try { svc.send({ type: "SAVE" }); } catch (_e) {}
            ok = true;
          }
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }
      window.postMessage({
        _sfl: true,
        type: "SFL_REMOVE_DEAD_FRUIT_TREE_RESULT",
        reqId: data.reqId,
        ok,
        error,
        removedCount,
      }, "*");
      return;
    }

    if (data.type === "SFL_PLANT_FRUIT") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      let plantedCount = 0;
      const plantedDetails = [];
      if (svc) {
        try {
          const state = svc.state?.context?.state;
          const patches = state?.fruitPatches || {};
          const inventory = state?.inventory || {};
          const season = (state?.season?.season || "spring").toLowerCase();

          const FRUIT_SEEDS_BY_SEASON = {
            spring: ["Tomato Seed", "Blueberry Seed", "Orange Seed"],
            summer: ["Lemon Seed", "Orange Seed", "Banana Plant"],
            autumn: ["Tomato Seed", "Apple Seed", "Banana Plant"],
            winter: ["Lemon Seed", "Blueberry Seed", "Apple Seed"],
          };
          const ALL_FRUIT_SEEDS = [
            "Apple Seed",
            "Banana Plant",
            "Orange Seed",
            "Blueberry Seed",
            "Lemon Seed",
            "Tomato Seed",
            "Celestine Seed",
            "Lunara Seed",
            "Duskberry Seed",
          ];

          const seasonalSeeds = FRUIT_SEEDS_BY_SEASON[season] || [];
          const candidateSeeds = [...seasonalSeeds, ...ALL_FRUIT_SEEDS.filter((s) => !seasonalSeeds.includes(s))];

          const invSim = {};
          for (const [k, v] of Object.entries(inventory)) {
            invSim[k] = toSafeNumber(v);
          }

          const patchIds = data.patchIds || Object.keys(patches);
          for (const pId of patchIds) {
            const p = patches[pId];
            if (!p) continue;
            // Chỉ trồng vào ô đất trống (không có fruit hoặc fruit.plantedAt rỗng)
            const isEmpty = !p.fruit || !p.fruit.plantedAt;
            if (!isEmpty) continue;

            let selectedSeed = data.seed;
            if (!selectedSeed || (invSim[selectedSeed] || 0) < 1) {
              selectedSeed = candidateSeeds.find((s) => (invSim[s] || 0) >= 1);
            }
            if (!selectedSeed) break;

            try {
              svc.send({
                type: "fruit.planted",
                index: String(pId),
                seed: selectedSeed,
              });
              plantedCount++;
              plantedDetails.push({ patchId: pId, seed: selectedSeed });
              invSim[selectedSeed] = Math.max(0, (invSim[selectedSeed] || 0) - 1);
            } catch (_e) {}
          }

          if (plantedCount > 0) {
            try { svc.send({ type: "SAVE" }); } catch (_e) {}
            ok = true;
          }
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }
      window.postMessage({
        _sfl: true,
        type: "SFL_PLANT_FRUIT_RESULT",
        reqId: data.reqId,
        ok,
        error,
        plantedCount,
        plantedDetails,
      }, "*");
      return;
    }

    if (data.type === "SFL_BUY_SEASONAL_SEEDS") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      const boughtList = [];
      let totalCoinsSpent = 0;
      let remainingCoins = 0;

      if (svc) {
        try {
          const state = svc.state?.context?.state;
          const coins = toSafeNumber(state?.coins);
          remainingCoins = coins;
          const stock = state?.stock || {};
          const inventory = state?.inventory || {};
          const season = (state?.season?.season || "spring").toLowerCase();
          const collectibles = state?.collectibles || {};

          // Danh mục tất cả hạt giống trong game kèm giá gốc, loại và điểm trồng
          const ALL_SEEDS_CATALOG = [
            // Crops
            { name: "Sunflower Seed", price: 0.01, category: "Crop", level: 1, spot: "Crop Plot" },
            { name: "Potato Seed", price: 0.1, category: "Crop", level: 1, spot: "Crop Plot" },
            { name: "Rhubarb Seed", price: 0.15, category: "Crop", level: 1, spot: "Crop Plot" },
            { name: "Pumpkin Seed", price: 0.2, category: "Crop", level: 2, spot: "Crop Plot" },
            { name: "Zucchini Seed", price: 0.2, category: "Crop", level: 2, spot: "Crop Plot" },
            { name: "Carrot Seed", price: 0.5, category: "Crop", level: 2, spot: "Crop Plot" },
            { name: "Yam Seed", price: 0.5, category: "Crop", level: 2, spot: "Crop Plot" },
            { name: "Cabbage Seed", price: 1, category: "Crop", level: 3, spot: "Crop Plot" },
            { name: "Broccoli Seed", price: 1, category: "Crop", level: 3, spot: "Crop Plot" },
            { name: "Soybean Seed", price: 1.5, category: "Crop", level: 3, spot: "Crop Plot" },
            { name: "Beetroot Seed", price: 2, category: "Crop", level: 3, spot: "Crop Plot" },
            { name: "Pepper Seed", price: 2, category: "Crop", level: 3, spot: "Crop Plot" },
            { name: "Cauliflower Seed", price: 3, category: "Crop", level: 4, spot: "Crop Plot" },
            { name: "Parsnip Seed", price: 5, category: "Crop", level: 4, spot: "Crop Plot" },
            { name: "Eggplant Seed", price: 6, category: "Crop", level: 5, spot: "Crop Plot" },
            { name: "Corn Seed", price: 7, category: "Crop", level: 5, spot: "Crop Plot" },
            { name: "Onion Seed", price: 7, category: "Crop", level: 5, spot: "Crop Plot" },
            { name: "Radish Seed", price: 7, category: "Crop", level: 5, spot: "Crop Plot" },
            { name: "Wheat Seed", price: 9, category: "Crop", level: 5, spot: "Crop Plot" },
            { name: "Turnip Seed", price: 9, category: "Crop", level: 5, spot: "Crop Plot" },
            { name: "Kale Seed", price: 10, category: "Crop", level: 6, spot: "Crop Plot" },
            { name: "Artichoke Seed", price: 12, category: "Crop", level: 6, spot: "Crop Plot" },
            { name: "Barley Seed", price: 15, category: "Crop", level: 6, spot: "Crop Plot" },

            // Fruits (Hoa quả)
            { name: "Tomato Seed", price: 5, category: "Fruit", level: 13, spot: "Fruit Patch" },
            { name: "Lemon Seed", price: 15, category: "Fruit", level: 12, spot: "Fruit Patch" },
            { name: "Blueberry Seed", price: 30, category: "Fruit", level: 13, spot: "Fruit Patch" },
            { name: "Orange Seed", price: 50, category: "Fruit", level: 14, spot: "Fruit Patch" },
            { name: "Apple Seed", price: 70, category: "Fruit", level: 15, spot: "Fruit Patch" },
            { name: "Banana Plant", price: 70, category: "Fruit", level: 16, spot: "Fruit Patch" },

            // Flowers (Hoa)
            { name: "Sunpetal Seed", price: 16, category: "Flower", level: 13, spot: "Flower Bed" },
            { name: "Bloom Seed", price: 32, category: "Flower", level: 22, spot: "Flower Bed" },
            { name: "Lily Seed", price: 48, category: "Flower", level: 27, spot: "Flower Bed" },
            { name: "Edelweiss Seed", price: 96, category: "Flower", level: 35, spot: "Flower Bed" },
            { name: "Gladiolus Seed", price: 96, category: "Flower", level: 35, spot: "Flower Bed" },
            { name: "Lavender Seed", price: 96, category: "Flower", level: 35, spot: "Flower Bed" },
            { name: "Clover Seed", price: 96, category: "Flower", level: 35, spot: "Flower Bed" },

            // Greenhouse
            { name: "Olive Seed", price: 160, category: "Greenhouse", level: 40, spot: "Greenhouse" },
            { name: "Rice Seed", price: 160, category: "Greenhouse", level: 40, spot: "Greenhouse" },
            { name: "Grape Seed", price: 320, category: "Greenhouse", level: 40, spot: "Greenhouse" },
          ];

          // Danh sách hạt giống được phép theo từng mùa vụ
          const SEASONAL_SEEDS_MAP = {
            spring: [
              "Sunflower Seed", "Rhubarb Seed", "Carrot Seed", "Cabbage Seed", "Soybean Seed", "Corn Seed", "Wheat Seed", "Kale Seed", "Barley Seed",
              "Tomato Seed", "Blueberry Seed", "Orange Seed",
              "Sunpetal Seed", "Bloom Seed", "Lily Seed", "Lavender Seed",
              "Rice Seed", "Olive Seed", "Grape Seed"
            ],
            summer: [
              "Sunflower Seed", "Potato Seed", "Zucchini Seed", "Pepper Seed", "Beetroot Seed", "Cauliflower Seed", "Eggplant Seed", "Radish Seed", "Wheat Seed",
              "Lemon Seed", "Orange Seed", "Banana Plant",
              "Sunpetal Seed", "Bloom Seed", "Lily Seed", "Gladiolus Seed",
              "Rice Seed", "Olive Seed", "Grape Seed"
            ],
            autumn: [
              "Potato Seed", "Pumpkin Seed", "Carrot Seed", "Yam Seed", "Broccoli Seed", "Soybean Seed", "Wheat Seed", "Barley Seed", "Artichoke Seed",
              "Tomato Seed", "Apple Seed", "Banana Plant",
              "Sunpetal Seed", "Bloom Seed", "Lily Seed", "Clover Seed",
              "Rice Seed", "Olive Seed", "Grape Seed"
            ],
            winter: [
              "Potato Seed", "Cabbage Seed", "Beetroot Seed", "Cauliflower Seed", "Parsnip Seed", "Onion Seed", "Turnip Seed", "Wheat Seed", "Kale Seed",
              "Lemon Seed", "Blueberry Seed", "Apple Seed",
              "Sunpetal Seed", "Bloom Seed", "Lily Seed", "Edelweiss Seed",
              "Rice Seed", "Olive Seed", "Grape Seed"
            ],
          };

          const allowedNames = SEASONAL_SEEDS_MAP[season] || SEASONAL_SEEDS_MAP.spring;
          // Lọc danh sách hạt giống đúng mùa và sắp xếp TỪ RẺ ĐẾN ĐẮT (price ASCENDING)
          const seasonalCandidates = ALL_SEEDS_CATALOG
            .filter((s) => allowedNames.includes(s.name))
            .sort((a, b) => a.price - b.price);

          const hasKuebiko = !!(collectibles["Kuebiko"] && collectibles["Kuebiko"].length);
          const hasHungryCaterpillar = !!(collectibles["Hungry Caterpillar"] && collectibles["Hungry Caterpillar"].length);

          for (const s of seasonalCandidates) {
            // 1. Kiểm tra stock trong cửa hàng
            const stockQty = toSafeNumber(stock[s.name]);
            if (stockQty <= 0) continue;

            // 2. Tính đơn giá sau chiết khấu/boosts
            let unitPrice = s.price;
            if (hasKuebiko) unitPrice = 0;
            if (s.category === "Flower" && hasHungryCaterpillar) unitPrice = 0;

            // 3. Tính số lượng tối đa có thể mua (dựa trên coins và stock)
            let maxBuy = stockQty;
            if (unitPrice > 0) {
              const affordable = Math.floor(remainingCoins / unitPrice);
              maxBuy = Math.min(maxBuy, affordable);
            }

            // 4. Giới hạn theo sức chứa kho đồ (tối đa 400 hạt giống)
            const currentInv = toSafeNumber(inventory[s.name]);
            const headroom = Math.max(0, 400 - currentInv);
            maxBuy = Math.min(maxBuy, headroom);

            if (maxBuy <= 0) continue;

            try {
              svc.send({
                type: "seed.bought",
                item: s.name,
                amount: maxBuy,
              });
              const cost = maxBuy * unitPrice;
              remainingCoins = Math.max(0, remainingCoins - cost);
              totalCoinsSpent += cost;
              boughtList.push({
                seed: s.name,
                category: s.category,
                amount: maxBuy,
                unitPrice: unitPrice,
                totalCost: cost,
              });
            } catch (_e) {}
          }

          if (boughtList.length > 0) {
            try { svc.send({ type: "SAVE" }); } catch (_e) {}
            ok = true;
          }
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }

      window.postMessage({
        _sfl: true,
        type: "SFL_BUY_SEASONAL_SEEDS_RESULT",
        reqId: data.reqId,
        ok,
        error,
        boughtList,
        totalCoinsSpent,
        remainingCoins,
      }, "*");
      return;
    }

    // DANH SÁCH TOÀN BỘ CÔNG THỨC MÓN ĂN & ĐIỂM EXP & NGUYÊN LIỆU GỐC
    const ALL_COOKABLE_RECIPES = [
      { name: "Pizza Margherita", building: "Fire Pit", experience: 25000, ingredients: { Tomato: 30, Cheese: 5, Wheat: 20 } },
      { name: "Antipasto", building: "Fire Pit", experience: 3000, ingredients: { Olive: 2, Grape: 2 } },
      { name: "Rice Bun", building: "Fire Pit", experience: 2600, ingredients: { Rice: 2, Wheat: 50 } },
      { name: "Kale Omelette", building: "Fire Pit", experience: 1250, ingredients: { Egg: 40, Kale: 5 } },
      { name: "Furikake Sprinkle", building: "Fire Pit", experience: 1000, ingredients: { "Fish Flake": 1, Seaweed: 1 } },
      { name: "Gumbo", building: "Fire Pit", experience: 600, ingredients: { Potato: 50, Pumpkin: 30, Carrot: 20, "Red Snapper": 3 } },
      { name: "Fried Tofu", building: "Fire Pit", experience: 400, ingredients: { Soybean: 15, Sunflower: 200 } },
      { name: "Kale Stew", building: "Fire Pit", experience: 400, ingredients: { Kale: 10 } },
      { name: "Cabbers n Mash", building: "Fire Pit", experience: 250, ingredients: { "Mashed Potato": 10, Cabbage: 20 } },
      { name: "Popcorn", building: "Fire Pit", experience: 200, ingredients: { Sunflower: 100, Corn: 5 } },
      { name: "Bumpkin Broth", building: "Fire Pit", experience: 96, ingredients: { Carrot: 10, Cabbage: 5 } },
      { name: "Boiled Eggs", building: "Fire Pit", experience: 90, ingredients: { Egg: 10 } },
      { name: "Mushroom Soup", building: "Fire Pit", experience: 56, ingredients: { "Wild Mushroom": 5 } },
      { name: "Reindeer Carrot", building: "Fire Pit", experience: 36, ingredients: { Carrot: 5 } },
      { name: "Pumpkin Soup", building: "Fire Pit", experience: 24, ingredients: { Pumpkin: 10 } },
      { name: "Rhubarb Tart", building: "Fire Pit", experience: 5, ingredients: { Rhubarb: 3 } },
      { name: "Mashed Potato", building: "Fire Pit", experience: 3, ingredients: { Potato: 8 } },

      { name: "Crimstone Infused Fish Oil", building: "Kitchen", experience: 18000, ingredients: { "Fish Oil": 1, Crimstone: 1 } },
      { name: "Spaghetti al Limone", building: "Kitchen", experience: 15000, ingredients: { Wheat: 10, Lemon: 15, Cheese: 3 } },
      { name: "Creamy Crab Bite", building: "Kitchen", experience: 10000, ingredients: { "Crab Stick": 1, Cheese: 3 } },
      { name: "Caprese Salad", building: "Kitchen", experience: 6000, ingredients: { Cheese: 1, Tomato: 25, Kale: 20 } },
      { name: "Steamed Red Rice", building: "Kitchen", experience: 3000, ingredients: { Rice: 3, Beetroot: 50 } },
      { name: "Surimi Rice Bowl", building: "Kitchen", experience: 3000, ingredients: { "Fish Stick": 1, Rice: 1, Onion: 1 } },
      { name: "Bumpkin Roast", building: "Kitchen", experience: 2500, ingredients: { "Mashed Potato": 20, "Roast Veggies": 5 } },
      { name: "Goblin Brunch", building: "Kitchen", experience: 2500, ingredients: { "Boiled Eggs": 5, "Goblin's Treat": 1 } },
      { name: "Seafood Basket", building: "Kitchen", experience: 2200, ingredients: { Blowfish: 2, Napoleanfish: 2, Sunfish: 2 } },
      { name: "Beetroot Blaze", building: "Kitchen", experience: 2000, ingredients: { "Magic Mushroom": 2, Beetroot: 50 } },
      { name: "Fish n Chips", building: "Kitchen", experience: 2000, ingredients: { "Fancy Fries": 1, Halibut: 1 } },
      { name: "Sushi Roll", building: "Kitchen", experience: 2000, ingredients: { Angelfish: 1, Seaweed: 1, Rice: 2 } },
      { name: "Ocean's Olive", building: "Kitchen", experience: 2000, ingredients: { "Olive Flounder": 1, Olive: 2 } },
      { name: "Fish Omelette", building: "Kitchen", experience: 1500, ingredients: { Egg: 40, Surgeonfish: 1, Butterflyfish: 2 } },
      { name: "Fried Calamari", building: "Kitchen", experience: 1500, ingredients: { Sunflower: 200, Wheat: 15, Squid: 1 } },
      { name: "Fish Burger", building: "Kitchen", experience: 1300, ingredients: { Beetroot: 10, Wheat: 10, "Horse Mackerel": 1 } },
      { name: "Pancakes", building: "Kitchen", experience: 1000, ingredients: { Wheat: 10, Egg: 10, Honey: 6 } },
      { name: "Bumpkin ganoush", building: "Kitchen", experience: 1000, ingredients: { Eggplant: 30, Potato: 50, Parsnip: 10 } },
      { name: "Chowder", building: "Kitchen", experience: 1000, ingredients: { Beetroot: 10, Wheat: 10, Parsnip: 5, Anchovy: 3 } },
      { name: "Tofu Scramble", building: "Kitchen", experience: 1000, ingredients: { Soybean: 20, Egg: 20, Cauliflower: 10 } },
      { name: "Goblin's Treat", building: "Kitchen", experience: 500, ingredients: { Pumpkin: 10, Radish: 20, Cabbage: 10 } },
      { name: "Bumpkin Salad", building: "Kitchen", experience: 290, ingredients: { Beetroot: 20, Parsnip: 10 } },
      { name: "Cauliflower Burger", building: "Kitchen", experience: 255, ingredients: { Cauliflower: 15, Wheat: 5 } },
      { name: "Mushroom Jacket Potatoes", building: "Kitchen", experience: 240, ingredients: { "Wild Mushroom": 10, Potato: 5 } },
      { name: "Fruit Salad", building: "Kitchen", experience: 225, ingredients: { Apple: 1, Orange: 1, Blueberry: 1 } },
      { name: "Club Sandwich", building: "Kitchen", experience: 170, ingredients: { Sunflower: 100, Carrot: 25, Wheat: 5 } },
      { name: "Roast Veggies", building: "Kitchen", experience: 170, ingredients: { Cauliflower: 15, Carrot: 10 } },
      { name: "Sunflower Crunch", building: "Kitchen", experience: 50, ingredients: { Sunflower: 300 } },

      { name: "Lemon Cheesecake", building: "Bakery", experience: 30000, ingredients: { Lemon: 20, Cheese: 5, Egg: 40 } },
      { name: "Honey Cake", building: "Bakery", experience: 4000, ingredients: { Honey: 10, Wheat: 10, Egg: 20 } },
      { name: "Eggplant Cake", building: "Bakery", experience: 1400, ingredients: { Eggplant: 30, Wheat: 10, Egg: 30 } },
      { name: "Parsnip Cake", building: "Bakery", experience: 1300, ingredients: { Parsnip: 45, Wheat: 10, Egg: 30 } },
      { name: "Beetroot Cake", building: "Bakery", experience: 1250, ingredients: { Beetroot: 100, Wheat: 10, Egg: 30 } },
      { name: "Radish Cake", building: "Bakery", experience: 1200, ingredients: { Radish: 25, Wheat: 10, Egg: 30 } },
      { name: "Cauliflower Cake", building: "Bakery", experience: 1190, ingredients: { Cauliflower: 60, Wheat: 10, Egg: 30 } },
      { name: "Wheat Cake", building: "Bakery", experience: 1100, ingredients: { Wheat: 35, Egg: 30 } },
      { name: "Cabbage Cake", building: "Bakery", experience: 860, ingredients: { Cabbage: 90, Wheat: 10, Egg: 30 } },
      { name: "Carrot Cake", building: "Bakery", experience: 750, ingredients: { Carrot: 120, Wheat: 10, Egg: 30 } },
      { name: "Orange Cake", building: "Bakery", experience: 730, ingredients: { Orange: 5, Egg: 30, Wheat: 10 } },
      { name: "Apple Pie", building: "Bakery", experience: 720, ingredients: { Apple: 5, Wheat: 10, Egg: 20 } },
      { name: "Kale & Mushroom Pie", building: "Bakery", experience: 720, ingredients: { "Wild Mushroom": 10, Kale: 5, Wheat: 5 } },
      { name: "Potato Cake", building: "Bakery", experience: 650, ingredients: { Potato: 500, Wheat: 10, Egg: 30 } },
      { name: "Pumpkin Cake", building: "Bakery", experience: 625, ingredients: { Pumpkin: 130, Wheat: 10, Egg: 30 } },
      { name: "Cornbread", building: "Bakery", experience: 600, ingredients: { Corn: 15, Wheat: 5, Egg: 10 } },
      { name: "Sunflower Cake", building: "Bakery", experience: 525, ingredients: { Sunflower: 1000, Wheat: 10, Egg: 30 } },

      { name: "Honey Cheddar", building: "Deli", experience: 15000, ingredients: { Cheese: 3, Honey: 5 } },
      { name: "Blue Cheese", building: "Deli", experience: 6000, ingredients: { Cheese: 2, Blueberry: 10 } },
      { name: "Fermented Fish", building: "Deli", experience: 3000, ingredients: { Tuna: 6 } },
      { name: "Fancy Fries", building: "Deli", experience: 1000, ingredients: { Sunflower: 500, Potato: 500 } },
      { name: "Blueberry Jam", building: "Deli", experience: 500, ingredients: { Blueberry: 5 } },
      { name: "Sauerkraut", building: "Deli", experience: 500, ingredients: { Cabbage: 20 } },
      { name: "Fermented Carrots", building: "Deli", experience: 250, ingredients: { Carrot: 20 } },

      { name: "Slow Juice", building: "Smoothie Shack", experience: 7500, ingredients: { Grape: 10, Kale: 100 } },
      { name: "Grape Juice", building: "Smoothie Shack", experience: 3300, ingredients: { Grape: 5, Radish: 20 } },
      { name: "The Lot", building: "Smoothie Shack", experience: 1500, ingredients: { Blueberry: 1, Orange: 1, Grape: 1, Apple: 1, Banana: 1 } },
      { name: "Banana Blast", building: "Smoothie Shack", experience: 1200, ingredients: { Banana: 10, Egg: 10 } },
      { name: "Sour Shake", building: "Smoothie Shack", experience: 1000, ingredients: { Lemon: 20 } },
      { name: "Bumpkin Detox", building: "Smoothie Shack", experience: 975, ingredients: { Apple: 5, Orange: 5, Carrot: 10 } },
      { name: "Power Smoothie", building: "Smoothie Shack", experience: 775, ingredients: { Blueberry: 10, Kale: 5 } },
      { name: "Apple Juice", building: "Smoothie Shack", experience: 500, ingredients: { Apple: 5 } },
      { name: "Orange Juice", building: "Smoothie Shack", experience: 375, ingredients: { Orange: 5 } },
      { name: "Purple Smoothie", building: "Smoothie Shack", experience: 310, ingredients: { Blueberry: 5, Cabbage: 10 } },
      { name: "Carrot Juice", building: "Smoothie Shack", experience: 200, ingredients: { Carrot: 30 } },
      { name: "Quick Juice", building: "Smoothie Shack", experience: 100, ingredients: { Sunflower: 50, Pumpkin: 40 } },
    ];

    // Thu hoạch tất cả món ăn đã nấu chín
    if (data.type === "SFL_COLLECT_RECIPES") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      let collectedCount = 0;
      if (svc) {
        try {
          const now = Date.now();
          const state = svc.state?.context?.state;
          const buildings = state?.buildings || {};
          const cookingBuildings = ["Fire Pit", "Kitchen", "Bakery", "Deli", "Smoothie Shack"];
          for (const bName of cookingBuildings) {
            const list = buildings[bName];
            if (!Array.isArray(list)) continue;
            for (const b of list) {
              const crafting = b.crafting || [];
              const hasReady = crafting.some((item) => toSafeNumber(item.readyAt) <= now);
              if (hasReady) {
                try {
                  svc.send({
                    type: "recipes.collected",
                    building: bName,
                    buildingId: String(b.id),
                  });
                  collectedCount++;
                } catch (_e) {}
              }
            }
          }
          if (collectedCount > 0) {
            try { svc.send({ type: "SAVE" }); } catch (_e) {}
            ok = true;
          }
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }
      window.postMessage({
        _sfl: true,
        type: "SFL_COLLECT_RECIPES_RESULT",
        reqId: data.reqId,
        ok,
        error,
        collectedCount,
      }, "*");
      return;
    }

    // Nấu món ăn ưu tiên điểm kinh nghiệm (XP) cao nhất, tự động tính hệ số x2/x3/x4 nếu có skill "Double Nom"
    if (data.type === "SFL_COOK_BEST_RECIPES") {
      const svc = findGameService();
      let ok = false;
      let error = null;
      const cookedList = [];
      if (svc) {
        try {
          const now = Date.now();
          const state = svc.state?.context?.state;
          const bumpkin = state?.bumpkin;
          const skills = bumpkin?.skills || {};
          const buildings = state?.buildings || {};
          const inventory = state?.inventory || {};

          // Kiểm tra skill "Double Nom": 1: x2, 2: x3, 3: x4
          let doubleNomLevel = 0;
          if (typeof skills["Double Nom"] === "number") {
            doubleNomLevel = skills["Double Nom"];
          } else if (skills["Double Nom"] === true) {
            doubleNomLevel = 1;
          }
          const ingMultiplier = doubleNomLevel === 1 ? 2 : (doubleNomLevel === 2 ? 3 : (doubleNomLevel === 3 ? 4 : 1));

          // Mô phỏng kho đồ để trừ dần khi nấu nhiều bếp cùng lúc
          const invSim = {};
          for (const [k, v] of Object.entries(inventory)) {
            invSim[k] = toSafeNumber(v);
          }

          const cookingBuildings = ["Fire Pit", "Kitchen", "Bakery", "Deli", "Smoothie Shack"];
          for (const bName of cookingBuildings) {
            const list = buildings[bName];
            if (!Array.isArray(list)) continue;

            for (const b of list) {
              if (b.readyAt && b.readyAt > now) continue;

              const crafting = b.crafting || [];
              // Nếu đang có món đang nấu dở -> bỏ qua bếp này
              if (crafting.some((item) => toSafeNumber(item.readyAt) > now)) continue;

              const recipesForBuilding = ALL_COOKABLE_RECIPES.filter((r) => r.building === bName);

              // Tìm các món đủ nguyên liệu thực tế sau khi đã áp dụng hệ số nhân Double Nom
              const eligible = [];
              for (const r of recipesForBuilding) {
                let enough = true;
                const reqs = {};
                for (const [ingName, baseQty] of Object.entries(r.ingredients)) {
                  const needed = baseQty * ingMultiplier;
                  reqs[ingName] = needed;
                  if ((invSim[ingName] || 0) < needed) {
                    enough = false;
                    break;
                  }
                }
                if (enough) {
                  eligible.push({ ...r, reqs });
                }
              }

              if (eligible.length === 0) continue;

              // ƯU TIÊN MÓN ĂN CÓ KINH NGHIỆM (EXPERIENCE) CAO NHẤT
              eligible.sort((a, b) => b.experience - a.experience);
              const bestRecipe = eligible[0];

              try {
                svc.send({
                  type: "recipe.cooked",
                  item: bestRecipe.name,
                  buildingId: String(b.id),
                });
                cookedList.push({
                  building: bName,
                  recipe: bestRecipe.name,
                  experience: bestRecipe.experience,
                  multiplier: ingMultiplier,
                });
                for (const [ingName, needed] of Object.entries(bestRecipe.reqs)) {
                  invSim[ingName] = Math.max(0, (invSim[ingName] || 0) - needed);
                }
              } catch (_e) {}
            }
          }

          if (cookedList.length > 0) {
            try { svc.send({ type: "SAVE" }); } catch (_e) {}
            ok = true;
          }
        } catch (e) {
          error = e?.message || String(e);
        }
      } else {
        error = "no_service";
      }
      window.postMessage({
        _sfl: true,
        type: "SFL_COOK_BEST_RECIPES_RESULT",
        reqId: data.reqId,
        ok,
        error,
        cookedList,
      }, "*");
      return;
    }

    if (data.type === "SFL_GET_STATE") {
      const statePayload = buildStatePayload();
      window.postMessage({
        _sfl: true,
        type: "SFL_STATE",
        reqId: data.reqId,
        data: statePayload,
        error: statePayload ? null : "no_service",
      }, "*");
      return;
    }
  });

  // Thông báo Bridge đã sẵn sàng
  window.postMessage({ _sfl: true, type: "SFL_BRIDGE_READY" }, "*");
})();
