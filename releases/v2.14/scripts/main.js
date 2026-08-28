import { SETTINGS_KEY, DEFAULT_SETTINGS, FLOW_INTERVAL_MS } from "./config.js";
import { runtime } from "./state.js";
import { normalizeSettings, updateSettings } from "./settings.js";
import { scheduleAutomationTick } from "./automation.js";
import { isOnPlayPage } from "./utils/dom.js";
import { now } from "./utils/time.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SFL_UI_GET_STATUS") {
    const currentTime = now();
    sendResponse({
      ok: true,
      settings: runtime.settings,
      status: {
        onPlayPage: isOnPlayPage(),
        busy: runtime.busy,
        lastAction: runtime.lastAction,
        lastError: runtime.lastError,
        errorCount: runtime.errorCount,
        lastActionAt: runtime.lastActionAt,
        nextActionInMs: Math.max(0, runtime.settings.actionGapMs - (now() - runtime.lastActionAt)),
        flows: {
          resource: {
            name: "Luồng: chặt cây (gỗ)",
            enabled: !!runtime.settings.autoChop,
            startedAt: runtime.treeFlowStartedAt || 0,
            nextAt: runtime.settings.autoChop
              ? runtime.nextTreeFlowAt || Number.MAX_SAFE_INTEGER
              : Number.MAX_SAFE_INTEGER,
            intervalMs: FLOW_INTERVAL_MS,
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
        },
      },
    });
    return;
  }

  if (message?.type === "SFL_UI_UPDATE_SETTINGS") {
    updateSettings(message.settings || {});
    sendResponse({ ok: true, settings: runtime.settings });
    return;
  }

  if (message?.type === "SFL_UI_GET_SETTINGS") {
    sendResponse({ ok: true, settings: runtime.settings });
    return;
  }
});

try {
  chrome.storage.local.get([SETTINGS_KEY], (result) => {
    runtime.settings = normalizeSettings(result?.[SETTINGS_KEY]);
    const t = now();
    if (runtime.settings.autoChop) {
      runtime.treeFlowStartedAt = 0;
      runtime.nextTreeFlowAt = t;
      runtime.treeFlowState = "Sẵn sàng";
    } else {
      runtime.treeFlowState = "Tạm tắt";
    }
  });
} catch (_error) {
  runtime.settings = normalizeSettings(DEFAULT_SETTINGS);
}

scheduleAutomationTick();
