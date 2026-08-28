const ids = {
  autoBuyTools: document.getElementById("autoBuyTools"),
  autoRestockBlacksmith: document.getElementById("autoRestockBlacksmith"),
  autoSunflowerBasic: document.getElementById("autoSunflowerBasic"),
  autoCook: document.getElementById("autoCook"),
  autoFruitTree: document.getElementById("autoFruitTree"),
  autoHoney: document.getElementById("autoHoney"),
  autoCompost: document.getElementById("autoCompost"),

  mineTargetStone: document.getElementById("mineTargetStone"),
  mineTargetIron: document.getElementById("mineTargetIron"),
  mineTargetGold: document.getElementById("mineTargetGold"),
  mineTargetCrimstone: document.getElementById("mineTargetCrimstone"),
  mineTargetSunstone: document.getElementById("mineTargetSunstone"),
  statusText: document.getElementById("statusText"),
};

function setStatus(text, tone = "neutral") {
  if (ids.statusText) ids.statusText.textContent = text;
  if (ids.statusBadge) {
    ids.statusBadge.className = "status-badge";
    if (tone === "live") {
      ids.statusBadge.textContent = "Đang chạy";
      ids.statusBadge.classList.add("live");
      return;
    }
    if (tone === "warn") {
      ids.statusBadge.textContent = "Cần kiểm tra";
      ids.statusBadge.classList.add("warn");
      return;
    }
    ids.statusBadge.textContent = "Đang tải";
  }
}

function setStatusDetails() {}



function getGameTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (!tab?.id || !tab.url) return resolve(null);
      try {
        const u = new URL(tab.url);
        const ok =
          u.protocol === "https:" &&
          (u.hostname === "sunflower-land.com" || u.hostname === "www.sunflower-land.com");
        resolve(ok ? tab : null);
      } catch {
        resolve(null);
      }
    });
  });
}

const CONTENT_SCRIPT_FILES = [
  "content.js",
  "scripts/config.js",
  "scripts/state.js",
  "scripts/utils/dom.js",
  "scripts/utils/time.js",
  "scripts/utils/flow-scheduler.js",
  "scripts/settings.js",
  "scripts/bridge/game-bridge.js",
  "scripts/flows/workbench.js",
  "scripts/flows/wood-chop.js",
  "scripts/flows/rock-mine.js",
  "scripts/flows/mushroom-harvest.js",
  "scripts/flows/cook.js",
  "scripts/flows/crop-dom.js",
  "scripts/flows/petal-collect-dom.js",
  "scripts/flows/fruit-tree.js",
  "scripts/flows/honey.js",
  "scripts/flows/compost.js",
  "scripts/flows/reset-purchase.js",
  "scripts/automation.js",
  "scripts/bootstrap.js",
];

function canRetryMissingReceiver(error) {
  const msg = String(error || "").toLowerCase();
  return msg.includes("receiving end does not exist") || msg.includes("could not establish connection");
}

function injectContentScripts(tabId) {
  return new Promise((resolve) => {
    if (!chrome.scripting?.executeScript) return resolve(false);
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: true },
        files: CONTENT_SCRIPT_FILES,
      },
      () => resolve(!chrome.runtime.lastError),
    );
  });
}

function sendRaw(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve({ ok: true, data: response });
    });
  });
}

async function send(tabId, message) {
  const first = await sendRaw(tabId, message);
  if (first.ok || !canRetryMissingReceiver(first.error)) return first;

  setStatus("Đang nạp lại script vào tab game...", "neutral");
  const injected = await injectContentScripts(tabId);
  if (!injected) return first;
  await new Promise((resolve) => setTimeout(resolve, 650));
  const second = await sendRaw(tabId, message);
  return second.ok ? second : { ...second, error: second.error || first.error };
}

function readUiSettings() {
  return {
    masterEnabled: true,
    autoBuyTools: !!ids.autoBuyTools.checked,
    autoSunflowerBasic: !!ids.autoSunflowerBasic?.checked,
    autoChop: !!ids.autoSunflowerBasic?.checked,
    autoMine: !!ids.autoSunflowerBasic?.checked,
    autoCook: !!ids.autoCook?.checked,
    autoCookFirePit: !!ids.autoCook?.checked,
    autoCookKitchen: !!ids.autoCook?.checked,
    autoCookBakery: !!ids.autoCook?.checked,
    autoCookDeli: !!ids.autoCook?.checked,
    autoCookSmoothieShack: !!ids.autoCook?.checked,
    cookPreferredRecipe: "",
    autoFruitTree: !!ids.autoFruitTree?.checked,
    autoHoney: !!ids.autoHoney?.checked,
    autoCompost: !!ids.autoCompost?.checked,
    reloadPageOnGoblinMoonCaptcha: true,
    autoFarmCropsDom: !!ids.autoSunflowerBasic?.checked,
    cropDomSeedName: "",
    cropDomSkipLongGrow: false,
    cropDomBuySeedsAtBetty: false,
    autoHarvestMushrooms: !!ids.autoSunflowerBasic?.checked,
    mushroomTargetWild: true,
    mushroomTargetMagic: true,
    mineTargetStone: !!ids.mineTargetStone?.checked,
    mineTargetIron: !!ids.mineTargetIron?.checked,
    mineTargetGold: !!ids.mineTargetGold?.checked,
    mineTargetCrimstone: !!ids.mineTargetCrimstone?.checked,
    mineTargetSunstone: !!ids.mineTargetSunstone?.checked,
  };
}

function renderSettings(settings) {
  ids.autoBuyTools.checked = !!settings.autoBuyTools;
  if (ids.autoRestockBlacksmith) ids.autoRestockBlacksmith.checked = !!settings.autoRestockBlacksmith;
  if (ids.autoSunflowerBasic) ids.autoSunflowerBasic.checked = !!settings.autoSunflowerBasic;
  if (ids.autoCook) ids.autoCook.checked = !!(settings.autoCook || settings.autoCookFirePit || settings.autoCookKitchen || settings.autoCookBakery || settings.autoCookDeli || settings.autoCookSmoothieShack);
  if (ids.autoFruitTree) ids.autoFruitTree.checked = !!settings.autoFruitTree;
  if (ids.autoHoney) ids.autoHoney.checked = !!settings.autoHoney;
  if (ids.autoCompost) ids.autoCompost.checked = !!settings.autoCompost;

  if (ids.mineTargetStone) ids.mineTargetStone.checked = settings.mineTargetStone !== false;
  if (ids.mineTargetIron) ids.mineTargetIron.checked = settings.mineTargetIron !== false;
  if (ids.mineTargetGold) ids.mineTargetGold.checked = settings.mineTargetGold !== false;
  if (ids.mineTargetCrimstone) ids.mineTargetCrimstone.checked = settings.mineTargetCrimstone !== false;
  if (ids.mineTargetSunstone) ids.mineTargetSunstone.checked = settings.mineTargetSunstone !== false;
}

async function loadSettingsFromStorage() {
  try {
    chrome.storage.local.get(["sfl_ui_only_settings"], (res) => {
      const saved = res?.sfl_ui_only_settings;
      if (saved && typeof saved === "object") {
        renderSettings(saved);
      }
    });
  } catch (_e) {}
}

async function refreshStatus(opts = {}) {
  const syncForm = !!opts.syncForm;
  if (syncForm) {
    await loadSettingsFromStorage();
  }
  const tab = await getGameTab();
  if (!tab?.id) {
    setStatus("Hãy mở sunflower-land.com/play trước.", "warn");
    setStatusDetails();
    return;
  }

  const result = await send(tab.id, { type: "SFL_UI_GET_STATUS" });
  if (!result.ok || !result.data?.ok) {
    const detail = !result.ok && result.error ? ` (${result.error})` : "";
    setStatus(`Không đọc được trạng thái${detail}. Hãy tải lại tab game.`, "warn");
    setStatusDetails();
    return;
  }

  const { settings, status } = result.data;
  if (syncForm) {
    renderSettings(settings || {});
  }
  setStatus(
    status?.busy
      ? `Status: ${status?.lastAction || "running"}.`
      : "Status: Live.",
    "live",
  );
  setStatusDetails({
    flows: status?.flows || null,
  });
}

async function saveSettingsAuto() {
  const newSettings = readUiSettings();
  
  // Lưu trực tiếp vào chrome.storage.local trước để bảo đảm không bị mất setting
  try {
    chrome.storage.local.get(["sfl_ui_only_settings"], (res) => {
      const existing = res?.sfl_ui_only_settings || {};
      const merged = Object.assign({}, existing, newSettings);
      chrome.storage.local.set({ sfl_ui_only_settings: merged });
    });
  } catch (_e) {}

  const tab = await getGameTab();
  if (!tab?.id) {
    setStatus("Đã lưu cấu hình (chưa mở tab game).", "live");
    return;
  }

  const update = await send(tab.id, {
    type: "SFL_UI_UPDATE_SETTINGS",
    settings: newSettings,
  });

  if (!update.ok || !update.data?.ok) {
    setStatus("Đã lưu cấu hình (tự tải lại tab game để áp dụng).", "live");
    return;
  }

  if (update.data.settings) {
    renderSettings(update.data.settings);
  }
  setStatus("Đã tự lưu cấu hình.", "live");
  await refreshStatus();
}

const autoSaveTargets = [
  ids.autoBuyTools,
  ids.autoRestockBlacksmith,
  ids.autoSunflowerBasic,
  ids.autoCook,
  ids.autoFruitTree,
  ids.autoHoney,
  ids.autoCompost,
  ids.mineTargetStone,
  ids.mineTargetIron,
  ids.mineTargetGold,
  ids.mineTargetSunstone,
];

for (const node of autoSaveTargets) {
  if (!node) continue;
  const ev = node.type === "number" ? "input" : "change";
  node.addEventListener(ev, () => {
    saveSettingsAuto();
  });
}

loadSettingsFromStorage();
refreshStatus({ syncForm: true });
setInterval(() => refreshStatus({ syncForm: false }), 1000);
