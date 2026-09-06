# Viera 3D

Viera is an interactive web application that brings a 3D anime character to life as a virtual companion directly inside your web browser. This project features the character **Firefly** from the game *Honkai: Star Rail*.

You can chat with Firefly, listen to her voice with translated text subtitles, watch her expressive facial animations and natural movements, and interact directly through screen touch or mouse clicks.

---

## What Can It Do?

- **Lifelike 3D Character**: The character moves naturally on your screen—breathing, blinking, and following your cursor or finger with her gaze and head movement.
- **Interactive Touch Reactions**: You can interact with the character using your mouse or touch screen:
  - Patting her head triggers sparkling effects and a cheerful, bashful reaction.
  - Touching her upper attire triggers shy or pouting reactions.
- **Conversational AI**: Chat freely about any topic. The character responds warmly like a companion with an expressive and friendly personality.
- **Expressive Anime Voice**: Responses can be spoken out loud with an anime voice style, complete with mouth movements synchronized to her speech.
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
   Open the `.env` file in any text editor and enter the API keys you wish to use (such as your DeepSeek API key for AI chat and Google Client ID for user sign-in).

3. **Start the application**:
   ```bash
   npm run dev
   ```
   Open your browser and visit `http://localhost:5173`.

---

## Optional: Local Voice Server

By default, the application can use voice synthesis through your browser or cloud services. If you want to run a local anime voice server on your own computer without extra cost:

1. Install the required Python voice module:
   ```bash
   pip install edge-tts
   ```

2. Start the local voice bridge:
   ```bash
   python3 vits_server.py
   ```
   The voice server will run in the background and connect automatically to Viera.

---

## Controls & Interaction Guide

| Action | How to Interact | Character Response |
| :--- | :--- | :--- |
| **Move Mouse** | Move your cursor across the screen | The character's head and eyes follow your cursor. |
| **Head Pat** | Click the head or hair area | The character tilts her head, smiles warmly, and speaks cheerfully. |
| **Upper Attire Touch** | Click the upper chest or clothing | The character reacts with shy or pouting expressions. |
| **Speak (Microphone)** | Click the microphone icon in the chat bar | Your voice is transcribed into chat text. |
| **Replay Voice** | Click the speaker icon on any message | Replays the character's spoken voice for that message. |

---

## Available Commands

```bash
npm run dev       # Start the local development server
npm run build     # Build the project for production
npm run preview   # Preview the production build locally
```

---

## Disclaimer & License

- The 3D character **Firefly** and *Honkai: Star Rail* are trademarks and intellectual property of **miHoYo / HoYoverse**. All related character assets are used strictly under non-commercial fan-creation fair use guidelines.
- The source code of this project is released under the [MIT License](LICENSE).
