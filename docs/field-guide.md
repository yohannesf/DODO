# DODO field guide

For data entry users. The one rule: **the app works offline** — enter data
wherever you are; it reaches the server when you next have connectivity.

## First use (needs connectivity once)

1. Open the DODO address in your browser and sign in.
2. Install the app when the browser offers it ("Add to Home Screen" /
   "Install") — after that it opens and works with no network at all.
3. The first sign-in downloads your forms and org units to the device.

## Entering data

1. **Enter Data** → pick your dataset, org unit, and period. Your last
   selection is remembered.
2. Type values in the grid. **There is no save button** — every value is
   saved on this device the moment you leave the cell.
   - `Tab`/`Enter` move to the next cell, arrow keys move around,
     `Esc` reverts a cell.
   - Right-click (or long-press) a cell to attach a comment.
3. Cell marks: `●` saved on this device (not yet synced), an ochre underline
   is a warning (explain it before completing), a red underline is an error
   (fix it — completion is blocked), `▲` is a conflict — tap it to resolve.
4. When the form is done, **Mark complete** (or `Ctrl+S`). The summary shows
   filled/required cells and any failed checks before you confirm.

## Sync

The chip in the header always tells the truth:

- `● synced` — everything is on the server.
- `◌ n pending` — saved locally, waiting to sync (automatic when online).
- `◌ offline — n pending` — no connectivity; keep working normally.
- `▲ conflict / failed` — tap the chip to open the Sync Center.

Sync runs automatically when the app opens, when connectivity returns, and
every 90 seconds while open. "Sync now" in the Sync Center forces it.

**A conflict** means someone else changed the same value while you were
offline. Nothing is lost: the resolver shows both values side by side —
keep yours, take theirs, or type a third.

## On iPhone/iPad

Safari may delete the app's local data if you clear history, and the device
does not sync in the background. Open the app to sync, and sync before
clearing anything. Watch the chip: if it says pending, it isn't on the
server yet.
