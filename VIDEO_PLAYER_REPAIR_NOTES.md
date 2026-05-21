# NeuroFlow Video Player Repair Notes

## Regression Summary
Two commits (`f63d2af`, `8b665ed`) attempted to fix mobile media brightness but introduced new breakage:

- Added `filter: 'brightness(1.32) contrast(1.1) saturate(1.08)'` to both the native `<video>` element AND Google Drive iframe
- Changed audio player from Drive iframe embed → `<audio src={driveDownloadUrl}>` 
- Temporarily added CSS `video::-webkit-media-controls-panel { background-color: rgba(0,0,0,0.62) }` and `timeline { align-self: flex-end }` (later partially reverted)

## Root Causes

### 1. CSS `filter` on `<video>` = Black/Blank Screen
Applying any CSS `filter` to a `<video>` element forces it into a separate GPU compositing layer.
In Safari/WebKit (the engine Expo Web uses), this frequently causes the video to render as solid black.
This is a well-documented WebKit bug. The fix: **never apply CSS filter to `<video>` elements**.

### 2. CSS `filter` on `<iframe>` = Useless
CSS `filter` applied to an `<iframe>` element only affects the iframe's border/box — not its content.
The Google Drive player inside the iframe is completely unaffected. Remove it.

### 3. Audio: `<audio src={driveDownloadUrl}>` = Unreliable
Google Drive download URLs (`uc?export=download&id=...`) redirect through auth and virus-scan warnings.
They don't stream reliably in `<audio>` elements. The **Drive iframe embed** (`/preview`) is the reliable path
because it runs in Drive's own authenticated session.

## Files Changed
- `src/components/NeuroFlowVideoPlayer.tsx` — main player used by Dashboard + Resource Viewer
- `app/(app)/focus.tsx` — Deep Work Audio Blueprint player

## Expected Behavior (Do Not Break)
1. Dashboard "How To Use NeuroFlow" video → from admin setting `howto_video_url`, NOT promo video
2. Desktop players → clean 16:9, no filter, no overlay
3. Mobile players → fit inside mobile view, no dark tint, no forced desktop size  
4. Timeline/scrubber → at BOTTOM of video (native browser default — don't override with CSS)
5. Audio Blueprint → plays reliably via Drive iframe embed
6. Deep Work Audio fullscreen → not hidden under app header (uses Modal + fixed overlay)
7. Resource videos → same stable player as Dashboard

## Do NOT Touch
- `src/components/ScheduleModal.tsx`
- `api/schedule-reminder.js`
- `src/lib/TasksContext.tsx`

## Deploy Rule (from AGENTS.md)
After every change: `git add` → `git commit` → `git push origin main` → `vercel --prod`
