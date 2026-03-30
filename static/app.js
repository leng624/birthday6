import {
  createApp,
  ref,
  reactive,
  computed,
  nextTick,
  onMounted,
} from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { CONFIG } from "./config.js";
import { putPhotoBlob, getPhotoBlob, deletePhotoBlob, clearAll as clearDb } from "./db.js";

const STORAGE_KEYS = CONFIG.storage;

function parseYMD(ymd) {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  // 用中午时间避免夏令时导致的日期偏移
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function getMockNow() {
  const params = new URLSearchParams(window.location.search);
  const dateStr = params.get("date");
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return parseYMD(dateStr);
  }
  return new Date();
}

function getUrlParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

function ymdToCompact(ymd) {
  const [y, m, d] = ymd.split("-");
  return `${y}.${m}.${d}`;
}

function formatDateRight(d) {
  // d: Date 或 ISO 字符串 或 YMD 字符串
  if (!d) return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return ymdToCompact(d);
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function safeJsonParse(str, fallback) {
  try {
    const parsed = JSON.parse(str);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getSeasonTheme(now) {
  const month = now.getMonth(); // 0-11
  const day = now.getDate();
  const year = now.getFullYear();

  const birthdayMonth = 3; // 4月
  const birthdayDay = 2;

  const anniversaryY = 2026;
  const anniversaryMonth = 8; // 9月
  const anniversaryDay = 19;

  const isBirthday = month === birthdayMonth && day === birthdayDay;
  const isAnniversary =
    year === anniversaryY &&
    month === anniversaryMonth &&
    day === anniversaryDay;

  if (isBirthday) return CONFIG.themes.birthday;
  if (isAnniversary) return CONFIG.themes.anniversary;

  // 北半球季节
  if (month >= 2 && month <= 4) return CONFIG.themes.spring;
  if (month >= 5 && month <= 7) return CONFIG.themes.summer;
  if (month >= 8 && month <= 10) return CONFIG.themes.autumn;
  return CONFIG.themes.winter;
}

function getSeasonKey(now) {
  const month = now.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

function applyThemeToCSS(theme) {
  document.documentElement.style.setProperty("--bg", theme.bg);
  const [a1, a2, a3] = theme.accents;
  document.documentElement.style.setProperty("--accent1", a1);
  document.documentElement.style.setProperty("--accent2", a2);
  document.documentElement.style.setProperty("--accent3", a3);
}

function loadLetters(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const parsed = safeJsonParse(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x) => x && typeof x.text === "string" && typeof x.createdAt === "string")
    .map((x) => ({
      id: x.id || uid(),
      text: x.text,
      createdAt: x.createdAt,
      expanded: false,
    }));
}

function saveLetters(key, letters) {
  const toSave = letters.map((l) => ({
    id: l.id,
    text: l.text,
    createdAt: l.createdAt,
  }));
  localStorage.setItem(key, JSON.stringify(toSave));
}

function loadUploadedPhotos(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const parsed = safeJsonParse(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (x) =>
      x &&
      typeof x.id === "string" &&
      typeof x.date === "string" &&
      typeof x.location === "string" &&
      typeof x.caption === "string"
  );
}

function saveUploadedPhotos(key, photos) {
  localStorage.setItem(
    key,
    JSON.stringify(
      photos.map((p) => ({
        id: p.id,
        date: p.date,
        location: p.location,
        caption: p.caption,
        tag: p.tag || "",
        // src 不再存 localStorage，避免容量爆；实际图片存 IndexedDB
      }))
    )
  );
}

function loadObject(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed = safeJsonParse(raw, fallback);
  if (typeof parsed !== "object" || parsed === null) return fallback;
  return parsed;
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeDigits(s) {
  return String(s ?? "").replace(/[^\d]/g, "");
}

function canUseReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function initParticles(themeAccents, mode = "normal") {
  const canvas = document.getElementById("particleCanvas");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return () => {};
  if (canUseReducedMotion()) return () => {};
  if (mode === "off") return () => {};

  let w = canvas.clientWidth;
  let h = canvas.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const accents = themeAccents && themeAccents.length >= 3 ? themeAccents : ["#d1b08a", "#fff", "#a6c6de"];
  const palette = [
    { c: accents[0], alpha: 0.30 },
    { c: accents[1], alpha: 0.25 },
    { c: accents[2], alpha: 0.24 },
  ];

  let mouseX = w * 0.5;
  let mouseY = h * 0.4;
  let targetX = mouseX;
  let targetY = mouseY;

  function onMove(e) {
    const x = e.clientX ?? w * 0.5;
    const y = e.clientY ?? h * 0.4;
    targetX = Math.max(0, Math.min(w, x));
    targetY = Math.max(0, Math.min(h, y));
  }
  window.addEventListener("mousemove", onMove, { passive: true });

  const COUNT = mode === "low" ? 36 : 78;
  const particles = new Array(COUNT).fill(0).map(() => {
    const p = palette[Math.floor(Math.random() * palette.length)];
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2.4 + 0.7,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.18,
      color: p.c,
      alpha: p.alpha,
    };
  });

  let rafId = 0;
  function tick() {
    mouseX += (targetX - mouseX) * 0.035;
    mouseY += (targetY - mouseY) * 0.035;

    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      // 慢速跟随鼠标：轻微吸引力
      const dx = mouseX - p.x;
      const dy = mouseY - p.y;
      p.vx += dx * 0.000002;
      p.vy += dy * 0.000002;

      p.x += p.vx;
      p.y += p.vy;

      // 边界回弹
      if (p.x < -20) p.x = w + 20;
      if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20;
      if (p.y > h + 20) p.y = -20;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `${hexToRgba(p.color, p.alpha)}`;
      ctx.fill();
    }

    rafId = requestAnimationFrame(tick);
  }

  function hexToRgba(hex, alpha) {
    const v = String(hex || "").trim();
    const h = v.startsWith("#") ? v.slice(1) : v;
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    if (h.length >= 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const onResize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  window.addEventListener("resize", onResize, { passive: true });

  rafId = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("resize", onResize);
  };
}

const app = createApp({
  setup() {
    const sections = CONFIG.sections;

    const activeIndex = ref(0);
    const modalPhoto = ref(null);
    const galleryEl = ref(null);

    const now = getMockNow();
    const forcedTheme = getUrlParam("theme");
    const theme =
      forcedTheme && CONFIG.themes[forcedTheme]
        ? CONFIG.themes[forcedTheme]
        : getSeasonTheme(now);
    const seasonKey = getSeasonKey(now);
    applyThemeToCSS(theme);

    const unlockAt = parseYMD(CONFIG.unlockDate);
    const canUnlock = computed(() => now.getTime() >= unlockAt.getTime());

    const album = CONFIG.album;
    const uploadedPhotos = ref(loadUploadedPhotos(STORAGE_KEYS.uploadedPhotos));
    const uploadedSrcMap = reactive({}); // { [id]: objectUrl }
    const appSettings = ref(
      loadObject(STORAGE_KEYS.appSettings, {
        bgImageDataUrl: "",
        particleMode: "normal", // off | low | normal
        motion: "auto", // auto | reduce | full
        customTags: ["spring", "summer", "autumn", "winter", "other"],
      })
    );
    const forcedBg = getUrlParam("bg");
    if (forcedBg === "none") appSettings.value.bgImageDataUrl = "";
    const forcedMotion = getUrlParam("motion");
    if (forcedMotion === "reduce") appSettings.value.motion = "reduce";
    if (forcedMotion === "full") appSettings.value.motion = "full";
    const uploadedPhotosWithSrc = computed(() =>
      uploadedPhotos.value.map((p) => ({
        ...p,
        src: uploadedSrcMap[p.id] || "",
        isLocal: true,
      }))
    );
    const allPhotosRaw = computed(() => [...uploadedPhotosWithSrc.value, ...album]);
    const uploading = ref(false);
    const photoViewMode = ref("wall"); // wall | timeline
    const photoSortMode = ref("desc"); // desc | asc
    const photoFilterTag = ref("all");
    const selectedUploadedPhotoIds = ref([]);
    const bulkTag = ref("other");
    const bulkLocation = ref("");
    const bulkDate = ref("");
    const showClearConfirm = ref(false);
    const importMode = ref("merge"); // merge | overwrite
    const newCustomTag = ref("");

    const musicSettings = ref(
      loadObject(STORAGE_KEYS.musicSettings, { tracks: [] })
    );
    const mergedTracks = (CONFIG.seasonalMusic?.tracks || []).map((t) => {
      const ov = (musicSettings.value.tracks || []).find((x) => x.id === t.id);
      return { ...t, ...(ov || {}) };
    });
    const musicTracks = ref(mergedTracks);
    const currentTrackId = ref("");
    const trackMessage = ref("请选择曲目。");
    const audioEl = ref(null);
    const showMusicSettings = ref(false);
    const settingsDraft = ref(JSON.parse(JSON.stringify(musicTracks.value)));

    const mailboxLetters = ref(loadLetters(STORAGE_KEYS.mailboxLetters));
    const timeLetters = ref(loadLetters(STORAGE_KEYS.timeMailboxLetters));

    const newMailboxText = ref("");
    const newTimeText = ref("");

    const timeMailboxOpened = ref(localStorage.getItem(STORAGE_KEYS.timeMailboxOpened) === "1");

    const monthDigit = computed(() => {
      const parts = CONFIG.meetDate.split("-");
      return String(Number(parts[1])); // 09 -> 9
    });
    const dayDigits = computed(() => CONFIG.meetDate.split("-")[2]); // 19
    const dayFirstDigit = computed(() => dayDigits.value[0]); // 1
    const finalPassword = computed(() => `${monthDigit.value}${dayFirstDigit.value}${monthDigit.value}`); // 919

    const p1Solved = ref(false);
    const p2Solved = ref(false);
    const p3Solved = ref(false);

    const wheelDigits = Array.from({ length: 10 }, (_, i) => i);
    const wheelSelected = ref(null);
    const wheelRotationDeg = computed(() => {
      const sel = wheelSelected.value;
      if (sel === null || sel === undefined) return 0;
      const idx = wheelDigits.indexOf(Number(sel));
      const angle = idx * (360 / wheelDigits.length);
      return -angle;
    });

    const p1Error = ref("");
    const p2Value = ref("");
    const p3Value = ref("");
    const p2Error = ref("");
    const p3Error = ref("");

    const finalValue = ref("");
    const finalError = ref("");
    const decrypted = ref(false);

    const hiddenImageSrc = "./static/hidden-image.svg";

    function goTo(index) {
      const safe = Math.max(0, Math.min(sections.length - 1, index));
      activeIndex.value = safe;
      const id = sections[safe]?.id;
      if (id) history.replaceState(null, "", `#${id}`);
    }

    function syncFromHash() {
      const h = window.location.hash.replace("#", "");
      const idx = sections.findIndex((s) => s.id === h);
      if (idx >= 0) activeIndex.value = idx;
    }

    function scrollAlbumBy(dir) {
      const el = galleryEl.value;
      if (!el) return;
      const amount = Math.max(220, el.clientWidth * 0.7);
      el.scrollBy({ left: dir * amount, behavior: "smooth" });
    }

    function openPhoto(photo) {
      modalPhoto.value = photo;
    }
    function closePhoto() {
      modalPhoto.value = null;
    }

    function persistUploadedPhotos() {
      saveUploadedPhotos(STORAGE_KEYS.uploadedPhotos, uploadedPhotos.value);
    }

    function persistAppSettings() {
      localStorage.setItem(STORAGE_KEYS.appSettings, JSON.stringify(appSettings.value));
    }

    function persistMusicSettings() {
      localStorage.setItem(
        STORAGE_KEYS.musicSettings,
        JSON.stringify({
          tracks: musicTracks.value.map((t) => ({
            id: t.id,
            label: t.label,
            src: t.src,
          })),
        })
      );
    }

    function toDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("read file failed"));
        reader.readAsDataURL(file);
      });
    }

    function compressImageFile(file, maxEdge = 1920, quality = 0.86) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const ratio = Math.min(1, maxEdge / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * ratio));
            const h = Math.max(1, Math.round(img.height * ratio));
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(String(reader.result || ""));
              return;
            }

function dataUrlToBlob(dataUrl) {
  try {
    const [meta, b64] = dataUrl.split(",");
    const mimeMatch = /data:([^;]+);base64/.exec(meta || "");
    const mime = mimeMatch?.[1] || "application/octet-stream";
    const bytes = atob(b64 || "");
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch {
    return null;
  }
}

function hideBootSplash() {
  const el = document.getElementById("bootSplash");
  if (!el) return;
  el.classList.add("isHidden");
  setTimeout(() => el.remove(), 420);
}
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", quality));
          };
          img.onerror = () => resolve(String(reader.result || ""));
          img.src = String(reader.result || "");
        };
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
    }

    function inferTagFromDate(ymd) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "other";
      const m = Number(ymd.split("-")[1]);
      if (m >= 3 && m <= 5) return "spring";
      if (m >= 6 && m <= 8) return "summer";
      if (m >= 9 && m <= 11) return "autumn";
      return "winter";
    }

    async function handlePhotoUpload(event) {
      const files = Array.from(event?.target?.files || []);
      if (!files.length) return;
      uploading.value = true;
      try {
        for (const file of files) {
          if (!file.type.startsWith("image/")) continue;
          const dataUrl = await compressImageFile(file, 1920, 0.86);
          const blob = dataUrlToBlob(dataUrl);
          const today = new Date();
          const y = today.getFullYear();
          const m = String(today.getMonth() + 1).padStart(2, "0");
          const d = String(today.getDate()).padStart(2, "0");
          const dateStr = `${y}-${m}-${d}`;
          const id = `local_${uid()}`;
          if (blob) await putPhotoBlob(id, blob);
          const objectUrl = blob ? URL.createObjectURL(blob) : "";
          if (objectUrl) uploadedSrcMap[id] = objectUrl;

          uploadedPhotos.value.unshift({
            id,
            date: dateStr,
            location: "本地上传",
            caption: file.name.replace(/\.[^.]+$/, "") || "本地上传图片",
            tag: inferTagFromDate(dateStr),
            isLocal: true,
          });
        }
        persistUploadedPhotos();
      } finally {
        uploading.value = false;
        if (event?.target) event.target.value = "";
      }
    }

    function clearUploadedPhotos() {
      // 清理对象URL
      for (const p of uploadedPhotos.value) {
        const u = uploadedSrcMap[p.id];
        if (u) URL.revokeObjectURL(u);
        delete uploadedSrcMap[p.id];
      }
      uploadedPhotos.value = [];
      selectedUploadedPhotoIds.value = [];
      persistUploadedPhotos();
    }

    function removeUploadedPhoto(id) {
      const u = uploadedSrcMap[id];
      if (u) URL.revokeObjectURL(u);
      delete uploadedSrcMap[id];
      deletePhotoBlob(id);
      uploadedPhotos.value = uploadedPhotos.value.filter((p) => p.id !== id);
      selectedUploadedPhotoIds.value = selectedUploadedPhotoIds.value.filter((x) => x !== id);
      persistUploadedPhotos();
    }

    function updateUploadedMeta(photo, field, value) {
      if (!photo || !photo.id) return;
      if (!["date", "location", "caption", "tag"].includes(field)) return;
      photo[field] = String(value || "").trim() || photo[field];
      if (field === "date") photo.tag = inferTagFromDate(photo.date);
      persistUploadedPhotos();
    }

    const allPhotos = computed(() => {
      let list = [...allPhotosRaw.value];
      if (photoFilterTag.value !== "all") {
        list = list.filter((x) => (x.tag || inferTagFromDate(x.date)) === photoFilterTag.value);
      }
      list.sort((a, b) => {
        const av = String(a.date || "");
        const bv = String(b.date || "");
        return photoSortMode.value === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      return list;
    });

    function toggleUploadedSelected(id) {
      if (!id.startsWith("local_")) return;
      if (selectedUploadedPhotoIds.value.includes(id)) {
        selectedUploadedPhotoIds.value = selectedUploadedPhotoIds.value.filter((x) => x !== id);
      } else {
        selectedUploadedPhotoIds.value = [...selectedUploadedPhotoIds.value, id];
      }
    }

    function deleteSelectedUploaded() {
      if (!selectedUploadedPhotoIds.value.length) return;
      const set = new Set(selectedUploadedPhotoIds.value);
      for (const id of selectedUploadedPhotoIds.value) {
        const u = uploadedSrcMap[id];
        if (u) URL.revokeObjectURL(u);
        delete uploadedSrcMap[id];
        deletePhotoBlob(id);
      }
      uploadedPhotos.value = uploadedPhotos.value.filter((x) => !set.has(x.id));
      selectedUploadedPhotoIds.value = [];
      persistUploadedPhotos();
    }

    function openMusicSettings() {
      settingsDraft.value = JSON.parse(JSON.stringify(musicTracks.value));
      showMusicSettings.value = true;
    }

    function saveMusicSettings() {
      musicTracks.value = settingsDraft.value.map((x) => ({ ...x }));
      persistMusicSettings();
      showMusicSettings.value = false;
    }

    function resetMusicSettings() {
      musicTracks.value = (CONFIG.seasonalMusic?.tracks || []).map((x) => ({ ...x }));
      settingsDraft.value = JSON.parse(JSON.stringify(musicTracks.value));
      persistMusicSettings();
    }

    function exportAllData() {
      downloadJson("timecap-backup.json", {
        exportedAt: new Date().toISOString(),
        mailboxLetters: mailboxLetters.value,
        timeLetters: timeLetters.value,
        uploadedPhotos: uploadedPhotos.value,
        musicSettings: musicTracks.value,
        appSettings: appSettings.value,
      });
    }

    async function importAllData(event) {
      const file = event?.target?.files?.[0];
      if (!file) return;
      const text = await file.text();
      const obj = safeJsonParse(text, null);
      if (!obj || typeof obj !== "object") return;
      const overwrite = importMode.value === "overwrite";
      if (Array.isArray(obj.mailboxLetters)) {
        mailboxLetters.value = overwrite
          ? obj.mailboxLetters
          : [...obj.mailboxLetters, ...mailboxLetters.value];
        saveLetters(STORAGE_KEYS.mailboxLetters, mailboxLetters.value);
      }
      if (Array.isArray(obj.timeLetters)) {
        timeLetters.value = overwrite ? obj.timeLetters : [...obj.timeLetters, ...timeLetters.value];
        saveLetters(STORAGE_KEYS.timeMailboxLetters, timeLetters.value);
      }
      if (Array.isArray(obj.uploadedPhotos)) {
        uploadedPhotos.value = overwrite
          ? obj.uploadedPhotos
          : [...obj.uploadedPhotos, ...uploadedPhotos.value];
        persistUploadedPhotos();
      }
      if (Array.isArray(obj.musicSettings)) {
        musicTracks.value = overwrite ? obj.musicSettings : musicTracks.value;
        persistMusicSettings();
      }
      if (obj.appSettings && typeof obj.appSettings === "object") {
        appSettings.value = overwrite ? { ...appSettings.value, ...obj.appSettings } : appSettings.value;
        persistAppSettings();
      }
      if (event?.target) event.target.value = "";
    }

    function playTrack(trackId) {
      const track = musicTracks.value.find((t) => t.id === trackId);
      if (!track) return;
      currentTrackId.value = trackId;
      if (!track.src) {
        trackMessage.value = `当前为占位曲目，建议放置在 ${track.suggestedPath}`;
        if (audioEl.value) audioEl.value.pause();
        return;
      }
      try {
        if (!audioEl.value) audioEl.value = new Audio();
        audioEl.value.src = track.src;
        audioEl.value.play();
        trackMessage.value = `正在播放：${track.label}`;
      } catch {
        trackMessage.value = "播放失败，请检查音频文件路径。";
      }
    }

    function pauseTrack() {
      if (audioEl.value) audioEl.value.pause();
      trackMessage.value = "已暂停。";
    }

    async function handleBackgroundUpload(event) {
      const file = event?.target?.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      const dataUrl = await compressImageFile(file, 2200, 0.88);
      appSettings.value.bgImageDataUrl = dataUrl;
      persistAppSettings();
      if (event?.target) event.target.value = "";
    }

    function clearBackgroundImage() {
      appSettings.value.bgImageDataUrl = "";
      persistAppSettings();
    }

    function setParticleMode(mode) {
      appSettings.value.particleMode = mode;
      persistAppSettings();
      // 只做轻量刷新，避免重构全局动画生命周期
      window.location.reload();
    }

    function setMotion(mode) {
      appSettings.value.motion = mode;
      persistAppSettings();
      window.location.reload();
    }

    function addCustomTag() {
      const v = String(newCustomTag.value || "").trim().toLowerCase();
      if (!v) return;
      if (appSettings.value.customTags.includes(v)) return;
      appSettings.value.customTags = [...appSettings.value.customTags, v];
      newCustomTag.value = "";
      persistAppSettings();
    }

    function removeCustomTag(tag) {
      if (["spring", "summer", "autumn", "winter", "other"].includes(tag)) return;
      appSettings.value.customTags = appSettings.value.customTags.filter((x) => x !== tag);
      persistAppSettings();
    }

    function applyBulkEdit() {
      const ids = new Set(selectedUploadedPhotoIds.value);
      if (!ids.size) return;
      for (const p of uploadedPhotos.value) {
        if (!ids.has(p.id)) continue;
        if (bulkTag.value) p.tag = bulkTag.value;
        if (bulkLocation.value.trim()) p.location = bulkLocation.value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(bulkDate.value.trim())) p.date = bulkDate.value.trim();
      }
      persistUploadedPhotos();
    }

    async function clearAllLocalData() {
      for (const p of uploadedPhotos.value) {
        const u = uploadedSrcMap[p.id];
        if (u) URL.revokeObjectURL(u);
        delete uploadedSrcMap[p.id];
      }
      selectedUploadedPhotoIds.value = [];
      mailboxLetters.value = [];
      timeLetters.value = [];
      uploadedPhotos.value = [];
      localStorage.removeItem(STORAGE_KEYS.mailboxLetters);
      localStorage.removeItem(STORAGE_KEYS.timeMailboxLetters);
      localStorage.removeItem(STORAGE_KEYS.timeMailboxOpened);
      localStorage.removeItem(STORAGE_KEYS.uploadedPhotos);
      localStorage.removeItem(STORAGE_KEYS.musicSettings);
      localStorage.removeItem(STORAGE_KEYS.appSettings);
      await clearDb();
      showClearConfirm.value = false;
      window.location.reload();
    }

    function submitMailbox() {
      const text = String(newMailboxText.value || "").trim();
      if (!text) return;
      if (text.length > CONFIG.mailbox.maxChars) return;

      const letter = {
        id: uid(),
        text,
        createdAt: new Date().toISOString(),
        expanded: false,
      };
      mailboxLetters.value = [letter, ...mailboxLetters.value];
      saveLetters(STORAGE_KEYS.mailboxLetters, mailboxLetters.value);
      newMailboxText.value = "";
    }

    function toggleLetterExpanded(listRef, letterId) {
      const arr = listRef.value || [];
      const idx = arr.findIndex((x) => x.id === letterId);
      if (idx < 0) return;
      arr[idx].expanded = !arr[idx].expanded;
    }

    function submitTimeMailbox() {
      const text = String(newTimeText.value || "").trim();
      if (!text) return;
      if (text.length > CONFIG.mailbox.maxChars) return;

      const letter = {
        id: uid(),
        text,
        createdAt: new Date().toISOString(),
        expanded: false,
      };
      timeLetters.value = [letter, ...timeLetters.value];
      saveLetters(STORAGE_KEYS.timeMailboxLetters, timeLetters.value);
      newTimeText.value = "";
    }

    function unlockTimeMailbox() {
      timeMailboxOpened.value = true;
      localStorage.setItem(STORAGE_KEYS.timeMailboxOpened, "1");
    }

    function confettiReveal() {
      if (!window.confetti) return;
      if (appSettings.value.motion === "reduce") return;
      // 满足你给的参数：重力0.6、粒子数60、颜色柔和（金、白、淡粉）
      window.confetti({
        gravity: 0.6,
        particleCount: 60,
        spread: 70,
        ticks: 180,
        origin: { y: 0.72 },
        zIndex: 9999,
        colors: ["#f0c36d", "#ffffff", "#f2b9c6"],
      });
    }

    function confirmPuzzle1() {
      p1Error.value = "";
      const sel = wheelSelected.value;
      if (sel === null || sel === undefined) return;
      const ok = String(sel) === String(monthDigit.value);
      if (!ok) {
        p1Error.value = CONFIG.decrypt.step1.wrong;
        return;
      }
      p1Solved.value = true;
    }

    function confirmPuzzle2() {
      p2Error.value = "";
      const normalized = normalizeDigits(p2Value.value);
      const ok = normalized === String(dayDigits.value);
      if (!ok) {
        p2Error.value = CONFIG.decrypt.step2.wrong;
        return;
      }
      p2Solved.value = true;
    }

    function confirmPuzzle3() {
      p3Error.value = "";
      const normalized = normalizeDigits(p3Value.value);
      const ok = normalized === String(dayFirstDigit.value);
      if (!ok) {
        p3Error.value = CONFIG.decrypt.step3.wrong;
        return;
      }
      p3Solved.value = true;
    }

    function confirmFinal() {
      finalError.value = "";
      const ok = normalizeDigits(finalValue.value) === String(finalPassword.value);
      if (!ok) {
        finalError.value = CONFIG.decrypt.final.wrong;
        return;
      }
      decrypted.value = true;
      confettiReveal();
    }

    // 长按导出图片（时光信箱已开启后）
    let longPressTimer = null;
    function cancelLongPress() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    function startLongPressExport(letterId) {
      cancelLongPress();
      longPressTimer = setTimeout(async () => {
        cancelLongPress();
        const node = document.querySelector(`[data-export-id="${letterId}"]`);
        if (!node || !window.html2canvas) return;
        try {
          const canvas = await window.html2canvas(node, {
            backgroundColor: null,
            scale: 2,
          });
          const url = canvas.toDataURL("image/png");
          const a = document.createElement("a");
          a.href = url;
          a.download = `time-mail_${letterId.slice(0, 8)}.png`;
          a.click();
        } catch (e) {
          // 静默失败，避免影响页面交互
        }
      }, 650);
    }

    onMounted(async () => {
      syncFromHash();
      const defaultTrack =
        musicTracks.value.find((x) => x.season === seasonKey) || musicTracks.value[0];
      if (defaultTrack) {
        currentTrackId.value = defaultTrack.id;
        trackMessage.value = defaultTrack.src
          ? `已就绪：${defaultTrack.label}`
          : `当前为占位曲目，建议放置在 ${defaultTrack.suggestedPath}`;
      }

      // 初始化粒子背景（跟随鼠标）
      initParticles(theme.accents, appSettings.value.particleMode || "normal");

      // 加载时淡入（顺序）
      await nextTick();
      const animEls = Array.from(document.querySelectorAll("[data-animate]"));
      animEls.forEach((el, idx) => {
        setTimeout(() => el.classList.add("isVisible"), 80 + idx * 90);
      });

      // Uploaded photos: 从 IndexedDB 加载 blob -> objectURL
      // 兼容迁移：如果旧数据里还残留 src(DataURL)，尝试迁移进 IndexedDB
      for (const p of uploadedPhotos.value) {
        if (uploadedSrcMap[p.id]) continue;
        const blob = await getPhotoBlob(p.id);
        if (blob) {
          uploadedSrcMap[p.id] = URL.createObjectURL(blob);
          continue;
        }
        // 旧版本迁移（极少发生）：从 localStorage 原始 JSON 中找 src
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.uploadedPhotos);
          const arr = raw ? JSON.parse(raw) : [];
          const old = Array.isArray(arr) ? arr.find((x) => x?.id === p.id && typeof x?.src === "string") : null;
          if (old?.src) {
            const b = dataUrlToBlob(old.src);
            if (b) {
              await putPhotoBlob(p.id, b);
              uploadedSrcMap[p.id] = URL.createObjectURL(b);
            }
          }
        } catch {
          // ignore
        }
      }

      // 首屏加载遮罩隐藏
      hideBootSplash();

      // 全屏分段切换：鼠标滚轮 / 键盘上下
      const sectionsCount = sections.length;
      let locked = false;
      let lastAt = 0;

      function isTypingTarget() {
        const el = document.activeElement;
        if (!el) return false;
        const tag = el.tagName?.toLowerCase?.() || "";
        return tag === "textarea" || tag === "input" || tag === "select";
      }

      function navByDir(dir) {
        if (locked) return;
        const next = activeIndex.value + dir;
        if (next < 0 || next >= sectionsCount) return;
        const nowTs = Date.now();
        if (nowTs - lastAt < 720) return;
        lastAt = nowTs;
        locked = true;
        goTo(next);
        setTimeout(() => {
          locked = false;
        }, 720);
      }

      const wheelHandler = (e) => {
        if (modalPhoto.value) return;
        if (isTypingTarget()) return;
        e.preventDefault();
        const dy = e.deltaY ?? 0;
        if (Math.abs(dy) < 18) return;
        navByDir(dy > 0 ? 1 : -1);
      };

      window.addEventListener("wheel", wheelHandler, { passive: false });

      const keyHandler = (e) => {
        if (modalPhoto.value) return;
        if (isTypingTarget()) return;

        const k = e.key;
        if (k === "ArrowDown" || k === "PageDown" || k === " " || k === "Enter") {
          e.preventDefault();
          navByDir(1);
        } else if (k === "ArrowUp" || k === "PageUp") {
          e.preventDefault();
          navByDir(-1);
        }
      };
      window.addEventListener("keydown", keyHandler);

      window.addEventListener("hashchange", syncFromHash);

      // 触摸滑动切换（移动端）
      let startY = 0;
      let startX = 0;
      let touchLock = false;

      window.addEventListener(
        "touchstart",
        (e) => {
          if (modalPhoto.value) return;
          if (e.touches && e.touches.length) {
            startY = e.touches[0].clientY;
            startX = e.touches[0].clientX;
            touchLock = false;
          }
        },
        { passive: true }
      );

      window.addEventListener(
        "touchmove",
        (e) => {
          if (!startY || !e.touches || !e.touches.length) return;
          const dy = e.touches[0].clientY - startY;
          const dx = e.touches[0].clientX - startX;
          if (Math.abs(dy) > 40 && Math.abs(dx) < 120) {
            // 标记为竖向滑动切换，避免被水平相册抢走
            touchLock = true;
          }
        },
        { passive: true }
      );

      window.addEventListener(
        "touchend",
        (e) => {
          if (modalPhoto.value) return;
          if (!touchLock) return;
          if (isTypingTarget()) return;
          const endY = e.changedTouches?.[0]?.clientY;
          if (endY === undefined) return;
          const dy = endY - startY;
          if (Math.abs(dy) < 60) return;
          navByDir(dy < 0 ? 1 : -1);
        },
        { passive: true }
      );
    });

    const albumEmptyText = computed(() => "");
    const appRootStyle = computed(() => {
      if (!appSettings.value.bgImageDataUrl) return {};
      return {
        backgroundImage: `linear-gradient(rgba(247,242,234,0.62), rgba(247,242,234,0.62)), url(${appSettings.value.bgImageDataUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    });
    const tagOptions = [
      { value: "all", label: "全部" },
      { value: "spring", label: "春" },
      { value: "summer", label: "夏" },
      { value: "autumn", label: "秋" },
      { value: "winter", label: "冬" },
      { value: "other", label: "其它" },
    ];
    const dynamicTagOptions = computed(() => {
      const base = ["spring", "summer", "autumn", "winter", "other"];
      const all = Array.from(new Set([...(appSettings.value.customTags || []), ...base]));
      return [
        { value: "all", label: "全部" },
        ...all.map((t) => ({ value: t, label: t })),
      ];
    });

    const backupHint = computed(() => {
      const n = uploadedPhotos.value.length;
      if (n >= 15) return "本地上传图片较多，建议尽快导出 JSON 备份。";
      return "";
    });

    const timeMailboxMaxChars = CONFIG.mailbox.maxChars;

    return {
      CONFIG,
      theme,
      seasonKey,
      sections,
      activeIndex,
      appRootStyle,
      modalPhoto,
      galleryEl,
      album,
      allPhotos,
      uploadedPhotos,
      uploading,
      photoViewMode,
      photoSortMode,
      photoFilterTag,
      tagOptions,
      dynamicTagOptions,
      selectedUploadedPhotoIds,
      bulkTag,
      bulkLocation,
      bulkDate,
      applyBulkEdit,
      handlePhotoUpload,
      clearUploadedPhotos,
      removeUploadedPhoto,
      updateUploadedMeta,
      toggleUploadedSelected,
      deleteSelectedUploaded,
      musicTracks,
      currentTrackId,
      trackMessage,
      playTrack,
      pauseTrack,
      showMusicSettings,
      settingsDraft,
      openMusicSettings,
      saveMusicSettings,
      resetMusicSettings,
      appSettings,
      handleBackgroundUpload,
      clearBackgroundImage,
      setParticleMode,
      setMotion,
      showClearConfirm,
      clearAllLocalData,
      exportAllData,
      importAllData,
      importMode,
      backupHint,
      newCustomTag,
      addCustomTag,
      removeCustomTag,
      canUnlock,
      unlockAtCN: ymdToCompact(CONFIG.unlockDate),
      mailboxLetters,
      timeLetters,
      newMailboxText,
      newTimeText,
      timeMailboxOpened,

      goTo,
      formatDateRight,

      openPhoto,
      closePhoto,
      scrollAlbumBy,

      submitMailbox,
      toggleLetterExpanded,

      submitTimeMailbox: () => submitTimeMailbox(),
      unlockTimeMailbox,
      canUseReducedMotion,

      // 解密状态
      p1Solved,
      p2Solved,
      p3Solved,
      wheelDigits,
      wheelSelected,
      wheelRotationDeg,
      p1Error,
      p2Value,
      p3Value,
      p2Error,
      p3Error,
      finalValue,
      finalError,
      decrypted,
      finalPassword,
      monthDigit,
      dayDigits,
      dayFirstDigit,

      confirmPuzzle1,
      confirmPuzzle2,
      confirmPuzzle3,
      confirmFinal,
      hiddenImageSrc,

      // 长按导出
      startLongPressExport,
      cancelLongPress,

      // 适配时光信箱 textarea 字数
      timeMailboxMaxChars,

      albumEmptyText,
    };
  },

  template: `
    <div class="appRoot" :style="appRootStyle" aria-label="时光纪">
      <div class="fullpage" :style="{ transform: 'translate3d(0,' + (-activeIndex * 100) + 'vh,0)' }">
        <!-- 首页 -->
        <section class="panel" :class="{ isActive: activeIndex === 0 }">
          <div class="panelInner">
            <div class="panelCard homeHero">
              <div class="brandRow" data-animate>
                <div class="brandMark">{{ CONFIG.projectName }}</div>
                <div class="brandSub">{{ theme.name }} · 温柔时间记录</div>
              </div>

              <div class="homeTextBlock" data-animate>
                <p class="homeTextMain">{{ theme.homeLead }}</p>
                <p class="homeTextMain" style="margin-top:10px;">{{ theme.homeSentence }}</p>
                <p class="homeTextTail">{{ theme.homeTail }}</p>
              </div>

              <div class="homeLinks" data-animate>
                <a class="linkBtn" href="#album" @click.prevent="goTo(1)">进入相册</a>
                <a class="linkBtn" href="#decrypt" @click.prevent="goTo(2)">尝试解密</a>
                <a class="linkBtn" href="#time-mailbox" @click.prevent="goTo(4)">时光信箱</a>
              </div>

              <div class="musicPanel" data-animate>
                <div class="musicHead">
                  <h3 class="musicTitle">季节音乐</h3>
                  <div class="musicHint">当前季节：{{ seasonKey }}</div>
                </div>
                <p class="musicIntro">{{ CONFIG.seasonalMusic.intro }}</p>
                <div class="musicGrid">
                  <button
                    v-for="track in musicTracks"
                    :key="track.id"
                    class="musicItem"
                    :class="{
                      isActive: currentTrackId === track.id,
                      isCurrentSeason: track.season === seasonKey
                    }"
                    type="button"
                    @click="playTrack(track.id)"
                  >
                    <span>{{ track.label }}</span>
                    <small>{{ track.src ? "已配置" : "占位" }}</small>
                  </button>
                </div>
                <div class="musicActions">
                  <button class="btnOutline" type="button" @click="pauseTrack">暂停</button>
                  <button class="btnOutline" type="button" @click="openMusicSettings">音乐设置</button>
                  <div class="musicStatus">{{ trackMessage }}</div>
                </div>
              </div>

              <div class="settingsPanel" data-animate>
                <div class="settingsTitle">设置中心</div>
                <div class="settingsGrid">
                  <div class="settingsItem">
                    <div class="settingsLabel">背景图（本地替换）</div>
                    <div class="settingsActions">
                      <label class="btnOutline uploadBtn">
                        选择背景图
                        <input type="file" accept="image/*" style="display:none;" @change="handleBackgroundUpload" />
                      </label>
                      <button class="btnOutline" type="button" @click="clearBackgroundImage">清除背景图</button>
                    </div>
                  </div>
                  <div class="settingsItem">
                    <div class="settingsLabel">动画强度</div>
                    <div class="settingsActions">
                      <button class="btnOutline" type="button" @click="setParticleMode('off')">关闭</button>
                      <button class="btnOutline" type="button" @click="setParticleMode('low')">低</button>
                      <button class="btnOutline" type="button" @click="setParticleMode('normal')">标准</button>
                    </div>
                  </div>
                  <div class="settingsItem">
                    <div class="settingsLabel">数据备份</div>
                    <div class="settingsActions">
                      <button class="btnOutline" type="button" @click="exportAllData">导出 JSON</button>
                      <label class="btnOutline uploadBtn">
                        导入 JSON
                        <input type="file" accept="application/json" style="display:none;" @change="importAllData" />
                      </label>
                    </div>
                    <div class="counterText" style="margin-top:6px;">
                      导入方式：
                      <select class="textInput selectInput" v-model="importMode">
                        <option value="merge">合并</option>
                        <option value="overwrite">覆盖</option>
                      </select>
                    </div>
                    <div v-if="backupHint" class="counterText" style="margin-top:6px;">{{ backupHint }}</div>
                  </div>
                  <div class="settingsItem">
                    <div class="settingsLabel">动效总开关</div>
                    <div class="settingsActions">
                      <button class="btnOutline" type="button" @click="setMotion('auto')">自动</button>
                      <button class="btnOutline" type="button" @click="setMotion('reduce')">减少</button>
                      <button class="btnOutline" type="button" @click="setMotion('full')">完整</button>
                    </div>
                  </div>
                  <div class="settingsItem">
                    <div class="settingsLabel">自定义标签</div>
                    <div class="settingsActions">
                      <input class="textInput" v-model="newCustomTag" placeholder="例如 雨后 / 黄昏" />
                      <button class="btnOutline" type="button" @click="addCustomTag">添加</button>
                    </div>
                    <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
                      <button
                        v-for="t in (appSettings.customTags || [])"
                        :key="t"
                        class="btnOutline"
                        type="button"
                        @click="removeCustomTag(t)"
                      >
                        {{ t }}
                      </button>
                    </div>
                  </div>
                  <div class="settingsItem">
                    <div class="settingsLabel">清理</div>
                    <div class="settingsActions">
                      <button class="btnOutline" type="button" @click="showClearConfirm = !showClearConfirm">
                        清除全部本地数据
                      </button>
                      <button v-if="showClearConfirm" class="btnOutline" type="button" @click="clearAllLocalData">
                        确认清除
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 相册 -->
        <section class="panel" :class="{ isActive: activeIndex === 1 }">
          <div class="panelInner">
            <div class="panelCard">
              <h2 class="panelTitle" data-animate>相册</h2>
              <p class="panelLead" data-animate>左右滑动浏览。悬停有轻微放大与柔和阴影。点击查看全屏。</p>

              <div class="galleryWrap" data-animate>
                <div class="galleryToolRow">
                  <div class="galleryToolGroup">
                    <button class="btnOutline" type="button" @click="photoViewMode='wall'">照片墙</button>
                    <button class="btnOutline" type="button" @click="photoViewMode='timeline'">时间轴</button>
                  </div>
                  <div class="galleryToolGroup">
                    <select class="textInput selectInput" v-model="photoSortMode">
                      <option value="desc">日期降序</option>
                      <option value="asc">日期升序</option>
                    </select>
                    <select class="textInput selectInput" v-model="photoFilterTag">
                      <option v-for="t in dynamicTagOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
                    </select>
                  </div>
                </div>
                <button class="galleryArrow left" @click="scrollAlbumBy(-1)" aria-label="向左"></button>
                <div class="gallery" ref="galleryEl" :class="{ timeline: photoViewMode === 'timeline' }">
                  <figure
                    v-for="photo in allPhotos"
                    :key="photo.id"
                    class="photoCard"
                    @click="openPhoto(photo)"
                  >
                    <div class="photoImageFrame">
                      <img :src="photo.src" loading="lazy" :alt="photo.caption" />
                    </div>
                    <figcaption class="photoMeta">
                      <div class="photoDate">{{ photo.date }}</div>
                      <div class="photoLocation">{{ photo.location }}</div>
                      <div class="photoCaption">{{ photo.caption }}</div>
                    </figcaption>
                  </figure>
                </div>
                <button class="galleryArrow right" @click="scrollAlbumBy(1)" aria-label="向右"></button>
              </div>

              <div class="uploadPanel" data-animate>
                <div class="uploadHead">
                  <h3 class="uploadTitle">{{ CONFIG.albumUpload.title }}</h3>
                  <div class="uploadHint">{{ CONFIG.albumUpload.persistNote }}</div>
                </div>
                <p class="panelLead" style="margin-top:6px;">{{ CONFIG.albumUpload.intro }}</p>
                <div class="uploadActions">
                  <label class="linkBtn uploadBtn">
                    {{ uploading ? "处理中..." : CONFIG.albumUpload.addButton }}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      :disabled="uploading"
                      @change="handlePhotoUpload"
                      style="display:none;"
                    />
                  </label>
                  <button class="btnOutline" type="button" @click="clearUploadedPhotos">
                    {{ CONFIG.albumUpload.clearButton }}
                  </button>
                </div>

                <div class="uploadList internalScroll" style="margin-top:12px;">
                  <div v-if="uploadedPhotos.length === 0" class="counterText">
                    {{ CONFIG.albumUpload.noData }}
                  </div>
                  <div v-for="photo in uploadedPhotos" :key="photo.id" class="uploadItem">
                    <input
                      type="checkbox"
                      class="uploadCheck"
                      :checked="selectedUploadedPhotoIds.includes(photo.id)"
                      @change="toggleUploadedSelected(photo.id)"
                    />
                    <img :src="photo.src" alt="本地上传预览" class="uploadThumb" />
                    <div class="uploadMeta">
                      <input
                        class="textInput uploadInput"
                        :value="photo.date"
                        @change="updateUploadedMeta(photo, 'date', $event.target.value)"
                      />
                      <input
                        class="textInput uploadInput"
                        :value="photo.location"
                        @change="updateUploadedMeta(photo, 'location', $event.target.value)"
                      />
                      <input
                        class="textInput uploadInput"
                        :value="photo.caption"
                        @change="updateUploadedMeta(photo, 'caption', $event.target.value)"
                      />
                      <select
                        class="textInput uploadInput"
                        :value="photo.tag || 'other'"
                        @change="updateUploadedMeta(photo, 'tag', $event.target.value)"
                      >
                        <option v-for="t in tagOptions.filter(x=>x.value!=='all')" :key="t.value" :value="t.value">
                          {{ t.label }}
                        </option>
                      </select>
                    </div>
                    <button class="btnOutline" type="button" @click="removeUploadedPhoto(photo.id)">
                      删除
                    </button>
                  </div>
                  <div v-if="selectedUploadedPhotoIds.length" style="margin-top:8px;">
                    <button class="btnOutline" type="button" @click="deleteSelectedUploaded">
                      批量删除（{{ selectedUploadedPhotoIds.length }}）
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 解密 -->
        <section class="panel" :class="{ isActive: activeIndex === 2 }">
          <div class="panelInner">
            <div class="glassPanel">
              <h2 class="panelTitle" data-animate>解密</h2>
              <p class="panelLead" data-animate>每一步都更接近答案。完成后会出现最后的输入框。</p>

              <div class="puzzleGrid" data-animate>
                <!-- 谜题一 -->
                <div class="puzzleCard" :class="{ isSolved: p1Solved }">
                  <div class="puzzleInner">
                    <div class="puzzleFace">
                      <div class="puzzleTitleRow">
                        <div class="puzzleName">{{ CONFIG.decrypt.step1.title }}</div>
                        <div class="puzzleHint">从基准日期提取线索</div>
                      </div>
                      <div class="puzzleQuestion">{{ CONFIG.decrypt.step1.question }}</div>

                      <div class="wheelArea">
                        <div class="wheelWrap" aria-label="密码转盘">
                          <div class="wheelPointer" aria-hidden="true"></div>
                          <div class="wheel" :style="{ transform: 'rotate(' + wheelRotationDeg + 'deg)' }">
                            <div
                              v-for="d in wheelDigits"
                              :key="d"
                              class="wheelSegment"
                              :style="{
                                transform: 'translate(-50%,-50%) rotate(' + (d * 36) + 'deg) translate(0,-74px) rotate(-' + (d * 36) + 'deg)',
                                pointerEvents: p1Solved ? 'none' : 'auto'
                              }"
                              @click="wheelSelected = d"
                            >
                              <span>{{ d }}</span>
                            </div>
                          </div>
                          <div class="wheelCenter" aria-hidden="true"></div>
                        </div>

                        <div style="flex:1; min-width: 240px;">
                          <div class="puzzleQuestion" style="margin-top:0;">
                            选择完成后确认。错误不会推进。
                          </div>
                          <div class="fieldRow" style="margin-top:14px;">
                            <button class="btnOutline" @click="confirmPuzzle1" type="button">
                              {{ CONFIG.decrypt.step1.confirm }}
                            </button>
                          </div>
                          <div v-if="p1Error" class="msgError">{{ p1Error }}</div>
                        </div>
                      </div>
                    </div>

                    <div class="puzzleFace puzzleBack">
                      <div class="checkMark">✓</div>
                      <div>
                        <div class="puzzleName">完成</div>
                        <div class="puzzleHint">已解锁下一步</div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 谜题二 -->
                <div class="puzzleCard" :class="{ isSolved: p2Solved }" :style="{ pointerEvents: p1Solved ? 'auto' : 'none', opacity: p1Solved ? 1 : 0.62 }">
                  <div class="puzzleInner">
                    <div class="puzzleFace">
                      <div class="puzzleTitleRow">
                        <div class="puzzleName">{{ CONFIG.decrypt.step2.title }}</div>
                        <div class="puzzleHint">输入两位数字</div>
                      </div>
                      <div class="puzzleQuestion">{{ CONFIG.decrypt.step2.question }}</div>

                      <div class="fieldRow">
                        <input
                          class="textInput"
                          v-model="p2Value"
                          :placeholder="CONFIG.decrypt.step2.placeholder"
                        />
                        <button class="btnOutline" @click="confirmPuzzle2" type="button">
                          {{ CONFIG.decrypt.step2.confirm }}
                        </button>
                      </div>
                      <div v-if="p2Error" class="msgError">{{ p2Error }}</div>
                    </div>

                    <div class="puzzleFace puzzleBack">
                      <div class="checkMark">✓</div>
                      <div>
                        <div class="puzzleName">完成</div>
                        <div class="puzzleHint">已解锁下一步</div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 谜题三 -->
                <div class="puzzleCard" :class="{ isSolved: p3Solved }" :style="{ pointerEvents: p2Solved ? 'auto' : 'none', opacity: p2Solved ? 1 : 0.62 }">
                  <div class="puzzleInner">
                    <div class="puzzleFace">
                      <div class="puzzleTitleRow">
                        <div class="puzzleName">{{ CONFIG.decrypt.step3.title }}</div>
                        <div class="puzzleHint">继续提取下一位</div>
                      </div>
                      <div class="puzzleQuestion">{{ CONFIG.decrypt.step3.question }}</div>

                      <div class="fieldRow">
                        <input
                          class="textInput"
                          v-model="p3Value"
                          :placeholder="CONFIG.decrypt.step3.placeholder"
                        />
                        <button class="btnOutline" @click="confirmPuzzle3" type="button">
                          {{ CONFIG.decrypt.step3.confirm }}
                        </button>
                      </div>
                      <div v-if="p3Error" class="msgError">{{ p3Error }}</div>
                    </div>

                    <div class="puzzleFace puzzleBack">
                      <div class="checkMark">✓</div>
                      <div>
                        <div class="puzzleName">完成</div>
                        <div class="puzzleHint">可以输入最终密码</div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 最终密码 -->
                <div class="finalBox" v-if="p3Solved && !decrypted" :style="{ marginTop: 8 }">
                  <div class="puzzleTitleRow">
                    <div class="puzzleName">{{ CONFIG.decrypt.final.title }}</div>
                    <div class="puzzleHint">密码由上一段信息组合而来</div>
                  </div>
                  <div class="puzzleQuestion">{{ CONFIG.decrypt.final.prompt }}</div>
                  <div class="fieldRow">
                    <input
                      class="textInput"
                      v-model="finalValue"
                      placeholder="例如 919"
                      inputmode="numeric"
                    />
                    <button class="btnOutline" @click="confirmFinal" type="button">
                      {{ CONFIG.decrypt.final.confirm }}
                    </button>
                  </div>
                  <div v-if="finalError" class="msgError">{{ finalError }}</div>
                </div>

                <div class="hiddenReveal" v-if="decrypted">
                  <p class="hiddenRevealTitle">{{ CONFIG.decrypt.final.hiddenTitle }}</p>
                  <div class="hiddenRevealBody">{{ CONFIG.decrypt.final.hiddenBody }}</div>
                  <div class="hiddenRevealBody" style="opacity:0.7; margin-top:8px;">{{ CONFIG.decrypt.final.hiddenNote }}</div>
                  <img class="hiddenRevealImage" :src="hiddenImageSrc" :alt="CONFIG.decrypt.final.hiddenImageAlt" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 信箱 -->
        <section class="panel" :class="{ isActive: activeIndex === 3 }">
          <div class="panelInner">
            <div class="glassPanel">
              <h2 class="panelTitle" data-animate>{{ CONFIG.mailbox.title }}</h2>
              <p class="panelLead" data-animate>{{ CONFIG.mailbox.intro }}</p>

              <div class="mailLayout" data-animate>
                <div>
                  <textarea
                    class="textarea"
                    v-model="newMailboxText"
                    :maxlength="CONFIG.mailbox.maxChars"
                    :placeholder="CONFIG.mailbox.placeholder"
                  ></textarea>
                  <div class="mailActionRow">
                    <div class="counterText">{{ newMailboxText.length }} / {{ CONFIG.mailbox.maxChars }}</div>
                    <button class="btnOutline" @click="submitMailbox" type="button">
                      封存
                    </button>
                  </div>
                </div>

                <div class="list internalScroll">
                  <div v-if="mailboxLetters.length === 0" style="color: rgba(20,20,25,0.58); font-size: 13.5px; line-height: 1.8;">
                    {{ CONFIG.mailbox.emptyState }}
                  </div>

                  <div
                    v-for="letter in mailboxLetters"
                    :key="letter.id"
                    class="letterItem"
                  >
                    <div class="letterHead" @click="toggleLetterExpanded(mailboxLetters, letter.id)">
                      <div class="letterPreview">
                        {{ letter.text.slice(0, 60) }}{{ letter.text.length > 60 ? "…" : "" }}
                      </div>
                      <div class="letterDateRight">{{ formatDateRight(letter.createdAt) }}</div>
                    </div>
                    <div class="letterBody" v-if="letter.expanded">
                      {{ letter.text }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 时光信箱 -->
        <section class="panel" :class="{ isActive: activeIndex === 4 }">
          <div class="panelInner">
            <div class="glassPanel">
              <h2 class="panelTitle" data-animate>{{ CONFIG.timeMailbox.title }}</h2>
              <p class="panelLead" data-animate>{{ CONFIG.timeMailbox.intro }}</p>

              <div class="sealBox" style="margin-top:16px;" data-animate>
                <div class="unlockRow">
                  <div class="sealMeta">
                    <div>解锁日期：{{ unlockAtCN }}</div>
                    <div style="margin-top:6px;">{{ canUnlock ? "可以开启" : "尚未到达" }}</div>
                  </div>
                  <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
                    <button
                      v-if="canUnlock && !timeMailboxOpened"
                      class="btnOutline"
                      type="button"
                      @click="unlockTimeMailbox"
                    >
                      {{ CONFIG.timeMailbox.unlockButton }}
                    </button>
                    <div v-if="timeMailboxOpened" class="counterText" style="padding:10px 0;">
                      {{ CONFIG.timeMailbox.openedHint }}
                    </div>
                  </div>
                </div>

                <div class="mailLayout" style="margin-top:12px;">
                  <textarea
                    class="textarea"
                    v-model="newTimeText"
                    :maxlength="timeMailboxMaxChars"
                    :placeholder="CONFIG.timeMailbox.placeholder"
                  ></textarea>
                  <div class="mailActionRow">
                    <div class="counterText">{{ newTimeText.length }} / {{ timeMailboxMaxChars }}</div>
                    <button class="btnOutline" type="button" @click="submitTimeMailbox">
                      {{ CONFIG.timeMailbox.sealButton }}
                    </button>
                  </div>
                </div>

                <div class="exportHint" style="margin-top:8px;">
                  {{ canUnlock && timeMailboxOpened ? "长按每条留言卡片可保存为图片。" : "" }}
                </div>
              </div>

              <div class="timeLetters" v-if="timeMailboxOpened" data-animate>
                <div class="list internalScroll">
                  <div v-if="timeLetters.length === 0" style="color: rgba(20,20,25,0.58); font-size: 13.5px; line-height: 1.8;">
                    {{ CONFIG.timeMailbox.emptyState }}
                  </div>

                  <div
                    v-for="letter in timeLetters"
                    :key="letter.id"
                    class="letterItem"
                    :data-export-id="letter.id"
                    @pointerdown="startLongPressExport(letter.id)"
                    @pointerup="cancelLongPress"
                    @pointerleave="cancelLongPress"
                  >
                    <div class="letterHead" @click="toggleLetterExpanded(timeLetters, letter.id)">
                      <div class="letterPreview">
                        {{ letter.text.slice(0, 60) }}{{ letter.text.length > 60 ? "…" : "" }}
                      </div>
                      <div class="letterDateRight">{{ formatDateRight(letter.createdAt) }}</div>
                    </div>
                    <div class="letterBody" v-if="letter.expanded">
                      {{ letter.text }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 底部极简导航点 -->
      <nav class="dotsNav" aria-label="板块导航">
        <button
          v-for="(s, idx) in sections"
          :key="s.id"
          class="navDot"
          :class="{ isActive: activeIndex === idx }"
          :data-title="s.title"
          @click="goTo(idx)"
          type="button"
          :aria-label="s.title"
        ></button>
      </nav>

      <div v-if="showMusicSettings" class="modalBackdrop" @click.self="showMusicSettings=false">
        <div class="modalCard" role="dialog" aria-modal="true">
          <div class="modalTopBar">
            <button class="modalClose" type="button" @click="showMusicSettings=false" aria-label="关闭"></button>
          </div>
          <div class="modalBody">
            <h3 class="panelTitle">音乐设置</h3>
            <p class="panelLead">可修改曲目名称与音频路径，保存后写入本地存储。</p>
            <div class="uploadList" style="margin-top:10px;">
              <div v-for="track in settingsDraft" :key="track.id" class="letterItem">
                <div class="uploadMeta">
                  <input class="textInput uploadInput" v-model="track.label" />
                  <input class="textInput uploadInput" v-model="track.src" :placeholder="track.suggestedPath" />
                </div>
              </div>
            </div>
            <div class="settingsActions" style="margin-top:10px;">
              <button class="btnOutline" type="button" @click="saveMusicSettings">保存</button>
              <button class="btnOutline" type="button" @click="resetMusicSettings">恢复默认</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 相册全屏 -->
      <div
        v-if="modalPhoto"
        class="modalBackdrop"
        @click.self="closePhoto"
      >
        <div class="modalCard" role="dialog" aria-modal="true">
          <div class="modalTopBar">
            <button class="modalClose" type="button" @click="closePhoto" aria-label="关闭"></button>
          </div>
          <div class="modalBody">
            <img class="modalImage" :src="modalPhoto.src" :alt="modalPhoto.caption" loading="eager" />
            <div class="modalText">
              <span>{{ modalPhoto.date }}</span>
              <span style="opacity:0.45;">·</span>
              <span>{{ modalPhoto.location }}</span>
            </div>
            <div class="modalCaption">{{ modalPhoto.caption }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
});

app.mount("#app");

