(function (S) {
  "use strict";
  const runtime = S.runtime;

  function clearConsoleIfNeeded() {
    if (!runtime.settings.clearConsole) return;
    if (Math.random() > 0.15) return;
    try {
      console.clear();
    } catch (_error) {
      // Ignore console clear failures.
    }
  }

  async function drainBuyToolQueue() {
    let did = false;
    while (runtime.settings.autoBuyTools && runtime.buyToolQueue.length > 0) {
      const bought = await S.workbench.processBuyToolQueue();
      did = did || bought;
      if (!bought) break;
    }
    return did;
  }

  function shouldYieldMineToCrop(sched) {
    if (!runtime.settings.autoFarmCropsDom || typeof S.cropDom?.tryOneFarmStep !== "function") return false;
    const t = S.time.now();
    if (runtime.cropFlowResumeAt && t >= runtime.cropFlowResumeAt) return true;
    if (!sched || typeof sched.computeCropRestSchedule !== "function") return false;
    try {
      const cropRest = sched.computeCropRestSchedule();
      return !!(
        cropRest?.hasReadyCrops ||
        cropRest?.hasEmptyPlots ||
        (Number(cropRest?.nextAt) > 0 && Number(cropRest.nextAt) <= t)
      );
    } catch (_error) {
      return false;
    }
  }

  function visibleUpdateButtonIn(root) {
    if (!root) return null;
    let els;
    try {
      els = root.querySelectorAll("a, button, span, u, p, div");
    } catch (_e) {
      return null;
    }
    for (let i = 0; i < els.length; i += 1) {
      const el = els[i];
      const text = String(el.textContent || "").trim().toLowerCase();
      if (text !== "update") continue;
      if (S.dom?.isVisible && !S.dom.isVisible(el)) continue;
      return el;
    }
    return null;
  }

  function visibleUpdateRoundButtonIn(root) {
    if (!root) return null;
    let imgs;
    try {
      imgs = root.querySelectorAll('img[src*="/game-assets/ui/round_button"]');
    } catch (_e) {
      return null;
    }
    for (let i = 0; i < imgs.length; i += 1) {
      const img = imgs[i];
      if (S.dom?.isVisible && !S.dom.isVisible(img)) continue;
      let target =
        img.closest?.("button,[role='button'],.cursor-pointer,.group") ||
        img.closest?.(".relative.flex") ||
        img.parentElement;
      if (!target) continue;
      if (S.dom?.isVisible && !S.dom.isVisible(target)) continue;
      const rect = target.getBoundingClientRect();
      if (rect.width < 30 || rect.height < 30 || rect.width > 140 || rect.height > 140) continue;
      return target;
    }
    return null;
  }

  async function tryHandleGameUpdateDialog() {
    const docsToSearch = S.dom?.collectDocumentsForGameDom ? S.dom.collectDocumentsForGameDom() : [document];
    for (let di = 0; di < docsToSearch.length; di += 1) {
      const doc = docsToSearch[di];
      const bodyText = doc.body ? doc.body.textContent || "" : "";
      if (!bodyText.toLowerCase().includes("a new version is ready")) continue;

      let scope = doc.body;
      try {
        const dialogs = doc.querySelectorAll('[role="dialog"],[data-headlessui-state="open"]');
        for (let i = 0; i < dialogs.length; i += 1) {
          const dlg = dialogs[i];
          if (S.dom?.isVisible && !S.dom.isVisible(dlg)) continue;
          if (String(dlg.textContent || "").toLowerCase().includes("a new version is ready")) {
            scope = dlg;
            break;
          }
        }
      } catch (_e) {
        // keep body scope
      }

      const roundButton = visibleUpdateRoundButtonIn(scope);
      if (roundButton) {
        S.time.logFlow("Phát hiện popup Update — bấm nút tròn xác nhận trước", {});
        if (S.dom?.clickAtCenter) S.dom.clickAtCenter(roundButton);
        else if (S.dom?.nativeClickClose) S.dom.nativeClickClose(roundButton);
        else roundButton.click?.();
        await S.time.sleep(S.time.rand(650, 950));
      }

      const updateBtn = visibleUpdateButtonIn(scope) || visibleUpdateButtonIn(doc.body);
      if (updateBtn) {
        S.time.logFlow("Phát hiện popup Update phiên bản mới, đang click Update", {});
        if (S.dom?.clickAtCenter) S.dom.clickAtCenter(updateBtn);
        else if (S.dom?.nativeClickClose) S.dom.nativeClickClose(updateBtn);
        else updateBtn.click?.();
      } else {
        S.time.logFlow("Phát hiện yêu cầu Update phiên bản mới, tiến hành reload trang", {});
        window.location.reload();
      }
      await S.time.sleep(2000);
      return true;
    }
    return false;
  }

  /**
   * Tự động phát hiện và click bất kỳ nút/văn bản nào có chứa từ "Claim" (Claim, Claim your gift, Claim reward, Claim All, v.v.)
   * cũng như "Tap to continue", "Chạm để tiếp tục", v.v.
   */
  async function tryHandlePopupsAndClaimDialogs() {
    if (!S.dom?.collectDocumentsForGameDom) return false;
    const docs = S.dom.collectDocumentsForGameDom();

    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      if (!doc || !doc.body) continue;

      let foundEl = null;
      try {
        const elements = doc.querySelectorAll("button, [role='button'], a, p, span, div");
        const matches = [];
        for (let i = 0; i < elements.length; i += 1) {
          const el = elements[i];
          if (S.dom?.isVisible && !S.dom.isVisible(el)) continue;
          if (el.disabled) continue;

          const text = String(el.textContent || "").trim().toLowerCase();
          if (!text || text.length > 150) continue;

          if (
            /\bclaim\b/i.test(text) ||
            text.includes("nhận quà") ||
            text.includes("nhận phần thưởng") ||
            text.includes("nhận ngay") ||
            text.includes("tap to continue") ||
            text.includes("click to continue") ||
            text.includes("press to continue") ||
            text.includes("tap anywhere") ||
            text.includes("click anywhere") ||
            text.includes("chạm để tiếp tục") ||
            text.includes("bấm để tiếp tục") ||
            text.includes("nhấp để tiếp tục")
          ) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.width < 900 && rect.height > 0 && rect.height < 600) {
              matches.push(el);
            }
          }
        }

        if (matches.length > 0) {
          // Ưu tiên phần tử ngắn nhất (nút hoặc thẻ nhãn dán trực tiếp) để tránh click nhầm khung lớn
          matches.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
          foundEl = matches[0];
        }
      } catch (_e) { }

      if (!foundEl) continue;

      let clickTarget = foundEl;
      let p = foundEl;
      for (let depth = 0; depth < 6 && p; depth += 1) {
        if (
          p.tagName === "BUTTON" ||
          p.getAttribute("role") === "button" ||
          p.classList?.contains("cursor-pointer")
        ) {
          clickTarget = p;
          break;
        }
        p = p.parentElement;
      }

      S.time.logFlow(`Auto Popup/Claim Handler: Phát hiện nút Claim ("${foundEl.textContent?.trim().slice(0, 40)}") — tự động click`, {});

      if (S.dom?.doubleClickAtCenter) {
        S.dom.doubleClickAtCenter(clickTarget) || S.dom.clickAtCenter(clickTarget) || S.dom.nativeClickClose(clickTarget);
      } else if (S.dom?.clickAtCenter) {
        S.dom.clickAtCenter(clickTarget);
      } else if (S.dom?.nativeClickClose) {
        S.dom.nativeClickClose(clickTarget);
      } else {
        clickTarget.click?.();
      }

      runtime.busy = false;
      await S.time.sleep(600);
      return true;
    }
    return false;
  }

  /**
   * Luồng tự động xử lý lỗi + Tải lại trang (Auto Error & Refresh Handler):
   * Chạy độc lập trên interval riêng (mỗi 1s), giống như captcha.
   * Tự động phát hiện popup lỗi / update / try again / refresh / reload / retry...
   * và click bấm nút khôi phục hoặc tự động reload trang nếu bị treo lỗi.
   */
  async function tryAutoHandleErrorAndRefresh() {
    if (!S.dom?.collectDocumentsForGameDom) return false;

    const docs = S.dom.collectDocumentsForGameDom();

    for (let di = 0; di < docs.length; di += 1) {
      const doc = docs[di];
      if (!doc || !doc.body) continue;

      const bodyText = (doc.body.textContent || "").toLowerCase();

      // Danh sách từ khóa thông báo lỗi game
      const isErrorScreen =
        bodyText.includes("something went wrong") ||
        bodyText.includes("connection lost") ||
        bodyText.includes("a new version is ready") ||
        bodyText.includes("an error occurred") ||
        bodyText.includes("network error") ||
        bodyText.includes("session expired") ||
        bodyText.includes("too many requests") ||
        bodyText.includes("error code");

      // 1. Kiểm tra popup Update game phiên bản mới trước
      if (bodyText.includes("a new version is ready")) {
        const handledUpdate = await tryHandleGameUpdateDialog();
        if (handledUpdate) {
          runtime.busy = false;
          return true;
        }
      }

      // 2. Tìm tất cả các container dialog / modal đang mở
      let containers = [];
      try {
        const dialogs = doc.querySelectorAll('[role="dialog"], [data-headlessui-state="open"], .modal, .dialog');
        containers = Array.from(dialogs).filter(dEl => S.dom?.isVisible ? S.dom.isVisible(dEl) : true);
      } catch (_e) { }

      if (containers.length === 0 && isErrorScreen) {
        containers = [doc.body];
      }

      for (const container of containers) {
        let clickableCandidates = [];
        try {
          clickableCandidates = Array.from(
            container.querySelectorAll("button, [role='button'], a, span, p, div.cursor-pointer")
          );
        } catch (_e) { }

        for (const el of clickableCandidates) {
          if (S.dom?.isVisible && !S.dom.isVisible(el)) continue;
          const text = String(el.textContent || "").trim().toLowerCase();
          if (!text || text.length > 50) continue;

          // Từ khóa nút Refresh / Try again / Retry / Reload / Update / Continue / Okay / Tap to continue
          const isErrorActionBtn =
            /^(try again|refresh|reload|retry|update|thử lại|tải lại|tiếp tục|continue|okay|close|đóng|tap to continue|click to continue)$/i.test(text) ||
            /\btry\s+again\b|\brefresh\b|\breload\b|\bretry\b|\bupdate\b|\bthử\s+lại\b|\btải\s+lại\b|\btap\s+to\s+continue\b|\bclick\s+to\s+continue\b/i.test(text);

          if (isErrorActionBtn) {
            S.time.logFlow(`Auto Error Handler: Phát hiện nút khôi phục/refresh ("${text}"), tiến hành click`, {});
            if (S.dom?.doubleClickAtCenter) {
              S.dom.doubleClickAtCenter(el) || S.dom.clickAtCenter(el) || S.dom.nativeClickClose(el);
            } else if (S.dom?.nativeClickClose) {
              S.dom.nativeClickClose(el);
            } else if (S.dom?.clickAtCenter) {
              S.dom.clickAtCenter(el);
            } else {
              el.click?.();
            }
            runtime.busy = false; // Clear busy flag để giải kẹt bot
            await S.time.sleep(1200);
            return true;
          }
        }
      }

      // 3. Nếu phát hiện màn hình lỗi mà không bấm được nút nào -> reload trang sau 3 lần rà soát
      if (isErrorScreen) {
        runtime._errorPopupSeenCount = (runtime._errorPopupSeenCount || 0) + 1;
        if (runtime._errorPopupSeenCount >= 3) {
          S.time.logFlow("Auto Error Handler: Phát hiện màn hình lỗi game treo liên tục — tự động reload trang (location.reload)", {});
          runtime._errorPopupSeenCount = 0;
          runtime.busy = false;
          window.location.reload();
          await S.time.sleep(2000);
          return true;
        }
      } else {
        runtime._errorPopupSeenCount = 0;
      }
    }
    return false;
  }

  // Chạy luồng tự động click Refresh / Try again / Tap to continue / Claim gift độc lập mỗi 1s
  setInterval(() => {
    tryHandlePopupsAndClaimDialogs().catch(() => {});
    tryAutoHandleErrorAndRefresh().catch(() => {});
  }, 1000);

  async function automationTick() {
    if (!S.dom.shouldRunAutomationInThisFrame() || runtime.busy) return;

    if (typeof S.pullAutomationFlagsFromStorage === "function") {
      await S.pullAutomationFlagsFromStorage();
    }
    if (!runtime.settings.masterEnabled) return;

    // Tự động nhấp qua các màn hình thoại NPC / popup "Claim your gift" / "Tap to continue"
    await tryHandlePopupsAndClaimDialogs();

    // ── Kiểm tra route: chỉ chạy khi đang ở trang farm /play/ ──
    const onFarmRoute = S.dom.isOnFarmRoute();
    if (!onFarmRoute) {
      // Rời farm route → đánh dấu và dừng tất cả luồng
      if (runtime._wasOnFarmRoute !== false) {
        runtime._wasOnFarmRoute = false;
        runtime.treeFlowState = "Tạm dừng (rời farm)";
        runtime.rockFlowState = "Tạm dừng (rời farm)";
        runtime.mushroomFlowState = "Tạm dừng (rời farm)";
        runtime.cookFlowState = "Tạm dừng (rời farm)";
        runtime.petalHarvestState = "Tạm dừng (rời farm)";
        runtime.fruitTreeFlowState = "Tạm dừng (rời farm)";
        runtime.honeyFlowState = "Tạm dừng (rời farm)";
        runtime.compostFlowState = "Tạm dừng (rời farm)";
        S.time.logFlow("Route watcher: rời farm route — dừng tất cả luồng", {
          href: String(window.location.href || "").slice(0, 80),
        });
      }
      return;
    }

    // Vừa trở lại farm route → restart ngay lập tức tất cả luồng bật
    if (runtime._wasOnFarmRoute === false) {
      runtime._wasOnFarmRoute = true;
      runtime.currentSequenceStep = "mushroom";
      runtime.lastPetalActionAt = 0;
      runtime.lastCropDomActionAt = 0;
      // Reset thời gian nghỉ thông minh
      runtime.treeFlowResumeAt = 0;
      runtime.rockFlowResumeAt = 0;
      runtime.cropFlowResumeAt = 0;
      runtime.petalFlowResumeAt = 0;
      runtime.fruitTreeFlowResumeAt = 0;
      runtime.lastFruitTreeActionAt = 0;
      runtime.honeyFlowResumeAt = 0;
      runtime.compostFlowResumeAt = 0;
      runtime.lastCompostActionAt = 0;
      S.time.logFlow("Route watcher: trở về farm route — bắt đầu lại vòng lặp", {
        href: String(window.location.href || "").slice(0, 80),
      });
    }
    runtime._wasOnFarmRoute = true;

    // ── Kích hoạt luồng mua đồ tự động (rìu + cuốc + hạt) 1 lần duy nhất khi khởi động ──
    if (runtime.settings.autoBuyTools) {
      const tNow = S.time.now();
      const COOLDOWN_MS = 25000; // 25s giãn cách giữa các lần thử lại nếu thất bại

      // 1. Auto mua công cụ (rìu + cuốc)
      if (!runtime.resetPurchaseToolsDone) {
        if (tNow - (runtime.resetPurchaseToolsLastAttemptAt || 0) > COOLDOWN_MS) {
          runtime.resetPurchaseToolsLastAttemptAt = tNow;
          if (typeof S.workbench?.buyAllToolsBatch === "function") {
            S.time.logFlow("Reset Purchase: Khởi động app, bắt đầu luồng tự mua công cụ (rìu + cuốc)...", {});
            runtime.busy = true;
            try {
              const success = await S.workbench.buyAllToolsBatch();
              if (success) {
                runtime.resetPurchaseToolsDone = true;
                S.time.logFlow("Reset Purchase: Đã mua xong công cụ (hoặc không còn gì khả dụng để mua)!", {});
              } else {
                S.time.logFlow("Reset Purchase: Mua công cụ chưa thành công (sẽ tự động thử lại sau)...", {});
              }
            } catch (e) {
              S.time.logFlow("Reset Purchase: Lỗi khi tự mua công cụ: " + e.message, {});
            } finally {
              runtime.busy = false;
            }
            return;
          }
        }
      }

      // 2. Auto mua hạt giống
      if (!runtime.resetPurchaseSeedsDone) {
        if (S.gameBridge?.isReady && tNow - (runtime.resetPurchaseSeedsLastAttemptAt || 0) > COOLDOWN_MS) {
          runtime.resetPurchaseSeedsLastAttemptAt = tNow;
          if (typeof S.cropDom?.buyAllPossibleSeedsViaEvent === "function") {
            S.time.logFlow("Reset Purchase: Khởi động app, bắt đầu luồng tự mua hạt giống...", {});
            runtime.busy = true;
            try {
              const res = await S.cropDom.buyAllPossibleSeedsViaEvent();
              if (res && res.ok) {
                runtime.resetPurchaseSeedsDone = true;
                S.time.logFlow("Reset Purchase: Đã mua xong hạt giống thành công!", {});
              } else {
                S.time.logFlow("Reset Purchase: Mua hạt giống chưa thành công (sẽ tự động thử lại sau)...", {});
              }
            } catch (e) {
              S.time.logFlow("Reset Purchase: Lỗi khi tự mua hạt giống: " + e.message, {});
            } finally {
              runtime.busy = false;
            }
            return;
          }
        }
      }
    }

    const needPauseBetty =
      typeof S.cropDom?.isBettySeedShopDialogOpen === "function" && S.cropDom.isBettySeedShopDialogOpen();
    const blacksmithShopOpen =
      typeof S.workbench?.isBlacksmithToolsPanelOpen === "function" && S.workbench.isBlacksmithToolsPanelOpen();
    const smithIdleBlock =
      blacksmithShopOpen &&
      !(runtime.settings.autoBuyTools && runtime.buyToolQueue.length > 0);
    const rawShopPause = needPauseBetty || smithIdleBlock;

    const t = S.time.now();

    // ── Kiểm tra độc lập luồng nấm: đảm bảo chạy định kỳ 2 giờ/lần ──
    if (runtime.settings.autoHarvestMushrooms && t - (runtime.lastMushroomActionAt || 0) > S.MUSHROOM_FLOW_INTERVAL_MS) {
      runtime.mushroomFlowState = "Đang chạy (độc lập)";
      let mushroomSteps = 0;
      let didMushroomWork = false;
      for (let step = 0; step < 36; step += 1) {
        const didPick = await S.mushroomHarvest.tryHarvestOneMushroom();
        if (!didPick) break;
        didMushroomWork = true;
        mushroomSteps = step + 1;
        await S.time.sleep(S.time.rand(260, 520));
      }
      if (didMushroomWork) {
        runtime.lastMushroomActionAt = t;
        S.time.logFlow("Luồng nấm: đã thu hoạch (độc lập, không phụ thuộc state machine)", { steps: mushroomSteps });
        runtime.mushroomFlowState = "Sẵn sàng";
        return; // Đã làm việc, quay lại vòng lặp tick sau
      }
      runtime.mushroomFlowState = "Chờ tới lượt";
    }

    const SHOP_CLOSE_DEBOUNCE_MS = 520;
    const hold = runtime._shopAutomationHold;

    if (rawShopPause) {
      runtime._shopAutomationHold = -1;
    } else {
      if (hold === -1) {
        runtime._shopAutomationHold = t + SHOP_CLOSE_DEBOUNCE_MS;
      } else if (typeof hold === "number" && hold > 0 && t >= hold) {
        runtime._shopAutomationHold = 0;
      }
    }

    const h = runtime._shopAutomationHold;
    const shopAutomationPaused = h === -1 || (typeof h === "number" && h > t);

    if (shopAutomationPaused) {
      if (needPauseBetty) {
        if (t - (runtime._automationShopPauseLogAt || 0) > 14000) {
          runtime._automationShopPauseLogAt = t;
          S.time.logFlow("Tạm dừng automation — shop Betty (hạt) đang mở; đóng để chạy tiếp", {});
        }
        return;
      }
      if (blacksmithShopOpen && runtime.settings.autoBuyTools && runtime.buyToolQueue.length > 0) {
        runtime.busy = true;
        try {
          clearConsoleIfNeeded();
          await drainBuyToolQueue();
        } finally {
          runtime.busy = false;
        }
        return;
      }
      if (smithIdleBlock) {
        if (t - (runtime._automationShopPauseLogAt || 0) > 14000) {
          runtime._automationShopPauseLogAt = t;
          S.time.logFlow("Tạm dừng automation — Blacksmith/Workbench đang mở; đóng để chạy tiếp", {});
        }
        return;
      }
      // Debounce: DOM vừa báo đóng shop — chưa chạy luồng map (tránh nhấp nháy).
      return;
    }

    runtime.busy = true;
    try {
      clearConsoleIfNeeded();

      if (typeof S.cropDom?.tryTapChestCaptchaIfPresent === "function") {
        const chestDone = await S.cropDom.tryTapChestCaptchaIfPresent();
        if (chestDone) {
          await S.time.sleep(S.time.rand(200, 420));
        }
      }

      // Tự động xử lý popup lỗi chung & update game (Try again / Refresh / Reload / Update)
      if (await tryAutoHandleErrorAndRefresh()) return;

      if (runtime.settings.autoBuyTools && runtime.buyToolQueue.length > 0) {
        await drainBuyToolQueue();
        if (runtime.buyToolQueue.length > 0) {
          const t = S.time.now();
          if (t - (runtime._buyQueuePendingLogAt || 0) > 8000) {
            runtime._buyQueuePendingLogAt = t;
            S.time.logFlow("Hàng chờ mua công cụ: vẫn còn — thử lại mỗi tick (không chờ chu kỳ 8 phút). Kéo map cho thấy Workbench nếu không mở được shop.", {
              hangDoi: runtime.buyToolQueue.length,
              head: runtime.buyToolQueue[0],
            });
          }
        }
      }

      // Tự động nâng đảo (kiểm tra ngầm, sẽ tự bỏ qua nếu không đủ đk hoặc đã check gần đây)
      if (typeof S.cropDom?.tryExpandIslandViaEvent === "function") {
        await S.cropDom.tryExpandIslandViaEvent();
      }

      // --- Sequential State Machine (với thời gian nghỉ thông minh) ---
      runtime.currentSequenceStep = runtime.currentSequenceStep || "mushroom";
      const sched = S.flowScheduler;

      let checkedCount = 0;
      while (checkedCount < 6) {
        let didWork = false;

        // Reset crop seed selection cache if transitioning to "crop" from another flow
        if (runtime.currentSequenceStep !== "crop") {
          runtime._lastSequenceStep = runtime.currentSequenceStep;
        } else if (runtime.currentSequenceStep === "crop") {
          if (runtime._lastSequenceStep !== "crop") {
            runtime.cropDomLastSelectedSeedName = null;
            runtime.cropDomLastSelectedSeedAt = 0;
            runtime._lastSequenceStep = "crop";
          }
        }

        if (runtime.currentSequenceStep === "mushroom") {
          if (runtime.settings.autoHarvestMushrooms) {
            runtime.mushroomFlowState = "Đang chạy";
            let mushroomSteps = 0;
            for (let step = 0; step < 36; step += 1) {
              const didPick = await S.mushroomHarvest.tryHarvestOneMushroom();
              mushroomSteps = step + 1;
              if (!didPick) break;
              didWork = true;
              await S.time.sleep(S.time.rand(260, 520));
            }
            if (didWork) {
              S.time.logFlow("Luồng nấm: đã thu hoạch", { steps: mushroomSteps });
            } else {
              runtime.mushroomFlowState = "Chờ tới lượt";
            }
          } else {
            runtime.mushroomFlowState = "Tạm tắt";
          }
          if (!didWork) runtime.currentSequenceStep = "tree";
        } 
        else if (runtime.currentSequenceStep === "tree") {
          if (runtime.settings.autoChop) {
            // ── Kiểm tra xem luồng cây có đang nghỉ (chờ hồi phục) không ──
            if (runtime.treeFlowResumeAt && S.time.now() < runtime.treeFlowResumeAt) {
              const leftMs = runtime.treeFlowResumeAt - S.time.now();
              runtime.treeFlowState = `Nghỉ — cây hồi phục sau ${sched.formatDuration(leftMs)}`;
              runtime.currentSequenceStep = "mine";
              checkedCount += 1;
              continue;
            }
            runtime.treeFlowResumeAt = 0;
            runtime.treeFlowState = "Đang chạy";
            let treeSteps = 0;
            let treeIdleRetries = 0;
            const maxTreeIdleRetries = 4;
            
            for (let step = 0; step < 40; step += 1) {
              let didStep = false;
              // Captcha có thể xuất hiện ngay sau cú chặt — kiểm tra mỗi bước.
              if (typeof S.cropDom?.tryTapChestCaptchaIfPresent === "function") {
                const capDone = await S.cropDom.tryTapChestCaptchaIfPresent();
                if (capDone) {
                  await S.time.sleep(S.time.rand(200, 420));
                  didStep = true;
                }
              }
              const bought = await drainBuyToolQueue();
              didStep = didStep || bought;
              const didChop = await S.woodChop.tryAutoChop();
              didStep = didStep || didChop;
              if (!didStep && typeof S.woodChop?.hasChopSessionPending === "function" && S.woodChop.hasChopSessionPending()) {
                didStep = true;
                await S.time.sleep(S.time.rand(280, 520));
                didWork = true;
                treeSteps = step + 1;
                break;
              }
              if (!didStep) {
                const moreTrees = typeof S.woodChop?.hasVisibleChoppableTrees === "function" && S.woodChop.hasVisibleChoppableTrees();
                if (moreTrees && treeIdleRetries < maxTreeIdleRetries) {
                  treeIdleRetries += 1;
                  await S.time.sleep(S.time.rand(160, 360));
                  treeSteps = step + 1;
                  continue;
                }
                treeSteps = step + 1;
                break;
              }
              treeIdleRetries = 0;
              didWork = didWork || didStep;
              treeSteps = step + 1;
            }
            if (didWork) {
              runtime.lastTreeActionAt = S.time.now();
              runtime.lastActionAt = runtime.lastTreeActionAt;
              S.time.logFlow("Luồng cây: đã chặt", { steps: treeSteps });
              // Sau khi chặt xong, tính thời gian nghỉ thông minh
              if (sched) {
                const treeRest = sched.computeTreeRestSchedule();
                if (!treeRest.allReady && treeRest.nextAt > S.time.now()) {
                  runtime.treeFlowResumeAt = treeRest.nextAt;
                  const waitLabel = sched.formatDuration(treeRest.nextAt - S.time.now());
                  runtime.treeFlowState = `Nghỉ — ${treeRest.reason}`;
                  S.time.logFlow("🌳 Luồng cây: nghỉ thông minh", { reason: treeRest.reason, resumeIn: waitLabel });
                }
              }
            } else {
              // Không làm được gì → tính thời gian nghỉ
              if (sched) {
                const treeRest = sched.computeTreeRestSchedule();
                if (!treeRest.allReady && treeRest.nextAt > S.time.now()) {
                  runtime.treeFlowResumeAt = treeRest.nextAt;
                  runtime.treeFlowState = `Nghỉ — ${treeRest.reason}`;
                  S.time.logFlow("🌳 Luồng cây: nghỉ thông minh (không có cây)", { reason: treeRest.reason, resumeIn: sched.formatDuration(treeRest.nextAt - S.time.now()) });
                } else {
                  runtime.treeFlowState = "Chờ tới lượt";
                }
              } else {
                runtime.treeFlowState = "Chờ tới lượt";
              }
            }
          } else {
            runtime.treeFlowState = "Tạm tắt";
          }
          if (!didWork) runtime.currentSequenceStep = "mine";
        }
        else if (runtime.currentSequenceStep === "mine") {
          if (runtime.settings.autoMine) {
            if (shouldYieldMineToCrop(sched)) {
              runtime.rockFlowState = "Nhuong luong ruong";
              runtime.currentSequenceStep = "crop";
              checkedCount += 1;
              continue;
            }
            // ── Kiểm tra xem luồng đá có đang nghỉ không ──
            if (runtime.rockFlowResumeAt && S.time.now() < runtime.rockFlowResumeAt) {
              const leftMs = runtime.rockFlowResumeAt - S.time.now();
              runtime.rockFlowState = `Nghỉ — đá hồi phục sau ${sched.formatDuration(leftMs)}`;
              runtime.currentSequenceStep = "crop";
              checkedCount += 1;
              continue;
            }
            runtime.rockFlowResumeAt = 0;
            runtime.rockFlowState = "Đang chạy";
            let rockSteps = 0;
            let yieldedToCrop = false;
            for (let step = 0; step < 40; step += 1) {
              if (shouldYieldMineToCrop(sched)) {
                yieldedToCrop = true;
                runtime.rockFlowState = "Nhuong luong ruong";
                break;
              }
              let didStep = false;
              const bought = await drainBuyToolQueue();
              didStep = didStep || bought;
              const didMine = await S.rockMine.tryAutoMine();
              didStep = didStep || didMine;
              
              if (!didMine && runtime.lastAction === "mine_gap") {
                await S.time.sleep(S.time.rand(420, 780));
              }
              didWork = didWork || didStep;
              rockSteps = step + 1;
              if (!didStep) break;
            }
            if (didWork && !yieldedToCrop) {
              runtime.lastRockActionAt = S.time.now();
              runtime.lastActionAt = runtime.lastRockActionAt;
              S.time.logFlow("Luồng đá: đã đào", { steps: rockSteps });
              // Tính thời gian nghỉ thông minh
              if (sched) {
                const rockRest = sched.computeRockRestSchedule();
                if (!rockRest.allReady && rockRest.nextAt > S.time.now()) {
                  runtime.rockFlowResumeAt = rockRest.nextAt;
                  const waitLabel = sched.formatDuration(rockRest.nextAt - S.time.now());
                  runtime.rockFlowState = `Nghỉ — ${rockRest.reason}`;
                  S.time.logFlow("⛏️ Luồng đá: nghỉ thông minh", { reason: rockRest.reason, resumeIn: waitLabel, readyByKind: rockRest.readyByKind });
                }
              }
            } else if (!yieldedToCrop) {
              if (sched) {
                const rockRest = sched.computeRockRestSchedule();
                if (!rockRest.allReady && rockRest.nextAt > S.time.now()) {
                  runtime.rockFlowResumeAt = rockRest.nextAt;
                  runtime.rockFlowState = `Nghỉ — ${rockRest.reason}`;
                  S.time.logFlow("⛏️ Luồng đá: nghỉ thông minh (không có node)", { reason: rockRest.reason, resumeIn: sched.formatDuration(rockRest.nextAt - S.time.now()), readyByKind: rockRest.readyByKind });
                } else {
                  runtime.rockFlowState = "Chờ tới lượt";
                }
              } else {
                runtime.rockFlowState = "Chờ tới lượt";
              }
            }
            if (yieldedToCrop) {
              runtime.currentSequenceStep = "crop";
            }
          } else {
            runtime.rockFlowState = "Tạm tắt";
          }
          if (!didWork) runtime.currentSequenceStep = "crop";
        }
        else if (runtime.currentSequenceStep === "crop") {
          if (runtime.settings.autoFarmCropsDom && typeof S.cropDom?.tryOneFarmStep === "function") {
            // ── Kiểm tra xem luồng ruộng có đang nghỉ không ──
            if (runtime.cropFlowResumeAt && S.time.now() < runtime.cropFlowResumeAt) {
              const leftMs = runtime.cropFlowResumeAt - S.time.now();
              runtime.cropFlowState = `Nghỉ — cây chín sau ${sched.formatDuration(leftMs)}`;
              runtime.currentSequenceStep = "petal";
              checkedCount += 1;
              continue;
            }
            runtime.cropFlowResumeAt = 0;
            for (let cstep = 0; cstep < 22; cstep += 1) {
              const didCrop = await S.cropDom.tryOneFarmStep();
              if (!didCrop) break;
              didWork = true;
              runtime.lastCropDomActionAt = S.time.now();
              await S.time.sleep(S.time.rand(200, 420));
            }
            if (!didWork && sched) {
              const cropRest = sched.computeCropRestSchedule();
              if (!cropRest.hasReadyCrops && !cropRest.hasEmptyPlots && cropRest.nextAt > S.time.now()) {
                runtime.cropFlowResumeAt = cropRest.nextAt;
                runtime.cropFlowState = `Nghỉ — ${cropRest.reason}`;
                S.time.logFlow("🌾 Luồng ruộng: nghỉ thông minh", { reason: cropRest.reason, resumeIn: sched.formatDuration(cropRest.nextAt - S.time.now()) });
              }
            }
          }
          if (!didWork) runtime.currentSequenceStep = "petal";
        }
        else if (runtime.currentSequenceStep === "petal") {
          if (runtime.settings.autoPetalHarvestDom && typeof S.petalDom?.tryOnePetalStep === "function") {
            // ── Kiểm tra xem luồng hoa/quả có đang nghỉ không ──
            if (runtime.petalFlowResumeAt && S.time.now() < runtime.petalFlowResumeAt) {
              const leftMs = runtime.petalFlowResumeAt - S.time.now();
              runtime.petalHarvestState = `Nghỉ — quả hồi phục sau ${sched.formatDuration(leftMs)}`;
              runtime.currentSequenceStep = "cook";
              checkedCount += 1;
              continue;
            }
            runtime.petalFlowResumeAt = 0;
            runtime.petalHarvestState = "Đang chạy";
            for (let pstep = 0; pstep < 14; pstep += 1) {
              const didP = await S.petalDom.tryOnePetalStep();
              if (!didP) break;
              didWork = true;
              runtime.lastPetalActionAt = S.time.now();
              await S.time.sleep(S.time.rand(200, 420));
            }
            if (!didWork) {
              if (sched) {
                const petalRest = sched.computePetalRestSchedule();
                if (!petalRest.hasReady && petalRest.nextAt > S.time.now()) {
                  runtime.petalFlowResumeAt = petalRest.nextAt;
                  runtime.petalHarvestState = `Nghỉ — ${petalRest.reason}`;
                  S.time.logFlow("🌸 Luồng hoa/quả: nghỉ thông minh", { reason: petalRest.reason, resumeIn: sched.formatDuration(petalRest.nextAt - S.time.now()) });
                } else {
                  runtime.petalHarvestState = "Chờ tới lượt";
                }
              } else {
                runtime.petalHarvestState = "Chờ tới lượt";
              }
            }
          } else {
            runtime.petalHarvestState = "Tạm tắt";
          }
          if (!didWork) runtime.currentSequenceStep = "fruitTree";
        }
        else if (runtime.currentSequenceStep === "fruitTree") {
          if (runtime.settings.autoFruitTree && typeof S.fruitTree?.runFruitTreeCycle === "function") {
            // ── Kiểm tra xem luồng cây ăn quả có đang nghỉ không ──
            if (runtime.fruitTreeFlowResumeAt && S.time.now() < runtime.fruitTreeFlowResumeAt) {
              const leftMs = runtime.fruitTreeFlowResumeAt - S.time.now();
              runtime.fruitTreeFlowState = `Nghỉ — cây chín sau ${sched.formatDuration(leftMs)}`;
              runtime.currentSequenceStep = "cook";
              checkedCount += 1;
              continue;
            }
            runtime.fruitTreeFlowResumeAt = 0;
            runtime.fruitTreeFlowState = "Đang chạy";
            try {
              const didF = await S.fruitTree.runFruitTreeCycle();
              if (didF) {
                didWork = true;
                runtime.lastFruitTreeActionAt = S.time.now();
                runtime.fruitTreeFlowStartedAt = runtime.fruitTreeFlowStartedAt || S.time.now();
                runtime.nextFruitTreeFlowAt = S.time.now() + S.FRUIT_TREE_FLOW_INTERVAL_MS;
              } else {
                runtime.fruitTreeFlowState = "Chờ tới lượt";
              }
            } catch (_ftErr) {
              runtime.fruitTreeFlowState = "Lỗi";
            }
          } else {
            runtime.fruitTreeFlowState = "Tạm tắt";
          }
          if (!didWork) runtime.currentSequenceStep = "honey";
        }
        else if (runtime.currentSequenceStep === "honey") {
          if (runtime.settings.autoHoney && typeof S.honey?.runHoneyCycle === "function") {
            // ── Kiểm tra xem luồng mật ong có đang nghỉ không ──
            if (runtime.honeyFlowResumeAt && S.time.now() < runtime.honeyFlowResumeAt) {
              runtime.currentSequenceStep = "cook";
              checkedCount += 1;
              continue;
            }
            runtime.honeyFlowResumeAt = 0;
            runtime.honeyFlowState = "Đang chạy";
            try {
              const didH = await S.honey.runHoneyCycle();
              if (didH) {
                didWork = true;
                runtime.honeyFlowStartedAt = runtime.honeyFlowStartedAt || S.time.now();
              }
              // honeyFlowState & nextHoneyFlowAt được cập nhật bửi runHoneyCycle() trong honey.js
            } catch (_hErr) {
              runtime.honeyFlowState = "Lỗi";
            }
          } else {
            runtime.honeyFlowState = "Tạm tắt";
          }
          if (!didWork) runtime.currentSequenceStep = "compost";
        }
        else if (runtime.currentSequenceStep === "compost") {
          if (runtime.settings.autoCompost && typeof S.compost?.runCompostCycle === "function") {
            if (runtime.compostFlowResumeAt && S.time.now() < runtime.compostFlowResumeAt) {
              runtime.currentSequenceStep = "cook";
              checkedCount += 1;
              continue;
            }
            runtime.compostFlowResumeAt = 0;
            runtime.compostFlowState = "Đang chạy";
            try {
              const didC = await S.compost.runCompostCycle();
              if (didC) {
                didWork = true;
                runtime.compostFlowStartedAt = runtime.compostFlowStartedAt || S.time.now();
              }
            } catch (_cErr) {
              runtime.compostFlowState = "Lỗi";
            }
          } else {
            runtime.compostFlowState = "Tạm tắt";
          }
          if (!didWork) runtime.currentSequenceStep = "cook";
        }
        else if (runtime.currentSequenceStep === "cook") {
          const cookEnabled = typeof S.cook?.isCookEnabled === "function" && S.cook.isCookEnabled();
          if (cookEnabled && S.gameBridge?.isReady) {
            // ── Kiểm tra xem luồng nấu có đang nghỉ (chờ món chín) không ──
            const tNow = S.time.now();
            if (runtime.nextCookFlowAt && tNow < runtime.nextCookFlowAt) {
              if (typeof S.cook.refreshCookWaitingLabel === "function") {
                S.cook.refreshCookWaitingLabel(tNow);
              }
              runtime.currentSequenceStep = "mushroom";
              checkedCount += 1;
              continue;
            }
            try {
              // Captcha có thể chặn màn hình nấu — giải trước khi chạy chu kỳ nấu.
              if (typeof S.cropDom?.tryTapChestCaptchaIfPresent === "function") {
                const capDone = await S.cropDom.tryTapChestCaptchaIfPresent();
                if (capDone) {
                  await S.time.sleep(S.time.rand(200, 420));
                  didWork = true;
                  runtime.currentSequenceStep = "mushroom";
                  break;
                }
              }
              runtime.cookFlowState = "Đang chạy";
              const cookActed = !!(await S.cook.runCookCycle());
              if (cookActed) {
                didWork = true;
                runtime.lastAction = "auto_cook";
                runtime.lastActionAt = S.time.now();
              } else if (typeof S.cook.refreshCookWaitingLabel === "function") {
                S.cook.refreshCookWaitingLabel(S.time.now());
                if (runtime.cookFlowState === "Đang chạy") {
                  runtime.cookFlowState = "Chờ tới lượt";
                }
              }
            } catch (_cookErr) {
              runtime.cookFlowState = "Lỗi";
            }
          } else if (!cookEnabled) {
            runtime.cookFlowState = "Tạm tắt";
          } else {
            runtime.cookFlowState = "Chờ bridge";
          }
          if (!didWork) runtime.currentSequenceStep = "mushroom";
        }
        else {
          runtime.currentSequenceStep = "mushroom";
        }

        if (didWork) return;
        checkedCount += 1;
      }
    } catch (error) {
      runtime.errorCount += 1;
      runtime.lastError = String(error?.message || error || "unknown_ui_error");
      if (runtime.settings.autoChop) runtime.treeFlowState = "Lỗi";
      if (runtime.settings.autoMine) runtime.rockFlowState = "Lỗi";
      if (runtime.settings.autoHarvestMushrooms) runtime.mushroomFlowState = "Lỗi";
      if (S.cook?.isCookEnabled?.()) runtime.cookFlowState = "Lỗi";
      if (runtime.settings.autoPetalHarvestDom) runtime.petalHarvestState = "Lỗi";
      if (runtime.settings.autoFruitTree) runtime.fruitTreeFlowState = "Lỗi";
      if (runtime.settings.autoHoney) runtime.honeyFlowState = "Lỗi";
      if (runtime.settings.autoCompost) runtime.compostFlowState = "Lỗi";
      S.time.logFlow("Lỗi luồng", {
        lastError: runtime.lastError,
        errorCount: runtime.errorCount,
      });
      console.warn("[SFL UI-Only]", "UI action error", {
        lastError: runtime.lastError,
        errorCount: runtime.errorCount,
      });
    } finally {
      runtime.busy = false;
    }
  }

  function scheduleAutomationTick() {
    setTimeout(() => {
      Promise.resolve(automationTick()).finally(scheduleAutomationTick);
    }, Math.max(400, runtime.settings.tickMs));
  }

  // --- HEARTBEAT & 12H SCHEDULER RESETS ---
  const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
  let heartbeatStartTime = S.time.now();

  function triggerHeartbeat() {

    S.time.logFlow("Heartbeat: Đập mỗi 3 phút — Khởi động lại tất cả các luồng!", {});
    console.log("[Heartbeat] Đập mỗi 3 phút: Khởi động lại tất cả các luồng!");

    if (runtime.settings.autoChop) runtime.treeFlowState = "Restart (Heartbeat)";
    if (runtime.settings.autoMine) runtime.rockFlowState = "Restart (Heartbeat)";
    if (runtime.settings.autoHarvestMushrooms) runtime.mushroomFlowState = "Restart (Heartbeat)";
    if (typeof S.cook?.isCookEnabled === "function" && S.cook.isCookEnabled()) runtime.cookFlowState = "Restart (Heartbeat)";
    
    runtime.currentSequenceStep = "mushroom";

    // Reset tất cả thời gian nghỉ thông minh → các luồng chạy ngay
    runtime.treeFlowResumeAt = 0;
    runtime.rockFlowResumeAt = 0;
    runtime.cropFlowResumeAt = 0;
    runtime.petalFlowResumeAt = 0;
    runtime.fruitTreeFlowResumeAt = 0;
    runtime.honeyFlowResumeAt = 0;

    // Force reset state in case it hangs
    runtime.busy = false;
    runtime._shopAutomationHold = 0;
    if (typeof S.clearChopSticky === "function") S.clearChopSticky();
    if (typeof S.clearMineSticky === "function") S.clearMineSticky();
  }

  setInterval(triggerHeartbeat, HEARTBEAT_INTERVAL_MS);



  S.automation = { automationTick, scheduleAutomationTick };
})(window.SFL);
