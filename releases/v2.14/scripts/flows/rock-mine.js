(function (S) {
  "use strict";
  /**
   * Luồng đào đá — hybrid: bridge (thứ tự Stone→Iron→Gold→Crimstone→Sunstone, id node, cooldown)
   * + DOM (click tile + strike + nút Mine). Cần page-bridge + game-bridge.
   */
  const runtime = S.runtime;
  const logFlow = S.time.logFlow;
  const now = S.time.now;
  const sleep = S.time.sleep;
  const rand = S.time.rand;
  const uiJitter = S.time.uiJitter;
  const d = S.dom;

  const KIND_IMG_HINTS = {
    Stone: ["stone_small", "game-assets/resources/stone", "stone_rock", "l2_stone", "fused_stone", "reinforced_stone"],
    Iron: ["iron_small", "iron_rock", "l2_iron", "refined_iron", "tempered_iron"],
    Gold: ["gold_small", "gold_rock", "l2_gold", "pure_gold", "prime_gold"],
    Crimstone: ["crimstone", "crimstone_rock"],
    Sunstone: ["sunstone", "sunstone_rock"],
  };

  const STONE_RECOVERY_MS = 4 * 60 * 60 * 1000;
  const IRON_RECOVERY_MS = 8 * 60 * 60 * 1000;
  const GOLD_RECOVERY_MS = 24 * 60 * 60 * 1000;
  const CRIMSTONE_RECOVERY_MS = 24 * 60 * 60 * 1000;
  const SUNSTONE_RECOVERY_MS = 3 * 24 * 60 * 60 * 1000;

  const PICKAXE_FLOW_ORDER = [
    { kind: "Stone", eventType: "stoneRock.mined", toolName: "Pickaxe" },
    { kind: "Iron", eventType: "ironRock.mined", toolName: "Stone Pickaxe" },
    { kind: "Gold", eventType: "goldRock.mined", toolName: "Iron Pickaxe" },
    { kind: "Crimstone", eventType: "crimstoneRock.mined", toolName: "Gold Pickaxe" },
    { kind: "Sunstone", eventType: "sunstoneRock.mined", toolName: "Gold Pickaxe" },
  ];

  const TOOL_TO_WORKBENCH = {
    Pickaxe: "wood_pickaxe",
    "Stone Pickaxe": "stone_pickaxe",
    "Iron Pickaxe": "iron_pickaxe",
    "Gold Pickaxe": "gold_pickaxe",
  };

  function workbenchIdForOreKind(kind) {
    const entry = PICKAXE_FLOW_ORDER.find((e) => e.kind === kind);
    if (!entry) return null;
    return TOOL_TO_WORKBENCH[entry.toolName] || "wood_pickaxe";
  }

  function isMineCraftBlockedForWorkbench(wbId) {
    if (!wbId) return false;
    const ck = `${wbId}:mine`;
    const until = runtime.craftResourceBlockedBuyUntilByKey?.[ck];
    return typeof until === "number" && now() < until;
  }

  /** Loại quặng đang khoá cần craft cuốc đang bị chặn thiếu tài nguyên → ưu tiên loại khác (nếu có). */
  function pivotMineKindIfCraftBlockedForLock(readyAll) {
    if (!mineLockedKind) return;
    const wb = workbenchIdForOreKind(mineLockedKind);
    if (!wb || !isMineCraftBlockedForWorkbench(wb)) return;
    const alt = PICKAXE_FLOW_ORDER.find((entry) => {
      if (!isOreTypeEnabled(entry.kind)) return false;
      if (mineSkippedKindsThisSession.has(entry.kind)) return false;
      if ((readyAll.stats?.[entry.kind]?.coTheDao || 0) <= 0) return false;
      const w = TOOL_TO_WORKBENCH[entry.toolName] || "wood_pickaxe";
      return !isMineCraftBlockedForWorkbench(w);
    });
    const was = mineLockedKind;
    if (alt) {
      logFlow("Đào đá: craft cuốc cho loại đang ưu tiên bị chặn (thiếu tài nguyên) — chuyển sang loại khác", {
        tu: was,
        sang: alt.kind,
        workbenchId: wb,
      });
      mineLockedKind = alt.kind;
    } else {
      logFlow("Đào đá: không còn loại node nào khác ngoài tier đang chặn craft — nhả khoá ưu tiên", {
        lockedWas: was,
        workbenchId: wb,
      });
      mineLockedKind = null;
    }
    S.clearMineSticky();
  }

  const sessionMineCooldownUntil = new Map();
  const mineSkippedKindsThisSession = new Set();
  const flowCooldowns = new Map();
  let mineFlowPending = false;
  let mineLockedKind = null;

  function inCooldown(key, ms) {
    const until = flowCooldowns.get(key) || 0;
    return Date.now() < until;
  }
  function markCooldown(key, ms) {
    flowCooldowns.set(key, Date.now() + Math.max(0, ms));
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const p = Number(String(value).replace(/,/g, "").trim());
      return Number.isFinite(p) ? p : 0;
    }
    if (typeof value === "object") {
      if (typeof value.toNumber === "function") {
        const p = Number(value.toNumber());
        return Number.isFinite(p) ? p : 0;
      }
      if (typeof value.toString === "function") {
        const p = Number(String(value));
        return Number.isFinite(p) ? p : 0;
      }
    }
    return 0;
  }

  function isOreTypeEnabled(oreKind) {
    const s = runtime.settings;
    if (oreKind === "Stone") return s.mineTargetStone !== false;
    if (oreKind === "Iron") return s.mineTargetIron !== false;
    if (oreKind === "Gold") return s.mineTargetGold !== false;
    if (oreKind === "Crimstone") return s.mineTargetCrimstone !== false;
    if (oreKind === "Sunstone") return s.mineTargetSunstone !== false;
    return true;
  }

  function getBridgeState() {
    return S.gameBridge?.getLatestState?.() || null;
  }

  function getPreferredInventory() {
    const b = getBridgeState();
    if (b?.inventory && typeof b.inventory === "object") return b.inventory;
    return {};
  }

  function getToolCount(toolName) {
    return toNumber(getPreferredInventory()?.[toolName]);
  }

  function getTotalPickaxesCount() {
    const inv = getPreferredInventory();
    let total = 0;
    Object.entries(inv).forEach(([name, value]) => {
      if (!/pickaxe/i.test(name)) return;
      total += toNumber(value) || 0;
    });
    return total;
  }

  function getPickaxeBreakdown() {
    const inv = getPreferredInventory();
    const breakdown = {};
    Object.entries(inv).forEach(([name, value]) => {
      if (!/pickaxe/i.test(name)) return;
      breakdown[name] = toNumber(value) || 0;
    });
    return breakdown;
  }

  function cleanupSessionMineCooldowns() {
    const t = Date.now();
    for (const [k, until] of sessionMineCooldownUntil.entries()) {
      if (until <= t) sessionMineCooldownUntil.delete(k);
    }
  }

  function markNodeMinedInSession(nodeKey, recoveryMs) {
    if (!nodeKey) return;
    sessionMineCooldownUntil.set(String(nodeKey), Date.now() + Math.max(0, recoveryMs));
  }

  function isNodeReady(minedAt, recoveryMs) {
    const minedAtNum = toNumber(minedAt);
    if (!minedAtNum) return true;
    return Date.now() >= minedAtNum + recoveryMs;
  }

  function getReadyMineJobsFromBridgeState() {
    cleanupSessionMineCooldowns();
    const jobs = [];
    const state = getBridgeState() || {};
    const stats = {
      Stone: { tongNode: 0, coTheDao: 0, dangHoi: 0, dangKhoaPhien: 0, requiredHits: 0 },
      Iron: { tongNode: 0, coTheDao: 0, dangHoi: 0, dangKhoaPhien: 0, requiredHits: 0 },
      Gold: { tongNode: 0, coTheDao: 0, dangHoi: 0, dangKhoaPhien: 0, requiredHits: 0 },
      Crimstone: { tongNode: 0, coTheDao: 0, dangHoi: 0, dangKhoaPhien: 0, requiredHits: 0 },
      Sunstone: { tongNode: 0, coTheDao: 0, dangHoi: 0, dangKhoaPhien: 0, requiredHits: 0 },
    };

    const addJobs = (nodes, eventType, recoveryMs, kind) => {
      for (const node of nodes || []) {
        const id = String(node?.id ?? "");
        if (!id) continue;
        if (!stats[kind]) continue;
        stats[kind].tongNode += 1;
        const nodeKey = `${eventType}:${id}`;
        const blockedUntil = sessionMineCooldownUntil.get(nodeKey) || 0;
        if (blockedUntil > Date.now()) {
          stats[kind].dangKhoaPhien += 1;
          continue;
        }
        const multiplier = Math.max(1, Math.floor(toNumber(node?.multiplier) || 1));
        if (!isNodeReady(node?.minedAt, recoveryMs)) {
          stats[kind].dangHoi += 1;
          continue;
        }
        stats[kind].coTheDao += 1;
        stats[kind].requiredHits = (stats[kind].requiredHits || 0) + multiplier;
        jobs.push({ kind, id, nodeKey, eventType, recoveryMs, multiplier });
      }
    };

    addJobs(state.stones, "stoneRock.mined", STONE_RECOVERY_MS, "Stone");
    addJobs(state.ironRocks, "ironRock.mined", IRON_RECOVERY_MS, "Iron");
    addJobs(state.goldRocks, "goldRock.mined", GOLD_RECOVERY_MS, "Gold");
    addJobs(state.crimstones, "crimstoneRock.mined", CRIMSTONE_RECOVERY_MS, "Crimstone");
    addJobs(state.sunstones, "sunstoneRock.mined", SUNSTONE_RECOVERY_MS, "Sunstone");

    const tongNode = Object.values(stats).reduce((sum, item) => sum + (item.tongNode || 0), 0);
    const coTheDao = Object.values(stats).reduce((sum, item) => sum + (item.coTheDao || 0), 0);
    const dangHoi = Object.values(stats).reduce((sum, item) => sum + (item.dangHoi || 0), 0);
    const dangKhoaPhien = Object.values(stats).reduce((sum, item) => sum + (item.dangKhoaPhien || 0), 0);
    const requiredHits = Object.values(stats).reduce((sum, item) => sum + (item.requiredHits || 0), 0);
    const requiredHitsByType = Object.fromEntries(
      Object.entries(stats).map(([kind, item]) => [kind, item.requiredHits || 0]),
    );

    return {
      jobs,
      stats,
      summary: { tongNode, coTheDao, dangHoi, dangKhoaPhien, requiredHits, requiredHitsByType },
    };
  }

  function getMineableRockJobsFromBridgeState() {
    const mineData = getReadyMineJobsFromBridgeState();
    const inventory = getPreferredInventory();
    let woodPickaxe = Math.floor(toNumber(inventory.Pickaxe) || 0);
    let stonePickaxe = Math.floor(toNumber(inventory["Stone Pickaxe"]) || 0);
    let ironPickaxe = Math.floor(toNumber(inventory["Iron Pickaxe"]) || 0);
    let goldPickaxe = Math.floor(toNumber(inventory["Gold Pickaxe"]) || 0);
    const jobs = [];

    /**
     * multiplier trên node = số tap/health ô đá, KHÔNG phải số cuốc tiêu hụt.
     * Có ≥1 cuốc đúng tier là có thể thử mọi node loại đó (DOM/bridge xử lý tap).
     */
    const canMineWithTool = (job) => {
      if (job.eventType === "stoneRock.mined") return woodPickaxe >= 1;
      if (job.eventType === "ironRock.mined") return stonePickaxe >= 1;
      if (job.eventType === "goldRock.mined") return ironPickaxe >= 1;
      if (job.eventType === "crimstoneRock.mined" || job.eventType === "sunstoneRock.mined") return goldPickaxe >= 1;
      return false;
    };

    for (const job of mineData.jobs) {
      if (canMineWithTool(job)) jobs.push(job);
    }
    const priority = new Map(PICKAXE_FLOW_ORDER.map((entry, index) => [entry.eventType, index]));
    jobs.sort((a, b) => (priority.get(a.eventType) ?? 99) - (priority.get(b.eventType) ?? 99));
    return { jobs, summary: mineData.summary, stats: mineData.stats };
  }

  /**
   * need = có node đào được (coTheDao) mà chưa có ≥1 cuốc tier đó — không nhầm với tổng tap (requiredHits).
   */
  function getPickaxeDemandSnapshot(mineState) {
    const full = mineState?.summary && mineState?.stats ? mineState : getReadyMineJobsFromBridgeState();
    const byKind = full.stats || {};
    const snapshot = {};
    for (const entry of PICKAXE_FLOW_ORDER) {
      const st = byKind[entry.kind] || {};
      const coTheDao = Math.max(0, Math.floor(st.coTheDao || 0));
      const tongNode = Math.max(0, Math.floor(st.tongNode || 0));
      const dangHoi = Math.max(0, Math.floor(st.dangHoi || 0));
      const tapCanTrenNode_theoBridge = Math.max(0, Math.floor(st.requiredHits || 0));
      const have = getToolCount(entry.toolName);
      const need = coTheDao > 0 && have < 1 ? 1 : 0;
      snapshot[entry.kind] = {
        kind: entry.kind,
        eventType: entry.eventType,
        toolName: entry.toolName,
        tongNode,
        coTheDao,
        dangHoi,
        tapCanTrenNode_theoBridge,
        have,
        need,
      };
    }
    return snapshot;
  }

  function formatPickaxeDemandSummary(pickaxeDemand) {
    return PICKAXE_FLOW_ORDER.map((entry) => {
      const row = pickaxeDemand?.[entry.kind] || {};
      return {
        kind: entry.kind,
        toolName: entry.toolName,
        tongNode: row.tongNode ?? 0,
        coTheDao: row.coTheDao ?? 0,
        dangHoi: row.dangHoi ?? 0,
        tapCanTrenNode_theoBridge: row.tapCanTrenNode_theoBridge ?? 0,
        have: row.have || 0,
        need: row.need ?? 0,
      };
    });
  }

  function resourceTileContainsRecoversIn(el) {
    const tile = el?.closest(".relative.w-full.h-full");
    if (!tile) return false;
    return d.textOf(tile).includes("recovers in");
  }

  /** Ô map hoặc chính layer click (đá: div.absolute.cursor-pointer bọc img pointer-events-none). */
  function mineStrikeContextTile(clickable) {
    return clickable?.closest?.(".relative.w-full.h-full") || clickable;
  }

  function mineStickyAnchor(clickable) {
    return clickable?.closest?.(".relative.w-full.h-full") || clickable;
  }

  function rockTileLooksDepleted(tile) {
    if (!tile || !tile.isConnected) return false;
    if (resourceTileContainsRecoversIn(tile)) return true;
    const highlight =
      tile.matches?.(".cursor-pointer.hover\\:img-highlight") || tile.matches?.("[class*='cursor-pointer'][class*='img-highlight']")
        ? tile
        : tile.querySelector(".cursor-pointer.hover\\:img-highlight");
    if (highlight && d.isVisible(highlight)) return false;
    return true;
  }

  function rockTileDefinitelyDone(tile) {
    if (!tile || !tile.isConnected) return false;
    if (resourceTileContainsRecoversIn(tile)) return true;
    return d.textOf(tile).includes("recovers in");
  }

  function sortDomMineOrder(a, b) {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > 8) return ra.top - rb.top;
    return ra.left - rb.left;
  }

  function rectSummary(el) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function tileLooksLikeTree(tile) {
    if (!tile) return false;
    return !!tile.querySelector(
      "img[src*='resources/tree'],img[src*='/tree/'],img[src*='stump'],img[src*='resources/stump']",
    );
  }

  /**
   * Đúng markup game: div.absolute.cursor-pointer.hover:img-highlight > img.pointer-events-none (click vào div).
   */
  function addRockTargetsFromHighlightDivs(doc, hints, targets, seen) {
    let divs;
    try {
      divs = doc.querySelectorAll("div.cursor-pointer.hover\\:img-highlight");
    } catch (_e) {
      return;
    }
    for (let i = 0; i < divs.length; i += 1) {
      const clickable = divs[i];
      if (seen.has(clickable)) continue;
      if (!d.isVisible(clickable) || !d.isClickablePointerEventsOk(clickable)) continue;
      if (!d.isInViewportLoose(clickable, 520)) continue;
      const imgs = clickable.querySelectorAll("img[src], img[srcset]");
      let match = false;
      for (let j = 0; j < imgs.length; j += 1) {
        const img = imgs[j];
        const src = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
        if (!src) continue;
        if (src.includes("wood_mine_icon")) continue;
        if (hints.some((h) => src.includes(h))) {
          match = true;
          break;
        }
      }
      if (!match) continue;
      const mapTile = clickable.closest(".relative.w-full.h-full");
      if (mapTile) {
        if (tileLooksLikeTree(mapTile)) continue;
        if (resourceTileContainsRecoversIn(mapTile)) continue;
      }
      seen.add(clickable);
      targets.push(clickable);
    }
  }

  /**
   * Quét từng ô map (.relative.w-full.h-full) + div highlight toàn doc (ảnh đá thường pointer-events-none).
   */
  function getDomRockTargetsForKind(kind) {
    const hints = KIND_IMG_HINTS[kind];
    if (!hints || !hints.length) return [];
    const docs = d.collectDocumentsForGameDom();
    const targets = [];
    const seen = new Set();
    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      addRockTargetsFromHighlightDivs(doc, hints, targets, seen);
      let tiles;
      try {
        tiles = doc.querySelectorAll(".relative.w-full.h-full");
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < tiles.length; i += 1) {
        const tile = tiles[i];
        if (tileLooksLikeTree(tile)) continue;
        if (resourceTileContainsRecoversIn(tile)) continue;
        const clickable =
          tile.querySelector(".cursor-pointer.hover\\:img-highlight") ||
          tile.querySelector(".cursor-pointer[class*='img-highlight']");
        if (!clickable) continue;
        if (!d.isVisible(clickable) || !d.isClickablePointerEventsOk(clickable)) continue;
        // Margin lớn hơn để ghép nhiều ô đá trên cùng màn (bridge coTheDao > số ô «sát» viewport).
        if (!d.isInViewportLoose(clickable, 960)) continue;
        let match = false;
        const imgs = tile.querySelectorAll("img[src], img[srcset]");
        for (let j = 0; j < imgs.length; j += 1) {
          const img = imgs[j];
          const src = String(img.currentSrc || img.getAttribute("src") || "").toLowerCase();
          if (!src) continue;
          if (src.includes("wood_mine_icon")) continue;
          if (hints.some((h) => src.includes(h))) {
            match = true;
            break;
          }
        }
        if (!match) continue;
        if (seen.has(clickable)) continue;
        seen.add(clickable);
        targets.push(clickable);
      }
    }
    targets.sort((a, b) => d.centerDistance(a) - d.centerDistance(b));
    return targets;
  }

  function pairJobsToDomClickables(jobs, domTargets) {
    const sortedJobs = jobs.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const sortedDom = domTargets.slice().sort(sortDomMineOrder);
    const out = [];
    const n = Math.min(sortedJobs.length, sortedDom.length);
    for (let i = 0; i < n; i += 1) {
      out.push({ job: sortedJobs[i], clickable: sortedDom[i] });
    }
    return out;
  }

  function finalizeMineStickyIfRockDone(clickable) {
    const tile = mineStrikeContextTile(clickable);
    if (tile && rockTileDefinitelyDone(tile)) {
      runtime.mineStickyTile = null;
    }
  }

  function resolveMineTargetPair(paired) {
    if (!paired.length) return null;
    const sticky = runtime.mineStickyTile;
    if (sticky && sticky.isConnected) {
      if (rockTileDefinitelyDone(sticky)) {
        S.clearMineSticky();
      } else {
        const onSticky = paired.find((p) => mineStickyAnchor(p.clickable) === sticky);
        if (onSticky) return onSticky;
        S.clearMineSticky();
      }
    }
    const pick = paired[0];
    runtime.mineStickyTile = mineStickyAnchor(pick.clickable);
    return pick;
  }

  async function waitBetweenMineStrikes() {
    await sleep(rand(240, 480));
  }

  async function performMineStrikes(clickable, maxStrikes, isDepletedTile) {
    let done = 0;
    let el = clickable;
    for (let i = 0; i < maxStrikes; i += 1) {
      const tile = mineStrikeContextTile(el);
      if (tile && isDepletedTile(tile)) break;
      const next =
        tile?.matches?.(".cursor-pointer.hover\\:img-highlight") || tile?.matches?.("[class*='img-highlight']")
          ? tile
          : tile?.querySelector(".cursor-pointer.hover\\:img-highlight");
      if (next && d.isVisible(next)) el = next;
      if (!el || !d.isVisible(el)) break;
      if (!d.clickAtCenter(el)) break;
      done += 1;
      await sleep(rand(90, 200));
      await waitBetweenMineStrikes();
      await sleep(rand(40, 110));
      if (tile && isDepletedTile(tile)) break;
    }
    return done;
  }

  function mineSingleRockOpen(clickable) {
    if (!clickable) return false;
    clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    setTimeout(() => {
      clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, 95);
    setTimeout(() => {
      clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, 190);
    return true;
  }

  /**
   * SFL Stone/Iron/Gold: click đủ lần (thường 3) thì game gọi mine() ngay — không có nút "Mine" như cây (Chop).
   * @returns {{ worked: boolean, mined: boolean }}
   */
  async function performDomMineRound(clickable, job) {
    if (!clickable) return { worked: false, mined: false };
    const tLog = now();
    if (tLog - runtime.lastOreToolLogAt > 12000) {
      runtime.lastOreToolLogAt = tLog;
      logFlow("Đào đá — DOM + bridge (node)", {
        ...S.ROCK_ORE_LOG,
        kind: job?.kind,
        id: job?.id,
      });
    }

    if (runtime.settings.strikeLearnAutoMine && !runtime.settings.mineStrikesLearned) {
      const learnedHits = await performMineStrikes(clickable, S.STRIKE_COUNT_MAX, rockTileLooksDepleted);
      if (learnedHits >= 1) runtime.settings.mineStrikes = learnedHits;
      runtime.settings.mineStrikesLearned = true;
      S.saveSettings();
      logFlow("Học/lưu số strike đá", { learnedHits, saved: runtime.settings.mineStrikes });
      finalizeMineStickyIfRockDone(clickable);
      return { worked: learnedHits >= 1, mined: false };
    }

    const needed = S.clampStrikeCount(runtime.settings.mineStrikes);
    const targetTileBefore = mineStrikeContextTile(clickable);
    const strikesDone = await performMineStrikes(clickable, needed, rockTileLooksDepleted);
    if (strikesDone > 0) {
      await sleep(rand(100, 260));
      const tileNow = targetTileBefore?.isConnected ? targetTileBefore : mineStrikeContextTile(clickable);
      const rockDone = tileNow ? rockTileDefinitelyDone(tileNow) : false;
      if (rockDone) {
        logFlow("Đào đá: đủ tap (game tự khai thác sau click cuối — không có nút Mine)", {
          kind: job?.kind,
          id: job?.id,
          strikes: strikesDone,
          need: needed,
          rockDone,
        });
        finalizeMineStickyIfRockDone(clickable);
        return { worked: true, mined: true };
      }
      const maybeDepleted = tileNow ? rockTileLooksDepleted(tileNow) : false;
      if (maybeDepleted) {
        logFlow("Dao da: DOM dang doi trang thai sau tap - chua khoa node, se thu tiep tick sau", {
          kind: job?.kind,
          id: job?.id,
          strikes: strikesDone,
          need: needed,
        });
        return { worked: true, mined: false };
      }
      const mineAfter = d.findMineActionButton();
      if (mineAfter && d.nativeClickClose(mineAfter)) {
        await uiJitter();
        finalizeMineStickyIfRockDone(clickable);
        return { worked: true, mined: true };
      }
      if (strikesDone >= needed) {
        logFlow("Đào đá: đã tap đủ lần nhưng node chưa depleted — thường là hết cuốc / game từ chối (không coi là đã đào)", {
          kind: job?.kind,
          id: job?.id,
          strikes: strikesDone,
          need: needed,
          rockDone,
        });
        return { worked: true, mined: false };
      }
      logFlow("Đào đá: chưa đủ tap hoặc node chưa đổi trạng thái", {
        strikesDone,
        needed,
        kind: job?.kind,
        id: job?.id,
      });
      return { worked: true, mined: false };
    }

    if (mineSingleRockOpen(clickable)) {
      await uiJitter();
      await sleep(rand(120, 280));
      const tileAfter = mineStrikeContextTile(clickable);
      if (tileAfter && rockTileDefinitelyDone(tileAfter)) {
        finalizeMineStickyIfRockDone(clickable);
        return { worked: true, mined: true };
      }
    }

    d.clickAtCenter(clickable);
    await uiJitter();

    return { worked: false, mined: false };
  }

  async function tryBridgeMineJob(job) {
    if (!job?.eventType || job.id === undefined || job.id === null) return false;
    const result = await S.gameBridge.sendEvent({ type: job.eventType, index: String(job.id) }, 6000);
    if (result?.ok) {
      logFlow("Đào đá: bridge sendEvent (fallback khi DOM lỗi)", {
        id: job.id,
        eventType: job.eventType,
        kind: job.kind,
      });
      return true;
    }
    const errText = String(result?.error || "");
    if (/not\s+placed|not\s+found|does\s+not\s+exist|invalid\s+node/i.test(errText)) {
      markNodeMinedInSession(job.nodeKey, 5 * 60 * 1000);
      if (mineLockedKind === job.kind) {
        mineLockedKind = null;
        S.clearMineSticky();
      }
      logFlow("Đào đá: bridge báo node không hợp lệ — khóa tạm node và nhường luồng khác", { job, error: result?.error });
      return false;
    }
    logFlow("Đào đá: bridge sendEvent thất bại", { job, error: result?.error });
    return false;
  }

  function refreshMineDomRegistry(readyAll) {
    const byKind = {};
    for (let ki = 0; ki < PICKAXE_FLOW_ORDER.length; ki += 1) {
      const kind = PICKAXE_FLOW_ORDER[ki].kind;
      if (!isOreTypeEnabled(kind)) continue;
      const jobs = readyAll.jobs
        .filter((j) => j.kind === kind)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const doms = getDomRockTargetsForKind(kind).sort(sortDomMineOrder);
      const n = Math.min(jobs.length, doms.length);
      const entries = [];
      for (let i = 0; i < jobs.length; i += 1) {
        entries.push({
          id: jobs[i].id,
          nodeKey: jobs[i].nodeKey,
          domRect: i < n ? rectSummary(doms[i]) : null,
        });
      }
      byKind[kind] = entries;
    }
    runtime.mineDomRegistry = { updatedAt: Date.now(), byKind, stats: readyAll.stats };
  }

  function advanceLockedKindForToolGap(readyAll, toolData) {
    if (!mineLockedKind) return;
    if (runtime.mineLastDomProgressAt && now() - runtime.mineLastDomProgressAt < 15000) return;
    if ((readyAll.stats?.[mineLockedKind]?.coTheDao || 0) <= 0) return;
    const hasToolForLocked = toolData.jobs.some((j) => j.kind === mineLockedKind);
    if (hasToolForLocked) return;
    const next = PICKAXE_FLOW_ORDER.find(
      (entry) =>
        isOreTypeEnabled(entry.kind) &&
        !mineSkippedKindsThisSession.has(entry.kind) &&
        entry.kind !== mineLockedKind &&
        (readyAll.stats?.[entry.kind]?.coTheDao || 0) > 0 &&
        toolData.jobs.some((j) => j.kind === entry.kind),
    );
    if (next) {
      logFlow("Đào đá: bridge thiếu cuốc cho loại hiện tại — chuyển sang loại có cuốc", {
        tu: mineLockedKind,
        sang: next.kind,
      });
      mineLockedKind = next.kind;
      S.clearMineSticky();
    }
  }

  async function ensureFreshState() {
    const st = getBridgeState();
    const age = S.gameBridge?.stateUpdatedAt ? now() - S.gameBridge.stateUpdatedAt : 1e9;
    if (!st || age > 5000) {
      await S.gameBridge.requestState().catch(() => null);
    }
  }

  async function tryAutoMine() {
    if (!runtime.settings.autoMine) {
      mineFlowPending = false;
      mineLockedKind = null;
      return false;
    }

    if (!S.gameBridge) {
      logFlow("Đào đá: chưa có gameBridge");
      return false;
    }

    await ensureFreshState();

    if (S.gameBridge.isReady && !inCooldown("bridge:state-sync-mine", 7000)) {
      markCooldown("bridge:state-sync-mine", 7000);
      S.gameBridge.requestState().catch(() => {});
    }

    const st = getBridgeState();
    if (!st) {
      return false;
    }

    const pickaxes = getTotalPickaxesCount();
    const readyAll = getReadyMineJobsFromBridgeState();
    const toolData = getMineableRockJobsFromBridgeState();

    const preferredMineKind =
      PICKAXE_FLOW_ORDER.find(
        (entry) =>
          isOreTypeEnabled(entry.kind) &&
          !mineSkippedKindsThisSession.has(entry.kind) &&
          (readyAll.stats?.[entry.kind]?.coTheDao || 0) > 0,
      )?.kind || null;

    if (mineLockedKind && (readyAll.stats?.[mineLockedKind]?.coTheDao || 0) <= 0) {
      mineLockedKind = null;
      S.clearMineSticky();
    }
    if (mineLockedKind && !isOreTypeEnabled(mineLockedKind)) {
      mineLockedKind = null;
      S.clearMineSticky();
    }
    if (!mineLockedKind && preferredMineKind) {
      mineLockedKind = preferredMineKind;
    }

    advanceLockedKindForToolGap(readyAll, toolData);
    pivotMineKindIfCraftBlockedForLock(readyAll);

    if (mineLockedKind && (readyAll.stats?.[mineLockedKind]?.coTheDao || 0) <= 0) {
      mineLockedKind =
        PICKAXE_FLOW_ORDER.find(
          (entry) =>
            isOreTypeEnabled(entry.kind) &&
            !mineSkippedKindsThisSession.has(entry.kind) &&
            (readyAll.stats?.[entry.kind]?.coTheDao || 0) > 0,
        )?.kind || null;
      S.clearMineSticky();
    }

    const mineJobsTool = mineLockedKind
      ? toolData.jobs.filter((job) => job.kind === mineLockedKind)
      : toolData.jobs.filter((job) => isOreTypeEnabled(job.kind) && !mineSkippedKindsThisSession.has(job.kind));

    /** Chỉ ghép DOM với job mà bridge báo đủ cuốc — tránh tap khi inventory = 0. */
    const toolJobKeySet = new Set(toolData.jobs.map((j) => j.nodeKey));
    const jobsForDom = mineLockedKind
      ? readyAll.jobs.filter((j) => j.kind === mineLockedKind && toolJobKeySet.has(j.nodeKey))
      : readyAll.jobs.filter(
          (j) =>
            isOreTypeEnabled(j.kind) &&
            !mineSkippedKindsThisSession.has(j.kind) &&
            toolJobKeySet.has(j.nodeKey),
        );
    jobsForDom.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const tReg = now();
    if (tReg - (runtime.lastMineDomRegistryAt || 0) > 1600) {
      runtime.lastMineDomRegistryAt = tReg;
      refreshMineDomRegistry(readyAll);
    }

    // Bỏ log tổng quan đào đá định kỳ vì gây spam lệch nhịp.

    const enabledNodeCount = PICKAXE_FLOW_ORDER.filter(
      (entry) => isOreTypeEnabled(entry.kind) && !mineSkippedKindsThisSession.has(entry.kind),
    ).reduce((sum, entry) => sum + (readyAll.stats?.[entry.kind]?.coTheDao || 0), 0);

    if (enabledNodeCount <= 0) {
      mineFlowPending = false;
      mineLockedKind = null;
      S.clearMineSticky();
      runtime.lastAction = "no_rock";
      return false;
    }

    mineFlowPending = true;

    const domTargets = mineLockedKind ? getDomRockTargetsForKind(mineLockedKind) : [];
    const paired =
      mineLockedKind && jobsForDom.length && domTargets.length
        ? pairJobsToDomClickables(jobsForDom, domTargets)
        : [];
    const targetPair = paired.length ? resolveMineTargetPair(paired) : null;

    if (mineLockedKind && jobsForDom.length && !domTargets.length) {
      if (!inCooldown("mine-no-dom-targets", 9000)) {
        markCooldown("mine-no-dom-targets", 9000);
        logFlow("Đào đá: bridge có node nhưng chưa thấy DOM — kéo map / kiểm tra iframe", {
          kind: mineLockedKind,
          coTheDao: readyAll.stats?.[mineLockedKind]?.coTheDao || 0,
        });
      }
      // --- FIX: locked kind không có DOM → thử tạm kind khác có cả DOM lẫn tool ---
      // Không ghi đè mineLockedKind vĩnh viễn, chỉ thử trong lần gọi này để tránh bỏ phí tick.
      const altKindEntry = PICKAXE_FLOW_ORDER.find((entry) => {
        if (entry.kind === mineLockedKind) return false;
        if (!isOreTypeEnabled(entry.kind)) return false;
        if (mineSkippedKindsThisSession.has(entry.kind)) return false;
        if ((readyAll.stats?.[entry.kind]?.coTheDao || 0) <= 0) return false;
        // Phải có tool đủ
        if (!toolData.jobs.some((j) => j.kind === entry.kind)) return false;
        // Phải có DOM target
        return getDomRockTargetsForKind(entry.kind).length > 0;
      });
      if (altKindEntry) {
        const altDomTargets = getDomRockTargetsForKind(altKindEntry.kind);
        const altJobsForDom = readyAll.jobs.filter(
          (j) => j.kind === altKindEntry.kind && toolData.jobs.some((tj) => tj.nodeKey === j.nodeKey)
        );
        altJobsForDom.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const altPaired = altJobsForDom.length && altDomTargets.length
          ? pairJobsToDomClickables(altJobsForDom, altDomTargets)
          : [];
        if (altPaired.length) {
          logFlow("Đào đá: locked kind không có DOM — tạm đào kind thay thế trong viewport", {
            lockedKind: mineLockedKind,
            altKind: altKindEntry.kind,
          });
          if (!inCooldown("mine-node", 1900)) {
            markCooldown("mine-node", 1900);
            const altPair = altPaired[0];
            const altResult = await performDomMineRound(altPair.clickable, altPair.job);
            if (altResult.mined) {
              markNodeMinedInSession(altPair.job.nodeKey, altPair.job.recoveryMs);
              mineFlowPending = true;
              S.gameBridge.requestState().catch(() => {});
              runtime.lastAction = "mine_rock";
              return true;
            }
            if (altResult.worked) {
              mineFlowPending = true;
              runtime.mineLastDomProgressAt = now();
              S.gameBridge.requestState().catch(() => {});
              runtime.lastAction = "mine_dom_progress";
              return true;
            }
          }
        }
      }
    }

    if (targetPair) {
      if (inCooldown("mine-node", 1900)) {
        mineFlowPending = true;
        runtime.lastAction = "mine_gap";
        return false;
      }
      markCooldown("mine-node", 1900);
      mineLockedKind = targetPair.job.kind;
      const domResult = await performDomMineRound(targetPair.clickable, targetPair.job);
      if (domResult.mined) {
        markNodeMinedInSession(targetPair.job.nodeKey, targetPair.job.recoveryMs);
        mineFlowPending = true;
        S.gameBridge.requestState().catch(() => {});
        runtime.lastAction = "mine_rock";
        return true;
      }
      if (domResult.worked) {
        mineFlowPending = true;
        runtime.mineLastDomProgressAt = now();
        S.gameBridge.requestState().catch(() => {});
        runtime.lastAction = "mine_dom_progress";
        return true;
      }
      if (await tryBridgeMineJob(targetPair.job)) {
        markNodeMinedInSession(targetPair.job.nodeKey, targetPair.job.recoveryMs);
        mineFlowPending = true;
        S.gameBridge.requestState().catch(() => {});
        runtime.lastAction = "mine_rock_bridge";
        return true;
      }
    } else if (mineLockedKind && jobsForDom.length > 0) {
      if (inCooldown("mine-node", 1900)) {
        mineFlowPending = true;
        runtime.lastAction = "mine_gap";
        return false;
      }
      markCooldown("mine-node", 1900);
      const bridgeJob = jobsForDom[0];
      if (await tryBridgeMineJob(bridgeJob)) {
        markNodeMinedInSession(bridgeJob.nodeKey, bridgeJob.recoveryMs);
        mineFlowPending = true;
        S.gameBridge.requestState().catch(() => {});
        runtime.lastAction = "mine_rock_bridge";
        return true;
      }
    }

    if (toolData.jobs.length <= 0 && readyAll.summary.coTheDao > 0 && runtime.settings.autoBuyTools) {
      const pickaxeDemand = getPickaxeDemandSnapshot(readyAll);
      const pickaxeOrder = mineLockedKind
        ? PICKAXE_FLOW_ORDER.filter(
            (entry) =>
              entry.kind === mineLockedKind && isOreTypeEnabled(entry.kind) && !mineSkippedKindsThisSession.has(entry.kind),
          )
        : PICKAXE_FLOW_ORDER.filter(
            (entry) => isOreTypeEnabled(entry.kind) && !mineSkippedKindsThisSession.has(entry.kind),
          );

      logFlow("Đào đá: bridge không có job đủ cuốc nhưng vẫn có node — thử craft/xếp hàng mua", {
        "Loại ưu tiên": mineLockedKind,
        "Tổng pickaxe (regex)": pickaxes,
        chiTietCuoc: getPickaxeBreakdown(),
        nhuCau: formatPickaxeDemandSummary(pickaxeDemand),
      });

      let daThuMua = false;
      for (const entry of pickaxeOrder) {
        const wbLoop = TOOL_TO_WORKBENCH[entry.toolName] || "wood_pickaxe";
        if (isMineCraftBlockedForWorkbench(wbLoop)) {
          const ck = `${wbLoop}:mine`;
          const until = runtime.craftResourceBlockedBuyUntilByKey?.[ck];
          logFlow("Đào đá: bỏ qua tier này — craft/mua cuốc đang chặn thiếu tài nguyên; thử cuốc/quặng khác", {
            kind: entry.kind,
            workbenchId: wbLoop,
            msLeft: typeof until === "number" ? until - now() : 0,
          });
          continue;
        }
        const demand = pickaxeDemand[entry.kind];
        const nodesKind = readyAll.stats?.[entry.kind]?.coTheDao || 0;
        const haveTool = getToolCount(entry.toolName);
        let shouldBuy = (demand?.need ?? 0) > 0;
        if (!shouldBuy && nodesKind > 0 && haveTool < 1) {
          shouldBuy = true;
          logFlow("Đào đá: có node nhưng không có cuốc đúng tier — vẫn xếp hàng mua (bridge có thể báo need = 0)", {
            kind: entry.kind,
            tool: entry.toolName,
            nodeLoai: nodesKind,
            dangCo: haveTool,
          });
        }
        if (!shouldBuy) continue;

        daThuMua = true;
        const craftResult = await S.gameBridge.sendEvent(
          { type: "tool.crafted", tool: entry.toolName, amount: 1 },
          5000,
        );
        if (craftResult?.ok) {
          markCooldown(`buy:${entry.toolName}`, 8000);
          logFlow("Craft cuốc qua bridge", { toolName: entry.toolName, kind: entry.kind });
          S.gameBridge.requestState().catch(() => {});
          runtime.lastAction = "mine_craft_pickaxe";
          return true;
        }

        const wb = wbLoop;
        if (!S.workbench.enqueueToolPurchase(wb, "mine")) {
          logFlow("Đào đá: không xếp hàng mua cuốc (cooldown sau mua cùng tool — tránh craft 2 lần)", {
            toolName: entry.toolName,
            workbenchId: wb,
            kind: entry.kind,
          });
          continue;
        }
        logFlow("Đã xếp hàng mua cuốc — bước sau automation sẽ mở Workbench/Blacksmith (click bàn + icon + Craft 1 + đóng X)", {
          toolName: entry.toolName,
          workbenchId: wb,
          kind: entry.kind,
        });
        runtime.lastAction = `queue_buy_${wb}`;
        return true;
      }

      if (!daThuMua && !inCooldown("mine-buy-no-demand", 12000)) {
        markCooldown("mine-buy-no-demand", 12000);
        logFlow("Đào đá: «Tự mua công cụ» bật nhưng không xếp hàng — bridge tính need = 0 mọi tier (xem nhuCau)", {
          nhuCau: formatPickaxeDemandSummary(pickaxeDemand),
          ghiChu:
            "Nếu vẫn hết cuốc trong game: inventory bridge có thể lệch; hoặc không còn node loại đó bật trong popup.",
        });
      }
    }

    if (mineJobsTool.length <= 0 && readyAll.summary.coTheDao > 0 && !runtime.settings.autoBuyTools) {
      if (!inCooldown("mine-low-bridge-tools", 14000)) {
        markCooldown("mine-low-bridge-tools", 14000);
        logFlow("Đào đá: thiếu cuốc và tắt tự mua — bỏ qua luồng đá để chuyển luồng khác", {
          "Tổng node có thể đào": readyAll.summary.coTheDao,
          chiTietThieu: formatPickaxeDemandSummary(getPickaxeDemandSnapshot(readyAll)),
        });
      }
      mineFlowPending = false;
      runtime.rockFlowResumeAt = now() + 30000;
      runtime.lastAction = "mine_no_pickaxe_skip";
      return false;
    }

    if (
      toolData.jobs.length > 0 &&
      !targetPair &&
      mineLockedKind &&
      jobsForDom.length > 0 &&
      !inCooldown("mine-has-tool-no-dom", 11000)
    ) {
      markCooldown("mine-has-tool-no-dom", 11000);
      logFlow("Đào đá: bridge có cuốc nhưng không ghép được DOM — không đào được node này (kéo map / đợi tile render)", {
        kind: mineLockedKind,
        soJobBridge: mineJobsTool.length,
        soJobDom: jobsForDom.length,
        soTargetDom: domTargets.length,
      });
    }

    const canGiaiThich =
      (runtime.buyToolQueue?.length || 0) > 0 ||
      (readyAll.summary.coTheDao > 0 && toolData.jobs.length <= 0) ||
      (toolData.jobs.length > 0 && !targetPair && mineLockedKind);
    if (canGiaiThich && !inCooldown("mine-tai-sao-nghi", 9000)) {
      markCooldown("mine-tai-sao-nghi", 9000);
      logFlow("Đào đá: chưa đào được bước này — gợi ý", {
        coTargetDom: !!targetPair,
        bridgeDuCuoc: toolData.jobs.length > 0,
        tuMuaCongCu: runtime.settings.autoBuyTools,
        hangChoMua: runtime.buyToolQueue?.length || 0,
        lastAction: runtime.lastAction,
      });
    }

    mineFlowPending = true;
    runtime.lastAction = targetPair ? "mine_dom_retry" : "mine_idle";
    return false;
  }

  function resetMineSession() {
    sessionMineCooldownUntil.clear();
    mineSkippedKindsThisSession.clear();
    mineFlowPending = false;
    mineLockedKind = null;
    flowCooldowns.clear();
    runtime.mineDomRegistry = null;
    runtime.lastMineDomRegistryAt = 0;
    runtime.mineLastDomProgressAt = 0;
    S.clearMineSticky();
  }

  S.rockMine = { tryAutoMine, resetSession: resetMineSession };
})(window.SFL);
