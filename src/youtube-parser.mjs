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

// 頻道頁面「即將直播」的「預定發布時間」字串固定以 America/Los_Angeles
// （YouTube 後台預設時區）呈現，與抓取時送出的 Accept-Language 標頭、
// 或主機所在時區完全無關（不受地區影響）。已用真實直播比對觀看頁
// playabilityStatus.liveStreamability...offlineSlate.scheduledStartTime
// （原始、不受地區影響的 unix timestamp）驗證確認：主機時區若非
// America/Los_Angeles，用主機本地時區直接建構 Date 物件會導致排程時間
// 誤差達數小時到十幾小時，使直播通知提早或延後觸發。
const SCHEDULE_TIME_ZONE = "America/Los_Angeles";

// 計算指定 IANA 時區在某個 UTC 時間點的偏移分鐘數（正值代表比 UTC 快）
function getTimeZoneOffsetMinutes(timeZone, utcDate) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(utcDate).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUTC - utcDate.getTime()) / 60000;
}

// 將指定時區的「掛鐘時間」（年月日時分）轉換成 unix 秒數，自動處理該時區的日光節約時間
function zonedTimeToEpochSeconds(year, month, day, hour, minute, timeZone) {
  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = getTimeZoneOffsetMinutes(
    timeZone,
    new Date(utcGuessMs),
  );
  return Math.floor((utcGuessMs - offsetMinutes * 60000) / 1000);
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
  return zonedTimeToEpochSeconds(
    year,
    month,
    day,
    hour,
    minute,
    SCHEDULE_TIME_ZONE,
  );
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
    } else if (badge.text === "即將直播") {
      streamType = "upcoming";
      scheduledStartTime = metadataParts
        .map((part) => parseScheduledTime(part?.text?.content || ""))
        .find((time) => time !== null) ?? null;
      publishedTimeText = scheduledStartTime;
    } else {
      streamType = "ended";
      viewCount = metadataParts[0]?.text?.content || "";
      publishedTimeText = metadataParts[1]?.text?.content || "";
      duration = badge.text || "";
    }
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
