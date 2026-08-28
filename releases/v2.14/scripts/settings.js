(function (S) {
  "use strict";
  const D = S.DEFAULT_SETTINGS;
  const runtime = S.runtime;

  /** Chrome storage / JSON đôi khi trả boolean thành chuỗi — `!!"false"` trong JS là true. */
  function asBool(v, def) {
    if (v === true || v === 1) return true;
    if (v === false || v === 0) return false;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
      if (s === "false" || s === "0" || s === "no" || s === "off" || s === "") return false;
    }
    return !!def;
  }

  /** Giống mặc định game: undefined → bật, chỉ tắt khi false / "false" / 0. */
  function asBoolPreferTrue(v, defTrue) {
    if (v === undefined || v === null) return !!defTrue;
    if (v === false || v === 0) return false;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "false" || s === "0" || s === "no" || s === "off") return false;
      if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
      if (s === "") return !!defTrue;
    }
    if (v === true || v === 1) return true;
    return !!defTrue;
  }

  S.normalizeSettings = function normalizeSettings(input) {
    const merged = Object.assign({}, D, input || {});

    if (typeof input?.autoCook === "boolean") {
      merged.autoCookFirePit = input.autoCook;
      merged.autoCookKitchen = input.autoCook;
      merged.autoCookBakery = input.autoCook;
      merged.autoCookDeli = input.autoCook;
      merged.autoCookSmoothieShack = input.autoCook;
    }

    merged.masterEnabled = true;
    merged.autoBuyTools = asBool(merged.autoBuyTools, D.autoBuyTools);
    merged.autoRestockBlacksmith = asBool(merged.autoRestockBlacksmith, D.autoRestockBlacksmith);
    merged.autoSunflowerBasic = asBool(merged.autoSunflowerBasic, D.autoSunflowerBasic);
    merged.autoChop = merged.autoSunflowerBasic;
    merged.autoMine = merged.autoSunflowerBasic;
    merged.autoFarmCropsDom = merged.autoSunflowerBasic;
    merged.autoHarvestMushrooms = merged.autoSunflowerBasic;
    merged.autoCook = asBool(merged.autoCook, D.autoCook);
    merged.autoCookFirePit = merged.autoCook || asBool(merged.autoCookFirePit, D.autoCookFirePit);
    merged.autoCookKitchen = merged.autoCook || asBool(merged.autoCookKitchen, D.autoCookKitchen);
    merged.autoCookBakery = merged.autoCook || asBool(merged.autoCookBakery, D.autoCookBakery);
    merged.autoCookDeli = merged.autoCook || asBool(merged.autoCookDeli, D.autoCookDeli);
    merged.autoCookSmoothieShack = merged.autoCook || asBool(merged.autoCookSmoothieShack, D.autoCookSmoothieShack);
    merged.mushroomTargetWild = true;
    merged.mushroomTargetMagic = true;
    merged.clearConsole = asBool(merged.clearConsole, D.clearConsole);
    merged.strikeLearnAutoChop = asBoolPreferTrue(merged.strikeLearnAutoChop, D.strikeLearnAutoChop);
    merged.strikeLearnAutoMine = asBoolPreferTrue(merged.strikeLearnAutoMine, D.strikeLearnAutoMine);
    merged.chopStrikes = S.clampStrikeCount(merged.chopStrikes ?? D.chopStrikes);
    merged.chopStrikesLearned = asBool(merged.chopStrikesLearned, D.chopStrikesLearned);
    merged.mineStrikes = S.clampStrikeCount(merged.mineStrikes ?? D.mineStrikes);
    merged.mineStrikesLearned = asBool(merged.mineStrikesLearned, D.mineStrikesLearned);
    merged.autoExpandIsland = asBool(merged.autoExpandIsland, D.autoExpandIsland);
    merged.mineTargetStone = asBoolPreferTrue(merged.mineTargetStone, D.mineTargetStone);
    merged.mineTargetIron = asBoolPreferTrue(merged.mineTargetIron, D.mineTargetIron);
    merged.mineTargetGold = asBoolPreferTrue(merged.mineTargetGold, D.mineTargetGold);
    merged.mineTargetCrimstone = asBoolPreferTrue(merged.mineTargetCrimstone, D.mineTargetCrimstone);
    merged.mineTargetSunstone = asBoolPreferTrue(merged.mineTargetSunstone, D.mineTargetSunstone);
    merged.cropDomSeedName = "";
    merged.cropDomMinSeedCount = Math.max(0, Math.min(500, Math.floor(Number(merged.cropDomMinSeedCount) || D.cropDomMinSeedCount)));
    merged.cropDomSkipLongGrow = false;
    merged.cropDomBuySeedsAtBetty = false;
    merged.autoPetalHarvestDom = asBool(merged.autoPetalHarvestDom, D.autoPetalHarvestDom);
    merged.autoFruitTree = asBool(merged.autoFruitTree, D.autoFruitTree);
    merged.autoHoney = asBool(merged.autoHoney, D.autoHoney);
    merged.autoCompost = asBool(merged.autoCompost, D.autoCompost);
    merged.cookPreferredRecipe = "";
    merged.reloadPageOnGoblinMoonCaptcha = true;
    merged.actionGapMs = Math.max(800, Math.min(30000, Math.floor(Number(merged.actionGapMs) || D.actionGapMs)));
    merged.tickMs = Math.max(400, Math.min(10000, Math.floor(Number(merged.tickMs) || D.tickMs)));
    merged.uiDelayMinMs = Math.max(200, Math.min(5000, Math.floor(Number(merged.uiDelayMinMs) || D.uiDelayMinMs)));
    merged.uiDelayMaxMs = Math.max(merged.uiDelayMinMs, Math.min(6000, Math.floor(Number(merged.uiDelayMaxMs) || D.uiDelayMaxMs)));
    return merged;
  };

  S.saveSettings = function saveSettings() {
    try {
      chrome.storage.local.set({ [S.SETTINGS_KEY]: runtime.settings });
    } catch (_error) {
      // Ignore storage failures.
    }
  };

  /**
   * Đọc lại từ chrome.storage (popup đã lưu) — iframe/top có thể lệch `runtime.settings` dù đã có onChanged.
   * Chỉ vá các cờ quan trọng để master có hiệu ngay trên mọi frame.
   */
  S.pullAutomationFlagsFromStorage = function pullAutomationFlagsFromStorage() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([S.SETTINGS_KEY], (r) => {
          const raw = r?.[S.SETTINGS_KEY];
          if (!raw || typeof raw !== "object") {
            resolve();
            return;
          }
          const n = S.normalizeSettings(raw);
          const patch = {};
          if (n.masterEnabled !== runtime.settings.masterEnabled) patch.masterEnabled = n.masterEnabled;
          if (Object.keys(patch).length) {
            S.updateSettings(patch, { skipSave: true });
          }
          resolve();
        });
      } catch (_e) {
        resolve();
      }
    });
  };

  S.updateSettings = function updateSettings(patch, opts) {
    opts = opts || {};
    const prev = Object.assign({}, runtime.settings);
    runtime.settings = S.normalizeSettings(Object.assign({}, runtime.settings, patch || {}));
    const currentTime = Date.now();
    const chopToggledOn = !prev.autoChop && runtime.settings.autoChop;
    const mineToggledOn = !prev.autoMine && runtime.settings.autoMine;
    const mushroomToggledOn = !prev.autoHarvestMushrooms && runtime.settings.autoHarvestMushrooms;
    const fruitTreeToggledOn = !prev.autoFruitTree && runtime.settings.autoFruitTree;
    const honeyToggledOn = !prev.autoHoney && runtime.settings.autoHoney;
    const compostToggledOn = !prev.autoCompost && runtime.settings.autoCompost;
    const cookWasOff = !prev.autoCook && !prev.autoCookFirePit && !prev.autoCookKitchen && !prev.autoCookBakery && !prev.autoCookDeli && !prev.autoCookSmoothieShack;
    const cookNowOn = runtime.settings.autoCook || runtime.settings.autoCookFirePit || runtime.settings.autoCookKitchen || runtime.settings.autoCookBakery || runtime.settings.autoCookDeli || runtime.settings.autoCookSmoothieShack;

    if (!runtime.settings.autoChop) {
      runtime.treeFlowStartedAt = 0;
      runtime.nextTreeFlowAt = currentTime;
      runtime.treeFlowState = "Tạm tắt";
      S.clearChopSticky();
    } else if (chopToggledOn) {
      runtime.treeFlowStartedAt = 0;
      runtime.nextTreeFlowAt = currentTime;
      runtime.treeFlowState = "Sẵn sàng";
    }

    if (!runtime.settings.autoMine) {
      runtime.rockFlowStartedAt = 0;
      runtime.nextRockFlowAt = currentTime;
      runtime.rockFlowState = "Tạm tắt";
      S.clearMineSticky();
      if (typeof S.rockMine?.resetSession === "function") {
        S.rockMine.resetSession();
      }
    } else if (mineToggledOn) {
      runtime.rockFlowStartedAt = 0;
      runtime.nextRockFlowAt = currentTime;
      runtime.rockFlowState = "Sẵn sàng";
    }

    if (!runtime.settings.autoHarvestMushrooms) {
      runtime.mushroomFlowStartedAt = 0;
      runtime.nextMushroomFlowAt = currentTime;
      runtime.mushroomFlowState = "Tạm tắt";
    } else if (mushroomToggledOn) {
      runtime.mushroomFlowStartedAt = 0;
      runtime.nextMushroomFlowAt = currentTime;
      runtime.mushroomFlowState = "Sẵn sàng";
    }

    if (!runtime.settings.autoFruitTree) {
      runtime.fruitTreeFlowStartedAt = 0;
      runtime.nextFruitTreeFlowAt = currentTime;
      runtime.fruitTreeFlowState = "Tạm tắt";
      runtime.fruitTreeFlowResumeAt = 0;
    } else if (fruitTreeToggledOn) {
      runtime.fruitTreeFlowStartedAt = 0;
      runtime.nextFruitTreeFlowAt = currentTime;
      runtime.fruitTreeFlowState = "Sẵn sàng";
    }

    if (!runtime.settings.autoHoney) {
      runtime.honeyFlowStartedAt = 0;
      runtime.nextHoneyFlowAt = currentTime;
      runtime.honeyFlowState = "Tạm tắt";
      runtime.honeyFlowResumeAt = 0;
    } else if (honeyToggledOn) {
      runtime.honeyFlowStartedAt = 0;
      runtime.nextHoneyFlowAt = currentTime;
      runtime.honeyFlowState = "Sẵn sàng";
    }

    if (!runtime.settings.autoCompost) {
      runtime.compostFlowStartedAt = 0;
      runtime.nextCompostFlowAt = currentTime;
      runtime.compostFlowState = "Tạm tắt";
      runtime.compostFlowResumeAt = 0;
    } else if (compostToggledOn) {
      runtime.compostFlowStartedAt = 0;
      runtime.nextCompostFlowAt = currentTime;
      runtime.compostFlowState = "Sẵn sàng";
    }

    if (!cookNowOn) {
      runtime.cookFlowStartedAt = 0;
      runtime.nextCookFlowAt = currentTime;
      runtime.cookFlowState = "Tạm tắt";
      runtime.cookCycleEndAt = 0;
      runtime.cookPhaseStartedAt = 0;
      runtime.cookLastCookStartAt = 0;
    } else if (cookWasOff && cookNowOn) {
      runtime.cookFlowStartedAt = 0;
      runtime.nextCookFlowAt = currentTime;
      runtime.cookFlowState = "Sẵn sàng";
    }

    if (!runtime.settings.autoChop) {
      const keep = runtime.buyToolQueue.filter((j) => j.requester !== "chop");
      runtime.buyToolQueue.length = 0;
      runtime.buyToolQueue.push(...keep);
    }
    if (!runtime.settings.autoMine) {
      const keep = runtime.buyToolQueue.filter((j) => j.requester !== "mine");
      runtime.buyToolQueue.length = 0;
      runtime.buyToolQueue.push(...keep);
    }
    if (!opts.skipSave) {
      S.saveSettings();
    }
  };
})(window.SFL);
