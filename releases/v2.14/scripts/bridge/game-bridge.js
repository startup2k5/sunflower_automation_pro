(function (S) {
  "use strict";
  /**
   * Content-script: inject page-bridge.js (MAIN world) + postMessage SFL_GET_STATE / SFL_SEND_EVENT.
   * Logic game nằm trong scripts/bridge/page-bridge.js (copy CODE CU).
   */
  let bridgeReady = false;
  let latestBridgeState = null;
  let latestBridgeStateUpdatedAt = 0;
  let pendingBridgeEventRequests = 0;
  let bridgeStateRequestInFlight = false;
  let pendingStateTimer = null;
  const pendingStateResolvers = [];
  const pendingEventResolvers = new Map();
  let eventReqSeq = 0;
  const logFlow = S.time.logFlow;

  function applyBridgeStateData(data) {
    if (!data) return;
    latestBridgeState = data;
    latestBridgeStateUpdatedAt = Date.now();
  }

  function resolvePendingStateRequests(result) {
    bridgeStateRequestInFlight = false;
    if (pendingStateTimer) {
      clearTimeout(pendingStateTimer);
      pendingStateTimer = null;
    }
    while (pendingStateResolvers.length) {
      const resolve = pendingStateResolvers.shift();
      try {
        resolve(result);
      } catch (_e) {
        // ignore
      }
    }
  }

  function requestBridgeState() {
    return new Promise((resolve) => {
      pendingStateResolvers.push(resolve);
      if (bridgeStateRequestInFlight) return;
      bridgeStateRequestInFlight = true;
      pendingStateTimer = setTimeout(() => resolvePendingStateRequests(null), 2800);
      window.postMessage({ _sfl: true, type: "SFL_GET_STATE" }, "*");
    });
  }

  function sendBridgeEventAndWait(event, timeoutMs) {
    const ms = Math.max(1500, Math.floor(Number(timeoutMs) || 4500));
    if (pendingBridgeEventRequests >= 2) {
      return Promise.resolve({ ok: false, error: "bridge_event_backlog" });
    }
    pendingBridgeEventRequests += 1;
    const run = new Promise((resolve) => {
      const reqId = `ev_${Date.now().toString(36)}_${(++eventReqSeq).toString(36)}`;
      const timer = setTimeout(() => {
        pendingEventResolvers.delete(reqId);
        resolve({ ok: false, error: "event_timeout", state: null, stateChanged: false });
      }, ms);
      pendingEventResolvers.set(reqId, (data) => {
        clearTimeout(timer);
        const ok = data && data.ok === true && !data.error;
        resolve({
          ok,
          error: data?.error,
          state: data?.state || null,
          stateChanged: !!data?.stateChanged,
        });
      });
      window.postMessage({ _sfl: true, type: "SFL_SEND_EVENT", event, reqId }, "*");
    });
    return run
      .then(async (result) => {
        await new Promise((r) => setTimeout(r, result?.ok ? 160 : 380));
        if (result?.state) {
          applyBridgeStateData(result.state);
        } else if (!result?.ok) {
          const fresh = await requestBridgeState().catch(() => null);
          if (fresh) applyBridgeStateData(fresh);
        }
        return result;
      })
      .finally(() => {
        pendingBridgeEventRequests = Math.max(0, pendingBridgeEventRequests - 1);
      });
  }

  function handleBridgeMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data) return;
    if (data._sfl === true) {
      if (data.type === "SFL_BRIDGE_READY") {
        bridgeReady = true;
        logFlow("Bridge page (MAIN world) sẵn sàng");
        requestBridgeState().catch(() => {});
        return;
      }
      if (data.type === "SFL_STATE") {
        if (!data.error && data.data) applyBridgeStateData(data.data);
        resolvePendingStateRequests(data.error ? null : data.data || null);
        return;
      }
      if (data.type === "SFL_EVENT_RESULT") {
        if (!data.error && data.state) applyBridgeStateData(data.state);
        const reqId = data.reqId;
        if (reqId && pendingEventResolvers.has(reqId)) {
          const fn = pendingEventResolvers.get(reqId);
          pendingEventResolvers.delete(reqId);
          fn(data);
        }
        return;
      }
      if (data.type === "SFL_CAPTCHA_GRID_RESULT") {
        const reqId = data.reqId;
        if (reqId && pendingCaptchaGridResolvers.has(reqId)) {
          const fn = pendingCaptchaGridResolvers.get(reqId);
          pendingCaptchaGridResolvers.delete(reqId);
          fn(data);
        }
        return;
      }
      return;
    }
  }

  function injectBridge() {
    if (document.getElementById("sfl-ui-page-bridge")) return;
    try {
      const script = document.createElement("script");
      script.id = "sfl-ui-page-bridge";
      script.src = chrome.runtime.getURL("scripts/bridge/page-bridge.js");
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (err) {
      logFlow("Lỗi inject page-bridge", { message: String(err?.message || err) });
    }
  }

  window.addEventListener("message", handleBridgeMessage);
  
  let injectionRetries = 0;
  function safeInjectBridge() {
    if (bridgeReady) return;
    if (injectionRetries >= 5) {
      console.error("[SFL UI] Bridge injection failed after multiple attempts.");
      return;
    }
    injectionRetries += 1;
    console.log(`[SFL UI] Injecting bridge (attempt ${injectionRetries})...`);
    injectBridge();
    
    // Retry if not ready in 6 seconds
    setTimeout(() => {
      if (!bridgeReady && S.dom.isOnPlayPage()) {
        safeInjectBridge();
      }
    }, 6000);
  }

  safeInjectBridge();

  // ═══════ Captcha Grid Reader (qua MAIN world bridge) ═══════
  let pendingCaptchaGridResolvers = new Map();

  function requestCaptchaGrid(timeoutMs) {
    const ms = Math.max(500, Math.floor(Number(timeoutMs) || 2000));
    return new Promise((resolve) => {
      const reqId = `cap_${Date.now().toString(36)}_${(++eventReqSeq).toString(36)}`;
      const timer = setTimeout(() => {
        pendingCaptchaGridResolvers.delete(reqId);
        resolve(null);
      }, ms);
      pendingCaptchaGridResolvers.set(reqId, (data) => {
        clearTimeout(timer);
        resolve(data?.items || null);
      });
      window.postMessage({ _sfl: true, type: "SFL_READ_CAPTCHA_GRID", reqId }, "*");
    });
  }

  S.gameBridge = {
    inject: injectBridge,
    requestState: requestBridgeState,
    sendEvent: sendBridgeEventAndWait,
    getLatestState: () => latestBridgeState,
    requestCaptchaGrid,
    get isReady() {
      return bridgeReady;
    },
    get stateUpdatedAt() {
      return latestBridgeStateUpdatedAt;
    },
  };
})(window.SFL);
