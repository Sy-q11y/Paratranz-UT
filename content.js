// --- 二重生成防止（古いUIの削除） ---
document.querySelectorAll("#ut-root").forEach((el) => el.remove());

document.querySelectorAll("#ut-floating-open-btn").forEach((el) => el.remove());

document.querySelectorAll("#ut-preview-style").forEach((el) => el.remove());

let lastActiveTranslationEl = null;
let currentDisplayedText = null;
let metadata = null;
let bunruiData = null;
let keyToBunruiMap = {};

const SOUND_MAPPING = {
  sndfnt_default: "snd_talk_default",
};

let paraTranzIdToKeyMap = {};
let categoryStats = {}; // { category: { total: 0, translated: 0 } }

// --- ParaTranz APIからキー一覧を取得して同期する ---
async function loadParaTranzKeys() {
  // 分類データのロード完了を待機
  while (!bunruiData) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const urlParams = new URLSearchParams(window.location.search);
  const fileId = urlParams.get("file");
  const projectMatch = window.location.pathname.match(/\/projects\/(\d+)/);

  if (!projectMatch || !fileId) return;

  const projectId = projectMatch[1];
  let page = 1;
  let hasMore = true;
  let totalLoaded = 0;

  categoryStats = {}; // リセット

  console.log("UT Preview: Syncing keys with ParaTranz API for file", fileId);

  while (hasMore) {
    const apiUrl = `https://paratranz.cn/api/projects/${projectId}/strings?detailed=1&file=${fileId}&page=${page}&pageSize=20000`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data && data.results && data.results.length > 0) {
        data.results.forEach((item) => {
          if (item.id && item.key) {
            paraTranzIdToKeyMap[item.id] = item.key;
            totalLoaded++;

            // 統計の集計
            const cat = keyToBunruiMap[item.key] || "未分類";
            if (!categoryStats[cat]) {
              categoryStats[cat] = { total: 0, translated: 0, items: [] };
            }
            categoryStats[cat].total++;
            categoryStats[cat].items.push({
              id: item.id,
              key: item.key,
              isTranslated: item.stage > 0,
            });

            // ParaTranzの stage: 0=未翻訳, 1=翻訳済み, 2=疑問, 3=査読済み, 5=承認済み
            if (item.stage > 0) {
              categoryStats[cat].translated++;
            }
          }
        });

        if (totalLoaded >= data.count || data.results.length === 0) {
          hasMore = false;
        } else {
          page++;
        }
        updateStatsUI(); // ページごとにUIを更新（リアルタイム進捗）
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.error("UT Preview: API Sync failed at page", page, e);
      hasMore = false;
    }
    if (page > 1000) break;
  }
  console.log("UT Preview: Sync complete.", totalLoaded, "keys mapped.");
  updateStatsUI(); // 最終更新
}
loadParaTranzKeys();

// --- URL変更を監視して、ファイルが切り替わったら再同期する ---
let lastFileId = new URLSearchParams(window.location.search).get("file");
setInterval(() => {
  const currentFileId = new URLSearchParams(window.location.search).get("file");
  if (currentFileId && currentFileId !== lastFileId) {
    lastFileId = currentFileId;
    console.log("UT Preview: File changed. Re-syncing all keys...");
    paraTranzIdToKeyMap = {};
    categoryStats = {};
    loadParaTranzKeys();
  }
}, 2000);

// --- metadata.json と bunrui.json のロード ---
async function loadMetadata() {
  try {
    const response = await fetch(chrome.runtime.getURL("assets/metadata.json"));
    metadata = await response.json();
    console.log(
      "UT Preview v0.1.1.1: Metadata loaded",
      Object.keys(metadata).length,
      "entries",
    );
  } catch (e) {
    console.error("UT Preview: Failed to load metadata", e);
  }

  try {
    const response = await fetch(chrome.runtime.getURL("assets/bunrui.json"));
    bunruiData = await response.json();
    for (const [category, keys] of Object.entries(bunruiData)) {
      for (const key of keys) {
        keyToBunruiMap[key] = category;
      }
    }
    console.log("UT Preview: Bunrui loaded");
  } catch (e) {
    console.error("UT Preview: Failed to load bunrui.json", e);
  }
}
loadMetadata();

// --- 停止記号用の正規表現作成 ---
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const pauseSymbols = UT_CONFIG.SETTINGS.pauseSymbols || ["^"];
const pauseRegex = new RegExp(
  `[${pauseSymbols.map(escapeRegExp).join("")}]`,
  "g",
);

document.addEventListener("focusin", (e) => {
  if (e.target.classList.contains("translation")) {
    lastActiveTranslationEl = e.target;
    setTimeout(updatePreview, 100);
  }
});

document.addEventListener("click", () => setTimeout(updatePreview, 200));
document.addEventListener("input", (e) => {
  if (e.target.classList.contains("translation")) {
    setTimeout(updatePreview, 100);
  }
});

document.addEventListener("keyup", (e) => {
  if (["ArrowUp", "ArrowDown", "Tab"].includes(e.key)) {
    setTimeout(updatePreview, 200);
  }
  if (e.key === "Enter" && (e.altKey || e.shiftKey)) {
    setTimeout(updatePreview, 200);
  }
});

function getTargetText() {
  const activeEl = document.activeElement;
  if (activeEl && activeEl.classList.contains("translation"))
    return activeEl.value;
  if (lastActiveTranslationEl) return lastActiveTranslationEl.value;
  return "";
}

let fontStyles = "";
Object.keys(UT_CONFIG.PRESETS).forEach((key) => {
  const preset = UT_CONFIG.PRESETS[key];
  if (preset.font) {
    fontStyles += `
            @font-face {
                font-family: 'UT-Font-${key}';
                src: url('${chrome.runtime.getURL("assets/fonts/" + preset.font)}');
            }
        `;
  }
});

// Google Fonts 注入
const googleFontLink = document.createElement("link");
googleFontLink.href =
  "https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap";
googleFontLink.rel = "stylesheet";
document.head.appendChild(googleFontLink);

const style = document.createElement("style");
style.id = "ut-preview-style";
style.textContent = `
    ${fontStyles}
    .ut-hidden { display: none !important; }
    #ut-root {
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        z-index: 10000; display: flex; flex-direction: column; align-items: center;
        pointer-events: none; transition: opacity 0.3s ease;
    }
    #ut-root:not(.ut-hidden) { pointer-events: auto; opacity: 1; }
    #ut-root.ut-hidden { opacity: 0; pointer-events: none; }
    
    .ut-panel {
        background: black; color: white; padding: 8px 12px; border-radius: 0;
        margin-bottom: 10px; display: flex; gap: 8px; align-items: center; 
        border: 2px solid white; box-shadow: 0 0 0 2px black;
        white-space: nowrap; flex-wrap: nowrap; transition: all 0.3s ease;
        font-family: 'UT-Font-Default', sans-serif;
    }
    .ut-panel.ut-collapsed { 
        height: 0; padding-top: 0; padding-bottom: 0; margin-bottom: 0; 
        overflow: hidden; opacity: 0; pointer-events: none; border: none; box-shadow: none;
    }

    #ut-bunrui-tag {
        position: absolute; top: -28px; left: 55px;
        background: black; color: #ffeb3b; border: 2px solid white; border-bottom: none;
        border-radius: 0; padding: 2px 8px; font-size: 12px;
        font-family: 'UT-Font-Default', sans-serif;
        box-shadow: 0 0 0 2px black; pointer-events: none;
        z-index: 5; white-space: nowrap; display: none;
    }
    #ut-bunrui-tag.visible { display: block; }
    
    #ut-settings-toggle-btn, #ut-play-btn, #ut-copy-btn, #ut-screenshot-btn, #ut-close-btn {
        position: absolute; top: -28px;
        background: black; color: white; border: 2px solid white;
        border-radius: 0; padding: 2px 8px; font-size: 12px;
        cursor: pointer; z-index: 5; pointer-events: auto;
        font-family: 'UT-Font-Default', sans-serif;
        box-shadow: 0 0 0 2px black;
    }
    #ut-close-btn { right: -2px; color: #ff8888; font-weight: bold; }
    #ut-settings-toggle-btn { right: 40px; }
    #ut-play-btn { right: 100px; }
    #ut-copy-btn { right: 165px; }
    #ut-screenshot-btn { right: 205px; }
    
    #ut-settings-toggle-btn:hover, #ut-play-btn:hover, #ut-copy-btn:hover, #ut-screenshot-btn:hover, #ut-close-btn:hover { background: #333; }
    #ut-close-btn:hover { color: white; }

    #ut-drag-handle {
        position: absolute; top: -28px; left: -2px;
        background: black; color: white; border: 2px solid white;
        border-radius: 0; padding: 2px 15px; font-size: 14px; font-weight: bold;
        cursor: grab; z-index: 5; pointer-events: auto; user-select: none;
        box-shadow: 0 0 0 2px black;
    }
    #ut-drag-handle:active { cursor: grabbing; background: #333; }

    .ut-panel button, .ut-panel select {
        background: black; color: white; border: 2px solid white; padding: 4px 8px; border-radius: 0; 
        cursor: pointer; font-size: 12px; flex-shrink: 0;
        font-family: 'UT-Font-Default', sans-serif;
    }
    .ut-panel button:hover, .ut-panel select:hover { background: #333; }
    
    .ut-check-group {
        display: flex; align-items: center; gap: 4px; background: transparent;
        padding: 2px 6px; border-radius: 0; border: 2px solid white;
    }
    #ut-style-lang-btn { padding: 4px 6px; min-width: 45px; background: black; }

    #ut-main-box { position: relative; display: flex; align-items: flex-start; box-sizing: border-box; }
    #ut-bubble-img {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;
        filter: drop-shadow(2px 0 0 black) drop-shadow(-2px 0 0 black) drop-shadow(0 2px 0 black) drop-shadow(0 -2px 0 black);
    }
    #ut-face-img, #ut-face-still { max-width: 110px; max-height: 110px; width: auto; height: auto; margin-right: 20px; z-index: 2; flex-shrink: 0; }
    #ut-text-display { flex: 1; z-index: 2; white-space: pre; overflow: hidden; }
    .overflow-warning { border-color: red !important; box-shadow: 0 0 10px red !important; }
    
    #ut-floating-open-btn {
        position: fixed; bottom: 20px; left: 50%; z-index: 9999; transform: translateX(-50%);
        background: #222; color: white; border: 2px solid white; border-radius: 20px;
        padding: 8px 16px; cursor: pointer; font-family: sans-serif; font-size: 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3); transition: transform 0.2s ease, opacity 0.3s ease;
    }
    #ut-floating-open-btn:hover { background: #333; transform: translateX(-50%) scale(1.05); }
    #ut-floating-open-btn.ut-hidden { transform: translate(-50%, 100px); opacity: 0; pointer-events: none; }
    
    #ut-warnings-container {
        width: 100%; max-width: 700px; background: rgba(220, 50, 50, 0.95); color: white;
        padding: 10px 15px; border-radius: 5px; margin-top: 10px;
        font-family: sans-serif; font-size: 13px; line-height: 1.5; display: none; box-sizing: border-box;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5); border: 2px solid #ffaaaa;
    }
    .ut-warning-item { margin-bottom: 5px; }
    .ut-warning-item::before { content: "💡 "; }
    #ut-status {
        font-size: 10px; color: #aaa; font-weight: bold; min-width: 70px; text-align: center;
        overflow: hidden; text-overflow: ellipsis;
    }

    #ut-stats-panel {
        width: 100%; max-width: 700px; background: rgba(0, 0, 0, 0.9); color: white;
        padding: 15px; border: 2px solid white; margin-top: 10px;
        font-family: sans-serif; font-size: 13px; display: none; box-sizing: border-box;
        box-shadow: 0 4px 20px rgba(0,0,0,0.8);
    }
    #ut-stats-content { max-height: 400px; overflow-y: auto; padding-right: 5px; }
    /* スクロールバーの装飾 */
    #ut-stats-content::-webkit-scrollbar { width: 8px; }
    #ut-stats-content::-webkit-scrollbar-track { background: #222; }
    #ut-stats-content::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
    #ut-stats-content::-webkit-scrollbar-thumb:hover { background: #777; }
    
    #ut-stats-table { width: 100%; border-collapse: collapse; }
    #ut-stats-table th, #ut-stats-table td { padding: 6px 10px; border: 1px solid #444; text-align: left; }
    #ut-stats-table th { background: #222; color: #ffeb3b; position: sticky; top: 0; z-index: 10; }
    .progress-bar-bg { width: 100px; height: 10px; background: #333; display: inline-block; vertical-align: middle; margin-right: 8px; border: 1px solid #666; }
    .progress-bar-fill { height: 100%; background: #4caf50; }
    .cat-name { color: #ffeb3b; font-weight: bold; }
    .cat-count { color: #aaa; font-size: 11px; margin-left: 5px; }
`;
document.head.appendChild(style);

const root = document.createElement("div");
root.id = "ut-root";
root.classList.add("ut-hidden");
root.innerHTML = `
    <div class="ut-panel ut-collapsed">
        <select id="ut-preset-select"></select>
        <select id="ut-mode-select">
            <option value="normal">Normal Mode</option>
            <option value="battle">Battle Bubble Mode</option>
            <option value="shop">Shop Mode</option>
        </select>
        <select id="ut-bubble-select" style="display:none;"></select>
        
        <div class="ut-check-group">
            <button id="ut-style-check-btn" title="UTJP Style Check Mode">✔️ Check: ON</button>
            <button id="ut-style-lang-btn" title="言語切り替え">🌐 JP</button>
        </div>
        
        <button id="ut-stats-toggle-btn" title="分類別進捗を表示"><img src="${chrome.runtime.getURL("assets/graph.png")}" style="width:14px; height:14px; vertical-align:middle;"></button>
        
        <span id="ut-status"></span>
    </div>
    <div id="ut-stats-panel">
        <h3 style="margin:0 0 12px 0; font-size:16px; border-bottom:1px solid #444; padding-bottom:8px;">📊 分類別進捗 (このファイル内)</h3>
        <div id="ut-stats-content">同期中...</div>
    </div>
    <div id="ut-main-box">
        <button id="ut-drag-handle" title="ドラッグして移動">≡</button>
        <span id="ut-bunrui-tag"></span>
        <button id="ut-screenshot-btn" title="画像をクリップボードにコピー"><img src="${chrome.runtime.getURL("assets/camera.png")}" style="width: 14px; height: 14px; vertical-align: middle;"></button>
        <button id="ut-copy-btn" title="テキストをクリップボードにコピー"><img src="${chrome.runtime.getURL("assets/clipboard.png")}" style="width: 14px; height: 14px; vertical-align: middle;"></button>
        <button id="ut-play-btn" title="ショートカット: Alt+P"><span style="display:inline-block; transform:rotate(90deg); font-size:10px; margin-right:2px;">▲</span> 再生</button>
        <button id="ut-settings-toggle-btn" title="設定を表示/非表示">設定</button>
        <button id="ut-close-btn" title="閉じる (Alt+U)">×</button>
        <img id="ut-bubble-img" style="display:none;">
        <img id="ut-face-img" style="display:none;">
        <div id="ut-text-display"></div>
    </div>
    <div id="ut-warnings-container"></div>
`;
document.body.appendChild(root);

const floatingBtn = document.createElement("button");
floatingBtn.id = "ut-floating-open-btn";
floatingBtn.innerHTML = `💬 UT Preview <span style="opacity:0.5; margin-left:4px;">(Alt+U)</span>`;
document.body.appendChild(floatingBtn);

const textDisplay = document.getElementById("ut-text-display");
const mainBox = document.getElementById("ut-main-box");
const faceImg = document.getElementById("ut-face-img");
const faceStillCanvas = document.createElement("canvas");
faceStillCanvas.id = "ut-face-still";
faceStillCanvas.style.display = "none";
faceImg.parentNode.insertBefore(faceStillCanvas, faceImg);

const bubbleImg = document.getElementById("ut-bubble-img");
const status = document.getElementById("ut-status");
const bunruiTag = document.getElementById("ut-bunrui-tag");
const presetSelect = document.getElementById("ut-preset-select");
const modeSelect = document.getElementById("ut-mode-select");
const bubbleSelect = document.getElementById("ut-bubble-select");
const closeBtn = document.getElementById("ut-close-btn");
const warningsContainer = document.getElementById("ut-warnings-container");
const styleCheckBtn = document.getElementById("ut-style-check-btn");
const styleLangBtn = document.getElementById("ut-style-lang-btn");

Object.keys(UT_CONFIG.PRESETS).forEach((p) => {
  const opt = document.createElement("option");
  opt.value = p;
  opt.textContent = p;
  presetSelect.appendChild(opt);
});
UT_CONFIG.BUBBLES.forEach((b) => {
  const opt = document.createElement("option");
  opt.value = b;
  opt.textContent = b;
  bubbleSelect.appendChild(opt);
});

let isTyping = false;
let currentConfig = {
  font: "",
  sound: "",
  face: "",
  color: "",
  antialias: false,
};

function getCurrentKey() {
  const el = document.activeElement;
  const target =
    el && el.classList.contains("translation") ? el : lastActiveTranslationEl;
  if (!target) {
    console.log("UT Preview: No target element found (activeElement:", el, ")");
    return null;
  }

  // --- 0. APIから取得したIDマップから探す（最速・最高精度） ---
  const row = target.closest(
    'tr, .row.string, [role="row"], .item, .string-item',
  );
  if (row) {
    const ptId = row.getAttribute("data-id");
    if (ptId && paraTranzIdToKeyMap[ptId]) {
      return paraTranzIdToKeyMap[ptId];
    }
    // チェックボックスのvalueからIDを取得するパターン
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (checkbox && checkbox.value && paraTranzIdToKeyMap[checkbox.value]) {
      return paraTranzIdToKeyMap[checkbox.value];
    }
  }

  // --- 1. エディタ画面（コンテキストタブ）から探す（APIがまだの場合のフォールバック） ---
  const contextKeyEl = document.querySelector(
    ".context-tab td.notranslate.text-monospace",
  );
  if (contextKeyEl) {
    const k = contextKeyEl.textContent.trim();
    // Undertaleのキー形式（アンダースコアを含む）かチェック
    if (k && k.includes("_") && !k.includes(" ")) {
      return k;
    }
  }

  // 2. 行要素（row）を探す（DOMから直接キーを探すパターン）
  if (row) {
    // 行自体の title 属性にキーが含まれている場合（一覧画面）
    if (row.hasAttribute("title")) {
      const title = row.getAttribute("title");
      const match = title.match(/^[a-zA-Z0-9_]+/); // 先頭の識別子を取得
      if (match && match[0].includes("_")) return match[0];
    }

    // 行内の特定クラスから探す
    const keySelectors = [
      ".key",
      ".key-content",
      ".string-key",
      '[data-column="key"]',
      ".id-content",
      ".string-name",
      ".name",
      ".id",
      ".notranslate",
    ];
    for (const sel of keySelectors) {
      const el = row.querySelector(sel);
      if (el) {
        const k = (el.getAttribute("title") || el.textContent).trim();
        if (k && k.includes("_") && !k.includes(" ") && k.length > 5) return k;
      }
    }
  }

  // 3. ページ全体のテキストから最終手段の検索
  const allText = document.body.innerText;
  const match = allText.match(/(?:obj|rm|scr|spr|bg|mus|snd)_[a-zA-Z0-9_]+/);
  if (match) return match[0];

  // キーが見つからない場合のログ
  if (row) {
    console.log(
      "UT Preview: Key not found in row. Row has title:",
      row.hasAttribute("title"),
    );
  }

  return null;
}

function applyMetadataSettings() {
  if (!metadata) return false;
  const key = getCurrentKey();
  if (!key) return false;

  let changed = false;

  // メタデータがない場合はデフォルト状態（ノーマルモードかショップ）に戻す
  if (!metadata[key]) {
    const isShop = /obj_(dialogue|text)_.*shop/.test(key);
    const targetMode = isShop ? "shop" : "normal";
    if (modeSelect.value !== targetMode) {
      modeSelect.value = targetMode;
      changed = true;
    }
    return changed;
  }

  const m = metadata[key];
  console.log("UT Preview: Applying metadata for key:", key, m);

  // サウンド (s) の適用
  if (m.s) {
    let soundId = SOUND_MAPPING[m.s] || m.s;
    const soundFile = soundId.endsWith(".wav") ? soundId : soundId + ".wav";
    if (currentConfig.sound !== soundFile) {
      currentConfig.sound = soundFile;
      changed = true;
    }
  }

  // 表情 (p) の適用
  if (m.p) {
    const faceFile = m.p.endsWith(".gif") ? m.p : m.p + ".gif";
    if (currentConfig.face !== faceFile) {
      currentConfig.face = faceFile;
      changed = true;
    }
  } else {
    currentConfig.face = "";
  }

  // 吹き出し (b) の適用
  if (m.b) {
    let bId = m.b;
    // obj_ で始まる場合は spr_ に読み替える（メタデータの抽出ミス対策）
    if (bId.startsWith("obj_quote_bubble")) {
      bId = bId.replace("obj_", "spr_");
    }

    if (bId === "spr_dialoguebox") {
      const isShop = /obj_(dialogue|text)_.*shop/.test(key);
      const targetMode = isShop ? "shop" : "normal";
      if (modeSelect.value !== targetMode) {
        modeSelect.value = targetMode;
        changed = true;
      }
    } else {
      if (modeSelect.value !== "battle") {
        modeSelect.value = "battle";
        changed = true;
      }
      const bubbleName = bId.endsWith(".png") ? bId : bId + "_0.png";
      if (bubbleSelect.value !== bubbleName) {
        bubbleSelect.value = bubbleName;
        bubbleImg.src = chrome.runtime.getURL(`assets/bubbles/${bubbleName}`);
        changed = true;
      }
    }
  } else {
    // 吹き出し指定がない場合はキー名からノーマルかショップを判定
    const isShop = /obj_(dialogue|text)_.*shop/.test(key);
    const targetMode = isShop ? "shop" : "normal";
    if (modeSelect.value !== targetMode) {
      modeSelect.value = targetMode;
      changed = true;
    }
  }

  // 色 (c) の適用
  if (m.c) {
    if (currentConfig.color !== m.c) {
      currentConfig.color = m.c;
      changed = true;
    }
  } else {
    if (currentConfig.color !== "") {
      currentConfig.color = "";
      changed = true;
    }
  }

  return changed;
}

// --- UTJP Style Check 設定の初期化（デフォルトON） ---
let isStyleCheckOn = true;
let styleCheckLang = "jp";

// 保存された設定を読み込む
chrome.storage.local.get(["isStyleCheckOn", "styleCheckLang"], (result) => {
  if (result.isStyleCheckOn !== undefined) {
    isStyleCheckOn = result.isStyleCheckOn;
  }
  if (result.styleCheckLang !== undefined) {
    styleCheckLang = result.styleCheckLang;
  }
  updateStyleCheckUI();
  renderWarnings(getTargetText());
});

function updateStyleCheckUI() {
  styleCheckBtn.textContent = isStyleCheckOn ? "✔️ Check: ON" : "✔️ Check: OFF";
  styleCheckBtn.style.color = isStyleCheckOn ? "#ffaaaa" : "white";
  styleLangBtn.style.display = isStyleCheckOn ? "inline-block" : "none";
  styleLangBtn.textContent = styleCheckLang === "jp" ? "🌐 JP" : "🌐 EN";
}

// --- UTJP Style Check ロジック ---
function runStyleCheck(text) {
  let warnings = [];
  if (!text) return warnings;

  // ConfigのpauseSymbolsを除外したテキストを作成
  const checkText = text.replace(pauseRegex, "").replace(/#/g, "\n");
  const mode = modeSelect.value;
  const preset = presetSelect.value;
  const msg = UT_CONFIG.WARNING_MESSAGES;

  const matchHalfMark = checkText.match(/[?!]/g);
  if (matchHalfMark) {
    let chars = Array.from(new Set(matchHalfMark)).join(", ");
    warnings.push(msg.halfMark(chars));
  }
  if (/\.\.\./.test(checkText)) {
    warnings.push(msg.halfEllipsis);
  }
  if (/(。)[ 　]+(?=[^\n])/g.test(checkText)) {
    warnings.push(msg.spaceAfterPeriod);
  }
  if (preset !== "Papyrus" && preset !== "Spamton") {
    if (/、/.test(checkText)) {
      warnings.push(msg.halfVoiced);
    }
  }
  if (/[（）]/.test(checkText)) {
    warnings.push(msg.fullParentheses);
  }
  if (/["']/.test(checkText)) {
    warnings.push(msg.halfQuotes);
  }
  // \u201d\u2019\u304c\u958b\u304d\u5f15\u7528\u7b26\u306a\u3057\u306b\u5148\u306b\u73fe\u308c\u308b\u5834\u5408\uff08\u9806\u756a\u9006\uff09\u3092\u691c\u77e5
  if (/\u201d[^\u201d\u201c]*\u201c/.test(checkText)) {
    warnings.push(msg.wrongQuoteOrder);
  }
  if (/[？！](?![？！\n\r　)）]|$)/.test(checkText)) {
    warnings.push(msg.spaceAfterQuestion);
  }
  if (/(?<!\d)\d(?!\d|[Gg％%])/.test(checkText)) {
    warnings.push(msg.halfNumber);
  }
  if (/ソウル/.test(checkText)) {
    warnings.push(msg.soul);
  }

  // checkTextはすでに停止記号が除去されているので、単純に「。)」を検知すればOK
  if (/。\)/.test(checkText)) {
    warnings.push(msg.periodBeforeParen);
  }
  if (/。」/.test(checkText)) {
    warnings.push(msg.periodBeforeBracket);
  }

  if (mode === "normal" || mode === "shop") {
    if (/＊(?=[^ 　\n]|$)/.test(checkText)) {
      warnings.push(msg.spaceAfterAsterisk);
    }
    if (/＊　/.test(checkText)) {
      warnings.push(msg.fullSpaceAfterAsterisk);
    }
    if (/(^|\n)[ 　]+＊/.test(checkText)) {
      warnings.push(msg.noSpaceBeforeAsterisk);
    }
  }

  if (mode === "battle") {
    if (/＊/.test(checkText)) {
      warnings.push(msg.noAsteriskInBattle);
    }
    if (/。/.test(checkText)) {
      warnings.push(msg.noPeriodInBattle);
    }
    if (/(^|\n)[ 　]+/.test(checkText)) {
      warnings.push(msg.noSpaceAfterNewlineInBattle);
    }
  }

  return warnings;
}

function renderWarnings(text) {
  warningsContainer.innerHTML = "";
  if (!isStyleCheckOn) {
    warningsContainer.style.display = "none";
    return;
  }

  const warnings = runStyleCheck(text);
  if (warnings.length > 0) {
    warningsContainer.style.display = "block";
    warnings.forEach((w) => {
      const div = document.createElement("div");
      div.className = "ut-warning-item";
      div.textContent = styleCheckLang === "jp" ? w.jp : w.en;
      warningsContainer.appendChild(div);
    });
  } else {
    warningsContainer.style.display = "none";
  }
}

// --- 統合レイアウト適用機能 ---
function applyLayoutAndStyle() {
  const mode = modeSelect.value;
  const hasFace = !!currentConfig.face && mode === "normal";

  let layout;
  if (mode === "battle") layout = UT_CONFIG.LAYOUT.battleBubble;
  else if (mode === "shop") layout = UT_CONFIG.LAYOUT.shop;
  else if (hasFace) layout = UT_CONFIG.LAYOUT.normalWithFace;
  else layout = UT_CONFIG.LAYOUT.normalWithoutFace;

  mainBox.style.width = layout.width + "px";
  mainBox.style.height = layout.height + "px";

  if (mode === "battle") {
    // 吹き出し画像本来のサイズを2倍にして使用する
    const updateBubbleSize = () => {
      if (bubbleImg.naturalWidth) {
        mainBox.style.width = bubbleImg.naturalWidth * 2 + "px";
        mainBox.style.height = bubbleImg.naturalHeight * 2 + "px";
      }
    };
    bubbleImg.onload = updateBubbleSize;
    if (bubbleImg.complete) updateBubbleSize();

    mainBox.style.background = "transparent";
    mainBox.style.border = "none";
    mainBox.style.boxShadow = "none";
    mainBox.style.padding = "0";
    mainBox.style.overflow = "visible"; // 文字がはみ出しても表示
    textDisplay.style.padding = layout.padding;
    textDisplay.style.overflow = "visible";
    textDisplay.style.flex = "none"; // flex による動的な幅計算を防止
    textDisplay.style.width = "100%"; // 後の scaleX(0.8) 時に 125% に上書きされる
  } else {
    mainBox.style.background = "black";
    mainBox.style.border = "4px solid white";
    mainBox.style.boxShadow = "0 0 0 4px black";
    mainBox.style.padding = layout.padding;
    textDisplay.style.padding = "0";
    textDisplay.style.flex = "1";
    textDisplay.style.width = "auto";
  }

  textDisplay.style.letterSpacing = layout.letterSpacing;
  textDisplay.style.lineHeight = layout.lineHeight;
  textDisplay.style.fontSize =
    (mode === "battle"
      ? UT_CONFIG.SETTINGS.bubbleFontSize
      : UT_CONFIG.SETTINGS.defaultFontSize) + "px";
  textDisplay.style.color =
    currentConfig.color || (mode === "battle" ? "black" : "white");

  let antialias = currentConfig.antialias === true;

  const preset = UT_CONFIG.PRESETS[presetSelect.value];

  if (mode === "battle") {
    // バトルモード時は常に BIZ UDPGothic (Bold) を使用
    textDisplay.style.fontFamily = "'BIZ UDPGothic', sans-serif";
    textDisplay.style.fontWeight = "700";
    textDisplay.style.transform = "scaleX(0.8)";
    textDisplay.style.transformOrigin = "left top";
    textDisplay.style.width = "125%";
    antialias = true;
  } else if (preset && preset.fontFamily) {
    textDisplay.style.fontFamily = preset.fontFamily;
    textDisplay.style.fontWeight = "normal";
    antialias = true;
    textDisplay.style.transform = "none";
    textDisplay.style.width = "auto";
  } else {
    textDisplay.style.fontFamily = currentConfig.font
      ? `'UT-Font-${presetSelect.value}', sans-serif`
      : "sans-serif";
    textDisplay.style.fontWeight = "normal";
    textDisplay.style.transform = "none";
    textDisplay.style.width = "auto";
  }

  textDisplay.style.webkitFontSmoothing = antialias ? "auto" : "none";
  textDisplay.style.fontSmooth = antialias ? "always" : "never";

  bubbleSelect.style.display = mode === "battle" ? "inline-block" : "none";
  bubbleImg.style.display = mode === "battle" ? "block" : "none";

  if (hasFace) {
    const url = chrome.runtime.getURL(`assets/faces/${currentConfig.face}`);
    // 画像URLが変わった場合のみロード
    if (faceImg.getAttribute("data-raw-src") !== url) {
      faceImg.setAttribute("data-raw-src", url);
      faceImg.src = url;
      faceImg.style.display = "none";
      faceStillCanvas.style.display = "none";
      faceImg.onload = () => {
        // GIFの最初の1コマをキャプチャして静止画にする
        faceStillCanvas.width = faceImg.naturalWidth;
        faceStillCanvas.height = faceImg.naturalHeight;
        const ctx = faceStillCanvas.getContext("2d");
        ctx.drawImage(faceImg, 0, 0);

        if (!isTyping) {
          faceStillCanvas.style.display = "block";
          faceImg.style.display = "none";
        } else {
          faceStillCanvas.style.display = "none";
          faceImg.style.display = "block";
        }
      };
    } else if (!isTyping) {
      faceImg.style.display = "none";
      faceStillCanvas.style.display = "block";
    }
  } else {
    faceImg.style.display = "none";
    faceStillCanvas.style.display = "none";
  }
}

function toggleUTVisibility(forceState) {
  const shouldHide =
    forceState !== undefined
      ? !forceState
      : !root.classList.contains("ut-hidden");
  console.log(
    "UT Preview: toggleUTVisibility - forceState:",
    forceState,
    "shouldHide:",
    shouldHide,
  );
  if (shouldHide) {
    root.classList.add("ut-hidden");
    floatingBtn.classList.remove("ut-hidden");
    isTyping = false;
  } else {
    root.classList.remove("ut-hidden");
    floatingBtn.classList.add("ut-hidden");
    updatePreview();
  }
}

function updatePreview() {
  try {
    if (!root || !presetSelect) {
      console.error("UT Preview: Root or presetSelect elements are missing!");
      return;
    }

    const isHidden = root.classList.contains("ut-hidden");
    console.log(
      "UT Preview: updatePreview check - isHidden:",
      isHidden,
      "isTyping:",
      isTyping,
    );

    if (isTyping || isHidden) {
      console.log("UT Preview: updatePreview skip - typing or hidden");
      return;
    }

    console.log("UT Preview: Step 1 - Preset:", presetSelect.value);
    const presetName = presetSelect.value;
    const basePreset = UT_CONFIG.PRESETS[presetName];
    if (!basePreset) {
      console.warn("UT Preview: Preset not found:", presetName);
    } else {
      currentConfig = { ...basePreset };
      console.log("UT Preview: Step 1 Success - Base preset cloned");
    }

    console.log("UT Preview: Step 2 - Getting key");
    const key = getCurrentKey();
    console.log("UT Preview: Step 2 Success - Key is:", key);

    console.log("UT Preview: Step 3 - Applying metadata settings");
    const hasMetadata = applyMetadataSettings();
    console.log("UT Preview: Step 3 Success - Metadata changed:", hasMetadata);

    console.log("UT Preview: Step 4 - Applying layout and style");
    applyLayoutAndStyle();

    const text = getTargetText();
    console.log("UT Preview: Step 5 - text length:", text ? text.length : 0);

    if (currentDisplayedText === text && !hasMetadata) {
      console.log("UT Preview: Step 6 - No changes, skipping render");
      return;
    }
    currentDisplayedText = text;

    console.log("UT Preview: Step 7 - Rendering text");
    textDisplay.textContent = text.replace(pauseRegex, "").replace(/#/g, "\n");
    checkOverflow();
    renderWarnings(text);

    if (key) {
      const bunruiStr =
        keyToBunruiMap && keyToBunruiMap[key] ? keyToBunruiMap[key] : "未分類";
      bunruiTag.textContent = bunruiStr;
      bunruiTag.classList.add("visible");

      if (hasMetadata || (metadata && metadata[key])) {
        status.textContent = "ID: " + key;
        status.style.color = "#88ff88";
      } else {
        status.textContent = "ID: " + key + " (No Metadata)";
        status.style.color = "#aaa";
      }
    } else {
      bunruiTag.classList.remove("visible");
    }
    console.log("UT Preview: updatePreview done");
  } catch (e) {
    console.error(
      "UT Preview: EXCEPTION in updatePreview:",
      e.message,
      e.stack,
    );
  }
}

function checkOverflow() {
  const isScaled = textDisplay.style.transform === "scaleX(0.8)";
  const scale = isScaled ? 0.8 : 1.0;
  const isOverflow =
    textDisplay.scrollHeight > textDisplay.clientHeight ||
    textDisplay.scrollWidth * scale > textDisplay.clientWidth;
  mainBox.classList.toggle("overflow-warning", isOverflow);

  if (isOverflow) {
    status.textContent = "⚠️ OVERFLOW";
    status.style.color = "#ff5555";
  }
}

async function playText() {
  if (isTyping || root.classList.contains("ut-hidden")) return;
  const text = getTargetText();
  if (!text) return;

  // 再生前にも最新のメタデータを適用
  applyMetadataSettings();
  applyLayoutAndStyle();

  // 再生開始時に顔グラをGIF（アニメーション）に切り替え
  if (currentConfig.face && modeSelect.value === "normal") {
    const url = faceImg.getAttribute("data-raw-src");
    faceImg.src = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    faceImg.style.display = "block";
    faceStillCanvas.style.display = "none";
  }

  isTyping = true;
  currentDisplayedText = text;
  textDisplay.textContent = "";
  renderWarnings(text);

  const chars = text.split("");
  for (let i = 0; i < chars.length; i++) {
    if (root.classList.contains("ut-hidden")) {
      isTyping = false;
      return;
    }

    const char = chars[i];

    // 配列内の停止記号が含まれていた場合
    if (pauseSymbols.includes(char)) {
      await new Promise((r) => setTimeout(r, UT_CONFIG.SETTINGS.pauseDuration));
      continue;
    }

    if (char === "#") {
      textDisplay.textContent += "\n";
      continue;
    }
    textDisplay.textContent += char;

    if (char.trim() !== "" && currentConfig.sound) {
      new Audio(chrome.runtime.getURL(`assets/sounds/${currentConfig.sound}`))
        .play()
        .catch(() => {});
    }
    checkOverflow();
    await new Promise((r) => setTimeout(r, UT_CONFIG.SETTINGS.typeSpeed));
  }
  isTyping = false;
  // 再生終了時に静止画に戻す
  if (currentConfig.face && modeSelect.value === "normal") {
    faceImg.style.display = "none";
    faceStillCanvas.style.display = "block";
  }
}

// --- イベント登録 ---
document.addEventListener("input", updatePreview);
document.getElementById("ut-play-btn").onclick = (e) => {
  e.currentTarget.blur();
  playText();
};
document.getElementById("ut-screenshot-btn").onclick = async (e) => {
  e.currentTarget.blur();
  const btn = e.currentTarget;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span style="color:#ffeb3b; font-size:10px;">📸...</span>';

  const mainBox = document.getElementById("ut-main-box");

  // スクショに不要なUIボタンやタグを一時的に非表示
  const uiElements = mainBox.querySelectorAll("button, #ut-bunrui-tag");
  const originalDisplays = [];
  uiElements.forEach((el) => {
    originalDisplays.push(el.style.display);
    el.style.display = "none";
  });

  // 外側の黒枠(box-shadow: 4px)が見切れないように、一時的なラッパーで包んで余白を持たせる
  const wrapper = document.createElement("div");
  wrapper.style.padding = "4px";
  wrapper.style.display = "inline-block";
  wrapper.style.backgroundColor = "transparent";

  mainBox.parentNode.insertBefore(wrapper, mainBox);
  wrapper.appendChild(mainBox);

  try {
    const canvas = await html2canvas(wrapper, {
      backgroundColor: null,
      scale: 2, // 高画質化
      useCORS: true,
      logging: true,
    });

    // DOMとUIを元に戻す
    wrapper.parentNode.insertBefore(mainBox, wrapper);
    wrapper.remove();
    uiElements.forEach((el, i) => (el.style.display = originalDisplays[i]));

    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        btn.innerHTML =
          '<span style="color:#88ff88; font-size:10px;">完了</span>';
      } catch (err) {
        console.warn("Clipboard write failed, downloading instead", err);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ut_preview_${getCurrentKey() || "no_id"}.png`;
        a.click();
        URL.revokeObjectURL(url);
        btn.innerHTML =
          '<span style="color:#88ff88; font-size:10px;">保存</span>';
      }
      setTimeout(() => {
        btn.innerHTML = originalText;
      }, 2000);
    }, "image/png");
  } catch (err) {
    console.error("Screenshot failed", err);
    // エラー時も確実に戻す
    wrapper.parentNode.insertBefore(mainBox, wrapper);
    wrapper.remove();
    uiElements.forEach((el, i) => (el.style.display = originalDisplays[i]));

    btn.innerHTML = '<span style="color:#ff5555; font-size:10px;">失敗</span>';
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  }
};

document.getElementById("ut-copy-btn").onclick = (e) => {
  e.currentTarget.blur();
  const text = getTargetText();
  if (text) {
    const checkText = text.replace(pauseRegex, "").replace(/#/g, "\n");
    navigator.clipboard.writeText(checkText).then(() => {
      const originalText = e.currentTarget.innerHTML;
      e.currentTarget.innerHTML =
        '<span style="color:#88ff88;">コピーしました</span>';
      setTimeout(() => {
        e.currentTarget.innerHTML = originalText;
      }, 1500);
    });
  }
};
document.getElementById("ut-settings-toggle-btn").onclick = () => {
  const panel = document.querySelector(".ut-panel");
  panel.classList.toggle("ut-collapsed");
};
closeBtn.onclick = () => toggleUTVisibility(false);
floatingBtn.onclick = () => toggleUTVisibility(true);

styleCheckBtn.onclick = () => {
  isStyleCheckOn = !isStyleCheckOn;
  chrome.storage.local.set({ isStyleCheckOn: isStyleCheckOn }); // 設定を保存
  updateStyleCheckUI();
  renderWarnings(getTargetText());
};

styleLangBtn.onclick = () => {
  styleCheckLang = styleCheckLang === "jp" ? "en" : "jp";
  chrome.storage.local.set({ styleCheckLang: styleCheckLang }); // 設定を保存
  updateStyleCheckUI();
  renderWarnings(getTargetText());
};

document.addEventListener("keydown", (e) => {
  if (e.altKey && e.key.toLowerCase() === "p") {
    e.preventDefault();
    if (!root.classList.contains("ut-hidden")) playText();
  }
  if (e.altKey && e.key.toLowerCase() === "u") {
    e.preventDefault();
    toggleUTVisibility();
  }
});

presetSelect.onchange = (e) => {
  const p = UT_CONFIG.PRESETS[e.target.value];
  if (p) {
    currentConfig = { ...p };
    applyLayoutAndStyle();
    currentDisplayedText = null;
    updatePreview();
  }
};

modeSelect.onchange = (e) => {
  applyLayoutAndStyle();
  if (modeSelect.value === "battle") {
    bubbleSelect.dispatchEvent(new Event("change"));
  }
  currentDisplayedText = null;
  updatePreview();
};

bubbleSelect.onchange = (e) => {
  if (modeSelect.value !== "battle") return;
  bubbleImg.src = chrome.runtime.getURL(`assets/bubbles/${e.target.value}`);
  updatePreview();
};

// --- 初期化 ---
presetSelect.value = "Default";
presetSelect.dispatchEvent(new Event("change"));

// --- ドラッグ移動機能 ---
const dragHandle = document.getElementById("ut-drag-handle");
let isDraggingBox = false;
let dragStartX, dragStartY, initialLeft, initialTop;

dragHandle.addEventListener("mousedown", (e) => {
  isDraggingBox = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;

  const rect = root.getBoundingClientRect();
  if (root.style.transform !== "none") {
    root.style.transform = "none";
    root.style.left = rect.left + "px";
    root.style.top = rect.top + "px";
    root.style.bottom = "auto";
  }

  initialLeft = parseFloat(root.style.left) || rect.left;
  initialTop = parseFloat(root.style.top) || rect.top;
  e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (!isDraggingBox) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  root.style.left = initialLeft + dx + "px";
  root.style.top = initialTop + dy + "px";
  root.style.bottom = "auto";
});

document.addEventListener("mouseup", () => {
  if (isDraggingBox) {
    isDraggingBox = false;
    // 位置の記憶を無効化
    /*
    chrome.storage.local.set({
      utPosX: root.style.left,
      utPosY: root.style.top,
      utPosBottom: root.style.bottom,
      utTransform: root.style.transform
    });
    */
  }
});

// 保存された位置の復元（無効化）
/*
chrome.storage.local.get(["utPosX", "utPosY", "utPosBottom", "utTransform"], (res) => {
  if (res.utPosX && res.utPosY) {
    root.style.left = res.utPosX;
    root.style.top = res.utPosY;
    root.style.bottom = res.utPosBottom || "auto";
    root.style.transform = res.utTransform || "none";
  }
});
*/

const statsPanel = document.getElementById("ut-stats-panel");
const statsContent = document.getElementById("ut-stats-content");
const statsToggleBtn = document.getElementById("ut-stats-toggle-btn");

statsToggleBtn.onclick = () => {
  const mainBox = document.getElementById("ut-main-box");
  const warnings = document.getElementById("ut-warnings-container");
  const isOpening = statsPanel.style.display !== "block";

  if (isOpening) {
    statsPanel.style.display = "block";
    if (mainBox) mainBox.style.display = "none";
    if (warnings) warnings.style.display = "none";
  } else {
    statsPanel.style.display = "none";
    if (mainBox) mainBox.style.display = "flex";
    // 警告は updatePreview() で自動制御されるのでここでは何もしない
  }
};

function updateStatsUI() {
  if (!statsContent) return;

  const categoryOrder = [
    "ゲーム開始",
    "いせき",
    "やみのいせき",
    "さきゅう",
    "スチームワークス",
    "ホットランド / ニューホーム",
    "システム",
    "その他",
  ];

  const sortedCats = Object.entries(categoryStats).sort((a, b) => {
    const getOrderIndex = (catName) => {
      for (let i = 0; i < categoryOrder.length; i++) {
        if (catName.startsWith(categoryOrder[i])) return i;
      }
      return categoryOrder.length; // 定義にないものや未分類は最後
    };

    const indexA = getOrderIndex(a[0]);
    const indexB = getOrderIndex(b[0]);

    // トップレベルの順番で比較
    if (indexA !== indexB) {
      return indexA - indexB;
    }

    // 同じ大分類の中では、カテゴリ名の辞書順で並べる
    return a[0].localeCompare(b[0], "ja");
  });

  if (sortedCats.length === 0) {
    statsContent.innerHTML = "統計データがありません。";
    return;
  }

  const pMatch = window.location.pathname.match(/\/projects\/(\d+)/);
  const currentProjectId = pMatch ? pMatch[1] : "18545";

  let html = '<table id="ut-stats-table">';
  html += "<tr><th>分類</th><th>進捗</th><th>件数</th></tr>";

  sortedCats.forEach(([name, stats], index) => {
    const percent = Math.round((stats.translated / stats.total) * 100);
    const detailId = `ut-cat-detail-${index}`;

    // カテゴリ行（クリックで詳細開閉）
    html += `<tr class="ut-cat-row" style="cursor:pointer;" onclick="const el = document.getElementById('${detailId}'); el.style.display = el.style.display === 'none' ? 'table-row' : 'none';">
      <td><span class="cat-name">${name}</span> <span style="font-size:10px; color:#666;">▼</span></td>
      <td>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${percent}%"></div></div>
        ${percent}%
      </td>
      <td>${stats.translated} / ${stats.total}</td>
    </tr>`;

    // 詳細リスト行（初期状態は非表示）
    html += `<tr id="${detailId}" style="display:none;">
      <td colspan="3" style="padding: 0; background: #111;">
        <div style="max-height: 200px; overflow-y: auto; padding: 10px;">
          <ul style="list-style: none; padding: 0; margin: 0; font-family: monospace; font-size: 11px;">`;

    // キーの辞書順でソートして表示
    stats.items
      .sort((a, b) => a.key.localeCompare(b.key))
      .forEach((item) => {
        const color = item.isTranslated ? "#4caf50" : "#ffaaaa";
        const url = `https://paratranz.cn/projects/${currentProjectId}/strings?id=${item.id}`;
        // target="_blank" を付けて別タブで開くか、そのまま遷移するか。ParaTranzのルーター対策として標準のaタグで遷移させます。
        html += `<li style="margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #333;">
        <a href="${url}" style="color:${color}; text-decoration:none;">📄 ${item.key}</a>
      </li>`;
      });

    html += `     </ul>
        </div>
      </td>
    </tr>`;
  });

  html += "</table>";
  statsContent.innerHTML = html;
}

// End of script
