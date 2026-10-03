# Viera AI

Viera is an interactive web application that brings a 3D anime character to life as a virtual companion directly inside your web browser. This project features the character **Firefly** from the game *Honkai: Star Rail*.

You can chat with Firefly, listen to her voice (optionally dubbed in Japanese while the chat stays in your language), and watch her expressive facial animations and natural movements as she follows your cursor or finger.

---

## What Can It Do?

- **Lifelike 3D Character**: The character moves naturally on your screen—breathing, blinking, and following your cursor or finger with her gaze and head movement.
- **Conversational AI**: Chat freely about any topic. The character responds warmly like a companion with an expressive and friendly personality. Bring your own AI provider (OpenRouter, DeepSeek, Groq, OpenAI, Google Gemini, LM Studio, Ollama, or any OpenAI-compatible endpoint).
- **Expressive Anime Voice**: Responses can be spoken out loud, complete with mouth movements synchronized to her speech. Pick a voice engine in Settings (see below), or let the browser's built-in speech be the fallback.
- **Japanese Dubbing Mode**: Firefly speaks in Japanese while the chat text stays in the language you are using.
- **Voice Input (Microphone)**: Speak directly to the character using your microphone without needing to type.
- **User Profiles & Chat History**: Sign in with your Google account to save your chat sessions, customize your display name, and set your profile avatar.

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

2. **Set up configuration**:
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file in any text editor and enter your Google Client ID for user sign-in (`VITE_GOOGLE_CLIENT_ID`). AI chat and voice API keys are entered later in the in-app Settings.

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

> Note: Fish Audio requests go through a proxy built into the Vite dev server (`/fish_audio_api`). It works with `npm run dev` and `npm run preview`, but a plain static deployment has no such proxy.

---

## Disclaimer & License

- The 3D character and *Honkai: Star Rail* are trademarks and intellectual property of **miHoYo / HoYoverse**. The 3D model was edited by **流云景** and is used under its own terms: **no redistribution, no commercial use, and no adult, extreme, gore, or harassment content** (see `public/models/firefly/使用规则.txt`). Please respect these terms if you fork this project.
- Heavily inspired by [AIRI (Moeru AI)](https://github.com/moeru-ai/airi)
- The source code of this project is released under the [MIT License](LICENSE). The MIT license covers the code only, not the model and texture assets.
