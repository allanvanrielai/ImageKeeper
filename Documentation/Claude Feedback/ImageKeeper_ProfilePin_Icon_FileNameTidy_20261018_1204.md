# Image Keeper: profile pinning, icon, file-name tidy-up

Date: 2026-10-18 12:04

## 1. Pinned to the Chrome profile "APPS"
- Found by reading Chrome's `Local State` (read only; nothing in User Data was modified): the display name **APPS** is the folder **`Profile 5`**. The only other profile is `Default`. You confirmed `Profile 5`.
- `Launcher\open-imagekeeper-app.bat` now starts Chrome with `--profile-directory="Profile 5"`.
- Shortcut target line (desktop or taskbar):

  `"C:\Program Files\Google\Chrome\Application\chrome.exe" --profile-directory="Profile 5" --app=http://localhost:47614/`

- I also made a ready shortcut, `Launcher\Image Keeper.lnk`, with that target and the Image Keeper icon. You can copy it to the desktop or pin it. I read it back to check the target, arguments and icon path.
- I did not launch Chrome in your real APPS profile myself (my tests used throwaway profiles, so nothing was added to your profile). **You ran it and confirmed it works** (2026-10-18).

### "Install page as app" versus the `--app` shortcut
Both open the same page, and with the profile pinned both use APPS, so they share the same data. They are still two entry points, so choose one:
- **`--app` shortcut (`.lnk` / `.bat`):** simple and under my control. Its icon on the taskbar comes from the favicon (measured, see below). For the shortcut file itself, I set an icon explicitly.
- **Installed app:** Chrome creates its own Start-menu entry and taskbar identity, and uses the manifest icons. If you choose this, do it **from the APPS profile** (Chrome menu > Cast, save and share > Install page as app, while the APPS window is open), otherwise the app belongs to the wrong profile. The manifest is valid and Chrome reports no installability errors, so the option should be offered.
- Recommendation: use one. The `--app` shortcut is the simpler choice because it is already built and pinned to Profile 5.

## 2. Icon: option B, designed for 32 px
- Two versions of the art: detailed (thumbnails with a small mountain/sun picture) for 96 px and larger, and a simplified bold version (four blocks in two columns, the selected one dark) for 64 px and smaller. At 32 px the detailed version turns to mush.
- Files added to `app\`: `favicon.ico` (16, 24, 32, 48, 64 px, bold art only), `icon-32/48/64/192/512.png`, `manifest.webmanifest`. In `Launcher\`: `imagekeeper.ico` (16 to 256 px, for shortcuts). `index.html` now links the favicon and the manifest.
- **The favicon 404 is gone** (checked in the console log).
- Design note: Chrome scales the largest frame of `favicon.ico` down for the window icon, so `favicon.ico` deliberately has no large detailed frames.

### What Windows shows in each case (measured, not assumed)
I read the icon Windows holds for the window (what the taskbar and Alt+Tab draw), saved it, and compared it with candidate images.

| Case | Icon source | Result |
|---|---|---|
| `--app` window: taskbar and Alt+Tab | **The favicon** (`favicon.ico`). The manifest is not what drives it: the same icon appeared with and without the manifest. | Our icon, crisp at 32 px. Without any favicon, Chrome shows a grey placeholder. |
| Shortcut `.lnk` | **An `.ico` set on the shortcut itself** (`IconLocation`). A shortcut to `chrome.exe` has the Chrome logo unless this is set. | Ours, with an `.ico` set. Chrome logo without. |
| Installed app (Install page as app) | **The manifest icons**; I added crisp 32/48/64 px entries as well as 192/512. | **Not measured**: installing would change your profile. Chrome reports the manifest as valid and installable. |

Alt+Tab uses the same window icon as the taskbar button, so it follows the first row. I did not take a separate Alt+Tab screenshot.
A pinned taskbar button can take its icon from the pinned shortcut instead of the running window. I did not test this; if the pinned icon looks wrong, pin from the running window or use the `.lnk`.

## 3. File-name tidy-up
Only the title part of the suggested Save name changes. The title in the app is unchanged. After invalid characters become `_`, a run of spaces and underscores that contains at least one `_` collapses to one `_`; plain runs of spaces stay. `_` and spaces are then trimmed from both ends. The existing trailing-dot trim stays, the space before the stamp is kept, and an empty result becomes `Untitled`.

| Title | Before | After |
|---|---|---|
| `Login: error/screen?` | `Login_ error_screen_ 20261018_1106.png` | `Login_error_screen 20261018_1106.png` |
| `Err: <bad>/name?*"\|` | `Err_ _bad__name____ …png` | `Err_bad_name …png` |
| `my screen & shot #3 [final] (copy)` | same | same (unchanged) |
| `trailing dot.` | `trailing dot …png` | `trailing dot …png` (unchanged) |
| `  __Hello   World__  ` (mine) | `  __Hello   World__ …png` | `Hello   World …png` |
| `Q3 report - draft_v2: final?` (mine) | `Q3 report - draft_v2_ final_ …png` | `Q3 report - draft_v2_final …png` |
| `???` (mine) | `___ …png` | `Untitled …png` |

All seven results matched the expected values (checked in real Chrome by calling the app's own naming function).

## Notes and uncertainties
- The icon check ran on throwaway profiles, so it measures what Chrome and Windows do, not your APPS profile specifically.
- The image of the three icon options is at `Documentation\Images\IconOptions_01.png`.
- The server on port 47614 kept running throughout and now serves the new files. A temporary test server on another port was stopped.
