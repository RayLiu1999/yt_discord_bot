import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBadge, parseScheduledTime, parseLockupItem } from "#src/youtube-parser";

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
