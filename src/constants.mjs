// 常數配置檔案
export const CONSTANTS = {
  // 指令前綴
  PREFIX: "!",
  
  // 爬蟲設定
  CRAWLER: {
    INTERVAL_MINUTES: 30, // 爬蟲間隔（分鐘）
    VIDEOS_PER_BATCH: 5,  // 每次抓取的影片數量
    RETRY_ATTEMPTS: 3,    // 重試次數
    REQUEST_TIMEOUT: 30000, // 請求超時時間（毫秒）
  },

  // Discord 訊息設定
  DISCORD: {
    LINKS_PER_MESSAGE: 5, // 每條訊息發送的連結數量
    MESSAGE_DELAY: 1000,  // 訊息間隔（毫秒）
  },

  // 音樂播放設定
  MUSIC: {
    MAX_QUEUE_SIZE: 50,   // 播放隊列最大長度
    VOLUME_DEFAULT: 0.5,  // 預設音量
  },

  // 檔案路徑
  FILES: {
    VIDEOS_CHANNELS: 'videosChannels.json',
    STREAMS_CHANNELS: 'streamsChannels.json',
    VIDEOS: 'videos.json',
    STREAMS: 'streams.json',
    SENDED_VIDEOS: 'sendedVideos.json',
    SENDED_STREAMS: 'sendedStreams.json',
    LAST_TIME: 'lastTime.json',
    ERROR_LOG: 'error.log',
  },

  // YouTube 設定
  YOUTUBE: {
    DOMAIN: 'https://www.youtube.com',
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    ACCEPT_LANGUAGE: 'zh-TW,zh;q=0.9',
  },

  // 錯誤訊息
  ERRORS: {
    CHANNEL_NOT_FOUND: '找不到頻道',
    INVALID_CHANNEL_ID: '請輸入頻道ID！',
    CHANNEL_EXISTS: '此頻道已存在！',
    VOICE_CHANNEL_REQUIRED: '你需要先加入語音頻道',
    INVALID_URL: '請提供有效的 YouTube 影片 URL！',
    NO_URL_PROVIDED: '請提供要播放的 YouTube 影片 URL！',
    PLAYBACK_ERROR: '播放時發生錯誤！',
    CRAWLER_FAILED: '影片抓取失敗！',
  },

  // 成功訊息
  SUCCESS: {
    CHANNEL_ADDED: '新增成功！',
    CHANNEL_DELETED: '刪除成功！',
    MUSIC_PLAYING: '正在播放',
    MUSIC_PAUSED: '音樂已暫停',
    MUSIC_RESUMED: '音樂已繼續播放',
    MUSIC_RESTARTED: '音樂已重新播放',
    MUSIC_LOOPING: '音樂開始循環播放',
    CRAWLER_SUCCESS_VIDEOS: '本日新影片已成功抓取！',
    CRAWLER_SUCCESS_STREAMS: '本日新直播已成功抓取！',
  },

  // 資訊訊息
  INFO: {
    NO_NEW_VIDEOS: '爬蟲結束，無新影片',
    NO_NEW_STREAMS: '爬蟲結束，無新直播',
    ALL_VIDEOS_SENT: '最新影片皆已發送！',
    NO_PLAYING_MUSIC: '目前沒有播放中的音樂',
    NO_PAUSED_MUSIC: '目前沒有暫停中的音樂',
    EMPTY_VIDEOS_CHANNELS: '影片頻道清單為空',
    EMPTY_STREAMS_CHANNELS: '直播頻道清單為空',
    BOT_JOIN_VOICE_FIRST: '請先將機器人加入語音頻道',
  }
};