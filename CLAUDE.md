# NeuroFlow — Critical Rules for Claude

## DEPLOY RULE (MANDATORY)
After every code change: `git add`, `git commit`, `git push origin main`, then `vercel --prod`.
GitHub push alone is NOT enough — Vercel auto-deploy from GitHub is disconnected.
Live URL: https://neuro-flow-adhd-code-i9is.vercel.app
Vercel Hobby plan: cron must be AT MOST once per day (`"0 0 * * *"`). More frequent = deploy blocked.

---

## CRITICAL FIXES — NEVER BREAK THESE

### 1. Email Delivery (src/components/ScheduleModal.tsx + api/schedule-reminder.js)
- Emails send via **Gmail SMTP** (nodemailer) for immediate sends — guaranteed inbox delivery
- Gmail env vars: `GMAIL_USER` + `GMAIL_APP_PASSWORD` (set in Vercel)
- Future scheduled emails use Resend `scheduled_at` (domain keepzbrandai.com verified in Resend)
- Resend env var: `RESEND_API_KEY` (set in Vercel)
- `ScheduleModal` passes `taskId` to `/api/schedule-reminder` so task is marked sent after email
- **Do NOT remove nodemailer, switch back to Resend-only, or remove the Gmail transporter**

### 2. Task Persistence on Logout (src/lib/TasksContext.tsx)
- `loadFromServer` must NEVER overwrite the cache when the server returns empty
- If `combined.length === 0` but `cachedTasks.length > 0` → keep cache (transient auth issue)
- The guard is: `if (combined.length > 0) { setTasks; saveToCache } else if (cachedTasks.length > 0) { setTasks(cachedTasks) }`
- **Do NOT simplify this logic** — removing the guard erases all tasks on logout

### 3. Auto-Remove Sent Tasks (src/lib/TasksContext.tsx)
- `filterSentTasks()` hides tasks where `recurrence_rule === 'sent'` AND `now > dueTime + 5min`
- Applied on: `loadFromCache`, `loadFromServer`, and a 60-second interval timer
- Tasks disappear from calendar and upcoming events automatically — **do NOT remove the interval**

### 4. Calendar Color Bars (app/(app)/calendar.tsx)
- One color bar per unique post type (deduplicated by color using a `Set`)
- Max 5 bars — do NOT revert to one-bar-per-task logic
- `overflow: 'hidden'` on `cs.cell` is required to prevent visual bleed

### 5. addTask Return Value (src/lib/TasksContext.tsx)
- `addTask` returns `Promise<string | null>` — the saved DB task ID
- This ID is used by `ScheduleModal` to pass `taskId` to the email API
- **Do NOT change this back to `Promise<void>`**

---

## ARCHITECTURE NOTES
- Database: InsForge (Supabase alternative) via `src/lib/db.ts`
- Email: Gmail SMTP (immediate) + Resend (scheduled future)
- Cron: `api/cron-reminders.js` runs daily at midnight — backup only, not primary email mechanism
- Cache: AsyncStorage key `@neuroflow_tasks`
- Auth: `src/lib/auth.tsx` — sign-out clears localStorage but keeps AsyncStorage cache intact
