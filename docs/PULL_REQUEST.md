# P1: 建立星界戰棋基礎架構與自動戰鬥系統

## 完成功能

將初始儲存庫建成可操作的繁體中文單人自走棋：主選單、12 名原創角色與獨立技能、三關固定敵陣、7×8 棋盤、最多五名角色自由部署，以及移動／交換／移除。角色會透過固定步進 AI 尋敵、BFS 尋路、普攻和自動施法，支援治療、護盾、buff、死亡及 60 秒結算。

加入 1×／2×／4×、暫停、重試、角色圖鑑、設定持久化與操作說明。未實作 P2 經濟與商店。

## 專案架構

TypeScript + Vite + Phaser 3；核心戰鬥、部署、角色資料、技能與 AI 不依賴 Phaser。Phaser scene 負責棋盤、滑鼠互動和事件特效；DOM 介面負責選單與資訊，設定以 LocalStorage 儲存。固定 50ms 步進，使用穩定 ID 排序，便於重現與測試。RosterState 預留未來經濟、備戰席與裝備介面。

## 測試結果

- npm install：成功。
- npm test：29 項通過，涵蓋技能、部署、AI、傷害、時間、勝負與三關完整模擬。
- npm run build：成功，TypeScript 檢查通過。
- Playwright + 系統 Chromium：3 項通過，實際操作主選單、設定、部署／交換／拖曳／移除、戰鬥暫停加速、結算重試及 1366／1920 畫面。
- Git diff whitespace 檢查通過。

## 畫面變化

全新深藍紫金 UI、原創符號棋子、陣營區域、血量／能量條、攻擊連線、技能光環、浮動數字與死亡淡出。README 內附 public/p1-battle.png 截圖。

## 已知問題與限制

Phaser vendor 約 1.2 MB，有非阻斷的 chunk size 建置提醒。角色仍為程式繪製占位素材，數值待平衡；固定 ID 行動順序存在先手。Windows Chrome／Edge 未直接測試，已測 Linux Chromium。較矮畫面需垂直捲動。

已設定 /astral-tactics/ base 與 GitHub Pages workflow。管理員需啟用 Settings → Pages → GitHub Actions；Private 儲存庫依方案支援。未變更權限、未部署、未宣稱上線。

## P2 建議

沿用 RosterState 擴充經濟、商店、玩家等級與備戰席，再加入升星和對應單元測試；先做一輪前後排與技能能量平衡，保持目前固定步進與資料／渲染分離。
