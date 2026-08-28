(function (S) {
  "use strict";

  /**
   * Flow Scheduler: tính toán thời gian nghỉ thông minh cho từng luồng
   * dựa trên dữ liệu game state từ bridge.
   *
   * Thay vì dùng interval cố định (8 phút cho cây, 30 phút cho đá),
   * mỗi luồng sẽ ngủ đến khi tài nguyên sẵn sàng thu hoạch/khai thác.
   */

  const logFlow = S.time.logFlow;

  // ── Thời gian hồi phục mặc định (fallback khi bridge chưa sẵn sàng) ──
  const TREE_RECOVERY_MS = 2 * 60 * 60 * 1000; // 2 giờ
  const STONE_RECOVERY_MS = 4 * 60 * 60 * 1000; // 4 giờ
  const IRON_RECOVERY_MS = 8 * 60 * 60 * 1000; // 8 giờ
  const GOLD_RECOVERY_MS = 24 * 60 * 60 * 1000; // 24 giờ
  const CRIMSTONE_RECOVERY_MS = 24 * 60 * 60 * 1000; // 24 giờ
  const SUNSTONE_RECOVERY_MS = 3 * 24 * 60 * 60 * 1000; // 3 ngày

  // Thời gian buffer thêm sau khi tài nguyên sẵn sàng (tránh quét quá sớm)
  const BUFFER_MS = 3000;
  // Khoảng nghỉ tối thiểu (tránh spam khi bridge báo sai / chưa cập nhật)
  const MIN_REST_MS = 30 * 1000; // 30 giây
  // Khoảng nghỉ tối đa (fallback nếu không tính được)
  const MAX_REST_MS = 2 * 60 * 60 * 1000; // 2 giờ

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const p = Number(String(value).replace(/,/g, "").trim());
      return Number.isFinite(p) ? p : 0;
    }
    if (typeof value === "object") {
      if (typeof value.toNumber === "function") return Number(value.toNumber()) || 0;
      if (typeof value.toString === "function") return Number(String(value)) || 0;
    }
    return 0;
  }

  function formatDuration(ms) {
    if (ms <= 0) return "ngay bây giờ";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h${m > 0 ? m + "p" : ""}`;
    if (m > 0) return `${m}p${s > 0 ? s + "s" : ""}`;
    return `${s}s`;
  }

  /**
   * Tính thời điểm nghỉ cho luồng cây (wood chop).
   * Duyệt qua tất cả cây trong bridge state, tìm cây hồi phục sớm nhất.
   * @returns {{ nextAt: number, reason: string, allReady: boolean }}
   */
  function computeTreeRestSchedule() {
    const st = S.gameBridge?.getLatestState?.();
    const t = Date.now();
    if (!st || !Array.isArray(st.trees) || st.trees.length === 0) {
      return { nextAt: t + MIN_REST_MS, reason: "Chưa có dữ liệu cây từ bridge", allReady: false };
    }

    let readyCount = 0;
    let earliestRecovery = Infinity;

    for (let i = 0; i < st.trees.length; i += 1) {
      const tree = st.trees[i];
      const choppedAt = toNumber(tree?.choppedAt);
      if (!choppedAt || choppedAt <= 0) {
        // Cây chưa bị chặt → sẵn sàng ngay
        readyCount += 1;
        continue;
      }
      const recoversAt = choppedAt + TREE_RECOVERY_MS;
      if (recoversAt <= t) {
        readyCount += 1;
      } else {
        earliestRecovery = Math.min(earliestRecovery, recoversAt);
      }
    }

    if (readyCount > 0) {
      return { nextAt: t, reason: `Còn ${readyCount} cây sẵn sàng chặt`, allReady: true };
    }

    if (earliestRecovery < Infinity) {
      const waitMs = Math.max(MIN_REST_MS, earliestRecovery - t + BUFFER_MS);
      const clampedMs = Math.min(waitMs, MAX_REST_MS);
      return {
        nextAt: t + clampedMs,
        reason: `Cây sớm nhất hồi phục sau ${formatDuration(clampedMs)}`,
        allReady: false,
      };
    }

    return { nextAt: t + MIN_REST_MS, reason: "Không tính được thời gian hồi phục cây", allReady: false };
  }

  /**
   * Tính thời điểm nghỉ cho luồng đào đá/quặng.
   * Duyệt tất cả node đá (stone, iron, gold, crimstone, sunstone),
   * tìm node hồi phục sớm nhất trong các loại đang bật.
   * @returns {{ nextAt: number, reason: string, allReady: boolean, readyByKind: Object }}
   */
  function computeRockRestSchedule() {
    const st = S.gameBridge?.getLatestState?.();
    const t = Date.now();
    const settings = S.runtime.settings;

    if (!st) {
      return { nextAt: t + MIN_REST_MS, reason: "Chưa có dữ liệu đá từ bridge", allReady: false, readyByKind: {} };
    }

    const kinds = [
      { key: "stones", recovery: STONE_RECOVERY_MS, label: "Stone", enabled: settings.mineTargetStone !== false },
      { key: "ironRocks", recovery: IRON_RECOVERY_MS, label: "Iron", enabled: settings.mineTargetIron !== false },
      { key: "goldRocks", recovery: GOLD_RECOVERY_MS, label: "Gold", enabled: settings.mineTargetGold !== false },
      { key: "crimstones", recovery: CRIMSTONE_RECOVERY_MS, label: "Crimstone", enabled: settings.mineTargetCrimstone !== false },
      { key: "sunstones", recovery: SUNSTONE_RECOVERY_MS, label: "Sunstone", enabled: settings.mineTargetSunstone !== false },
    ];

    let totalReady = 0;
    let earliestRecovery = Infinity;
    const readyByKind = {};

    for (const kind of kinds) {
      if (!kind.enabled) continue;
      const nodes = st[kind.key];
      if (!Array.isArray(nodes)) continue;

      let kindReady = 0;
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        const minedAt = toNumber(node?.minedAt);
        if (!minedAt || minedAt <= 0) {
          kindReady += 1;
          continue;
        }
        const recoversAt = minedAt + kind.recovery;
        if (recoversAt <= t) {
          kindReady += 1;
        } else {
          earliestRecovery = Math.min(earliestRecovery, recoversAt);
        }
      }
      readyByKind[kind.label] = kindReady;
      totalReady += kindReady;
    }

    if (totalReady > 0) {
      return { nextAt: t, reason: `Còn ${totalReady} node sẵn sàng đào`, allReady: true, readyByKind };
    }

    if (earliestRecovery < Infinity) {
      const waitMs = Math.max(MIN_REST_MS, earliestRecovery - t + BUFFER_MS);
      const clampedMs = Math.min(waitMs, MAX_REST_MS);
      return {
        nextAt: t + clampedMs,
        reason: `Node sớm nhất hồi phục sau ${formatDuration(clampedMs)}`,
        allReady: false,
        readyByKind,
      };
    }

    return { nextAt: t + MIN_REST_MS, reason: "Không tính được thời gian hồi phục đá", allReady: false, readyByKind: {} };
  }

  /**
   * Tính thời điểm nghỉ cho luồng ruộng (crop).
   * Duyệt tất cả crop đang mọc, tìm cây sẵn sàng thu hoạch sớm nhất.
   * @returns {{ nextAt: number, reason: string, hasReadyCrops: boolean, hasEmptyPlots: boolean }}
   */
  function computeCropRestSchedule() {
    const st = S.gameBridge?.getLatestState?.();
    const t = Date.now();

    if (!st || !Array.isArray(st.crops) || st.crops.length === 0) {
      return { nextAt: t + MIN_REST_MS, reason: "Chưa có dữ liệu ruộng từ bridge", hasReadyCrops: false, hasEmptyPlots: false };
    }

    let readyCrops = 0;
    let emptyPlots = 0;
    let earliestReady = Infinity;

    for (let i = 0; i < st.crops.length; i += 1) {
      const crop = st.crops[i];
      const cropName = String(crop?.cropName || "").trim();
      const plantedAt = toNumber(crop?.plantedAt);
      const readyAt = toNumber(crop?.readyAt);

      if (!cropName && plantedAt <= 0) {
        emptyPlots += 1;
        continue;
      }

      if (readyAt > 0 && readyAt <= t) {
        readyCrops += 1;
      } else if (readyAt > t) {
        earliestReady = Math.min(earliestReady, readyAt);
      }
    }

    // Có ô trống → luồng cần chạy ngay (để gieo)
    const bridgeEmpty = Array.isArray(st.emptyCropPlots) ? st.emptyCropPlots.length : emptyPlots;
    if (readyCrops > 0 || bridgeEmpty > 0) {
      const reason = [];
      if (readyCrops > 0) reason.push(`${readyCrops} cây sẵn sàng thu`);
      if (bridgeEmpty > 0) reason.push(`${bridgeEmpty} ô trống`);
      return { nextAt: t, reason: reason.join(" + "), hasReadyCrops: readyCrops > 0, hasEmptyPlots: bridgeEmpty > 0 };
    }

    if (earliestReady < Infinity) {
      const waitMs = Math.max(MIN_REST_MS, earliestReady - t + BUFFER_MS);
      const clampedMs = Math.min(waitMs, MAX_REST_MS);
      return {
        nextAt: t + clampedMs,
        reason: `Cây sớm nhất chín sau ${formatDuration(clampedMs)}`,
        hasReadyCrops: false,
        hasEmptyPlots: false,
      };
    }

    return { nextAt: t + MIN_REST_MS, reason: "Không tính được thời gian chín cây", hasReadyCrops: false, hasEmptyPlots: false };
  }

  /**
   * Tính thời điểm nghỉ cho luồng hoa/quả (petal).
   * Sử dụng dữ liệu fruitPatches từ bridge.
   * @returns {{ nextAt: number, reason: string, hasReady: boolean }}
   */
  function computePetalRestSchedule() {
    const st = S.gameBridge?.getLatestState?.();
    const t = Date.now();

    if (!st) {
      return { nextAt: t + MIN_REST_MS, reason: "Chưa có dữ liệu từ bridge", hasReady: false };
    }

    const patches = st.fruitPatches;
    if (!Array.isArray(patches) || patches.length === 0) {
      // Không có fruit patch → dùng khoảng nghỉ ngắn (vẫn quét DOM cho hoa/ong)
      return { nextAt: t + 60 * 1000, reason: "Không có fruit patch, quét DOM cho hoa/ong", hasReady: false };
    }

    let ready = 0;
    let earliestReady = Infinity;

    for (let i = 0; i < patches.length; i += 1) {
      const fruit = patches[i]?.fruit;
      if (!fruit || !fruit.name) continue;
      const harvestsLeft = toNumber(fruit.harvestsLeft);
      if (harvestsLeft <= 0) continue;
      const harvestedAt = toNumber(fruit.harvestedAt);
      const plantedAt = toNumber(fruit.plantedAt);
      // Quả có thể thu ngay nếu chưa thu lần nào hoặc đã đủ thời gian
      if (!harvestedAt || harvestedAt <= 0) {
        ready += 1;
      } else {
        // Thời gian hồi phục quả thường khoảng 4-12h tùy loại
        // Không có readyAt cụ thể trong bridge → fallback kiểm tra DOM
        ready += 1; // Để DOM quyết định
      }
    }

    if (ready > 0) {
      return { nextAt: t, reason: `${ready} quả/hoa có thể kiểm tra`, hasReady: true };
    }

    return { nextAt: t + 5 * 60 * 1000, reason: "Chưa có quả sẵn sàng", hasReady: false };
  }

  S.flowScheduler = {
    computeTreeRestSchedule,
    computeRockRestSchedule,
    computeCropRestSchedule,
    computePetalRestSchedule,
    formatDuration,
    // Các hằng số export để automation.js dùng
    MIN_REST_MS,
    MAX_REST_MS,
    BUFFER_MS,
  };
})(window.SFL);
