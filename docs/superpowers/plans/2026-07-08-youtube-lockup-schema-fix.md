# YouTube lockupViewModel 爬蟲修復 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復 `src/crawler.mjs` 的解析邏輯，讓爬蟲能正確解析 YouTube 頻道頁面新版 `lockupViewModel` 資料結構（取代舊版 `videoRenderer`），恢復影片與直播（含即將開播/直播中/已結束）的偵測與 Discord 通知功能。

**Architecture:** 把「純解析」邏輯（不碰網路、不碰 DB）抽出成獨立、可單元測試的模組 `src/youtube-parser.mjs`；`src/crawler.mjs` 只負責網路請求、DB 存取（`checkIsSended`、`addLiveSchedule`、`checkTime` 等）與呼叫這個新模組。所有解析邏輯先用 Node 內建測試框架（`node:test`）以真實抓包到的資料建立 fixture，寫測試、驗證行為，再接回 `crawler.mjs`。

**Tech Stack:** Node.js 22（ESM, `type: module`），`node:test` + `node:assert`（內建，不需要新增 devDependency），cheerio、node-fetch（既有）。

## Global Constraints

- 不新增任何 npm 套件；測試一律用 Node 內建 `node:test`。
- 保留既有函式簽章與副作用契約：`addLiveSchedule(data)`、`checkIsSended(sendedItems, videoId)`、`checkTime(time)`、`addErrorLog(context, error)`、`sendMessage`、`sendVideo`、`sendLiveNotification` 都不可變動介面（上一輪修復已經改過，這輪不再動它們）。
- `crawlerResults` 陣列中每個項目的欄位名稱維持不變：`{ id, title, link, pic, time, duration, views, channelId }`（`sendVideo`/`addSentItems` 依賴這些欄位名）。
- `streamTypes` 陣列 `["upcoming", "live", "ended"]` 維持不變，`streamType` 欄位值必須是這三者之一或空字串（一般影片無 streamType）。
- 直播分頁的 tab index（1 = 影片、3 = 直播）與 `richGridRenderer.contents` 路徑經實測仍然有效，不需要更動。
- `catchNums = 5`（每個頻道最多檢查前 5 筆項目）行為維持不變。
- 所有新程式碼use 繁體中文註解風格與現有專案一致（只在「為什麼」不明顯時加註解，不加多餘註解）。
- **已知風險（需在 Task 9 人工驗證時特別注意）：** 「即將直播」項目只剩人類可讀的排程時間字串（例如 `預定發布時間：2028/3/25 下午16:09`），YouTube 不再提供原始 unix timestamp。這個時間字串所屬的時區未知（可能受 `Accept-Language: zh-TW` 影響、也可能不受影響），必須在 Task 9 用一個「已知確切開播時間」的真實直播頻道核對，確認換算出的 `scheduledStartTime` 沒有時區偏移，否則直播通知可能會提早或延後好幾小時觸發。

---

## File Structure

- **Create:** `src/youtube-parser.mjs` — 純函式解析模組（無網路/DB 依賴）：
  - `extractBadge(lockup)` — 從 `lockupViewModel` 取出縮圖上的 badge（文字 + 樣式）
  - `parseScheduledTime(text)` — 把「預定發布時間：YYYY/M/D 上午|下午HH:MM」字串轉成 unix 秒數
  - `parseLockupItem(item, type)` — 解析單一 `richItemRenderer` 項目，回傳統一格式資料或 `null`
  - `parsePageVideos(jsonData, type, catchNums)` — 從整頁 `ytInitialData` JSON 取出頻道 ID 與該分頁前 N 筆解析結果
- **Create:** `test/youtube-parser.test.mjs` — 上述所有函式的單元測試，使用真實抓包資料做的 fixture
- **Modify:** `src/crawler.mjs` — `fetchCrawler()` 內的解析區塊（原 `crawler.mjs:174-302` 一帶）改為呼叫 `parsePageVideos`，並保留 `checkIsSended`/`checkTime`/`addLiveSchedule` 呼叫順序與語意
- **Modify:** `package.json` — `scripts.test` 改成 `node --test`

---

### Task 1: 建立測試骨架

**Files:**
- Modify: `package.json`
- Create: `test/smoke.test.mjs`

**Interfaces:**
- 無（純基礎建設）

- [ ] **Step 1: 修改 package.json 的 test script**

把 `package.json` 裡的：

```json
    "test": "echo \"Error: no test specified\" && exit 1",
```

改成：

```json
    "test": "node --test",
```

- [ ] **Step 2: 建立 smoke test**

建立 `test/smoke.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("測試框架運作正常", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 3: 執行測試確認可以跑**

Run: `npm test`
Expected: 輸出包含 `# pass 1`，exit code 0。

- [ ] **Step 4: Commit**

```bash
git add package.json test/smoke.test.mjs
git commit -m "test: 建立 node:test 測試骨架"
```

---

### Task 2: `extractBadge` 與 `parseScheduledTime`

**Files:**
- Create: `src/youtube-parser.mjs`
- Test: `test/youtube-parser.test.mjs`

**Interfaces:**
- Produces:
  - `extractBadge(lockup: object): { text: string, badgeStyle: string }` — 找不到 badge 時回傳 `{ text: "", badgeStyle: "" }`
  - `parseScheduledTime(text: string): number | null` — 回傳 unix **秒數**（整數），格式不符回傳 `null`

- [ ] **Step 1: 寫失敗測試**

建立 `test/youtube-parser.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBadge, parseScheduledTime } from "#src/youtube-parser";

test("extractBadge - 從 thumbnailBottomOverlayViewModel 取出 badge", () => {
  const lockup = {
    contentImage: {
      thumbnailViewModel: {
        overlays: [
          {
            thumbnailBottomOverlayViewModel: {
              badges: [
                {
                  thumbnailBadgeViewModel: {
                    text: "直播",
                    badgeStyle: "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE",
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
  assert.deepEqual(extractBadge(lockup), {
    text: "直播",
    badgeStyle: "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE",
  });
});

test("extractBadge - overlays 中沒有 thumbnailBottomOverlayViewModel 時回傳空字串", () => {
  const lockup = {
    contentImage: {
      thumbnailViewModel: {
        overlays: [{ thumbnailHoverOverlayToggleActionsViewModel: {} }],
      },
    },
  };
  assert.deepEqual(extractBadge(lockup), { text: "", badgeStyle: "" });
});

test("extractBadge - 完全沒有 contentImage 時不拋例外", () => {
  assert.deepEqual(extractBadge({}), { text: "", badgeStyle: "" });
});

test("parseScheduledTime - 解析下午時間", () => {
  const result = parseScheduledTime("預定發布時間：2028/3/25 下午16:09");
  const expected = Math.floor(new Date(2028, 2, 25, 16, 9).getTime() / 1000);
  assert.equal(result, expected);
});

test("parseScheduledTime - 解析上午時間", () => {
  const result = parseScheduledTime("預定發布時間：2026/7/9 上午9:30");
  const expected = Math.floor(new Date(2026, 6, 9, 9, 30).getTime() / 1000);
  assert.equal(result, expected);
});

test("parseScheduledTime - 格式不符回傳 null", () => {
  assert.equal(parseScheduledTime("觀看次數：17萬次"), null);
  assert.equal(parseScheduledTime(""), null);
});
```

- [ ] **Step 2: 執行測試確認會失敗**

Run: `npm test`
Expected: FAIL，錯誤訊息類似 `Cannot find module` 或 `youtube-parser.mjs` 不存在。

- [ ] **Step 3: 建立最小實作**

建立 `src/youtube-parser.mjs`：

```js
// YouTube 頻道頁面新版 lockupViewModel 資料結構的純解析函式
// 注意：不處理網路請求、不碰資料庫，方便單元測試

// 從縮圖 overlay 陣列中找出狀態 badge（例如「直播」「即將直播」或影片時長）
function extractBadge(lockup) {
  const overlays = lockup?.contentImage?.thumbnailViewModel?.overlays || [];
  const bottomOverlay = overlays.find(
    (o) => o.thumbnailBottomOverlayViewModel,
  );
  const badge =
    bottomOverlay?.thumbnailBottomOverlayViewModel?.badges?.[0]
      ?.thumbnailBadgeViewModel;

  return {
    text: badge?.text || "",
    badgeStyle: badge?.badgeStyle || "",
  };
}

// 將「預定發布時間：YYYY/M/D 上午|下午HH:MM」字串轉成 unix 秒數
// 注意：HH 已經是 24 小時制，上午/下午僅為顯示用前綴，不影響計算
function parseScheduledTime(text) {
  if (!text) return null;

  const match = text.match(
    /(\d{4})\/(\d{1,2})\/(\d{1,2})\D*(\d{1,2}):(\d{2})/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return Math.floor(date.getTime() / 1000);
}

export { extractBadge, parseScheduledTime };
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/youtube-parser.mjs test/youtube-parser.test.mjs
git commit -m "feat: 新增 lockupViewModel badge 與排程時間解析函式"
```

---

### Task 3: `parseLockupItem` — 一般影片（videos 分頁）

**Files:**
- Modify: `src/youtube-parser.mjs`
- Test: `test/youtube-parser.test.mjs`

**Interfaces:**
- Consumes: `extractBadge` (Task 2)
- Produces: `parseLockupItem(item: object, type: "videos" | "streams"): ParsedItem | null`

  `ParsedItem` 形狀：
  ```
  {
    videoId: string,
    title: string,
    thumbnail: string,
    publishedTimeText: string,   // 一般影片/已結束直播：相對時間文字；即將直播：unix 秒數（number）；直播中：""
    duration: string,
    viewCount: string,
    streamType: "" | "upcoming" | "live" | "ended",
    scheduledStartTime: number | null,
  }
  ```

- [ ] **Step 1: 寫失敗測試**

在 `test/youtube-parser.test.mjs` 補上（沿用同一個 import，改成也 import `parseLockupItem`）：

```js
import { extractBadge, parseScheduledTime, parseLockupItem } from "#src/youtube-parser";

const normalVideoItem = {
  richItemRenderer: {
    content: {
      lockupViewModel: {
        contentId: "aRSBZN2UF0Q",
        contentImage: {
          thumbnailViewModel: {
            image: {
              sources: [
                {
                  url: "https://i.ytimg.com/vi/aRSBZN2UF0Q/hqdefault.jpg",
                  width: 168,
                  height: 94,
                },
              ],
            },
            overlays: [
              {
                thumbnailBottomOverlayViewModel: {
                  badges: [
                    {
                      thumbnailBadgeViewModel: {
                        text: "1:05",
                        badgeStyle: "THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        metadata: {
          lockupMetadataViewModel: {
            title: { content: "Moon Base: June 2026 Update" },
            metadata: {
              contentMetadataViewModel: {
                metadataRows: [
                  {
                    metadataParts: [
                      { text: { content: "觀看次數：17萬次" } },
                      { text: { content: "7 天前" } },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
};

test("parseLockupItem - 一般影片（videos 分頁）", () => {
  const result = parseLockupItem(normalVideoItem, "videos");
  assert.deepEqual(result, {
    videoId: "aRSBZN2UF0Q",
    title: "Moon Base: June 2026 Update",
    thumbnail: "https://i.ytimg.com/vi/aRSBZN2UF0Q/hqdefault.jpg",
    publishedTimeText: "7 天前",
    duration: "1:05",
    viewCount: "觀看次數：17萬次",
    streamType: "",
    scheduledStartTime: null,
  });
});

test("parseLockupItem - 沒有 richItemRenderer 時回傳 null", () => {
  assert.equal(parseLockupItem({ continuationItemRenderer: {} }, "videos"), null);
});

test("parseLockupItem - 沒有 lockupViewModel 時回傳 null", () => {
  assert.equal(
    parseLockupItem({ richItemRenderer: { content: {} } }, "videos"),
    null,
  );
});
```

- [ ] **Step 2: 執行測試確認會失敗**

Run: `npm test`
Expected: FAIL，`parseLockupItem is not a function` 或找不到匯出。

- [ ] **Step 3: 實作 parseLockupItem（先處理 videos 分頁與例外情況）**

在 `src/youtube-parser.mjs` 補上：

```js
// 解析單一 richItemRenderer 項目。type 為 "videos" 或 "streams"，
// 影響 metadataRows 與 badge 的判讀方式。找不到資料時回傳 null。
function parseLockupItem(item, type) {
  const lockup = item?.richItemRenderer?.content?.lockupViewModel;
  if (!lockup) return null;

  const videoId = lockup.contentId || "";
  const title =
    lockup.metadata?.lockupMetadataViewModel?.title?.content || "";
  const thumbnail =
    lockup.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url || "";
  const badge = extractBadge(lockup);
  const metadataParts =
    lockup.metadata?.lockupMetadataViewModel?.metadata
      ?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts || [];

  let streamType = "";
  let publishedTimeText = "";
  let duration = "";
  let viewCount = "";
  let scheduledStartTime = null;

  if (type === "streams") {
    // Task 4、5、6 會補上這裡的分支
  } else {
    viewCount = metadataParts[0]?.text?.content || "";
    publishedTimeText = metadataParts[1]?.text?.content || "";
    duration = badge.text || "";
  }

  return {
    videoId,
    title,
    thumbnail,
    publishedTimeText,
    duration,
    viewCount,
    streamType,
    scheduledStartTime,
  };
}

export { extractBadge, parseScheduledTime, parseLockupItem };
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/youtube-parser.mjs test/youtube-parser.test.mjs
git commit -m "feat: parseLockupItem 支援一般影片解析"
```

---

### Task 4: `parseLockupItem` — 直播中（streams 分頁）

**Files:**
- Modify: `src/youtube-parser.mjs`
- Test: `test/youtube-parser.test.mjs`

**Interfaces:**
- Consumes: Task 3 的 `parseLockupItem` 骨架
- Produces: 同 Task 3 的 `ParsedItem`，`streamType: "live"` 分支

- [ ] **Step 1: 寫失敗測試**

補上：

```js
const liveStreamItem = {
  richItemRenderer: {
    content: {
      lockupViewModel: {
        contentId: "wuh6NqhLu6U",
        contentImage: {
          thumbnailViewModel: {
            image: {
              sources: [
                { url: "https://i.ytimg.com/vi/wuh6NqhLu6U/hqdefault.jpg" },
              ],
            },
            overlays: [
              {
                thumbnailBottomOverlayViewModel: {
                  badges: [
                    {
                      thumbnailBadgeViewModel: {
                        text: "直播",
                        badgeStyle: "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        metadata: {
          lockupMetadataViewModel: {
            title: { content: "【PEAK】its a peak content" },
            metadata: {
              contentMetadataViewModel: {
                metadataRows: [
                  {
                    metadataParts: [{ text: { content: "3141 人正在觀看" } }],
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
};

test("parseLockupItem - 直播中（streams 分頁）", () => {
  const result = parseLockupItem(liveStreamItem, "streams");
  assert.deepEqual(result, {
    videoId: "wuh6NqhLu6U",
    title: "【PEAK】its a peak content",
    thumbnail: "https://i.ytimg.com/vi/wuh6NqhLu6U/hqdefault.jpg",
    publishedTimeText: "",
    duration: "",
    viewCount: "3141 人正在觀看",
    streamType: "live",
    scheduledStartTime: null,
  });
});
```

- [ ] **Step 2: 執行測試確認會失敗**

Run: `npm test`
Expected: FAIL（`streamType` 目前恆為 `""`）。

- [ ] **Step 3: 實作 LIVE 分支**

把 `src/youtube-parser.mjs` 裡 `if (type === "streams") { ... }` 區塊改成：

```js
  if (type === "streams") {
    if (badge.badgeStyle === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE") {
      streamType = "live";
      viewCount = metadataParts[0]?.text?.content || "";
    }
    // Task 5、6 會補上 upcoming / ended 分支
  } else {
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/youtube-parser.mjs test/youtube-parser.test.mjs
git commit -m "feat: parseLockupItem 支援直播中偵測"
```

---

### Task 5: `parseLockupItem` — 即將直播（streams 分頁）

**Files:**
- Modify: `src/youtube-parser.mjs`
- Test: `test/youtube-parser.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `parseScheduledTime`
- Produces: `streamType: "upcoming"` 分支；`publishedTimeText` 此時是 `scheduledStartTime` 同一個數字（維持與舊版 `videoPublishedTime = parseInt(startTime)` 相同語意，讓 `crawler.mjs` 既有的 `checkTime()` 呼叫方式不用改）

- [ ] **Step 1: 寫失敗測試**

補上：

```js
const upcomingStreamItem = {
  richItemRenderer: {
    content: {
      lockupViewModel: {
        contentId: "1WhsM61BUfk",
        contentImage: {
          thumbnailViewModel: {
            image: {
              sources: [
                { url: "https://i.ytimg.com/vi/1WhsM61BUfk/hqdefault.jpg" },
              ],
            },
            overlays: [
              {
                thumbnailBottomOverlayViewModel: {
                  badges: [
                    {
                      thumbnailBadgeViewModel: {
                        text: "即將直播",
                        badgeStyle: "THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        metadata: {
          lockupMetadataViewModel: {
            title: { content: "【chat talk here】" },
            metadata: {
              contentMetadataViewModel: {
                metadataRows: [
                  {
                    metadataParts: [
                      {
                        text: {
                          content: "預定發布時間：2028/3/25 下午16:09",
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
};

test("parseLockupItem - 即將直播（streams 分頁）", () => {
  const result = parseLockupItem(upcomingStreamItem, "streams");
  const expectedTime = Math.floor(
    new Date(2028, 2, 25, 16, 9).getTime() / 1000,
  );
  assert.deepEqual(result, {
    videoId: "1WhsM61BUfk",
    title: "【chat talk here】",
    thumbnail: "https://i.ytimg.com/vi/1WhsM61BUfk/hqdefault.jpg",
    publishedTimeText: expectedTime,
    duration: "",
    viewCount: "",
    streamType: "upcoming",
    scheduledStartTime: expectedTime,
  });
});
```

- [ ] **Step 2: 執行測試確認會失敗**

Run: `npm test`
Expected: FAIL（`streamType` 目前不會是 `"upcoming"`）。

- [ ] **Step 3: 實作 UPCOMING 分支**

```js
  if (type === "streams") {
    if (badge.badgeStyle === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE") {
      streamType = "live";
      viewCount = metadataParts[0]?.text?.content || "";
    } else if (badge.text === "即將直播") {
      streamType = "upcoming";
      scheduledStartTime = parseScheduledTime(
        metadataParts[0]?.text?.content || "",
      );
      publishedTimeText = scheduledStartTime;
    }
    // Task 6 會補上 ended 分支
  } else {
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/youtube-parser.mjs test/youtube-parser.test.mjs
git commit -m "feat: parseLockupItem 支援即將直播偵測與排程時間換算"
```

---

### Task 6: `parseLockupItem` — 已結束的直播（streams 分頁）

**Files:**
- Modify: `src/youtube-parser.mjs`
- Test: `test/youtube-parser.test.mjs`

**Interfaces:**
- Produces: `streamType: "ended"` 分支（badge 不是 LIVE 也不是「即將直播」時的預設情況）

- [ ] **Step 1: 寫失敗測試**

補上：

```js
const endedStreamItem = {
  richItemRenderer: {
    content: {
      lockupViewModel: {
        contentId: "O_v3xQRsEBk",
        contentImage: {
          thumbnailViewModel: {
            image: {
              sources: [
                { url: "https://i.ytimg.com/vi/O_v3xQRsEBk/hqdefault.jpg" },
              ],
            },
            overlays: [
              {
                thumbnailBottomOverlayViewModel: {
                  badges: [
                    {
                      thumbnailBadgeViewModel: {
                        text: "4:10:23",
                        badgeStyle: "THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        metadata: {
          lockupMetadataViewModel: {
            title: { content: "【Clock Rogue】hard mode...?" },
            metadata: {
              contentMetadataViewModel: {
                metadataRows: [
                  {
                    metadataParts: [
                      { text: { content: "觀看次數：2.5萬次" } },
                      { text: { content: "直播時間：23 小時前" } },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
};

test("parseLockupItem - 已結束的直播（streams 分頁）", () => {
  const result = parseLockupItem(endedStreamItem, "streams");
  assert.deepEqual(result, {
    videoId: "O_v3xQRsEBk",
    title: "【Clock Rogue】hard mode...?",
    thumbnail: "https://i.ytimg.com/vi/O_v3xQRsEBk/hqdefault.jpg",
    publishedTimeText: "直播時間：23 小時前",
    duration: "4:10:23",
    viewCount: "觀看次數：2.5萬次",
    streamType: "ended",
    scheduledStartTime: null,
  });
});
```

- [ ] **Step 2: 執行測試確認會失敗**

Run: `npm test`
Expected: FAIL（目前 `streams` 分支對這個 badge 組合什麼都不會設定，`streamType` 會是 `""`）。

- [ ] **Step 3: 實作 ENDED 分支（也是 else 預設情況）**

```js
  if (type === "streams") {
    if (badge.badgeStyle === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE") {
      streamType = "live";
      viewCount = metadataParts[0]?.text?.content || "";
    } else if (badge.text === "即將直播") {
      streamType = "upcoming";
      scheduledStartTime = parseScheduledTime(
        metadataParts[0]?.text?.content || "",
      );
      publishedTimeText = scheduledStartTime;
    } else {
      streamType = "ended";
      viewCount = metadataParts[0]?.text?.content || "";
      publishedTimeText = metadataParts[1]?.text?.content || "";
      duration = badge.text || "";
    }
  } else {
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/youtube-parser.mjs test/youtube-parser.test.mjs
git commit -m "feat: parseLockupItem 支援已結束直播解析"
```

---

### Task 7: `parsePageVideos` — 整頁解析（含分頁挑選與 catchNums 限制）

**Files:**
- Modify: `src/youtube-parser.mjs`
- Test: `test/youtube-parser.test.mjs`

**Interfaces:**
- Consumes: `parseLockupItem` (Task 3-6)
- Produces:
  ```
  parsePageVideos(jsonData: object, type: "videos" | "streams", catchNums = 5)
    => { channelID: string, items: ParsedItem[] }
  ```
  `items` 最多 `catchNums` 筆（跳過非 `richItemRenderer` 的項目，例如 `continuationItemRenderer`，但仍計入 `catchNums` 的計數，行為與舊版 `crawler.mjs` 的 `index++` 邏輯一致：只看前 `catchNums` 個 `contents` 元素，不是前 `catchNums` 個有效影片）

- [ ] **Step 1: 寫失敗測試**

補上（沿用 `normalVideoItem` 與一個假的 `continuationItemRenderer`）：

```js
import { parsePageVideos } from "#src/youtube-parser";

function buildPage(tabIndex, contents) {
  const tabs = [];
  for (let i = 0; i < 8; i++) {
    if (i === tabIndex) {
      tabs.push({ tabRenderer: { content: { richGridRenderer: { contents } } } });
    } else {
      tabs.push({ tabRenderer: {} });
    }
  }
  return {
    metadata: {
      channelMetadataRenderer: { ownerUrls: ["https://www.youtube.com/@NASA"] },
    },
    contents: { twoColumnBrowseResultsRenderer: { tabs } },
  };
}

test("parsePageVideos - 從 videos 分頁（index 1）取出頻道 ID 與影片", () => {
  const jsonData = buildPage(1, [normalVideoItem, { continuationItemRenderer: {} }]);
  const result = parsePageVideos(jsonData, "videos");
  assert.equal(result.channelID, "@NASA");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].videoId, "aRSBZN2UF0Q");
});

test("parsePageVideos - 從 streams 分頁（index 3）取出直播", () => {
  const jsonData = buildPage(3, [liveStreamItem, upcomingStreamItem]);
  const result = parsePageVideos(jsonData, "streams");
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].streamType, "live");
  assert.equal(result.items[1].streamType, "upcoming");
});

test("parsePageVideos - 遵守 catchNums 限制", () => {
  const contents = [
    normalVideoItem,
    normalVideoItem,
    normalVideoItem,
    normalVideoItem,
    normalVideoItem,
    normalVideoItem,
  ];
  const jsonData = buildPage(1, contents);
  const result = parsePageVideos(jsonData, "videos", 3);
  assert.equal(result.items.length, 3);
});
```

- [ ] **Step 2: 執行測試確認會失敗**

Run: `npm test`
Expected: FAIL（`parsePageVideos` 尚未定義）。

- [ ] **Step 3: 實作 parsePageVideos**

在 `src/youtube-parser.mjs` 補上：

```js
// 從整頁 ytInitialData JSON 取出頻道 ID 與指定分頁（videos/streams）前 catchNums 筆解析結果
function parsePageVideos(jsonData, type, catchNums = 5) {
  const channelID = jsonData.metadata.channelMetadataRenderer.ownerUrls[0]
    .split("/")
    .pop();

  const tabNums = type === "streams" ? 3 : 1;
  const contents =
    jsonData.contents.twoColumnBrowseResultsRenderer.tabs[tabNums]
      .tabRenderer.content.richGridRenderer.contents;

  const items = [];
  for (let i = 0; i < contents.length && i < catchNums; i++) {
    const parsed = parseLockupItem(contents[i], type);
    if (parsed) items.push(parsed);
  }

  return { channelID, items };
}

export {
  extractBadge,
  parseScheduledTime,
  parseLockupItem,
  parsePageVideos,
};
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/youtube-parser.mjs test/youtube-parser.test.mjs
git commit -m "feat: 新增 parsePageVideos 整頁解析函式"
```

---

### Task 8: 把 `src/crawler.mjs` 接上新的解析模組

**Files:**
- Modify: `src/crawler.mjs:1-308`（整個檔案的 import 與 `fetchCrawler` 函式）

**Interfaces:**
- Consumes: `parsePageVideos` (Task 7)
- Produces: `fetchCrawler` 回傳值格式不變：`{ type, data: crawlerResults }` 或 `{ type, error: true, url }`

- [ ] **Step 1: 修改 import**

把 `src/crawler.mjs` 開頭的 import 區塊：

```js
import fetch from "node-fetch";
import * as cheerio from "cheerio";

import {
  checkIsSended,
  checkTime,
  delay,
  addErrorLog,
  sendMessage,
  sendVideo,
  getChannels,
  getSentItems,
  addSentItems,
  updateChannelDate,
  getAppState,
  setAppState,
  removeChannel,
  checkAndRemoveInactiveChannels,
  addLiveSchedule,
} from "#src/functions";
import config from "#src/config";
```

改成（新增 `parsePageVideos` import，移除不再需要的 `cheerio` 的 script 標籤搜尋 —— 這部分保留在 `fetchCrawler` 裡，因為抓 script 標籤仍然要用 cheerio 解析 HTML，只是抓到 JSON 之後的處理改交給新模組）：

```js
import fetch from "node-fetch";
import * as cheerio from "cheerio";

import {
  checkIsSended,
  checkTime,
  delay,
  addErrorLog,
  sendMessage,
  sendVideo,
  getChannels,
  getSentItems,
  addSentItems,
  updateChannelDate,
  getAppState,
  setAppState,
  removeChannel,
  checkAndRemoveInactiveChannels,
  addLiveSchedule,
} from "#src/functions";
import { parsePageVideos } from "#src/youtube-parser";
import config from "#src/config";
```

- [ ] **Step 2: 取代 fetchCrawler 的第二個 `.then` 區塊**

把 `src/crawler.mjs` 裡（原本 174-302 行一帶）從：

```js
    .then(async (data) => {
      if (data?.error) return data;
      const $ = cheerio.load(data);
      const scriptElement = $("script").filter(function () {
        return /var ytInitialData =/.test($(this).html());
      });
      let jsonData = scriptElement.html().replace(/var ytInitialData =/, "");
      jsonData = jsonData.replace(/;/g, "");
      jsonData = JSON.parse(jsonData);

      let tabNums;
      switch (type) {
        case "videos":
          tabNums = 1;
          break;
        case "streams":
          tabNums = 3;
          break;
      }
      const channelID = jsonData.metadata.channelMetadataRenderer.ownerUrls[0]
        .split("/")
        .pop();
      const videos =
        jsonData.contents.twoColumnBrowseResultsRenderer.tabs[tabNums]
          .tabRenderer.content.richGridRenderer.contents;
      const streamTypes = ["upcoming", "live", "ended"];
      const catchNums = 5;

      let index = 0;
      for (let item of videos) {
        if (index == catchNums) break;
        index++;

        if (item.richItemRenderer !== undefined) {
          const videoJson = item.richItemRenderer.content.videoRenderer;
          if (!videoJson) continue;
          const videoId = videoJson.videoId;
          const videoTitle = videoJson.title.runs[0].text;
          const videoThumbnail = videoJson.thumbnail.thumbnails[0].fetchUrl;
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const peopleObj = videoJson.viewCountText;

          let videoPublishedTime = "";
          let videoDuration = "";
          let videoViewCount = "";
          let streamType = "";

          try {
            switch (type) {
              case "videos":
                videoPublishedTime =
                  videoJson.publishedTimeText?.simpleText || "";
                videoDuration = videoJson.lengthText?.simpleText || "";
                videoViewCount = peopleObj?.simpleText || "";
                break;

              case "streams":
                switch (
                  videoJson.thumbnailOverlays[0]
                    .thumbnailOverlayTimeStatusRenderer.style
                ) {
                  case "UPCOMING":
                    let startTime = videoJson.upcomingEventData.startTime;
                    videoPublishedTime = parseInt(startTime);
                    streamType = streamTypes[0];

                    // 將即將開始的直播存入排程，到時間時自動發送 Discord 通知
                    try {
                      await addLiveSchedule({
                        videoId,
                        channelId: channelID,
                        title: videoTitle,
                        discordChannelId: config.STREAM_CHANNEL_ID,
                        scheduledStartTime: parseInt(startTime),
                      });
                      console.log(
                        `[直播排程] 已新增/更新：${videoTitle} (${videoId})`,
                      );
                    } catch (scheduleErr) {
                      addErrorLog(
                        `[直播排程] 儲存失敗：${scheduleErr.message}`,
                      );
                    }
                    break;
                  case "LIVE":
                    streamType = streamTypes[1];
                    videoViewCount =
                      videoJson.shortViewCountText?.runs?.[0]?.text ||
                      videoJson.shortViewCountText?.simpleText ||
                      "";
                    break;
                  case "DEFAULT":
                    videoPublishedTime =
                      videoJson.publishedTimeText?.simpleText || "";
                    videoDuration = videoJson.lengthText?.simpleText || "";
                    videoViewCount = peopleObj?.simpleText || "";
                    streamType = streamTypes[2];
                    break;
                }
            }
          } catch (error) {
            addErrorLog(error);
          }

          // 檢查是否已發送（使用 videoId 欄位比對）
          if (checkIsSended(sendedVideosOrStreams, videoId)) {
            continue;
          }

          if (!checkTime(videoPublishedTime || new Date() / 1000)) continue;

          crawlerResults.push({
            id: videoId,
            title: videoTitle,
            link: videoUrl,
            pic: videoThumbnail,
            time: videoPublishedTime || "直播中",
            duration: videoDuration || "無",
            views: videoViewCount,
            channelId: channelID,
          });
        }
      }

      return {
        type: type,
        data: crawlerResults,
      };
    })
```

改成：

```js
    .then(async (data) => {
      if (data?.error) return data;
      const $ = cheerio.load(data);
      const scriptElement = $("script").filter(function () {
        return /var ytInitialData =/.test($(this).html());
      });
      let jsonData = scriptElement.html().replace(/var ytInitialData =/, "");
      jsonData = jsonData.replace(/;/g, "");
      jsonData = JSON.parse(jsonData);

      const { channelID, items } = parsePageVideos(jsonData, type);

      for (const parsed of items) {
        const {
          videoId,
          title: videoTitle,
          thumbnail: videoThumbnail,
          publishedTimeText: videoPublishedTime,
          duration: videoDuration,
          viewCount: videoViewCount,
          streamType,
          scheduledStartTime,
        } = parsed;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        if (streamType === "upcoming") {
          // 將即將開始的直播存入排程，到時間時自動發送 Discord 通知
          try {
            await addLiveSchedule({
              videoId,
              channelId: channelID,
              title: videoTitle,
              discordChannelId: config.STREAM_CHANNEL_ID,
              scheduledStartTime,
            });
            console.log(
              `[直播排程] 已新增/更新：${videoTitle} (${videoId})`,
            );
          } catch (scheduleErr) {
            addErrorLog(`[直播排程] 儲存失敗：${scheduleErr.message}`);
          }
        }

        // 檢查是否已發送（使用 videoId 欄位比對）
        if (checkIsSended(sendedVideosOrStreams, videoId)) {
          continue;
        }

        if (!checkTime(videoPublishedTime || new Date() / 1000)) continue;

        crawlerResults.push({
          id: videoId,
          title: videoTitle,
          link: videoUrl,
          pic: videoThumbnail,
          time: videoPublishedTime || "直播中",
          duration: videoDuration || "無",
          views: videoViewCount,
          channelId: channelID,
        });
      }

      return {
        type: type,
        data: crawlerResults,
      };
    })
```

- [ ] **Step 3: 語法檢查**

Run: `node --check src/crawler.mjs`
Expected: 無輸出（代表語法正確）。

- [ ] **Step 4: 執行既有測試，確認沒有連帶弄壞東西**

Run: `npm test`
Expected: 全部 PASS（這個 Task 沒有新增測試，是靠 Task 2-7 的既有測試 + Task 3 的語法檢查把關；`crawler.mjs` 本身因為牽涉真實網路請求與 DB，不在這裡寫自動化測試，改在 Task 9 用真實頻道人工驗證）。

- [ ] **Step 5: Commit**

```bash
git add src/crawler.mjs
git commit -m "fix: crawler.mjs 改用 parsePageVideos 解析新版 lockupViewModel 結構"
```

---

### Task 9: 真實頻道人工驗證（含時區風險確認）

**Files:**
- 無程式碼異動；建立一次性驗證腳本後即刪除

**Interfaces:**
- 無（純驗證步驟）

- [ ] **Step 1: 驗證 videos 分頁（一般影片）**

在專案根目錄建立暫時腳本 `__verify.mjs`：

```js
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { parsePageVideos } from "#src/youtube-parser";

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Accept-Language": "zh-TW,zh;q=0.9",
    },
  });
  const data = await res.text();
  const $ = cheerio.load(data);
  const scriptElement = $("script").filter(function () {
    return /var ytInitialData =/.test($(this).html());
  });
  let jsonData = scriptElement.html().replace(/var ytInitialData =/, "");
  jsonData = jsonData.replace(/;/g, "");
  return JSON.parse(jsonData);
}

const videosPage = await fetchPage("https://www.youtube.com/@NASA/videos");
console.log("=== videos ===");
console.log(parsePageVideos(videosPage, "videos"));

const streamsPage = await fetchPage(
  "https://www.youtube.com/@KaelaKovalskia/streams",
);
console.log("=== streams ===");
console.log(JSON.stringify(parsePageVideos(streamsPage, "streams"), null, 2));
```

Run: `node __verify.mjs`

Expected:
- `videos` 區塊每個項目都有非空的 `videoId`、`title`、`thumbnail`
- `streams` 區塊如果 @KaelaKovalskia 當下有直播中/即將直播的項目，應該能看到 `streamType: "live"` 或 `streamType: "upcoming"` 且 `scheduledStartTime` 是合理的數字（不是 `null`、不是負數、不是離奇久遠的過去時間）

- [ ] **Step 2: 核對時區（重要）**

如果驗證當下 @KaelaKovalskia（或任何已知確切開播時間的頻道）剛好有「即將直播」的排程，手動把該直播在 YouTube 網頁上看到的預定時間，跟 Step 1 印出的 `scheduledStartTime`（用 `new Date(scheduledStartTime * 1000).toLocaleString()` 轉回人類可讀時間）比對，確認兩者一致（誤差在一分鐘內可接受）。

如果時間對不上（例如整整差 8 小時），代表 `parseScheduledTime` 需要加上時區校正 —— 回到 Task 2 補一個時區偏移測試與修正，不要跳過這一步就直接上線，直播通知功能會全部提早或延後觸發。

- [ ] **Step 3: 清除暫時檔案**

```bash
rm __verify.mjs
```

- [ ] **Step 4: 實際跑一次 execute() 確認全流程（連 Discord 一起測）**

如果有測試用的 Discord 頻道/機器人環境，暫時執行 `node app.mjs` 讓排程跑一次（或手動觸發 `/crawl` 指令），確認：
- log 不再是「爬蟲結束，無新影片/無新直播」（除非該頻道當天真的没有新內容）
- 有新內容時 Discord 頻道確實收到訊息連結

- [ ] **Step 5: Commit（僅在有額外程式碼修正時才需要）**

如果 Step 2 發現時區問題並修正了 `parseScheduledTime`，依照該修正內容各自提交；否則這個 Task 不產生新的 commit。

---

## Self-Review 摘要

- **Spec coverage：** 一般影片解析（Task 3）、直播中（Task 4）、即將直播含排程（Task 5）、已結束直播（Task 6）、整頁與 catchNums 邏輯（Task 7）、實際接回 crawler.mjs（Task 8）、真實資料 + 時區驗證（Task 9）都各自對應到使用者要求的「YouTube 改版導致抓不到資料」問題，沒有遺漏。
- **Placeholder 檢查：** 每個 Step 都附完整程式碼與明確的預期輸出，沒有「TODO」「之後補上」等字樣。
- **型別/命名一致性：** `ParsedItem` 的欄位名稱（`videoId`、`title`、`thumbnail`、`publishedTimeText`、`duration`、`viewCount`、`streamType`、`scheduledStartTime`）從 Task 3 定義後，Task 4-8 全部沿用同一組名稱，沒有前後不一致的情況；`crawlerResults` 的既有欄位名稱（`id`/`link`/`pic`/`time`/`duration`/`views`/`channelId`）在 Task 8 中維持不變，符合 Global Constraints。

## 已知限制（Task 9 驗證發現，非本次修復範圍）

- **Corp/品牌頻道多分頁版型不支援：** Task 9 人工驗證時發現，部分採用「品牌/公司帳號」多分頁版型的頻道（例如 `@Kamitsubaki_JP`）其 `ytInitialData` 結構與一般個人頻道不同，導致 `parsePageVideos` 依既定分頁索引（`tabs[1]`／`tabs[3]`）取值時，對應的 `tabRenderer` 為 `undefined`，解析失敗。目前這種情況會被 `fetchCrawler` 既有的 `.catch()` 攔截，並回報為「頻道抓取失敗」，但實際上這並非網路或 HTTP 錯誤，而是頁面版型尚未支援所導致的解析落差，訊息標示上容易誤導排查方向。此為已知、接受的限制，不在本次修復範圍內處理。
- **時區假設僅在驗證環境自洽驗證：** `parseScheduledTime` 是以主機所在時區建構 `Date` 物件（詳見 `src/youtube-parser.mjs` 內註解）。Task 9 驗證時，驗證用的沙箱環境其作業系統時區恰好與其對外連線所在地時區一致，因此換算結果「看起來」正確，但這只是巧合，並未涵蓋正式環境主機時區與該沙箱不同的情況。在正式部署、且直播通知功能的計時準確度需要被完全信任之前，務必另外核對正式主機的作業系統時區設定是否與 YouTube 顯示時間所預期的時區一致。
