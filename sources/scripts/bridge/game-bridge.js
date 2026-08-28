// ═══════════════════════════════════════════════════════════════════
// GAME BRIDGE CLIENT — ISOLATED WORLD (game-bridge.js)
// Quản lý kết nối, inject script MAIN world & giao tiếp State qua postMessage
// ═══════════════════════════════════════════════════════════════════
(function (S) {
  "use strict";

  // Trạng thái Game Bridge
  S.bridgeReady = false;
  S.gameState = null;
  S.gameSeason = "spring";
  S.gameBridgeUpdatedAt = 0;

  let stateReqSeq = 0;
  const pendingStateResolvers = new Map();

  function normalizeSeasonName(raw) {
    const s = String(raw || "spring").toLowerCase().trim();
    if (s.includes("spring")) return "spring";
    if (s.includes("summer")) return "summer";
    if (s.includes("autumn") || s.includes("fall")) return "autumn";
    if (s.includes("winter")) return "winter";
    return "spring";
  }
  S.normalizeSeasonName = normalizeSeasonName;

  // Lấy mùa hiện tại (từ cache hoặc mặc định spring)
  function getGameSeason() {
    if (S.gameState && S.gameState.user?.season) {
      return normalizeSeasonName(S.gameState.user.season);
    }
    if (S.gameState && S.gameState.season) {
      return normalizeSeasonName(S.gameState.season);
    }
    return normalizeSeasonName(S.gameSeason || "spring");
  }
  S.getGameSeason = getGameSeason;

  // Inject script page-bridge vào MAIN world duy nhất 1 lần
  let daInject = false;
  function injectBridge() {
    if (daInject || document.getElementById("sfl-page-bridge")) return;
    daInject = true;
    try {
      const script = document.createElement("script");
      script.id = "sfl-page-bridge";
      script.src = chrome.runtime.getURL("scripts/bridge/page-bridge.js");
      (document.head || document.documentElement).appendChild(script);
    } catch (_e) {}
  }
  S.injectBridge = injectBridge;
  injectBridge();

  // Yêu cầu State mới nhất từ Bridge
  function requestBridgeState(timeoutMs = 2500) {
    injectBridge();
    return new Promise((resolve) => {
      const reqId = `st_${Date.now().toString(36)}_${(++stateReqSeq).toString(36)}`;
      const timer = setTimeout(() => {
        pendingStateResolvers.delete(reqId);
        resolve(S.gameState);
      }, timeoutMs);

      pendingStateResolvers.set(reqId, (data) => {
        clearTimeout(timer);
        resolve(data);
      });

      window.postMessage({ _sfl: true, type: "SFL_GET_STATE", reqId }, "*");
    });
  }
  S.requestBridgeState = requestBridgeState;

  // Chọn vật phẩm trực tiếp trên tay thông qua Game Bridge (không cần mở kho đồ)
  function selectItemBridge(itemName, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const reqId = "sel_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_SELECT_ITEM_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(!!ev.data.ok);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve(false);
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_SELECT_ITEM",
        reqId: reqId,
        itemName: itemName,
      }, "*");
    });
  }
  S.selectItemBridge = selectItemBridge;

  // Chế tạo một công cụ cụ thể qua Game Bridge
  function craftToolBridge(toolName, amount = 1, timeoutMs = 3000) {
    return new Promise((resolve) => {
      const reqId = "crf_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_CRAFT_TOOL_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_CRAFT_TOOL",
        reqId: reqId,
        toolName: toolName,
        amount: amount,
      }, "*");
    });
  }
  S.craftToolBridge = craftToolBridge;

  // Mua toàn bộ công cụ đủ điều kiện (Batch Buy) qua Game Bridge
  function batchBuyToolsBridge(timeoutMs = 5000) {
    return new Promise((resolve) => {
      const reqId = "bb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_BATCH_BUY_TOOLS_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_BATCH_BUY_TOOLS",
        reqId: reqId,
      }, "*");
    });
  }
  S.batchBuyToolsBridge = batchBuyToolsBridge;

  // Mua toàn bộ hạt giống trong mùa (Batch Buy Seeds) qua Game Bridge
  function batchBuySeedsBridge(season = null, timeoutMs = 4000) {
    return new Promise((resolve) => {
      const reqId = "bbs_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_BATCH_BUY_SEEDS_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_BATCH_BUY_SEEDS",
        reqId: reqId,
        season: season,
      }, "*");
    });
  }
  S.batchBuySeedsBridge = batchBuySeedsBridge;
  S.buySeasonalSeedsBridge = batchBuySeedsBridge;

  // Mua đơn lẻ hạt giống chỉ định qua Game Bridge
  function buySingleSeedBridge(seedName, amount = 1, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "bss_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_BUY_SINGLE_SEED_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_BUY_SINGLE_SEED",
        reqId: reqId,
        seedName: seedName,
        amount: amount,
      }, "*");
    });
  }
  S.buySingleSeedBridge = buySingleSeedBridge;

  // Nhận thưởng Rương Daily Reward qua Game Bridge
  function claimDailyRewardBridge(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const reqId = "cdr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_CLAIM_DAILY_REWARD_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_CLAIM_DAILY_REWARD",
        reqId: reqId,
      }, "*");
    });
  }
  S.claimDailyRewardBridge = claimDailyRewardBridge;

  // Nhận hàng Thuyền Restock (Shipment Restock) qua Game Bridge
  function restockShipmentBridge(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const reqId = "rst_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_RESTOCK_SHIPMENT_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_RESTOCK_SHIPMENT",
        reqId: reqId,
      }, "*");
    });
  }
  S.restockShipmentBridge = restockShipmentBridge;

  // Thu hoạch phân chín (Compost Collected) qua Game Bridge
  function collectCompostBridge(building, buildingId, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "ccp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_COLLECT_COMPOST_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_COLLECT_COMPOST",
        reqId: reqId,
        building: building,
        buildingId: buildingId,
      }, "*");
    });
  }
  S.collectCompostBridge = collectCompostBridge;

  // Khởi động mẻ ủ phân mới (Composter Started) qua Game Bridge
  function startComposterBridge(building, buildingId, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "scp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_START_COMPOSTER_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_START_COMPOSTER",
        reqId: reqId,
        building: building,
        buildingId: buildingId,
      }, "*");
    });
  }
  S.startComposterBridge = startComposterBridge;

  // Rắc phân hàng loạt (Bulk Fertilise) cho toàn bộ ô ruộng rỗng & cây đang lớn
  function bulkFertiliseBridge(fertiliser, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "bft_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_BULK_FERTILISE_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_BULK_FERTILISE",
        reqId: reqId,
        fertiliser: fertiliser,
      }, "*");
    });
  }
  // Gieo hạt giống hàng loạt (Bulk Plant) cho toàn bộ ô ruộng rỗng qua Game Bridge
  function bulkPlantBridge(seedName, timeoutMs = 3000) {
    return new Promise((resolve) => {
      const reqId = "bpl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_BULK_PLANT_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_BULK_PLANT",
        reqId: reqId,
        seedName: seedName,
      }, "*");
    });
  }
  // Thu hoạch mật ong khi hũ mật đã đầy 100% qua Game Bridge
  function harvestHoneyBridge(timeoutMs = 3500) {
    return new Promise((resolve) => {
      const reqId = "hnh_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_HARVEST_HONEY_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_HARVEST_HONEY",
        reqId: reqId,
      }, "*");
    });
  }
  S.harvestHoneyBridge = harvestHoneyBridge;

  // Thu hoạch cây ăn quả chín (Fruit Harvested) qua Game Bridge
  function harvestFruitBridge(patchIds = null, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "hfr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_HARVEST_FRUIT_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_HARVEST_FRUIT",
        reqId: reqId,
        patchIds: patchIds,
      }, "*");
    });
  }
  S.harvestFruitBridge = harvestFruitBridge;

  // Đốn hạ gốc cây ăn quả chết (Dead Fruit Tree Removed) qua Game Bridge
  function removeDeadFruitTreeBridge(patchIds = null, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "rdft_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_REMOVE_DEAD_FRUIT_TREE_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_REMOVE_DEAD_FRUIT_TREE",
        reqId: reqId,
        patchIds: patchIds,
      }, "*");
    });
  }
  S.removeDeadFruitTreeBridge = removeDeadFruitTreeBridge;

  // Gieo trồng cây ăn quả (Fruit Planted) qua Game Bridge
  function plantFruitBridge(seedName = null, patchIds = null, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "pft_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_PLANT_FRUIT_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_PLANT_FRUIT",
        reqId: reqId,
        seedName: seedName,
        patchIds: patchIds,
      }, "*");
    });
  }
  S.plantFruitBridge = plantFruitBridge;

  // Thu hoạch hoa chín (Harvest Flowers) qua Game Bridge
  function harvestFlowersBridge(bedIds = null, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "hfl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_HARVEST_FLOWERS_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_HARVEST_FLOWERS",
        reqId: reqId,
        bedIds: bedIds,
      }, "*");
    });
  }
  S.harvestFlowersBridge = harvestFlowersBridge;

  // Gieo trồng hoa & thụ phấn (Plant Flowers & Crossbreed) qua Game Bridge
  function plantFlowersBridge(bedIds = null, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "pfl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_PLANT_FLOWERS_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_PLANT_FLOWERS",
        reqId: reqId,
        bedIds: bedIds,
      }, "*");
    });
  }
  S.plantFlowersBridge = plantFlowersBridge;

  // Thu hoạch tất cả món ăn đã nấu chín qua Game Bridge
  function collectRecipesBridge(timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "clr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_COLLECT_RECIPES_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_COLLECT_RECIPES",
        reqId: reqId,
      }, "*");
    });
  }
  S.collectRecipesBridge = collectRecipesBridge;

  // Nấu món ăn ưu tiên điểm kinh nghiệm (XP) cao nhất (tự động tính hệ số x2 nếu có skill Double Nom)
  function cookBestRecipesBridge(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const reqId = "ckb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_COOK_BEST_RECIPES_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_COOK_BEST_RECIPES",
        reqId: reqId,
      }, "*");
    });
  }
  S.cookBestRecipesBridge = cookBestRecipesBridge;

  // Gieo trồng cây ăn quả vào các ô đất trống qua Game Bridge
  function plantFruitBridge(seed = null, patchIds = null, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const reqId = "pfr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_PLANT_FRUIT_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_PLANT_FRUIT",
        reqId: reqId,
        seed: seed,
        patchIds: patchIds,
      }, "*");
    });
  }
  S.plantFruitBridge = plantFruitBridge;

  // Mua toàn bộ hạt giống theo mùa (Crops + Fruits + Flowers + Greenhouse) qua Game Bridge, ưu tiên từ rẻ đến đắt
  function buySeasonalSeedsBridge(timeoutMs = 5000) {
    return new Promise((resolve) => {
      const reqId = "bss_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_BUY_SEASONAL_SEEDS_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_BUY_SEASONAL_SEEDS",
        reqId: reqId,
      }, "*");
    });
  }
  S.buySeasonalSeedsBridge = buySeasonalSeedsBridge;

  // Giao toàn bộ đơn hàng đủ điều kiện qua Game Bridge (Hỗ trợ VIP & Tài khoản thường)
  function deliverOrdersBridge(timeoutMs = 4000) {
    return new Promise((resolve) => {
      const reqId = "deliv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_DELIVER_ORDERS_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout", deliveredCount: 0, deliveredList: [] });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_DELIVER_ORDERS",
        reqId: reqId,
      }, "*");
    });
  }
  S.deliverOrdersBridge = deliverOrdersBridge;

  // Tự động nhận thưởng nhiệm vụ tuần (Weekly Chores & Kingdom Chores) qua Game Bridge
  function claimChoresBridge(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const reqId = "chore_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_CLAIM_CHORES_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout", claimedCount: 0, claimedChores: [] });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_CLAIM_CHORES",
        reqId: reqId,
      }, "*");
    });
  }
  S.claimChoresBridge = claimChoresBridge;

  // Tự động giao hàng Bounties cho Poppy (Mega Bounty Board) qua Game Bridge
  function sellBountiesBridge(timeoutMs = 4000) {
    return new Promise((resolve) => {
      const reqId = "bounty_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_SELL_BOUNTIES_POPPY_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout", soldCount: 0, soldBounties: [], bonusClaimed: false });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_SELL_BOUNTIES_POPPY",
        reqId: reqId,
      }, "*");
    });
  }
  S.sellBountiesBridge = sellBountiesBridge;

  // Tự động nhận thưởng Mốc Tháng (Season Track Milestones) & Codex Milestones qua Game Bridge
  function claimMilestonesBridge(timeoutMs = 3500) {
    return new Promise((resolve) => {
      const reqId = "mls_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      let timer = null;

      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data._sfl !== true) return;
        if (ev.data.type === "SFL_CLAIM_MILESTONES_RESULT" && ev.data.reqId === reqId) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(ev.data);
        }
      }

      timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, error: "timeout", claimedTracks: 0, claimedCodex: 0 });
      }, timeoutMs);

      window.addEventListener("message", onMsg);
      window.postMessage({
        _sfl: true,
        type: "SFL_CLAIM_MILESTONES",
        reqId: reqId,
      }, "*");
    });
  }
  S.claimMilestonesBridge = claimMilestonesBridge;

  // Lắng nghe message từ page-bridge.js
  let daBaoBridgeReady = false;
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data._sfl !== true) return;

    if (data.type === "SFL_BRIDGE_READY") {
      S.bridgeReady = true;
      if (!daBaoBridgeReady) {
        daBaoBridgeReady = true;
        console.log("%c[SFL Bridge] 🌉 Game Bridge (MAIN world) đã sẵn sàng kết nối!", "color: #00bcd4; font-weight: bold;");
      }
      return;
    }

    if (data.type === "SFL_STATE") {
      if (!data.error && data.data) {
        S.gameState = data.data;
        S.gameBridgeUpdatedAt = Date.now();
        const detectedSeason = data.data.user?.season || data.data.season;
        if (detectedSeason) {
          S.gameSeason = normalizeSeasonName(detectedSeason);
        }
      }
      const reqId = data.reqId;
      if (reqId && pendingStateResolvers.has(reqId)) {
        const fn = pendingStateResolvers.get(reqId);
        pendingStateResolvers.delete(reqId);
        fn(data.data || S.gameState);
      }
      return;
    }
  });

})(window.SFL = window.SFL || {});
