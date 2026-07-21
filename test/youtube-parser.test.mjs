import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBadge, parseScheduledTime, parseLockupItem, parsePageVideos } from "#src/youtube-parser";

// 獨立於 src/youtube-parser.mjs 實作之外的測試用換算：
// 「預定發布時間」字串固定以 America/Los_Angeles 呈現，測試中使用的日期
// 都落在該時區的日光節約時間（PDT，UTC-7），故直接用固定 -7 小時換算成 UTC。
function pdtWallClockToEpochSeconds(year, month, day, hour, minute) {
  return Math.floor(Date.UTC(year, month - 1, day, hour + 7, minute) / 1000);
}

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
  const expected = pdtWallClockToEpochSeconds(2028, 3, 25, 16, 9);
  assert.equal(result, expected);
});

test("parseScheduledTime - 解析上午時間", () => {
  const result = parseScheduledTime("預定發布時間：2026/7/9 上午9:30");
  const expected = pdtWallClockToEpochSeconds(2026, 7, 9, 9, 30);
  assert.equal(result, expected);
});

test("parseScheduledTime - 格式不符回傳 null", () => {
  assert.equal(parseScheduledTime("觀看次數：17萬次"), null);
  assert.equal(parseScheduledTime(""), null);
});

// 迴歸測試：與真實直播（videoId dO71XO4lceM，2026-07-21 驗證）的頻道頁排程文字
// 及觀看頁 playabilityStatus.liveStreamability...offlineSlate.scheduledStartTime
// （不受地區影響的原始 unix timestamp = 1784664900）比對而來，
// 確保排程時間換算不再以主機時區誤判。
test("parseScheduledTime - 與真實直播 ground truth 時間戳比對（America/Los_Angeles 換算）", () => {
  const result = parseScheduledTime("預定發布時間：2026/7/21 下午13:15");
  assert.equal(result, 1784664900);
});

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
  const expectedTime = pdtWallClockToEpochSeconds(2028, 3, 25, 16, 9);
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

const upcomingStreamWithWaitCountItem = {
  richItemRenderer: {
    content: {
      lockupViewModel: {
        contentId: "2XyN73CWmkL",
        contentImage: {
          thumbnailViewModel: {
            image: {
              sources: [
                { url: "https://i.ytimg.com/vi/2XyN73CWmkL/hqdefault.jpg" },
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
            title: { content: "【Nijisanji】waiting room" },
            metadata: {
              contentMetadataViewModel: {
                metadataRows: [
                  {
                    metadataParts: [
                      {
                        text: {
                          content: "4 人正在等候",
                        },
                      },
                      {
                        text: {
                          content: "預定發布時間：2026/7/30 凌晨2:00",
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

test("parseLockupItem - 即將直播且有等候人數（streams 分頁，metadataParts[0] 為等候人數）", () => {
  const result = parseLockupItem(upcomingStreamWithWaitCountItem, "streams");
  const expectedTime = pdtWallClockToEpochSeconds(2026, 7, 30, 2, 0);
  assert.deepEqual(result, {
    videoId: "2XyN73CWmkL",
    title: "【Nijisanji】waiting room",
    thumbnail: "https://i.ytimg.com/vi/2XyN73CWmkL/hqdefault.jpg",
    publishedTimeText: expectedTime,
    duration: "",
    viewCount: "",
    streamType: "upcoming",
    scheduledStartTime: expectedTime,
  });
});

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

test("parsePageVideos - catchNums 計數包含解析失敗的項目（不只是有效項目）", () => {
  const contents = [
    normalVideoItem,
    { continuationItemRenderer: {} },
    normalVideoItem,
    normalVideoItem,
    normalVideoItem,
  ];
  const jsonData = buildPage(1, contents);
  const result = parsePageVideos(jsonData, "videos", 3);
  // 前 3 個 contents 元素中只有 2 個是有效影片（第 2 個是 continuationItemRenderer，解析結果是 null）
  // 如果 catchNums 錯誤地只數「有效項目」，這裡會拿到 3 筆而不是 2 筆
  assert.equal(result.items.length, 2);
});
