# Image Keeper: build and test report

Date: 2026-10-17 23:00

## Summary
Image Keeper is built and tested in Chrome. No NoteTaker file was modified: I only read `index.html` and `mint-profile.js`, and copied `mint-profile.js` (option A, as you chose).

## Port and files
- **Port: 47614** (NoteTaker uses 47613).
- URL: `http://localhost:47614/` (use `localhost`, not `127.0.0.1`: IndexedDB belongs to the exact origin).

| File | Purpose |
|---|---|
| `app\index.html` | The whole app (single file, no external dependencies) |
| `app\mint-profile.js` | Unchanged copy of NoteTaker's Mint profile (optional: delete it and the Profile control disappears) |
| `Launcher\serve.py` | Same tiny server as NoteTaker's (127.0.0.1 only, serves only `app\`, `Cache-Control: no-cache`) |
| `Launcher\start-imagekeeper-server.bat` | Starts the server (does nothing if the port already answers) |
| `Launcher\start-imagekeeper-hidden.vbs` | Starts the server with no window |
| `Launcher\open-imagekeeper-app.bat` | Starts the server if needed, then opens the Chrome app window |

## How to start it
- Double-click `Launcher\start-imagekeeper-hidden.vbs` (no window). The server is **already running now**, started that way for testing.
- To start it at Windows login, like NoteTaker: put a shortcut to `start-imagekeeper-hidden.vbs` in `shell:startup`. I have not changed your Startup folder.

## How to open it as an app window
Either run `Launcher\open-imagekeeper-app.bat`, or do it by hand:
1. Open Chrome at `http://localhost:47614/`.
2. Menu (three dots) > Cast, save and share > **Install page as app**. Tick "Open in window" if offered.

A shortcut for the side monitor can use the target `"C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:47614/`.
Drag the window to the side monitor once. Chrome remembers the position.
I tested with `--app=`, in its own window. I did not run `open-imagekeeper-app.bat` itself.

## What was tested (real Chrome, driven over the DevTools protocol)
Real input events were used for Ctrl+V, mouse clicks and file drops. Everything below passed.

**Input**
- Ctrl+V with a PNG on the clipboard adds a new item at the top, selected and shown. A second paste adds another item and overwrites nothing.
- Dropping 1, then 2 or 3 real image files from disk adds one item each. The last one added is on top and selected.
- A dropped file does not open in the tab; the page stayed on the app URL.
- A dropped `.txt` and a pasted text clipboard add nothing and show a brief message ("That is not an image..." / "Clipboard has no image...").
- With focus in the search box, pasting an image adds nothing (text paste behaves normally).

**List and preview**
- Two columns, newest first. The selected item is highlighted. Thumbnail, title and date/time are shown.
- The "saved" badge is shown for saved items.
- Inline title edit works in the list and in the preview header, and the two stay in sync. An empty title reverts to "Untitled".
- Search filters by title, case-insensitive, as you type. A "No images match." message appears when nothing matches.
- Fit mode shrinks a 2400 px image to the pane. The 100% toggle shows it at natural size and the pane scrolls.
- Empty state shows "Paste (Ctrl+V) or drop an image".

**Save (showSaveFilePicker)**
- `showSaveFilePicker` exists and works on `http://localhost:47614/`. Chrome's native Save dialog opens.
- **Cancel is detectable.** Cancelling throws `AbortError`. The item stays unsaved, no error banner, buttons re-enabled.
- A real save wrote the file. The file bytes are identical to the stored image (109,261 bytes). Only then was the item marked saved, and it stays in the tray.
- Suggested name for an item titled `Login: error/screen?` was `Login_ error_screen_ 20261017_2300.png`: invalid file-name characters become `_`, then a `yyyymmdd_hhmm` stamp of when the item was added, then the extension for the image format.
- The dialog's window title is Chrome's own wording: "Warning: this site can see edits you make". This is normal for the File System Access API.

**Discard**
- Unsaved item: a confirmation appears. "Keep it" removes nothing; "Discard" deletes it.
- Saved item: discarded with no confirmation.
- The record is gone from IndexedDB. Selection moves to the next item, or to the empty state when none remain.

**Persistence**
- Closing Chrome completely and reopening with the same profile restored every item, title, saved flag and image (checked byte sizes and type).
- After a restart nothing is selected, so the empty prompt shows (my choice, see below).

**Look and feel**
- Default and Mint profiles, each in light and dark, checked by screenshot. The Mint font (Lato, "NT Brand Sans") applies and the Mint logo shows above the list.
- The profile and theme choices are remembered (separate keys from NoteTaker, and a different origin anyway).
- No console errors, apart from a 404 for `favicon.ico`.

## Format of pasted images
A clipboard image pasted with Ctrl+V arrived as **`image/png`**, and the app stores and saves it as PNG.
Caveat: my test put the image on the clipboard from Chrome itself. I could not paste from Snipaste in this test, so Snipaste's own clipboard output has not been checked. Chrome reads image clipboard data as PNG, so I expect the same, but please confirm with one real Snipaste paste: the preview header shows the format (for example `PNG`).

## Deviations, choices and things I was unsure about
- **Mint file:** copied unchanged. The globals still use NoteTaker's name (`window.NoteTakerMint`), because that is what the file sets.
- **Several files dropped at once:** each becomes its own item, added in the order given, so the last one dropped ends on top and is selected.
- **Thumbnails** are stored as small WebP copies next to the original (for fast list display). The original image is kept untouched.
- **Drag-drop overlay:** a dashed "Drop to add" outline appears while files are dragged over the window. It was not in your spec.
- **Metadata line** under the preview title shows format, pixel size and file size. This is how the pasted format can be confirmed.
- **The title box in the preview header is editable** as well as the one in the list.
- **Not tested:** pasting from Snipaste itself, dragging from Explorer by hand (I used the same drop mechanism Chrome uses for real files), and the Windows-login startup shortcut.
- **Test method:** while driving the Save dialog, one of my test runs accepted the dialog early and wrote test PNGs to `Documents`. I deleted them. Nothing from testing remains there.
- The test Chrome windows used throwaway profiles in my scratchpad. They do not touch your real Chrome data.
