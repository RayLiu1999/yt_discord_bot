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
