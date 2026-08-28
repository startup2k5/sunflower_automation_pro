(function (S) {
  "use strict";
  const base = S.DEFAULT_SETTINGS;
  S.runtime = {
    settings: Object.assign({}, base),
    busy: false,
    lastActionAt: 0,
    lastTreeActionAt: 0,
    lastAction: "idle",
    lastError: "",
    errorCount: 0,
    nextTreeFlowAt: 0,
    treeFlowStartedAt: 0,
    treeFlowState: "Tạm tắt",
    buyToolLock: false,
    buyToolQueue: [],
    /** Sau mua craft OK: chặn xếp hàng trùng cùng tool+requester (bridge/DOM chậm → tưởng vẫn thiếu). */
    postToolBuyCooldownByKey: Object.create(null),
    /** Craft disabled / thiếu tài nguyên — chặn xếp hàng chỉ cho đúng tool+requester (mine có thể thử cuốc/quặng khác). */
    craftResourceBlockedBuyUntilByKey: Object.create(null),
    /** Shop hiện Restock nhưng tắt «Restock Blacksmith» — chặn xếp hàng (không bypass dù bridge báo hết tool). */
    restockBlockedBuyUntilByKey: Object.create(null),
    /** Lần gọi tryCraftToolViaWorkbench vừa rồi có đóng shop vì Restock + !autoRestock. */
    workbenchRestockNoAutoThisTry: false,
    suppressBuyEnqueueUntil: 0,
    lastNoTreeLogAt: 0,
    lastWoodToolLogAt: 0,
    chopStickyTile: null,
    lastRockActionAt: 0,
    nextRockFlowAt: 0,
    rockFlowStartedAt: 0,
    rockFlowState: "Tạm tắt",
    lastNoRockLogAt: 0,
    lastMineScanLogAt: 0,
    lastOreToolLogAt: 0,
    mineStickyTile: null,
    nextMushroomFlowAt: 0,
    mushroomFlowStartedAt: 0,
    mushroomFlowState: "Tạm tắt",
    lastNoMushroomLogAt: 0,
    /** Sau strike mà không thấy nút Chop — đếm để ép mua rìu khi bridge vẫn báo còn rìu. */
    chopNoChopAfterStrikeStreak: 0,
    /** Luồng nấu: một chu kỳ = thu (collect) + bắt đầu nấu; chờ đến readyAt rồi mới tick lại. */
    nextCookFlowAt: 0,
    cookFlowStartedAt: 0,
    cookFlowState: "Tạm tắt",
    /** Mốc UI: lúc bot gửi recipe.cooked thành công (epoch ms). */
    cookPhaseStartedAt: 0,
    /** Mốc UI: readyAt sớm nhất trong hàng chờ nấu (epoch ms). */
    cookCycleEndAt: 0,
    /** Thời điểm gửi recipe.cooked OK (để thanh tiến trình nấu). */
    cookLastCookStartAt: 0,
    lastCropDomActionAt: 0,
    /** Chỉ số ô hạt trong danh sách mùa (mua lần lượt như chọn slot tool); reset khi đổi mùa. */
    cropDomBuyCursor: 0,
    cropDomLastSeasonKey: "",
    /** Bridge báo 0 ô trống: không quét DOM / không mở shop cho đến mốc này (tránh spam UI). */
    cropDomWhenFullPollAt: 0,
    /** Đã thấy `#SeasonSeeds` trong phiên shop hiện tại — không gọi lại `clickBuyTabIfNeeded` (tránh flicker → nhảy Sell). */
    cropDomBettyBuyPanelSeenOpen: false,
    /** > now: bỏ qua mua hạt (Betty), chỉ thu hoạch / gieo nếu còn hạt — sau khi rà soát hết không mua được hoặc hết xu. */
    cropDomSkipBuySeedsUntil: 0,
    lastPetalActionAt: 0,
    petalHarvestState: "Tạm tắt",
    /** Thời điểm nghỉ thông minh: luồng cây, đá, ruộng, hoa — chờ tài nguyên hồi phục. */
    treeFlowResumeAt: 0,
    rockFlowResumeAt: 0,
    cropFlowResumeAt: 0,
    cropFlowState: "Tạm tắt",
    petalFlowResumeAt: 0,
    /** Thời điểm chạy tới của luồng cây ăn quả. */
    nextFruitTreeFlowAt: 0,
    fruitTreeFlowStartedAt: 0,
    fruitTreeFlowState: "Tạm tắt",
    lastFruitTreeActionAt: 0,
    fruitTreeFlowResumeAt: 0,
    /** Thời điểm chạy tới của luồng tổ ong mật. */
    nextHoneyFlowAt: 0,
    honeyFlowStartedAt: 0,
    honeyFlowState: "Tạm tắt",
    honeyFlowResumeAt: 0,
    /** Thời điểm chạy tới của luồng ủ phân. */
    nextCompostFlowAt: 0,
    compostFlowStartedAt: 0,
    compostFlowState: "Tạm tắt",
    compostFlowResumeAt: 0,
    lastCompostActionAt: 0,
    /** Đồng bộ từ storage: số lần tải lại để thoát captcha Goblin/Moon. */
    captchaGoblinMoonReloadSkipCount: 0,
    /** Số lần giải captcha Goblin/Moon thành công. */
    captchaSolvedCount: 0,
    /** Số lần giải captcha Goblin/Moon thất bại. */
    captchaFailedCount: 0,
    /**
     * Cửa shop: -1 = đang mở; số > now = chờ debounce sau khi đóng (tránh nhấp nháy DOM).
     * 0 = không chặn.
     */
    _shopAutomationHold: 0,
    /** Đã chạy thành công luồng mua công cụ tự động khi khởi động trong session này chưa */
    resetPurchaseToolsDone: false,
    resetPurchaseToolsLastAttemptAt: 0,
    /** Đã chạy thành công luồng mua hạt giống tự động khi khởi động trong session này chưa */
    resetPurchaseSeedsDone: false,
    resetPurchaseSeedsLastAttemptAt: 0,
  };
  S.clearChopSticky = function clearChopSticky() {
    S.runtime.chopStickyTile = null;
  };
  S.clearMineSticky = function clearMineSticky() {
    S.runtime.mineStickyTile = null;
  };
})(window.SFL);
