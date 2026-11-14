# UI: 將星界戰棋改為單畫面自適應介面

原本 P2 必須上下捲動才能在棋盤、備戰席和商店之間操作。現在 P1／P2 主戰場以實際 viewport 高度配置，玩家在 1280×720 起的四種桌面尺寸中，可直接購買、部署、交換、戰鬥、查看結算與進入下一回合。

基底為最新 main 的 `347b2e0`（已合併完整 P2）。本分支不更改核心經濟、抽卡、升星、戰鬥、回合或存檔規則，不直接修改、合併或部署 main。

## 畫面與互動

- 頂部精簡狀態列：回合、HP、金幣、等級、XP、連續勝敗與階段。
- 左側角色／技能／經濟與機率頁籤；主要文字維持可讀尺寸，次要資訊透過切換查看。
- 中央最大可用高度的等比例棋盤；右側固定刷新、XP、鎖店、戰鬥、暫停、速度、部署調整、結算與返回按鈕。
- 底部九格備戰席與五格商店同時可見，無水平或垂直捲動清單。顯示名稱、費用、星級、選取及購買／售出狀態。
- 主要按鈕 Hover 不位移，避免點擊位置隨狀態改變。
- 中央多欄結算 Modal 可關閉、ESC 收起，再由「查看結算」重開；不改變階段或重複發獎。最多十八名持有角色的最終摘要也不需要捲動。
- P1 同步採單畫面配置，原戰場紀錄保留為可關閉的資訊浮窗。

## 主要檔案

- `src/ui/RunScreen.ts`：P2 結構、資訊頁籤、固定操作與可收合結算。
- `src/ui/boardViewport.ts`：ResizeObserver 生命週期、Phaser Scale Manager FIT、父容器與輸入界線同步。
- `src/styles/gameplay.css`：P1／P2 共用 viewport 高度預算、Grid／Flex、間距變數及 Modal。
- `src/styles/main.css`：保留共用主題與選單／圖鑑／設定，移除舊的重複戰場配置。
- `src/main.ts`：P1 自適應棋盤、資訊浮窗與結算重開。
- `tests/e2e/viewport.spec.ts`：四種尺寸的邊界、遮擋、完整操作、連續 resize 與最大摘要測試。
- `playwright.config.ts`：單一 worker，避免雲端軟體 WebGL 的 GPU 資源競爭與操作逾時。
- README／CHANGELOG：新配置、操作、尺寸與畫面證據。

## 四種 viewport 截圖

- [1920×1080](https://github.com/nobuyo0214/astral-tactics/blob/codex/p2-single-screen-ui/public/screenshots/single-screen-1920x1080.png)
- [1600×900](https://github.com/nobuyo0214/astral-tactics/blob/codex/p2-single-screen-ui/public/screenshots/single-screen-1600x900.png)
- [1366×768](https://github.com/nobuyo0214/astral-tactics/blob/codex/p2-single-screen-ui/public/screenshots/single-screen-1366x768.png)
- [1280×720](https://github.com/nobuyo0214/astral-tactics/blob/codex/p2-single-screen-ui/public/screenshots/single-screen-1280x720.png)

## 驗證範圍

四種 viewport 均檢查 html／body／主容器的 scrollWidth 與 scrollHeight、所有主要按鈕、canvas、九格備戰席與五格商店的 bounding box、中心點 hit test，以及側欄／卡片內部是否溢出。實際操作購買、原生拖曳部署、棋盤交換、刷新、XP、鎖店、暫停、2×／4×、結算收起／重開與下一回合。另連續切換四種尺寸並操作邊緣棋格、跨區拖回與交換。

P1／P2 既有兩個單元測試檔與兩個端對端測試檔皆未刪改。新增測試在真實核心模擬十回合之後，恢復十八名持有角色的最終存檔檢查最小尺寸 Modal。

## 相容性與限制

- Vite base 仍是 `/astral-tactics/`，GitHub Pages workflow 不變，靜態建置無後端依賴。
- 驗證使用 Linux Chromium，未直接執行 Windows Chrome／Edge。
- 適配基準是實際 viewport 至少 1280×720，不以顯示器解析度或 F11 為假設；圖鑑及文字說明頁仍允許正常捲動。
- Phaser 原有 vendor chunk size 提醒仍存在，不阻擋建置。沒有更改儲存庫可見性或宣稱部署上線。

## 最終執行結果

- `npm ci`：成功。
- `npm test`：65 項通過，P1／P2 原有單元測試完整保留。
- `npm run build`：成功，TypeScript 嚴格型別檢查通過。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`：15 項全部通過（原有 8 項 + 新增 7 項），單一 worker 完整執行約 4.7 分鐘。
- 四張截圖的實際 PNG 尺寸分別為 1920×1080、1600×900、1366×768、1280×720。
- `git diff --check` 通過；核心規則、既有測試檔、Vite base、Pages workflow 均與基底一致。
