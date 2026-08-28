(function (S) {
  "use strict";
  const runtime = S.runtime;

  /**
   * Chạy luồng mua đồ Reset 12h (Rìu + Cuốc các loại + Hạt giống gối đầu).
   */
  async function runResetPurchaseFlow() {
    runtime.busy = true;
    try {
      S.time.logFlow("Reset Purchase: Bắt đầu luồng mua đồ tự động 12h...", {});
      
      // 1. Mua tất cả công cụ (Axe + Pickaxes) bằng Batch Buy
      if (typeof S.workbench?.buyAllToolsBatch === "function") {
        await S.workbench.buyAllToolsBatch();
      } else {
        S.time.logFlow("Reset Purchase: Không tìm thấy hàm buyAllToolsBatch", {});
      }
      
      // 2. Mua tất cả hạt giống mùa hiện tại bằng event
      if (typeof S.cropDom?.buyAllPossibleSeedsViaEvent === "function") {
        await S.cropDom.buyAllPossibleSeedsViaEvent();
      } else {
        S.time.logFlow("Reset Purchase: Không tìm thấy hàm buyAllPossibleSeedsViaEvent", {});
      }
      
      S.time.logFlow("Reset Purchase: Đã hoàn thành toàn bộ luồng mua đồ 12h!", {});
      try {
        localStorage.setItem("sfl_run_reset_purchase_flow", "false");
      } catch (e) {
        // ignore
      }
    } catch (e) {
      console.error("[Reset Purchase] Error:", e);
      S.time.logFlow("Reset Purchase: Lỗi khi chạy luồng mua đồ 12h: " + e.message, {});
    } finally {
      runtime.busy = false;
    }
  }

  S.resetPurchase = { runResetPurchaseFlow };
})(window.SFL);
