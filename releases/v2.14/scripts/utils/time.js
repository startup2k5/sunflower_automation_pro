(function (S) {
  "use strict";
  const t = {};

  t.now = function now() {
    return Date.now();
  };

  t.sleep = function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  t.rand = function rand(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  };

  t.logFlow = function logFlow(message, detail) {
    console.log("[SFL · Luồng]", message, ...(detail !== undefined ? [detail] : []));
  };

  t.uiJitter = function uiJitter() {
    return t.sleep(t.rand(S.runtime.settings.uiDelayMinMs, S.runtime.settings.uiDelayMaxMs));
  };

  S.time = t;
})(window.SFL);
