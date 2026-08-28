// ═══════════════════════════════════════════════════════════════════
// KHỞI TẠO KHÔNG GIAN TÊN SFL, CẤU HÌNH & GAME BRIDGE CLIENT (content.js)
// ═══════════════════════════════════════════════════════════════════
window.SFL = window.SFL || {};

(function (S) {
  "use strict";

  // Cấu hình từ Popup UI
  S.cauHinh = S.cauHinh || { masterBat: true };
  S.khoDo = null; // Khởi tạo rỗng để bắt buộc mở hòm đồ quét thực tế
  S.thoiGianQuetKhoCuoi = 0;

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
    if (S.gameState && S.gameState.season) {
      return normalizeSeasonName(S.gameState.season);
    }
    return normalizeSeasonName(S.gameSeason || "spring");
  }
  S.getGameSeason = getGameSeason;

  // Inject script page-bridge vào MAIN world
  function injectBridge() {
    if (document.getElementById("sfl-page-bridge")) return;
    try {
      const script = document.createElement("script");
      script.id = "sfl-page-bridge";
      script.src = chrome.runtime.getURL("scripts/bridge/page-bridge.js");
      script.onload = () => script.remove();
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

  // Lắng nghe message từ page-bridge.js
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data._sfl !== true) return;

    if (data.type === "SFL_BRIDGE_READY") {
      S.bridgeReady = true;
      console.log("%c[SFL Bridge] 🌉 Game Bridge (MAIN world) đã sẵn sàng kết nối!", "color: #00bcd4; font-weight: bold;");
      requestBridgeState().catch(() => {});
      return;
    }

    if (data.type === "SFL_STATE") {
      if (!data.error && data.data) {
        S.gameState = data.data;
        S.gameBridgeUpdatedAt = Date.now();
        if (data.data.season) {
          S.gameSeason = normalizeSeasonName(data.data.season);
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

  // Khôi phục cấu hình từ chrome.storage
  try {
    chrome.storage.local.get(["sfl_ui_settings"], (res) => {
      if (res && res.sfl_ui_settings) {
        S.cauHinh = { ...S.cauHinh, ...res.sfl_ui_settings };
      }
    });

    // Lắng nghe thay đổi từ Popup UI real-time
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        if (changes.sfl_ui_settings && changes.sfl_ui_settings.newValue) {
          S.cauHinh = { ...S.cauHinh, ...changes.sfl_ui_settings.newValue };
        }
      }
    });
  } catch (_e) {}

})(window.SFL);
