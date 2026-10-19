#!/usr/bin/env node
/**
 * wallpaper播放器 · local media server
 * Zero-dependency local media server for Wallpaper Engine libraries.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const FOLDER_SCRIPT = path.join(__dirname, 'scripts', 'show-folder.ps1');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const HOST = '127.0.0.1';
const APP_ID = 'luma-wallpaper';
const APP_VERSION = '5.2.1';
const API_VERSION = 4;
const WORKSHOP_APPID = '431960';
const START_PORT = Number(process.env.PORT) || 4319;
const NO_OPEN = process.argv.includes('--no-open');
const AUTO_EXIT = process.argv.includes('--auto-exit') || process.env.LUMA_AUTO_EXIT === '1';
const AUTO_EXIT_DELAY = 5000;
const SESSION_CLIENTS = new Set();
let sessionSeen = false;
let autoExitTimer = null;
let shuttingDown = false;
let activeApiRequests = 0;

const VIDEO_EXT = new Set(['.mp4', '.webm', '.m4v', '.mov', '.mkv', '.avi', '.wmv', '.flv', '.ogv', '.ts']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
const TYPE_LABEL = {
  video: '视频',
  scene: '场景',
  web: '网页',
  application: '应用',
  image: '图片',
  other: '其他',
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.ts': 'video/mp2t',
};

let index = new Map();
let conflictStore = new Map();
let libraryCache = null;
let libraryAt = 0;
let scanning = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isFile = (p) => fsp.stat(p).then((s) => s.isFile()).catch(() => false);
const isDir = (p) => fsp.stat(p).then((s) => s.isDirectory()).catch(() => false);

function cleanTitle(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'wallpaper';
}

function relInside(base, target) {
  const rel = path.relative(base, target);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function insideOrEqual(base, target) {
  return path.resolve(base).toLowerCase() === path.resolve(target).toLowerCase() ||
    relInside(path.resolve(base), path.resolve(target));
}

async function regValue(key, value) {
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', key, '/v', value], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
    });
    const m = stdout.match(new RegExp(`^\\s*${value}\\s+REG_\\w+\\s+(.+?)\\s*$`, 'mi'));
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

function vdfLibraries(text) {
  const out = [];
  for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) {
    const p = m[1].replace(/\\\\/g, '\\');
    if (!out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
  }
  return out;
}

async function readAppSettings() {
  try {
    const data = JSON.parse(await fsp.readFile(SETTINGS_FILE, 'utf8'));
    return {
      activeRoot: typeof data.activeRoot === 'string' ? data.activeRoot : '',
    };
  } catch {
    return { activeRoot: '' };
  }
}

async function writeAppSettings(settings) {
  await fsp.writeFile(SETTINGS_FILE, JSON.stringify({
    activeRoot: settings.activeRoot || '',
  }, null, 2), 'utf8');
}

async function discoverSources() {
  const sources = [];
  const seen = new Set();
  const add = async (root, label, kind) => {
    if (!root) return;
    const resolved = path.resolve(root);
    const key = resolved.toLowerCase();
    if (seen.has(key) || !(await isDir(resolved))) return;
    seen.add(key);
    sources.push({
      key: crypto.createHash('sha1').update(resolved).digest('hex').slice(0, 10),
      label,
      kind,
      root: resolved,
    });
  };

  // A manually selected root replaces automatic discovery. This is what allows
  // the app to behave like a normal one-level media player.
  const appSettings = await readAppSettings();
  if (appSettings.activeRoot) {
    const active = path.resolve(appSettings.activeRoot);
    if (await isDir(active)) {
      await add(active, '手动选择', 'custom');
      return sources;
    }
  }

  const steamPaths = new Set();
  const homeSteam = await regValue('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  const machineSteam = await regValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath');
  if (homeSteam) steamPaths.add(path.normalize(homeSteam));
  if (machineSteam) steamPaths.add(path.normalize(machineSteam));

  const wePaths = new Set();
  for (const hive of [
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 431960',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 431960',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 431960',
  ]) {
    const loc = await regValue(hive, 'InstallLocation');
    if (loc) wePaths.add(path.normalize(loc));
  }

  const libraries = new Set(steamPaths);
  for (const steam of steamPaths) {
    const vdf = path.join(steam, 'steamapps', 'libraryfolders.vdf');
    try {
      for (const lib of vdfLibraries(await fsp.readFile(vdf, 'utf8'))) libraries.add(path.normalize(lib));
    } catch { /* no library file */ }
  }

  // Common fallbacks when the registry is unavailable.
  for (let code = 65; code <= 90; code++) {
    const drive = String.fromCharCode(code) + ':\\';
    try {
      fs.accessSync(drive);
      const guessed = [
        path.join(drive, 'SteamLibrary'),
        path.join(drive, 'Program Files (x86)', 'Steam'),
        path.join(drive, 'Program Files', 'Steam'),
      ];
      for (const g of guessed) if (await isDir(g)) libraries.add(g);
    } catch { /* drive does not exist */ }
  }

  for (const lib of libraries) {
    await add(path.join(lib, 'steamapps', 'workshop', 'content', WORKSHOP_APPID), 'Steam 创意工坊', 'workshop');
  }
  for (const install of wePaths) {
    await add(path.join(install, 'projects', 'myprojects'), '我的项目', 'myprojects');
  }
  for (const lib of libraries) {
    const install = path.join(lib, 'steamapps', 'common', 'wallpaper_engine');
    if (await isDir(install)) await add(path.join(install, 'projects', 'myprojects'), '我的项目', 'myprojects');
  }

  // Optional user roots: config.json { "roots": ["D:\\Wallpapers", ...] }
  try {
    const cfg = JSON.parse(await fsp.readFile(path.join(__dirname, 'config.json'), 'utf8'));
    for (const entry of cfg.roots || []) {
      const root = typeof entry === 'string' ? entry : entry && entry.path;
      const label = typeof entry === 'object' && entry.label ? entry.label : '自定义目录';
      await add(root, label, 'custom');
    }
  } catch { /* optional */ }

  const envRoots = (process.env.WALLPAPER_ENGINE_ROOTS || '').split(';').filter(Boolean);
  for (const root of envRoots) await add(root, '自定义目录', 'custom');

  return sources;
}

async function walkFiles(dir, limit = 6000) {
  const files = [];
  async function walk(current) {
    if (files.length >= limit) return;
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limit) return;
      if (!entry.isFile() && !entry.isDirectory()) continue;
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        try {
          const st = await fsp.stat(full);
          files.push({
            full,
            rel: path.relative(dir, full).replaceAll('\\', '/'),
            name: entry.name,
            size: st.size,
            mtimeMs: st.mtimeMs,
          });
        } catch { /* skip unreadable file */ }
      }
    }
  }
  await walk(dir);
  return files;
}

function extOf(name) {
  return path.extname(String(name || '')).toLowerCase();
}

function parseImageSize(buffer) {
  if (!buffer || buffer.length < 24) return null;
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.toString('ascii', 0, 4) === 'GIF8') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      let marker = buffer[offset + 1];
      if (marker === 0xff) { offset++; continue; }
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (isSof && offset + 7 <= buffer.length) {
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        if (width && height) return { width, height };
      }
      offset += length;
    }
    return null;
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buffer.toString('ascii', 12, 16);
    if (kind === 'VP8X' && buffer.length >= 30) {
      return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    }
    if (kind === 'VP8 ' && buffer.length >= 30) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (buffer.toString('ascii', 0, 2) === 'BM' && buffer.length >= 26) {
    return { width: Math.abs(buffer.readInt32LE(18)), height: Math.abs(buffer.readInt32LE(22)) };
  }
  return null;
}

async function readImageSize(filePath) {
  let handle;
  try {
    handle = await fsp.open(filePath, 'r');
    const buffer = Buffer.alloc(131072);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return parseImageSize(buffer.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function findMp4Info(moov) {
  let trackWidth = 0;
  let trackHeight = 0;
  let duration = 0;
  let offset = 0;
  while (offset + 8 <= moov.length) {
    let size = moov.readUInt32BE(offset);
    const type = moov.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > moov.length) break;
      size = Number(moov.readBigUInt64BE(offset + 8));
      header = 16;
    }
    if (size < header) break;
    const end = Math.min(moov.length, offset + size);
    if (type === 'mvhd') {
      const base = offset + header;
      if (base + 20 <= end) {
        const version = moov[base];
        const timescale = version === 1 ? moov.readUInt32BE(base + 20) : moov.readUInt32BE(base + 12);
        const rawDuration = version === 1
          ? (base + 32 <= end ? Number(moov.readBigUInt64BE(base + 24)) : 0)
          : (base + 20 <= end ? moov.readUInt32BE(base + 16) : 0);
        if (timescale > 0) duration = rawDuration / timescale;
      }
    }
    if (type === 'trak') {
      let inner = offset + header;
      while (inner + 8 <= end) {
        const innerSize = moov.readUInt32BE(inner);
        const innerType = moov.toString('ascii', inner + 4, inner + 8);
        if (innerSize < 8) break;
        if (innerType === 'tkhd') {
          const base = inner + 8;
          const version = moov[base];
          const widthOffset = base + (version === 1 ? 88 : 76);
          if (widthOffset + 8 <= Math.min(end, moov.length)) {
            const width = moov.readUInt32BE(widthOffset) / 65536;
            const height = moov.readUInt32BE(widthOffset + 4) / 65536;
            if (width > 0 && height > 0 && !trackWidth) {
              trackWidth = Math.round(width);
              trackHeight = Math.round(height);
            }
          }
        }
        inner += innerSize;
      }
    }
    if (!size) break;
    offset += size;
  }
  return { width: trackWidth, height: trackHeight, duration };
}

async function readMp4Size(filePath) {
  let handle;
  try {
    handle = await fsp.open(filePath, 'r');
    const stat = await handle.stat();
    let offset = 0;
    const headerBuffer = Buffer.alloc(16);
    while (offset + 8 <= stat.size) {
      const { bytesRead } = await handle.read(headerBuffer, 0, 16, offset);
      if (bytesRead < 8) break;
      let size = headerBuffer.readUInt32BE(0);
      const type = headerBuffer.toString('ascii', 4, 8);
      let header = 8;
      if (size === 1) {
        if (bytesRead < 16) break;
        size = Number(headerBuffer.readBigUInt64BE(8));
        header = 16;
      } else if (size === 0) {
        size = stat.size - offset;
      }
      if (size < header) break;
      // GitHub作者主页 github.com/xdedmmc2
      if (type === 'moov') {
        const length = Math.min(size - header, 32 * 1024 * 1024);
        const moov = Buffer.alloc(length);
        await handle.read(moov, 0, length, offset + header);
        return findMp4Info(moov);
      }
      offset += size;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function resolveProjectFile(dir, value) {
  if (!value || typeof value !== 'string') return null;
  const target = path.resolve(dir, value);
  return insideOrEqual(dir, target) ? target : null;
}

async function scanWallpaper(dir, source) {
  const folderStat = await fsp.stat(dir);
  const files = await walkFiles(dir);
  const byRel = new Map(files.map((f) => [f.rel.toLowerCase(), f]));

  let project = null;
  const projectFile = files.find((f) => f.rel.toLowerCase() === 'project.json');
  if (projectFile) {
    try {
      project = JSON.parse(await fsp.readFile(projectFile.full, 'utf8'));
    } catch { /* malformed project.json is still a card */ }
  }

  const declared = resolveProjectFile(dir, project && project.file);
  const declaredExt = declared ? extOf(declared) : '';
  let type = String((project && project.type) || '').toLowerCase().trim();
  if (!['video', 'scene', 'web', 'application', 'app', 'image', 'picture'].includes(type)) type = '';
  if (type === 'app') type = 'application';
  if (type === 'picture') type = 'image';

  const videos = files.filter((f) => VIDEO_EXT.has(extOf(f.name)) && !/^preview\./i.test(f.name));
  const images = files.filter((f) => IMAGE_EXT.has(extOf(f.name)) && !/^preview\./i.test(f.name) && !/^preview[_-]/i.test(f.name));
  const scenePkg = files.find((f) => /\.pkg$/i.test(f.name));
  const htmlFile = files.find((f) => /\.html?$/i.test(f.name));
  const exeFile = files.find((f) => /\.exe$/i.test(f.name));

  if (!type) {
    if (declared && IMAGE_EXT.has(declaredExt)) type = 'image';
    else if (declared && VIDEO_EXT.has(declaredExt)) type = 'video';
    else if (scenePkg) type = 'scene';
    else if (htmlFile) type = 'web';
    else if (exeFile) type = 'application';
    else if (videos.length) type = 'video';
    else if (images.length) type = 'image';
    else type = 'other';
  }

  let mediaFile = null;
  if (type === 'video') {
    mediaFile = (declared && VIDEO_EXT.has(declaredExt) && files.find((f) => f.full === declared)) ||
      videos.sort((a, b) => b.size - a.size)[0] || null;
  } else if (type === 'image') {
    mediaFile = (declared && IMAGE_EXT.has(declaredExt) && files.find((f) => f.full === declared)) ||
      images.sort((a, b) => b.size - a.size)[0] || null;
  }

  let mainFile = mediaFile;
  if (!mainFile) {
    if (type === 'scene') mainFile = scenePkg || (declared && files.find((f) => f.full === declared)) || null;
    else if (type === 'web') mainFile = htmlFile || (declared && files.find((f) => f.full === declared)) || null;
    else if (type === 'application') mainFile = exeFile || (declared && files.find((f) => f.full === declared)) || null;
    else mainFile = (declared && files.find((f) => f.full === declared)) || files.sort((a, b) => b.size - a.size)[0] || null;
  }

  let previewFile = null;
  const previewDeclared = resolveProjectFile(dir, project && project.preview);
  if (previewDeclared) previewFile = files.find((f) => f.full === previewDeclared) || null;
  if (!previewFile) previewFile = files.find((f) => /^preview\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(f.name)) || null;
  if (!previewFile && type === 'image' && mediaFile && IMAGE_EXT.has(extOf(mediaFile.name))) previewFile = mediaFile;

  const folderSize = files.reduce((sum, f) => sum + f.size, 0);
  const previewSize = previewFile ? await readImageSize(previewFile.full) : null;
  let mediaSizeInfo = null;
  if (mediaFile) {
    if (type === 'video') mediaSizeInfo = await readMp4Size(mediaFile.full);
    else if (type === 'image') mediaSizeInfo = await readImageSize(mediaFile.full);
  }
  const mediaSize = mediaFile ? mediaFile.size : 0;
  const isVideo = type === 'video';
  const isImage = type === 'image';
  const playable = Boolean(mediaFile) && (isVideo || isImage);
  const extraFiles = files.filter((f) => f !== projectFile && f !== previewFile && f !== mainFile && f !== mediaFile);
  const extraMedia = extraFiles.filter((f) => VIDEO_EXT.has(extOf(f.name)) || IMAGE_EXT.has(extOf(f.name)));
  const birth = folderStat.birthtimeMs > 1000 ? folderStat.birthtimeMs : folderStat.ctimeMs;

  let reason = '';
  if (type === 'scene') reason = '场景壁纸使用 scene.pkg 私有格式，需要 Wallpaper Engine 渲染，浏览器无法直接播放。';
  else if (type === 'web') reason = '网页壁纸依赖 Wallpaper Engine 的运行环境，浏览器中无法直接打开。';
  else if (type === 'application') reason = '应用程序类壁纸只能在 Wallpaper Engine 或桌面环境中运行。';
  else if (type === 'other' && !playable) reason = '该壁纸不是浏览器可直接播放的视频或图片。';
  else if (isVideo && !mediaFile) reason = '没有找到可播放的视频文件。';
  else if (isImage && !mediaFile) reason = '没有找到可显示的图片文件。';

  const title = cleanTitle(project && project.title ? project.title : path.basename(dir));
  const ext = mainFile ? extOf(mainFile.name) : '';
  const id = crypto.createHash('sha1').update(path.resolve(dir).toLowerCase()).digest('hex').slice(0, 18);
  const item = {
    id,
    title,
    type,
    typeLabel: TYPE_LABEL[type] || '其他',
    folderId: path.basename(dir),
    folderName: path.basename(dir),
    sourceKey: source.key,
    sourceLabel: source.label,
    sourceKind: source.kind,
    size: isVideo ? mediaSize : folderSize,
    mediaSize,
    folderSize,
    sizeLabel: isVideo ? '视频大小' : '文件夹大小',
    createdAt: birth,
    downloadedAt: folderStat.mtimeMs,
    mediaFile: mediaFile ? mediaFile.name : '',
    mainFile: mainFile ? mainFile.name : '',
    mediaExt: mediaFile ? extOf(mediaFile.name) : ext,
    previewOk: Boolean(previewFile),
    previewMtime: previewFile ? previewFile.mtimeMs : 0,
    previewWidth: previewSize ? previewSize.width : 0,
    previewHeight: previewSize ? previewSize.height : 0,
    mediaWidth: mediaSizeInfo ? mediaSizeInfo.width : 0,
    mediaHeight: mediaSizeInfo ? mediaSizeInfo.height : 0,
    durationSec: mediaSizeInfo && Number.isFinite(mediaSizeInfo.duration) ? mediaSizeInfo.duration : 0,
    fileCount: files.length,
    extraFileCount: extraFiles.length,
    extraMediaCount: extraMedia.length,
    isOnlyFileEligible: playable && Boolean(mediaFile),
    isFileItem: false,
    playable,
    reason,
    description: String((project && project.description) || '').replace(/\r\n?/g, '\n').trim().slice(0, 600),
    tags: Array.isArray(project && project.tags) ? project.tags.slice(0, 8).map(String) : [],
  };
  return {
    item,
    internal: {
      dir,
      previewPath: previewFile ? previewFile.full : null,
      mediaPath: mediaFile ? mediaFile.full : null,
      source,
    },
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        results[i] = { error: String(err && err.message || err), dir: items[i] };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

async function scanMediaFile(file, source) {
  const ext = extOf(file.name);
  const isVideo = VIDEO_EXT.has(ext);
  const isImage = IMAGE_EXT.has(ext);
  if (!isVideo && !isImage) return { error: '不是可播放的媒体文件', path: file.full };
  const st = await fsp.stat(file.full);
  const parent = path.dirname(file.full);
  const parentStat = await fsp.stat(parent).catch(() => st);
  const meta = isVideo ? await readMp4Size(file.full) : await readImageSize(file.full);
  const title = cleanTitle(path.basename(file.name, ext)) || file.name;
  const id = crypto.createHash('sha1').update(path.resolve(file.full).toLowerCase()).digest('hex').slice(0, 18);
  const item = {
    id,
    title,
    type: isVideo ? 'video' : 'image',
    typeLabel: TYPE_LABEL[isVideo ? 'video' : 'image'],
    folderId: path.basename(parent),
    folderName: path.basename(parent),
    sourceKey: source.key,
    sourceLabel: source.label,
    sourceKind: source.kind,
    size: st.size,
    mediaSize: st.size,
    folderSize: st.size,
    sizeLabel: isVideo ? '视频大小' : '文件大小',
    createdAt: st.birthtimeMs > 1000 ? st.birthtimeMs : parentStat.birthtimeMs,
    downloadedAt: st.mtimeMs,
    mediaFile: file.name,
    mainFile: file.name,
    mediaExt: ext,
    previewOk: isImage,
    previewMtime: isImage ? st.mtimeMs : 0,
    previewWidth: isImage && meta ? meta.width : 0,
    previewHeight: isImage && meta ? meta.height : 0,
    mediaWidth: meta ? meta.width : 0,
    mediaHeight: meta ? meta.height : 0,
    durationSec: isVideo && meta && Number.isFinite(meta.duration) ? meta.duration : 0,
    fileCount: 1,
    extraFileCount: 0,
    extraMediaCount: 0,
    isOnlyFileEligible: true,
    isFileItem: true,
    playable: true,
    reason: '',
    description: '',
    tags: [],
  };
  return {
    item,
    internal: {
      dir: file.full,
      isFile: true,
      previewPath: isImage ? file.full : null,
      mediaPath: file.full,
      source,
    },
  };
}

async function scanAll() {
  const sources = await discoverSources();
  const jobs = [];
  for (const source of sources) {
    let entries = [];
    try {
      entries = await fsp.readdir(source.root, { withFileTypes: true });
    } catch { continue; }
    if (source.kind === 'custom') {
      const rootHasProject = entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === 'project.json');
      if (rootHasProject) {
        jobs.push({ dir: source.root, source });
        continue;
      }
      for (const entry of entries) {
        if (entry.isFile()) {
          if (/^preview[._-]/i.test(entry.name)) continue;
          const ext = extOf(entry.name);
          if (VIDEO_EXT.has(ext) || IMAGE_EXT.has(ext)) {
            jobs.push({ file: { full: path.join(source.root, entry.name), name: entry.name }, source });
          }
          continue;
        }
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '$RECYCLE.BIN') continue;
        jobs.push({ dir: path.join(source.root, entry.name), source });
      }
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '$RECYCLE.BIN') continue;
      jobs.push({ dir: path.join(source.root, entry.name), source });
    }
  }

  const results = await mapLimit(jobs, 16, (job) => job.file ? scanMediaFile(job.file, job.source) : scanWallpaper(job.dir, job.source));
  const items = [];
  const itemIndex = new Map();
  const errors = [];
  for (const result of results) {
    if (!result || result.error) {
      if (result && result.error) errors.push(result);
      continue;
    }
    items.push(result.item);
    itemIndex.set(result.item.id, { item: result.item, internal: result.internal });
  }

  const counts = { total: items.length, video: 0, scene: 0, web: 0, application: 0, image: 0, other: 0, bytes: 0 };
  for (const item of items) {
    counts[item.type] = (counts[item.type] || 0) + 1;
    counts.bytes += item.size;
  }

  return {
    items,
    index: itemIndex,
    sources: sources.map(({ key, label, kind, root }) => ({
      key,
      label,
      kind,
      root,
      count: items.filter((i) => i.sourceKey === key).length,
    })),
    counts,
    errors: errors.slice(0, 20),
    scannedAt: Date.now(),
  };
}

async function getLibrary(force = false) {
  if (force) libraryCache = null;
  if (libraryCache && !force && Date.now() - libraryAt < 20000) return libraryCache;
  if (!scanning) {
    scanning = scanAll()
      .then((result) => {
        libraryCache = result;
        libraryAt = Date.now();
        index = result.index;
        return result;
      })
      .finally(() => { scanning = null; });
  }
  return scanning;
}

function publicLibrary(lib) {
  return {
    items: lib.items,
    sources: lib.sources,
    counts: lib.counts,
    errors: lib.errors,
    scannedAt: lib.scannedAt,
  };
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function fail(res, status, message) {
  json(res, status, { error: message });
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function parseRange(range, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range || '').trim());
  if (!m) return null;
  let start;
  let end;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (!suffix) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Number(m[2]);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function streamFile(req, res, filePath, cacheControl = 'private, max-age=3600') {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return fail(res, 404, '文件不存在');
  }
  if (!stat.isFile()) return fail(res, 404, '不是文件');
  const type = MIME[extOf(filePath)] || 'application/octet-stream';
  const etag = `W/"${stat.size}-${Math.round(stat.mtimeMs)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
    return res.end();
  }
  const range = parseRange(req.headers.range, stat.size);
  if (req.headers.range && !range) {
    res.writeHead(416, {
      'Content-Range': `bytes */${stat.size}`,
      'Cache-Control': 'no-store',
    });
    return res.end();
  }
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff',
  };
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
    headers['Content-Length'] = range.end - range.start + 1;
    res.writeHead(206, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    return stream.pipe(res);
  }
  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

function listDriveRoots() {
  const roots = [];
  for (let code = 65; code <= 90; code++) {
    const drive = String.fromCharCode(code) + ':\\';
    try {
      fs.accessSync(drive);
      roots.push({ label: drive.slice(0, 2), path: drive });
    } catch { /* absent */ }
  }
  return roots;
}

function shortcuts() {
  const home = os.homedir();
  const candidates = [
    ['桌面', path.join(home, 'Desktop')],
    ['下载', path.join(home, 'Downloads')],
    ['图片', path.join(home, 'Pictures')],
    ['视频', path.join(home, 'Videos')],
    ['用户目录', home],
  ];
  return candidates.filter(([, p]) => fs.existsSync(p)).map(([label, p]) => ({ label, path: p }));
}

function openFolderInExplorer(folderPath) {
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    FOLDER_SCRIPT,
    '-Path',
    folderPath,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 2) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(detail || `资源管理器打开失败（退出码 ${result.status}）`);
  }
}

async function browseDirectory(target) {  const roots = listDriveRoots();
  const short = shortcuts();
  const resolved = path.resolve(String(target || os.homedir()));
  const stat = await fsp.stat(resolved).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error('目录不存在或无法访问');
  let dirents = [];
  try {
    dirents = await fsp.readdir(resolved, { withFileTypes: true });
  } catch {
    throw new Error('没有权限读取此目录');
  }
  const entries = [];
  for (const d of dirents) {
    if (!d.isDirectory() && !d.isSymbolicLink()) continue;
    if (d.name.startsWith('.') || ['$RECYCLE.BIN', 'System Volume Information', 'Config.Msi', 'WindowsApps'].includes(d.name)) continue;
    const full = path.join(resolved, d.name);
    if (!(await isDir(full))) continue;
    entries.push({ name: d.name, path: full });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }));
  const parsed = path.parse(resolved);
  return {
    path: resolved,
    parent: resolved.toLowerCase() === parsed.root.toLowerCase() ? null : path.dirname(resolved),
    roots,
    shortcuts: short,
    entries,
  };
}

async function uniqueTarget(dir, name) {
  let candidate = path.join(dir, name);
  if (!(await fsp.access(candidate).then(() => true).catch(() => false))) return candidate;
  const base = name.replace(/\.[^.]*$/, '');
  const ext = name.slice(base.length);
  let n = 1;
  do {
    candidate = path.join(dir, `${base} (${n++})${ext}`);
  } while (await fsp.access(candidate).then(() => true).catch(() => false));
  return candidate;
}

async function uniqueDirTarget(dir, name) {
  let candidate = path.join(dir, name);
  if (!(await fsp.access(candidate).then(() => true).catch(() => false))) return candidate;
  let n = 1;
  do {
    candidate = path.join(dir, `${name} (${n++})`);
  } while (await fsp.access(candidate).then(() => true).catch(() => false));
  return candidate;
}

function fsFailure(err, action) {
  const code = err && err.code ? `（${err.code}）` : '';
  const hints = {
    EACCES: '权限不足，或文件正被其他程序占用',
    EPERM: '权限不足，或文件正被 Wallpaper Engine / 资源管理器占用',
    EBUSY: '文件正在使用中，请先关闭播放器或 Wallpaper Engine',
    ENOENT: '源文件或文件夹已不存在，可能已被移动或删除',
    ENOSPC: '目标磁盘空间不足',
    EXDEV: '跨磁盘移动失败',
    EROFS: '目标位置是只读的',
  };
  const hint = hints[err && err.code] || '文件可能被占用、权限不足，或目标路径不可写';
  // GitHub发布页 github.com/xdedmmc2/Wallpaper-Engine-player
  return `${action}失败${code}：${err && err.message ? err.message : err}；可能原因：${hint}`;
}

const IMAGE_PREVIEW_RE = /^preview\.(jpe?g|png|gif|webp|avif|bmp)$/i;

async function inspectExistingPath(targetPath) {
  const stat = await fsp.stat(targetPath);
  if (stat.isDirectory()) {
    const files = await walkFiles(targetPath);
    const folderSize = files.reduce((sum, file) => sum + file.size, 0);
    const preview = files.find((file) => IMAGE_PREVIEW_RE.test(file.name));
    const videos = files.filter((file) => VIDEO_EXT.has(extOf(file.name)) && !/^preview\./i.test(file.name))
      .sort((a, b) => b.size - a.size);
    const images = files.filter((file) => IMAGE_EXT.has(extOf(file.name)) && !/^preview\./i.test(file.name))
      .sort((a, b) => b.size - a.size);
    const video = videos[0] || null;
    const image = images[0] || null;
    const main = video || image;
    const meta = video ? await readMp4Size(video.full) : image ? await readImageSize(image.full) : null;
    return {
      name: path.basename(targetPath),
      path: targetPath,
      isFolder: true,
      type: video ? 'video' : image ? 'image' : 'other',
      size: folderSize,
      duration: meta && Number.isFinite(meta.duration) ? meta.duration : 0,
      width: meta ? meta.width : 0,
      height: meta ? meta.height : 0,
      fileCount: files.length,
      createdAt: stat.birthtimeMs || stat.ctimeMs,
      modifiedAt: stat.mtimeMs,
      previewPath: preview ? preview.full : image ? image.full : null,
      mediaPath: main ? main.full : null,
    };
  }
  const ext = extOf(targetPath);
  const type = VIDEO_EXT.has(ext) ? 'video' : IMAGE_EXT.has(ext) ? 'image' : 'other';
  const meta = type === 'video' ? await readMp4Size(targetPath) : type === 'image' ? await readImageSize(targetPath) : null;
  return {
    name: path.basename(targetPath),
    path: targetPath,
    isFolder: false,
    type,
    size: stat.size,
    duration: meta && Number.isFinite(meta.duration) ? meta.duration : 0,
    width: meta ? meta.width : 0,
    height: meta ? meta.height : 0,
    fileCount: 1,
    createdAt: stat.birthtimeMs || stat.ctimeMs,
    modifiedAt: stat.mtimeMs,
    previewPath: type === 'image' ? targetPath : null,
    mediaPath: type === 'video' || type === 'image' ? targetPath : null,
  };
}

function sourceDescriptor(item, onlyFile) {
  const fileMode = Boolean(item.isFileItem || (onlyFile && item.isOnlyFileEligible));
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    isFolder: !fileMode,
    size: fileMode ? item.mediaSize : item.folderSize,
    duration: Number(item.durationSec) || 0,
    width: item.mediaWidth || 0,
    height: item.mediaHeight || 0,
    fileCount: item.fileCount,
    createdAt: item.createdAt,
    downloadedAt: item.downloadedAt,
    previewUrl: item.previewOk ? `/api/preview/${item.id}` : '',
    mediaUrl: item.playable ? `/api/media/${item.id}` : '',
  };
}

function sameMedia(source, target) {
  const sourceSize = Number(source.size) || 0;
  const targetSize = Number(target.size) || 0;
  const sourceDuration = Number(source.duration) || 0;
  const targetDuration = Number(target.duration) || 0;
  const sizeSimilar = source.isFolder === target.isFolder && sourceSize > 0 && targetSize > 0 &&
    Math.abs(sourceSize - targetSize) / Math.max(sourceSize, targetSize) <= 0.02;
  const durationSimilar = sourceDuration > 0 && targetDuration > 0 &&
    Math.abs(sourceDuration - targetDuration) <= 1.5;
  return {
    size: sizeSimilar,
    duration: durationSimilar,
    similar: sizeSimilar || durationSimilar,
  };
}

function conflictToken() {
  return crypto.randomBytes(16).toString('hex');
}

function pruneConflicts() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [token, entry] of conflictStore) {
    if (entry.createdAt < cutoff) conflictStore.delete(token);
  }
}

function moveTargetFor(item, internal, onlyFile, rename) {
  const fileMode = Boolean(internal.isFile || (onlyFile && item.isOnlyFileEligible && internal.mediaPath));
  const sourcePath = fileMode ? internal.mediaPath : internal.dir;
  let targetName;
  if (fileMode) {
    targetName = rename
      ? cleanTitle(item.title) + extOf(internal.mediaPath)
      : path.basename(internal.mediaPath);
  } else {
    targetName = rename ? cleanTitle(item.title) : path.basename(internal.dir);
  }
  return { fileMode, sourcePath, targetName };
}

async function prepareMove(ids, destination, onlyFile, rename = true, deleteSourceFolder = true) {
  const dest = path.resolve(String(destination || ''));
  const destStat = await fsp.stat(dest).catch(() => null);
  if (!destStat || !destStat.isDirectory()) throw new Error('目标文件夹不存在');
  pruneConflicts();
  const conflicts = [];
  let autoRenamed = 0;
  const errors = [];
  for (const id of ids) {
    const entry = index.get(String(id));
    if (!entry) {
      errors.push({ id, error: '壁纸不存在，可能已被移动或删除' });
      continue;
    }
    const { item, internal } = entry;
    try {
      if (!internal.isFile && insideOrEqual(internal.dir, dest)) throw new Error('不能移动到壁纸自身或其子文件夹');
      const { fileMode, sourcePath, targetName } = moveTargetFor(item, internal, onlyFile, rename);
      const targetPath = path.join(dest, targetName);
      if (path.resolve(targetPath).toLowerCase() === path.resolve(sourcePath).toLowerCase()) {
        throw new Error('目标位置与原位置相同');
      }
      const exists = await fsp.access(targetPath).then(() => true).catch(() => false);
      if (!exists) continue;
      const target = await inspectExistingPath(targetPath);
      const source = sourceDescriptor(item, onlyFile);
      const similarity = sameMedia(source, target);
      if (!similarity.similar) {
        autoRenamed++;
        continue;
      }
      const token = conflictToken();
      conflictStore.set(token, {
        createdAt: Date.now(),
        sourceId: item.id,
        targetPath,
        target,
      });
      conflicts.push({
        id: item.id,
        token,
        title: item.title,
        source,
        target: {
          ...target,
          previewPath: undefined,
          mediaPath: undefined,
          previewUrl: target.previewPath ? `/api/conflict/${token}/preview` : '',
          mediaUrl: target.mediaPath ? `/api/conflict/${token}/media` : '',
        },
        similarity,
      });
    } catch (err) {
      errors.push({ id, title: item.title, error: fsFailure(err, '检查重名冲突') });
    }
  }
  return { total: ids.length, conflicts, autoRenamed, rename: Boolean(rename), deleteSourceFolder: Boolean(deleteSourceFolder), errors };
}

async function moveFileAcross(src, dest) {
  try {
    await fsp.rename(src, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fsp.copyFile(src, dest);
    await fsp.unlink(src);
  }
}

async function moveDirAcross(src, dest) {
  try {
    await fsp.rename(src, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fsp.cp(src, dest, { recursive: true, force: false, errorOnExist: true });
    await fsp.rm(src, { recursive: true, force: false, maxRetries: 2 });
  }
}

async function doMove(ids, destination, onlyFile, decisions = {}, rename = true, deleteSourceFolder = true) {
  const dest = path.resolve(String(destination || ''));
  const stat = await fsp.stat(dest).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error('目标文件夹不存在');
  const results = {
    moved: [],
    folderMoves: 0,
    fileMoves: 0,
    skipped: [],
    deletedSource: [],
    errors: [],
  };

  for (const id of ids) {
    const entry = index.get(String(id));
    if (!entry) {
      results.errors.push({ id, error: '壁纸不存在，可能已被移动或删除' });
      continue;
    }
    const { item, internal } = entry;
    try {
      if (!internal.isFile && insideOrEqual(internal.dir, dest)) throw new Error('不能移动到壁纸自身或其子文件夹');
      const { fileMode, sourcePath, targetName } = moveTargetFor(item, internal, onlyFile, rename);
      let target = path.join(dest, targetName);
      if (path.resolve(target).toLowerCase() === path.resolve(sourcePath).toLowerCase()) {
        throw new Error('目标位置与原位置相同');
      }
      const exists = await fsp.access(target).then(() => true).catch(() => false);
      if (exists) {
        const targetInfo = await inspectExistingPath(target);
        const source = sourceDescriptor(item, onlyFile);
        const similarity = sameMedia(source, targetInfo);
        if (similarity.similar) {
          const decision = decisions[String(id)];
          if (decision === 'skip') {
            results.skipped.push({ id, title: item.title, target: path.basename(target) });
            continue;
          }
          if (decision === 'delete-source') {
            await fsp.rm(internal.dir, { recursive: !internal.isFile, force: false, maxRetries: 2 });
            results.deletedSource.push({ id, title: item.title, target: path.basename(target) });
            continue;
          }
          if (decision !== 'overwrite') {
            throw new Error('存在同名冲突，但还没有选择删除、覆盖或跳过');
          }
          await replaceTarget(sourcePath, target, !fileMode);
          let cleanupWarning = '';
          if (fileMode && !internal.isFile && deleteSourceFolder) {
            try {
              await fsp.rm(internal.dir, { recursive: true, force: false, maxRetries: 2 });
            } catch (err) {
              cleanupWarning = fsFailure(err, '删除原文件夹');
            }
          }
          results.moved.push({
            id,
            title: item.title,
            mode: fileMode ? 'file' : 'folder',
            target: path.basename(target),
            overwritten: true,
            sourceKept: Boolean(fileMode && !internal.isFile && !deleteSourceFolder),
            warning: cleanupWarning,
          });
          if (fileMode) results.fileMoves++; else results.folderMoves++;
          continue;
        }
        target = fileMode ? await uniqueTarget(dest, targetName) : await uniqueDirTarget(dest, targetName);
      }
      if (fileMode) {
        await moveFileAcross(sourcePath, target);
        let cleanupWarning = '';
        if (!internal.isFile && deleteSourceFolder) {
          try {
            await fsp.rm(internal.dir, { recursive: true, force: false, maxRetries: 2 });
          } catch (err) {
            cleanupWarning = fsFailure(err, '删除原文件夹');
          }
        }
        results.moved.push({
          id,
          title: item.title,
          mode: 'file',
          target: path.basename(target),
          autoRenamed: path.basename(target) !== targetName,
          sourceKept: Boolean(!internal.isFile && !deleteSourceFolder),
          warning: cleanupWarning,
        });
        results.fileMoves++;
      } else {
        await moveDirAcross(internal.dir, target);
        results.moved.push({
          id,
          title: item.title,
          mode: 'folder',
          target: path.basename(target),
          autoRenamed: path.basename(target) !== targetName,
        });
        results.folderMoves++;
      }
    } catch (err) {
      results.errors.push({ id, title: item.title, error: fsFailure(err, '移动') });
    }
  }
  if (results.moved.length || results.deletedSource.length) {
    libraryCache = null;
    await sleep(30);
  }
  return results;
}

async function replaceTarget(sourcePath, targetPath, isFolder) {
  const backup = `${targetPath}.luma-backup-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  await fsp.rename(targetPath, backup);
  try {
    if (isFolder) await moveDirAcross(sourcePath, targetPath);
    else await moveFileAcross(sourcePath, targetPath);
    try {
      await fsp.rm(backup, { recursive: true, force: false, maxRetries: 2 });
    } catch { /* leftover backup is harmless */ }
  } catch (err) {
    try { await fsp.rm(targetPath, { recursive: true, force: true }); } catch { /* ignore */ }
    try { await fsp.rename(backup, targetPath); } catch { /* preserve backup */ }
    throw err;
  }
}

async function doDelete(ids) {
  const results = { deleted: [], errors: [] };
  for (const id of ids) {
    const entry = index.get(String(id));
    if (!entry) {
      results.errors.push({ id, error: '壁纸不存在' });
      continue;
    }
    try {
      await fsp.rm(entry.internal.dir, { recursive: !entry.internal.isFile, force: false, maxRetries: 2 });
      results.deleted.push({ id, title: entry.item.title });
    } catch (err) {
      results.errors.push({ id, title: entry.item.title, error: fsFailure(err, '删除') });
    }
  }
  if (results.deleted.length) {
    libraryCache = null;
    await sleep(30);
  }
  return results;
}

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return fail(res, 400, '无效路径');
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!insideOrEqual(PUBLIC_DIR, filePath)) return fail(res, 403, '禁止访问');
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return fail(res, 404, '页面不存在');
  }
  if (!stat.isFile()) return fail(res, 404, '页面不存在');
  const ext = extOf(filePath);
  const isCode = ext === '.html' || ext === '.css' || ext === '.js';
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': isCode ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
  if (ext === '.html') {
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
  }
  const body = await fsp.readFile(filePath);
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;

  if (pathname === '/api/ping') return json(res, 200, { app: APP_ID, version: APP_VERSION, apiVersion: API_VERSION });
  if (pathname === '/api/session') return openSessionStream(req, res);
  if (pathname === '/api/settings') {
    const settings = await readAppSettings();
    return json(res, 200, { activeRoot: settings.activeRoot || '' });
  }
  if (pathname === '/api/library') {
    const lib = await getLibrary(searchParams.get('refresh') === '1');
    return json(res, 200, publicLibrary(lib));
  }
  if (pathname.startsWith('/api/preview/')) {
    const id = decodeURIComponent(pathname.slice('/api/preview/'.length));
    const entry = index.get(id);
    if (!entry || !entry.internal.previewPath) return fail(res, 404, '没有预览图');
    return streamFile(req, res, entry.internal.previewPath, 'private, max-age=3600');
  }
  if (pathname.startsWith('/api/media/')) {
    const id = decodeURIComponent(pathname.slice('/api/media/'.length));
    const entry = index.get(id);
    if (!entry || !entry.internal.mediaPath) return fail(res, 404, '没有可播放的媒体文件');
    return streamFile(req, res, entry.internal.mediaPath, 'private, max-age=3600');
  }
  if (pathname === '/api/browse') {
    const data = await browseDirectory(searchParams.get('path'));
    return json(res, 200, data);
  }
  if (pathname.startsWith('/api/conflict/')) {
    pruneConflicts();
    const parts = pathname.slice('/api/conflict/'.length).split('/');
    const token = parts[0];
    const kind = parts[1];
    const conflict = conflictStore.get(token);
    if (!conflict) return fail(res, 404, '冲突记录已过期，请重新发起移动');
    if (kind === 'preview' && conflict.target.previewPath) {
      return streamFile(req, res, conflict.target.previewPath, 'private, max-age=600');
    }
    if (kind === 'media' && conflict.target.mediaPath) {
      return streamFile(req, res, conflict.target.mediaPath, 'private, max-age=600');
    }
    return fail(res, 404, '没有对应的媒体文件');
  }

  if (req.method !== 'POST') return fail(res, 405, '不支持的请求方法');

  // Mutations are local-only. Reject cross-site browser requests (CSRF).
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      const localHost = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname);
      if (parsed.protocol !== 'http:' || !localHost) return fail(res, 403, '拒绝跨站请求');
    } catch {
      return fail(res, 403, '拒绝无效来源');
    }
  }
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return fail(res, 403, '拒绝跨站请求');
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return fail(res, 400, err.message || '请求格式错误');
  }

  if (pathname === '/api/reveal') {
    const entry = index.get(String(body.id || ''));
    if (!entry) return fail(res, 404, '壁纸不存在');
    try {
      openFolderInExplorer(entry.internal.dir);
      return json(res, 200, { ok: true });
    } catch (err) {
      return fail(res, 500, '无法打开资源管理器：' + (err.message || err));
    }
  }

  if (pathname === '/api/settings/root') {
    const input = String(body.path || '').trim();
    if (!input) {
      await writeAppSettings({ activeRoot: '' });
      libraryCache = null;
      index = new Map();
      conflictStore = new Map();
      return json(res, 200, { ok: true, activeRoot: '' });
    }
    const resolved = path.resolve(input);
    const targetStat = await fsp.stat(resolved).catch(() => null);
    if (!targetStat || !targetStat.isDirectory()) return fail(res, 400, '文件夹不存在或无法访问');
    await writeAppSettings({ activeRoot: resolved });
    libraryCache = null;
    index = new Map();
    conflictStore = new Map();
    return json(res, 200, { ok: true, activeRoot: resolved });
  }

  if (pathname === '/api/open-folder') {
    const folder = path.resolve(String(body.path || ''));
    const stat = await fsp.stat(folder).catch(() => null);
    if (!stat || !stat.isDirectory()) return fail(res, 400, '文件夹不存在');
    try {
      openFolderInExplorer(folder);
      return json(res, 200, { ok: true });
    } catch (err) {
      return fail(res, 500, '无法打开文件夹：' + (err.message || err));
    }
  }

  if (pathname === '/api/open-media') {
    const entry = index.get(String(body.id || ''));
    if (!entry) return fail(res, 404, '壁纸不存在');
    const mediaPath = entry.internal.mediaPath;
    if (!mediaPath) return fail(res, 400, '这个壁纸没有可由系统播放器打开的媒体文件');
    try {
      spawn('rundll32.exe', ['url.dll,FileProtocolHandler', mediaPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
      return json(res, 200, { ok: true });
    } catch (err) {
      return fail(res, 500, '无法调用系统播放器：' + (err.message || err));
    }
  }

  if (pathname === '/api/move/prepare') {
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 500) : [];
    if (!ids.length) return fail(res, 400, '没有选择壁纸');
    if (!body.destination) return fail(res, 400, '没有选择目标文件夹');
    try {
      const result = await prepareMove(ids, body.destination, Boolean(body.onlyFile), body.rename !== false, body.deleteSourceFolder !== false);
      return json(res, 200, result);
    } catch (err) {
      return fail(res, 400, err.message || '检查重名冲突失败');
    }
  }

  if (pathname === '/api/move') {
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 500) : [];
    if (!ids.length) return fail(res, 400, '没有选择壁纸');
    if (!body.destination) return fail(res, 400, '没有选择目标文件夹');
    try {
      const result = await doMove(ids, body.destination, Boolean(body.onlyFile), body.decisions || {}, body.rename !== false, body.deleteSourceFolder !== false);
      return json(res, 200, result);
    } catch (err) {
      return fail(res, 400, err.message || '移动失败');
    }
  }

  if (pathname === '/api/delete') {
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 500) : [];
    if (!ids.length) return fail(res, 400, '没有选择壁纸');
    try {
      const result = await doDelete(ids);
      return json(res, 200, result);
    } catch (err) {
      return fail(res, 400, err.message || '删除失败');
    }
  }

  return fail(res, 404, '接口不存在');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || HOST}`);
    const isApi = url.pathname.startsWith('/api/');
    const isSession = url.pathname === '/api/session';
    if (isApi && !isSession) {
      activeApiRequests++;
      let counted = true;
      const settle = () => {
        if (!counted) return;
        counted = false;
        activeApiRequests = Math.max(0, activeApiRequests - 1);
        if (!activeApiRequests) scheduleAutoExit();
      };
      res.on('finish', settle);
      res.on('close', settle);
    }
    if (isApi) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, '不支持的请求方法');
    return await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error('[luma]', err);
    if (!res.headersSent) fail(res, 500, err.message || '服务器内部错误');
    else res.destroy();
  }
});

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

function openSessionStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(': connected\n\n');

  sessionSeen = true;
  if (autoExitTimer) {
    clearTimeout(autoExitTimer);
    autoExitTimer = null;
  }

  const client = { res, timer: 0, closed: false };
  const cleanup = () => {
    if (client.closed) return;
    client.closed = true;
    clearInterval(client.timer);
    SESSION_CLIENTS.delete(client);
    if (!SESSION_CLIENTS.size) scheduleAutoExit();
  };

  client.timer = setInterval(() => {
    if (client.closed) return;
    try {
      res.write(': ping\n\n');
    } catch {
      cleanup();
    }
  }, 20000);
  client.timer.unref?.();

  SESSION_CLIENTS.add(client);
  req.setTimeout(0);
  res.setTimeout(0);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

function scheduleAutoExit() {
  if (!AUTO_EXIT || !sessionSeen || shuttingDown || SESSION_CLIENTS.size || activeApiRequests) return;
  if (autoExitTimer) clearTimeout(autoExitTimer);
  autoExitTimer = setTimeout(() => {
    autoExitTimer = null;
    if (SESSION_CLIENTS.size || shuttingDown) return;
    if (activeApiRequests) {
      scheduleAutoExit();
      return;
    }
    console.log('\n[luma] 页面已关闭，服务自动退出');
    shutdownServer();
  }, AUTO_EXIT_DELAY);
  autoExitTimer.unref?.();
}

function shutdownServer() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (autoExitTimer) {
    clearTimeout(autoExitTimer);
    autoExitTimer = null;
  }
  for (const client of SESSION_CLIENTS) {
    clearInterval(client.timer);
    try { client.res.end(); } catch { /* already closed */ }
  }
  SESSION_CLIENTS.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

async function existingInstance(port) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 500);
    const response = await fetch(`http://${HOST}:${port}/api/ping`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return false;
    const data = await response.json();
    return data.app === APP_ID && Number(data.apiVersion) >= API_VERSION;
  } catch {
    return false;
  }
}

async function listen() {
  const preferred = START_PORT;
  if (await existingInstance(preferred)) {
    console.log(`[luma] 已有实例运行：http://${HOST}:${preferred}`);
    if (!NO_OPEN) openBrowser(`http://${HOST}:${preferred}`);
    return;
  }
  // GitHub作者主页 github.com/xdedmmc2
  for (let port = preferred; port < preferred + 20; port++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          server.off('listening', onListening);
          reject(err);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, HOST);
      });
      const url = `http://${HOST}:${port}`;
      console.log(`\n  wallpaper播放器\n  ${url}\n  按 Ctrl+C 停止\n`);
      if (!NO_OPEN) openBrowser(url);
      return;
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      if (await existingInstance(port)) {
        console.log(`[luma] 已有实例运行：http://${HOST}:${port}`);
        if (!NO_OPEN) openBrowser(`http://${HOST}:${port}`);
        return;
      }
    }
  }
  throw new Error('没有可用端口');
}

function openBrowser(url) {
  try {
    spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    console.log(`[luma] 请手动打开 ${url}`);
  }
}

process.on('SIGINT', () => {
  console.log('\n[luma] 已停止');
  shutdownServer();
});

listen().catch((err) => {
  console.error('[luma] 启动失败：', err);
  process.exitCode = 1;
});
