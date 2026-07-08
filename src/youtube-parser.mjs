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
    if (badge.badgeStyle === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE") {
      streamType = "live";
      viewCount = metadataParts[0]?.text?.content || "";
    }
    // Task 5、6 會補上 upcoming / ended 分支
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
