(function (S) {
  "use strict";
  /**
   * Luồng Thu mật ong: Click Beehive khi mật chín (produced >= 100).
   */
  const runtime = S.runtime;
  const d = S.dom;
  const logFlow = S.time.logFlow;
  const nowMs = S.time.now;
  const uiJitter = S.time.uiJitter;

  const HONEY_FLOW_PROBE_MS = 5 * 60 * 1000; // 5 phút

  async function runHoneyCycle() {
    if (!runtime.settings.autoHoney) return false;

    const bridge = S.gameBridge;
    if (!bridge?.isReady) return false;

    const state = bridge.getLatestState();
    if (!state) return false;

    const t = nowMs();
    let acted = false;

    const beehives = state.beehives || [];
    
    // Tìm beehive có mật chín (produced >= 100)
    const readyHive = beehives.find(b => b.honey && b.honey.produced >= 100);

    if (readyHive) {
      logFlow(`🐝 Beehive ${readyHive.id}: Thu mật ong (Bridge ready)`, {});
      if (await tryHarvestHoneyDom(readyHive.id)) {
        acted = true;
        await bridge.requestState?.().catch(() => {});
      }
    } else {
      // Fallback: Quét DOM tìm thanh tiến trình 100% của Beehive
      if (await tryHarvestHoneyDom()) {
        acted = true;
        await bridge.requestState?.().catch(() => {});
      }
    }

    // Tính toán thời gian nghỉ tiếp theo
    let minHoneyAt = Infinity;
    for (const b of beehives) {
      if (b.honey && b.honey.produced < 100) {
        // Ước lượng thời gian đầy mật (SFL speed: 1 mật / 10 mins cơ bản, nhanh hơn nếu nhiều hoa)
        // Vì bridge state không có rate, ta dùng polling 5 phút
      }
    }

    runtime.nextHoneyFlowAt = t + HONEY_FLOW_PROBE_MS;
    runtime.honeyFlowState = acted ? "Vừa thu mật" : (readyHive ? "Sẵn sàng" : "Đang chờ mật");
    runtime.honeyFlowStartedAt = acted ? t : (runtime.honeyFlowStartedAt || 0);

    return acted;
  }

  async function tryHarvestHoneyDom(hiveId) {
    const hits = S.dom.collectDocumentsForGameDom().flatMap(doc => {
      // 1. Tìm bằng class đặc biệt 'honey-drop-ready' (User cung cấp)
      const drops = doc.querySelectorAll('img.honey-drop-ready');
      if (drops.length > 0) {
         return Array.from(drops).map(el => getBeehiveRoot(el)).filter(Boolean);
      }

      // 2. Tìm bằng thanh tiến trình (Dự phòng)
      // Thanh tiến trình của Beehive có màu cam rgb(255, 176, 30) và width 28.875px khi đầy
      const fills = doc.querySelectorAll('div[style*="background-color: rgb(255, 176, 30)"]');
      const fullFills = Array.from(fills).filter(el => {
         const w = el.style.width;
         // 28.875px là độ rộng khi đầy của thanh tiến trình 39.375px (padding 5.25px x 2)
         return w === "28.875px" || w === "100%" || w === "100.00%";
      });
      
      return fullFills.map(el => getBeehiveRoot(el)).filter(Boolean);
    });

    if (hits.length > 0) {
      // Ưu tiên click vào cái ảnh (Beehive hoặc Honey Drop) để đảm bảo game nhận lệnh
      const target = hits[0];
      const interactiveEl = target.querySelector('img[alt="Beehive"]') || target.querySelector('img.honey-drop-ready') || target;
      
      logFlow("Mật ong: Thu hoạch mật (DOM click)", { 
        tagName: interactiveEl.tagName,
        alt: interactiveEl.getAttribute('alt')
      });
      
      d.clickAtCenter(interactiveEl) || d.click(interactiveEl);
      await uiJitter();
      return true;
    }
    return false;
  }

  /** Lấy root của beehive từ một phần tử bên trong. */
  function getBeehiveRoot(el) {
    let n = el;
    for (let i = 0; i < 22 && n; i++) {
       if (n.classList?.contains("cursor-pointer")) {
          // Kiểm tra xem có phải tổ ong không (alt="Beehive")
          if (n.querySelector('img[alt="Beehive"]')) return n;
       }
       n = n.parentElement;
    }
    return null;
  }

  S.honey = {
    runHoneyCycle,
  };
})(window.SFL);
