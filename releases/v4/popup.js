// ═══════════════════════════════════════════════════════════════════════
// GIAO DIỆN (UI) THUẦN — phiên bản mới
// Chỉ render và lưu cấu hình hiển thị. KHÔNG chứa logic tự động hóa nào.
// Sẽ được bổ sung dần sau khi quét định lượng.
// ═══════════════════════════════════════════════════════════════════════

const FEATURES = [
  {
    id: 1,
    icon: "👇",
    title: "Tự động tap những cửa sổ",
    default: true
  },
  {
    id: 2,
    icon: "🕵️",
    title: "Tự động giải mã captcha",
    default: true
  },
  {
    id: 3,
    icon: "🍯",
    title: "Tự động thu hoạch mật ong",
    default: true
  },
  {
    id: 4,
    icon: "🍄",
    title: "Tự động thu hoạch nấm",
    default: true
  },
  {
    id: 5,
    icon: "🪓",
    title: "Tự động chặt cây lấy gỗ",
    default: true
  },
  {
    id: 6,
    icon: "⛏️",
    title: "Tự động đào đá quặng",
    default: true
  },
  {
    id: 7,
    icon: "🌱",
    title: "Tự động thu hoạch cây trồng",
    default: true
  },
  {
    id: 8,
    icon: "🌸",
    title: "Tự động trồng & thu hoạch hoa",
    default: true
  },
  {
    id: 9,
    icon: "🛒",
    title: "Tự động mua hạt giống tại cửa hàng",
    default: true
  },
  {
    id: 10,
    icon: "💩",
    title: "Tự động ủ phân (Compost)",
    default: true
  },
  {
    id: 11,
    icon: "🍎",
    title: "Tự động thu hoạch & chặt cây ăn quả",
    default: true
  }
];

// Danh sách quặng cần đào (phần phụ)
const MINE_TARGETS = [
  { id: "mineTargetStone", label: "Đá", default: true },
  { id: "mineTargetIron", label: "Sắt", default: true },
  { id: "mineTargetGold", label: "Vàng", default: true },
  { id: "mineTargetCrimstone", label: "Crimstone", default: true },
  { id: "mineTargetSunstone", label: "Sunstone", default: false }
];

// DOM references
let ids = {};
const statusText = document.getElementById("statusText");
const statusBadge = document.getElementById("statusBadge");

// Render UI dynamically
function renderAppStructure() {
  const mainApp = document.querySelector(".main_app");
  if (!mainApp) return;

  mainApp.innerHTML = ""; // Clear existing template

  // 1. Render main features
  FEATURES.forEach(feat => {
    const menuItem = document.createElement("label");
    menuItem.className = "menu-item";
    menuItem.innerHTML = `
        <div class="menu-item-icon">${feat.icon}</div>
        <div class="menu-item-title">${feat.title}</div>
        <div class="switch">
            <input type="checkbox" id="${feat.id}" name="${feat.id}">
            <span class="slider"></span>
        </div>
    `;
    mainApp.appendChild(menuItem);
    // Add to ids object for quick reference
    ids[feat.id] = menuItem.querySelector(`input[id="${feat.id}"]`);
  });

  // 2. Render mine target chips
  const mineSection = document.createElement("div");
  mineSection.className = "mine-section";
  mineSection.innerHTML = `<div class="section-title">Quặng cần đào</div>`;
  const chipWrap = document.createElement("div");
  chipWrap.className = "mine-target-bunch";
  MINE_TARGETS.forEach(mine => {
    const chip = document.createElement("label");
    chip.className = "mine-chip";
    chip.innerHTML = `
        <input type="checkbox" id="${mine.id}" name="${mine.id}">
        <span>${mine.label}</span>
    `;
    chipWrap.appendChild(chip);
    ids[mine.id] = chip.querySelector(`input[id="${mine.id}"]`);
  });
  mineSection.appendChild(chipWrap);
  mainApp.appendChild(mineSection);

}

function setStatus(text, tone = "neutral") {
  if (statusText) statusText.textContent = text;
  if (statusBadge) {
    statusBadge.className = "status-badge";
    if (tone === "live") {
      statusBadge.textContent = "Sẵn sàng";
      statusBadge.classList.add("live");
      return;
    }
    if (tone === "warn") {
      statusBadge.textContent = "Chờ cấu hình";
      statusBadge.classList.add("warn");
      return;
    }
    statusBadge.textContent = "Đang tải";
  }
}

function readUiSettings() {
  const settings = {};

  // Read main features state
  FEATURES.forEach(feat => {
    if (ids[feat.id]) {
      settings[feat.id] = !!ids[feat.id].checked;
    }
  });

  // Read mine targets
  MINE_TARGETS.forEach(mine => {
    if (ids[mine.id]) {
      settings[mine.id] = !!ids[mine.id].checked;
    }
  });

  return settings;
}

function renderSettings(settings) {
  FEATURES.forEach(feat => {
    if (ids[feat.id]) {
      ids[feat.id].checked = settings[feat.id] !== undefined ? !!settings[feat.id] : feat.default;
    }
  });

  MINE_TARGETS.forEach(mine => {
    if (ids[mine.id]) {
      ids[mine.id].checked = settings[mine.id] !== undefined ? !!settings[mine.id] : mine.default;
    }
  });
}

const STORAGE_KEY = "sfl_ui_settings";

function loadSettingsFromStorage() {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const saved = res?.[STORAGE_KEY];
    if (saved && typeof saved === "object") {
      renderSettings(saved);
    } else {
      // Render defaults
      const defaults = {};
      FEATURES.forEach(f => defaults[f.id] = f.default);
      MINE_TARGETS.forEach(m => defaults[m.id] = m.default);
      renderSettings(defaults);
    }
    setStatus("Sẵn sàng", "live");
  });
}

function saveSettingsAuto() {
  const newSettings = readUiSettings();

  chrome.storage.local.set({ [STORAGE_KEY]: newSettings });
  setStatus("Đã lưu cấu hình", "live");
}

function initEventListeners() {
  // Bind change event to all dynamic inputs
  Object.values(ids).forEach(node => {
    if (!node) return;
    node.addEventListener("change", () => {
      saveSettingsAuto();
    });
  });
}

// Bootstrap
document.addEventListener("DOMContentLoaded", () => {
  renderAppStructure();
  initEventListeners();
  loadSettingsFromStorage();
});
