/* Theme bootstrap — runs before first paint so the shell never flashes the
   wrong palette. Kept as an external file because the page CSP only allows
   script-src 'self'. */
(() => {
  try {
    const stored = localStorage.getItem('luma.theme') || 'system';
    // GitHub作者主页 github.com/xdedmmc2
    const mode = ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
    const dark = mode === 'dark'
      || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.themeMode = mode;
    root.style.colorScheme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#05060b' : '#e9eef8';
  } catch {
    document.documentElement.dataset.theme = 'dark';
  }
})();
