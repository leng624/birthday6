export const CONFIG = {
  projectName: "时光纪",
  sections: [
    { id: "home", title: "首页" },
    { id: "album", title: "相册" },
    { id: "decrypt", title: "解密" },
    { id: "mailbox", title: "信箱" },
    { id: "time-mailbox", title: "时光信箱" },
  ],

  // 基准日期（用于主题、解密与“时光信箱”的解锁日期）
  meetDate: "2025-09-19",
  unlockDate: "2026-09-19",

  // 本地存储 keys
  storage: {
    mailboxLetters: "timecap_mailbox_letters_v1",
    timeMailboxLetters: "timecap_time_letters_v1",
    timeMailboxOpened: "timecap_time_opened_v1",
    uploadedPhotos: "timecap_uploaded_photos_v1",
    musicSettings: "timecap_music_settings_v1",
    appSettings: "timecap_app_settings_v1",
  },

  // 季节音乐：先占位，后续你上传音频文件后替换 src 即可
  seasonalMusic: {
    intro:
      "四季各有一首曲目。当前季节会优先高亮。未配置音频文件时显示占位状态。",
    tracks: [
      {
        id: "music-spring",
        season: "spring",
        label: "春 · 微光",
        src: "",
        suggestedPath: "./static/music/spring.mp3",
      },
      {
        id: "music-summer",
        season: "summer",
        label: "夏 · 风面",
        src: "",
        suggestedPath: "./static/music/summer.mp3",
      },
      {
        id: "music-autumn",
        season: "autumn",
        label: "秋 · 余温",
        src: "",
        suggestedPath: "./static/music/autumn.mp3",
      },
      {
        id: "music-winter",
        season: "winter",
        label: "冬 · 慢雪",
        src: "",
        suggestedPath: "./static/music/winter.mp3",
      },
    ],
  },

  // 低饱和度色彩与文案（避免过度装饰；统一氛围）
  themes: {
    spring: {
      name: "春",
      bg: "radial-gradient(circle at 20% 20%, rgba(210, 232, 196, 0.65), rgba(245, 241, 232, 0.95) 55%, rgba(236, 220, 206, 0.92) 100%)",
      accents: ["#d1b08a", "#ffffff", "#a6c6de"],
      homeLead: "季节在流转，时间在沉淀。",
      homeSentence:
        "每一段时光都值得被纪念，无论它以什么方式开始。",
      homeTail: "心意保持不变，只是更清晰地落在今天。",
    },
    summer: {
      name: "夏",
      bg: "radial-gradient(circle at 65% 20%, rgba(178, 221, 238, 0.55), rgba(245, 241, 232, 0.95) 55%, rgba(230, 205, 186, 0.92) 100%)",
      accents: ["#c99a7a", "#ffffff", "#f0b7c2"],
      homeLead: "光线更明亮，记忆更稳固。",
      homeSentence:
        "每一段时光都值得被纪念，无论它以什么方式开始。",
      homeTail: "把热度留给回想，把安静留给相处。",
    },
    autumn: {
      name: "秋",
      bg: "radial-gradient(circle at 30% 60%, rgba(244, 213, 178, 0.55), rgba(245, 241, 232, 0.95) 55%, rgba(202, 178, 186, 0.88) 100%)",
      accents: ["#c07a5b", "#ffffff", "#e7b0c3"],
      homeLead: "叶片落下，心意仍然向前。",
      homeSentence:
        "每一段时光都值得被纪念，无论它以什么方式开始。",
      homeTail: "时间把距离变轻，把承诺变实。",
    },
    winter: {
      name: "冬",
      bg: "radial-gradient(circle at 70% 70%, rgba(170, 199, 232, 0.55), rgba(245, 241, 232, 0.95) 55%, rgba(227, 210, 196, 0.92) 100%)",
      accents: ["#b7a7a0", "#ffffff", "#f2b9c6"],
      homeLead: "冷意到来，温柔更显得安稳。",
      homeSentence:
        "每一段时光都值得被纪念，无论它以什么方式开始。",
      homeTail: "不需要喧哗，只需要被好好记住。",
    },
    birthday: {
      name: "生日",
      bg: "radial-gradient(circle at 40% 35%, rgba(255, 214, 196, 0.62), rgba(245, 241, 232, 0.95) 55%, rgba(212, 196, 212, 0.88) 100%)",
      accents: ["#e39c7d", "#ffffff", "#f2b9c6"],
      homeLead: "今天被标记为特别的日子。",
      homeSentence:
        "每一段时光都值得被纪念，无论它以什么方式开始。",
      homeTail: "心意不改，时间只是换了一种更柔软的方式表达。",
    },
    anniversary: {
      name: "纪念",
      bg: "radial-gradient(circle at 60% 45%, rgba(210, 196, 232, 0.55), rgba(245, 241, 232, 0.95) 55%, rgba(215, 203, 190, 0.92) 100%)",
      accents: ["#b48ed6", "#ffffff", "#e7b0c3"],
      homeLead: "一年把细节保留下来。",
      homeSentence:
        "每一段时光都值得被纪念，无论它以什么方式开始。",
      homeTail: "陪伴仍在继续，只是更沉稳、更确定。",
    },
  },

  // 相册数据：图片为轻量 SVG 占位（可替换为真实照片文件）
  album: [
    {
      id: "p1",
      src: "./static/photos/p1.svg",
      date: "2025-03-28",
      location: "窗台",
      caption: "午后的光斑落在窗台上",
    },
    {
      id: "p2",
      src: "./static/photos/p2.svg",
      date: "2025-05-09",
      location: "雨后街角",
      caption: "雨后湿润的空气带着回声",
    },
    {
      id: "p3",
      src: "./static/photos/p3.svg",
      date: "2025-07-02",
      location: "楼下树荫",
      caption: "树荫把热度分成一格一格",
    },
    {
      id: "p4",
      src: "./static/photos/p4.svg",
      date: "2025-09-19",
      location: "初见的路口",
      caption: "路灯把影子拉得很长",
    },
    {
      id: "p5",
      src: "./static/photos/p5.svg",
      date: "2025-10-21",
      location: "黄昏天台",
      caption: "风从高处穿过来，轻轻带走声音",
    },
    {
      id: "p6",
      src: "./static/photos/p6.svg",
      date: "2025-12-05",
      location: "屋檐下",
      caption: "冷空气停在门口，没有继续往里",
    },
    {
      id: "p7",
      src: "./static/photos/p7.svg",
      date: "2026-01-12",
      location: "清晨走廊",
      caption: "清晨的光在地面慢慢铺开",
    },
    {
      id: "p8",
      src: "./static/photos/p8.svg",
      date: "2026-03-20",
      location: "傍晚街灯",
      caption: "街灯的轮廓像薄薄的纸",
    },
  ],

  albumUpload: {
    title: "本地上传",
    intro: "支持一次选择多张图片，保存到浏览器本地（仅当前设备可见）。",
    addButton: "选择图片",
    clearButton: "清空本地上传",
    noData: "还没有本地上传图片。",
    persistNote: "仅本地存储，不会上传到服务器。",
  },

  mailbox: {
    title: "信箱",
    intro: "写一段话，封存给未来的自己。",
    placeholder: "可以是今天发生的小事，也可以是想对未来说的话。",
    maxChars: 200,
    emptyState: "这里还没有新的留言。",
  },

  timeMailbox: {
    title: "时光信箱",
    intro: "把一句话留在这里。到达解锁日期后将全部打开。",
    placeholder: "写下此刻的思绪，可以是任何想对自己或未来说的话。",
    sealButton: "封存",
    unlockButton: "开启",
    lockedHint: (unlockDateCN) => `解锁日期：${unlockDateCN}。到达后页面会出现“开启”。`,
    openedHint: "已开启。点击展开每条留言，或长按保存为图片。",
    emptyState: "还没有封存的留言。",
  },

  decrypt: {
    title: "解密",
    intro:
      "每一步都更接近答案。完成后会出现最后的输入框。",

    step1: {
      title: "谜题一",
      question: "选择与月份一致的数字（从基准日期中提取）。",
      confirm: "确认选择",
      wrong: "再试一次。",
    },
    step2: {
      title: "谜题二",
      question: "把日子写成两位数字（从基准日期中提取）。",
      confirm: "确认答案",
      placeholder: "例如 19",
      wrong: "答案不对。",
    },
    step3: {
      title: "谜题三",
      question: "从“日子”中取出第一位数字。",
      confirm: "确认答案",
      placeholder: "例如 1",
      wrong: "答案不对。",
    },

    final: {
      title: "最后的密码",
      prompt: "输入最终密码",
      confirm: "验证",
      wrong: "密码错误。",
      hiddenTitle: "隐藏内容已解锁",
      hiddenBody:
        "时间把距离变轻，把心意变实。你可以把这段话带到以后的日子里。",
      hiddenNote: "如需替换文字，可直接修改 `static/config.js`。",
      hiddenImageAlt: "解锁后的图像",
    },
  },
};

