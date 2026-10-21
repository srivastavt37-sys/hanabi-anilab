/*
# Add denormalized anime title/poster to watch_progress

1. Modified Tables
- `watch_progress`: adds two nullable text columns:
  - `anime_title` — display title of the anime, captured at save time. AniList titles are not stored in the app's local catalogue, so history rows must carry their own title to render on other devices.
  - `anime_poster` — poster image URL, same purpose.

2. Security
- No policy changes. RLS and the four existing owner-scoped policies on
  `watch_progress` continue to apply unchanged to the new columns.

3. Notes
- Columns are nullable and additive; no existing data is modified or dropped.
- The client already sends these values for library entries; watch-progress
  rows now carry them too so "Continue watching" and history work for any
  AniList title on any signed-in device.
*/

ALTER TABLE watch_progress
  ADD COLUMN IF NOT EXISTS anime_title text,
  ADD COLUMN IF NOT EXISTS anime_poster text;
