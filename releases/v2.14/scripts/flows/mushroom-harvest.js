(function (S) {
  "use strict";
  const runtime = S.runtime;
  const d = S.dom;
  const logFlow = S.time.logFlow;
  const uiJitter = S.time.uiJitter;
  const now = S.time.now;

  function backgroundImageHint(el) {
    if (!el) return "";
    try {
      const inline = String(el.style?.backgroundImage || "");
      if (inline && inline !== "none") return inline.toLowerCase();
      return String(d.viewForElement(el).getComputedStyle(el).backgroundImage || "").toLowerCase();
    } catch (_e) {
      return "";
    }
  }

  function getMushroomKind(rootEl) {
    const move = rootEl.querySelector(".react-responsive-spritesheet-container__move");
    if (move) {
      const bi = backgroundImageHint(move);
      if (bi.includes("wild_mushroom_sheet")) return "wild";
      if (bi.includes("magic_mushroom_sheet")) return "magic";
    }
    return null;
  }

  function kindAllowed(kind) {
    if (kind === "wild") return runtime.settings.mushroomTargetWild !== false;
    if (kind === "magic") return runtime.settings.mushroomTargetMagic !== false;
    return false;
  }

  function gatherMushroomRoots() {
    const docs = d.collectDocumentsForGameDom();
    const roots = [];
    for (let i = 0; i < docs.length; i += 1) {
      let nodes;
      try {
        nodes = docs[i].querySelectorAll("div.mushroom");
      } catch (_e) {
        continue;
      }
      for (let j = 0; j < nodes.length; j += 1) {
        roots.push(nodes[j]);
      }
    }
    return roots;
  }

  function getHarvestableMushroomTargets() {
    const roots = gatherMushroomRoots();
    const items = [];
    for (let i = 0; i < roots.length; i += 1) {
      const root = roots[i];
      if (!root || !root.isConnected) continue;
      const kind = getMushroomKind(root);
      if (!kind || !kindAllowed(kind)) continue;
      if (!d.isVisible(root) || !d.isInViewportLoose(root, 88)) continue;
      if (!d.isClickablePointerEventsOk(root)) continue;
      items.push({ el: root, kind });
    }
    items.sort((a, b) => d.centerDistance(a.el) - d.centerDistance(b.el));
    return items;
  }

  async function tryHarvestOneMushroom() {
    if (!runtime.settings.autoHarvestMushrooms) return false;

    const items = getHarvestableMushroomTargets();
    if (!items.length) {
      runtime.lastAction = "no_mushroom";
      const t = now();
      if (t - (runtime.lastNoMushroomLogAt || 0) > 45000) {
        runtime.lastNoMushroomLogAt = t;
        logFlow("Thu nấm: không thấy nấm hợp lệ trong tầm nhìn (kiểm tra bật Wild/Magic và kéo map)", {
          wild: runtime.settings.mushroomTargetWild !== false,
          magic: runtime.settings.mushroomTargetMagic !== false,
        });
      }
      return false;
    }

    const { el, kind } = items[0];
    const clicked = d.clickAtCenter(el) || d.click(el);
    if (!clicked) return false;

    await uiJitter();
    runtime.lastAction = "mushroom_pick";
    logFlow("Thu nấm: đã tap", { kind });
    return true;
  }

  S.mushroomHarvest = { tryHarvestOneMushroom, getHarvestableMushroomTargets };
})(window.SFL);
