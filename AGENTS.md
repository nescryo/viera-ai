# AGENTS.md

Guidance for AI coding agents working on Viera 3D. For end-user docs, see `README.md`.

## Project overview

Viera is a browser-based 3D virtual companion (character: Firefly from *Honkai: Star Rail*). It combines a Three.js MMD (`.pmx`) character, an LLM chat, TTS with lip-sync, facial/idle/gaze animation, and Google sign-in with local chat history.

- Frontend only: React 19 + TypeScript + Vite 8, no backend of its own.
- 3D: `three`, `three-stdlib`, `mmd-parser` (PMX models, custom cel-shading).
- Lint: `oxlint`. Tests: `vitest`.
- Optional Python helper: `vits_server.py` (local TTS bridge).

## Commands

```bash
npm install        # install dependencies
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # tsc -b && vite build (type-check is part of build)
npm run lint       # oxlint
npm test           # vitest run (one-shot)
npm run preview    # preview the production build
npm run benchmark  # persona benchmark (node --experimental-strip-types, loads .env)
```

Before finishing a change, run `npm run lint`, `npm test`, and `npm run build`.

Optional local voice server (needs the `edge-tts` CLI in `PATH`):

```bash
pip install edge-tts
python3 vits_server.py   # serves GET http://localhost:5000/tts?text=...&character=...
```

## Project structure

```
src/
  App.tsx, main.tsx          App entry and top-level state wiring
  characters/                Character packages (registry.ts, types.ts, firefly/)
  components/3d/             Scene.tsx, animation/ (idle, facial, gaze), environment/ (stage, particles)
  components/ui/             Chat overlay, header, modals (settings, login, profile, history, onboarding), toasts
  data/                      aiProviders.ts, emotionRegistry.ts
  hooks/                     useChatSessions, useSpeechAudio, useToasts
  services/                  aiService, authService, historyService, soundService, ttsService,
                             expressionValidator, dubbingValidator
  services/tts/              universalTtsEngine, ttsConfigResolver, ttsChunker, playbackQueue, ttsTypes
  types/                     Shared types (index.ts)
tests/                       Vitest tests (*.test.ts)
public/models/               PMX models and textures (firefly, stages)
scripts/                     benchmark_persona.mjs, create_emotion_plane.py
reference/                   Third-party reference material (gitignored). Do not modify.
docs/                        Currently empty
```

### Key concepts

- Characters are `CharacterPackage`s (`src/characters/types.ts`): a `Persona` plus `model` config (PMX URL, scale, camera framing, stage) and `optimizeMaterials`. New characters are registered in `src/characters/registry.ts`.
- Emotions and actions are defined in `src/data/emotionRegistry.ts`. The LLM output is parsed and validated by `expressionValidator.ts` and `dubbingValidator.ts`. Keep registry, prompt roster, and validators in sync.
- AI providers (OpenAI-compatible) are listed in `src/data/aiProviders.ts`. Add new providers there.
- TTS settings are resolved in `services/tts/ttsConfigResolver.ts`. Japanese text or `japanese-dub` mode selects the Japanese voice path, and Web Speech is the fallback.
- Fish Audio requests go through the Vite dev proxy `/fish_audio_api` (see `vite.config.ts`). The proxy is configured under `server.proxy`, so it only works with `npm run dev` (and `vite preview`, which inherits it by default). A static production deploy has no such proxy, so account for that when changing the TTS endpoints.

## Code style

- TypeScript with these `tsconfig.app.json` constraints: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (use `import type` for types), `erasableSyntaxOnly` (no `enum`, no namespaces, no parameter properties), `allowImportingTsExtensions`.
- ES modules only (`"type": "module"`).
- Function components with hooks. `react/rules-of-hooks` is an error, and `react/only-export-components` is a warning (keep non-component exports out of component files).
- Match the existing style: 2-space indent, single quotes, semicolons, JSDoc comments on exported functions.
- Put logic in `services/` or `hooks/`, not inside large components. `App.tsx`, `SettingsModal.tsx`, and `App.css` are already large, so prefer extracting over growing them.
- Styling is plain CSS (`src/App.css`, `src/index.css`). No CSS framework.

## Testing

- Tests live in `tests/` and are named `<module>.test.ts`. Currently covered: `ttsConfigResolver`, `narrativeSanitizer`, `expressionValidator`, `dubbingValidator`.
- Add or update tests for any change to parsing/validation/config-resolution logic (pure functions are easy to test). 3D rendering code is not unit-tested.
- Run a single file with `npx vitest run tests/<name>.test.ts`.

## Environment and secrets

- `.env` is gitignored and holds real keys. Do not read, print, commit, or copy its values. Edit `.env.example` (placeholders only) when adding a new variable.
- Variables are listed in `.env.example`: `VITE_GOOGLE_CLIENT_ID`, plus `VITE_BENCHMARK_*` for the benchmark script. LLM and TTS API keys are not read from `.env`; they live in the Settings UI (`localStorage`).
- Anything prefixed `VITE_` is inlined into the client bundle and visible to users. Never put a secret in a `VITE_` variable that you would not ship to the browser, and never deploy a build made with personal keys.
- API keys entered through the Settings UI are user-provided. Do not log them or send them anywhere except the configured provider endpoint.
- Only `.github/workflows/gemini-review.yml` uses CI secrets (`GEMINI_API_KEY`). Do not change the workflow trigger or permissions without being asked.

## Assets and licensing

- Firefly and *Honkai: Star Rail* belong to miHoYo / HoYoverse. The PMX model's own usage rules (`public/models/firefly/使用规则.txt`) say: no redistribution, no commercial use, no adult/extreme/gore/harassment content, and modification is allowed.
- Do not add, replace, or re-export model and texture files in `public/models/` unless asked. Do not duplicate them elsewhere.
- Do not modify or delete anything under `reference/` (third-party, GPL-licensed Blender-StellarToon).
- Project code is MIT (see `LICENSE`).

## Boundaries

Ask first before:
- Adding or upgrading dependencies (keep exact versions where possible, prefer well-known packages).
- Changing the PMX model loading path, shader/material pipeline, or the LLM output format (emotion/action/dual-language tags). These are tightly coupled.
- Changing the auth or chat-history storage logic (`authService.ts`, `historyService.ts`).

Never:
- Commit `.env`, `dist/`, `node_modules/`, or build artifacts.
- Push to `main` directly or create commits unless asked.
- Hard-code API keys or endpoints that contain credentials.

## Gotchas

- Node 18+ is required (the benchmark script uses `--experimental-strip-types` and `--env-file`, so use a recent Node release for that).
- `npm run build` runs `tsc -b` first, so type errors fail the build even if Vite would succeed.
- `vits_server.py` uses only the Python standard library, but it shells out to the `edge-tts` executable. If the executable is missing, it logs a warning and returns no audio.
- The `firefly` model folder contains two identical-size `.pmx` files (`firefly.pmx` and a Chinese-named original). The app loads the path set in `src/characters/firefly/config.ts`. Confirm there before touching either one.
- The repository has many large binary assets. Avoid reading or diffing them.
