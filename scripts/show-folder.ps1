param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$target = $Path
if (-not (Test-Path -LiteralPath $target -PathType Container)) {
  if (Test-Path -LiteralPath $target -PathType Leaf) {
    $target = Split-Path -Parent $target
  } else {
    exit 1
  }
}

$leaf = Split-Path -Leaf $target
if ([string]::IsNullOrWhiteSpace($leaf)) { $leaf = $target }
# GitHub作者主页 github.com/xdedmmc2

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class ExplorerFocus {
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")]
  private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")]
  private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")]
  private static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")]
  private static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  private static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")]
  private static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")]
  private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  private static extern bool AttachThreadInput(uint attach, uint attachTo, bool attachFlag);
  [DllImport("kernel32.dll")]
  private static extern uint GetCurrentThreadId();

  private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
  private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
  private const uint SWP_NOSIZE = 0x0001;
  private const uint SWP_NOMOVE = 0x0002;
  private const uint SWP_SHOWWINDOW = 0x0040;

  public static IntPtr Find(string title, int[] processIds) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate (IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) return true;
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      bool known = false;
      for (int i = 0; i < processIds.Length; i++) {
        if (processIds[i] == (int)pid) { known = true; break; }
      }
      if (!known) return true;
      StringBuilder text = new StringBuilder(512);
      GetWindowText(hWnd, text, text.Capacity);
      if (text.ToString().IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0) {
        found = hWnd;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static string Title(IntPtr hWnd) {
    StringBuilder text = new StringBuilder(512);
    GetWindowText(hWnd, text, text.Capacity);
    return text.ToString();
  }

  public static void Activate(IntPtr hWnd) {
    ShowWindow(hWnd, 9);
    SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    BringWindowToTop(hWnd);

    IntPtr foreground = GetForegroundWindow();
    uint foregroundPid;
    uint foregroundThread = GetWindowThreadProcessId(foreground, out foregroundPid);
    uint targetPid;
    uint targetThread = GetWindowThreadProcessId(hWnd, out targetPid);
    uint currentThread = GetCurrentThreadId();
    if (foregroundThread != 0 && targetThread != 0) {
      AttachThreadInput(currentThread, foregroundThread, true);
      AttachThreadInput(currentThread, targetThread, true);
    }
    SetForegroundWindow(hWnd);
    if (foregroundThread != 0 && targetThread != 0) {
      AttachThreadInput(currentThread, foregroundThread, false);
      AttachThreadInput(currentThread, targetThread, false);
    }
  }

  public static void ReleaseTopmost(IntPtr hWnd) {
    SetWindowPos(hWnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
  }
}
"@

$processIds = [int[]](Get-Process explorer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$window = [ExplorerFocus]::Find($leaf, $processIds)

if ($window -eq [IntPtr]::Zero) {
  Start-Process -FilePath explorer.exe -ArgumentList @($target)
  for ($i = 0; $i -lt 30 -and $window -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 150
    $processIds = [int[]](Get-Process explorer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    $window = [ExplorerFocus]::Find($leaf, $processIds)
  }
}

if ($window -eq [IntPtr]::Zero) { exit 2 }

[ExplorerFocus]::Activate($window)
Start-Sleep -Milliseconds 350
[ExplorerFocus]::ReleaseTopmost($window)
