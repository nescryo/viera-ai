# Supabase sign-in & cloud sync setup

Supabase is **optional** in Viera. You can skip this entire guide and use **Continue as guest** on the sign-in screen—chats and preferences stay on your device and nothing is sent to Supabase.

When Supabase is configured, **Email & Password** sign-in works with no OAuth secrets required. **GitHub** and **Google** OAuth are also optional; the sign-in modal automatically shows only the providers enabled on your Supabase instance.

Chat history and profile preferences stay on your device by default. Signed-in users can optionally enable **Settings → Chat → Sync chats to the cloud**.

---

## Option A: Local Supabase with Docker (recommended after `git clone`)

This runs a full local Supabase stack (Auth + Postgres + Studio) on your machine using [supabase/config.toml](../supabase/config.toml) and automatically applies the chat sync migration in [supabase/migrations/20261124000000_create_chat_sessions.sql](../supabase/migrations/20261124000000_create_chat_sessions.sql).

### 1. Start local Supabase

Make sure **Docker** is installed and running, then run:

```bash
npx supabase start
```

*(If you have the Supabase CLI installed globally, you can run `supabase start` instead.)*

The first start pulls the local Supabase Docker images and applies all migrations automatically.

### 2. Copy the local URL and key into `.env`

From the `supabase start` output (or anytime via `npx supabase status`), copy the **Project URL** (`http://127.0.0.1:54321`) and **Publishable key** (shown as `Publishable` or `anon key` depending on CLI version) into `.env`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Restart `npm run dev` (Vite reads `.env` only at startup).

### 3. Sign up with email & password

Local `supabase/config.toml` enables **Email & Password** with `enable_confirmations = false`, so creating an account signs you in immediately without needing email delivery or OAuth apps.

Useful local tools while Supabase is running:
- **Supabase Studio**: `http://127.0.0.1:54323`
- **Mailpit** (local inbox if you enable email confirmations): `http://127.0.0.1:54324`
- **Stop containers**: `npx supabase stop`
- **Reset local DB & re-apply migrations**: `npx supabase db reset`

### 4. Optional: Enable GitHub or Google OAuth locally

If you also want to test GitHub or Google sign-in against local Docker:

1. Create an OAuth app in GitHub or Google Cloud Console (see the OAuth steps in Option B below) and set its callback / redirect URI to:
   ```
   http://127.0.0.1:54321/auth/v1/callback
   ```
2. Add the credentials to `.env` **without** the `VITE_` prefix (so Vite never bundles them into the browser):
   ```env
   SUPABASE_AUTH_GITHUB_CLIENT_ID=...
   SUPABASE_AUTH_GITHUB_SECRET=...
   # and/or
   SUPABASE_AUTH_GOOGLE_CLIENT_ID=...
   SUPABASE_AUTH_GOOGLE_SECRET=...
   ```
3. Uncomment the matching `[auth.external.github]` and/or `[auth.external.google]` block in [supabase/config.toml](../supabase/config.toml).
   > Keep unused OAuth blocks commented out: Supabase CLI evaluates `env(...)` expressions at startup even when `enabled = false`, so missing variables stop `supabase start`.
4. Restart local Supabase:
   ```bash
   npx supabase stop && npx supabase start
   ```

---

## Option B: Supabase Cloud (for deployment or multi-device sync)

### 1. Create a project and copy the keys

1. Create a project at https://supabase.com/dashboard.
2. Open **Connect** (or Project Settings → Data API) and copy the **Project URL**.
3. Open Project Settings → API Keys and copy the **publishable key** (`sb_publishable_...`). Never use a secret or `service_role` key—`VITE_` variables are inlined into the browser bundle.
4. Put both in `.env`:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   The URL must have no path, quotes, spaces, or trailing slash.
5. Restart `npm run dev`.

The database password is not used by Viera. Keep it out of `.env`.

### 2. Allow redirect URLs

In Supabase → Authentication → URL Configuration:

- Set **Site URL** to your production app URL (or `http://localhost:5173` for local use).
- Add `http://localhost:5173/**` and your production URL to **Redirect URLs**. Include the path if you host the app under a subpath.
- Any other origin that opens the app (another port, a LAN IP, a deployed domain) must be added here too.

### 3. Email & Password

Supabase enables the **Email** provider by default (Authentication → Sign In / Providers → Email).

- If **Confirm email** is turned on (default in Cloud), new users receive a confirmation link before they can sign in. Note that Supabase Cloud's built-in SMTP is limited to 2 emails/hour and only sends to members of your Supabase organization; configure a **Custom SMTP** provider in Supabase if you expect outside users to sign up with email confirmation enabled.
- For personal use or quick testing without Custom SMTP, you can turn off **Confirm email** in the Email provider settings.

### 4. Optional: Enable GitHub OAuth

1. In Supabase → Authentication → Sign In / Providers → GitHub, copy the callback URL (`https://YOUR_PROJECT.supabase.co/auth/v1/callback`).
2. In GitHub → Settings → Developer settings → OAuth Apps → New OAuth App, set:
   - Homepage URL: your app URL
   - Authorization callback URL: the Supabase callback URL from step 1
3. Copy the Client ID, generate a Client Secret, paste both into Supabase, turn on **Enable**, and save.

### 5. Optional: Enable Google OAuth

1. In Google Cloud Console → APIs & Services → Credentials, create an OAuth client ID of type **Web application**.
2. Configure the consent screen. While it is in Testing, add your account as a test user.
3. Add your app origin as an Authorized JavaScript origin.
4. Add the Supabase callback URL as an Authorized redirect URI.
5. Paste the Client ID and Client Secret into Supabase → Sign In / Providers → Google, turn on **Enable**, and save.

Client secrets belong in the Supabase dashboard (or non-`VITE_` local env vars for Docker) only. Never put them in `VITE_` variables or commit them to the repo.

### 6. Optional: Cloud chat sync

If you want your chat sessions to sync across devices when signed in:

1. Apply the `public.chat_sessions` table and Row-Level Security policy using either:
   - Supabase CLI (`npx supabase link` then `npx supabase db push --remote`, or `npx supabase db push` on CLI v2), **or**
   - Supabase Dashboard → **SQL Editor**, running [docs/supabase-chat-sync.sql](supabase-chat-sync.sql).
2. Sign in to Viera, open **Settings → Chat**, and turn on **Sync chats to the cloud**.

API keys and profile preferences remain stored locally on each device and are never synced to Supabase.

---

## Notes

- Sharing the Project URL and publishable key with others is safe, but their sign-ups then appear in your project's user list and count against your quota. Keep real values out of `.env.example`.
- Existing Google profiles and history are not migrated to GitHub or email accounts.
- Supabase Free projects may be paused after a period of inactivity. Check the Supabase docs for the current policy.
