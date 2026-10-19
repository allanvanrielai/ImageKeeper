# Image Keeper: title from dropped files, plus two checks

Date: 2026-10-18 11:07

## What I changed
One file: `app\index.html`. Nothing else was touched.

1. **Dropped image files now take the file name as their title**, without the last extension.
   - New function `titleFromFileName(name)`: `login-error.png` gives `login-error`; `report.v2.png` gives `report.v2`.
   - A name with nothing left after removing the extension (for example `.png`) gives `Untitled`. A name with no extension stays whole.
   - `addFiles(files, titleFromName)` now takes a flag. The drop handler passes `true`; the paste handler passes `false`, so pasted images stay `Untitled`.
   - Existing items are not changed.
   - Small related fix: a dropped file with an empty type was re-wrapped as a plain `Blob`, which loses its name. It is now re-wrapped as a `File` with the same name, so its title still works.
2. **Save naming is unchanged** (title, then `yyyymmdd_hhmm` of when the item was added, then the extension for the image format).
3. **Checks 2 and 3 needed no code change**: both passed.

## Test 1: title from dropped files (real Chrome, real file drops from disk)
| Dropped file | Title set | Suggested Save name |
|---|---|---|
| `login-error.png` (single drop) | `login-error` | `login-error 20261018_1106.png` |
| `report.v2.png` | `report.v2` | `report.v2 20261018_1106.png` |
| `a.b.c.d.png` | `a.b.c.d` | `a.b.c.d 20261018_1106.png` |
| `my screen & shot #3 [final] (copy).png` | `my screen & shot #3 [final] (copy)` | `my screen & shot #3 [final] (copy) 20261018_1106.png` |
| `café Ünï.png` | `café Ünï` | `café Ünï 20261018_1106.png` |

- The last four were dropped together, and each became its own item.
- A pasted image kept the title `Untitled`, and that existing item was not changed by later drops.
- Titles were still there after a page reload.
- **Invalid file-name characters:** Windows cannot create a file whose name contains `< > : " / \ | ? *`, so I could not drop a real file like that. Instead I fed Image Keeper in-page file objects with those names, through the same drop handler:
  - `Err: <bad>/name?*"|.png` gave the title `Err: <bad>/name?*"|` (kept as is) and the suggested Save name `Err_ _bad__name____ 20261018_1106.png`. Invalid characters become `_` in the Save name only.
  - `.png` alone gave `Untitled`.
  - `noextension` gave `noextension`.
  - `trailing dot..png` gave `trailing dot.`, because only the last extension is removed. Its Save name was `trailing dot 20261018_1106.png`: Windows does not allow a trailing dot, so it is dropped from the Save name.

## Test 2: paste in title fields
Same method as the search-box test: a real Ctrl+V with a PNG on the clipboard.
- Focus in a **list title field**: no item added (10 items before, 10 after), and the field's text was unchanged.
- Focus in the **preview-header title field**: no item added (10 before, 10 after).
- Text paste into the title field still pastes text (so normal editing is unaffected).
- Result: neither field adds an image. No fix needed.

## Test 3: Discard removes the thumbnail too
How the data is stored: each item is **one IndexedDB record** in the store `items`. The original image (`blob`) and the WebP thumbnail (`thumb`) are two fields of that same record. There is no separate store, index or database. Deleting the record therefore deletes both.

How I verified it:
- Before discarding, I read every record: each had both `blob` and `thumb` with a non-zero size (for example 728 B and 610 B).
- The store was the only one (`["items"]`), with no indexes, and the only database was `imagekeeper`.
- After discarding one item (with the confirm dialog), the record count went 10 to 9. A direct `get(id)` returned `undefined` and the key was absent from `getAllKeys()`.
- After discarding all items, the store held 0 records.
- I also looked at Chrome's own on-disk blob files for this database. After the discards, 18 files were still there for a short time (Chrome removes them lazily). I reopened the same profile and closed Chrome gracefully: **0 files remained**. So nothing is left behind once Chrome tidies up.

## Notes
- No console errors in these runs (apart from the favicon 404 already known).
- My first runs of the test script hung because of bugs in the test script itself (a clipboard focus problem and a badly attached IndexedDB handler), not the app. I fixed the script and reran everything.
- Test Chrome windows used throwaway profiles in my scratchpad. Nothing was written to your Documents folder this time.
