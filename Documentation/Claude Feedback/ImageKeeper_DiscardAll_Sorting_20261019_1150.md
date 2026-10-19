# Image Keeper: Discard All and sorting

Date: 2026-10-19 11:50

Scope (confirmed with you): sections 4 and 5 only. Sections 1-3 were already done and confirmed (report 20261018_1204) and were not touched.
Changed file: `app\index.html` only. No NoteTaker file was touched. All tests ran in a throwaway Chrome profile (deleted afterwards); your APPS profile and real folders were not used.

## 4. Discard All
- Button "Discard All" in the left panel, next to the search box (the per-image Discard stays in the preview header, on the other side of the window). Disabled when the tray is empty (and while a Save dialog is busy).
- Always discards every item (saved or not, whatever the search shows), always asks first. Dialog text: "Discard all N images?", "X are not saved and will be gone for good." / "All are saved.", and "Including H hidden by the current search." only when a search hides some. Confirm button reads "Discard all N". Cancel has the focus.
- On confirm: the whole IndexedDB store is cleared, the search box is emptied, the empty state shows. If the database delete fails, nothing is discarded and an error banner shows.
- Singular wording is handled ("Discard all 1 image?", "1 is not saved...").

## 5. Sorting
- Dropdown under the search box: Date: newest first (default) / Date: oldest first / Title: A-Z / Title: Z-A. "Date" = when added to the tray.
- Titles use `Intl.Collator(numeric, base sensitivity)`: case-insensitive, "shot 2" before "shot 10". Equal titles fall back to newest first.
- Search filters, sort orders what remains.
- New items (paste/drop) take their place by the current sort; the new item (last one of a multi-file drop) is selected and scrolled into view. This replaces "new item goes to the top".
- Renaming while sorted by title: no re-sort while typing; on Enter or blur the row moves, stays selected and is scrolled into view.
- Choice stored in localStorage key `imagekeeper-sort` (next to `imagekeeper-profile` and `imagekeeper-theme`); an invalid stored value falls back to the default.
- Bug found and fixed during testing: re-sorting on blur moved the row under the mouse between mouse-down and mouse-up, so clicking another row while a rename was open lost the click. The re-sort now waits until the mouse button is released.

## Tests (real Chrome, 29 checks, all passed)
- Four orders on 13 items (3x "Untitled", "shot 2/10", "Shot 1", "beta 3/20", mixed case): exact expected order for each, including tie order.
- Paste and a two-file drop while sorted by title: placed by sort, last one selected and in view.
- Rename while sorted by title: no move while typing, moves on Enter, stays selected and in view; rename then clicking another row selects that row; rename saved to IndexedDB.
- Sort + search together (both directions).
- Sort choice survives reload; bad stored value falls back.
- Discard All: mixed saved/unsaved (dialog text, Cancel focused); Enter on the dialog (nothing removed); Cancel and Esc (nothing removed); with a search hiding 14 of 16 (hidden count shown, all 16 removed, store = 0 records, search cleared, empty state); all saved ("All are saved.", store = 0); reload still empty; button disabled when empty; singular wording.
- Screenshot check of the layout and dialog looked right.

## Notes
- Not tested: dark mode and the Mint profile with the new controls (they use the existing colour tokens). Your real APPS window needs a reload to pick up the change.
- A new item added while a search hides it is selected but not visible; this was already the case before and is unchanged.
- A backup of the previous index.html is in the Windows temp folder (`index.html.bak_before_4_5`).
