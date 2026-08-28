(function (S) {
  "use strict";
  const runtime = S.runtime;
  const logFlow = S.time.logFlow;
  const sleep = S.time.sleep;
  const rand = S.time.rand;
  const uiJitter = S.time.uiJitter;
  const now = S.time.now;
  const d = S.dom;

  function queryAllGameDocs(selector) {
    const out = [];
    const docs = d.collectDocumentsForGameDom();
    for (let di = 0; di < docs.length; di += 1) {
      try {
        out.push(...docs[di].querySelectorAll(selector));
      } catch (_e) {
        // ignore
      }
    }
    return out;
  }

  function viewportMarginOk(el, margin) {
    const m = Number(margin) >= 0 ? Number(margin) : 40;
    const view = d.viewForElement(el);
    const rect = el.getBoundingClientRect();
    const ih = view.innerHeight;
    const iw = view.innerWidth;
    return !(
      rect.bottom < -m ||
      rect.right < -m ||
      rect.top > ih + m ||
      rect.left > iw + m
    );
  }

  function logBuyStep(step, detail) {
    logFlow(`[Mua công cụ] ${step}`, detail);
  }

  const TOOL_LABEL_VI = {
    axe: "Rìu chặt cây (axe.png)",
    wood_pickaxe: "Cuốc gỗ — đào đá thường (wood_pickaxe)",
    stone_pickaxe: "Cuốc đá — đào sắt (stone_pickaxe)",
    iron_pickaxe: "Cuốc sắt — đào vàng (iron_pickaxe)",
    gold_pickaxe: "Cuốc vàng — crimstone… (gold_pickaxe)",
    pickaxe: "Pickaxe (chung)",
  };

  function tenCongCuMua(toolType) {
    return TOOL_LABEL_VI[toolType] || String(toolType || "?");
  }

  /** Một dòng log thống nhất: đang làm gì, đã tab/mua/đóng chưa — chỉ đóng shop sau khi mua xong (trừ abort chặn). */
  function logMuaTienDo(buoc, payload) {
    logFlow("[Mua công cụ · tiến độ]", Object.assign({ buoc }, payload));
  }

  function cooldownKeyForBuy(toolType, requester) {
    return `${String(toolType || "")}:${String(requester || "")}`;
  }

  function markRestockBlockedBuy(toolType, requester, ms = 150000) {
    const ck = cooldownKeyForBuy(toolType, requester);
    runtime.restockBlockedBuyUntilByKey[ck] = now() + ms;
  }

  function clearRestockBlockedBuy(toolType, requester) {
    const ck = cooldownKeyForBuy(toolType, requester);
    delete runtime.restockBlockedBuyUntilByKey[ck];
  }

  function markCraftResourceBlockedBuy(toolType, requester, ms = 120000) {
    const ck = cooldownKeyForBuy(toolType, requester);
    runtime.craftResourceBlockedBuyUntilByKey[ck] = now() + ms;
  }

  function clearCraftResourceBlockedBuy(toolType, requester) {
    const ck = cooldownKeyForBuy(toolType, requester);
    delete runtime.craftResourceBlockedBuyUntilByKey[ck];
  }

  const WORKBENCH_ID_TO_BRIDGE_PICKAXE = {
    wood_pickaxe: "Pickaxe",
    stone_pickaxe: "Stone Pickaxe",
    iron_pickaxe: "Iron Pickaxe",
    gold_pickaxe: "Gold Pickaxe",
  };

  function bridgePickaxeCountForWorkbenchId(toolType) {
    const pickaxeName = WORKBENCH_ID_TO_BRIDGE_PICKAXE[toolType];
    if (!pickaxeName) return null;
    const inv = S.gameBridge?.getLatestState?.()?.inventory;
    if (!inv || typeof inv !== "object") return null;
    const raw = inv[pickaxeName];
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
    return Number.isFinite(n) ? Math.floor(n) : 0;
  }

  /** Giống wood-chop: tổng rìu chặt cây (không pickaxe). null = chưa có inventory bridge. */
  function bridgeChopAxesTotal() {
    const inv = S.gameBridge?.getLatestState?.()?.inventory;
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

  /** @returns {boolean} true nếu đã thêm/cập nhật job trong queue */
  function enqueueToolPurchase(toolType, requester, opts) {
    return false; // Bỏ mua công cụ khi thiếu trong lúc farm

    opts = opts || {};
    if (!toolType) return false;
    if (requester === "chop" && !runtime.settings.autoChop) return false;
    if (requester === "mine" && !runtime.settings.autoMine) return false;
    if (now() < runtime.suppressBuyEnqueueUntil) {
      logFlow("Bỏ qua xếp hàng tool (sau lần mua bị chặn gần đây)", {
        toolType,
        msLeft: runtime.suppressBuyEnqueueUntil - now(),
      });
      return false;
    }
    const ck = cooldownKeyForBuy(toolType, requester);
    const rbUntil = runtime.restockBlockedBuyUntilByKey[ck];
    if (rbUntil && now() < rbUntil) {
      logFlow(
        "Bỏ qua xếp hàng mua tool — vừa đóng Blacksmith vì Restock (tắt «Restock Blacksmith»); không lặp mua cho tới khi hết chặn hoặc craft OK",
        {
          toolType,
          requester,
          msLeft: rbUntil - now(),
        },
      );
      return false;
    }
    const crUntil = runtime.craftResourceBlockedBuyUntilByKey[ck];
    if (crUntil && now() < crUntil) {
      logFlow("Bỏ qua xếp hàng mua tool — vừa thiếu tài nguyên craft loại này (chỉ chặn đúng tool; mine có thể thử cuốc/quặng khác)", {
        toolType,
        requester,
        msLeft: crUntil - now(),
      });
      return false;
    }
    if (opts.forceBypassPostBuyCooldown && requester === "chop" && toolType === "axe") {
      if (runtime.postToolBuyCooldownByKey[ck]) {
        logFlow("Bỏ cooldown mua rìu — ép xếp hàng (strike xong không Chop / rìu hỏng nhưng bridge chưa kịp 0)", {
          toolType,
          requester,
        });
      }
      delete runtime.postToolBuyCooldownByKey[ck];
    }
    const coolUntil = runtime.postToolBuyCooldownByKey[ck];
    if (coolUntil && now() < coolUntil) {
      let bypassCooldown = false;
      if (requester === "mine") {
        const pc = bridgePickaxeCountForWorkbenchId(toolType);
        if (pc !== null && pc < 1) bypassCooldown = true;
      } else if (requester === "chop" && toolType === "axe") {
        const ax = bridgeChopAxesTotal();
        if (ax !== null && ax < 1) bypassCooldown = true;
      }
      if (bypassCooldown) {
        logFlow("Vẫn xếp hàng mua — bridge báo hết công cụ loại này (bỏ cooldown chống craft trùng sau lần mua trước)", {
          toolType,
          requester,
        });
        delete runtime.postToolBuyCooldownByKey[ck];
      } else {
        logFlow("Bỏ qua xếp hàng tool — vừa craft mua công cụ này (chờ game/bridge cập nhật), tránh mua 2 lần", {
          toolType,
          requester,
          msLeft: coolUntil - now(),
        });
        return false;
      }
    }
    /** Luồng vừa tap (đá/cây) cần mua → job lên đầu; trùng tool+requester thì kéo lên đầu, không xếp sau job cũ. */
    let job;
    const dupIdx = runtime.buyToolQueue.findIndex(
      (item) => item.toolType === toolType && item.requester === requester,
    );
    if (dupIdx >= 0) {
      [job] = runtime.buyToolQueue.splice(dupIdx, 1);
      job.queuedAt = now();
    } else {
      job = { toolType, requester, queuedAt: now() };
    }
    runtime.buyToolQueue.unshift(job);
    const ctx =
      requester === "mine" ? S.ROCK_ORE_LOG : requester === "chop" ? S.WOOD_CHOP_LOG : {};
    logFlow(
      dupIdx >= 0
        ? "Nhu cầu mua tool lên đầu hàng (vừa cần lại — xử lý trước)"
        : "Đã thêm vào đầu hàng chờ mua tool",
      {
        toolType,
        requester,
        queueSize: runtime.buyToolQueue.length,
        ...ctx,
      },
    );
    return true;
  }

  function markPostToolBuyCooldown(toolType, requester, ms = 7200) {
    const ck = cooldownKeyForBuy(toolType, requester);
    runtime.postToolBuyCooldownByKey[ck] = now() + ms;
  }

  function findBuyToolButton(toolType) {
    let byLabel = null;
    if (toolType === "wood_pickaxe") {
      byLabel = d.findInteractiveButtonByText(
        /\b(buy|craft|make)\b.*\bwood\b.*\bpickaxe\b|\bwood\b.*\bpickaxe\b.*\b(buy|craft|make)\b|\bpickaxe\b.*\bwood\b/i,
      );
    } else if (toolType === "stone_pickaxe") {
      byLabel = d.findInteractiveButtonByText(
        /\b(buy|craft|make)\b.*\bstone\b.*\bpickaxe\b|\bstone\b.*\bpickaxe\b.*\b(buy|craft|make)\b|\bpickaxe\b.*\bstone\b/i,
      );
    } else if (toolType === "iron_pickaxe") {
      byLabel = d.findInteractiveButtonByText(
        /\b(buy|craft|make)\b.*\biron\b.*\bpickaxe\b|\biron\b.*\bpickaxe\b.*\b(buy|craft|make)\b|\bpickaxe\b.*\biron\b/i,
      );
    } else if (toolType === "gold_pickaxe") {
      byLabel = d.findInteractiveButtonByText(
        /\b(buy|craft|make)\b.*\bgold\b.*\bpickaxe\b|\bgold\b.*\bpickaxe\b.*\b(buy|craft|make)\b|\bpickaxe\b.*\bgold\b/i,
      );
    } else if (toolType === "pickaxe") {
      byLabel = d.findInteractiveButtonByText(
        /\b(buy|craft|make)\b.*\bpickaxe\b|\bpickaxe\b.*\b(buy|craft|make)\b/i,
      );
    } else {
      byLabel = d.findInteractiveButtonByText(
        /\b(buy|craft|make)\b.*\baxe\b|\baxe\b.*\b(buy|craft|make)\b/i,
      );
    }
    // Blacksmith chỉ hiển thị "Craft 1" / "Craft 10" — không có chữ axe/pickaxe trên nút.
    return byLabel || findCraftQuantityButton();
  }

  function findBlacksmithRestockButton() {
    return d.findInteractiveButtonByText(/restock|blacksmith|replenish/i);
  }

  function isFerryOrBoatElement(el) {
    if (!el) return false;
    const imgs = el.tagName === "IMG" ? [el] : el.querySelectorAll("img");
    for (let i = 0; i < imgs.length; i++) {
      const src = String(imgs[i].getAttribute("src") || "").toLowerCase();
      if (src.includes("ferry") || src.includes("boat") || src.includes("captain") || src.includes("ship") || src.includes("travel")) {
        return true;
      }
      if (src.startsWith("data:") && src.includes("ivborw0kggoaaaansuheugaaaeqaaaas")) {
        return true;
      }
    }
    return false;
  }

  function findWorkbenchClickable() {
    // Highest-priority: div.relative.w-full.h-full.cursor-pointer.hover:img-highlight + workbench.png + blacksmith (DOM user cung cap).
    const exact = queryAllGameDocs("div.relative.w-full.h-full.cursor-pointer.hover\\:img-highlight")
      .filter((div) => {
        if (!d.isVisible(div) || !d.isClickablePointerEventsOk(div)) return false;
        if (!viewportMarginOk(div, 40)) return false;
        if (isFerryOrBoatElement(div)) return false;
        const hasWorkbench = !!div.querySelector(
          "img[src*='game-assets/buildings/workbench'],img[src*='buildings/workbench.png'],img[src*='buildings/workbench']",
        );
        const hasBlacksmith = !!div.querySelector("img[src*='npcs/blacksmith'],img[src*='blacksmith.gif']");
        return hasWorkbench && hasBlacksmith;
      })
      .sort((a, b) => d.centerDistance(a) - d.centerDistance(b))[0];
    if (exact) return exact;

    const primary = [];
    for (const div of queryAllGameDocs("div.relative.w-full.h-full.cursor-pointer.hover\\:img-highlight")) {
      if (isFerryOrBoatElement(div)) continue;
      const wb = div.querySelector(
        "img[src*='game-assets/buildings/workbench'],img[src*='buildings/workbench'],img[src*='workbench.png'],img[src*='desert/buildings/workbench'],img[src*='volcano/buildings/workbench']",
      );
      if (!wb) continue;
      const blacksmithNpc = div.querySelector("img[src*='npcs/blacksmith'],img[src*='blacksmith.gif']");
      if (!d.isVisible(div) || !d.isClickablePointerEventsOk(div)) continue;
      const rect = div.getBoundingClientRect();
      if (rect.width < 6 || rect.height < 6) continue;
      if (!viewportMarginOk(div, 40)) continue;
      let score = 0;
      if (blacksmithNpc) score += 100;
      primary.push({ el: div, dist: d.centerDistance(div), score });
    }
    primary.sort((a, b) => b.score - a.score || a.dist - b.dist);
    if (primary.length) return primary[0].el;

    const imgSelectors = [
      "img[src*='game-assets/buildings/workbench']",
      "img[src*='buildings/workbench']",
      "img[src*='desert/buildings/workbench']",
      "img[src*='volcano/buildings/workbench']",
      "img[src*='workbench']",
      "img[src*='npcs/blacksmith']",
      "img[src*='blacksmith_building']",
    ];
    const seenClickables = new Set();
    const scored = [];

    for (const sel of imgSelectors) {
      for (const img of queryAllGameDocs(sel)) {
        const src = String(img.getAttribute("src") || "").toLowerCase();
        if (src.includes("tutorial") || src.includes("icon")) continue;

        const clickable =
          img.closest(".cursor-pointer.hover\\:img-highlight") ||
          img.closest("div.relative.w-full.h-full.cursor-pointer") ||
          img.closest("div.cursor-pointer,[role='button'],button,a") ||
          img.closest("[class*='cursor-pointer']") ||
          (d.isVisible(img) ? img : null);

        if (!clickable || seenClickables.has(clickable)) continue;
        if (!d.isVisible(clickable)) continue;
        if (isFerryOrBoatElement(clickable)) continue;

        const cls = String(clickable.getAttribute("class") || "");
        if (!cls.includes("cursor-pointer")) continue;

        const rect = clickable.getBoundingClientRect();
        if (rect.width < 6 || rect.height < 6) continue;
        if (!viewportMarginOk(clickable, 40)) continue;

        seenClickables.add(clickable);
        scored.push({ el: clickable, dist: d.centerDistance(clickable) });
      }
    }

    scored.sort((a, b) => a.dist - b.dist);
    return scored[0]?.el || null;
  }

  /**
   * Một nhịp duy nhất — không .click() + clickAtCenter (hai lần = game toggle đóng panel → “bật rồi tắt”).
   */
  function openWorkbenchClick(clickable) {
    if (!clickable || !d.isVisible(clickable)) return false;
    return d.clickAtCenter(clickable);
  }

  /** Panel Blacksmith/Tools đã mở — tránh click lại tile Workbench (thường sẽ đóng panel). */
  function isBlacksmithToolsPanelOpen() {
    const craft = findCraftQuantityButton();
    if (craft && d.isVisible(craft)) return true;
    for (const root of queryAllGameDocs('[data-headlessui-state="open"],[role="dialog"]')) {
      if (!d.isVisible(root)) continue;
      const text = (root.textContent || "").replace(/\s+/g, " ").toLowerCase();
      if (
        (text.includes("land tools") || text.includes("water tools") || text.includes("animal tools") || text.includes("batch buy")) &&
        (text.includes("craft") || text.includes("in stock") || text.includes("batch buy"))
      ) {
        return true;
      }
      // Batch Buy dialog đang mở
      if (text.includes("batch buy") && (text.includes("land tools") || text.includes("axe") || text.includes("pickaxe"))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Dialog đang mở có nội dung Blacksmith/Tools — dùng để chỉ bấm nút X **trong** dialog này.
   * Tránh `img[close]` trùng với panel khác (túi, setting…) → UI “mất” lúc vừa craft xong dù mua vẫn thành công.
   */
  function findBlacksmithShopDialogRoot() {
    let best = null;
    let bestSc = 0;
    for (const root of queryAllGameDocs('[data-headlessui-state="open"],[role="dialog"]')) {
      if (!d.isVisible(root)) continue;
      const t = (root.textContent || "").replace(/\s+/g, " ").toLowerCase();
      let sc = 0;
      if (t.includes("land tools") || t.includes("water tools") || t.includes("animal tools")) sc += 40;
      if (t.includes("craft 1") || t.includes("craft 10")) sc += 28;
      if (t.includes("batch buy")) sc += 30;
      if (t.includes("in stock")) sc += 10;
      if (t.includes("tools") && t.includes("guide")) sc += 8;
      if (sc >= 40 && sc > bestSc) {
        best = root;
        bestSc = sc;
      }
    }
    return best;
  }

  /** Nút Restock trong panel Tools/Blacksmith (markup: `<p>Restock</p>` trong button). */
  function findVisibleRestockInToolsDialog() {
    const root = findBlacksmithShopDialogRoot();
    if (!root || !d.isVisible(root)) return null;
    try {
      const nodes = root.querySelectorAll("button,[role='button']");
      for (let i = 0; i < nodes.length; i += 1) {
        const btn = nodes[i];
        if (!btn || !d.isVisible(btn)) continue;
        const t = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (/\brestock|replenish\b/.test(t)) return btn;
      }
    } catch (_e) {
      // ignore
    }
    return null;
  }

  /** Craft 1/10 có `disabled` + cursor-not-allowed = thiếu nguyên liệu (không phải «không thấy nút»). */
  function hasDisabledCraftInBlacksmithDialog() {
    const root = findBlacksmithShopDialogRoot();
    const nodes = root
      ? (() => {
          try {
            return root.querySelectorAll("button,[role='button']");
          } catch (_e) {
            return [];
          }
        })()
      : null;
    const list = nodes && nodes.length ? Array.from(nodes) : queryAllGameDocs("button,[role='button']");
    for (let i = 0; i < list.length; i += 1) {
      const btn = list[i];
      if (!btn || !d.isVisible(btn) || !btn.disabled) continue;
      const t = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (/\bcraft\s*1\b|\bcraft\s*10\b|\bchế\s*1\b|\bchế\s*10\b|\btạo\s*1\b|\btạo\s*10\b/.test(t)) return true;
    }
    return false;
  }

  /** Craft: chỉ một nhịp (không .click + clickAtCenter như openWorkbenchClick). */
  function singleClickCraftButton(btn) {
    if (!btn || !d.isVisible(btn) || btn.disabled) return false;
    try {
      if (typeof btn.click === "function") btn.click();
      else return d.clickAtCenter(btn);
    } catch (_e) {
      return d.clickAtCenter(btn);
    }
    return true;
  }

  function imgSrcLower(img) {
    return String(img.getAttribute("src") || "").toLowerCase();
  }

  /** Rìu chặt cây (axe.png) — không phải wood_pickaxe / stone_pickaxe. */
  function isChopWoodAxeOnlySrc(src) {
    const s = String(src || "").toLowerCase();
    if (s.includes("pickaxe")) return false;
    return /\/tools\/axe/i.test(s) || /game-assets\/tools\/axe/i.test(s);
  }

  /**
   * Ô craft trong Blacksmith: icon data: + `skills/lock.png` (alt crop) = chưa mở / không craft được — bỏ qua.
   * Khớp markup: absolute flex cell bọc img item + img khóa góc.
   */
  function isWorkbenchPickaxeSlotLocked(itemImg) {
    const cell = itemImg?.closest?.(".absolute.flex.justify-center.items-center");
    if (!cell) return false;
    const lock = cell.querySelector(
      'img[src*="skills/lock"],img[src*="/lock.png"][alt="crop"],img[alt="crop"][src*="lock"]',
    );
    return !!(lock && lock !== itemImg && d.isVisible(lock) && lock.getBoundingClientRect().width > 2);
  }

  /**
   * Chỉ icon trong lưới trái (Land/Water tools): `flex.flex-wrap` có ≥2 ô công cụ.
   * Tránh chọn cùng `axe.png` / pickaxe ở panel mô tả bên phải — không có selectbox góc → script tưởng “chưa chọn tab”.
   */
  function isImgInsideBlacksmithToolGridRow(itemImg) {
    if (!itemImg?.isConnected) return false;
    const row = itemImg.closest("div.flex.flex-wrap");
    if (!row || !d.isVisible(row)) return false;
    try {
      const n = row.querySelectorAll(
        'img[src*="/tools/"],img[src*="game-assets/tools/"],img[alt="item"][src*="tools"]',
      ).length;
      return n >= 2 && row.contains(itemImg);
    } catch (_e) {
      return false;
    }
  }

  function scoreCraftGridToolImg(img) {
    let s = 0;
    const src = imgSrcLower(img);
    if (!src.includes("tools/")) s -= 50;
    if (String(img.getAttribute("alt") || "").toLowerCase() === "item") s += 30;
    if ((img.className || "").includes("relative")) s += 5;
    if (isImgInsideBlacksmithToolGridRow(img)) s += 100;
    const r = img.getBoundingClientRect();
    s += Math.min(40, (r.width * r.height) / 200);
    return s;
  }

  /** Ảnh item trong lưới Blacksmith (chưa map sang nút click). */
  function pickWorkbenchToolItemImg(toolType, requester) {
    const selectorMap = {
      axe: [
        "img[src*='/tools/axe']",
        "img[src*='game-assets/tools/axe']",
      ],
      wood_pickaxe: ["img[src*='tools/wood_pickaxe'],img[src*='game-assets/tools/wood_pickaxe']"],
      stone_pickaxe: ["img[src*='tools/stone_pickaxe'],img[src*='game-assets/tools/stone_pickaxe']"],
      iron_pickaxe: ["img[src*='tools/iron_pickaxe'],img[src*='game-assets/tools/iron_pickaxe']"],
      gold_pickaxe: ["img[src*='tools/gold_pickaxe'],img[src*='game-assets/tools/gold_pickaxe']"],
      pickaxe: [
        "img[src*='tools/wood_pickaxe']",
        "img[src*='tools/stone_pickaxe']",
        "img[src*='tools/iron_pickaxe']",
        "img[src*='tools/gold_pickaxe']",
        "img[src*='tools/pickaxe']",
      ],
    };
    const selectors = selectorMap[toolType] || selectorMap.pickaxe;
    const seen = new Set();
    const imgs = [];
    for (const sel of selectors) {
      for (const img of queryAllGameDocs(sel)) {
        if (seen.has(img)) continue;
        seen.add(img);
        if (d.isWorkbenchItemImgFindable(img)) imgs.push(img);
      }
    }

    let list = imgs;
    if (requester === "mine" || (toolType && String(toolType).includes("pickaxe"))) {
      const filtered = list.filter((img) => !isChopWoodAxeOnlySrc(imgSrcLower(img)));
      if (filtered.length) list = filtered;
    }

    const noLock = list.filter((img) => !isWorkbenchPickaxeSlotLocked(img));
    if (noLock.length) list = noLock;

    const slug =
      toolType === "wood_pickaxe" || toolType === "stone_pickaxe" || toolType === "iron_pickaxe" || toolType === "gold_pickaxe"
        ? toolType
        : null;
    if (slug) {
      const exact = list.filter((img) => imgSrcLower(img).includes(slug));
      if (exact.length) list = exact;
      const realAsset = list.filter((img) => !imgSrcLower(img).startsWith("data:"));
      if (realAsset.length) list = realAsset;
    }

    if (toolType === "axe") {
      const axeOnly = list.filter((img) => isChopWoodAxeOnlySrc(imgSrcLower(img)));
      if (axeOnly.length) list = axeOnly;
    }

    const inGrid = list.filter((img) => isImgInsideBlacksmithToolGridRow(img));
    if (inGrid.length) list = inGrid;

    list.sort((a, b) => scoreCraftGridToolImg(b) - scoreCraftGridToolImg(a));
    return list[0] || null;
  }

  function expectedToolSrcSlug(toolType) {
    if (toolType === "wood_pickaxe") return "wood_pickaxe";
    if (toolType === "stone_pickaxe") return "stone_pickaxe";
    if (toolType === "iron_pickaxe") return "iron_pickaxe";
    if (toolType === "gold_pickaxe") return "gold_pickaxe";
    if (toolType === "axe") return null;
    return null;
  }

  function itemImgMatchesToolType(itemImg, toolType) {
    if (!itemImg) return false;
    const src = imgSrcLower(itemImg);
    if (toolType === "axe") return isChopWoodAxeOnlySrc(src);
    const slug = expectedToolSrcSlug(toolType);
    if (slug) return src.includes(slug);
    if (toolType && String(toolType).includes("pickaxe")) return /pickaxe/.test(src);
    return true;
  }

  /**
   * Ô tab Blacksmith: thường là div.cursor-pointer + brown + viền dark_border (build Tailwind có thể đổi tên class).
   */
  function findBlacksmithToolBrownSlot(itemImg) {
    if (!itemImg) return null;
    let el = itemImg;
    for (let depth = 0; depth < 22 && el; depth += 1) {
      const cl = el.classList;
      const clsStr = el.getAttribute("class") || "";
      const st = (el.getAttribute("style") || "").toLowerCase();
      if (cl && cl.contains("cursor-pointer")) {
        if (cl.contains("bg-brown-600")) return el;
        if (/\bbg-brown-/.test(clsStr) || (/\bbrown-/i.test(clsStr) && /\bbg-/.test(clsStr))) return el;
        if (st.includes("dark_border") || st.includes("panel/dark_border")) return el;
        try {
          const win = d.viewForElement(el);
          const bi = String(win.getComputedStyle(el).borderImageSource || "").toLowerCase();
          if (bi.includes("dark_border") && el.querySelector?.('img[src*="tools/"],img[src*="game-assets"]')) return el;
        } catch (_e) {
          // ignore
        }
      }
      el = el.parentElement;
    }
    el = itemImg;
    for (let depth = 0; depth < 16 && el; depth += 1) {
      const cl = el.classList;
      if (cl && cl.contains("cursor-pointer")) {
        const r = el.getBoundingClientRect();
        const hasTool = !!el.querySelector?.(
          'img[alt="item"],img[src*="/tools/"],img[src*="game-assets/tools/"]',
        );
        if (hasTool && r.width >= 28 && r.width <= 100 && r.height >= 28 && r.height <= 100) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  /**
   * Selectbox: các img góc là anh em trực tiếp của ô `bg-brown-600` trong `div.relative`
   * (markup: wrap > brown + selectbox_tl/tr/bl/br).
   */
  function slotWrapHasSelectboxCornerSibling(brown) {
    const wrap = brown?.parentElement;
    if (!wrap) return false;
    try {
      const scoped =
        wrap.querySelector?.(":scope > img[src*='selectbox']") ||
        wrap.querySelector?.(":scope > img[src*='/select/']");
      if (scoped) return true;
      for (let i = 0; i < wrap.children.length; i += 1) {
        const ch = wrap.children[i];
        if (ch === brown) continue;
        if (String(ch.tagName || "").toLowerCase() !== "img") continue;
        const s = String(ch.getAttribute("src") || "").toLowerCase();
        if (s.includes("selectbox") || s.includes("ui/select")) return true;
      }
    } catch (_e) {
      return false;
    }
    return false;
  }

  function blacksmithSlotShowsSelectbox(itemImg) {
    const brown = findBlacksmithToolBrownSlot(itemImg);
    return slotWrapHasSelectboxCornerSibling(brown);
  }

  function isWorkbenchToolTabSelected(itemImg, toolType) {
    if (!itemImg?.isConnected || !d.isVisible(itemImg)) return false;
    if (!itemImgMatchesToolType(itemImg, toolType)) return false;
    return blacksmithSlotShowsSelectbox(itemImg);
  }

  const WORKBENCH_ICON_SCALE_READY = 2.05;

  function readWorkbenchItemImgTransformScale(itemImg) {
    if (!itemImg?.isConnected) return 0;
    const win = d.viewForElement(itemImg);
    const joined = `${itemImg.getAttribute("style") || ""} ${win.getComputedStyle(itemImg).transform || ""}`;
    let maxScale = 0;
    const re = /scale\(\s*([0-9.]+)\s*\)/gi;
    let m;
    while ((m = re.exec(joined)) !== null) {
      const v = parseFloat(m[1]);
      if (Number.isFinite(v) && v > maxScale) maxScale = v;
    }
    return maxScale;
  }

  /**
   * Chỉ sau khi tab đã OK (selectbox): chờ icon đúng tool có scale ≥ 2.05 rồi mới Craft.
   * Không dùng bước này để quyết định tab — tránh mọi ô đều scale to sẵn.
   */
  async function waitForWorkbenchIconScaleAfterTabOk(toolType, requester) {
    const maxWaitMs = 3200;
    const t0 = now();
    let lastScale = 0;
    let lastImg = null;
    while (now() - t0 < maxWaitMs) {
      const img = pickWorkbenchToolItemImg(toolType, requester);
      if (img?.isConnected && itemImgMatchesToolType(img, toolType)) {
        lastImg = img;
        lastScale = readWorkbenchItemImgTransformScale(img);
        if (lastScale >= WORKBENCH_ICON_SCALE_READY) {
          logFlow("[Blacksmith · scale sau khi chọn tab OK]", {
            toolType,
            scale: lastScale,
            nguong: WORKBENCH_ICON_SCALE_READY,
            lamTiep: "tìm Craft",
          });
          return true;
        }
      }
      await sleep(100);
    }
    logFlow("[Blacksmith · scale sau khi chọn tab OK]", {
      toolType,
      scaleCuoi: lastScale,
      nguong: WORKBENCH_ICON_SCALE_READY,
      lamTiep: "vẫn tìm Craft (hết thời gian chờ scale)",
    });
    return true;
  }

  function toolFileFromSrcEl(img) {
    if (!img) return "";
    const s = String(img.getAttribute("src") || "");
    const tail = s.split("/").pop() || s;
    return tail.split("?")[0].slice(0, 80);
  }

  /** Chỉ quét hàng lưới `flex flex-wrap` có icon tools — không quét mọi div brown trên map. */
  function scanBlacksmithToolGridState() {
    const slots = [];
    const rows = queryAllGameDocs("div.flex.flex-wrap");
    for (let ri = 0; ri < rows.length; ri += 1) {
      const row = rows[ri];
      try {
        if (!d.isVisible(row)) continue;
        if (!row.querySelector?.('img[src*="/tools/"],img[src*="game-assets/tools/"]')) continue;
        const pointers = row.querySelectorAll(".cursor-pointer");
        for (let pi = 0; pi < pointers.length; pi += 1) {
          const brown = pointers[pi];
          if (!d.isVisible(brown)) continue;
          const cls = brown.getAttribute("class") || "";
          const st = (brown.getAttribute("style") || "").toLowerCase();
          const br = brown.getBoundingClientRect();
          const toolIm = brown.querySelector(
            'img[alt="item"],img[src*="game-assets/tools/"],img[src*="/tools/"]',
          );
          if (!toolIm) continue;
          const looksToolSlot =
            /\bbrown/i.test(cls) ||
            st.includes("dark_border") ||
            st.includes("border-image") ||
            (br.width >= 28 && br.width <= 100 && br.height >= 28 && br.height <= 100);
          if (!looksToolSlot) continue;
          slots.push({
            toolFile: toolFileFromSrcEl(toolIm) || "(no img)",
            selectbox: slotWrapHasSelectboxCornerSibling(brown),
          });
        }
      } catch (_e) {
        // ignore
      }
    }
    return slots;
  }

  function logBlacksmithChonHienTai(toolType, itemImg, extra) {
    const slots = scanBlacksmithToolGridState();
    const dangChon = slots.filter((s) => s.selectbox).map((s) => s.toolFile);
    logFlow("[Blacksmith · chọn hiện tại]", {
      muonMua_toolType: toolType,
      iconBotNham: itemImg ? toolFileFromSrcEl(itemImg) : null,
      iconScale: itemImg ? readWorkbenchItemImgTransformScale(itemImg) : null,
      dangCoSelectbox_laDangChon: dangChon,
      tatCaSlot_coSelectbox: slots,
      tabDungVsMuonMua: itemImg ? isWorkbenchToolTabSelected(itemImg, toolType) : null,
      ...extra,
    });
  }

  function logBlacksmithCraftButtonsDebug() {
    const danhSach = [];
    for (const btn of queryAllGameDocs("button,[role='button']")) {
      if (!d.isVisible(btn)) continue;
      const raw = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (!raw) continue;
      const low = raw.toLowerCase();
      if (!/craft|chế|forge|make\s*\d|buy\s*\d/.test(low)) continue;
      danhSach.push({
        text: raw.slice(0, 80),
        disabled: !!btn.disabled,
        tag: btn.tagName,
      });
    }
    logFlow("[Blacksmith · nút Craft/Mua (visible)]", {
      soNut: danhSach.length,
      danhSach: danhSach.length ? danhSach : "(không thấy — kiểm tra iframe / ngôn ngữ UI)",
    });
  }

  function anyBlacksmithToolSlotSelected() {
    const slots = scanBlacksmithToolGridState();
    for (let i = 0; i < slots.length; i += 1) {
      if (slots[i].selectbox) return true;
    }
    return false;
  }

  async function clickWorkbenchTabSafely(el, toolType, round) {
    if (!el || !d.isVisible(el)) return false;
    logBuyStep("Click ô tab nâu (double-click)", { toolType, round });
    d.doubleClickAtCenter(el) || d.clickAtCenter(el);
    await sleep(rand(140, 240));
    return true;
  }

  /**
   * Bấm đúng ô `bg-brown-600 cursor-pointer` của công cụ; lặp tới khi có selectbox góc trên đúng slot.
   */
  async function selectWorkbenchToolTab(itemImg, toolType, requester) {
    if (!itemImg || !itemImg.isConnected) return false;
    let img = itemImg;
    const MAX = 6;

    for (let round = 0; round < MAX; round += 1) {
      if (isWorkbenchToolTabSelected(img, toolType)) {
        logBuyStep("Đúng tab (có selectbox góc trên công cụ cần mua)", { toolType, round });
        logBlacksmithChonHienTai(toolType, img, { buoc: "sau khi chọn tab OK", round });
        return true;
      }

      const brown = findBlacksmithToolBrownSlot(img);
      if (brown && d.isVisible(brown)) {
        await clickWorkbenchTabSafely(brown, toolType, round);
        if (!isWorkbenchToolTabSelected(img, toolType) && !anyBlacksmithToolSlotSelected()) {
          logBuyStep("Tab chưa ăn, click lại 1 lần", { toolType, round });
          await clickWorkbenchTabSafely(brown, toolType, `${round}_retry`);
        }
      } else {
        logBuyStep("Không thấy ô nâu — fallback click 1 lần lớp trong", { toolType, round });
        const c = img?.closest?.(".absolute.flex.justify-center.items-center");
        if (c && d.isVisible(c)) {
          d.clickAtCenter(c);
          await sleep(rand(140, 240));
        }
        if (!isWorkbenchToolTabSelected(img, toolType) && img && d.isVisible(img)) {
          d.clickAtCenter(img);
          await sleep(rand(140, 240));
        }
      }

      await sleep(rand(160, 280));
      const again = pickWorkbenchToolItemImg(toolType, requester);
      if (again && again.isConnected) img = again;
    }

    const ok = isWorkbenchToolTabSelected(img, toolType);
    logBlacksmithChonHienTai(toolType, img, { buoc: "het vong chon tab", ketQuaOk: ok });
    if (!ok) logBuyStep("Hết lượt: không thấy selectbox trên đúng công cụ", { toolType });
    return ok;
  }

  async function closeToolShopPanel() {
    logMuaTienDo("Gọi đóng panel (X) — từ mua xong / fallback / abort", {
      daBamThoat: "đang tìm nút X",
    });
    const dialogRoot = findBlacksmithShopDialogRoot();
    if (!dialogRoot && !isBlacksmithToolsPanelOpen()) {
      logFlow("Đóng shop: không còn panel Tools — có thể game đã tự đóng sau craft; không bấm X toàn cục", {});
      logMuaTienDo("Bỏ qua đóng — không thấy shop trên DOM", { daBamThoat: "skip", ketQua: "ok" });
      return true;
    }

    const rawClose = queryAllGameDocs("img[src*='close']").filter((img) => {
      const src = String(img.getAttribute("src") || "").toLowerCase();
      return src.includes("icons/close") || src.includes("close.png") || src.includes("/close");
    });
    let imgs = rawClose;
    if (dialogRoot) {
      const scoped = rawClose.filter((img) => dialogRoot.contains(img));
      if (scoped.length) {
        imgs = scoped;
      } else {
        logFlow("Đóng shop: không có img close trong dialog Tools — giữ danh sách X (rủi ro nhầm panel)", {
          rawClose: rawClose.length,
        });
      }
    }

    imgs.sort((a, b) => {
      const score = (node) => {
        let s = 0;
        if (node.classList.contains("cursor-pointer")) s += 10;
        if (node.classList.contains("float-right")) s += 5;
        if (d.isInViewport(node)) s += 3;
        const r = node.getBoundingClientRect();
        s += Math.min(20, (r.width * r.height) / 500);
        return s;
      };
      return score(b) - score(a);
    });

    for (const img of imgs) {
      const target =
        img.closest("button,[role='button'],a") ||
        (img.classList.contains("cursor-pointer") ? img : img.closest("[class*='cursor-pointer']")) ||
        img;

      const rect = target.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const doc = target.ownerDocument || document;
      const topEl = doc.elementFromPoint(cx, cy);
      const hitOk =
        topEl &&
        (topEl === target ||
          target.contains(topEl) ||
          topEl.contains(target) ||
          (img !== target && (topEl === img || img.contains(topEl) || topEl.contains(img))));
      if (!hitOk) {
        logFlow("Nút đóng: hit-test khác (vẫn thử click)", {
          topTag: topEl?.tagName,
          src: String(img.getAttribute("src") || "").slice(-40),
        });
      }

      d.nativeClickClose(target);
      if (target !== img) d.nativeClickClose(img);

      logFlow("Đã gọi click đóng panel (nút X)", { src: String(img.getAttribute("src") || "").slice(-48) });
      await uiJitter();

      const r2 = img.getBoundingClientRect();
      const gone = r2.width < 2 || r2.height < 2 || !d.isVisible(img);
      if (gone) {
        logMuaTienDo("Đã bấm thoát (X) — panel coi như đóng", { daBamThoat: "có", ketQua: "ok" });
        return true;
      }
    }

    logFlow("Không chắc đã đóng panel — thử thêm lần 2 sau delay");
    await sleep(180);
    const dlgAgain = findBlacksmithShopDialogRoot();
    if (!dlgAgain && !isBlacksmithToolsPanelOpen()) {
      logMuaTienDo("Lần 2 đóng: shop đã không còn — dừng", { ketQua: "ok" });
      return true;
    }
    const imgs2raw = queryAllGameDocs("img[src*='icons/close'], img[src*='close.png']");
    let imgs2 = imgs2raw;
    if (dlgAgain) {
      const sc2 = imgs2raw.filter((img) => dlgAgain.contains(img));
      if (sc2.length) imgs2 = sc2;
    }
    for (const img of imgs2) {
      if (!img.classList.contains("cursor-pointer")) continue;
      const r = img.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      d.nativeClickClose(img);
      await uiJitter();
      logMuaTienDo("Đã bấm thoát (X) — lần 2", { daBamThoat: "có", ketQua: "ok" });
      return true;
    }
    d.sendEscapeToGameWindows();
    await sleep(120);
    if (!findBlacksmithShopDialogRoot() && !isBlacksmithToolsPanelOpen()) {
      logMuaTienDo("Đóng panel bằng Escape fallback", { daBamThoat: "có", ketQua: "ok" });
      return true;
    }
    logMuaTienDo("Đóng panel thất bại — không thấy nút X hợp lệ", { daBamThoat: "thử rồi", ketQua: "fail" });
    return false;
  }

  function textLooksLikeCraftQuantity(text, qty) {
    const t = String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const q = String(qty);
    if (!/\bcraft\b|\bchế\b|\btạo\b|\bforge\b/.test(t)) return false;
    if (qty === 1) {
      return (
        /\b1\b/.test(t) ||
        /\b1\s*$/.test(t) ||
        /\bcraft\s*1\b/.test(t) ||
        /\bcraft1\b/.test(t) ||
        /\bchế\s*1\b/.test(t) ||
        /\btạo\s*1\b/.test(t) ||
        t.endsWith(" 1")
      );
    }
    return new RegExp(`\\b${q}\\b`).test(t) || t.endsWith(` ${q}`);
  }

  function findCraftQuantityButton() {
    const buttons = queryAllGameDocs("button,[role='button']");
    const scoreBtn = (btn, qty) => {
      const raw = (btn.textContent || "").replace(/\s+/g, " ").trim();
      const st = String(btn.getAttribute("style") || "");
      let sc = 0;
      if (st.includes("light_button") || st.includes("primaryButton") || st.includes("button-image")) sc += 8;
      if (btn.querySelector(".mb-1") && textLooksLikeCraftQuantity(raw, qty)) sc += 10;
      if (textLooksLikeCraftQuantity(raw, qty)) sc += 20;
      return sc;
    };

    let best = null;
    let bestSc = 0;
    for (const btn of buttons) {
      if (!d.isVisible(btn) || btn.disabled) continue;
      const sc = scoreBtn(btn, 1);
      if (sc > bestSc) {
        bestSc = sc;
        best = btn;
      }
    }
    if (best && bestSc >= 20) return best;

    for (const btn of buttons) {
      if (!d.isVisible(btn) || btn.disabled) continue;
      const raw = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (textLooksLikeCraftQuantity(raw, 1)) return btn;
    }
    for (const btn of buttons) {
      if (!d.isVisible(btn) || btn.disabled) continue;
      const raw = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (textLooksLikeCraftQuantity(raw, 10)) return btn;
    }
    return null;
  }

  /** Giống findCraftQuantityButton nhưng gồm cả nút disabled (thiếu nguyên liệu). */
  function findCraftQuantityButtonIncludingDisabled() {
    const buttons = queryAllGameDocs("button,[role='button']");
    const scoreBtn = (btn, qty) => {
      const raw = (btn.textContent || "").replace(/\s+/g, " ").trim();
      const st = String(btn.getAttribute("style") || "");
      let sc = 0;
      if (st.includes("light_button") || st.includes("primaryButton") || st.includes("button-image")) sc += 8;
      if (btn.querySelector(".mb-1") && textLooksLikeCraftQuantity(raw, qty)) sc += 10;
      if (textLooksLikeCraftQuantity(raw, qty)) sc += 20;
      return sc;
    };

    let best = null;
    let bestSc = 0;
    for (const btn of buttons) {
      if (!d.isVisible(btn)) continue;
      const sc = scoreBtn(btn, 1);
      if (sc > bestSc) {
        bestSc = sc;
        best = btn;
      }
    }
    if (best && bestSc >= 20) return best;

    for (const btn of buttons) {
      if (!d.isVisible(btn)) continue;
      const raw = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (textLooksLikeCraftQuantity(raw, 1)) return btn;
    }
    for (const btn of buttons) {
      if (!d.isVisible(btn)) continue;
      const raw = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (textLooksLikeCraftQuantity(raw, 10)) return btn;
    }
    return null;
  }

  function visibleInsufficientInShopPanels() {
    const roots = queryAllGameDocs(
      '[class*="Panel"], [class*="Modal"], [class*="InnerPanel"], [role="dialog"]',
    );
    const re = /insufficient|not enough|can't craft|cannot craft|need \d+\s+more/i;
    for (const root of roots) {
      if (!d.isVisible(root)) continue;
      const t = d.textOf(root);
      if (t.length > 2500) continue;
      if (re.test(t)) return true;
    }
    return false;
  }

  function isToolPurchaseBlockedInUi() {
    return visibleInsufficientInShopPanels();
  }

  async function abortBuyBecauseConditionsNotMet(nextJob) {
    await sleep(60);
    if (!isToolPurchaseBlockedInUi()) return false;
    const req = nextJob?.requester;
    const tt = nextJob?.toolType;
    if (req === "mine") {
      markCraftResourceBlockedBuy(tt, req, 4 * 60 * 1000);
      const head = runtime.buyToolQueue[0];
      if (head && head.toolType === tt && head.requester === req) runtime.buyToolQueue.shift();
      else {
        const ix = runtime.buyToolQueue.findIndex((j) => j.toolType === tt && j.requester === req);
        if (ix >= 0) runtime.buyToolQueue.splice(ix, 1);
      }
      logMuaTienDo("Mine: thiếu tài nguyên — bỏ job cuốc này, chặn xếp lại ~4 phút (tier khác vẫn xếp được)", {
        tool: tt,
        daBamMuaCraft: false,
        daBamThoatDongShop: "đóng shop để tiếp tục đào",
      });
      logFlow("Đào đá: không đủ craft cuốc này — bỏ 1 job, thử tier/quặng khác trong vòng mine (không khóa cả hàng mua)", {
        tool: tt,
      });
      runtime.lastAction = `buy_mine_blocked_resources_${tt || "tool"}`;
      await closeToolShopPanel();
      return true;
    }
    logMuaTienDo("Abort mua — điều kiện không đủ, KHÔNG đóng cửa sổ (để xem shop)", {
      tool: tt,
      daBamMuaCraft: false,
      daBamThoatDongShop: "không — chỉ đóng sau khi mua/craft thành công",
    });
    logFlow("Điều kiện mua tool không đủ — xóa hàng chờ, giữ panel mở (không bấm X)", {
      tool: tt,
    });
    runtime.buyToolQueue.length = 0;
    runtime.suppressBuyEnqueueUntil = now() + 5 * 60 * 1000;
    runtime.lastAction = `buy_blocked_${tt || "tool"}`;
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BATCH BUY — Luồng mua tool mới (UI có nút "Batch Buy" trong workbench)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Ánh xạ toolType → slug img src để tìm trong Batch Buy dialog. */
  const BATCH_BUY_TOOL_SRC_SLUG = {
    axe: "tools/axe",
    wood_pickaxe: "tools/wood_pickaxe",
    stone_pickaxe: "tools/stone_pickaxe",
    iron_pickaxe: "tools/iron_pickaxe",
    gold_pickaxe: "tools/gold_pickaxe",
    pickaxe: "tools/wood_pickaxe",
  };

  /** Aria-label checkbox của từng tool trong Batch Buy. */
  const BATCH_BUY_ARIA_RE = {
    axe: /\baxe\b/i,
    wood_pickaxe: /\bpickaxe\b/i,
    stone_pickaxe: /\bstone\s*pickaxe\b/i,
    iron_pickaxe: /\biron\s*pickaxe\b/i,
    gold_pickaxe: /\bgold\s*pickaxe\b/i,
    pickaxe: /\bpickaxe\b/i,
  };

  /** Tìm nút "Batch Buy" trong workbench dialog (nằm dưới lưới Land Tools). */
  function findBatchBuyButton() {
    for (const btn of queryAllGameDocs("button")) {
      if (!d.isVisible(btn) || btn.disabled) continue;
      const t = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (t === "batch buy" || /^batch\s*buy$/i.test(t)) return btn;
    }
    return null;
  }

  /**
   * Tìm root element của Batch Buy dialog đang mở.
   * Nhận dạng: có text "Batch Buy" + checkbox [role="checkbox"] + "Land Tools".
   */
  function findBatchBuyDialogRoot() {
    // Cách 1: [role=dialog] hoặc headlessui open
    for (const root of queryAllGameDocs('[data-headlessui-state="open"],[role="dialog"]')) {
      if (!d.isVisible(root)) continue;
      const t = (root.textContent || "").replace(/\s+/g, " ").toLowerCase();
      if (!t.includes("batch buy")) continue;
      if (root.querySelector('[role="checkbox"]')) return root;
    }
    // Cách 2: div panel thường (game render trong div có bg-[#c28569] hoặc scrollable)
    const divs = queryAllGameDocs("div.relative, div.scrollable");
    for (const div of divs) {
      if (!d.isVisible(div)) continue;
      const r = div.getBoundingClientRect();
      if (r.width < 200 || r.height < 150) continue;
      const t = (div.textContent || "").replace(/\s+/g, " ").toLowerCase();
      if (!t.includes("batch buy")) continue;
      if (!t.includes("land tools") && !t.includes("axe") && !t.includes("pickaxe")) continue;
      if (div.querySelector('[role="checkbox"]')) return div;
    }
    return null;
  }

  /** Batch Buy dialog đang hiển thị? */
  function isBatchBuyDialogOpen() {
    return !!findBatchBuyDialogRoot();
  }

  /**
   * Tìm row của một tool trong Batch Buy dialog.
   * Row có dạng: div.flex.flex-col.gap-1 chứa img.h-6 (tool icon) + checkbox + input.
   */
  function findBatchBuyToolRow(toolType, dialogRoot) {
    const srcSlug = BATCH_BUY_TOOL_SRC_SLUG[toolType] || ("tools/" + String(toolType));
    const ariaRe = BATCH_BUY_ARIA_RE[toolType];
    const searchIn = dialogRoot || document;

    let panels;
    try {
      panels = searchIn.querySelectorAll("div.flex.flex-col.gap-1");
    } catch (_e) {
      return null;
    }

    for (const panel of panels) {
      if (!d.isVisible(panel)) continue;

      // ── Kiểm tra theo img.h-6 src ──
      try {
        const imgs = panel.querySelectorAll("img.h-6, img[class*='h-6']");
        for (const img of imgs) {
          const src = String(img.getAttribute("src") || "").toLowerCase();
          if (src.startsWith("data:")) continue; // bỏ qua base64 (Oil Drill)
          if (src.includes(srcSlug)) return panel;
        }
      } catch (_e) { /* ignore */ }

      // ── Kiểm tra theo aria-label của checkbox ──
      if (ariaRe) {
        try {
          const cb = panel.querySelector('[role="checkbox"]');
          if (cb) {
            const lbl = String(cb.getAttribute("aria-label") || "");
            if (ariaRe.test(lbl)) {
              // Tránh nhầm wood_pickaxe với stone/iron/gold
              if (toolType === "wood_pickaxe" && /stone|iron|gold/i.test(lbl)) continue;
              // Tránh nhầm pickaxe generic với axe
              if (toolType === "axe" && /pickaxe/i.test(lbl)) continue;
              return panel;
            }
          }
        } catch (_e) { /* ignore */ }
      }

      // ── Fallback: text span tên tool ──
      try {
        const span = panel.querySelector("span.text-xs, span[class*='truncate']");
        if (span) {
          const nm = (span.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
          if (toolType === "axe" && nm === "axe") return panel;
          if (toolType === "wood_pickaxe" && nm === "pickaxe") return panel;
          if (toolType === "stone_pickaxe" && nm === "stone pickaxe") return panel;
          if (toolType === "iron_pickaxe" && nm === "iron pickaxe") return panel;
          if (toolType === "gold_pickaxe" && nm === "gold pickaxe") return panel;
        }
      } catch (_e) { /* ignore */ }
    }
    return null;
  }

  /**
   * Kiểm tra row tool có thể mua không:
   * Input KHÔNG readonly = hàng còn / đủ tài nguyên.
   */
  function isBatchBuyRowAvailable(row) {
    if (!row) return false;
    try {
      const input = row.querySelector('input[type="number"]');
      if (!input) return false;
      if (input.hasAttribute("readonly")) return false;
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Set giá trị React controlled input qua native setter.
   * input.value = X không hoạt động với controlled input của React.
   */
  function setNativeInputValue(input, val) {
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(input, String(val));
      } else {
        input.value = String(val);
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (_e) {
      try { input.value = String(val); } catch (_e2) { /* ignore */ }
    }
  }

  /** Click nút "Max" trong row để set số lượng tối đa. Trả về true nếu thành công. */
  async function clickBatchBuyMaxInRow(row) {
    if (!row) return false;
    try {
      const buttons = row.querySelectorAll("button,[role='button']");
      for (const btn of buttons) {
        const t = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (t !== "max") continue;
        if (btn.disabled || !d.isVisible(btn)) continue;
        d.clickAtCenter(btn);
        await sleep(rand(130, 230));
        const input = row.querySelector('input[type="number"]');
        if (input && Number(input.value || 0) > 0) return true;
        // Retry 1 lần
        d.clickAtCenter(btn);
        await sleep(rand(100, 180));
        return true; // tin vào click dù chưa verify
      }
    } catch (_e) { /* ignore */ }
    return false;
  }

  /**
   * Fallback: click "50%" hoặc set quantity = 1 nếu Max không khả dụng.
   * Hữu ích khi thiếu tài nguyên mua nhiều nhưng vẫn đủ mua ít.
   */
  async function setBatchBuyQuantityFallback(row) {
    if (!row) return false;
    try {
      const input = row.querySelector('input[type="number"]');
      if (!input || input.hasAttribute("readonly")) return false;

      // Thử "50%" trước
      const buttons = row.querySelectorAll("button,[role='button']");
      for (const btn of buttons) {
        const t = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (t === "50%" && !btn.disabled && d.isVisible(btn)) {
          d.clickAtCenter(btn);
          await sleep(rand(120, 220));
          if (Number(input.value || 0) > 0) return true;
          break;
        }
      }

      // Set 1 qua native setter
      setNativeInputValue(input, 1);
      await sleep(rand(80, 150));
      return Number(input.value || 0) > 0;
    } catch (_e) {
      return false;
    }
  }

  /** Tìm nút Confirm/Mua ở cuối Batch Buy dialog. */
  function findBatchBuyConfirmButton(dialogRoot) {
    let buttons;
    try {
      buttons = dialogRoot
        ? Array.from(dialogRoot.querySelectorAll("button"))
        : queryAllGameDocs("button");
    } catch (_e) {
      buttons = queryAllGameDocs("button");
    }
    // Exact match trước
    for (const btn of buttons) {
      if (!d.isVisible(btn) || btn.disabled) continue;
      const t = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (/^(confirm|xác\s*nhận|buy all|mua\s*tất\s*cả|purchase|batch buy|buy)$/i.test(t)) return btn;
    }
    // Partial match
    for (const btn of buttons) {
      if (!d.isVisible(btn) || btn.disabled) continue;
      const t = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (t.includes("confirm") || t.includes("xác nhận") || t.includes("batch buy") || t.includes("buy all")) return btn;
    }
    return null;
  }

  /** Xác nhận click Batch Buy lần thứ 2 trong modal xác nhận nếu có. */
  async function confirmBatchBuySecondClick() {
    logBuyStep("Batch Buy: Đang chờ modal xác nhận thứ 2 xuất hiện...", {});
    
    // Quét tìm button trong tối đa 2.5 giây (10 attempts * 250ms)
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(250);
      
      const buttons = queryAllGameDocs("button");
      // Quét ngược từ cuối DOM lên (ưu tiên modal z-index cao nằm sau cùng trong HTML)
      for (let i = buttons.length - 1; i >= 0; i--) {
        const btn = buttons[i];
        if (!d.isVisible(btn) || btn.disabled) continue;
        
        const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        
        // Modal xác nhận lần 2 của game thường có text "batch buy", "confirm", "buy", "xác nhận"
        if (text === "batch buy" || text === "confirm" || text === "buy" || text === "xác nhận") {
          logBuyStep(`Batch Buy: Đã tìm thấy nút xác nhận thứ 2: "${btn.textContent || ""}"`, {});
          d.clickAtCenter(btn);
          await sleep(rand(800, 1400));
          return true;
        }
      }
    }
    
    logBuyStep("Batch Buy: Không thấy hoặc không cần nút xác nhận thứ 2.", {});
    return false;
  }

  /** Đóng Batch Buy dialog bằng nút X hoặc Escape. */
  async function closeBatchBuyDialog() {
    if (!isBatchBuyDialogOpen()) return true;
    const root = findBatchBuyDialogRoot();
    if (root) {
      try {
        const closeImgs = root.querySelectorAll(
          "img[src*='icons/close'], img[src*='close.png'], img.cursor-pointer"
        );
        for (const img of closeImgs) {
          const src = String(img.getAttribute("src") || "").toLowerCase();
          if (!src.includes("close")) continue;
          if (!d.isVisible(img)) continue;
          const target = img.closest("button,[role='button'],[class*='cursor-pointer']") || img;
          d.nativeClickClose(target);
          await sleep(rand(180, 320));
          if (!isBatchBuyDialogOpen()) return true;
        }
      } catch (_e) { /* ignore */ }
    }
    // Fallback: Escape
    d.sendEscapeToGameWindows();
    await sleep(rand(150, 280));
    return !isBatchBuyDialogOpen();
  }

  /**
   * Luồng mua tool qua Batch Buy UI mới:
   *  1. Đảm bảo workbench dialog đang mở
   *  2. Click "Batch Buy" button
   *  3. Tìm row tool cần mua, kiểm tra available
   *  4. Click Max để set số lượng
   *  5. Click Confirm
   * @returns {boolean} true nếu đã click Confirm thành công
   */
  async function tryCraftToolViaBatchBuy(job) {
    const toolType = job?.toolType;
    const requester = job?.requester;
    logBuyStep("Batch Buy: bắt đầu luồng mới", { toolType, requester });

    // ── Bước 1: Mở workbench nếu chưa mở ──
    if (!isBatchBuyDialogOpen() && !isBlacksmithToolsPanelOpen()) {
      const bench = findWorkbenchClickable();
      if (!bench) {
        logBuyStep("Batch Buy: không thấy tile Workbench", { toolType });
        return false;
      }
      openWorkbenchClick(bench);
      await sleep(rand(320, 520));
    }

    // ── Bước 2: Click nút "Batch Buy" nếu chưa vào panel đó ──
    if (!isBatchBuyDialogOpen()) {
      const batchBtn = findBatchBuyButton();
      if (!batchBtn) {
        logBuyStep("Batch Buy: không thấy nút 'Batch Buy' — game có thể dùng UI cũ", { toolType });
        return false; // Không có UI mới → fallback sang Craft 1
      }
      d.clickAtCenter(batchBtn);
      logBuyStep("Batch Buy: đã click nút Batch Buy", { toolType });
      // Chờ dialog mở tối đa 2.4s
      for (let w = 0; w < 12; w += 1) {
        await sleep(200);
        if (isBatchBuyDialogOpen()) break;
      }
    }

    if (!isBatchBuyDialogOpen()) {
      logBuyStep("Batch Buy: dialog không mở sau click — thất bại", { toolType });
      return false;
    }

    const dlgRoot = findBatchBuyDialogRoot();
    logBuyStep("Batch Buy: dialog mở — tìm row tool", { toolType, hasRoot: !!dlgRoot });

    // ── Bước 3: Tìm row tool ──
    const toolRow = findBatchBuyToolRow(toolType, dlgRoot);
    if (!toolRow) {
      logBuyStep("Batch Buy: không tìm thấy row tool", { toolType });
      await closeBatchBuyDialog();
      return false;
    }

    // ── Bước 4: Kiểm tra có thể mua không ──
    if (!isBatchBuyRowAvailable(toolRow)) {
      logBuyStep("Batch Buy: tool này bị readonly (hết stock hoặc thiếu tài nguyên)", { toolType });
      await closeBatchBuyDialog();
      return false;
    }

    // ── Bước 5: Set số lượng (Max trước, fallback 50%/1) ──
    const maxOk = await clickBatchBuyMaxInRow(toolRow);
    if (!maxOk) {
      logBuyStep("Batch Buy: Max không khả dụng — thử fallback 50%/set 1", { toolType });
      const fallbackOk = await setBatchBuyQuantityFallback(toolRow);
      if (!fallbackOk) {
        logBuyStep("Batch Buy: không set được số lượng", { toolType });
        await closeBatchBuyDialog();
        return false;
      }
    }
    logBuyStep("Batch Buy: đã set số lượng", { toolType });
    await sleep(rand(200, 360));

    // ── Bước 6: Click Confirm ──
    const confirmBtn = findBatchBuyConfirmButton(dlgRoot) || findBatchBuyConfirmButton(null);
    if (!confirmBtn) {
      logBuyStep("Batch Buy: không tìm thấy nút Confirm", { toolType });
      await closeBatchBuyDialog();
      return false;
    }

    d.clickAtCenter(confirmBtn);
    logBuyStep("Batch Buy: đã click Confirm lần 1 — chờ modal xác nhận lần 2...", { toolType });
    await uiJitter();
    await sleep(rand(400, 700));
    
    // Click xác nhận lần 2
    await confirmBatchBuySecondClick();
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LUỒNG CŨ — Craft 1 (fallback khi Batch Buy không khả dụng)
  // ═══════════════════════════════════════════════════════════════════════════

  async function tryCraftToolViaWorkbench(job) {

    runtime.workbenchRestockNoAutoThisTry = false;
    const toolType = job?.toolType;
    const requester = job?.requester;
    logBuyStep("Bắt đầu vào Workbench", { toolType, requester });
    logMuaTienDo("① Vào Workbench — mục tiêu mua", {
      toolType,
      tenCongCu: tenCongCuMua(toolType),
      requester,
      daMoPanelShop: false,
      daTimThayIconDungTool: false,
      daClickChuyenTab: "chưa",
      tabSelectboxDungCongCu: false,
      daBamMuaCraft: false,
      daBamThoatDongShop: "chưa — chỉ sau khi mua xong mới đóng",
    });

    const bench = findWorkbenchClickable();
    if (!bench) {
      logMuaTienDo("Lỗi — không thấy tile Workbench", {
        daMoPanelShop: false,
        daBamThoatDongShop: "không",
        daBamMuaCraft: false,
      });
      logBuyStep("Không tìm thấy ô Workbench/Blacksmith", { toolType });
      logFlow("Không tìm thấy Workbench trên màn hình", { toolType });
      return false;
    }
    if (isBlacksmithToolsPanelOpen()) {
      logBuyStep("Panel shop đã mở — bỏ qua click Workbench (tránh toggle đóng)", { toolType });
      logMuaTienDo("② Panel Blacksmith đã mở — không click lại tile", {
        tenCongCu: tenCongCuMua(toolType),
        daMoPanelShop: true,
        daBamThoatDongShop: "chưa",
      });
    } else if (!openWorkbenchClick(bench)) {
      logMuaTienDo("Lỗi — click mở Workbench thất bại", {
        daMoPanelShop: false,
        daBamThoatDongShop: "không",
        daBamMuaCraft: false,
      });
      logBuyStep("Click Workbench thất bại", { toolType });
      logFlow("Click Workbench thất bại", { toolType });
      return false;
    } else {
      logBuyStep("Đã click Workbench, chờ panel mở", { toolType });
      logMuaTienDo("② Đã mở panel Blacksmith/Workbench", {
        tenCongCu: tenCongCuMua(toolType),
        daMoPanelShop: true,
        daBamThoatDongShop: "chưa",
      });
    }
    await uiJitter();
    await sleep(rand(220, 420));

    let itemImg = pickWorkbenchToolItemImg(toolType, requester);
    if (!itemImg) {
      await sleep(200);
      itemImg = pickWorkbenchToolItemImg(toolType, requester);
    }
    if (!itemImg) {
      logMuaTienDo("Lỗi — không thấy icon công cụ trong panel", {
        daMoPanelShop: true,
        daTimThayIconDungTool: false,
        daClickChuyenTab: "không được (không có icon)",
        daBamMuaCraft: false,
        daBamThoatDongShop: "không — giữ shop để xem",
      });
      logBuyStep("Không thấy icon tool trong panel", { toolType });
      logFlow("Không tìm thấy icon tool trong panel", { toolType });
      return false;
    }
    const fileIcon = toolFileFromSrcEl(itemImg);
    const iconKhopToolType = itemImgMatchesToolType(itemImg, toolType);
    logMuaTienDo("③ Icon trong panel vs mục tiêu", {
      tenCongCu: tenCongCuMua(toolType),
      fileIconTimDuoc: fileIcon,
      soSanhDungCongCuMuonMua: iconKhopToolType,
      daMoPanelShop: true,
    });

    const tabOk = await selectWorkbenchToolTab(itemImg, toolType, requester);
    logBlacksmithChonHienTai(toolType, itemImg, { buoc: "sau selectWorkbenchToolTab", tabOk });
    logMuaTienDo("④ Sau bước chuyển tab (double-click ô nâu)", {
      tenCongCu: tenCongCuMua(toolType),
      daClickChuyenTab: "đã thử (xem log Double-click ô tab nâu)",
      tabSelectboxDungCongCu: tabOk,
      soSanhDungCongCu: tabOk,
      daBamMuaCraft: false,
      daBamThoatDongShop: "chưa",
    });
    if (!tabOk) {
      logBlacksmithCraftButtonsDebug();
      logMuaTienDo("Dừng — tab chưa đúng (không có selectbox đúng slot), KHÔNG bấm Craft, KHÔNG đóng shop", {
        daBamMuaCraft: false,
        daBamThoatDongShop: "không",
      });
      logBuyStep("Dừng: chưa thấy selectbox trên đúng tab — không Craft", { toolType });
      logFlow("Blacksmith: tab công cụ chưa được chọn (thiếu selectbox góc)", { toolType });
      return false;
    }
    logBuyStep("Tab OK (selectbox) — chờ scale icon ≥ 2.05 rồi mới Craft", { toolType });
    await waitForWorkbenchIconScaleAfterTabOk(toolType, requester);
    itemImg = pickWorkbenchToolItemImg(toolType, requester) || itemImg;
    logBlacksmithChonHienTai(toolType, itemImg, { buoc: "sau cho scale, truoc Craft" });
    const sc = readWorkbenchItemImgTransformScale(itemImg);
    logMuaTienDo("⑤ Chờ scale xong — chuẩn bị Mua/Craft", {
      tenCongCu: tenCongCuMua(toolType),
      scaleIcon: sc,
      tabSelectboxDungCongCu: true,
      daBamMuaCraft: false,
      daBamThoatDongShop: "chưa",
    });
    logBuyStep("Làm tiếp — tìm nút Craft (1 click)", { toolType });
    await uiJitter();
    await sleep(rand(180, 320));

    /** Đã đóng panel vì có Restock nhưng tắt «Restock Blacksmith» (không nhấn Restock). */
    let closedShopRestockNoAuto = false;

    let craftBtn = findCraftQuantityButton();
    if (!craftBtn) {
      await sleep(380);
      craftBtn = findCraftQuantityButton();
    }
    if (!craftBtn && runtime.settings.autoRestockBlacksmith) {
      const restock = findBlacksmithRestockButton();
      if (restock && d.isVisible(restock) && !restock.disabled && openWorkbenchClick(restock)) {
        logBuyStep("Hết stock, bấm Restock", { toolType });
        logFlow("Hết stock blacksmith — đã bấm Restock, chờ Craft 1", { toolType });
        await sleep(rand(350, 650));
        await uiJitter();
        craftBtn = findCraftQuantityButton();
      }
    } else if (!craftBtn && !runtime.settings.autoRestockBlacksmith) {
      const rsEarly = findVisibleRestockInToolsDialog();
      if (rsEarly && d.isVisible(rsEarly)) {
        logFlow("Có nút Restock, không bật «Restock Blacksmith» — đóng shop (không nhấn Restock)", { toolType });
        logMuaTienDo("Đóng panel vì Restock hiển thị", { toolType, daBamThoatDongShop: "có" });
        await closeToolShopPanel();
        closedShopRestockNoAuto = true;
        runtime.workbenchRestockNoAutoThisTry = true;
      } else {
        logFlow("Không thấy Craft 1 — bỏ qua Restock (tắt «Restock Blacksmith» trong popup)", { toolType });
      }
    }
    if (!craftBtn) {
      craftBtn = findCraftQuantityButtonIncludingDisabled();
    }
    if (!craftBtn) {
      if (!runtime.settings.autoRestockBlacksmith) {
        const rs = findVisibleRestockInToolsDialog();
        if (rs && d.isVisible(rs)) {
          logFlow("Vẫn không Craft — có Restock: đóng shop", { toolType });
          logMuaTienDo("Đóng panel (Restock + không Craft)", { toolType, daBamThoatDongShop: "có" });
          await closeToolShopPanel();
          closedShopRestockNoAuto = true;
          runtime.workbenchRestockNoAutoThisTry = true;
        }
      }
      logBlacksmithChonHienTai(toolType, itemImg, { buoc: "khong tim thay Craft — log nut" });
      logBlacksmithCraftButtonsDebug();
      logMuaTienDo("Lỗi — không thấy nút Craft/Mua", {
        daBamMuaCraft: false,
        daBamThoatDongShop: closedShopRestockNoAuto ? "có" : "không",
      });
      logBuyStep("Không thấy nút Craft 1/10", { toolType });
      logFlow("Không tìm thấy nút Craft 1 / Craft 10 (xem log [Blacksmith · nút Craft/Mua])", { toolType });
      return false;
    }
    const craftLabel = (craftBtn.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    logFlow("[Blacksmith · sẽ bấm Craft]", {
      nutText: craftLabel,
      disabled: !!craftBtn.disabled,
      toolType,
    });
    logMuaTienDo("⑥ Tìm thấy nút Mua/Craft", {
      nutText: craftLabel,
      nutDisabled: !!craftBtn.disabled,
      sapBamMua: !craftBtn.disabled,
      daBamThoatDongShop: "chưa",
    });
    if (craftBtn.disabled) {
      if (!runtime.settings.autoRestockBlacksmith) {
        const rs = findVisibleRestockInToolsDialog();
        if (rs && d.isVisible(rs)) {
          logFlow("Craft disabled + có Restock — đóng shop (không nhấn Restock)", { toolType, craftLabel });
          logMuaTienDo("Đóng panel: Restock hiển thị, Craft không bấm được", { toolType, daBamThoatDongShop: "có" });
          await closeToolShopPanel();
          closedShopRestockNoAuto = true;
          runtime.workbenchRestockNoAutoThisTry = true;
        }
      }
      logBlacksmithCraftButtonsDebug();
      logMuaTienDo("Dừng — Craft disabled (thiếu nguyên liệu?)", {
        daBamMuaCraft: false,
        daBamThoatDongShop: closedShopRestockNoAuto ? "có" : "không",
      });
      logBuyStep("Craft đang disabled — không đủ nguyên liệu hoặc stock", { toolType, craftLabel });
      logFlow("Blacksmith: nút Craft disabled — không mua được", { toolType, craftLabel });
      return false;
    }
    if (!singleClickCraftButton(craftBtn)) {
      logBlacksmithCraftButtonsDebug();
      logMuaTienDo("Lỗi — gọi click Craft thất bại, KHÔNG đóng shop", {
        daBamMuaCraft: false,
        daBamThoatDongShop: "không",
      });
      logBuyStep("Click Craft thất bại", { toolType, craftLabel });
      logFlow("Click Craft thất bại", { toolType, craftLabel });
      return false;
    }
    logMuaTienDo("⑦ ĐÃ bấm Mua/Craft (1 lần) — chờ bước đóng shop ở queue", {
      tenCongCu: tenCongCuMua(toolType),
      nutText: craftLabel,
      daBamMuaCraft: true,
      daBamThoatDongShop: "chưa — processBuyToolQueue sẽ gọi X sau khi shift queue",
    });
    logBuyStep("Đã bấm Craft tool thành công", { toolType, craftLabel });
    await uiJitter();
    logFlow("Đã craft tool qua Workbench", { toolType });
    return true;
  }

  async function ensureBlacksmithOpen() {
    logBuyStep("Thử mở Blacksmith", {});
    if (isBlacksmithToolsPanelOpen()) {
      logBuyStep("Blacksmith/Tools đã mở — không click thêm", {});
      return true;
    }
    const bench = findWorkbenchClickable();
    if (bench && openWorkbenchClick(bench)) {
      logBuyStep("Đã mở Blacksmith bằng tile workbench", {});
      await uiJitter();
      return true;
    }
    const openBtn = d.findInteractiveButtonByText(/blacksmith|workbench|tools|forge|smith|crafting/i);
    if (openBtn && d.click(openBtn)) {
      logBuyStep("Đã mở Blacksmith bằng nút text", {});
      await uiJitter();
      return true;
    }

    // Fallback: click directly on any visible blacksmith/workbench image on map.
    const imgFallback = queryAllGameDocs(
      "img[src*='workbench'],img[src*='blacksmith'],img[src*='forge'],img[alt*='blacksmith' i],img[alt*='workbench' i]",
    )
      .filter((img) => d.isVisible(img) && d.isInViewport(img) && !isFerryOrBoatElement(img))
      .sort((a, b) => d.centerDistance(a) - d.centerDistance(b))[0];

    if (imgFallback && openWorkbenchClick(imgFallback)) {
      logBuyStep("Đã mở Blacksmith bằng ảnh fallback", {});
      logFlow("Fallback mở Blacksmith/Workbench bằng ảnh");
      await uiJitter();
      return true;
    }

    logBuyStep("Không mở được Blacksmith", {});
    return false;
  }

  async function processBuyToolQueue() {
    if (!runtime.settings.autoBuyTools) {
      if (runtime.buyToolQueue.length > 0) {
        logFlow("Không xử lý hàng mua tool: tắt «Auto mua công cụ + hạt giống» trong popup extension", {
          queueSize: runtime.buyToolQueue.length,
          head: runtime.buyToolQueue[0],
        });
      }
      return false;
    }
    if (runtime.buyToolLock) {
      if (runtime.buyToolQueue.length > 0) {
        logFlow("Chờ xử lý mua tool: buyToolLock (lần gọi khác đang chạy)", {
          queueSize: runtime.buyToolQueue.length,
        });
      }
      return false;
    }
    if (!runtime.buyToolQueue.length) return false;

    if (!runtime.settings.autoChop) {
      const keep = runtime.buyToolQueue.filter((j) => j.requester !== "chop");
      runtime.buyToolQueue.length = 0;
      runtime.buyToolQueue.push(...keep);
    }
    if (!runtime.settings.autoMine) {
      const keep = runtime.buyToolQueue.filter((j) => j.requester !== "mine");
      runtime.buyToolQueue.length = 0;
      runtime.buyToolQueue.push(...keep);
    }
    if (!runtime.buyToolQueue.length) return false;

    /** Đầu hàng = nhu cầu mới nhất (enqueue luôn unshift); không ưu tiên mine/chop cố định. */
    const nextJob = runtime.buyToolQueue[0];
    if (!nextJob) return false;

    runtime.buyToolLock = true;
    try {
      logBuyStep("Bắt đầu xử lý hàng chờ mua tool", {
        toolType: nextJob.toolType,
        requester: nextJob.requester,
      });
      logFlow("Xử lý mua tool — đầu hàng = cái vừa cần (giữ job nếu chưa thành công)", {
        toolType: nextJob.toolType,
        requester: nextJob.requester,
        hangDoi: runtime.buyToolQueue.length,
      });

      // ── Ưu tiên Batch Buy (UI mới) ──
      let ok = await tryCraftToolViaBatchBuy(nextJob);
      let finalRestockNoAuto = false;

      if (ok) {
        logFlow("Batch Buy: thành công!", { tool: nextJob.toolType });
      } else {
        // ── Fallback: luồng cũ Craft 1 ──
        logFlow("Batch Buy không thành công — thử luồng Craft 1 cũ", { tool: nextJob.toolType });
        ok = await tryCraftToolViaWorkbench(nextJob);
        finalRestockNoAuto = runtime.workbenchRestockNoAutoThisTry;
        if (!ok) {
          logFlow("Lần 1 Workbench (cũ) thất bại — thử mở Blacksmith rồi làm lại", { tool: nextJob.toolType });
          await ensureBlacksmithOpen();
          await sleep(rand(150, 300));
          ok = await tryCraftToolViaWorkbench(nextJob);
          finalRestockNoAuto = runtime.workbenchRestockNoAutoThisTry;
        }
      }

      if (!ok && runtime.settings.autoRestockBlacksmith) {
        logFlow("Craft qua Workbench thất bại, thử Restock Blacksmith", {
          tool: nextJob.toolType,
        });
        const restockBtn = findBlacksmithRestockButton();
        if (restockBtn && d.click(restockBtn)) {
          await uiJitter();
          ok = await tryCraftToolViaWorkbench(nextJob);
          finalRestockNoAuto = runtime.workbenchRestockNoAutoThisTry;
        } else {
          logFlow("Không click được Restock hoặc không tìm thấy nút Restock — job vẫn trong queue", {
            tool: nextJob.toolType,
          });
        }
      }


      if (!ok && finalRestockNoAuto) {
        const tt = nextJob.toolType;
        const rq = nextJob.requester;
        markRestockBlockedBuy(tt, rq, 150000);
        runtime.buyToolQueue.shift();
        logFlow(
          "Đã bỏ job mua tool — shop cần Restock nhưng «Restock Blacksmith» đang tắt. Bật trong popup hoặc Restock tay trong game; ~2,5 phút không tự xếp hàng mua lại (tránh mở/đóng lặp).",
          { tool: tt, requester: rq },
        );
        runtime.lastAction = `buy_restock_blocked_${tt}`;
        await closeToolShopPanel();
        return false;
      }

      if (ok) {
        runtime.buyToolQueue.shift();
        clearRestockBlockedBuy(nextJob.toolType, nextJob.requester);
        clearCraftResourceBlockedBuy(nextJob.toolType, nextJob.requester);
        markPostToolBuyCooldown(nextJob.toolType, nextJob.requester, 7500);
        try {
          S.gameBridge?.requestState?.().catch(() => {});
        } catch (_e) {
          // ignore
        }
        runtime.lastAction = `buy_${nextJob.toolType}_done`;
        logFlow("Mua/craft tool thành công", {
          tool: nextJob.toolType,
          queueLeft: runtime.buyToolQueue.length,
        });
        logMuaTienDo("⑧ Đã mua/craft thành công — mới đóng cửa sổ (X)", {
          tenCongCu: tenCongCuMua(nextJob.toolType),
          daBamMuaCraft: true,
          daBamThoatDongShop: "có — chỉ khi mua xong",
        });
        await sleep(rand(200, 450));
        await closeToolShopPanel();
        logMuaTienDo("⑧ Đã gọi đóng panel", {
          daBamThoatDongShop: "đã gọi",
          queueConLai: runtime.buyToolQueue.length,
        });
        return true;
      }

      logMuaTienDo("Chưa mua được sau các lần thử Workbench — KHÔNG đóng shop, chuyển fallback hoặc giữ queue", {
        toolType: nextJob.toolType,
        tenCongCu: tenCongCuMua(nextJob.toolType),
        daBamMuaCraft: false,
        daBamThoatDongShop: "không",
      });

      if (hasDisabledCraftInBlacksmithDialog()) {
        const tt0 = nextJob.toolType;
        const rq0 = nextJob.requester;
        markCraftResourceBlockedBuy(tt0, rq0, rq0 === "mine" ? 3 * 60 * 1000 : 90 * 1000);
        logMuaTienDo("Craft disabled — thiếu nguyên liệu; đóng shop, bỏ 1 job; chặn chỉ đúng tool (mine thử cuốc khác)", {
          toolType: tt0,
          tenCongCu: tenCongCuMua(tt0),
        });
        logFlow("Blacksmith: Craft 1 disabled (thiếu tài nguyên craft) — chặn xếp hàng theo tool, không suppress toàn bộ", {
          tool: tt0,
          requester: rq0,
        });
        runtime.buyToolQueue.shift();
        runtime.lastAction = `buy_craft_blocked_resources_${tt0}`;
        await closeToolShopPanel();
        return false;
      }

      if (await abortBuyBecauseConditionsNotMet(nextJob)) return false;

      logFlow("Fallback tìm nút Buy/Craft theo text", { tool: nextJob.toolType });
      let buyBtnAfterOpen = findBuyToolButton(nextJob.toolType);
      if (!buyBtnAfterOpen) {
        await ensureBlacksmithOpen();
        buyBtnAfterOpen = findBuyToolButton(nextJob.toolType);
      }
      if (!buyBtnAfterOpen) {
        if (await abortBuyBecauseConditionsNotMet(nextJob)) return false;
        runtime.lastAction = `buy_${nextJob.toolType}_not_found`;
        logMuaTienDo("Fallback: không tìm thấy nút mua — KHÔNG đóng shop", {
          daBamMuaCraft: false,
          daBamThoatDongShop: "không",
        });
        logFlow("Vẫn không tìm thấy nút mua tool — giữ job trong queue, thử lại sau (kéo map cho thấy Workbench)", {
          tool: nextJob.toolType,
        });
        return false;
      }
      if (!d.click(buyBtnAfterOpen)) {
        if (await abortBuyBecauseConditionsNotMet(nextJob)) return false;
        runtime.lastAction = `buy_${nextJob.toolType}_click_failed`;
        logMuaTienDo("Fallback: click mua thất bại — KHÔNG đóng shop", {
          daBamMuaCraft: false,
          daBamThoatDongShop: "không",
        });
        logFlow("Click nút mua thất bại — giữ job trong queue", { tool: nextJob.toolType });
        return false;
      }
      await uiJitter();
      runtime.buyToolQueue.shift();
      clearRestockBlockedBuy(nextJob.toolType, nextJob.requester);
      clearCraftResourceBlockedBuy(nextJob.toolType, nextJob.requester);
      markPostToolBuyCooldown(nextJob.toolType, nextJob.requester, 7500);
      try {
        S.gameBridge?.requestState?.().catch(() => {});
      } catch (_e) {
        // ignore
      }
      runtime.lastAction = `buy_${nextJob.toolType}_done`;
      logMuaTienDo("Fallback: đã click mua — đóng panel (coi như đã thực hiện mua)", {
        daBamMuaCraft: true,
        daBamThoatDongShop: "có",
      });
      await sleep(rand(200, 450));
      await closeToolShopPanel();
      return true;
    } finally {
      runtime.buyToolLock = false;
    }
  }

  /**
   * Mua tất cả công cụ bằng Batch Buy (Rìu + Cuốc các loại).
   * Chạy vào lúc 7h sáng / 19h tối sau khi reload trang.
   */
  async function buyAllToolsBatch() {
    logBuyStep("Bắt đầu mua tất cả công cụ bằng Batch Buy...", {});
    
    // 1. Mở workbench
    if (!isBatchBuyDialogOpen() && !isBlacksmithToolsPanelOpen()) {
      const bench = findWorkbenchClickable();
      if (!bench) {
        logBuyStep("Batch Buy All: không thấy tile Workbench", {});
        return false; // Chưa mở được panel, cho phép thử lại
      }
      openWorkbenchClick(bench);
      await sleep(rand(600, 1000));
    }

    // 2. Click "Batch Buy"
    if (!isBatchBuyDialogOpen()) {
      const batchBtn = findBatchBuyButton();
      if (!batchBtn) {
        logBuyStep("Batch Buy All: không thấy nút 'Batch Buy' trong panel", {});
        await closeToolShopPanel();
        return false; // Chưa mở được dialog, cho phép thử lại
      }
      d.clickAtCenter(batchBtn);
      for (let w = 0; w < 12; w += 1) {
        await sleep(250);
        if (isBatchBuyDialogOpen()) break;
      }
    }

    if (!isBatchBuyDialogOpen()) {
      logBuyStep("Batch Buy All: dialog không mở được", {});
      await closeToolShopPanel();
      return false; // Chưa mở được dialog, cho phép thử lại
    }

    const dlgRoot = findBatchBuyDialogRoot();

    // 3. Click Confirm (trong dialog SFL tự chọn Max và tick sẵn tất cả công cụ)
    const confirmBtn = findBatchBuyConfirmButton(dlgRoot) || findBatchBuyConfirmButton(null);
    if (!confirmBtn) {
      logBuyStep("Batch Buy All: nút Confirm/Batch Buy bị disabled hoặc không tìm thấy (có thể đã đủ dụng cụ hoặc hết coins)", {});
      await sleep(rand(600, 1000));
      await closeBatchBuyDialog();
      await sleep(rand(500, 800));
      await closeToolShopPanel();
      return true; // Coi như đã hoàn thành việc check (không cần buy gì)
    }

    await sleep(rand(1200, 2200)); // Trì hoãn trước khi click Confirm để giống người
    d.clickAtCenter(confirmBtn);
    logBuyStep("Batch Buy All: đã bấm nút Confirm/Batch Buy lần 1, đang chờ modal xác nhận lần 2...", {});
    await uiJitter();
    await sleep(rand(500, 800));

    // Click xác nhận lần 2
    await confirmBatchBuySecondClick();

    // Đóng dialog
    await closeBatchBuyDialog();
    await sleep(rand(600, 900));
    await closeToolShopPanel();
    return true;
  }

  S.workbench = {
    enqueueToolPurchase,
    processBuyToolQueue,
    isBlacksmithToolsPanelOpen,
    buyAllToolsBatch,
  };
})(window.SFL);
