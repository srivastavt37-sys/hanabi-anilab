/*
# Hanabi cloud sync: profiles, library, watch progress, preferences

1. New Tables
- `profiles` — one row per user account: display name and preferences (theme).
  - `id` (uuid, primary key, references auth.users, defaults to the signed-in user)
  - `display_name` (text)
  - `theme` (text, 'light' or 'dark')
  - `created_at`, `updated_at` (timestamps)

- `library_entries` — the user's saved anime (watchlist / watching / completed).
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to the authenticated user)
  - `anime_id` (text, not null — external catalogue id like "anilist-123")
  - `anime_title` (text, not null — denormalized for display)
  - `anime_poster` (text — denormalized poster URL)
  - `status` (text, one of 'watching' | 'planned' | 'completed')
  - `created_at`, `updated_at` (timestamps)
  - UNIQUE constraint on (user_id, anime_id) — one entry per anime per user

- `watch_progress` — per-episode playback position for resume and history.
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to the authenticated user)
  - `anime_id` (text, not null)
  - `episode_id` (text, not null)
  - `episode_number` (integer, not null)
  - `position_seconds` (numeric, not null, default 0)
  - `duration_seconds` (numeric, not null, default 0)
  - `completed` (boolean, default false)
  - `updated_at` (timestamp, auto-updated)
  - UNIQUE constraint on (user_id, episode_id) — one progress row per episode per user

2. Indexes
- `library_entries(user_id, updated_at)` for fast library loads.
- `watch_progress(user_id, updated_at)` for fast history/continue-watching loads.

3. Security
- RLS enabled on all three tables.
- Owner-scoped policies: each authenticated user can SELECT, INSERT, UPDATE and
  DELETE only their own rows (auth.uid() = user_id / id).
- No anon access — this is personal per-user data, so policies are scoped
  `TO authenticated` and the app provides the sign-in UI.

4. Notes
- user_id columns default to auth.uid() so client inserts that omit user_id
  still pass the INSERT WITH CHECK policy.
- A trigger keeps watch_progress.updated_at current on every update.
- A trigger auto-creates a profile row whenever a new user signs up.
- The upsert conflict targets are (user_id, anime_id) and (user_id, episode_id),
  so repeated saves update rather than duplicate.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS library_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id text NOT NULL,
  anime_title text NOT NULL,
  anime_poster text,
  status text NOT NULL CHECK (status IN ('watching', 'planned', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, anime_id)
);

CREATE TABLE IF NOT EXISTS watch_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id text NOT NULL,
  episode_id text NOT NULL,
  episode_number integer NOT NULL,
  position_seconds numeric NOT NULL DEFAULT 0,
  duration_seconds numeric NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_library_user_updated ON library_entries (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_progress_user_updated ON watch_progress (user_id, updated_at DESC);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_progress ENABLE ROW LEVEL SECURITY;

-- profiles: owner-only access
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- library_entries: owner-only access
DROP POLICY IF EXISTS "select_own_library" ON library_entries;
CREATE POLICY "select_own_library" ON library_entries FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_library" ON library_entries;
CREATE POLICY "insert_own_library" ON library_entries FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_library" ON library_entries;
CREATE POLICY "update_own_library" ON library_entries FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_library" ON library_entries;
CREATE POLICY "delete_own_library" ON library_entries FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- watch_progress: owner-only access
DROP POLICY IF EXISTS "select_own_progress" ON watch_progress;
CREATE POLICY "select_own_progress" ON watch_progress FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_progress" ON watch_progress;
CREATE POLICY "insert_own_progress" ON watch_progress FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_progress" ON watch_progress;
CREATE POLICY "update_own_progress" ON watch_progress FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_progress" ON watch_progress;
CREATE POLICY "delete_own_progress" ON watch_progress FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_library_updated ON library_entries;
CREATE TRIGGER trg_library_updated BEFORE UPDATE ON library_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_progress_updated ON watch_progress;
CREATE TRIGGER trg_progress_updated BEFORE UPDATE ON watch_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_new_user_profile ON auth.users;
CREATE TRIGGER trg_new_user_profile AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
