(function (S) {
  "use strict";
  const runtime = S.runtime;
  const version = "2.14.0";
  console.log(`%c[SFL UI] Tool v${version} loaded (at ${new Date().toLocaleTimeString()})`, "color: #00ff00; font-weight: bold;");

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SFL_UI_GET_STATUS") {
      const currentTime = S.time.now();
      sendResponse({
        ok: true,
        settings: runtime.settings,
        status: {
          onPlayPage: S.dom.isOnPlayPage(),
          busy: runtime.busy,
          lastAction: runtime.lastAction,
          lastError: runtime.lastError,
          errorCount: runtime.errorCount,
          lastActionAt: runtime.lastActionAt,
          nextActionInMs: Math.max(0, runtime.settings.actionGapMs - (S.time.now() - runtime.lastActionAt)),
          captchaGoblinMoonReloadSkipCount: Math.max(
            0,
            Math.floor(Number(runtime.captchaGoblinMoonReloadSkipCount) || 0),
          ),
          captchaSolvedCount: Math.max(0, Math.floor(Number(runtime.captchaSolvedCount) || 0)),
          captchaFailedCount: Math.max(0, Math.floor(Number(runtime.captchaFailedCount) || 0)),
          flows: {
            resource: {
              name: "Luồng: chặt cây (gỗ)",
              enabled: !!runtime.settings.autoChop,
              startedAt: runtime.treeFlowStartedAt || 0,
              nextAt: runtime.settings.autoChop
                ? runtime.nextTreeFlowAt || Number.MAX_SAFE_INTEGER
                : Number.MAX_SAFE_INTEGER,
              intervalMs: S.FLOW_INTERVAL_MS,
              state: runtime.treeFlowState,
              queueSize: runtime.buyToolQueue.length,
              queueLabel: runtime.buyToolQueue.length
                ? runtime.buyToolQueue.map((item) => item.toolType).join(", ")
                : "",
              nextInMs: Math.max(
                0,
                runtime.settings.autoChop
                  ? (runtime.nextTreeFlowAt || Number.MAX_SAFE_INTEGER) - currentTime
                  : Number.MAX_SAFE_INTEGER,
              ),
            },
            ore: {
              name: "Luồng: đào đá / quặng",
              enabled: !!runtime.settings.autoMine,
              startedAt: runtime.rockFlowStartedAt || 0,
              nextAt: runtime.settings.autoMine
                ? runtime.nextRockFlowAt || Number.MAX_SAFE_INTEGER
                : Number.MAX_SAFE_INTEGER,
              intervalMs: S.ROCK_FLOW_INTERVAL_MS,
              state: runtime.rockFlowState,
              queueSize: runtime.buyToolQueue.length,
              queueLabel: runtime.buyToolQueue.length
                ? runtime.buyToolQueue.map((item) => item.toolType).join(", ")
                : "",
              nextInMs: Math.max(
                0,
                runtime.settings.autoMine
                  ? (runtime.nextRockFlowAt || Number.MAX_SAFE_INTEGER) - currentTime
                  : Number.MAX_SAFE_INTEGER,
              ),
            },
            mushroom: {
              name: "Luồng: thu nấm (wild / magic)",
              enabled: !!runtime.settings.autoHarvestMushrooms,
              startedAt: runtime.mushroomFlowStartedAt || 0,
              nextAt: runtime.settings.autoHarvestMushrooms
                ? runtime.nextMushroomFlowAt || Number.MAX_SAFE_INTEGER
                : Number.MAX_SAFE_INTEGER,
              intervalMs: S.MUSHROOM_FLOW_INTERVAL_MS,
              state: runtime.mushroomFlowState,
              noToolQueue: true,
              queueSize: 0,
              queueLabel: "",
              nextInMs: Math.max(
                0,
                runtime.settings.autoHarvestMushrooms
                  ? (runtime.nextMushroomFlowAt || Number.MAX_SAFE_INTEGER) - currentTime
                  : Number.MAX_SAFE_INTEGER,
              ),
            },
            cook: (() => {
              const cookOn = typeof S.cook?.isCookEnabled === "function" && S.cook.isCookEnabled();
              let intervalMs = 45 * 1000;
              if (cookOn && runtime.cookCycleEndAt > runtime.cookPhaseStartedAt && runtime.cookPhaseStartedAt > 0) {
                intervalMs = Math.max(5000, runtime.cookCycleEndAt - runtime.cookPhaseStartedAt);
              } else if (cookOn && runtime.nextCookFlowAt > runtime.cookFlowStartedAt && runtime.cookFlowStartedAt > 0) {
                intervalMs = Math.max(5000, runtime.nextCookFlowAt - runtime.cookFlowStartedAt);
              }
              return {
                name: "Luồng: nấu ăn (thu + nấu)",
                enabled: cookOn,
                startedAt: runtime.cookFlowStartedAt || 0,
                nextAt: cookOn ? runtime.nextCookFlowAt || Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
                intervalMs,
                state: runtime.cookFlowState || "—",
                queueCaption: "Một chu kỳ: thu món chín + bắt đầu nấu — chờ theo readyAt",
                queueSize: 0,
                queueLabel: "",
                nextInMs: Math.max(
                  0,
                  cookOn ? (runtime.nextCookFlowAt || Number.MAX_SAFE_INTEGER) - currentTime : Number.MAX_SAFE_INTEGER,
                ),
              };
            })(),
            petal: (() => {
              const on = !!runtime.settings.autoPetalHarvestDom;
              const gapMs = Math.max(800, Math.floor(Number(runtime.settings.actionGapMs) || 3200));
              const nextTap = (runtime.lastPetalActionAt || 0) + gapMs;
              return {
                name: "Luồng: hoa / quả / mật ong (DOM)",
                enabled: on,
                startedAt: 0,
                nextAt: on ? nextTap : Number.MAX_SAFE_INTEGER,
                intervalMs: gapMs,
                state: runtime.petalHarvestState || "—",
                noToolQueue: true,
                queueCaption: "Thanh tiến độ đầy + tổ ong → Collect",
                queueSize: 0,
                queueLabel: "",
                nextInMs: Math.max(0, on ? nextTap - currentTime : Number.MAX_SAFE_INTEGER),
              };
            })(),
            fruitTree: (() => {
              const on = !!runtime.settings.autoFruitTree;
              return {
                name: "Luồng: trồng + thu hoạch cây ăn quả (DOM)",
                enabled: on,
                startedAt: runtime.fruitTreeFlowStartedAt || 0,
                nextAt: on ? (runtime.nextFruitTreeFlowAt || Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
                intervalMs: S.FRUIT_TREE_FLOW_INTERVAL_MS,
                state: runtime.fruitTreeFlowState || "—",
                noToolQueue: true,
                queueCaption: "Thu trái chín → chặt gốc già → trồng mới",
                queueSize: 0,
                queueLabel: "",
                nextInMs: Math.max(0, on ? (runtime.nextFruitTreeFlowAt || Number.MAX_SAFE_INTEGER) - currentTime : Number.MAX_SAFE_INTEGER),
              };
            })(),
            honey: (() => {
              const on = !!runtime.settings.autoHoney;
              return {
                name: "Luồng: thu hoạch hoa, mật ong (DOM + Bridge)",
                enabled: on,
                startedAt: runtime.honeyFlowStartedAt || 0,
                nextAt: on ? (runtime.nextHoneyFlowAt || Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
                intervalMs: S.HONEY_FLOW_INTERVAL_MS,
                state: runtime.honeyFlowState || "—",
                noToolQueue: true,
                queueCaption: "Beehive produced ≥ 100 → Thu mật",
                queueSize: 0,
                queueLabel: "",
                nextInMs: Math.max(0, on ? (runtime.nextHoneyFlowAt || Number.MAX_SAFE_INTEGER) - currentTime : Number.MAX_SAFE_INTEGER),
              };
            })(),
            compost: (() => {
              const on = !!runtime.settings.autoCompost;
              return {
                name: "Luồng: ủ phân Composter (DOM)",
                enabled: on,
                startedAt: runtime.compostFlowStartedAt || 0,
                nextAt: on ? (runtime.nextCompostFlowAt || Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
                intervalMs: S.COMPOST_FLOW_INTERVAL_MS || 60000,
                state: runtime.compostFlowState || "—",
                noToolQueue: true,
                queueCaption: "Tự động thu phân chín & ủ phân mới",
                queueSize: 0,
                queueLabel: "",
                nextInMs: Math.max(0, on ? (runtime.nextCompostFlowAt || Number.MAX_SAFE_INTEGER) - currentTime : Number.MAX_SAFE_INTEGER),
              };
            })(),
          },
        },
      });
      return;
    }

    if (message?.type === "SFL_UI_UPDATE_SETTINGS") {
      S.updateSettings(message.settings || {}, {});
      sendResponse({ ok: true, settings: runtime.settings });
      return;
    }

    if (message?.type === "SFL_UI_GET_SETTINGS") {
      sendResponse({ ok: true, settings: runtime.settings });
      return;
    }

    if (message?.type === "SFL_UI_RESET_CAPTCHA_RELOAD_SKIP_COUNT") {
      const k = S.CAPTCHA_GOBLIN_MOON_RELOAD_SKIP_COUNT_KEY;
      try {
        chrome.storage.local.set({ [k]: 0 }, () => {
          runtime.captchaGoblinMoonReloadSkipCount = 0;
          sendResponse({ ok: true });
        });
      } catch (_e) {
        sendResponse({ ok: false });
      }
      return true;
    }
  });

  // Clear crop seed cache when the user manually clicks (e.g. changing tools)
  document.addEventListener("click", (e) => {
    if (e.isTrusted && window.SFL && window.SFL.runtime) {
      window.SFL.runtime.cropDomLastSelectedSeedName = null;
    }
  }, { capture: true });

  /** Đồng bộ mọi frame (iframe game + top): popup lưu storage → mọi content script cập nhật cài đặt. */
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const ch = changes[S.SETTINGS_KEY];
      if (!ch || ch.newValue == null || typeof ch.newValue !== "object") return;
      try {
        S.updateSettings(ch.newValue, { skipSave: true });
      } catch (_e) {
        // ignore
      }
    });
  } catch (_e) {
    // ignore
  }

  try {
    chrome.storage.local.get(
      [S.SETTINGS_KEY, S.SETTINGS_SCHEMA_STORAGE_KEY, S.CAPTCHA_GOBLIN_MOON_RELOAD_SKIP_COUNT_KEY],
      (result) => {
      if (chrome.runtime.lastError) {
        console.warn("[SFL UI] Storage error (context might be invalidated):", chrome.runtime.lastError.message);
        return;
      }
      const schema = Number(result?.[S.SETTINGS_SCHEMA_STORAGE_KEY]) || 0;
      let settings = S.normalizeSettings(result?.[S.SETTINGS_KEY]);
      if (schema < S.SETTINGS_SCHEMA_VERSION) {
        const patch = {};
        if (schema < 2) {
          Object.assign(patch, {
            actionGapMs: S.DEFAULT_SETTINGS.actionGapMs,
            tickMs: S.DEFAULT_SETTINGS.tickMs,
            uiDelayMinMs: S.DEFAULT_SETTINGS.uiDelayMinMs,
            uiDelayMaxMs: S.DEFAULT_SETTINGS.uiDelayMaxMs,
          });
        }
        if (schema < 3) {
          Object.assign(patch, {
            autoMine: S.DEFAULT_SETTINGS.autoMine,
            strikeLearnAutoMine: S.DEFAULT_SETTINGS.strikeLearnAutoMine,
            mineStrikes: S.DEFAULT_SETTINGS.mineStrikes,
            mineStrikesLearned: S.DEFAULT_SETTINGS.mineStrikesLearned,
          });
        }
        if (schema < 4) {
          Object.assign(patch, {
            mineTargetStone: S.DEFAULT_SETTINGS.mineTargetStone,
            mineTargetIron: S.DEFAULT_SETTINGS.mineTargetIron,
            mineTargetGold: S.DEFAULT_SETTINGS.mineTargetGold,
          });
        }
        if (schema < 5) {
          const g = settings.mineTargetGold !== false;
          Object.assign(patch, {
            mineTargetCrimstone: g,
            mineTargetSunstone: g,
          });
        }
        if (schema < 6) {
          Object.assign(patch, {
            autoHarvestMushrooms: S.DEFAULT_SETTINGS.autoHarvestMushrooms,
            mushroomTargetWild: S.DEFAULT_SETTINGS.mushroomTargetWild,
            mushroomTargetMagic: S.DEFAULT_SETTINGS.mushroomTargetMagic,
          });
        }
        if (schema < 7) {
          Object.assign(patch, {
            autoCookFirePit: S.DEFAULT_SETTINGS.autoCookFirePit,
            autoCookKitchen: S.DEFAULT_SETTINGS.autoCookKitchen,
          });
        }
        if (schema < 9) {
          Object.assign(patch, {
            autoFarmCropsDom: S.DEFAULT_SETTINGS.autoFarmCropsDom,
            cropDomSeedName: S.DEFAULT_SETTINGS.cropDomSeedName,
            cropDomMinSeedCount: S.DEFAULT_SETTINGS.cropDomMinSeedCount,
            cropDomSkipLongGrow: S.DEFAULT_SETTINGS.cropDomSkipLongGrow,
          });
        }
        if (schema < 11) {
          Object.assign(patch, {
            autoPetalHarvestDom: S.DEFAULT_SETTINGS.autoPetalHarvestDom,
            cookPreferredRecipe: S.DEFAULT_SETTINGS.cookPreferredRecipe,
          });
        }
        if (schema < 12) {
          Object.assign(patch, {
            reloadPageOnGoblinMoonCaptcha: S.DEFAULT_SETTINGS.reloadPageOnGoblinMoonCaptcha,
          });
        }
        if (schema < 13) {
          Object.assign(patch, {
            cropDomBuySeedsAtBetty: S.DEFAULT_SETTINGS.cropDomBuySeedsAtBetty,
          });
        }
        if (schema < 16) {
          Object.assign(patch, {
            masterEnabled: S.DEFAULT_SETTINGS.masterEnabled,
            autoMine: S.DEFAULT_SETTINGS.autoMine,
            autoFarmCropsDom: S.DEFAULT_SETTINGS.autoFarmCropsDom,
            cropDomSkipLongGrow: S.DEFAULT_SETTINGS.cropDomSkipLongGrow,
            cropDomBuySeedsAtBetty: S.DEFAULT_SETTINGS.cropDomBuySeedsAtBetty,
            reloadPageOnGoblinMoonCaptcha: S.DEFAULT_SETTINGS.reloadPageOnGoblinMoonCaptcha,
            autoExpandIsland: S.DEFAULT_SETTINGS.autoExpandIsland,
            mineTargetSunstone: S.DEFAULT_SETTINGS.mineTargetSunstone,
          });
        }
        if (schema < 17) {
          Object.assign(patch, {
            autoCompost: S.DEFAULT_SETTINGS.autoCompost,
          });
        }
        if (schema < 18) {
          Object.assign(patch, {
            autoCook: S.DEFAULT_SETTINGS.autoCook,
            autoCookBakery: S.DEFAULT_SETTINGS.autoCookBakery,
            autoCookDeli: S.DEFAULT_SETTINGS.autoCookDeli,
            autoCookSmoothieShack: S.DEFAULT_SETTINGS.autoCookSmoothieShack,
          });
        }
        settings = S.normalizeSettings(Object.assign({}, settings, patch));
        try {
          chrome.storage.local.set({
            [S.SETTINGS_KEY]: settings,
            [S.SETTINGS_SCHEMA_STORAGE_KEY]: S.SETTINGS_SCHEMA_VERSION,
          });
        } catch (_e) {
          // ignore
        }
      }
      runtime.settings = settings;
      runtime.captchaGoblinMoonReloadSkipCount = Math.max(
        0,
        Math.floor(Number(result?.[S.CAPTCHA_GOBLIN_MOON_RELOAD_SKIP_COUNT_KEY]) || 0),
      );
      const t = S.time.now();
      runtime.lastTreeActionAt = 0;
      runtime.lastRockActionAt = 0;
      runtime.lastCropDomActionAt = 0;
      runtime.lastPetalActionAt = 0;
      runtime.lastActionAt = 0;
      runtime.buyToolQueue.length = 0;
      runtime.buyToolLock = false;
      S.clearChopSticky();
      S.clearMineSticky();

      if (runtime.settings.autoChop) {
        runtime.treeFlowStartedAt = 0;
        runtime.nextTreeFlowAt = t;
        runtime.treeFlowState = "Sẵn sàng";
      } else {
        runtime.treeFlowState = "Tạm tắt";
        runtime.nextTreeFlowAt = t;
      }
      if (runtime.settings.autoHoney) {
        runtime.honeyFlowStartedAt = 0;
        runtime.nextHoneyFlowAt = t;
        runtime.honeyFlowState = "Sẵn sàng";
      } else {
        runtime.honeyFlowState = "Tạm tắt";
        runtime.nextHoneyFlowAt = t;
      }
      if (runtime.settings.autoCompost) {
        runtime.compostFlowStartedAt = 0;
        runtime.nextCompostFlowAt = t;
        runtime.compostFlowState = "Sẵn sàng";
      } else {
        runtime.compostFlowState = "Tạm tắt";
        runtime.nextCompostFlowAt = t;
      }
      if (runtime.settings.autoMine) {
        runtime.rockFlowStartedAt = 0;
        runtime.nextRockFlowAt = t;
        runtime.rockFlowState = "Sẵn sàng";
      } else {
        runtime.rockFlowState = "Tạm tắt";
        runtime.nextRockFlowAt = t;
      }
      if (runtime.settings.autoHarvestMushrooms) {
        runtime.mushroomFlowStartedAt = 0;
        runtime.nextMushroomFlowAt = t;
        runtime.mushroomFlowState = "Sẵn sàng";
      } else {
        runtime.mushroomFlowState = "Tạm tắt";
        runtime.nextMushroomFlowAt = t;
      }
      if (typeof S.cook?.isCookEnabled === "function" && S.cook.isCookEnabled()) {
        runtime.cookFlowStartedAt = 0;
        runtime.nextCookFlowAt = t;
        runtime.cookFlowState = "Sẵn sàng";
        runtime.cookCycleEndAt = 0;
        runtime.cookPhaseStartedAt = 0;
        runtime.cookLastCookStartAt = 0;
      } else {
        runtime.cookFlowState = "Tạm tắt";
        runtime.nextCookFlowAt = t;
        runtime.cookCycleEndAt = 0;
        runtime.cookPhaseStartedAt = 0;
        runtime.cookLastCookStartAt = 0;
      }
    });
  } catch (_error) {
    runtime.settings = S.normalizeSettings(S.DEFAULT_SETTINGS);
  }

  S.automation.scheduleAutomationTick();
})(window.SFL);
