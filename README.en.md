# Wallpaper-Engine-player

<div align="center">

**English** · [中文](README.md)

</div>

> **Disclaimer**
>
> - An independent third-party tool. Not affiliated with, authorized by, or endorsed by Wallpaper Engine, Steam, or Valve.
> - It does not include, download, or redistribute any wallpaper or Workshop content. Everything shown comes from files already on your machine.
> - **Please do not resell it and do not use it commercially**: do not sell it, charge for distribution, bundle it, or charge for installation, and do not republish it with the author's attribution removed.
> - Moving and deleting are **permanent file operations**. Nothing goes to the Recycle Bin and nothing can be undone. Back up first.
> - This project was built with the assistance of DeepSeek Harness.

A web app that runs on your own machine. It turns the wallpaper files under `steamapps\workshop\content\431960` and Wallpaper Engine's `projects\myprojects` into a gallery you can browse and play in place. Watching a video wallpaper you subscribed to should not require right-clicking into layer after layer of folders just to seek or scrub; and if you jump into the middle of a video, decide it is not for you, and want to try another one, closing and reopening folders one at a time is tedious. This player removes that friction: sort by download date or size, search by title, click to play, all one-handed. It makes it easy to manage and enjoy the videos that Wallpaper Engine has downloaded to your disk. It installs no service and writes no registry keys; `package.json` has zero dependencies, the portable build ships its own `node.exe`, and double-clicking `启动.bat` is all it takes. The server listens on `127.0.0.1` only.

## Features

### Playback

Click a video card and it plays inline, right in the gallery, without leaving the page. The maximize button in the inline player controls opens the dedicated player page, and fullscreen on that page takes you to real browser fullscreen. Clicking an image card opens the player page for a full-size view. Hovering a video card starts a muted preview after a moment, and it stops when the pointer leaves.

The player page offers a seek bar, volume, mute, and fullscreen. **Loop playback** is a switch in the top bar and applies to every video. Video shortcuts: `Space` play/pause, `M` mute, `F` fullscreen, `←` / `→` seek 5 seconds back or forward, `↑` / `↓` volume up or down by 5.

Scene (`scene.pkg`), web (`.html`), and application (`.exe`) wallpapers cannot be rendered in a browser. They show a card and a note only, and need Wallpaper Engine itself to run.

### Delete

Delete straight from a card or from the player page. A second confirmation is required, and it warns you that the Steam subscription record still exists. Deletion only affects local files: **nothing goes to the Recycle Bin and nothing can be undone**. To stop Wallpaper Engine from downloading the item again, unsubscribe in the Workshop.

### Move and rename

Select a card, click **Move**, and pick a destination folder. While moving you can:

- enable rename, using the wallpaper title or the original file name as the new name;
- move only the wallpaper's main file, leaving the preview image, `project.json`, and the rest in the original folder;
- decide whether the original folder is deleted after the move.

If the destination already contains a file with the same name, the app treats the two as the same file when their sizes differ by at most 2% or their durations by at most 1.5 seconds. Only then are you asked to choose **delete source / overwrite / skip**. When they are judged dissimilar, the file is renamed automatically and never overwritten outright.

### Multi-select

Click the select button at the top-right of a card to add it to the selection. Drag across empty space to box-select a region; hold `Ctrl` or `Shift` while dragging to add to the existing selection. The batch bar offers select-all and clear, and the selection can then be moved or deleted in one go.

### Filter

The tabs at the top filter by wallpaper type: All, Video, Scene, Web, Application, Other. "Other" includes image wallpapers. Filtering stacks with search and sorting.

### Search

The toolbar search box filters by title as you type, refreshing the results after a pause in input, case-insensitively, and `Esc` clears it. It matches titles only — not folder names or file contents.

### Sort

The sort dropdown supports: download time (newest → oldest / oldest → newest), creation date (newest → oldest / oldest → newest), file size (largest → smallest / smallest → largest), title, folder ID, and file name. Page size can be 10 / 20 / 30 / 50 / 100 items, and the pagination bar at the bottom accepts a page number to jump to.

## Requirements

| Item | Requirement |
| --- | --- |
| Operating system | Windows 10 / 11. The app reads the registry to locate Steam and calls `explorer.exe`, `rundll32.exe`, and PowerShell |
| Runtime | Node.js 18 or newer; not needed when you use the `portable` build |
| Browser | Any modern browser with HTML5 video playback. HEVC / H.265 playback depends on the decoding support of Windows and the browser |
| Disk | The `portable` archive is about 34 MB and expands to about 100 MB (bundled `node.exe`); the `lite` archive is about 90 KB |
| Wallpaper Engine | Optional. Without it, pick any local wallpaper folder manually in Settings |

Optional configuration — all of it can be skipped:

| Method | Purpose |
| --- | --- |
| **Settings → Browse…** in the page | Set the scan root manually; highest priority. The choice is saved to `settings.json` in the app directory |
| `config.json` next to `server.mjs` | Adds scan roots, in the form `{ "roots": ["D:\\Wallpapers"] }`. **Must be UTF-8 without BOM** |
| `WALLPAPER_ENGINE_ROOTS` environment variable | Adds scan roots, separated by `;` |
| `PORT` environment variable | Starting port, `4319` by default; if it is taken, the app moves on to the next one |

Scanning goes only **one level deep** below a scan root: each direct child folder becomes one card, and when the scan root is a custom folder, image and video files directly inside it also become cards.

## Installation

### Option 1: Download a build (recommended)

Open [Releases](https://github.com/xdedmmc2/Wallpaper-Engine-player/releases/latest) and pick one:

- `portable`: bundles `node.exe`. Unzip anywhere and double-click `启动.bat`; no Node.js installation needed.
- `lite`: application files only. Requires Node.js 18 or newer already installed.

If Windows shows "Windows protected your PC" on first launch, click **More info** → **Run anyway**. This is expected for an unsigned personal build.

The app serves `http://127.0.0.1:4319` by default. If it does not find your wallpaper library automatically, open **Settings** → **Browse…** in the top-right corner and pick your wallpaper folder; the choice takes effect immediately. Five seconds after the last page closes, the server shuts down.

### Option 2: Run from source

```bat
git clone https://github.com/xdedmmc2/Wallpaper-Engine-player.git
cd Wallpaper-Engine-player
npm start
```

`npm install` is not needed. `npm start` opens a browser and passes `--auto-exit`; running `node server.mjs` directly does not exit automatically. To print the address in the terminal without opening a browser:

```bat
node server.mjs --no-open
```

## Common scenarios

- **A wallpaper is missing from the list**: check that it is at most **one level** below a scan root, that its extension is supported (video: `mp4 webm m4v mov mkv avi wmv flv ogv ts`; image: `jpg jpeg png webp gif bmp avif`), and that its name does not start with `preview.`.
- **Playback is black with audio only**: the browser cannot decode the codec, typically HEVC / H.265 or an `.mkv` container. When playback fails the page offers **Retry** and **System player**; the latter opens the source file in your local player.
- **Deleted a wallpaper but Steam still lists the subscription**: deletion only touches local files. Unsubscribe in the Workshop, or Wallpaper Engine may download it again on the next sync.
- **Port already in use**: the app starts at `4319` and tries up to 20 ports. If an instance is already running, launching again just opens the existing page.

## Feedback

- Bug reports: [Issues](https://github.com/xdedmmc2/Wallpaper-Engine-player/issues). Please include your Windows version, browser version, and the wallpaper's `project.json` if it has one.
- Author: [GitHub](https://github.com/xdedmmc2) · [Bilibili](https://space.bilibili.com/598986396)

## License

This project is released under the **MIT License**. The full text is in [LICENSE](LICENSE).

- Permitted: use, copy, modify, merge, publish, sublicense, and sell, provided the copyright notice and permission notice are retained.
- About "please do not resell or use commercially": that line is a **moral request** in the disclaimer above, **not a clause of the MIT License**. The MIT License does permit commercial use in the legal sense. If you want explicit commercial permission or have additional attribution requirements, contact the author through [Issues](https://github.com/xdedmmc2/Wallpaper-Engine-player/issues).

Apart from the code covered by this `LICENSE`, the repository contains no wallpaper assets. Each wallpaper remains the property of its author.
