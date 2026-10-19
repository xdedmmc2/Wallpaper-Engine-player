(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const readJSON = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const readBool = (key, fallback) => {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value !== '0';
  };
  const write = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* private mode */ } };
  const writeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const LANGUAGE = window.LUMA_LANGUAGE === 'en' ? 'en' : 'zh';
  const IS_EN = LANGUAGE === 'en';
  const EN = window.LUMA_EN || {};
  const dateLocale = IS_EN ? 'en-US' : 'zh-CN';

  const TYPE_ICON = { video: 'film', scene: 'layers', web: 'globe', application: 'app', image: 'image', other: 'box' };
  const FILTERS = [
    ['all', '全部'],
    ['video', '视频'],
    ['scene', '场景'],
    ['web', '网页'],
    ['application', '应用'],
    ['other', '其他'],
  ];
  const RISKY_VIDEO_EXT = new Set(['.mkv', '.avi', '.wmv', '.flv', '.mov', '.ts']);
  const STEAM_WARNING = 'Steam 创意工坊的订阅记录仍然存在，Wallpaper Engine 下次同步时可能重新下载该壁纸；要彻底移除需先在创意工坊取消订阅。';
  const DECODE_MESSAGE = '浏览器无法解码这个视频的画面（可能是 HEVC/H.265，或系统缺少对应解码组件）。时间轴可能继续走，但不会显示画面。可点击“系统播放”用本地播放器打开源文件。';
  const dateFmt = new Intl.DateTimeFormat(dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateTimeFmt = new Intl.DateTimeFormat(dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const collator = new Intl.Collator(dateLocale, { numeric: true, sensitivity: 'base' });
  const HAN_RE = /\p{Script=Han}/u;
  const SKIP_TRANSLATION = 'script, style, noscript, [data-i18n-skip]';
  const countLabel = (count, one, many) => `${count} ${Number(count) === 1 ? one : many}`;
  const renameSuffix = (value) => {
    if (value.includes('并重命名为壁纸标题')) return ', renamed to the wallpaper title';
    if (value.includes('并保留原文件名')) return ', keeping the original file name';
    if (value.includes('并保留原文件夹名')) return ', keeping the original folder name';
    if (value.includes('并保留原名称')) return ', keeping the original name';
    return '';
  };

  const EN_PATTERNS = [
    [/^第 (\d+) \/ (\d+) 页$/, (m) => `Page ${m[1]} of ${m[2]}`],
    [/^(\d+) 个壁纸 · (.+)$/, (m) => `${countLabel(m[1], 'wallpaper', 'wallpapers')} · ${m[2].split(' · ').map((part) => translateLine(part)).join(' · ')}`],
    [/^(Steam 创意工坊|我的项目|手动选择|自定义目录)(?: (\d+))?$/, (m) => `${EN[m[1]] || m[1]}${m[2] ? ` ${m[2]}` : ''}`],
    [/^(\d+) 张$/, (m) => `${m[1]} per page`],
    [/^创建时间：(.+)$/, (m) => `Created: ${m[1]}`],
    [/^下载时间（当前下载时间排序依据）：(.+)$/, (m) => `Downloaded (current sort): ${m[1]}`],
    [/^创建 (.+)$/, (m) => `Created ${m[1]}`],
    [/^下载 (.+)$/, (m) => `Downloaded ${m[1]}`],
    [/^(.+) 操作$/, (m) => `${m[1]} actions`],
    [/^(.+)，(视频|场景|网页|应用|图片|其他|文件|文件夹)$/, (m) => `${m[1]}, ${EN[m[2]] || m[2]}`],
    [/^总占用 (.+?)(?: · 扫描于 (.+))?$/, (m) => `Total ${m[1]}${m[2] ? ` · Scanned ${m[2]}` : ''}`],
    [/^(\d+) 项$/, (m) => countLabel(m[1], 'item', 'items')],
    [/^有 (\d+) 个文件夹无法读取，已跳过。$/, (m) => `Could not read ${countLabel(m[1], 'folder', 'folders')}; skipped.`],
    [/^没有找到标题包含“(.+)”的壁纸。搜索只匹配壁纸名，不匹配文件夹名。$/, (m) => `No wallpapers with “${m[1]}” in the title. Search matches wallpaper names only, not folder names.`],
    [/^0 个壁纸$/, () => '0 wallpapers'],
    [/^移动 (\d+) 个壁纸$/, (m) => `Move ${countLabel(m[1], 'wallpaper', 'wallpapers')}`],
    [/^移动 (\d+) 个壁纸？$/, (m) => `Move ${countLabel(m[1], 'wallpaper', 'wallpapers')}?`],
    [/^删除 (\d+) 个壁纸？$/, (m) => `Delete ${countLabel(m[1], 'wallpaper', 'wallpapers')}?`],
    [/^将直接移动 (\d+) 个独立媒体文件(.+?)。$/, (m) => `Move ${countLabel(m[1], 'standalone media file', 'standalone media files')} directly${renameSuffix(m[2])}.`],
    [/^独立媒体文件会直接移动文件(.+?)；文件夹壁纸按完整文件夹移动(.+?)。$/, (m) => `Standalone media files move directly${renameSuffix(m[1])}; wallpaper folders move as complete folders${renameSuffix(m[2])}.`],
    [/^将整个壁纸文件夹移动到目标目录(.+?)；原文件夹会随文件夹一起移动。$/, (m) => `Move the entire wallpaper folder to the destination${renameSuffix(m[1])}; the source folder moves with it.`],
    [/^仅移动主文件：目标文件(.+?)，不再创建同名文件夹。$/, (m) => `Main file only: the destination file${renameSuffix(m[1])}; no same-name folder is created.`],
    [/^原文件夹中的其余 (\d+) 个文件会保留在原处。$/, (m) => `The other ${countLabel(m[1], 'file', 'files')} in the source folder stay in place.`],
    [/^原文件夹中的其余 (\d+) 个文件会随原文件夹一起删除。$/, (m) => `The other ${countLabel(m[1], 'file', 'files')} in the source folder are deleted with it.`],
    [/^原文件夹中的其余 (\d+) 个文件会一并删除。$/, (m) => `The other ${countLabel(m[1], 'file', 'files')} in the source folder are also deleted.`],
    [/^(\d+) 个独立媒体文件会直接移动，不会删除其所在目录。$/, (m) => `${countLabel(m[1], 'standalone media file moves', 'standalone media files move')} directly; the containing folder is not deleted.`],
    [/^(\d+) 个非视频\/图片壁纸不支持此模式，将按完整文件夹移动。$/, (m) => `${countLabel(m[1], 'non-video/image wallpaper does', 'non-video/image wallpapers do')} not support this mode and will move as complete folders.`],
    [/^其中 (\d+) 个非视频\/图片壁纸不支持仅移动文件，将按完整文件夹移动。$/, (m) => `${countLabel(m[1], 'non-video/image wallpaper does', 'non-video/image wallpapers do')} not support main-file-only mode and will move as complete folders.`],
    [/^选中项包含 (\d+) 个非视频\/图片壁纸，将按完整文件夹移动。$/, (m) => `The selection contains ${countLabel(m[1], 'non-video/image wallpaper', 'non-video/image wallpapers')}; they will move as complete folders.`],
    [/^已移动 (\d+) 个壁纸(?:（覆盖 (\d+) 个）)?(?:（自动改名 (\d+) 个）)?$/, (m) => {
      let out = `Moved ${countLabel(m[1], 'wallpaper', 'wallpapers')}`;
      if (m[2]) out += ` (overwrote ${m[2]})`;
      if (m[3]) out += ` (auto-renamed ${m[3]})`;
      return out;
    }],
    [/^已保留 (\d+) 个原文件夹$/, (m) => `Kept ${countLabel(m[1], 'source folder', 'source folders')}`],
    [/^已删除源壁纸 (\d+) 个$/, (m) => `Deleted ${countLabel(m[1], 'source wallpaper', 'source wallpapers')}`],
    [/^已跳过 (\d+) 个$/, (m) => `Skipped ${m[1]}`],
    [/^已删除 (\d+) 个壁纸。$/, (m) => `Deleted ${countLabel(m[1], 'wallpaper', 'wallpapers')}.`],
    [/^另有 (\d+) 个$/, (m) => `${m[1]} more`],
    [/^目标位置：(.+)$/, (m) => `Destination: ${m[1]}`],
    [/^重命名：(.+)$/, (m) => `Rename: ${translateLine(m[1])}`],
    [/^删除原文件夹：(.+)$/, (m) => `Delete source folder: ${translateLine(m[1])}`],
    [/^· (.+)：(.+)$/, (m) => `· ${m[1]}: ${m[2]}`],
    [/^浏览器对 (.+) 的支持有限；如果无法解码会给出提示。$/, (m) => `Browser support for ${m[1]} is limited; a prompt appears if it cannot decode.`],
    [/^请求失败（HTTP (\d+)）$/, (m) => `Request failed (HTTP ${m[1]})`],
    [/^(Steam 创意工坊|我的项目|手动选择|自定义目录): (.+)$/, (m) => `${EN[m[1]] || m[1]}: ${m[2]}`],
    [/^(.+)：(.+)$/, (m) => `${m[1]}: ${m[2]}`],
    [/^(.+) · 文件夹 #(.+)$/, (m) => `${translateLine(m[1])} · Folder #${m[2]}`],
    [/^将壁纸主文件移动到目标文件夹，(.+?)。$/, (m) => `Move the main wallpaper file to the destination${renameSuffix(m[1])}.`],
    [/^将整个壁纸文件夹移动到目标位置，(.+?)。$/, (m) => `Move the entire wallpaper folder to the destination${renameSuffix(m[1])}.`]
  ];

  function translateLine(line) {
    const value = line.trim();
    if (!value || !HAN_RE.test(value)) return line;
    if (Object.prototype.hasOwnProperty.call(EN, value)) return EN[value];
    const bullet = value.match(/^([·•]\s+)([\s\S]+)$/);
    if (bullet) return bullet[1] + translateLine(bullet[2]);
    for (const [pattern, replacer] of EN_PATTERNS) {
      const match = value.match(pattern);
      if (match) return replacer(match);
    }
    if (value.includes(' · ')) {
      const parts = value.split(' · ');
      const translated = parts.map((part) => translateLine(part)).join(' · ');
      if (translated !== value) return translated;
    }
    return line;
  }

  function translatePhrase(value) {
    const match = String(value).match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!match) return value;
    const lead = match[1];
    const core = match[2];
    const trail = match[3];
    if (!core || !HAN_RE.test(core)) return value;
    return lead + core.split('\n').map((line) => translateLine(line)).join('\n') + trail;
  }

  function translateTextNode(node) {
    const value = node.nodeValue;
    if (!value || !HAN_RE.test(value)) return;
    const parent = node.parentElement;
    if (parent && parent.closest(SKIP_TRANSLATION)) return;
    const shortcut = parent && (parent.closest('.side-item') || parent.closest('.settings-browser-shortcut'));
    if (shortcut) {
      const sideLabels = {
        '桌面': 'Desktop',
        '下载': 'Downloads',
        '图片': 'Pictures',
        '视频': 'Videos',
        '音乐': 'Music',
        '文档': 'Documents',
        '用户目录': 'Home',
      };
      const translated = sideLabels[value.trim()];
      if (translated) {
        node.nodeValue = value.replace(value.trim(), translated);
        return;
      }
    }
    if (value.trim() === '下载') {
      const context = parent && (parent.closest('.meta-chip') || parent.closest('.compare-card'))
        ? 'Downloaded'
        : 'Downloads';
      node.nodeValue = value.replace('下载', context);
      return;
    }
    const next = translatePhrase(value);
    if (next !== value) node.nodeValue = next;
  }

  function translateAttributes(element, only) {
    if (!element || element.nodeType !== 1 || element.closest(SKIP_TRANSLATION)) return;
    for (const attr of (only ? [only] : ['title', 'placeholder', 'aria-label'])) {
      const value = element.getAttribute(attr);
      if (!value || !HAN_RE.test(value)) continue;
      const next = translatePhrase(value);
      if (next !== value) element.setAttribute(attr, next);
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && root.closest(SKIP_TRANSLATION)) return;
    if (root.nodeType === 1) translateAttributes(root);
    for (const child of root.childNodes) translateTree(child);
  }

  function translateDocumentTitle() {
    if (!IS_EN) return;
    const value = document.title;
    const suffix = ' · wallpaper播放器';
    const next = value.endsWith(suffix)
      ? `${value.slice(0, -suffix.length)} · Wallpaper Player`
      : (EN[value] || value);
    if (next !== value) document.title = next;
  }

  const els = {
    sourceLine: byId('sourceLine'), loopToggle: byId('loopToggle'), rescanBtn: byId('rescanBtn'),
    searchInput: byId('searchInput'), settingsBtn: byId('settingsBtn'),
    themeToggle: byId('themeToggle'), themeSegment: byId('themeSegment'),
    settingsLayer: byId('settingsLayer'), settingsClose: byId('settingsClose'),
    languageSelect: byId('languageSelect'),
    settingsTabGeneral: byId('settingsTabGeneral'), settingsTabAbout: byId('settingsTabAbout'),
    settingsGeneral: byId('settingsGeneral'), settingsAbout: byId('settingsAbout'),
    settingsPathInput: byId('settingsPathInput'), settingsHistory: byId('settingsHistory'),
    settingsBrowse: byId('settingsBrowse'), settingsApply: byId('settingsApply'),
    settingsReset: byId('settingsReset'), settingsCurrent: byId('settingsCurrent'),
    settingsMessage: byId('settingsMessage'), settingsBrowser: byId('settingsBrowser'),
    settingsBrowserUp: byId('settingsBrowserUp'), settingsBrowserClose: byId('settingsBrowserClose'),
    settingsBrowserPath: byId('settingsBrowserPath'), settingsBrowserShortcuts: byId('settingsBrowserShortcuts'),
    settingsBrowserList: byId('settingsBrowserList'), settingsBrowserCancel: byId('settingsBrowserCancel'),
    settingsBrowserSelect: byId('settingsBrowserSelect'), aboutVersion: byId('aboutVersion'),
    filterTabs: byId('filterTabs'), sortSelect: byId('sortSelect'), resultCount: byId('resultCount'),
    pageSizeSelect: byId('pageSizeSelect'), pagination: byId('pagination'),
    pagePrev: byId('pagePrev'), pageNext: byId('pageNext'), pageNumbers: byId('pageNumbers'), pageStatus: byId('pageStatus'),
    pageJumpInput: byId('pageJumpInput'), pageJumpBtn: byId('pageJumpBtn'),
    skeleton: byId('skeleton'), gallery: byId('gallery'), emptyState: byId('emptyState'),
    emptyTitle: byId('emptyTitle'), emptyText: byId('emptyText'), emptyHint: byId('emptyHint'), emptyRescan: byId('emptyRescan'),
    footerStats: byId('footerStats'), main: byId('main'), brandBtn: byId('brandBtn'),
    selectionBar: byId('selectionBar'), selectedCount: byId('selectedCount'),
    selectAllBtn: byId('selectAllBtn'), clearSelectionBtn: byId('clearSelectionBtn'),
    batchMoveBtn: byId('batchMoveBtn'), batchDeleteBtn: byId('batchDeleteBtn'),
    marquee: byId('marquee'), toasts: byId('toasts'),
    inlinePlayer: byId('inlinePlayer'), inlineVideo: byId('inlineVideo'), inlineClose: byId('inlineClose'),
    inlineError: byId('inlineError'), inlineErrorText: byId('inlineErrorText'), inlineSystem: byId('inlineSystem'),
    inlineErrorClose: byId('inlineErrorClose'), inlineRetry: byId('inlineRetry'), inlineControls: byId('inlineControls'), inlineSeek: byId('inlineSeek'),
    inlinePlay: byId('inlinePlay'), inlineTime: byId('inlineTime'), inlineMute: byId('inlineMute'),
    inlineFullscreen: byId('inlineFullscreen'),
    playerPage: byId('playerPage'), playerBack: byId('playerBack'), playerEyebrow: byId('playerEyebrow'),
    playerTitle: byId('playerTitle'), playerType: byId('playerType'), playerStage: byId('playerStage'),
    playerImage: byId('playerImage'), playerVideo: byId('playerVideo'), playerUnsupported: byId('playerUnsupported'),
    unsupportedTitle: byId('unsupportedTitle'), unsupportedText: byId('unsupportedText'),
    playerError: byId('playerError'), playerErrorText: byId('playerErrorText'),
    playerRevealFromError: byId('playerRevealFromError'), playerExternalPlay: byId('playerExternalPlay'), playerRetry: byId('playerRetry'), bigPlay: byId('bigPlay'), stageSpinner: byId('stageSpinner'),
    playerControls: byId('playerControls'), seekBar: byId('seekBar'), playToggle: byId('playToggle'),
    curTime: byId('curTime'), durTime: byId('durTime'), loopIndicator: byId('loopIndicator'),
    muteToggle: byId('muteToggle'), volumeBar: byId('volumeBar'), fullscreenBtn: byId('fullscreenBtn'),
    stageHint: byId('stageHint'), playerMeta: byId('playerMeta'), playerWarning: byId('playerWarning'),
    playerWarningText: byId('playerWarningText'), descriptionBox: byId('descriptionBox'),
    playerDescription: byId('playerDescription'), playerTags: byId('playerTags'),
    playerActions: $('.player-actions'), selectActionHint: byId('selectActionHint'),
    movePage: byId('movePage'), moveBack: byId('moveBack'), moveEyebrow: byId('moveEyebrow'),
    moveConfirm: byId('moveConfirm'), driveList: byId('driveList'), shortcutList: byId('shortcutList'),
    breadcrumbs: byId('breadcrumbs'), folderUp: byId('folderUp'), folderRefresh: byId('folderRefresh'),
    folderList: byId('folderList'), folderEmpty: byId('folderEmpty'), folderLoading: byId('folderLoading'),
    targetPath: byId('targetPath'), onlyFileCheck: byId('onlyFileCheck'), onlyFileNote: byId('onlyFileNote'),
    deleteSourceCheck: byId('deleteSourceCheck'), renameCheck: byId('renameCheck'),
    dialogLayer: byId('dialogLayer'), dialogCard: $('.dialog-card'), dialogIcon: byId('dialogIcon'),
    dialogEyebrow: byId('dialogEyebrow'), dialogTitle: byId('dialogTitle'), dialogText: byId('dialogText'),
    dialogWarning: byId('dialogWarning'), dialogWarningText: byId('dialogWarningText'),
    dialogDetail: byId('dialogDetail'), dialogStageTwo: byId('dialogStageTwo'),
    dialogCancel: byId('dialogCancel'), dialogConfirm: byId('dialogConfirm'), dialogSecondary: byId('dialogSecondary'),
    loadingCover: byId('loadingCover'), loadingText: byId('loadingText'),
    compareLayer: byId('compareLayer'), compareSource: byId('compareSource'), compareTarget: byId('compareTarget'),
    compareProgress: byId('compareProgress'), compareEyebrow: byId('compareEyebrow'),
    compareClose: byId('compareClose'), compareCancel: byId('compareCancel'),
    compareDelete: byId('compareDelete'), compareOverwrite: byId('compareOverwrite'), compareSkip: byId('compareSkip'),
  };

  const state = {
    items: [], itemMap: new Map(), counts: {}, sources: [], filter: 'all', query: '',
    sort: localStorage.getItem('luma.sort') || 'new',
    themeMode: localStorage.getItem('luma.theme') || 'system',
    selected: new Set(), loop: readBool('luma.loop', true),
    volume: Number(localStorage.getItem('luma.volume') || 0.8),
    muted: readBool('luma.muted', false),
    onlyFile: readBool('luma.onlyFile', false),
    renameOnMove: true,
    deleteSourceOnMove: true,
    lastDest: localStorage.getItem('luma.lastDest') || '',
    libraryLoaded: false, scanning: false, loadError: null, scannedAt: 0,
    currentId: null, playerItem: null, playerPushed: false, seeking: false,
    inlineCard: null, inlineItem: null, inlineScrollY: 0, galleryScrollY: 0, playerScrollY: 0,
    pathHistory: (readJSON('luma.pathHistory', []) || []).filter((p) => typeof p === 'string' && p.trim()),
    settings: { activeRoot: '', browserPath: '', browserParent: null, loading: false, historyOpen: false },
    hoverCard: null, hoverTimer: 0,
    videoDurationCache: readJSON('luma.durations', {}),
    metaQueue: [], metaQueued: new Set(), metaRunning: 0,
    pageSize: 30, page: 1, pageItems: [],
    suppressClickUntil: 0,
    move: { ids: [], path: '', data: null, loading: false },
    compare: null,
    dialog: null, lastFocus: null,
  };
  if (!['new', 'old', 'created-new', 'created-old', 'size-desc', 'size-asc', 'title', 'folder', 'file'].includes(state.sort)) state.sort = 'new';
  if (!Number.isFinite(state.volume)) state.volume = 0.8;
  state.volume = clamp(state.volume, 0, 1);
  const storedPageSize = Number(localStorage.getItem('luma.pageSize'));
  state.pageSize = [10, 20, 30, 50, 100].includes(storedPageSize) ? storedPageSize : 30;

  // Off-screen hover preview. It is the only extra decoder besides the player.
  const hoverVideo = document.createElement('video');
  hoverVideo.className = 'hover-video';
  hoverVideo.muted = true;
  hoverVideo.loop = state.loop;
  hoverVideo.playsInline = true;
  hoverVideo.preload = 'auto';

  let cardObserver = null;
  let hoverObserver = null;
  let imageObserver = null;
  let playerObserver = null;
  let durationSaveTimer = 0;
  let hoverTrackTimer = 0;
  let hoverRevealHandle = 0;
  let hoverRevealIsVideoFrame = false;
  let hoverWatchTimer = 0;
  let playerTrackTimer = 0;
  let inlineTrackTimer = 0;
  let searchTimer = 0;
  let themeSwitchTimer = 0;
  const themeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let lastScrollY = 0;
  let toolbarScrollRaf = 0;
  const META_CONCURRENCY = 2;
  const MIN_CARD_WIDTH = 320;
  const MAX_CARD_WIDTH_RATIO = 0.82;
  const MAX_CARD_WIDTH = 980;

  function fmtBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = n / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unit]}`;
  }
  function fmtDuration(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return '—';
    const total = Math.round(s);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  }
  function fmtDate(ms, withTime = false) {
    if (!ms) return '—';
    try { return (withTime ? dateTimeFmt : dateFmt).format(new Date(ms)); } catch { return '—'; }
  }
  function typeClass(type) { return `type-${type}`; }
  function riskFor(item) {
    if (item.broken) return item.reason || '此视频无法在浏览器中解码。';
    if (!item.playable) return item.reason || '此壁纸无法在浏览器中直接打开。';
    if (item.type === 'video' && RISKY_VIDEO_EXT.has(item.mediaExt)) {
      return `浏览器对 ${item.mediaExt.toUpperCase()} 的支持有限；如果无法解码会给出提示。`;
    }
    return '';
  }
  function errorMessage(video) {
    const code = video && video.error ? video.error.code : 0;
    if (code === 4) return '浏览器不支持该视频的封装或编码（常见于 HEVC、AV1、MKV）。文件本身可能完好，建议用系统播放器或 Wallpaper Engine 打开。';
    if (code === 3) return '视频数据无法解码，文件可能损坏，或使用了当前浏览器不支持的编码。';
    if (code === 2) return '媒体读取失败，文件可能正被其他程序占用，或数据流已中断。';
    return '浏览器无法播放该视频，可能是解码器不支持此格式。';
  }
  function resolvedTheme() {
    if (state.themeMode === 'light') return 'light';
    if (state.themeMode === 'dark') return 'dark';
    return themeMedia && themeMedia.matches ? 'dark' : 'light';
  }

  function updateThemeUI() {
    const dark = resolvedTheme() === 'dark';
    if (els.themeToggle) {
      els.themeToggle.innerHTML = icon(dark ? 'sun' : 'moon');
      els.themeToggle.title = dark ? '切换到白天' : '切换到黑夜';
      els.themeToggle.setAttribute('aria-label', els.themeToggle.title);
    }
    for (const button of $$('.theme-segment-btn')) {
      button.classList.toggle('active', button.dataset.themeMode === state.themeMode);
      button.setAttribute('aria-pressed', button.dataset.themeMode === state.themeMode ? 'true' : 'false');
    }
  }

  function applyTheme(mode, options = {}) {
    const next = ['light', 'dark', 'system'].includes(mode) ? mode : 'system';
    state.themeMode = next;
    if (options.persist !== false) write('luma.theme', next);
    const resolved = resolvedTheme();
    const root = document.documentElement;
    if (options.animate !== false) {
      root.classList.add('theme-switching');
      clearTimeout(themeSwitchTimer);
      themeSwitchTimer = setTimeout(() => root.classList.remove('theme-switching'), 120);
    }
    root.dataset.theme = resolved;
    root.dataset.themeMode = next;
    root.style.colorScheme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === 'dark' ? '#08090d' : '#eef4fb';
    updateThemeUI();
  }

  function toggleQuickTheme() {
    applyTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
  }

  function setupTheme() {
    applyTheme(state.themeMode, { persist: false, animate: false });
    if (themeMedia) {
      const onChange = () => {
        if (state.themeMode === 'system') applyTheme('system', { persist: false });
      };
      if (themeMedia.addEventListener) themeMedia.addEventListener('change', onChange);
      else if (themeMedia.addListener) themeMedia.addListener(onChange);
    }
  }

  function toast(message, tone = 'info', timeout = 3800) {
    const box = document.createElement('div');
    box.className = `toast ${tone}`;
    box.innerHTML = `${icon(tone === 'error' ? 'alert' : tone === 'warn' ? 'alert' : 'check')}<span></span>`;
    $('span', box).textContent = message;
    els.toasts.appendChild(box);
    setTimeout(() => {
      box.classList.add('out');
      setTimeout(() => box.remove(), 260);
    }, timeout);
  }
  async function api(url, options = {}) {
    const init = { cache: 'no-store', ...options };
    if (options.body && typeof options.body !== 'string') {
      init.body = JSON.stringify(options.body);
      init.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    }
    const response = await fetch(url, init);
    let data = null;
    try { data = await response.json(); } catch { /* empty body */ }
    if (!response.ok) throw new Error((data && data.error) || `请求失败（HTTP ${response.status}）`);
    return data;
  }

  // ---------------------------------------------------------------- library
  async function loadLibrary(refresh = false) {
    if (state.scanning) return;
    state.scanning = true;
    els.rescanBtn.disabled = true;
    els.rescanBtn.classList.add('rescanning');
    if (!state.libraryLoaded) els.skeleton.hidden = false;
    try {
      const data = await api(`/api/library${refresh ? '?refresh=1' : ''}`);
      const items = Array.isArray(data.items) ? data.items : [];
      state.items = items;
      state.itemMap = new Map(items.map((item) => [item.id, item]));
      state.counts = data.counts || {};
      state.sources = data.sources || [];
      rememberAutoSourcePaths(state.sources);
      state.scannedAt = data.scannedAt || Date.now();
      state.loadError = null;
      state.libraryLoaded = true;
      state.page = 1;
      state.pageItems = [];
      state.selected.clear();
      let cacheRepaired = false;
      for (const item of items) {
        const cached = state.videoDurationCache[item.id];
        if (cached && cached.size === item.size && cached.d > 0) {
          item.duration = cached.d;
          if (Number(cached.w) > 0) {
            item.width = cached.w;
            item.height = cached.h || null;
          } else if (Number(item.mediaWidth) > 0 && Number(item.mediaHeight) > 0) {
            // Older cache entries stored w:0 from a metadata-only probe. The
            // server already parsed the real dimensions, so repair the cache and
            // never let metadata alone hide a video that can play with hardware.
            item.width = item.mediaWidth;
            item.height = item.mediaHeight;
            cached.w = item.mediaWidth;
            cached.h = item.mediaHeight;
            cacheRepaired = true;
          }
          // Never mark a video broken from cached metadata alone. Some browsers
          // report videoWidth 0 until playback actually starts, and codec support
          // can depend on hardware/extension availability. Actual playback decides.
        }
      }
      if (cacheRepaired) scheduleDurationSave();
      const validIds = new Set(items.map((item) => item.id));
      state.selected = new Set([...state.selected].filter((id) => validIds.has(id)));
      els.skeleton.hidden = true;
      updateSourceLine();
      render();
      if (data.errors && data.errors.length) {
        toast(`有 ${data.errors.length} 个文件夹无法读取，已跳过。`, 'warn');
      }
      if (location.hash.startsWith('#/play/')) route();
      if (state.playerItem && !state.itemMap.has(state.playerItem.id)) forceClosePlayer();
    } catch (err) {
      state.loadError = err.message || String(err);
      els.skeleton.hidden = true;
      showEmpty('无法读取壁纸库', `${state.loadError}\n请确认本地服务正在运行，然后重新扫描。`, true);
      toast(state.loadError, 'error', 6000);
    } finally {
      state.scanning = false;
      els.rescanBtn.disabled = false;
      els.rescanBtn.classList.remove('rescanning');
    }
  }

  function updateSourceLine() {
    if (!state.sources.length) {
      els.sourceLine.textContent = '未找到 Wallpaper Engine 壁纸库';
      return;
    }
    const parts = state.sources.filter((s) => s.count > 0).map((s) => `${s.label} ${s.count}`);
    els.sourceLine.textContent = `${state.items.length} 个壁纸 · ${parts.join(' · ')}`;
    els.sourceLine.title = state.sources.map((s) => `${s.label}: ${s.root}`).join('\n');
  }

  function showEmpty(title, text, showRescan, showHint = showRescan) {
    els.gallery.innerHTML = '';
    els.emptyState.hidden = false;
    els.emptyTitle.textContent = title;
    els.emptyText.textContent = text;
    els.emptyHint.hidden = !showHint;
    els.emptyRescan.hidden = !showRescan;
  }

  function countsForFilter() {
    const c = state.counts || {};
    return {
      all: state.items.length,
      video: c.video || 0,
      scene: c.scene || 0,
      web: c.web || 0,
      application: c.application || 0,
      other: (c.other || 0) + (c.image || 0),
    };
  }

  function updateFilterTabs() {
    const counts = countsForFilter();
    els.filterTabs.innerHTML = FILTERS.map(([key, label]) => `
      <button class="filter-tab ${state.filter === key ? 'active' : ''}" type="button" role="tab"
        aria-selected="${state.filter === key}" data-filter="${key}">
        ${label}<b>${counts[key] || 0}</b>
      </button>`).join('');
  }

  function sortItems(items) {
    const list = items.slice();
    const byTitle = (a, b) => collator.compare(a.title, b.title);
    if (state.sort === 'new') list.sort((a, b) => b.downloadedAt - a.downloadedAt || byTitle(a, b));
    else if (state.sort === 'old') list.sort((a, b) => a.downloadedAt - b.downloadedAt || byTitle(a, b));
    else if (state.sort === 'created-new') list.sort((a, b) => b.createdAt - a.createdAt || byTitle(a, b));
    else if (state.sort === 'created-old') list.sort((a, b) => a.createdAt - b.createdAt || byTitle(a, b));
    else if (state.sort === 'size-desc') list.sort((a, b) => b.size - a.size || byTitle(a, b));
    else if (state.sort === 'size-asc') list.sort((a, b) => a.size - b.size || byTitle(a, b));
    else if (state.sort === 'title') list.sort(byTitle);
    else if (state.sort === 'folder') {
      list.sort((a, b) => {
        const na = Number(a.folderId); const nb = Number(b.folderId);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
        return collator.compare(a.folderId, b.folderId);
      });
    } else if (state.sort === 'file') {
      list.sort((a, b) => collator.compare(a.mainFile || a.folderName, b.mainFile || b.folderName) || byTitle(a, b));
    }
    return list;
  }

  function visibleItems() {
    const query = state.query.trim().toLocaleLowerCase();
    const filtered = state.items.filter((item) => {
      if (query && !item.title.toLocaleLowerCase().includes(query)) return false;
      if (state.filter === 'all') return true;
      if (state.filter === 'other') return item.type === 'other' || item.type === 'image';
      return item.type === state.filter;
    });
    return sortItems(filtered);
  }

  function layoutMetrics() {
    const gap = 20;
    const style = getComputedStyle(els.main);
    const contentWidth = Math.max(1, els.main.clientWidth
      - (parseFloat(style.paddingLeft) || 0)
      - (parseFloat(style.paddingRight) || 0));
    const columns = clamp(Math.floor((contentWidth + gap) / (MIN_CARD_WIDTH + gap)), 1, 3);
    const maxCardWidth = clamp(Math.round(window.innerHeight * MAX_CARD_WIDTH_RATIO), 460, MAX_CARD_WIDTH);
    const galleryWidth = Math.min(contentWidth, columns * maxCardWidth + gap * (columns - 1));
    return { gap, columns, contentWidth, maxCardWidth, galleryWidth };
  }

  function applyGalleryBounds(layout = layoutMetrics()) {
    const maxWidth = `${Math.round(layout.galleryWidth)}px`;
    els.gallery.style.maxWidth = maxWidth;
    els.gallery.style.marginInline = 'auto';
    if (els.skeleton) els.skeleton.style.maxWidth = maxWidth;
  }

  function cardHTML(item) {
    const warning = riskFor(item);
    const selected = state.selected.has(item.id);
    const isVideo = item.type === 'video';
    const isImage = item.type === 'image';
    const duration = isVideo ? (item.broken ? '无法解码' : item.duration ? fmtDuration(item.duration) : '—') : '';
    const previewUrl = item.previewOk
      ? `/api/preview/${item.id}?v=${Math.round(item.previewMtime || 0)}`
      : '';
    const initialRatio = item.mediaWidth && item.mediaHeight
      ? clamp(item.mediaWidth / item.mediaHeight, 0.5, 2.2)
      : 1.6;
    const hintLabel = isVideo ? '点击播放' : isImage ? '查看大图' : '查看详情';
    const hintIcon = isVideo ? 'play' : isImage ? 'image' : 'info';
    const externalOpen = isVideo || isImage;
    const openAction = externalOpen ? 'external' : 'open';
    const openLabel = isVideo ? '系统播放' : isImage ? '系统打开' : '打开';
    const openIcon = isVideo ? 'play' : isImage ? 'image' : 'info';
    return `
      <article class="card ${typeClass(item.type)} ${selected ? 'selected' : ''} ${item.broken ? 'is-broken' : ''}"
        data-id="${item.id}" data-type="${item.type}" data-playable="${item.playable ? 1 : 0}"
        tabindex="0" aria-label="${esc(item.title)}，${esc(item.typeLabel)}" aria-selected="${selected}">
        <div class="card-media" data-has-preview="${previewUrl ? 1 : 0}" style="aspect-ratio:${initialRatio}">
          <div class="card-fallback">${icon(TYPE_ICON[item.type] || 'box')}<span>${esc(item.typeLabel)}</span></div>
          ${previewUrl ? `<img class="card-img" src="${previewUrl}" alt="${esc(item.title)}" loading="lazy" decoding="async">` : ''}
          <span class="type-pill">${esc(item.typeLabel)}</span>
          <span class="card-warn-icon">${icon('alert')}</span>
          <div class="card-play-hint"><span>${icon(hintIcon)}</span>${hintLabel}</div>
          ${warning ? `<div class="card-hover-note">${icon('alert')}<span data-warning-text>${esc(warning)}</span></div>` : ''}
        </div>
        <div class="card-body">
          <h3 class="card-title" data-i18n-skip title="${esc(item.title)}">${esc(item.title)}</h3>
          <div class="card-meta">
            <span title="${esc(item.sizeLabel)}">${fmtBytes(item.size)}</span>
            ${isVideo ? `<span class="dot"></span><span data-meta-duration="${item.id}">${duration}</span>` : ''}
          </div>
          <div class="card-dates">
            <span title="创建时间：${fmtDate(item.createdAt, true)}">创建 ${fmtDate(item.createdAt)}</span>
            <span class="dot"></span>
            <span title="下载时间（当前下载时间排序依据）：${fmtDate(item.downloadedAt, true)}">下载 ${fmtDate(item.downloadedAt)}</span>
          </div>
          <div class="card-foot">
            <span class="file" data-i18n-skip title="${esc(item.mainFile || item.folderName)}">${esc(item.mainFile || item.folderName)}</span>
            <span class="fid">#${esc(item.folderId)}</span>
          </div>
          <div class="card-actions" role="group" aria-label="${esc(item.title)} 操作">
            <button class="card-action danger" type="button" data-act="delete" title="删除这个壁纸">${icon('trash')}<span>删除</span></button>
            <button class="card-action" type="button" data-act="${openAction}" title="${isVideo ? '用系统播放器打开源文件' : isImage ? '用系统图片查看器打开源文件' : '打开播放页'}">${icon(openIcon)}<span>${openLabel}</span></button>
            <button class="card-action" type="button" data-act="reveal" title="在资源管理器中打开文件夹">${icon('folder-open')}<span>目标文件夹</span></button>
            <button class="card-action" type="button" data-act="move" title="移动这个壁纸">${icon('move')}<span>移动</span></button>
            <button class="card-action ${selected ? 'selected' : ''}" type="button" data-act="select" aria-pressed="${selected}" title="${selected ? '取消选中' : '加入批量操作'}">${icon('select')}<span data-select-label>${selected ? '已选中' : '选中'}</span></button>
          </div>
        </div>
      </article>`;
  }

  function pageWindow(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const values = new Set([1, total, current, current - 1, current + 1]);
    if (current <= 3) { values.add(2); values.add(3); }
    if (current >= total - 2) { values.add(total - 1); values.add(total - 2); }
    const pages = [...values].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    let previous = 0;
    for (const page of pages) {
      if (previous && page - previous > 1) out.push('…');
      out.push(page);
      previous = page;
    }
    return out;
  }

  function renderPagination(totalPages) {
    const multiple = totalPages > 1;
    els.pagination.hidden = !multiple;
    els.pageJumpInput.max = String(totalPages);
    els.pageJumpInput.value = String(state.page);
    if (!multiple) {
      els.pageNumbers.innerHTML = '';
      els.pageStatus.textContent = '';
      return;
    }
    els.pagePrev.disabled = state.page <= 1;
    els.pageNext.disabled = state.page >= totalPages;
    els.pageStatus.textContent = `第 ${state.page} / ${totalPages} 页`;
    els.pageNumbers.innerHTML = pageWindow(state.page, totalPages).map((page) => (
      page === '…'
        ? '<span class="page-ellipsis" aria-hidden="true">…</span>'
        : `<button class="page-number ${page === state.page ? 'active' : ''}" type="button"
            data-page="${page}" ${page === state.page ? 'aria-current="page"' : ''}>${page}</button>`
    )).join('');
  }

  function jumpToTypedPage() {
    const totalPages = Math.max(1, Math.ceil(visibleItems().length / state.pageSize));
    const raw = els.pageJumpInput.value.trim();
    if (!raw) {
      els.pageJumpInput.value = String(state.page);
      return;
    }
    const requested = Math.trunc(Number(raw));
    if (!Number.isFinite(requested)) {
      els.pageJumpInput.value = String(state.page);
      return;
    }
    const target = clamp(requested, 1, totalPages);
    // GitHub发布页 github.com/xdedmmc2/Wallpaper-Engine-player
    els.pageJumpInput.value = String(target);
    goToPage(target);
  }

  function goToPage(page) {
    const totalPages = Math.max(1, Math.ceil(visibleItems().length / state.pageSize));
    const next = clamp(Number(page) || 1, 1, totalPages);
    if (next === state.page) return;
    state.page = next;
    state.selected.clear();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetPagination() {
    state.page = 1;
    state.selected.clear();
  }

  function render() {
    stopHover();
    stopInline();
    const all = visibleItems();
    const totalPages = Math.max(1, Math.ceil(all.length / state.pageSize));
    state.page = clamp(state.page, 1, totalPages);
    const start = (state.page - 1) * state.pageSize;
    const list = all.slice(start, start + state.pageSize);
    state.pageItems = list;
    updateFilterTabs();
    if (!all.length) {
      state.page = 1;
      state.pageItems = [];
      state.selected.clear();
      if (state.query.trim()) {
        showEmpty('没有匹配的壁纸', `没有找到标题包含“${state.query.trim()}”的壁纸。搜索只匹配壁纸名，不匹配文件夹名。`, false);
      } else if (state.items.length) {
        showEmpty('这个筛选下还没有壁纸', '换一个分类，或点击“全部”查看所有壁纸。', false);
      } else {
        showEmpty(
          state.loadError ? '无法读取壁纸库' : '还没有发现壁纸',
          state.loadError || '没有找到 Wallpaper Engine 的创意工坊目录或“我的项目”目录。确认安装后点击下方按钮重新扫描。',
          true,
        );
      }
      els.pagination.hidden = true;
      els.resultCount.textContent = state.items.length ? `0 / ${state.items.length}` : '0 个壁纸';
      els.footerStats.textContent = '';
      updateSelectionUI();
      return;
    }
    els.emptyState.hidden = true;
    const layout = layoutMetrics();
    applyGalleryBounds(layout);
    const count = layout.columns;
    const columns = Array.from({ length: count }, () => []);
    const estimatedHeights = new Array(count).fill(0);
    const galleryWidth = layout.galleryWidth;
    const gap = layout.gap;
    const columnWidth = Math.max(1, (galleryWidth - gap * (count - 1)) / count);
    for (const item of list) {
      const ratio = item.mediaWidth && item.mediaHeight
        ? clamp(item.mediaWidth / item.mediaHeight, 0.5, 2.2)
        : 1.6;
      const estimated = columnWidth / ratio + 180;
      let target = 0;
      for (let i = 1; i < count; i++) {
        if (estimatedHeights[i] < estimatedHeights[target] - 0.5) target = i;
      }
      columns[target].push(item);
      estimatedHeights[target] += estimated + gap;
    }
    els.gallery.innerHTML = columns
      .map((column) => `<div class="masonry-col">${column.map(cardHTML).join('')}</div>`)
      .join('');
    els.gallery.dataset.columns = String(count);
    els.resultCount.textContent = `${start + 1}–${Math.min(start + state.pageSize, all.length)} / ${all.length}`;
    renderPagination(totalPages);
    const totalBytes = state.items.reduce((sum, item) => sum + (item.folderSize || item.size || 0), 0);
    const lastScan = state.scannedAt ? new Date(state.scannedAt) : null;
    els.footerStats.textContent = `总占用 ${fmtBytes(totalBytes)}${lastScan ? ` · 扫描于 ${dateTimeFmt.format(lastScan)}` : ''}`;
    bindCardImages();
    observeCards();
    updateSelectionUI();
  }

  function bindCardImages() {
    $$('.card', els.gallery).forEach((card) => {
      const item = state.itemMap.get(card.dataset.id);
      const img = $('.card-img', card);
      if (!item || !img) return;
      const loaded = () => {
        img.classList.add('loaded');
      };
      if (img.complete && img.naturalWidth) loaded();
      else {
        img.addEventListener('load', loaded, { once: true });
        img.addEventListener('error', () => {
          card.dataset.hasPreview = '0';
          img.remove();
        }, { once: true });
      }
    });
  }

  function observeCards() {
    if (cardObserver) cardObserver.disconnect();
    if (hoverObserver) hoverObserver.disconnect();
    if (!cardObserver) {
      if ('IntersectionObserver' in window) {
        cardObserver = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const card = entry.target;
            const item = state.itemMap.get(card.dataset.id);
            if (!item) continue;
            if (entry.isIntersecting) enqueueMeta(item);
          }
        }, { rootMargin: '340px 0px', threshold: 0.01 });
        hoverObserver = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              if (state.hoverCard === entry.target) stopHover();
              if (state.inlineCard === entry.target && !els.inlineVideo.paused) {
                try { els.inlineVideo.pause(); } catch { /* ignore */ }
              }
            }
          }
        }, { threshold: 0 });
      }
    }
    if (cardObserver) {
      $$('.card', els.gallery).forEach((card) => {
        cardObserver.observe(card);
        if (hoverObserver) hoverObserver.observe(card);
      });
    } else {
      visibleItems().slice(0, 30).forEach((item) => enqueueMeta(item));
    }
  }

  // ---------------------------------------------------------------- metadata
  function scheduleDurationSave() {
    clearTimeout(durationSaveTimer);
    durationSaveTimer = setTimeout(() => {
      const ids = new Set(state.items.map((item) => item.id));
      for (const key of Object.keys(state.videoDurationCache)) {
        if (!ids.has(key)) delete state.videoDurationCache[key];
      }
      writeJSON('luma.durations', state.videoDurationCache);
    }, 700);
  }

  function rememberDuration(item, duration, width, height) {
    const knownWidth = Number(width) > 0 ? width : (Number(item.mediaWidth) > 0 ? item.mediaWidth : 0);
    const knownHeight = Number(height) > 0 ? height : (Number(item.mediaHeight) > 0 ? item.mediaHeight : 0);
    item.duration = duration;
    item.width = knownWidth || item.width || null;
    item.height = knownHeight || item.height || null;
    state.videoDurationCache[item.id] = {
      size: item.size,
      d: duration,
      w: knownWidth,
      h: knownHeight,
    };
    updateCardDuration(item);
    if (state.currentId === item.id) refreshPlayerMeta();
    scheduleDurationSave();
  }

  function updateCardDuration(item) {
    const el = $(`[data-meta-duration="${item.id}"]`);
    if (!el) return;
    el.textContent = item.broken ? '无法解码' : item.duration ? fmtDuration(item.duration) : '—';
    if (item.broken) el.style.color = 'var(--danger)';
  }

  function enqueueMeta(item) {
    if (!item || item.type !== 'video' || item.duration || item.broken || state.metaQueued.has(item.id)) return;
    state.metaQueued.add(item.id);
    state.metaQueue.push(item);
    pumpMetaQueue();
  }

  async function pumpMetaQueue() {
    while (state.metaQueue.length && state.metaRunning < META_CONCURRENCY) {
      // Do not compete with the player or the conflict comparison for decode/GPU.
      if (playerIsOpen() || !els.compareLayer.hidden || settingsIsOpen()) return;
      const item = state.metaQueue.shift();
      state.metaQueued.delete(item.id);
      if (!item || item.duration || item.broken || !state.itemMap.has(item.id)) continue;
      state.metaRunning++;
      probeMedia(item).then((result) => {
        if (!result) return;
        if (Number.isFinite(result.duration) && result.duration > 0) {
          rememberDuration(item, result.duration, result.width, result.height);
        }
        // Do not call markBroken here. A metadata-only probe can see videoWidth 0
        // for videos that still play, especially when hardware decoding starts late.
        // The player page performs the real check while the video is playing.
      }).finally(() => {
        state.metaRunning--;
        pumpMetaQueue();
      });
    }
  }

  function probeMedia(item) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.style.cssText = 'position:fixed;left:-20px;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none;';
      document.body.appendChild(video);
      let settled = false;
      let timer = 0;
      let decodeTimer = 0;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(decodeTimer);
        video.onloadedmetadata = null;
        video.onerror = null;
        try { video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
        video.remove();
        resolve(value);
      };
      video.onloadedmetadata = () => {
        const d = video.duration;
        if (!Number.isFinite(d) || d <= 0) {
          finish({ ok: false });
          return;
        }
        const settle = () => {
          if (video.videoWidth > 0) {
            finish({ ok: true, duration: d, width: video.videoWidth, height: video.videoHeight });
          } else {
            finish({ ok: false, decodeError: true, duration: d, message: DECODE_MESSAGE });
          }
        };
        if (video.videoWidth > 0) settle();
        else decodeTimer = setTimeout(settle, 1000);
      };
      video.onerror = () => {
        const code = video.error ? video.error.code : 0;
        finish({
          ok: false,
          decodeError: code === 3 || code === 4,
          message: errorMessage(video),
        });
      };
      timer = setTimeout(() => finish({ ok: false }), 15000);
      video.src = `/api/media/${item.id}`;
      video.load();
    });
  }

  function markBroken(item, message) {
    if (!item) return;
    item.broken = true;
    item.playable = false;
    item.reason = message;
    const card = $(`.card[data-id="${item.id}"]`);
    if (card) {
      card.classList.add('is-broken');
      const media = $('.card-media', card);
      let note = $('.card-hover-note', card);
      if (!note && media) {
        note = document.createElement('div');
        note.className = 'card-hover-note';
        media.appendChild(note);
      }
      if (note) note.innerHTML = `${icon('alert')}<span data-warning-text></span>`;
      const text = note && $('[data-warning-text]', note);
      if (text) text.textContent = message;
      const dur = $(`[data-meta-duration="${item.id}"]`);
      if (dur) { dur.textContent = '无法解码'; dur.style.color = 'var(--danger)'; }
    }
    if (state.hoverCard === card) stopHover();
  }

  function clearBroken(item) {
    if (!item) return;
    item.broken = false;
    item.playable = true;
    item.reason = '';
    const card = $(`.card[data-id="${item.id}"]`);
    if (card) {
      card.classList.remove('is-broken');
      const note = $('.card-hover-note', card);
      if (note) note.remove();
    }
    updateCardDuration(item);
  }

  // ---------------------------------------------------------------- hover preview
  function onGalleryPointerOver(event) {
    if (event.pointerType === 'touch' || document.body.classList.contains('selecting')) return;
    if (state.inlineCard) return;
    const card = event.target.closest('.card');
    if (!card) return;
    if (event.relatedTarget && card.contains(event.relatedTarget)) return;
    const item = state.itemMap.get(card.dataset.id);
    if (!item || item.type !== 'video' || item.broken) return;
    clearTimeout(state.hoverTimer);
    state.hoverTimer = setTimeout(() => startHover(card, item), 260);
  }

  function onGalleryPointerOut(event) {
    const card = event.target.closest('.card');
    if (!card) return;
    if (event.relatedTarget && card.contains(event.relatedTarget)) return;
    if (state.hoverCard === card) {
      clearTimeout(state.hoverTimer);
      stopHover();
    } else {
      clearTimeout(state.hoverTimer);
    }
  }

  function startHover(card, item) {
    if (state.inlineCard) return;
    if (!item || item.type !== 'video' || item.broken || !state.itemMap.has(item.id)) return;
    if (state.hoverCard === card) return;
    stopHover();
    state.hoverCard = card;
    pauseAllVideos(hoverVideo);
    const media = $('.card-media', card);
    if (!media) return;
    hoverVideo.loop = state.loop;
    hoverVideo.dataset.cardId = item.id;
    hoverVideo.src = `/api/media/${item.id}`;
    media.appendChild(hoverVideo);
    hoverVideo.play().catch(() => { /* autoplay may be blocked, leave the cover visible */ });
    clearTimeout(hoverWatchTimer);
    hoverWatchTimer = setTimeout(() => {
      if (!state.hoverCard || state.hoverCard.classList.contains('previewing')) return;
      stopHover();
    }, 1400);
  }

  function stopHover() {
    clearTimeout(state.hoverTimer);
    clearTimeout(hoverTrackTimer);
    clearTimeout(hoverWatchTimer);
    if (hoverRevealHandle) {
      if (hoverRevealIsVideoFrame && typeof hoverVideo.cancelVideoFrameCallback === 'function') {
        hoverVideo.cancelVideoFrameCallback(hoverRevealHandle);
      } else {
        cancelAnimationFrame(hoverRevealHandle);
      }
      hoverRevealHandle = 0;
    }
    if (!hoverVideo.paused) hoverVideo.pause();
    hoverVideo.dataset.cardId = '';
    hoverVideo.removeAttribute('src');
    try { hoverVideo.load(); } catch { /* ignore */ }
    hoverVideo.remove();
    if (state.hoverCard) state.hoverCard.classList.remove('previewing');
    state.hoverCard = null;
  }

  hoverVideo.addEventListener('playing', () => {
    if (!state.hoverCard) return;
    if (hoverVideo.dataset.cardId !== state.hoverCard.dataset.id) return;
    if (state.hoverCard.classList.contains('previewing')) return;
    if (hoverRevealHandle) return;
    const reveal = () => {
      hoverRevealHandle = 0;
      if (!state.hoverCard || hoverVideo.dataset.cardId !== state.hoverCard.dataset.id) return;
      clearTimeout(hoverWatchTimer);
      state.hoverCard.classList.add('previewing');
      clearTimeout(hoverTrackTimer);
      hoverTrackTimer = setTimeout(() => {
        if (!state.hoverCard || hoverVideo.dataset.cardId !== state.hoverCard.dataset.id) return;
        if (hoverVideo.videoWidth === 0) {
          // Hover preview is not authoritative; the player page will try real playback.
          stopHover();
        }
      }, 700);
    };
    // Wait for the first decoded frame so the still cover never fades to black.
    if (typeof hoverVideo.requestVideoFrameCallback === 'function') {
      hoverRevealIsVideoFrame = true;
      hoverRevealHandle = hoverVideo.requestVideoFrameCallback(reveal);
    } else {
      hoverRevealIsVideoFrame = false;
      hoverRevealHandle = requestAnimationFrame(() => {
        hoverRevealHandle = requestAnimationFrame(reveal);
      });
    }
  });
  hoverVideo.addEventListener('error', () => {
    if (!state.hoverCard) return;
    // A failed muted hover preview must not poison the card permanently.
    stopHover();
  });
  hoverVideo.addEventListener('ended', () => {
    if (!state.loop) setTimeout(() => { if (!hoverVideo.loop) stopHover(); }, 700);
  });

  function pauseAllVideos(except) {
    for (const video of [hoverVideo, els.playerVideo, els.inlineVideo]) {
      if (video !== except && !video.paused) {
        try { video.pause(); } catch { /* ignore */ }
      }
    }
  }

  // ---------------------------------------------------------------- inline player
  function updateInlineTime() {
    const video = els.inlineVideo;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    els.inlineTime.textContent = `${fmtDuration(current)} / ${duration ? fmtDuration(duration) : '0:00'}`;
    const percent = duration ? clamp((current / duration) * 100, 0, 100) : 0;
    els.inlineSeek.value = String(Math.round(percent * 10));
    els.inlineSeek.style.setProperty('--p', `${percent}%`);
  }

  function updateInlineButtons() {
    const video = els.inlineVideo;
    const playing = !video.paused;
    els.inlinePlay.innerHTML = icon(playing ? 'pause' : 'play');
    els.inlinePlay.setAttribute('aria-label', playing ? '暂停' : '播放');
    const muted = video.muted || state.volume === 0;
    els.inlineMute.innerHTML = icon(muted ? 'volume-x' : 'volume');
    els.inlineMute.setAttribute('aria-label', muted ? '取消静音' : '静音');
    els.inlineFullscreen.innerHTML = icon('maximize');
    els.inlineFullscreen.setAttribute('aria-label', '打开全屏播放页');
    els.inlineFullscreen.title = '打开全屏播放页';
  }

  function showInlineError(message) {
    const item = state.inlineItem;
    if (item) {
      item.broken = true;
      item.playable = false;
      item.reason = message;
      markBroken(item, message);
    }
    try { els.inlineVideo.pause(); } catch { /* ignore */ }
    els.inlineVideo.hidden = true;
    els.inlineControls.hidden = true;
    els.inlineError.hidden = false;
    els.inlineErrorText.textContent = message;
  }

  function stopInline() {
    clearTimeout(inlineTrackTimer);
    const card = state.inlineCard;
    const video = els.inlineVideo;
    try { video.pause(); } catch { /* ignore */ }
    video.removeAttribute('src');
    try { video.load(); } catch { /* ignore */ }
    state.inlineCard = null;
    state.inlineItem = null;
    els.inlinePlayer.hidden = true;
    els.inlineError.hidden = true;
    els.inlineVideo.hidden = false;
    els.inlineControls.hidden = false;
    if (card) card.classList.remove('inline-active');
    if (els.inlinePlayer.parentElement !== document.body) document.body.appendChild(els.inlinePlayer);
    if (document.fullscreenElement === els.inlinePlayer) document.exitFullscreen().catch(() => {});
  }

  function activateInline(item, card) {
    if (!item || item.type !== 'video' || !card) return;
    if (state.inlineCard === card) return;
    stopHover();
    stopInline();
    pauseAllVideos(els.inlineVideo);
    const media = $('.card-media', card);
    if (!media) return;
    state.inlineCard = card;
    state.inlineItem = item;
    state.inlineScrollY = window.scrollY;
    media.appendChild(els.inlinePlayer);
    els.inlinePlayer.hidden = false;
    card.classList.add('inline-active');
    els.inlineError.hidden = true;
    els.inlineErrorText.textContent = '';
    els.inlineVideo.hidden = false;
    els.inlineControls.hidden = false;
    els.inlineVideo.loop = state.loop;
    els.inlineVideo.volume = state.volume;
    els.inlineVideo.muted = state.muted;
    if (item.broken) {
      showInlineError(item.reason || DECODE_MESSAGE);
      return;
    }
    if (item.previewOk) els.inlineVideo.poster = `/api/preview/${item.id}?v=${Math.round(item.previewMtime || 0)}`;
    els.inlineVideo.src = `/api/media/${item.id}`;
    try { els.inlineVideo.load(); } catch { /* ignore */ }
    updateInlineTime();
    updateInlineButtons();
    els.inlineVideo.play().catch(() => { /* user can press play */ });
  }

  function toggleInlinePlay() {
    if (!state.inlineItem || state.inlineItem.broken) return;
    if (els.inlineVideo.paused) {
      els.inlineVideo.play().catch((err) => {
        if (err && err.name === 'NotAllowedError') return;
        showInlineError(errorMessage(els.inlineVideo));
      });
    } else {
      els.inlineVideo.pause();
    }
  }

  async function toggleInlineFullscreen() {
    try {
      if (document.fullscreenElement === els.inlinePlayer) {
        await document.exitFullscreen();
      } else {
        state.inlineScrollY = window.scrollY;
        await els.inlinePlayer.requestFullscreen();
      }
    } catch {
      toast('当前浏览器无法进入全屏。', 'warn');
    }
  }

  function setupInlinePlayer() {
    const video = els.inlineVideo;
    video.addEventListener('play', () => {
      pauseAllVideos(video);
      updateInlineButtons();
    });
    video.addEventListener('pause', updateInlineButtons);
    video.addEventListener('timeupdate', () => {
      updateInlineTime();
      if (video.currentTime > 0.4 && video.videoWidth === 0 && state.inlineItem) {
        showInlineError(DECODE_MESSAGE);
      }
    });
    video.addEventListener('loadedmetadata', () => {
      updateInlineTime();
      if (video.videoWidth === 0) {
        clearTimeout(inlineTrackTimer);
        inlineTrackTimer = setTimeout(() => {
          if (state.inlineItem && els.inlineVideo.videoWidth === 0) showInlineError(DECODE_MESSAGE);
        }, 700);
      }
    });
    video.addEventListener('playing', () => {
      updateInlineButtons();
      if (video.videoWidth === 0) {
        clearTimeout(inlineTrackTimer);
        inlineTrackTimer = setTimeout(() => {
          if (state.inlineItem && els.inlineVideo.videoWidth === 0) showInlineError(DECODE_MESSAGE);
        }, 700);
      }
    });
    video.addEventListener('error', () => {
      if (state.inlineItem) showInlineError(errorMessage(video));
    });
    video.addEventListener('ended', updateInlineButtons);
    video.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleInlinePlay();
    });
    els.inlinePlayer.addEventListener('click', (event) => event.stopPropagation());
    els.inlinePlayer.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.inlineSeek.addEventListener('input', () => {
      const duration = els.inlineVideo.duration;
      if (Number.isFinite(duration) && duration > 0) {
        els.inlineVideo.currentTime = (Number(els.inlineSeek.value) / 1000) * duration;
        updateInlineTime();
      }
    });
    els.inlinePlay.addEventListener('click', toggleInlinePlay);
    els.inlineMute.addEventListener('click', () => {
      state.muted = !els.inlineVideo.muted;
      els.inlineVideo.muted = state.muted;
      write('luma.muted', state.muted ? '1' : '0');
      updateInlineButtons();
    });
    els.inlineFullscreen.addEventListener('click', () => {
      const item = state.inlineItem;
      if (item) openPlayer(item.id);
    });
    els.inlineClose.addEventListener('click', stopInline);
    els.inlineErrorClose.addEventListener('click', stopInline);
    els.inlineRetry.addEventListener('click', retryInlineDecode);
    els.inlineSystem.addEventListener('click', () => {
      const item = state.inlineItem;
      if (!item) return;
      openMedia(item);
      stopInline();
    });
  }

  // ---------------------------------------------------------------- selection
  function applySelection(next) {
    const changed = next.size !== state.selected.size ||
      [...next].some((id) => !state.selected.has(id));
    state.selected = next;
    updateSelectionUI();
    if (!changed) return;
    $$('.card', els.gallery).forEach((card) => {
      const selected = next.has(card.dataset.id);
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-selected', String(selected));
      const selectAction = $('.card-action[data-act="select"]', card);
      if (selectAction) {
        selectAction.classList.toggle('selected', selected);
        selectAction.setAttribute('aria-pressed', String(selected));
        selectAction.title = selected ? '取消选中' : '加入批量操作';
        const label = $('[data-select-label]', selectAction);
        if (label) label.textContent = selected ? '已选中' : '选中';
      }
    });
  }

  function toggleSelection(id, force) {
    if (!state.itemMap.has(id)) return;
    const next = new Set(state.selected);
    const shouldSelect = force == null ? !next.has(id) : Boolean(force);
    if (shouldSelect) next.add(id); else next.delete(id);
    applySelection(next);
  }

  function updateSelectionUI() {
    const count = state.selected.size;
    els.selectionBar.hidden = count === 0;
    els.selectedCount.textContent = String(count);
    const inPlayer = state.currentId && state.selected.has(state.currentId);
    const action = $('[data-action="select"]', els.playerActions);
    if (action) {
      action.classList.toggle('selected', Boolean(inPlayer));
      els.selectActionHint.textContent = inPlayer ? '已选中，点击取消' : '加入批量操作';
    }
  }

  function dragRectData() {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    return $$('.card', els.gallery).map((card) => {
      const r = card.getBoundingClientRect();
      return {
        id: card.dataset.id,
        left: r.left + scrollX,
        right: r.right + scrollX,
        top: r.top + scrollY,
        bottom: r.bottom + scrollY,
      };
    });
  }

  let drag = null;

  function onGalleryPointerDown(event) {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    if (playerIsOpen() || !els.movePage.hidden || !els.dialogLayer.hidden) return;
    if (event.target.closest('button, a, input, select, textarea, label, .card, .topbar, .toolbar, .page-footer, .pagination, .batch-bar, .toasts, .route-page, .dialog-layer, .empty-state, .inline-player, .settings-layer, .marquee, .skeleton')) return;
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      active: false,
      base: event.shiftKey || event.ctrlKey ? new Set(state.selected) : new Set(),
      rects: dragRectData(),
    };
    document.addEventListener('pointermove', onDragMove, { passive: false });
    document.addEventListener('pointerup', onDragEnd, { once: true });
    document.addEventListener('pointercancel', onDragEnd, { once: true });
  }

  function onDragMove(event) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7) return;
      drag.active = true;
      document.body.classList.add('selecting');
      els.marquee.hidden = false;
      clearTimeout(state.hoverTimer);
      stopHover();
    }
    event.preventDefault();
    const left = Math.min(drag.startX, event.clientX);
    const top = Math.min(drag.startY, event.clientY);
    const width = Math.abs(event.clientX - drag.startX);
    const height = Math.abs(event.clientY - drag.startY);
    els.marquee.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;`;
    const pageLeft = left + window.scrollX;
    const pageRight = left + width + window.scrollX;
    const pageTop = top + window.scrollY;
    const pageBottom = top + height + window.scrollY;
    const hits = drag.rects.filter((r) =>
      r.right > pageLeft && r.left < pageRight && r.bottom > pageTop && r.top < pageBottom);
    const next = new Set(drag.base);
    for (const hit of hits) next.add(hit.id);
    applySelection(next);
    els.marquee.dataset.count = `${next.size} 项`;
  }

  function onDragEnd(event) {
    if (!drag) return;
    const active = drag.active;
    drag = null;
    document.removeEventListener('pointermove', onDragMove);
    document.body.classList.remove('selecting');
    els.marquee.hidden = true;
    els.marquee.dataset.count = '';
    if (active) {
      state.suppressClickUntil = Date.now() + 320;
      return;
    }
    // A plain click on blank page space clears the current selection. A real
    // drag keeps its box-selected cards; pointercancel must not clear anything.
    if (event && event.type === 'pointerup' && state.selected.size) {
      applySelection(new Set());
    }
  }

  // ---------------------------------------------------------------- player
  function playerIsOpen() { return !els.playerPage.hidden; }
  function syncBodyLock() {
    const playerOpen = playerIsOpen();
    const compareOpen = !els.compareLayer.hidden;
    const settingsOpen = settingsIsOpen();
    const dialogOpen = !els.dialogLayer.hidden;
    const moveOpen = !els.movePage.hidden;
    document.body.classList.toggle('modal-open', playerOpen || moveOpen || dialogOpen || compareOpen || settingsOpen);
    document.body.classList.toggle('player-open', playerOpen);
    document.body.classList.toggle('compare-open', compareOpen);
    document.body.classList.toggle('settings-open', settingsOpen);
    document.body.classList.toggle('dialog-open', dialogOpen);
    document.body.classList.toggle('move-open', moveOpen);
  }

  function route() {
    const match = location.hash.match(/^#\/play\/([a-f0-9]+)$/i);
    if (!match) {
      hidePlayerOnly();
      return;
    }
    const item = state.itemMap.get(match[1]);
    if (!item) {
      toast('这个壁纸已经不存在了，可能已被移动或删除。', 'warn');
      history.replaceState(null, '', location.pathname + location.search);
      hidePlayerOnly();
      return;
    }
    showPlayer(item);
  }

  function activateCard(card) {
    const item = card && state.itemMap.get(card.dataset.id);
    if (!item) return;
    if (item.type === 'video') activateInline(item, card);
    else openPlayer(item.id);
  }

  function openPlayer(id) {
    if (!state.itemMap.has(id)) return;
    state.galleryScrollY = window.scrollY;
    stopInline();
    const hash = `#/play/${id}`;
    if (location.hash === hash) {
      showPlayer(state.itemMap.get(id));
      return;
    }
    state.playerPushed = true;
    location.hash = hash;
  }

  function showPlayer(item) {
    stopHover();
    stopInline();
    clearTimeout(playerTrackTimer);
    pauseAllVideos(els.playerVideo);
    state.currentId = item.id;
    state.playerItem = item;
    els.playerPage.hidden = false;
    syncBodyLock();
    window.scrollTo({ top: 0 });
    els.playerPage.scrollTop = 0;

    els.playerTitle.textContent = item.title;
    els.playerTitle.title = item.title;
    els.playerEyebrow.textContent = `${item.sourceLabel} · 文件夹 #${item.folderId}`;
    els.playerType.className = `type-pill ${typeClass(item.type)}`;
    els.playerType.textContent = item.typeLabel;
    els.playerImage.hidden = true;
    els.playerImage.removeAttribute('src');
    els.playerImage.alt = '';
    els.playerVideo.pause();
    els.playerVideo.removeAttribute('src');
    try { els.playerVideo.load(); } catch { /* ignore */ }
    els.playerVideo.hidden = true;
    els.playerVideo.poster = '';
    els.playerUnsupported.hidden = true;
    els.playerError.hidden = true;
    els.stageSpinner.hidden = true;
    els.playerStage.className = 'player-stage';
    els.playerStage.classList.add('paused');
    els.bigPlay.hidden = false;
    document.title = `${item.title} · wallpaper播放器`;

    if (item.type === 'video' && !item.broken) {
      els.playerStage.classList.add('video-mode');
      els.playerVideo.hidden = false;
      if (item.previewOk) els.playerVideo.poster = `/api/preview/${item.id}?v=${Math.round(item.previewMtime || 0)}`;
      els.playerVideo.loop = state.loop;
      els.playerVideo.volume = state.volume;
      els.playerVideo.muted = state.muted;
      els.playerVideo.src = `/api/media/${item.id}`;
      try { els.playerVideo.load(); } catch { /* ignore */ }
      updateSeekUI();
      updateVolumeUI();
      updateLoopUI();
      els.playerVideo.play().catch(() => { /* user can press play */ });
    } else if (item.type === 'image' && item.playable) {
      els.playerStage.classList.add('is-image');
      els.playerImage.hidden = false;
      els.playerImage.alt = item.title;
      els.playerImage.src = `/api/media/${item.id}`;
      els.bigPlay.hidden = true;
      els.playerControls.classList.add('hidden');
    } else if (item.type === 'video') {
      if (item.previewOk) {
        els.playerImage.hidden = false;
        els.playerImage.alt = item.title;
        els.playerImage.src = `/api/preview/${item.id}?v=${Math.round(item.previewMtime || 0)}`;
      }
      els.playerError.hidden = false;
      els.playerErrorText.textContent = item.reason || '浏览器无法解码此视频。';
      els.bigPlay.hidden = true;
      els.playerControls.classList.add('hidden');
    } else {
      if (item.previewOk) {
        els.playerImage.hidden = false;
        els.playerImage.alt = item.title;
        els.playerImage.src = `/api/preview/${item.id}?v=${Math.round(item.previewMtime || 0)}`;
      }
      els.playerUnsupported.hidden = false;
      els.unsupportedTitle.textContent = item.type === 'video' ? '视频无法播放' : '无法在浏览器中直接打开';
      els.unsupportedText.textContent = item.reason || '此壁纸需要 Wallpaper Engine 才能运行。';
      els.bigPlay.hidden = true;
    }
    if (item.type === 'image' || item.type !== 'video' || item.broken) {
      els.playerControls.classList.add('hidden');
    } else {
      els.playerControls.classList.remove('hidden');
    }

    refreshPlayerMeta();
    refreshPlayerSideInfo(item);
    updateSelectionUI();
    if (playerObserver) playerObserver.disconnect();
    if ('IntersectionObserver' in window) {
      playerObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry || entry.isIntersecting) return;
        if (!els.playerVideo.paused) {
          els.playerVideo.pause();
        }
      }, { threshold: 0 });
      playerObserver.observe(els.playerStage);
    }
  }

  function hidePlayerOnly() {
    clearTimeout(playerTrackTimer);
    if (!playerIsOpen()) {
      state.currentId = null;
      state.playerItem = null;
      syncBodyLock();
      pumpMetaQueue();
      return;
    }
    try { els.playerVideo.pause(); } catch { /* ignore */ }
    els.playerVideo.removeAttribute('src');
    try { els.playerVideo.load(); } catch { /* ignore */ }
    els.playerVideo.hidden = true;
    els.playerImage.removeAttribute('src');
    els.playerImage.hidden = true;
    els.playerPage.hidden = true;
    els.playerStage.classList.remove('video-mode', 'is-image', 'playing');
    els.playerStage.classList.add('paused');
    els.playerUnsupported.hidden = true;
    els.playerError.hidden = true;
    els.stageSpinner.hidden = true;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { /* ignore */ });
    }
    state.currentId = null;
    state.playerItem = null;
    state.playerPushed = false;
    document.title = 'wallpaper播放器';
    syncBodyLock();
    pumpMetaQueue();
    const returnY = state.galleryScrollY || 0;
    requestAnimationFrame(() => {
      scrollWindowInstant(returnY);
      setTimeout(() => {
        if (!playerIsOpen()) scrollWindowInstant(returnY);
      }, 70);
    });
  }

  function scrollWindowInstant(y) {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    root.style.scrollBehavior = previous;
  }

  function closePlayer() {
    if (!playerIsOpen()) return;
    if (state.playerPushed) {
      state.playerPushed = false;
      history.back();
    } else {
      history.replaceState(null, '', location.pathname + location.search);
      hidePlayerOnly();
    }
  }

  function forceClosePlayer() {
    if (location.hash.startsWith('#/play/')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    hidePlayerOnly();
  }

  function metaChip(iconName, label, value, mono = false) {
    return `<span class="meta-chip ${mono ? 'mono' : ''}">${icon(iconName)}<span>${esc(label)}</span><b>${esc(value)}</b></span>`;
  }

  function refreshPlayerMeta() {
    const item = state.playerItem;
    if (!item) return;
    const chips = [];
    chips.push(metaChip(item.type === 'video' ? 'film' : 'database', item.type === 'video' ? '视频大小' : '文件夹大小', fmtBytes(item.size)));
    if (item.type === 'video') {
      const dur = item.broken ? '无法解码' : item.duration ? fmtDuration(item.duration) : '读取中…';
      chips.push(`<span class="meta-chip" data-player-duration>${icon('clock')}<span>时长</span><b>${esc(dur)}</b></span>`);
      if (item.width && item.height) chips.push(metaChip('image', '分辨率', `${item.width} × ${item.height}`));
      chips.push(metaChip('database', '文件夹', fmtBytes(item.folderSize)));
    }
    chips.push(metaChip('calendar', '创建', fmtDate(item.createdAt)));
    chips.push(metaChip('clock', '下载', fmtDate(item.downloadedAt)));
    chips.push(metaChip('folder', '文件夹 ID', item.folderId, true));
    if (item.mainFile) chips.push(metaChip('film', '文件名', item.mainFile));
    els.playerMeta.innerHTML = chips.join('');
  }

  function refreshPlayerSideInfo(item) {
    els.playerWarning.hidden = true;
    els.playerWarningText.textContent = '';
    if (item.broken) {
      els.playerWarning.hidden = false;
      els.playerWarningText.textContent = item.reason || '此视频无法在浏览器中解码。';
    }
    const hasDescription = Boolean(item.description) || (item.tags && item.tags.length);
    els.descriptionBox.hidden = !hasDescription;
    els.playerDescription.textContent = item.description || '';
    els.playerTags.innerHTML = (item.tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('');
    updateSelectionUI();
  }

  function updateSeekUI() {
    const video = els.playerVideo;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    els.curTime.textContent = fmtDuration(current);
    els.durTime.textContent = duration ? fmtDuration(duration) : '0:00';
    const percent = duration ? clamp((current / duration) * 100, 0, 100) : 0;
    if (!state.seeking) els.seekBar.value = String(Math.round(percent * 10));
    els.seekBar.style.setProperty('--p', `${percent}%`);
  }

  function seekTo(seconds) {
    const video = els.playerVideo;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = clamp(seconds, 0, Math.max(0, video.duration - 0.05));
    updateSeekUI();
  }

  function togglePlay() {
    if (!state.playerItem || state.playerItem.type !== 'video' || state.playerItem.broken) return;
    if (els.playerVideo.paused) {
      stopHover();
      els.playerVideo.play().catch((err) => {
        if (err && err.name === 'NotAllowedError') return;
        showPlayerError(errorMessage(els.playerVideo));
      });
    } else {
      els.playerVideo.pause();
    }
  }

  function showPlayerError(message) {
    els.playerError.hidden = false;
    els.playerErrorText.textContent = message;
    els.playerUnsupported.hidden = true;
    els.stageSpinner.hidden = true;
    els.playerStage.classList.add('paused');
    try { els.playerVideo.pause(); } catch { /* ignore */ }
    if (state.playerItem) {
      state.playerItem.broken = true;
      state.playerItem.playable = false;
      state.playerItem.reason = message;
      markBroken(state.playerItem, message);
      refreshPlayerMeta();
    }
  }

  function retryPlayerDecode() {
    const item = state.playerItem;
    if (!item) return;
    clearBroken(item);
    const cached = state.videoDurationCache[item.id];
    if (cached) {
      if (Number(item.mediaWidth) > 0) cached.w = item.mediaWidth;
      if (Number(item.mediaHeight) > 0) cached.h = item.mediaHeight;
      scheduleDurationSave();
    }
    showPlayer(item);
  }

  function retryInlineDecode() {
    const item = state.inlineItem;
    const card = state.inlineCard;
    if (!item || !card) return;
    clearBroken(item);
    stopInline();
    activateInline(item, card);
  }

  function checkPlayerTrack() {
    const item = state.playerItem;
    if (!item || item.type !== 'video' || item.broken) return;
    const video = els.playerVideo;
    if (video.error) return;
    // Only judge while the video is actually playing and the timeline has advanced.
    // Metadata-only width 0 is not authoritative.
    if (video.paused || video.currentTime < 1) return;
    if (video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth === 0) {
      showPlayerError(DECODE_MESSAGE);
    }
  }

  function schedulePlayerTrackCheck(delay = 900) {
    // GitHub作者主页 github.com/xdedmmc2
    clearTimeout(playerTrackTimer);
    playerTrackTimer = setTimeout(checkPlayerTrack, delay);
  }

  function updateVolumeUI() {
    els.volumeBar.value = String(Math.round(state.volume * 100));
    els.volumeBar.style.setProperty('--v', `${Math.round(state.volume * 100)}%`);
    const muted = els.playerVideo.muted || state.volume === 0;
    els.muteToggle.innerHTML = icon(muted ? 'volume-x' : 'volume');
    els.muteToggle.setAttribute('aria-label', muted ? '取消静音' : '静音');
  }

  function updateLoopUI() {
    els.loopToggle.checked = state.loop;
    els.loopIndicator.classList.toggle('show', state.loop);
    if (state.playerItem) els.playerVideo.loop = state.loop;
    hoverVideo.loop = state.loop;
    els.inlineVideo.loop = state.loop;
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        state.playerScrollY = els.playerPage.scrollTop;
        await els.playerStage.requestFullscreen();
      }
    } catch {
      toast('当前浏览器无法进入全屏。', 'warn');
    }
  }

  function setupPlayerVideo() {
    const video = els.playerVideo;
    video.addEventListener('play', () => {
      pauseAllVideos(video);
      stopHover();
      els.playerStage.classList.add('playing');
      els.playerStage.classList.remove('paused');
      els.playToggle.innerHTML = icon('pause');
      els.playToggle.setAttribute('aria-label', '暂停');
    });
    video.addEventListener('pause', () => {
      els.playerStage.classList.remove('playing');
      els.playerStage.classList.add('paused');
      els.playToggle.innerHTML = icon('play');
      els.playToggle.setAttribute('aria-label', '播放');
    });
    video.addEventListener('timeupdate', () => {
      updateSeekUI();
      if (video.currentTime > 0.4 && video.videoWidth === 0) checkPlayerTrack();
    });
    video.addEventListener('seeking', updateSeekUI);
    video.addEventListener('seeked', updateSeekUI);
    video.addEventListener('loadedmetadata', () => {
      const item = state.playerItem;
      if (!item) return;
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        item.duration = d;
        item.width = video.videoWidth || item.width;
        item.height = video.videoHeight || item.height;
        state.videoDurationCache[item.id] = { size: item.size, d, w: item.width || 0, h: item.height || 0 };
        scheduleDurationSave();
        updateCardDuration(item);
        refreshPlayerMeta();
      }
      updateSeekUI();
      els.stageSpinner.hidden = true;
      if (video.videoWidth === 0) schedulePlayerTrackCheck(900);
    });
    video.addEventListener('durationchange', updateSeekUI);
    video.addEventListener('waiting', () => { if (!video.paused) els.stageSpinner.hidden = false; });
    video.addEventListener('stalled', () => { if (!video.paused) els.stageSpinner.hidden = false; });
    video.addEventListener('canplay', () => { els.stageSpinner.hidden = true; });
    video.addEventListener('playing', () => {
      els.stageSpinner.hidden = true;
      if (video.videoWidth === 0) schedulePlayerTrackCheck(700);
    });
    video.addEventListener('error', () => {
      if (!state.playerItem) return;
      const message = errorMessage(video);
      els.stageSpinner.hidden = true;
      showPlayerError(message);
    });
    video.addEventListener('ended', () => {
      if (!state.loop) els.playerStage.classList.add('paused');
      updateSeekUI();
    });
    video.addEventListener('volumechange', updateVolumeUI);
    let stageClickTimer = 0;
    video.addEventListener('click', () => {
      clearTimeout(stageClickTimer);
      stageClickTimer = setTimeout(togglePlay, 230);
    });
    video.addEventListener('dblclick', () => {
      clearTimeout(stageClickTimer);
      toggleFullscreen();
    });
    els.playerStage.addEventListener('fullscreenchange', () => { /* handled globally */ });
  }

  // ---------------------------------------------------------------- move page
  function openMovePage(ids) {
    stopInline();
    const unique = [...new Set(ids)].filter((id) => state.itemMap.has(id));
    if (!unique.length) return;
    state.move.ids = unique;
    state.move.path = '';
    state.move.data = null;
    state.renameOnMove = true;
    state.deleteSourceOnMove = true;
    els.movePage.hidden = false;
    els.moveEyebrow.textContent = `移动 ${unique.length} 个壁纸`;
    els.onlyFileCheck.checked = state.onlyFile;
    els.renameCheck.checked = true;
    els.deleteSourceCheck.checked = true;
    renderOnlyFileNote();
    syncBodyLock();
    loadFolder(state.lastDest || null, true);
  }

  async function loadFolder(target, fallback) {
    if (state.move.loading) return;
    state.move.loading = true;
    els.folderLoading.hidden = false;
    els.folderEmpty.hidden = true;
    let retryHome = false;
    try {
      const query = target ? `?path=${encodeURIComponent(target)}` : '';
      const data = await api(`/api/browse${query}`);
      state.move.data = data;
      state.move.path = data.path;
      renderMoveFolder();
      renderOnlyFileNote();
    } catch (err) {
      if (target && fallback) {
        toast('上次的移动目录不可用，已回到用户目录。', 'warn');
        retryHome = true;
      } else {
        toast(err.message || '无法读取文件夹', 'error');
        els.folderEmpty.hidden = false;
      }
    } finally {
      state.move.loading = false;
      els.folderLoading.hidden = true;
    }
    if (retryHome) return loadFolder(null, false);
  }

  function pathCrumbs(p) {
    const value = String(p || '');
    const drive = value.match(/^([A-Za-z]:)\\?(.*)$/);
    if (drive) {
      const crumbs = [{ label: `${drive[1]}\\`, path: `${drive[1]}\\` }];
      let acc = `${drive[1]}\\`;
      for (const segment of drive[2].split('\\').filter(Boolean)) {
        acc = acc.endsWith('\\') ? acc + segment : `${acc}\\${segment}`;
        crumbs.push({ label: segment, path: acc });
      }
      return crumbs;
    }
    const parts = value.split('/').filter(Boolean);
    let acc = '';
    return parts.map((part, i) => {
      acc = i === 0 ? `/${part}` : `${acc}/${part}`;
      return { label: part, path: acc };
    });
  }

  function renderMoveFolder() {
    const data = state.move.data;
    if (!data) return;
    els.targetPath.textContent = data.path;
    els.folderUp.disabled = !data.parent;
    els.driveList.innerHTML = (data.roots || []).map((root) => `
      <button class="side-item ${state.move.path.toLowerCase() === root.path.toLowerCase() ? 'active' : ''}"
        type="button" data-side-path="${esc(root.path)}">${icon('drive')}<span>${esc(root.label)}</span></button>`).join('');
    els.shortcutList.innerHTML = (data.shortcuts || []).map((item) => `
      <button class="side-item ${state.move.path.toLowerCase() === item.path.toLowerCase() ? 'active' : ''}"
        type="button" data-side-path="${esc(item.path)}">${icon(item.label === '桌面' ? 'home' : item.label === '下载' ? 'folder' : 'folder-open')}<span>${esc(item.label)}</span></button>`).join('');
    const crumbs = pathCrumbs(data.path);
    els.breadcrumbs.innerHTML = crumbs.map((crumb, index) => `
      ${index ? `<span class="crumb-sep">›</span>` : ''}
      <button class="crumb ${index === crumbs.length - 1 ? 'current' : ''}" type="button" data-i18n-skip data-crumb-path="${esc(crumb.path)}">${esc(crumb.label)}</button>`).join('');
    els.folderList.innerHTML = (data.entries || []).map((entry) => `
      <button class="folder-item" type="button" data-folder-path="${esc(entry.path)}" title="${esc(entry.path)}">
        ${icon('folder')}<span data-i18n-skip>${esc(entry.name)}</span>
      </button>`).join('');
    els.folderEmpty.hidden = (data.entries || []).length > 0;
  }

  function renderOnlyFileNote() {
    const items = state.move.ids.map((id) => state.itemMap.get(id)).filter(Boolean);
    const fileItems = items.filter((item) => item.isFileItem);
    const renameText = state.renameOnMove ? '并重命名为壁纸标题' : '并保留原名称';
    const keepFolder = !state.deleteSourceOnMove;
    if (!state.onlyFile) {
      els.onlyFileNote.className = 'only-file-note';
      if (fileItems.length === items.length) {
        els.onlyFileNote.textContent = `将直接移动 ${fileItems.length} 个独立媒体文件${renameText}。`;
      } else if (fileItems.length) {
        els.onlyFileNote.textContent = `独立媒体文件会直接移动文件${renameText}；文件夹壁纸按完整文件夹移动${renameText}。`;
      } else {
        els.onlyFileNote.textContent = `将整个壁纸文件夹移动到目标目录${renameText}；原文件夹会随文件夹一起移动。`;
      }
      return;
    }
    const ineligible = items.filter((item) => !item.isOnlyFileEligible);
    const extraFiles = items.filter((item) => item.isOnlyFileEligible)
      .reduce((sum, item) => sum + (item.extraFileCount || 0), 0);
    const parts = [
      `仅移动主文件：目标文件${renameText}，不再创建同名文件夹。`,
      keepFolder
        ? '移动成功后会保留原文件夹，预览图、project.json 等文件会留在原处。'
        : '移动成功后会删除整个原文件夹。',
    ];
    if (fileItems.length) parts.push(`${fileItems.length} 个独立媒体文件会直接移动，不会删除其所在目录。`);
    if (ineligible.length) parts.push(`${ineligible.length} 个非视频/图片壁纸不支持此模式，将按完整文件夹移动。`);
    if (extraFiles) {
      parts.push(keepFolder
        ? `原文件夹中的其余 ${extraFiles} 个文件会保留在原处。`
        : `原文件夹中的其余 ${extraFiles} 个文件会随原文件夹一起删除。`);
    }
    els.onlyFileNote.className = keepFolder ? 'only-file-note' : 'only-file-note warn';
    els.onlyFileNote.innerHTML = parts.map((part, i) => i === 0 ? esc(part) : `<strong>${esc(part)}</strong>`).join(' ');
  }

  function selectedMoveItems() {
    return state.move.ids.map((id) => state.itemMap.get(id)).filter(Boolean);
  }

  function compareCardHTML(info, side) {
    const isVideo = info.type === 'video' && info.mediaUrl;
    const imageUrl = info.previewUrl || (info.type === 'image' ? info.mediaUrl : '');
    let media;
    if (isVideo) {
      media = `<video class="compare-video" controls muted playsinline preload="none"${info.previewUrl ? ` poster="${esc(info.previewUrl)}"` : ''} data-src="${esc(info.mediaUrl)}"></video><button class="compare-play" type="button" aria-label="播放">${icon('play')}<span>播放</span></button>`;
    } else if (imageUrl) {
      media = `<img src="${esc(imageUrl)}" alt="${esc(info.title || info.name || '')}">`;
    } else {
      media = `<div class="compare-empty">${icon('box')}<span>没有可预览媒体</span></div>`;
    }
    const typeLabel = info.type === 'video' ? '视频' : info.type === 'image' ? '图片' : info.isFolder ? '文件夹' : '文件';
    const dateLabel = side === 'source' ? '下载' : '修改';
    const dateValue = side === 'source' ? info.downloadedAt : info.modifiedAt;
    return `
      <div class="compare-media">
        <span class="compare-side-tag">${side === 'source' ? '待移动（源）' : '目标中已存在'}</span>
        ${media}
      </div>
      <div class="compare-body">
        <h3 data-i18n-skip>${esc(info.title || info.name || info.path || '未命名')}</h3>
        <div class="compare-stats">
          <span><b>大小</b> ${fmtBytes(info.size)}</span>
          <span><b>时长</b> ${info.duration ? fmtDuration(info.duration) : '—'}</span>
          <span><b>分辨率</b> ${info.width && info.height ? `${info.width} × ${info.height}` : '—'}</span>
          <span><b>${dateLabel}</b> ${fmtDate(dateValue || info.createdAt)}</span>
          <span><b>创建</b> ${fmtDate(info.createdAt)}</span>
          <span><b>${info.isFolder ? '文件数' : '类型'}</b> ${info.isFolder ? (info.fileCount || 0) : typeLabel}</span>
        </div>
        <p class="compare-path">${esc(info.path || info.title || '')}</p>
      </div>`;
  }

  function wireCompareVideos() {
    const cards = [els.compareSource, els.compareTarget];
    const videos = cards.flatMap((card) => [...card.querySelectorAll('video')]);
    for (const video of videos) {
      const card = video.closest('.compare-card');
      const playButton = card && card.querySelector('.compare-play');
      const start = () => {
        const source = video.dataset.src;
        if (!source) return;
        if (!video.getAttribute('src')) {
          video.src = source;
          video.load();
        }
        if (playButton) playButton.hidden = true;
        video.play().catch(() => { /* native controls remain available */ });
      };
      if (playButton) {
        playButton.addEventListener('click', (event) => {
          event.stopPropagation();
          start();
        });
      }
      video.addEventListener('play', () => {
        for (const other of videos) {
          if (other !== video && !other.paused) other.pause();
        }
        if (playButton) playButton.hidden = true;
      });
      video.addEventListener('error', () => {
        if (playButton) playButton.hidden = false;
      });
    }
  }

  function renderCompare() {
    const compare = state.compare;
    if (!compare) return;
    const conflict = compare.conflicts[compare.index];
    if (!conflict) return;
    const reasons = [];
    if (conflict.similarity && conflict.similarity.size) reasons.push('大小接近');
    if (conflict.similarity && conflict.similarity.duration) reasons.push('时长接近');
    els.compareEyebrow.textContent = `同名冲突${reasons.length ? ' · ' + reasons.join(' · ') : ''}`;
    els.compareProgress.textContent = `${compare.index + 1} / ${compare.conflicts.length}`;
    els.compareSource.innerHTML = compareCardHTML(conflict.source, 'source');
    els.compareTarget.innerHTML = compareCardHTML(conflict.target, 'target');
    els.compareDelete.textContent = '删除源壁纸';
    wireCompareVideos();
  }

  function openCompare(conflicts, context) {
    pauseAllVideos();
    stopHover();
    stopInline();
    state.compare = {
      conflicts,
      index: 0,
      decisions: {},
      items: context.items,
      destination: context.destination,
      onlyFile: context.onlyFile,
      rename: context.rename,
      deleteSourceFolder: context.deleteSourceFolder,
      prepErrors: context.prepErrors || [],
    };
    els.compareLayer.hidden = false;
    renderCompare();
    syncBodyLock();
  }

  function closeCompare() {
    els.compareLayer.hidden = true;
    els.compareSource.innerHTML = '';
    els.compareTarget.innerHTML = '';
    state.compare = null;
    syncBodyLock();
    pumpMetaQueue();
  }

  function cancelCompare() {
    if (!state.compare) return;
    closeCompare();
    toast('已取消本次移动，未改动任何文件。', 'info');
  }

  function decideCompare(decision) {
    const compare = state.compare;
    if (!compare) return;
    const conflict = compare.conflicts[compare.index];
    if (!conflict) return;
    compare.decisions[String(conflict.id)] = decision;
    compare.index++;
    if (compare.index >= compare.conflicts.length) {
      const context = {
        items: compare.items,
        destination: compare.destination,
        onlyFile: compare.onlyFile,
        rename: compare.rename,
        deleteSourceFolder: compare.deleteSourceFolder,
        prepErrors: compare.prepErrors,
        decisions: compare.decisions,
      };
      closeCompare();
      executeMove(context);
    } else {
      renderCompare();
    }
  }

  async function openFolderPath(folderPath) {
    try {
      await api('/api/open-folder', { method: 'POST', body: { path: folderPath } });
    } catch (err) {
      toast(err.message || '无法打开目标文件夹', 'error');
      throw err;
    }
  }

  function openMoveDoneDialog(context, result, errors) {
    const moved = result.moved || [];
    const deleted = result.deletedSource || [];
    const skipped = result.skipped || [];
    const overwritten = moved.filter((entry) => entry.overwritten).length;
    const autoRenamed = moved.filter((entry) => entry.autoRenamed).length;
    const sourceKept = moved.filter((entry) => entry.sourceKept).length;
    const lines = [];
    if (moved.length) lines.push(`已移动 ${moved.length} 个壁纸${overwritten ? `（覆盖 ${overwritten} 个）` : ''}${autoRenamed ? `（自动改名 ${autoRenamed} 个）` : ''}`);
    if (sourceKept) lines.push(`已保留 ${sourceKept} 个原文件夹`);
    if (deleted.length) lines.push(`已删除源壁纸 ${deleted.length} 个`);
    if (skipped.length) lines.push(`已跳过 ${skipped.length} 个`);
    if (errors.length) {
      lines.push('', '失败项目：');
      for (const error of errors) lines.push(`· ${error.title || error.id || '未知'}：${error.error}`);
    }
    const warnings = moved.filter((entry) => entry.warning);
    if (warnings.length) {
      lines.push('', '警告：');
      for (const warning of warnings) lines.push(`· ${warning.title || warning.id}：${warning.warning}`);
    }
    if (!lines.length) lines.push('没有发生文件改动。');
    lines.push('', `目标位置：${context.destination}`);
    const tone = errors.length ? 'danger' : 'good';
    let title;
    if (errors.length) title = moved.length || deleted.length ? '移动完成，但有失败' : '移动失败';
    else if (moved.length) title = '移动完成';
    else if (deleted.length) title = '已删除重复源壁纸';
    else if (skipped.length) title = '重名文件已跳过';
    else title = '没有移动文件';
    openDialog({
      tone,
      eyebrow: '移动完成',
      title,
      text: errors.length
        ? '部分文件没有完成，请查看失败原因。'
        : skipped.length && !moved.length && !deleted.length
          ? '重复文件已跳过，源文件没有改动。'
          : '文件操作已完成。',
      detail: lines.join('\n'),
      secondStage: false,
      hideCancel: true,
      confirmText: '完成',
      secondaryText: '打开目标文件夹',
      onSecondary: () => openFolderPath(context.destination),
      onConfirm: () => { closeDialog(); },
    });
  }

  async function executeMove(context) {
    els.loadingCover.hidden = false;
    els.loadingText.textContent = '正在移动文件…';
    let result;
    try {
      result = await api('/api/move', {
        method: 'POST',
        body: {
          ids: context.items.map((item) => item.id),
          destination: context.destination,
          onlyFile: context.onlyFile,
          rename: context.rename,
          deleteSourceFolder: context.deleteSourceFolder,
          decisions: context.decisions || {},
        },
      });
    } catch (err) {
      els.loadingCover.hidden = true;
      openResult('移动失败', err.message || '移动请求失败，文件没有改动。', 'danger');
      return;
    } finally {
      els.loadingCover.hidden = true;
    }
    const movedIds = new Set((result.moved || []).map((entry) => entry.id));
    const deletedIds = new Set((result.deletedSource || []).map((entry) => entry.id));
    for (const item of context.items) {
      if (movedIds.has(item.id) || deletedIds.has(item.id)) state.selected.delete(item.id);
    }
    applySelection(new Set(state.selected));
    if (result.moved.length || result.deletedSource.length) {
      state.lastDest = context.destination;
      write('luma.lastDest', state.lastDest);
      if (context.items.some((item) => item.id === state.currentId)) forceClosePlayer();
      closeMovePage();
      await loadLibrary(true);
    } else {
      closeMovePage();
      await loadLibrary(true);
    }
    const errors = [...(context.prepErrors || []), ...(result.errors || [])];
    openMoveDoneDialog(context, result, errors);
  }

  async function confirmMove() {
    if (state.move.loading) return;
    const items = selectedMoveItems();
    if (!items.length) {
      toast('没有可移动的壁纸。', 'warn');
      return;
    }
    if (!state.move.path) {
      toast('请先选择目标文件夹。', 'warn');
      return;
    }
    const ineligible = items.filter((item) => !item.isOnlyFileEligible);
    const extraFiles = items.filter((item) => item.isOnlyFileEligible)
      .reduce((sum, item) => sum + (item.extraFileCount || 0), 0);
    const warnings = [STEAM_WARNING];
    if (state.onlyFile) {
      warnings.push(state.deleteSourceOnMove
        ? '仅移动主文件模式：移动成功后会删除整个原文件夹。'
        : '仅移动主文件模式：移动成功后会保留原文件夹（预览、project.json 等）。');
      if (ineligible.length) warnings.push(`其中 ${ineligible.length} 个非视频/图片壁纸不支持仅移动文件，将按完整文件夹移动。`);
      if (extraFiles) {
        warnings.push(state.deleteSourceOnMove
          ? `原文件夹中的其余 ${extraFiles} 个文件会一并删除。`
          : `原文件夹中的其余 ${extraFiles} 个文件会保留在原处。`);
      }
    }
    const detail = items.slice(0, 12).map((item) => `· ${item.title}`).join('\n') +
      (items.length > 12 ? `\n… 另有 ${items.length - 12} 个` : '') +
      `\n\n目标位置：${state.move.path}` +
      `\n重命名：${state.renameOnMove ? '开启' : '关闭（保留原名称）'}` +
      `\n删除原文件夹：${state.onlyFile ? (state.deleteSourceOnMove ? '开启' : '关闭（保留）') : '随完整文件夹移动'}`;
    openDialog({
      tone: 'danger',
      eyebrow: '移动壁纸',
      title: `移动 ${items.length} 个壁纸？`,
      text: state.onlyFile
        ? `将壁纸主文件移动到目标文件夹，${state.renameOnMove ? '并重命名为壁纸标题' : '并保留原文件名'}。`
        : `将整个壁纸文件夹移动到目标位置，${state.renameOnMove ? '并重命名为壁纸标题' : '并保留原文件夹名'}。`,
      warning: warnings.join('\n'),
      detail,
      secondStage: true,
      confirmText: '继续',
      finalTitle: '再次确认移动',
      finalText: '确认后开始移动文件。若 Wallpaper Engine 正在使用这些壁纸，建议先退出 Wallpaper Engine。',
      finalConfirmText: '确认移动',
      onConfirm: async () => {
        const destination = state.move.path;
        const onlyFile = state.onlyFile;
        const rename = state.renameOnMove;
        const deleteSourceFolder = state.deleteSourceOnMove;
        const prepared = await api('/api/move/prepare', {
          method: 'POST',
          body: { ids: items.map((item) => item.id), destination, onlyFile, rename, deleteSourceFolder },
        });
        closeDialog();
        const context = {
          items,
          destination,
          onlyFile,
          rename,
          deleteSourceFolder,
          prepErrors: prepared.errors || [],
        };
        if (prepared.conflicts && prepared.conflicts.length) {
          openCompare(prepared.conflicts, context);
        } else {
          await executeMove({ ...context, decisions: {} });
        }
      },
    });
  }

  function closeMovePage() {
    els.movePage.hidden = true;
    state.move.ids = [];
    state.move.data = null;
    state.move.path = '';
    syncBodyLock();
  }

  // ---------------------------------------------------------------- delete / dialogs
  function openDeleteDialog(ids) {
    stopInline();
    const items = [...new Set(ids)].map((id) => state.itemMap.get(id)).filter(Boolean);
    if (!items.length) return;
    openDialog({
      tone: 'danger',
      eyebrow: '删除壁纸',
      title: `删除 ${items.length} 个壁纸？`,
      text: '这些壁纸文件夹将从本地磁盘永久删除，不会进入回收站。',
      warning: `${STEAM_WARNING}\n删除后无法恢复，请确认不再需要这些文件。`,
      detail: items.slice(0, 12).map((item) => `· ${item.title}`).join('\n') +
        (items.length > 12 ? `\n… 另有 ${items.length - 12} 个` : ''),
      secondStage: true,
      confirmText: '继续',
      finalTitle: '再次确认删除',
      finalText: '确认后将立即递归删除所选文件夹。如果 Wallpaper Engine 正在播放，请先退出或切换壁纸。',
      finalConfirmText: '永久删除',
      onConfirm: async () => {
        const result = await api('/api/delete', { method: 'POST', body: { ids: items.map((item) => item.id) } });
        closeDialog();
        if (result.deleted && result.deleted.length) {
          for (const item of items) state.selected.delete(item.id);
          applySelection(new Set(state.selected));
          if (items.some((item) => item.id === state.currentId)) forceClosePlayer();
          await loadLibrary(true);
          toast(`已删除 ${result.deleted.length} 个壁纸。`, 'warn');
        }
        if (result.errors && result.errors.length) {
          openResult('部分壁纸删除失败', result.errors.map((e) => `· ${e.title || e.id}：${e.error}`).join('\n'), 'danger');
        }
      },
    });
  }

  function openDialog(config) {
    state.lastFocus = document.activeElement;
    state.dialog = { ...config, stage: 1, busy: false };
    els.dialogCard.className = `dialog-card ${config.tone || ''}`;
    els.dialogIcon.innerHTML = icon(config.tone === 'good' ? 'check' : config.tone === 'warn' ? 'alert' : 'trash');
    els.dialogEyebrow.textContent = config.eyebrow || '请确认';
    els.dialogTitle.textContent = config.title || '确认操作';
    els.dialogText.textContent = config.text || '';
    els.dialogWarning.hidden = !config.warning;
    els.dialogWarningText.textContent = config.warning || '';
    els.dialogDetail.hidden = !config.detail;
    els.dialogDetail.textContent = config.detail || '';
    els.dialogStageTwo.hidden = true;
    els.dialogCancel.hidden = Boolean(config.hideCancel);
    els.dialogCancel.disabled = false;
    els.dialogSecondary.hidden = !config.secondaryText;
    els.dialogSecondary.textContent = config.secondaryText || '打开目标文件夹';
    els.dialogConfirm.className = `btn ${config.tone === 'danger' ? 'danger' : 'primary'}`;
    els.dialogConfirm.textContent = config.confirmText || '继续';
    els.dialogConfirm.disabled = false;
    els.dialogLayer.hidden = false;
    syncBodyLock();
    setTimeout(() => els.dialogConfirm.focus(), 40);
  }

  function closeDialog() {
    els.dialogLayer.hidden = true;
    state.dialog = null;
    syncBodyLock();
    if (state.lastFocus && state.lastFocus.focus) {
      try { state.lastFocus.focus(); } catch { /* ignore */ }
    }
    state.lastFocus = null;
  }

  async function onDialogConfirm() {
    if (!state.dialog || state.dialog.busy) return;
    const dialog = state.dialog;
    if (dialog.secondStage && dialog.stage === 1) {
      dialog.stage = 2;
      els.dialogEyebrow.textContent = '最后一步';
      els.dialogTitle.textContent = dialog.finalTitle || '再次确认';
      els.dialogText.textContent = dialog.finalText || '此操作会立即执行，且无法撤销。请确认你已了解上面的风险。';
      els.dialogStageTwo.hidden = false;
      els.dialogConfirm.textContent = dialog.finalConfirmText || '确认执行';
      els.dialogCancel.hidden = false;
      els.dialogConfirm.focus();
      return;
    }
    dialog.busy = true;
    const original = els.dialogConfirm.textContent;
    els.dialogConfirm.disabled = true;
    els.dialogCancel.disabled = true;
    els.dialogConfirm.classList.add('is-loading');
    els.dialogConfirm.innerHTML = `${icon('loader', 'spin')}处理中…`;
    try {
      await dialog.onConfirm();
    } catch (err) {
      toast(err.message || '操作失败', 'error', 6000);
      els.dialogConfirm.disabled = false;
      els.dialogCancel.disabled = false;
      els.dialogConfirm.classList.remove('is-loading');
      els.dialogConfirm.textContent = original;
      dialog.busy = false;
    }
  }

  function openResult(title, detail, tone = 'good') {
    openDialog({
      tone: tone === 'danger' ? 'danger' : 'good',
      eyebrow: '操作完成',
      title,
      text: tone === 'danger' ? '以下项目没有完成，请查看原因。' : '',
      detail,
      secondStage: false,
      hideCancel: true,
      confirmText: '知道了',
      onConfirm: () => { closeDialog(); },
    });
    els.dialogCancel.hidden = true;
    els.dialogSecondary.hidden = true;
    els.dialogConfirm.className = 'btn primary';
    els.dialogConfirm.textContent = '知道了';
  }

  // ---------------------------------------------------------------- events
  async function retryWallpaperScan() {
    try {
      await api('/api/settings/root', { method: 'POST', body: { path: '' } });
      state.settings.activeRoot = '';
      updateSettingsCurrent();
      await loadLibrary(true);
      toast('已恢复自动检测并重新扫描 wallpaper 文件夹。', 'info');
    } catch (err) {
      await loadLibrary(true);
      toast(err.message || '重新扫描失败', 'error');
    }
  }

  function bindEvents() {
    els.loopToggle.addEventListener('change', () => {
      state.loop = els.loopToggle.checked;
      write('luma.loop', state.loop ? '1' : '0');
      updateLoopUI();
    });
    els.sortSelect.addEventListener('change', () => {
      state.sort = els.sortSelect.value;
      write('luma.sort', state.sort);
      resetPagination();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    els.searchInput.addEventListener('input', () => {
      state.query = els.searchInput.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        resetPagination();
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 140);
    });
    els.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && els.searchInput.value) {
        els.searchInput.value = '';
        state.query = '';
        resetPagination();
        render();
      }
    });
    els.rescanBtn.addEventListener('click', () => loadLibrary(true));
    els.emptyRescan.addEventListener('click', retryWallpaperScan);
    els.pageSizeSelect.addEventListener('change', () => {
      const size = Number(els.pageSizeSelect.value);
      state.pageSize = [10, 20, 30, 50, 100].includes(size) ? size : 30;
      write('luma.pageSize', state.pageSize);
      resetPagination();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    els.pagePrev.addEventListener('click', () => goToPage(state.page - 1));
    els.pageNext.addEventListener('click', () => goToPage(state.page + 1));
    els.pageNumbers.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page]');
      if (button) goToPage(Number(button.dataset.page));
    });
    els.pageJumpBtn.addEventListener('click', jumpToTypedPage);
    els.pageJumpInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        jumpToTypedPage();
      }
    });
    els.pageJumpInput.addEventListener('focus', () => {
      requestAnimationFrame(() => els.pageJumpInput.select());
    });
    els.settingsBtn.addEventListener('click', openSettings);
    els.themeToggle.addEventListener('click', toggleQuickTheme);
    for (const button of $$('.theme-segment-btn')) {
      button.addEventListener('click', () => applyTheme(button.dataset.themeMode));
    }
    els.settingsClose.addEventListener('click', closeSettings);
    $('.settings-backdrop').addEventListener('click', closeSettings);
    els.settingsTabGeneral.addEventListener('click', () => switchSettingsTab('general'));
    els.settingsTabAbout.addEventListener('click', () => switchSettingsTab('about'));
    els.settingsPathInput.addEventListener('focus', () => showSettingsHistory(true));
    els.settingsPathInput.addEventListener('click', () => showSettingsHistory(true));
    els.settingsPathInput.addEventListener('input', () => showSettingsHistory(true));
    els.settingsPathInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applySettingsRoot(false);
    });
    document.addEventListener('click', (event) => {
      if (state.settings.historyOpen && !event.target.closest('.settings-path-wrap')) showSettingsHistory(false);
    });
    els.settingsApply.addEventListener('click', () => applySettingsRoot(false));
    els.settingsReset.addEventListener('click', () => applySettingsRoot(true));
    els.settingsBrowse.addEventListener('click', () => {
      showSettingsHistory(false);
      loadSettingsBrowser(els.settingsPathInput.value.trim() || state.settings.activeRoot || '');
    });
    els.settingsBrowserUp.addEventListener('click', () => {
      if (state.settings.browserParent) loadSettingsBrowser(state.settings.browserParent);
    });
    els.settingsBrowserClose.addEventListener('click', closeSettingsBrowser);
    els.settingsBrowserCancel.addEventListener('click', closeSettingsBrowser);
    els.settingsBrowserSelect.addEventListener('click', () => {
      if (!state.settings.browserPath) return;
      els.settingsPathInput.value = state.settings.browserPath;
      closeSettingsBrowser();
      els.settingsPathInput.focus();
    });
    els.aboutVersion.textContent = 'v5.2.1';
    els.filterTabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-filter]');
      if (!tab) return;
      state.filter = tab.dataset.filter;
      resetPagination();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    els.gallery.addEventListener('click', (event) => {
      if (Date.now() < state.suppressClickUntil) { event.preventDefault(); return; }
      const actionButton = event.target.closest('[data-act]');
      if (actionButton) {
        event.preventDefault();
        event.stopPropagation();
        const card = actionButton.closest('.card');
        const item = card && state.itemMap.get(card.dataset.id);
        if (!item) return;
        const action = actionButton.dataset.act;
        if (action === 'delete') openDeleteDialog([item.id]);
        else if (action === 'open') openPlayer(item.id);
        else if (action === 'external') openMedia(item);
        else if (action === 'reveal') revealItem(item);
        else if (action === 'move') openMovePage([item.id]);
        else if (action === 'select') toggleSelection(item.id);
        return;
      }
      const card = event.target.closest('.card');
      if (card) activateCard(card);
    });
    els.gallery.addEventListener('keydown', (event) => {
      const card = event.target.closest('.card');
      if (!card) return;
      if (event.target.closest('button')) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        activateCard(card);
      } else if (event.key === ' ') {
        event.preventDefault();
        toggleSelection(card.dataset.id);
      }
    });
    els.gallery.addEventListener('pointerover', onGalleryPointerOver);
    els.gallery.addEventListener('pointerout', onGalleryPointerOut);
    document.addEventListener('pointerdown', onGalleryPointerDown);
    els.gallery.addEventListener('dragstart', (event) => event.preventDefault());

    els.brandBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (playerIsOpen()) closePlayer();
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    els.playerBack.addEventListener('click', closePlayer);
    els.bigPlay.addEventListener('click', togglePlay);
    els.playToggle.addEventListener('click', togglePlay);
    els.seekBar.addEventListener('input', () => {
      state.seeking = true;
      const video = els.playerVideo;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = (Number(els.seekBar.value) / 1000) * video.duration;
        updateSeekUI();
      }
    });
    els.seekBar.addEventListener('change', () => { state.seeking = false; updateSeekUI(); });
    els.seekBar.addEventListener('pointerup', () => { state.seeking = false; });
    els.muteToggle.addEventListener('click', () => {
      state.muted = !els.playerVideo.muted;
      els.playerVideo.muted = state.muted;
      write('luma.muted', state.muted ? '1' : '0');
      updateVolumeUI();
    });
    els.volumeBar.addEventListener('input', () => {
      state.volume = clamp(Number(els.volumeBar.value) / 100, 0, 1);
      els.playerVideo.volume = state.volume;
      els.playerVideo.muted = state.volume === 0 ? true : state.muted;
      write('luma.volume', state.volume);
      updateVolumeUI();
    });
    els.fullscreenBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
      const full = Boolean(document.fullscreenElement);
      els.fullscreenBtn.innerHTML = icon(full ? 'minimize' : 'maximize');
      els.fullscreenBtn.setAttribute('aria-label', full ? '退出全屏' : '全屏');
      updateInlineButtons();
      if (!full && state.inlineCard) {
        requestAnimationFrame(() => window.scrollTo(0, state.inlineScrollY || 0));
      }
      if (!full && playerIsOpen()) {
        requestAnimationFrame(() => { els.playerPage.scrollTop = state.playerScrollY || 0; });
      }
    });
    els.playerActions.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || !state.playerItem) return;
      const action = button.dataset.action;
      if (action === 'reveal') revealItem(state.playerItem);
      else if (action === 'delete') openDeleteDialog([state.playerItem.id]);
      else if (action === 'move') openMovePage([state.playerItem.id]);
      else if (action === 'select') toggleSelection(state.playerItem.id);
    });
    els.playerRevealFromError.addEventListener('click', () => {
      if (state.playerItem) revealItem(state.playerItem);
    });
    els.playerExternalPlay.addEventListener('click', () => {
      if (state.playerItem) openMedia(state.playerItem);
    });
    els.playerRetry.addEventListener('click', retryPlayerDecode);

    els.selectAllBtn.addEventListener('click', () => {
      const next = new Set(state.selected);
      for (const item of state.pageItems) next.add(item.id);
      applySelection(next);
    });
    els.clearSelectionBtn.addEventListener('click', () => applySelection(new Set()));
    els.batchMoveBtn.addEventListener('click', () => openMovePage([...state.selected]));
    els.batchDeleteBtn.addEventListener('click', () => openDeleteDialog([...state.selected]));

    els.moveBack.addEventListener('click', closeMovePage);
    els.folderRefresh.addEventListener('click', () => loadFolder(state.move.path, false));
    els.folderUp.addEventListener('click', () => {
      if (state.move.data && state.move.data.parent) loadFolder(state.move.data.parent, false);
    });
    els.driveList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-side-path]');
      if (button) loadFolder(button.dataset.sidePath, false);
    });
    els.shortcutList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-side-path]');
      if (button) loadFolder(button.dataset.sidePath, false);
    });
    els.breadcrumbs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-crumb-path]');
      if (button) loadFolder(button.dataset.crumbPath, false);
    });
    els.folderList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-folder-path]');
      if (button) loadFolder(button.dataset.folderPath, false);
    });
    els.onlyFileCheck.addEventListener('change', () => {
      state.onlyFile = els.onlyFileCheck.checked;
      write('luma.onlyFile', state.onlyFile ? '1' : '0');
      renderOnlyFileNote();
      if (state.onlyFile) {
        const bad = selectedMoveItems().filter((item) => !item.isOnlyFileEligible).length;
        if (bad) toast(`选中项包含 ${bad} 个非视频/图片壁纸，将按完整文件夹移动。`, 'warn');
      }
    });
    els.renameCheck.addEventListener('change', () => {
      state.renameOnMove = els.renameCheck.checked;
      renderOnlyFileNote();
    });
    els.deleteSourceCheck.addEventListener('change', () => {
      state.deleteSourceOnMove = els.deleteSourceCheck.checked;
      renderOnlyFileNote();
    });
    els.moveConfirm.addEventListener('click', confirmMove);
    els.compareClose.addEventListener('click', cancelCompare);
    els.compareCancel.addEventListener('click', cancelCompare);
    els.compareDelete.addEventListener('click', () => decideCompare('delete-source'));
    els.compareOverwrite.addEventListener('click', () => decideCompare('overwrite'));
    els.compareSkip.addEventListener('click', () => decideCompare('skip'));
    $('.compare-backdrop').addEventListener('click', cancelCompare);

    els.dialogConfirm.addEventListener('click', onDialogConfirm);
    els.dialogCancel.addEventListener('click', closeDialog);
    els.dialogSecondary.addEventListener('click', async () => {
      // GitHub作者主页 github.com/xdedmmc2
      if (!state.dialog || !state.dialog.onSecondary) return;
      try {
        await state.dialog.onSecondary();
        closeDialog();
      } catch (err) {
        toast(err.message || '操作失败', 'error');
      }
    });
    $('.dialog-backdrop').addEventListener('click', () => {
      if (state.dialog && state.dialog.busy) return;
      closeDialog();
    });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopHover();
        pauseAllVideos(null);
      }
    });
    window.addEventListener('blur', () => {
      pauseAllVideos(null);
      stopHover();
    });
    let resizeTimer = 0;
    let lastMainWidth = 0;
    const updateGalleryLayout = () => {
      if (!state.libraryLoaded) return;
      const layout = layoutMetrics();
      applyGalleryBounds(layout);
      if (Number(els.gallery.dataset.columns || 0) === layout.columns) return;
      const scrollY = window.scrollY;
      render();
      window.scrollTo(0, scrollY);
    };
    const scheduleGalleryLayout = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateGalleryLayout, 180);
    };
    window.addEventListener('resize', scheduleGalleryLayout);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect?.width || 0;
        if (!width || Math.abs(width - lastMainWidth) < 2) return;
        lastMainWidth = width;
        scheduleGalleryLayout();
      }).observe(els.main);
    }
    window.addEventListener('hashchange', route);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (settingsIsOpen()) { closeSettings(); return; }
      if (!els.compareLayer.hidden) { cancelCompare(); return; }
      if (!els.dialogLayer.hidden) {
        if (state.dialog && state.dialog.busy) return;
        closeDialog();
        return;
      }
      if (!els.movePage.hidden) { closeMovePage(); return; }
      if (document.fullscreenElement) return;
      if (playerIsOpen()) { closePlayer(); return; }
      return;
    }
    if (!playerIsOpen() || !state.playerItem || state.playerItem.type !== 'video') return;
    if (!els.dialogLayer.hidden || !els.movePage.hidden) return;
    if (event.target.closest('input, select, textarea, button')) return;
    const video = els.playerVideo;
    if (event.code === 'Space') {
      event.preventDefault();
      togglePlay();
    } else if (event.key === 'm' || event.key === 'M') {
      els.muteToggle.click();
    } else if (event.key === 'f' || event.key === 'F') {
      toggleFullscreen();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekTo(video.currentTime - 5);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekTo(video.currentTime + 5);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      els.volumeBar.value = String(Math.min(100, Number(els.volumeBar.value) + 5));
      els.volumeBar.dispatchEvent(new Event('input'));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      els.volumeBar.value = String(Math.max(0, Number(els.volumeBar.value) - 5));
      els.volumeBar.dispatchEvent(new Event('input'));
    }
  }

  // ---------------------------------------------------------------- settings
  function settingsIsOpen() {
    return !els.settingsLayer.hidden;
  }

  function setSettingsMessage(message = '') {
    els.settingsMessage.hidden = !message;
    els.settingsMessage.textContent = message;
  }

  function updateSettingsCurrent() {
    const active = state.settings.activeRoot;
    els.settingsCurrent.textContent = active
      ? active
      : '自动检测（Steam 创意工坊 + 我的项目）';
  }

  function rememberSettingsPath(value) {
    const pathValue = String(value || '').trim();
    if (!pathValue) return;
    state.pathHistory = [pathValue, ...state.pathHistory.filter((p) => p.toLowerCase() !== pathValue.toLowerCase())].slice(0, 12);
    writeJSON('luma.pathHistory', state.pathHistory);
  }

  function rememberAutoSourcePaths(sources) {
    const roots = (sources || [])
      .filter((source) => source && source.root && (source.kind === 'workshop' || source.kind === 'myprojects'))
      .map((source) => source.root);
    if (!roots.length) return;
    // Reverse so the Steam workshop wallpaper root ends up first in the history.
    for (const root of roots.reverse()) rememberSettingsPath(root);
    if (state.settings.historyOpen) renderSettingsHistory();
  }

  function renderSettingsHistory() {
    const list = els.settingsHistory;
    list.textContent = '';
    if (!state.pathHistory.length) {
      const empty = document.createElement('div');
      empty.className = 'path-history-empty';
      empty.textContent = '还没有使用过的路径。应用一次后会自动记录。';
      list.appendChild(empty);
      return;
    }
    for (const pathValue of state.pathHistory) {
      const row = document.createElement('div');
      row.className = 'path-history-item';
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'path-history-pick';
      pick.textContent = pathValue;
      pick.title = '点击直接切换并扫描';
      pick.addEventListener('click', () => {
        els.settingsPathInput.value = pathValue;
        showSettingsHistory(false);
        if (state.settings.activeRoot && pathValue.toLowerCase() === state.settings.activeRoot.toLowerCase()) {
          els.settingsPathInput.focus();
          return;
        }
        applySettingsRoot(false);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'path-history-delete';
      remove.title = '从历史中删除';
      remove.innerHTML = icon('x');
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        state.pathHistory = state.pathHistory.filter((p) => p !== pathValue);
        writeJSON('luma.pathHistory', state.pathHistory);
        renderSettingsHistory();
      });
      row.append(pick, remove);
      list.appendChild(row);
    }
  }

  function showSettingsHistory(show) {
    state.settings.historyOpen = Boolean(show);
    if (!show) {
      els.settingsHistory.hidden = true;
      return;
    }
    renderSettingsHistory();
    els.settingsHistory.hidden = false;
  }

  function switchSettingsTab(tab) {
    const isAbout = tab === 'about';
    els.settingsTabGeneral.classList.toggle('active', !isAbout);
    els.settingsTabAbout.classList.toggle('active', isAbout);
    els.settingsGeneral.hidden = isAbout;
    els.settingsAbout.hidden = !isAbout;
  }

  async function loadSettings() {
    try {
      const data = await api('/api/settings');
      state.settings.activeRoot = data.activeRoot || '';
      if (!state.settings.activeRoot) els.settingsPathInput.value = '';
      else els.settingsPathInput.value = state.settings.activeRoot;
      updateSettingsCurrent();
    } catch (err) {
      setSettingsMessage(err.message || '无法读取设置，请确认服务已更新并重启。');
    }
  }

  function openSettings() {
    stopHover();
    stopInline();
    setSettingsMessage('');
    els.settingsBrowser.hidden = true;
    showSettingsHistory(false);
    switchSettingsTab('general');
    els.settingsLayer.hidden = false;
    syncBodyLock();
    loadSettings();
  }

  function closeSettings() {
    if (!settingsIsOpen()) return;
    showSettingsHistory(false);
    els.settingsBrowser.hidden = true;
    els.settingsLayer.hidden = true;
    syncBodyLock();
    pumpMetaQueue();
  }

  async function applySettingsRoot(reset = false) {
    if (state.settings.loading) return;
    const raw = reset ? '' : els.settingsPathInput.value.trim();
    if (!reset && !raw) {
      setSettingsMessage('请先输入或选择一个文件夹路径。');
      return;
    }
    state.settings.loading = true;
    els.settingsApply.disabled = true;
    els.settingsReset.disabled = true;
    setSettingsMessage('');
    try {
      const data = await api('/api/settings/root', {
        method: 'POST',
        body: { path: raw },
      });
      state.settings.activeRoot = data.activeRoot || '';
      if (state.settings.activeRoot) {
        els.settingsPathInput.value = state.settings.activeRoot;
        rememberSettingsPath(state.settings.activeRoot);
      }
      updateSettingsCurrent();
      closeSettings();
      toast(reset ? '已恢复自动检测。' : '路径已应用，正在重新扫描。', 'info');
      await loadLibrary(true);
    } catch (err) {
      setSettingsMessage(err.message || '应用失败');
    } finally {
      state.settings.loading = false;
      els.settingsApply.disabled = false;
      els.settingsReset.disabled = false;
    }
  }

  async function loadSettingsBrowser(target) {
    const requested = String(target || '').trim();
    try {
      const data = await api(`/api/browse${requested ? `?path=${encodeURIComponent(requested)}` : ''}`);
      state.settings.browserPath = data.path;
      state.settings.browserParent = data.parent || null;
      els.settingsBrowserPath.textContent = data.path;
      els.settingsBrowserPath.title = data.path;
      els.settingsBrowserUp.disabled = !data.parent;
      els.settingsBrowserShortcuts.textContent = '';
      const shortcuts = [
        ...(data.roots || []).map((entry) => ({ label: entry.label, path: entry.path })),
        ...(data.shortcuts || []).map((entry) => ({ label: entry.label || entry.name, path: entry.path })),
      ];
      for (const entry of shortcuts) {
        if (!entry.path) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'settings-browser-shortcut';
        button.textContent = entry.label || entry.path;
        button.addEventListener('click', () => loadSettingsBrowser(entry.path));
        els.settingsBrowserShortcuts.appendChild(button);
      }
      els.settingsBrowserList.textContent = '';
      for (const entry of data.entries || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'settings-browser-item';
        button.innerHTML = `${icon('folder-open')}<span></span>`;
        button.querySelector('span').textContent = entry.name;
        button.querySelector('span').dataset.i18nSkip = '';
        button.title = entry.path;
        button.addEventListener('click', () => loadSettingsBrowser(entry.path));
        els.settingsBrowserList.appendChild(button);
      }
      if (!(data.entries || []).length) {
        const empty = document.createElement('div');
        empty.className = 'path-history-empty';
        empty.textContent = '当前文件夹没有子文件夹。';
        els.settingsBrowserList.appendChild(empty);
      }
      els.settingsBrowser.hidden = false;
    } catch (err) {
      setSettingsMessage(err.message || '无法浏览文件夹');
    }
  }

  function closeSettingsBrowser() {
    els.settingsBrowser.hidden = true;
  }

  async function openMedia(item) {
    try {
      await api('/api/open-media', { method: 'POST', body: { id: item.id } });
      toast('已交给系统默认程序打开。', 'info');
    } catch (err) {
      toast(err.message || '无法调用系统播放器', 'error');
    }
  }

  async function revealItem(item) {
    try {
      await api('/api/reveal', { method: 'POST', body: { id: item.id } });
      toast('已在资源管理器中打开壁纸文件夹。', 'info');
    } catch (err) {
      toast(err.message || '无法打开文件夹', 'error');
    }
  }

  // Keep the local server alive while this page is open. The SSE connection
  // closes when the tab/window closes; the server exits after a short grace
  // period once the last page is gone.
  let sessionSource = null;
  function connectSession() {
    if (sessionSource || typeof EventSource === 'undefined') return;
    try {
      sessionSource = new EventSource('/api/session');
    } catch {
      sessionSource = null;
    }
  }
  function disconnectSession() {
    if (!sessionSource) return;
    sessionSource.close();
    sessionSource = null;
  }
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) connectSession();
  });
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) disconnectSession();
  });

  // Keep the sticky toolbar directly below the actual top bar. On narrow
  // screens the actions wrap to a second row, so the CSS height alone is not
  // enough; a ResizeObserver keeps the offset exact.
  function setupTopbarOffset() {
    const bar = $('.topbar');
    if (!bar) return;
    let lastHeight = 0;
    let raf = 0;
    const sync = () => {
      raf = 0;
      const height = Math.round(bar.getBoundingClientRect().height * 100) / 100;
      if (height > 0 && Math.abs(height - lastHeight) > 0.01) {
        lastHeight = height;
        document.documentElement.style.setProperty('--topbar-offset', `${height}px`);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(schedule).observe(bar);
    } else {
      window.addEventListener('resize', schedule);
    }
    sync();
  }

  function setupLanguage() {
    document.documentElement.lang = IS_EN ? 'en' : 'zh-CN';
    if (els.languageSelect) {
      els.languageSelect.value = LANGUAGE;
      els.languageSelect.addEventListener('change', () => {
        const next = els.languageSelect.value === 'en' ? 'en' : 'zh';
        if (next === LANGUAGE) return;
        write('luma.language', next);
        location.reload();
      });
    }
    if (!IS_EN) return;
    translateDocumentTitle();
    translateTree(document.body);
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) translateTree(node);
        } else if (mutation.type === 'characterData') {
          translateTextNode(mutation.target);
        } else if (mutation.type === 'attributes' && mutation.attributeName) {
          translateAttributes(mutation.target, mutation.attributeName);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'placeholder', 'aria-label'],
    });
    const title = document.querySelector('title');
    if (title) new MutationObserver(translateDocumentTitle).observe(title, { childList: true, characterData: true, subtree: true });
  }

  // Collapse the sticky filter toolbar while scrolling down, reveal it as soon
  // as the user scrolls back up. It moves under the top bar, not out of layout.
  function setupToolbarScroll() {
    const setCollapsed = (collapsed) => {
      document.body.classList.toggle('toolbar-collapsed', collapsed);
    };
    lastScrollY = window.scrollY;
    setCollapsed(false);
    window.addEventListener('scroll', () => {
      if (toolbarScrollRaf) return;
      toolbarScrollRaf = requestAnimationFrame(() => {
        toolbarScrollRaf = 0;
        if (playerIsOpen() || !els.movePage.hidden || settingsIsOpen() || !els.dialogLayer.hidden) {
          lastScrollY = window.scrollY;
          return;
        }
        const y = window.scrollY;
        if (y <= 24) {
          setCollapsed(false);
          lastScrollY = y;
        } else if (y > lastScrollY + 8 && y > 60) {
          setCollapsed(true);
          lastScrollY = y;
        } else if (y < lastScrollY - 6) {
          setCollapsed(false);
          lastScrollY = y;
        }
      });
    }, { passive: true });
  }

  // ---------------------------------------------------------------- boot
  function init() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    els.sortSelect.value = state.sort;
    els.pageSizeSelect.value = String(state.pageSize);
    els.loopToggle.checked = state.loop;
    els.onlyFileCheck.checked = state.onlyFile;
    els.playerVideo.volume = state.volume;
    els.playerVideo.muted = state.muted;
    updateLoopUI();
    updateVolumeUI();
    setupTheme();
    setupPlayerVideo();
    setupInlinePlayer();
    setupTopbarOffset();
    setupLanguage();
    setupToolbarScroll();
    bindEvents();
    connectSession();
    applyGalleryBounds();
    loadLibrary(false);
  }

  init();
})();
