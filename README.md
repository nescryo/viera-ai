# Viera AI

Viera is an interactive web application that brings a Live2D anime character to life as a virtual companion directly inside your web browser. The bundled character is **DeepSeek-chan**, a free Live2D model by Kamiya Ryoko (see [Credits](#credits)).

You can chat with the character, listen to her voice (optionally dubbed in Japanese while the chat stays in your language), and watch her expressive facial animations and natural movements as she follows your cursor or finger.

Built with React 19, TypeScript, Vite, PixiJS, and the Live2D Cubism runtime.

---

## What Can It Do?

- **Lifelike Live2D Character**: The character moves naturally on your screen: breathing, blinking, body sway, eye saccades, and following your cursor or finger with her gaze and head movement.
- **Conversational AI**: Chat freely about any topic. The character responds warmly like a companion with an expressive and friendly personality. Bring your own AI provider (OpenRouter, DeepSeek, Groq, OpenAI, Google Gemini, LM Studio, Ollama, or any OpenAI-compatible endpoint).
- **Expressive Anime Voice**: Responses can be spoken out loud, complete with mouth movements synchronized to her speech. Pick a voice engine in Settings (see below), or let the browser's built-in speech be the fallback.
- **Japanese Dubbing Mode**: The character speaks in Japanese while the chat text stays in the language you are using.
- **Voice Input (Microphone)**: Speak directly to the character using your microphone without needing to type.
- **User Profiles & Chat History**: Sign in with your GitHub or Google account through Supabase Auth, or continue as a guest. Chat sessions are saved locally on your device, and you can customize your display name and avatar. Guests never touch Supabase.

---

## Getting Started

### Prerequisites
Before you begin, make sure you have the following installed on your computer:
1. **Node.js** (version 18 or higher)
2. A modern web browser (such as Google Chrome or Microsoft Edge)

### Installation Steps

1. **Install project dependencies**:
   ```bash
   npm install
   ```

2. **Set up configuration (optional)**:
   Sign-in with GitHub or Google needs a Supabase project. You can skip this and use **Continue as guest** on the login screen, where chats stay on your device and nothing is sent to Supabase.

   To enable sign-in, copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`. Use the **publishable key**, never a secret or `service_role` key. Then enable the GitHub and Google providers and allow your redirect URLs. See [docs/supabase-setup.md](docs/supabase-setup.md) for the full walkthrough.

   AI chat and voice API keys are entered later in the in-app Settings, not in `.env`. Restart Vite after changing `.env`.

3. **Start the application**:
   ```bash
   npm run dev
   ```
   Open your browser and visit `http://localhost:5173`.

---

## Settings

Open **Settings** inside the app to configure the AI and the voice. Your choices are saved in your browser (`localStorage`) and are not sent anywhere except the provider you configure.

- **AI provider**: choose a provider, enter your API key, and pick a model. Keys are not read from `.env`.
- **Voice mode**:
  - *Follow chat*: speaks in the same language as the reply.
  - *Japanese Dubbing*: always speaks with the Japanese voice.
- **Voice engine** (for each mode):
  - *Fish Audio*: cloud voice with voice cloning (needs a Fish Audio API key).
  - *OpenAI / OpenRouter*: any OpenAI-compatible `/v1/audio/speech` endpoint.
  - *Edge / Web Speech*: free, no API key. Uses the local voice server below when it is running, otherwise your browser's built-in speech.

---

## Optional: Local Voice Server

If you want to run a local anime voice server on your own computer without extra cost:

1. Install the required Python voice module:
   ```bash
   pip install edge-tts
   ```

2. Start the local voice bridge:
   ```bash
   python3 vits_server.py
   ```
   The server listens on `http://localhost:5000`. In **Settings**, choose **Edge / Web Speech** as the voice engine so Viera uses it.

---

## Controls & Interaction Guide

| Action | How to Interact | Character Response |
| :--- | :--- | :--- |
| **Move Mouse / Finger** | Move your cursor or drag your finger across the screen | The character's head and eyes follow it. |
| **Speak (Microphone)** | Click the microphone icon in the chat bar | Your voice is transcribed into chat text. |
| **Replay Voice** | Click the speaker icon on any message | Replays the character's spoken voice for that message. |
| **Test Expression** | Open the **Test Expression** list in the top overlay and pick an emotion | The character shows that facial expression. |

---

## Available Commands

```bash
npm run dev        # Start the local development server
npm run build      # Type-check and build the project for production
npm run preview    # Preview the production build locally
npm run lint       # Lint the source code (oxlint)
npm test           # Run the unit tests (vitest)
npm run benchmark  # Run the persona benchmark (needs BENCHMARK_* in .env)
```

---

## Use on Mobile or Deploy

**Quick test on your phone (same WiFi):**
```bash
npm run dev -- --host
```
Open `http://<your-computer-IP>:5173` on the phone. If you use sign-in, add `http://<your-computer-IP>:5173/**` to the Supabase Redirect URLs. This is plain HTTP, so features that need a secure context (microphone, PWA install) may not work.

**Static hosting (Vercel, Netlify, Cloudflare Pages):**
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build environment variables on the host, then rebuild. They are inlined at build time.
- Add your domain (`https://your-domain/**`) to the Supabase Redirect URLs.
- Fish Audio requests go through a proxy built into the Vite dev server (`/fish_audio_api`). It works with `npm run dev` and `npm run preview`, but a static deployment has no such proxy, so Fish Audio will not work there. Other voice engines are not affected.
- The PWA precache is large (about 62 MB because of the model textures), so the first load on a phone is heavy.

---

## Troubleshooting

| Message | Cause and fix |
| :--- | :--- |
| `Sign-in isn't configured yet` | `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is empty, or Vite was not restarted after editing `.env`. |
| `No API key found in request` | `VITE_SUPABASE_URL` is malformed. Use exactly `https://YOUR_PROJECT.supabase.co`, with no path, quotes, or trailing slash. |
| `Unsupported provider: provider is not enabled` | Enable the provider in Supabase → Authentication → Sign In / Providers and save its Client ID and Secret. |
| Login returns to the wrong page or fails after redirect | The origin is missing from Supabase → Authentication → URL Configuration → Redirect URLs. |

---

## Credits

**Live2D model: DeepSeek-chan**

| Role | Credit |
| :--- | :--- |
| Illustration & PSD layer separation | Kamiya Ryoko |
| Live2D rigging | 霓虹猫_NeonNeko |
| Model release | Free model distributed by Kamiya Ryoko |

Creator links: [VGen](https://vgen.co/KAMIYA) and [X (Twitter)](https://x.com/kamiya_ryoko).

The model files are in `public/models/deepseek-chan/`, together with the creator's original terms of use.

## Disclaimer & License

- DeepSeek-chan is used under the creator's free-model terms of use (`public/models/deepseek-chan/`). Those terms allow personal use and content creation, and require credit to the creators. They prohibit reselling the model, re-uploading the complete model files for others to download, claiming the model as your own work, and brand or commercial use without the creator's prior approval. Read them before you fork, redistribute, or deploy this project.
- Heavily inspired by [AIRI (Moeru AI)](https://github.com/moeru-ai/airi)
- The source code of this project is released under the [MIT License](LICENSE). The MIT license covers the code only, not the model and texture assets.
