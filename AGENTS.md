# AGENTS.md

Guidance for AI coding agents working on Viera. For end-user docs, see `README.md`.

## Project overview

Viera is a browser-based Live2D virtual companion (character: DeepSeek-chan, a free model by Kamiya Ryoko). It combines a Live2D (`.model3.json` / `.moc3`) character, an LLM chat, TTS with lip-sync, procedural idle/gaze animation, and Google sign-in with local chat history.

- Frontend only: React 19 + TypeScript + Vite 8, no backend of its own.
- Live2D: `pixi.js` 7 + `pixi-live2d-display-lipsyncpatch` (Cubism 4 build), with the Cubism Core runtime loaded by a `<script>` tag in `index.html`.
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
  avatar/                    Pure Live2D animation logic: breathing, idleSway, saccade, spring,
                             paramBlender, live2dMasks, renderQuality
  characters/                Character packages (registry.ts, types.ts, deepseek-chan/)
  components/live2d/         Scene.tsx (PixiJS stage and Live2D model)
  components/ui/             Chat overlay, header, modals (settings, login, profile, history, onboarding), toasts
  data/                      aiProviders.ts, emotionRegistry.ts
  hooks/                     useChatSessions, useSpeechAudio, useToasts
  services/                  aiService, authService, historyService, soundService, ttsService,
                             expressionValidator, dubbingValidator, and small helpers
  services/tts/              universalTtsEngine, ttsConfigResolver, ttsChunker, playbackQueue,
                             lipSyncSolver, lipsyncAnalyzer, ttsTypes
  types/                     Shared types (index.ts)
tests/                       Vitest tests (*.test.ts)
public/models/deepseek-chan/ Live2D model (moc3, model3.json, textures, motions, expressions) and its terms of use
scripts/                     benchmark_persona.mjs
reference/                   Third-party reference material (gitignored). Do not modify.
docs/                        Currently empty
```

### Key concepts

- Characters are `CharacterPackage`s (`src/characters/types.ts`): metadata, a system prompt, and `model` config (`.model3.json` URL, scale, anchor, parameter IDs, per-emotion parameter targets, `maskRenderTextures`). New characters are registered in `src/characters/registry.ts`.
- Animation is parameter-driven. `src/avatar/` holds pure functions (breathing, sway, saccades, springs, blending) that write Live2D parameters by ID. Parameter IDs come from the character config, not from hard-coded strings.
- Emotions and actions are defined in `src/data/emotionRegistry.ts`. The LLM output is parsed and validated by `expressionValidator.ts` and `dubbingValidator.ts`. Keep registry, prompt roster, and validators in sync.
- AI providers (OpenAI-compatible) are listed in `src/data/aiProviders.ts`. Add new providers there.
- TTS settings are resolved in `services/tts/ttsConfigResolver.ts`. Japanese text or `japanese-dub` mode selects the Japanese voice path, and Web Speech is the fallback.
- Fish Audio requests go through the Vite dev proxy `/fish_audio_api` (see `vite.config.ts`). The proxy is configured under `server.proxy`, so it only works with `npm run dev` (and `vite preview`, which inherits it by default). A static production deploy has no such proxy, so account for that when changing the TTS endpoints.
- PWA: `vite.config.ts` precaches the app shell plus the `deepseek-chan` model files (`moc3`, `json`, textures). Update its `globPatterns` / `globIgnores` when model assets change.

## Code style

- TypeScript with these `tsconfig.app.json` constraints: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (use `import type` for types), `erasableSyntaxOnly` (no `enum`, no namespaces, no parameter properties), `allowImportingTsExtensions`.
- ES modules only (`"type": "module"`).
- Function components with hooks. `react/rules-of-hooks` is an error, and `react/only-export-components` is a warning (keep non-component exports out of component files).
- Match the existing style: 2-space indent, single quotes, semicolons, JSDoc comments on exported functions.
- Put logic in `services/`, `avatar/`, or `hooks/`, not inside large components. `App.tsx`, `SettingsModal.tsx`, and `App.css` are already large, so prefer extracting over growing them.
- Styling is plain CSS (`src/App.css`, `src/index.css`). No CSS framework.

## Testing

- Tests live in `tests/` and are named `<module>.test.ts`. They cover the pure logic: TTS config, validators, lip-sync, and the `avatar/` animation functions, among others. Check `tests/` for the current list.
- Add or update tests for any change to parsing/validation/config-resolution logic and `avatar/` animation math (pure functions are easy to test). The PixiJS/Live2D rendering in `Scene.tsx` is not unit-tested.
- Run a single file with `npx vitest run tests/<name>.test.ts`.

## Environment and secrets

- `.env` is gitignored and holds real keys. Do not read, print, commit, or copy its values. Edit `.env.example` (placeholders only) when adding a new variable.
- Variables are listed in `.env.example`: `VITE_GOOGLE_CLIENT_ID`, plus `BENCHMARK_*` (no `VITE_` prefix, so it is never inlined into the client bundle) for the benchmark script. LLM and TTS API keys are not read from `.env`; they live in the Settings UI (`localStorage`).
- Anything prefixed `VITE_` is inlined into the client bundle and visible to users. Never put a secret in a `VITE_` variable that you would not ship to the browser, and never deploy a build made with personal keys.
- API keys entered through the Settings UI are user-provided. Do not log them or send them anywhere except the configured provider endpoint.
- Only `.github/workflows/gemini-review.yml` uses CI secrets (`GEMINI_API_KEY`). Do not change the workflow trigger or permissions without being asked.

## Assets and licensing

- DeepSeek-chan is a free Live2D model. Credits: illustration and PSD layer separation by Kamiya Ryoko, Live2D rigging by 霓虹猫_NeonNeko, released by Kamiya Ryoko. Keep these credits in `README.md`.
- The model's terms of use (`public/models/deepseek-chan/DeepSeek-chan  Free Live2D Model – Terms of Use & Setup Guide.txt`) allow personal use and content creation, and require credit. They prohibit reselling, re-uploading the complete model files for others to download, claiming the model as your own work, and brand or commercial use without the creator's approval. Do not do any of these, and flag it if a task would.
- Do not add, replace, or re-export model and texture files in `public/models/` unless asked. Do not duplicate them elsewhere.
- Do not modify or delete anything under `reference/` (third-party, GPL-licensed Blender-StellarToon).
- Project code is MIT (see `LICENSE`). The MIT license covers code only, not the model assets.

## Boundaries

Ask first before:
- Adding or upgrading dependencies (keep exact versions where possible, prefer well-known packages).
- Changing the Live2D model loading path (the Cubism Core script in `index.html`, `Scene.tsx` setup, mask handling in `live2dMasks.ts`) or the LLM output format (emotion/action/dual-language tags). These are tightly coupled.
- Changing the auth or chat-history storage logic (`authService.ts`, `historyService.ts`).

Never:
- Commit `.env`, `dist/`, `node_modules/`, or build artifacts.
- Push to `main` directly or create commits unless asked.
- Hard-code API keys or endpoints that contain credentials.

## Gotchas

- Node 18+ is required (the benchmark script uses `--experimental-strip-types` and `--env-file`, so use a recent Node release for that).
- `npm run build` runs `tsc -b` first, so type errors fail the build even if Vite would succeed.
- The Cubism Core runtime (`live2dcubismcore.min.js`) is loaded from the official Live2D CDN with `defer` in `index.html`. It must be present before the Live2D model loads, and it needs network access on first load.
- The model has 49 clipping masks, more than the default 36, so `maskRenderTextures` is set to 2 in `src/characters/deepseek-chan/config.ts`. Keep it when changing masks or the renderer.
- Model file names are Chinese (`大肥鱼.*`), so `modelUrl` is URL-encoded. Keep that encoding when editing it.
- The model textures are 4096px PNGs (about 44 MB), so the PWA precache is large (about 62 MB).
- `vits_server.py` uses only the Python standard library, but it shells out to the `edge-tts` executable. If the executable is missing, it logs a warning and returns no audio.
- `src/characters/deepseek-chan/lore.ts` exports `DEEPSEEK_CHAN_CANON_LORE`, which is empty for now. Only `scripts/benchmark_persona.mjs` imports it.
- The repository has many large binary assets. Avoid reading or diffing them.
