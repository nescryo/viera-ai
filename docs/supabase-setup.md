# Supabase sign-in setup

Viera uses Supabase Auth only for GitHub and Google sign-in. Chat history and profile preferences stay on the device. No database tables are required. You can skip this setup and use **Continue as guest** instead.

## 1. Create a project and copy the keys

1. Create a project at https://supabase.com/dashboard.
2. Open the **Connect** button (or Project Settings → Data API) and copy the **Project URL**.
3. Open Project Settings → API Keys and copy the **publishable key** (`sb_publishable_...`). Never use a secret or `service_role` key. `VITE_` variables are inlined into the browser bundle.
4. Put both in `.env`:
   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   The URL must have no path, quotes, spaces, or trailing slash.
5. Restart `npm run dev`. Vite reads `.env` only at startup.

The database password is not used by Viera. Keep it out of `.env`.

## 2. Allow redirect URLs

In Supabase → Authentication → URL Configuration:

- Set **Site URL** to your production app URL (or `http://localhost:5173` for local use).
- Add `http://localhost:5173/**` and your production URL to **Redirect URLs**. Include the path if you host the app under a subpath.
- Any other origin that opens the app (another port, a LAN IP, a deployed domain) must be added here too. Otherwise login falls back to the Site URL.

## 3. Enable GitHub

1. In Supabase → Authentication → Sign In / Providers → GitHub, copy the callback URL (`https://YOUR_PROJECT.supabase.co/auth/v1/callback`).
2. In GitHub → Settings → Developer settings → OAuth Apps → New OAuth App, set:
   - Homepage URL: your app URL
   - Authorization callback URL: the Supabase callback URL from step 1
3. Copy the Client ID, then generate a Client Secret.
4. Paste both into the Supabase GitHub provider, turn on **Enable**, and save.

## 4. Enable Google

1. In Google Cloud Console → APIs & Services → Credentials, create an OAuth client ID of type **Web application**.
2. Configure the consent screen. While it is in Testing, add your account as a test user.
3. Add your app origin as an Authorized JavaScript origin.
4. Add the Supabase callback URL as an Authorized redirect URI.
5. Paste the Client ID and Client Secret into Supabase → Sign In / Providers → Google, turn on **Enable**, and save.

Client secrets belong in the Supabase dashboard only. Never put them in `.env` or the repo. Keep Email and any unused providers disabled.

## Notes

- Sharing the Project URL and publishable key with others is safe, but their sign-ups then appear in your project's user list and count against your quota. Keep real values out of `.env.example`.
- Existing Google profiles and history are not migrated to GitHub accounts.
- Supabase Free projects may be paused after a period of inactivity. Check the Supabase docs for the current policy.
