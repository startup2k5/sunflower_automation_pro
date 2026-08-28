(function (S) {
  "use strict";
  const runtime = S.runtime;
  const logFlow = S.time.logFlow;
  const sleep = S.time.sleep;
  const rand = S.time.rand;
  const uiJitter = S.time.uiJitter;
  const now = S.time.now;
  const d = S.dom;

  function resetChopStuckAfterStrike() {
    runtime.chopNoChopAfterStrikeStreak = 0;
  }

  function resourceTileContainsRecoversIn(el) {
    const tile = el?.closest(".relative.w-full.h-full");
    if (!tile) return false;
    return d.textOf(tile).includes("recovers in");
  }

  function treeTileLooksChopped(tile) {
    if (!tile || !tile.isConnected) return true;
    if (resourceTileContainsRecoversIn(tile)) return true;
    if (tile.querySelector("img[src*='resources/stump']") || tile.querySelector("img[src*='stump']")) return true;
    const hasClickable = !!tile.querySelector(".cursor-pointer.hover\\:img-highlight");
    if (hasClickable) return false;
    const hasAnyTreeImg = !!tile.querySelector("img[src*='resources/tree'], img[src*='/tree/'], img[src*='bush_shrub']");
    return !hasAnyTreeImg;
  }

  function treeTileDefinitelyDone(tile) {
    if (!tile || !tile.isConnected) return true;
    if (resourceTileContainsRecoversIn(tile)) return true;
    if (tile.querySelector("img[src*='resources/stump']") || tile.querySelector("img[src*='stump']")) return true;
    return false;
  }

  function finalizeChopStickyIfTreeDone(clickable) {
    const tile = clickable?.closest?.(".relative.w-full.h-full");
    if (tile && treeTileDefinitelyDone(tile)) {
      runtime.chopStickyTile = null;
      logFlow("Chặt gỗ: đã xong 1 cây — giải phóng tile (không nhảy cây khi chưa xong)", {
        ...S.WOOD_CHOP_LOG,
      });
    }
  }

  /** Còn cây «dính» chưa chặt xong (stump/recover) — automation không được chuyển sang đào đá. */
  function hasChopSessionPending() {
    const t = runtime.chopStickyTile;
    if (!t || !t.isConnected) return false;
    if (treeTileDefinitelyDone(t)) return false;
    if (now() - (runtime.chopStickyTileAt || 0) > 8000) {
      S.clearChopSticky();
      return false;
    }
    return true;
  }

  function hasVisibleChoppableTrees() {
    return getChoppableTreeTargets().length > 0;
  }

  function resolveChopTargetClickable(targets) {
    const stickyClickable = runtime.chopStickyTile?.querySelector?.(".cursor-pointer.hover\\:img-highlight");
    if (stickyClickable && d.isVisible(stickyClickable) && d.isClickablePointerEventsOk(stickyClickable)) {
      return stickyClickable;
    }
    if (!targets.length) {
      if (runtime.chopStickyTile && runtime.chopStickyTile.isConnected && !treeTileDefinitelyDone(runtime.chopStickyTile)) {
        return null;
      }
      S.clearChopSticky();
      return null;
    }
    if (runtime.chopStickyTile && runtime.chopStickyTile.isConnected) {
      if (treeTileDefinitelyDone(runtime.chopStickyTile)) {
        S.clearChopSticky();
      } else {
        const onTile = targets.find((t) => t.closest(".relative.w-full.h-full") === runtime.chopStickyTile);
        if (onTile) {
          return onTile;
        }
        return null;
      }
    }
    const pick = targets[0];
    const tile = pick.closest(".relative.w-full.h-full");
    if (tile) {
      runtime.chopStickyTile = tile;
      runtime.chopStickyTileAt = now();
    }
    return pick;
  }

  function findOpenChopButton() {
    const chopLabels = ["chop", "chặt", "timber.chopped", "timber", "gỗ"];
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      let buttons;
      try {
        buttons = docs[di].querySelectorAll("button,[role='button']");
      } catch (_e) {
        continue;
      }
      for (let i = 0; i < buttons.length; i += 1) {
        const btn = buttons[i];
        if (!d.isVisible(btn) || btn.disabled) continue;
        const text = (btn.textContent || "").trim().toLowerCase();
        if (!text) continue;
        if (chopLabels.some((label) => text.includes(label))) {
          return btn;
        }
      }
    }
    return null;
  }

  function getChoppableTreeTargets() {
    const treeNodes = Array.from(
      document.querySelectorAll(
        [
          ".cursor-pointer.hover\\:img-highlight img[src*='resources/tree/']",
          ".cursor-pointer.hover\\:img-highlight img[src*='/resources/tree/']",
          ".cursor-pointer.hover\\:img-highlight img[src*='bush_shrub']",
          "img[src*='resources/tree/']",
          "img[src*='/resources/tree/'][src*='.webp']",
          "img[src*='bush_shrub']",
        ].join(", "),
      ),
    );

    const targets = [];
    for (const node of treeNodes) {
      const clickable =
        node.closest(".cursor-pointer.hover\\:img-highlight") ||
        node.closest("button,[role='button']") ||
        node.closest("[class*='cursor-pointer']");

      if (!clickable || !d.isVisible(clickable) || !d.isInViewport(clickable)) continue;
      if (!d.isClickablePointerEventsOk(clickable)) continue;

      const src = String(node.getAttribute("src") || "").toLowerCase();
      if (!src.includes("resources/tree") && !/\/tree\//i.test(src) && !/_tree\.(webp|png)/i.test(src) && !src.includes("bush_shrub")) continue;
      if (src.includes("stump")) continue;
      if (clickable.querySelector("img[src*='resources/stump']")) continue;

      if (resourceTileContainsRecoversIn(node)) continue;

      if (!targets.includes(clickable)) {
        targets.push(clickable);
      }
    }

    targets.sort((a, b) => d.centerDistance(a) - d.centerDistance(b));
    return targets;
  }

  async function waitBetweenResourceStrikes() {
    await sleep(rand(240, 480));
  }

  async function performResourceStrikes(clickable, maxStrikes, isDepletedTile) {
    let done = 0;
    let el = clickable;
    for (let i = 0; i < maxStrikes; i += 1) {
      const tile = el?.closest?.(".relative.w-full.h-full");
      if (tile && isDepletedTile(tile)) break;
      const next = tile?.querySelector(".cursor-pointer.hover\\:img-highlight");
      if (next && d.isVisible(next)) el = next;
      if (!el || !d.isVisible(el)) break;
      if (!d.click(el)) break;
      done += 1;
      await sleep(rand(90, 200));
      await waitBetweenResourceStrikes();
      await sleep(rand(40, 110));
      if (tile && isDepletedTile(tile)) break;
    }
    return done;
  }

  function getTargetTile(target) {
    return target?.closest?.(".relative.w-full.h-full") || null;
  }

  /** Chỉ rìu chặt cây (Axe, Stone Axe…), không tính pickaxe. null = chưa có state bridge. */
  function getBridgeState() {
    return S.gameBridge?.getLatestState?.() || null;
  }

  function getTotalChopAxesFromBridge() {
    const inv = getBridgeState()?.inventory;
    if (!inv || typeof inv !== "object") return null;
    let total = 0;
    for (const [name, raw] of Object.entries(inv)) {
      if (/pickaxe/i.test(name)) continue;
      if (!/axe/i.test(name)) continue;
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
      total += Number.isFinite(n) ? n : 0;
    }
    return Math.floor(total);
  }

  function chopSingleTree(target) {
    if (!target) return false;

    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    setTimeout(() => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, 95);
    setTimeout(() => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, 190);

    setTimeout(() => {
      const chopButton = findOpenChopButton();
      if (chopButton) {
        chopButton.click();
      }
    }, 130);

    return true;
  }

  async function tryAutoChop() {
    if (!runtime.settings.autoChop) return false;

    if (!S.gameBridge) return false;
    let st = getBridgeState();
    const age = S.gameBridge?.stateUpdatedAt ? now() - S.gameBridge.stateUpdatedAt : 1e9;
    if (!st || age > 5000) {
      await S.gameBridge.requestState().catch(() => null);
      st = getBridgeState();
    }
    if (!st) return false;

    if (findOpenChopButton()) {
      resetChopStuckAfterStrike();
    }

    const targets = getChoppableTreeTargets();
    if (!targets.length) {
      if (runtime.chopStickyTile && runtime.chopStickyTile.isConnected && !treeTileDefinitelyDone(runtime.chopStickyTile)) {
        runtime.lastAction = "chop_wait_sticky";
        return false;
      }
      runtime.lastAction = "no_tree";
      S.clearChopSticky();
      S.clearChopSticky();
      return false;
    }

    const target = resolveChopTargetClickable(targets);
    if (!target) {
      S.clearChopSticky();
      return false;
    }

    const axesBridge = getTotalChopAxesFromBridge();
    if (axesBridge !== null && axesBridge <= 0) {
      if (runtime.settings.autoBuyTools) {
        if (S.workbench.enqueueToolPurchase("axe", "chop")) {
          resetChopStuckAfterStrike();
          runtime.lastAction = "queue_buy_axe";
          S.clearChopSticky();
          logFlow("[Mua rìu] Hết rìu (bridge=0) — đã xếp hàng mua", { ...S.WOOD_CHOP_LOG });
          return true;
        }
        S.clearChopSticky();
        return false;
      } else {
        S.clearChopSticky();
        return false;
      }
    }

    // Bỏ log tổng quan rìu/cây mỗi 10s vì gây spam lệch nhịp

    if (runtime.settings.strikeLearnAutoChop && !runtime.settings.chopStrikesLearned) {
      const learnedHits = await performResourceStrikes(target, S.STRIKE_COUNT_MAX, treeTileLooksChopped);
      if (learnedHits >= 1) {
        runtime.settings.chopStrikes = learnedHits;
      }
      runtime.settings.chopStrikesLearned = true;
      S.saveSettings();
      logFlow("Học/lưu số strike cây", {
        ...S.WOOD_CHOP_LOG,
        learnedHits,
        saved: runtime.settings.chopStrikes,
      });
      resetChopStuckAfterStrike();
      runtime.lastAction = "chop_learn";
      finalizeChopStickyIfTreeDone(target);
      return true;
    }

    const chopButton = findOpenChopButton();
    if (chopButton && d.click(chopButton)) {
      await uiJitter();
      resetChopStuckAfterStrike();
      runtime.lastAction = "chop_tree";
      logFlow("Chặt cây qua nút Chop sẵn có", { ...S.WOOD_CHOP_LOG });
      finalizeChopStickyIfTreeDone(target);
      return true;
    }

    const needed = S.clampStrikeCount(runtime.settings.chopStrikes);
    const targetTileBefore = getTargetTile(target);
    const strikesDone = await performResourceStrikes(target, needed, treeTileLooksChopped);
    if (strikesDone > 0) {
      const chopAfter = findOpenChopButton();
      let clickedChopAfter = false;
      if (chopAfter && d.click(chopAfter)) {
        await uiJitter();
        clickedChopAfter = true;
      }
      const tileNow = targetTileBefore?.isConnected ? targetTileBefore : getTargetTile(target);
      const treeDoneAfterStrikes = tileNow ? treeTileLooksChopped(tileNow) : false;

      if (clickedChopAfter || treeDoneAfterStrikes) {
        resetChopStuckAfterStrike();
        runtime.lastAction = "chop_tree";
        logFlow("Chặt cây chuỗi strike", {
          ...S.WOOD_CHOP_LOG,
          strikes: strikesDone,
          need: needed,
          clickedChopAfter,
          treeDoneAfterStrikes,
        });
        finalizeChopStickyIfTreeDone(target);
        return true;
      }

      logFlow("[Mua rìu] Strike xong nhưng cây chưa đổ/không có nút Chop — bridge còn rìu thì thêm strike/chờ UI (không dừng luồng)", {
        strikesDone,
        needed,
      });
      const axesAfterStrike = getTotalChopAxesFromBridge();
      if (axesAfterStrike !== null && axesAfterStrike >= 1) {
        const bonus = Math.min(S.STRIKE_COUNT_MAX, Math.max(2, needed));
        const moreHits = await performResourceStrikes(target, bonus, treeTileLooksChopped);
        await uiJitter();
        await sleep(rand(200, 450));
        const chopBonus = findOpenChopButton();
        if (chopBonus && d.click(chopBonus)) {
          await uiJitter();
          resetChopStuckAfterStrike();
          runtime.lastAction = "chop_tree";
          logFlow("Chặt cây sau thêm strike (cây cần nhiều hơn setting hoặc UI chậm)", {
            ...S.WOOD_CHOP_LOG,
            strikesDone,
            bonusHits: moreHits,
          });
          finalizeChopStickyIfTreeDone(target);
          return true;
        }
        const tAfter = targetTileBefore?.isConnected ? targetTileBefore : getTargetTile(target);
        if (tAfter && treeTileLooksChopped(tAfter)) {
          resetChopStuckAfterStrike();
          runtime.lastAction = "chop_tree";
          finalizeChopStickyIfTreeDone(target);
          return true;
        }

        runtime.chopNoChopAfterStrikeStreak = (runtime.chopNoChopAfterStrikeStreak || 0) + 1;
        if (runtime.settings.autoBuyTools && runtime.chopNoChopAfterStrikeStreak >= 2) {
          logFlow("[Mua rìu] Kẹt sau đủ strike + bonus — bridge có thể vẫn báo còn rìu; ép xếp hàng craft/mua rìu", {
            strikesDone,
            needed,
            streak: runtime.chopNoChopAfterStrikeStreak,
            axesBridge: axesAfterStrike,
          });
          if (S.workbench.enqueueToolPurchase("axe", "chop", { forceBypassPostBuyCooldown: true })) {
            resetChopStuckAfterStrike();
            runtime.lastAction = "queue_buy_axe_stuck_ui";
            S.clearChopSticky();
            logFlow("Đã xếp hàng mua rìu (thoát kẹt UI sau strike)", { ...S.WOOD_CHOP_LOG });
            return true;
          }
        }

        runtime.lastAction = "chop_tree_need_ui";
        await sleep(rand(450, 900));
        return true;
      }

      logFlow("[Mua rìu] Strike xong nhưng cây chưa đổ — bridge không báo rìu, coi như cần mua/kiểm tra", {
        strikesDone,
        needed,
      });
    }

    if (chopSingleTree(target)) {
      await uiJitter();
      const retryAfterOpen = findOpenChopButton();
      if (retryAfterOpen && d.click(retryAfterOpen)) {
        await uiJitter();
        resetChopStuckAfterStrike();
        runtime.lastAction = "chop_tree";
        logFlow("Chặt cây sau khi mở target", { ...S.WOOD_CHOP_LOG });
        finalizeChopStickyIfTreeDone(target);
        return true;
      }
      logFlow("Mở target cây xong nhưng chưa chặt được, thử mua rìu", { ...S.WOOD_CHOP_LOG });
    }

    if (runtime.settings.autoBuyTools) {
      const axesBridge = getTotalChopAxesFromBridge();
      const stuckStreak = runtime.chopNoChopAfterStrikeStreak || 0;
      if (axesBridge !== null && axesBridge >= 1 && stuckStreak >= 2) {
        logFlow("[Mua rìu] Kẹt UI — ép xếp hàng mua rìu dù bridge báo còn rìu", {
          axesBridge,
          stuckStreak,
          ...S.WOOD_CHOP_LOG,
        });
        if (S.workbench.enqueueToolPurchase("axe", "chop", { forceBypassPostBuyCooldown: true })) {
          resetChopStuckAfterStrike();
          runtime.lastAction = "queue_buy_axe_stuck_ui";
          S.clearChopSticky();
          return true;
        }
      }
      if (axesBridge !== null && axesBridge >= 1) {
        logFlow("[Mua rìu] Không xếp hàng — bridge vẫn báo còn rìu (lỗi UI/DOM tạm thời); giữ luồng cây, thử lại sau", {
          axesBridge,
          ...S.WOOD_CHOP_LOG,
        });
        runtime.lastAction = "chop_have_axe_retry_ui";
        await sleep(rand(400, 800));
        return true;
      }
      logFlow("[Mua rìu] Hết rìu — bắt đầu vào Blacksmith", {
        from: "wood-chop",
        action: "enqueue_axe",
      });
      if (S.workbench.enqueueToolPurchase("axe", "chop")) {
        resetChopStuckAfterStrike();
        runtime.lastAction = "queue_buy_axe";
        logFlow("Cần mua rìu — đã xếp hàng; bước sau sẽ mở Blacksmith/Workbench (trả true để vòng automation gọi xử lý queue)", {
          ...S.WOOD_CHOP_LOG,
        });
        finalizeChopStickyIfTreeDone(target);
        return true;
      }
      logFlow("[Mua rìu] Không xếp hàng (cooldown sau mua / chặn) — tiếp tục thử chop, không giả «đã làm bước»", {
        ...S.WOOD_CHOP_LOG,
      });
    }

    d.click(target);
    await uiJitter();
    const retryButton = findOpenChopButton();
    if (retryButton && d.click(retryButton)) {
      await uiJitter();
      resetChopStuckAfterStrike();
      runtime.lastAction = "chop_tree_retry";
      logFlow("Chặt cây ở lần retry cuối", { ...S.WOOD_CHOP_LOG });
      finalizeChopStickyIfTreeDone(target);
      return true;
    }

    runtime.lastAction = "tree_opened";
    logFlow("Mở được cây nhưng vẫn không chặt được — dọn dẹp để chuyển luồng", { ...S.WOOD_CHOP_LOG });
    S.clearChopSticky();
    return false;
  }

  S.woodChop = { tryAutoChop, hasChopSessionPending, hasVisibleChoppableTrees };
})(window.SFL);
