(function (S) {
  "use strict";
  /**
   * Luồng nấu ăn — chỉ page bridge. Một tiến trình: thu món chín + bắt đầu nấu;
   * thời gian chờ = readyAt từ game → nextCookFlowAt hẹn đúng lúc đó (không quét mỗi tick).
   */
  const runtime = S.runtime;
  const logFlow = S.time.logFlow;

  const COOK_IDLE_PROBE_MS = 45 * 1000;
  const COOK_NO_BUILDING_MS = 90 * 1000;
  const COOK_COLLECT_SOON_MS = 900;
  const COOK_AFTER_READY_MS = 700;

  const FIRE_PIT_RECIPES = [
    { item: "Furikake Sprinkle", xp: 1000, ingredients: { "Fish Flake": 1, Seaweed: 1 } },
    { item: "Pizza Margherita", xp: 25000, ingredients: { Tomato: 30, Cheese: 5, Wheat: 20 } },
    { item: "Antipasto", xp: 3000, ingredients: { Olive: 2, Grape: 2 } },
    { item: "Rice Bun", xp: 2600, ingredients: { Rice: 2, Wheat: 50 } },
    { item: "Kale Omelette", xp: 1250, ingredients: { Egg: 40, Kale: 5 } },
    { item: "Gumbo", xp: 600, ingredients: { Potato: 50, Pumpkin: 30, Carrot: 20, "Red Snapper": 3 } },
    { item: "Kale Stew", xp: 400, ingredients: { Kale: 10 } },
    { item: "Fried Tofu", xp: 400, ingredients: { Soybean: 15, Sunflower: 200 } },
    { item: "Rapid Roast", xp: 300, ingredients: { "Magic Mushroom": 1, Pumpkin: 40 } },
    { item: "Cabbers n Mash", xp: 250, ingredients: { "Mashed Potato": 10, Cabbage: 20 } },
    { item: "Popcorn", xp: 200, ingredients: { Corn: 5, Sunflower: 100 } },
    { item: "Bumpkin Broth", xp: 96, ingredients: { Carrot: 10, Cabbage: 5 } },
    { item: "Boiled Eggs", xp: 90, ingredients: { Egg: 10 } },
    { item: "Mushroom Soup", xp: 56, ingredients: { "Wild Mushroom": 5 } },
    { item: "Reindeer Carrot", xp: 36, ingredients: { Carrot: 5 } },
    { item: "Pumpkin Soup", xp: 24, ingredients: { Pumpkin: 10 } },
    { item: "Rhubarb Tart", xp: 5, ingredients: { Rhubarb: 3 } },
    { item: "Mashed Potato", xp: 3, ingredients: { Potato: 8 } },
  ];

  const KITCHEN_RECIPES = [
    { item: "Crimstone Infused Fish Oil", xp: 18000, ingredients: { "Fish Oil": 1, Crimstone: 1 } },
    { item: "Spaghetti al Limone", xp: 15000, ingredients: { Wheat: 10, Lemon: 15, Cheese: 3 } },
    { item: "Creamy Crab Bite", xp: 10000, ingredients: { "Crab Stick": 1, Cheese: 3 } },
    { item: "Caprese Salad", xp: 6000, ingredients: { Cheese: 1, Tomato: 25, Kale: 20 } },
    { item: "Steamed Red Rice", xp: 3000, ingredients: { Rice: 3, Beetroot: 50 } },
    { item: "Surimi Rice Bowl", xp: 3000, ingredients: { "Fish Stick": 1, Rice: 1, Onion: 1 } },
    { item: "Bumpkin Roast", xp: 2500, ingredients: { "Mashed Potato": 20, "Roast Veggies": 5 } },
    { item: "Goblin Brunch", xp: 2500, ingredients: { "Boiled Eggs": 5, "Goblin's Treat": 1 } },
    { item: "Seafood Basket", xp: 2200, ingredients: { Blowfish: 2, Napoleanfish: 2, Sunfish: 2 } },
    { item: "Beetroot Blaze", xp: 2000, ingredients: { "Magic Mushroom": 2, Beetroot: 50 } },
    { item: "Ocean's Olive", xp: 2000, ingredients: { "Olive Flounder": 1, Olive: 2 } },
    { item: "Fish n Chips", xp: 2000, ingredients: { "Fancy Fries": 1, Halibut: 1 } },
    { item: "Fried Calamari", xp: 1500, ingredients: { Sunflower: 200, Wheat: 15, Squid: 1 } },
    { item: "Fish Omelette", xp: 1500, ingredients: { Egg: 40, Surgeonfish: 1, Butterflyfish: 2 } },
    { item: "Fish Burger", xp: 1300, ingredients: { Beetroot: 10, Wheat: 10, "Horse Mackerel": 1 } },
    { item: "Pancakes", xp: 1000, ingredients: { Wheat: 10, Egg: 10, Honey: 6 } },
    { item: "Bumpkin ganoush", xp: 1000, ingredients: { Eggplant: 30, Potato: 50, Parsnip: 10 } },
    { item: "Chowder", xp: 1000, ingredients: { Beetroot: 10, Wheat: 10, Parsnip: 5, Anchovy: 3 } },
    { item: "Tofu Scramble", xp: 1000, ingredients: { Soybean: 20, Egg: 20, Cauliflower: 10 } },
    { item: "Goblin's Treat", xp: 500, ingredients: { Pumpkin: 10, Radish: 20, Cabbage: 10 } },
    { item: "Bumpkin Salad", xp: 290, ingredients: { Beetroot: 20, Parsnip: 10 } },
    { item: "Cauliflower Burger", xp: 255, ingredients: { Cauliflower: 15, Wheat: 5 } },
    { item: "Mushroom Jacket Potatoes", xp: 240, ingredients: { "Wild Mushroom": 10, Potato: 5 } },
    { item: "Fruit Salad", xp: 225, ingredients: { Apple: 1, Orange: 1, Blueberry: 1 } },
    { item: "Roast Veggies", xp: 170, ingredients: { Cauliflower: 15, Carrot: 10 } },
    { item: "Club Sandwich", xp: 170, ingredients: { Sunflower: 100, Carrot: 25, Wheat: 5 } },
    { item: "Sunflower Crunch", xp: 50, ingredients: { Sunflower: 300 } },
    { item: "Sushi Roll", xp: 2000, ingredients: { Angelfish: 1, Seaweed: 1, Rice: 2 } },
  ];

  const BAKERY_RECIPES = [
    { item: "Eggplant Cake", xp: 42000, ingredients: { Eggplant: 30, Wheat: 15 } },
    { item: "Radish Cake", xp: 38500, ingredients: { Radish: 25, Wheat: 15 } },
    { item: "Parsnip Cake", xp: 35000, ingredients: { Parsnip: 40, Wheat: 15 } },
    { item: "Cauliflower Cake", xp: 31500, ingredients: { Cauliflower: 60, Wheat: 15 } },
    { item: "Beetroot Cake", xp: 28000, ingredients: { Beetroot: 100, Wheat: 15 } },
    { item: "Cabbage Cake", xp: 24500, ingredients: { Cabbage: 200, Wheat: 15 } },
    { item: "Carrot Cake", xp: 21000, ingredients: { Carrot: 300, Wheat: 15 } },
    { item: "Orange Cake", xp: 18000, ingredients: { Orange: 10, Wheat: 10 } },
    { item: "Potato Cake", xp: 17500, ingredients: { Potato: 500, Wheat: 15 } },
    { item: "Corn Bread", xp: 15000, ingredients: { Corn: 15, Wheat: 20 } },
    { item: "Blueberry Tart", xp: 15000, ingredients: { Blueberry: 10, Wheat: 10 } },
    { item: "Sunflower Cake", xp: 14000, ingredients: { Sunflower: 1000, Wheat: 15 } },
    { item: "Apple Pie", xp: 12000, ingredients: { Apple: 10, Wheat: 10 } },
    { item: "Pumpkin Cake", xp: 10500, ingredients: { Pumpkin: 130, Wheat: 15 } },
    { item: "Wheat Cake", xp: 7000, ingredients: { Wheat: 35 } },
  ];

  const DELI_RECIPES = [
    { item: "Fermented Fish", xp: 15000, ingredients: { Anchovy: 5, Olive: 10 } },
    { item: "Garlic Bread", xp: 12000, ingredients: { Garlic: 10, Wheat: 20 } },
    { item: "Cheese", xp: 12000, ingredients: { Milk: 3 } },
    { item: "Kimchi", xp: 8000, ingredients: { Radish: 30, Cabbage: 30 } },
    { item: "Butter", xp: 6000, ingredients: { Milk: 1 } },
    { item: "Sauerkraut", xp: 5000, ingredients: { Cabbage: 50 } },
    { item: "Fermented Carrots", xp: 2500, ingredients: { Carrot: 50 } },
  ];

  const SMOOTHIE_SHACK_RECIPES = [
    { item: "Power Smoothie", xp: 12000, ingredients: { Kale: 20, Apple: 5, Blueberry: 5 } },
    { item: "Banana Blast", xp: 6000, ingredients: { Banana: 5 } },
    { item: "Blueberry Shake", xp: 4500, ingredients: { Blueberry: 5 } },
    { item: "Orange Juice", xp: 3500, ingredients: { Orange: 5 } },
    { item: "Apple Juice", xp: 2500, ingredients: { Apple: 5 } },
    { item: "Sunflower Smoothie", xp: 800, ingredients: { Sunflower: 100 } },
  ];

  const cookLogAt = new Map();

  function nowMs() {
    return Date.now();
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const p = Number(String(value).replace(/,/g, "").trim());
      return Number.isFinite(p) ? p : 0;
    }
    if (typeof value === "object") {
      if (typeof value.toNumber === "function") {
        const p = Number(value.toNumber());
        return Number.isFinite(p) ? p : 0;
      }
      if (typeof value.toString === "function") {
        const p = Number(String(value));
        return Number.isFinite(p) ? p : 0;
      }
    }
    return 0;
  }

  function logCookThrottled(key, minMs, message, detail) {
    const t = nowMs();
    if (t - (cookLogAt.get(key) || 0) < minMs) return;
    cookLogAt.set(key, t);
    logFlow(message, detail);
  }

  function canCookRecipe(recipe, inventory) {
    return Object.entries(recipe.ingredients).every(([name, amount]) => (inventory[name] || 0) >= amount);
  }

  function getBestAutoCookRecipe(recipes, inventory) {
    if (!Array.isArray(recipes) || recipes.length === 0) return null;

    const preferred = String(runtime.settings.cookPreferredRecipe || "").trim();
    if (preferred) {
      const wanted = recipes.find((r) => r.item === preferred && canCookRecipe(r, inventory));
      if (wanted) return wanted;
    }

    return (
      recipes
        .filter((r) => canCookRecipe(r, inventory))
        .sort((a, b) => (b.xp || 0) - (a.xp || 0))[0] || null
    );
  }

  function consumeRecipeIngredients(recipe, inventory) {
    if (!recipe || !inventory) return;
    Object.entries(recipe.ingredients).forEach(([name, amount]) => {
      inventory[name] = Math.max(0, (inventory[name] || 0) - amount);
    });
  }

  async function requestFreshCookState(bridge) {
    await bridge?.requestState?.().catch(() => {});
    return bridge?.getLatestState?.() || null;
  }

  function getCraftingQueue(instance) {
    if (Array.isArray(instance.craftingQueue)) return instance.craftingQueue;
    if (instance.crafting) return [instance.crafting];
    return [];
  }

  function findCookBuildingInstance(state, buildingName, buildingId) {
    return state?.buildings
      ?.find((g) => g.name === buildingName)
      ?.items?.find((it) => String(it.id) === String(buildingId)) || null;
  }

  function cookQueueHasReadyItem(instance, t) {
    const q = getCraftingQueue(instance);
    for (let i = 0; i < q.length; i += 1) {
      const ra = toNumber(q[i]?.readyAt);
      if (ra > 0 && ra <= t) return true;
    }
    return false;
  }

  async function sendCookEventWithRetry(bridge, event, verifyFn, label) {
    const attempts = [5200, 7200];
    let last = null;
    for (let i = 0; i < attempts.length; i += 1) {
      const res = await bridge.sendEvent(event, attempts[i]);
      last = res;
      const fresh = res?.state || (await requestFreshCookState(bridge));
      if (fresh && verifyFn(fresh)) {
        return { ok: true, state: fresh, verified: true };
      }
      if (res?.ok) return { ok: true, state: fresh, verified: false };

      const err = String(res?.error || "").toLowerCase();
      if (err.includes("locked") || err.includes("weather")) return { ok: false, error: res?.error, state: fresh };

      logCookThrottled(`cook_retry_${label}_${i}`, 6000, "🍳 Event nấu chưa xác nhận — thử lại", {
        label,
        attempt: i + 1,
        error: res?.error || null,
      });
      await new Promise((r) => setTimeout(r, 650 + i * 450));
    }
    return { ok: false, error: last?.error || "cook_event_not_verified", state: last?.state || null };
  }

  function isCookEnabled() {
    return !!(
      runtime.settings.autoCook ||
      runtime.settings.autoCookFirePit ||
      runtime.settings.autoCookKitchen ||
      runtime.settings.autoCookBakery ||
      runtime.settings.autoCookDeli ||
      runtime.settings.autoCookSmoothieShack
    );
  }

  function getEnabledCookingConfigs() {
    const allOn = !!runtime.settings.autoCook;
    const list = [];
    if (allOn || runtime.settings.autoCookFirePit) list.push({ name: "Fire Pit", recipes: FIRE_PIT_RECIPES });
    if (allOn || runtime.settings.autoCookKitchen) list.push({ name: "Kitchen", recipes: KITCHEN_RECIPES });
    if (allOn || runtime.settings.autoCookBakery) list.push({ name: "Bakery", recipes: BAKERY_RECIPES });
    if (allOn || runtime.settings.autoCookDeli) list.push({ name: "Deli", recipes: DELI_RECIPES });
    if (allOn || runtime.settings.autoCookSmoothieShack) list.push({ name: "Smoothie Shack", recipes: SMOOTHIE_SHACK_RECIPES });
    return list;
  }

  /**
   * True → không cần gửi event nấu/thu: game đang busy hoặc chỉ còn lò đang nấu (chưa chín, không gieo thêm được).
   */
  function shouldSkipCookWorkThisTick(state, t, configs, buildings, inventory) {
    if (!state || typeof state !== "object") return false;
    if (state.machineBusy === true && state.machineReady !== true) return true;

    let hasCollectable = false;
    let canStart = false;
    let hasQueueNotReady = false;

    for (let ci = 0; ci < configs.length; ci += 1) {
      const config = configs[ci];
      const buildingGroup = buildings.find((g) => g.name === config.name);
      if (!buildingGroup || !Array.isArray(buildingGroup.items)) continue;

      for (let ii = 0; ii < buildingGroup.items.length; ii += 1) {
        const instance = buildingGroup.items[ii];
        if (!instance?.id) continue;

        const craftingQueue = getCraftingQueue(instance);
        if (craftingQueue.length <= 0) {
          if (getBestAutoCookRecipe(config.recipes, inventory)) canStart = true;
          continue;
        }

        let anyReadyNow = false;
        for (let qi = 0; qi < craftingQueue.length; qi += 1) {
          const ra = toNumber(craftingQueue[qi]?.readyAt);
          if (ra > 0 && ra <= t) anyReadyNow = true;
        }
        if (anyReadyNow) hasCollectable = true;
        else hasQueueNotReady = true;
      }
    }

    if (hasCollectable || canStart) return false;
    if (hasQueueNotReady) return true;
    return false;
  }

  /**
   * Cập nhật nextCookFlowAt + text trạng thái từ state bridge (sau collect / cook / hoặc chỉ kiểm tra).
   */
  function syncCookScheduleFromState(state, t) {
    const configs = getEnabledCookingConfigs();
    if (!configs.length) {
      runtime.nextCookFlowAt = t;
      runtime.cookFlowState = "Tạm tắt";
      runtime.cookCycleEndAt = 0;
      runtime.cookPhaseStartedAt = 0;
      return;
    }

    if (!state || typeof state !== "object") {
      runtime.nextCookFlowAt = t + 8000;
      runtime.cookFlowState = "Chưa có state bridge";
      return;
    }

    const buildings = Array.isArray(state.buildings) ? state.buildings : [];
    const inventory = { ...(state.inventory || {}) };

    let minFutureReady = null;
    let hasCollectable = false;
    let unknownReadyBusy = false;
    let sawAnyBuildingGroup = false;
    let idleSlotWithRecipe = false;

    for (const config of configs) {
      const buildingGroup = buildings.find((g) => g.name === config.name);
      if (!buildingGroup || !Array.isArray(buildingGroup.items)) continue;
      sawAnyBuildingGroup = true;

      for (const instance of buildingGroup.items) {
        const buildingId = instance.id;
        if (!buildingId) continue;

        const craftingQueue = getCraftingQueue(instance);
        if (craftingQueue.length <= 0) {
          if (getBestAutoCookRecipe(config.recipes, inventory)) idleSlotWithRecipe = true;
          continue;
        }

        let anyPositiveReady = false;
        for (const entry of craftingQueue) {
          const ra = toNumber(entry?.readyAt);
          if (ra > 0) anyPositiveReady = true;
          if (ra > 0 && ra <= t) hasCollectable = true;
          else if (ra > t) minFutureReady = minFutureReady == null ? ra : Math.min(minFutureReady, ra);
        }
        if (!anyPositiveReady) unknownReadyBusy = true;
      }
    }

    if (hasCollectable) {
      runtime.nextCookFlowAt = t + COOK_COLLECT_SOON_MS;
      runtime.cookFlowState = "Thu món đã chín";
      return;
    }

    if (minFutureReady != null) {
      runtime.nextCookFlowAt = minFutureReady + COOK_AFTER_READY_MS;
      runtime.cookCycleEndAt = minFutureReady;
      const cand = runtime.cookLastCookStartAt || runtime.cookPhaseStartedAt;
      if (cand > 0 && cand < minFutureReady) {
        runtime.cookPhaseStartedAt = cand;
      } else if (!runtime.cookPhaseStartedAt || runtime.cookPhaseStartedAt >= minFutureReady) {
        runtime.cookPhaseStartedAt = t;
      }
      const hhmm = new Date(minFutureReady).toLocaleTimeString("vi-VN", { hour12: false });
      runtime.cookFlowState = `Đang nấu — chín khoảng ${hhmm}`;
      return;
    }

    if (unknownReadyBusy) {
      runtime.nextCookFlowAt = t + 4000;
      runtime.cookFlowState = "Đang nấu — chờ cập nhật giờ";
      return;
    }

    runtime.cookCycleEndAt = 0;
    runtime.cookPhaseStartedAt = 0;
    runtime.cookLastCookStartAt = 0;

    if (!sawAnyBuildingGroup) {
      runtime.nextCookFlowAt = t + COOK_NO_BUILDING_MS;
      runtime.cookFlowState = "Không thấy Fire Pit / Kitchen trong state";
      return;
    }

    if (idleSlotWithRecipe) {
      runtime.nextCookFlowAt = t + 2200;
      runtime.cookFlowState = "Sẵn sàng bắt đầu món";
      return;
    }

    runtime.nextCookFlowAt = t + COOK_IDLE_PROBE_MS;
    runtime.cookFlowState = "Nghỉ — thiếu nguyên liệu / ô đầy";
  }

  /** Gọi khi chưa tới giờ: chỉ cập nhật nhãn «chờ» theo mốc đã lưu. */
  function refreshCookWaitingLabel(t) {
    if (!isCookEnabled()) return;

    // (Đã gỡ bỏ chặn nấu ăn theo thời tiết)

    if (t >= runtime.nextCookFlowAt) return;
    if (runtime.cookCycleEndAt > t && runtime.cookPhaseStartedAt > 0) {
      const left = Math.max(0, Math.round((runtime.cookCycleEndAt - t) / 1000));
      runtime.cookFlowState = `Chờ món chín (~${left}s)`;
    } else {
      const left = Math.max(0, Math.round((runtime.nextCookFlowAt - t) / 1000));
      runtime.cookFlowState = `Chờ lượt nấu (~${left}s)`;
    }
  }

  async function runCookCycle() {
    if (!isCookEnabled()) return false;

    const bridge = S.gameBridge;
    if (!bridge?.isReady) {
      runtime.cookFlowState = "Chờ bridge";
      runtime.nextCookFlowAt = nowMs() + 5000;
      return false;
    }

    let latestBridgeState = bridge.getLatestState?.();
    if (!latestBridgeState) {
      await bridge.requestState?.().catch(() => {});
      latestBridgeState = bridge.getLatestState?.();
    }
    if (!latestBridgeState) {
      runtime.nextCookFlowAt = nowMs() + 8000;
      runtime.cookFlowState = "Chưa đọc được state";
      return false;
    }

    const configs = getEnabledCookingConfigs();
    const t = nowMs();

    // Đã gỡ bỏ chặn nấu ăn sớm theo thời tiết. 
    // Thay vào đó sẽ thử nấu, nếu server báo lỗi (building locked) thì mới nghỉ 60s.

    let actionCount = 0;
    const cookDiag = [];

    // Nếu state cũ hơn 15 giây, chủ động refresh để tránh bỏ sót món đã chín
    const stateAgeMs = nowMs() - (bridge.stateUpdatedAt || 0);
    if (stateAgeMs > 15000) {
      await bridge.requestState?.().catch(() => {});
      const fresh = bridge.getLatestState?.();
      if (fresh) latestBridgeState = fresh;
    }

    // Trích xuất buildings/inventory SAU khi refresh state
    const buildings = Array.isArray(latestBridgeState.buildings) ? latestBridgeState.buildings : [];
    const inventory = { ...(latestBridgeState.inventory || {}) };

    // === DIAGNOSTIC LOG (xóa sau khi debug xong) ===
    logCookThrottled("cook_diag_buildings", 30000, "🍳 [DIAG] buildings từ bridge", {
      buildingsCount: buildings.length,
      buildingNames: buildings.map((g) => g.name),
      configs: configs.map((c) => c.name),
      buildingSample: buildings.slice(0, 3).map((g) => ({
        name: g.name,
        itemCount: Array.isArray(g.items) ? g.items.length : "NOT_ARRAY:" + typeof g.items,
        items: (g.items || []).slice(0, 2).map((it) => ({
          id: it.id,
          queueLen: Array.isArray(it.craftingQueue) ? it.craftingQueue.length : "NOT_ARRAY",
          queue: it.craftingQueue,
        })),
      })),
    });
    // === END DIAGNOSTIC ===

    if (shouldSkipCookWorkThisTick(latestBridgeState, t, configs, buildings, inventory)) {
      syncCookScheduleFromState(latestBridgeState, t);
      if (latestBridgeState.machineBusy === true && latestBridgeState.machineReady !== true) {
        runtime.cookFlowState = "Bỏ qua — máy game đang bận";
        runtime.nextCookFlowAt = t + 5000;
      }
      logCookThrottled("cook_skip_busy", 10000, "🍳 Bỏ qua luồng nấu (bếp đang nấu / game busy — chờ lịch)", {
        machineBusy: !!latestBridgeState.machineBusy,
        machineReady: latestBridgeState.machineReady,
        nextAt: new Date(runtime.nextCookFlowAt).toISOString(),
      });
      return false;
    }

    for (const config of configs) {
      const buildingGroup = buildings.find((g) => g.name === config.name);
      if (!buildingGroup || !Array.isArray(buildingGroup.items)) continue;

      for (const instance of buildingGroup.items) {
        const buildingId = instance.id;
        if (!buildingId) continue;

        const craftingQueue = getCraftingQueue(instance);
        const readyRecipes = craftingQueue.filter(
          (entry) => toNumber(entry?.readyAt) > 0 && toNumber(entry?.readyAt) <= t,
        );
        const isFinished = readyRecipes.length > 0;
        const isIdle = craftingQueue.length <= 0;

        if (isFinished) {
          logFlow(`🍳 Thu hoạch thức ăn từ ${config.name}`, {
            buildingId,
            readyCount: readyRecipes.length,
            items: readyRecipes.map((entry) => entry.item),
          });
          const res = await sendCookEventWithRetry(
            bridge,
            {
              type: "recipes.collected",
              building: config.name,
              buildingId,
            },
            (state) => {
              const inst = findCookBuildingInstance(state, config.name, buildingId);
              return !inst || !cookQueueHasReadyItem(inst, nowMs());
            },
            "collect",
          );

          if (res?.ok) {
            actionCount += 1;
            const fresh = res.state || (await requestFreshCookState(bridge));
            if (fresh) {
              latestBridgeState = fresh;
              Object.assign(inventory, fresh.inventory || {});
            }
            // Sau collect, lò vừa rỗng ra — thử bắt đầu nấu ngay (không continue)
            const freshInstance = latestBridgeState?.buildings
              ?.find((g) => g.name === config.name)
              ?.items?.find((it) => String(it.id) === String(buildingId));
            const freshQueue = freshInstance ? getCraftingQueue(freshInstance) : [];
            if (freshQueue.length <= 0) {
              // Lò rỗng → fallthrough xuống isIdle để nấu ngay
            } else {
              continue;
            }
          } else if (res?.error) {
            const errStr = String(res.error).toLowerCase();
            if (errStr.includes("locked") || errStr.includes("weather")) {
              logFlow("🍳 Bếp bị khóa do thời tiết / sự kiện, tạm nghỉ 60s", { error: res.error });
              runtime.nextCookFlowAt = nowMs() + 60000;
              runtime.cookFlowState = "Bếp bị khóa / Lỗi thời tiết";
              return false;
            }
            continue;
          } else {
            continue;
          }
        }

        // isIdle dùng queue ban đầu; nếu vừa collect fallthrough xuống đây thì tính lại từ freshQueue
        const effectiveIsIdle = isIdle || (() => {
          if (!isFinished) return false;
          const fi = latestBridgeState?.buildings
            ?.find((g) => g.name === config.name)
            ?.items?.find((it) => String(it.id) === String(buildingId));
          return fi ? getCraftingQueue(fi).length <= 0 : false;
        })();

        if (effectiveIsIdle) {
          const recipe = getBestAutoCookRecipe(config.recipes, inventory);
          if (recipe) {
            logFlow(`👨‍🍳 Bắt đầu nấu ${recipe.item} tại ${config.name}`, { buildingId, recipe });
            const startAt = nowMs();
            const res = await sendCookEventWithRetry(
              bridge,
              {
                type: "recipe.cooked",
                item: recipe.item,
                buildingId,
              },
              (state) => {
                const inst = findCookBuildingInstance(state, config.name, buildingId);
                return !!inst && getCraftingQueue(inst).length > 0;
              },
              "start",
            );

            if (res?.ok) {
              consumeRecipeIngredients(recipe, inventory);
              actionCount += 1;
              runtime.cookLastCookStartAt = startAt;
              runtime.cookPhaseStartedAt = startAt;
              const fresh = res.state || (await requestFreshCookState(bridge));
              if (fresh) {
                latestBridgeState = fresh;
                Object.assign(inventory, fresh.inventory || {});
                const inst = findCookBuildingInstance(fresh, config.name, buildingId);
                const q = inst ? getCraftingQueue(inst) : [];
                const nextRa = q.map((e) => toNumber(e?.readyAt)).filter((n) => n > t);
                const minR = nextRa.length ? Math.min(...nextRa) : 0;
                if (minR > t) runtime.cookCycleEndAt = minR;
              }
            } else if (res?.error) {
              const errStr = String(res.error).toLowerCase();
              if (errStr.includes("locked") || errStr.includes("weather")) {
                logFlow("🍳 Bếp bị khóa do thời tiết / sự kiện, tạm nghỉ 60s", { error: res.error });
                runtime.nextCookFlowAt = nowMs() + 60000;
                runtime.cookFlowState = "Bếp bị khóa / Lỗi thời tiết";
                return false;
              }
            }
          }
          if (!recipe) {
            cookDiag.push({
              building: config.name,
              buildingId,
              state: "idle_no_recipe",
            });
          }
          continue;
        }

        cookDiag.push({
          building: config.name,
          buildingId,
          state: "busy_not_ready",
          queueSize: craftingQueue.length,
          nextReadyAt: toNumber(craftingQueue[0]?.readyAt) || 0,
        });
      }
    }

    const finalState = bridge.getLatestState?.() || latestBridgeState;
    syncCookScheduleFromState(finalState, nowMs());

    if (actionCount <= 0) {
      logCookThrottled("cook_no_action", 12000, "🍳 Luồng nấu ăn chưa có hành động", {
        enabledBuildings: configs.map((c) => c.name),
        buildingCount: buildings.length,
        diag: cookDiag.slice(0, 10),
        nextAt: new Date(runtime.nextCookFlowAt).toISOString(),
      });
    } else {
      logFlow("🍳 Luồng nấu: xong một nhịp", {
        actions: actionCount,
        nextAt: new Date(runtime.nextCookFlowAt).toISOString(),
        state: runtime.cookFlowState,
      });
    }

    return actionCount > 0;
  }

  S.cook = {
    isCookEnabled,
    runCookCycle,
    syncCookScheduleFromState,
    refreshCookWaitingLabel,
    tryAutoCook: runCookCycle,
    FIRE_PIT_RECIPES,
    KITCHEN_RECIPES,
    BAKERY_RECIPES,
    DELI_RECIPES,
    SMOOTHIE_SHACK_RECIPES,
  };
})(window.SFL);
