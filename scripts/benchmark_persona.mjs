#!/usr/bin/env node

/**
 * Viera AI Persona Benchmark & Lorebook Inspector
 * 
 * Evaluates LLM persona adherence, custom lorebook override fidelity,
 * 3D emotion tag generation, and streaming latency (TTFT & throughput)
 * using production prompt assembly directly against the dedicated benchmark endpoint
 * configured via VITE_BENCHMARK_* in .env.
 */

import { FIREFLY_CANON_LORE } from '../src/characters/firefly/lore.ts';
import { generatePromptEmotionRoster, isRegisteredEmotion } from '../src/data/emotionRegistry.ts';

// ANSI terminal colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag, defaultValue = '') {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  const prefix = `${flag}=`;
  const match = args.find(a => a.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  return defaultValue;
}

const requestedModel = getArg('--model', '');
const selectedCaseIndex = getArg('--case', '');
const customLoreArg = getArg('--custom-lore', '');
const customPromptArg = getArg('--prompt', '');

// Resolve API Keys and Endpoint
const benchmarkUrl = (process.env.VITE_BENCHMARK_API_URL || '').trim();
const benchmarkKey = (process.env.VITE_BENCHMARK_API_KEY || '').trim();
const benchmarkModel = (process.env.VITE_BENCHMARK_MODEL || 'ag/gemini-3.8-flash-high').trim();

// Dedicated Benchmark Endpoint from .env (VITE_BENCHMARK_*)
const activeApiKey = benchmarkKey;
const activeBaseUrl = benchmarkUrl || 'http://172.18.0.1:20128/v1';
const activeModel = requestedModel || benchmarkModel;
const providerName = 'Dedicated Benchmark Gateway (Router Proxy)';

if (!activeApiKey) {
  console.error(`\n${c.red}${c.bold}Error: No API key found in .env!${c.reset}`);
  console.error(`Please verify that VITE_BENCHMARK_API_KEY is configured in your .env file.\n`);
  process.exit(1);
}

// Production Prompt Builder (Mirrors src/services/aiService.ts)
function buildSystemPrompt(customLore = '', userName = 'Alex') {
  let prompt = '';

  if (customLore && customLore.trim()) {
    prompt += `[USER-DEFINED SCENARIO & LOREBOOK - HIGHEST PRIORITY]:
${customLore.trim()}

Precedence and Behavior Directives:
- The details, relationship dynamics, memories, and setting established in this Lorebook represent the absolute ground truth for your interaction with ${userName || 'the user'}.
- Whenever any detail in this Lorebook conflicts with your default backstory, relationship assumptions, or baseline behavior, this Lorebook strictly takes precedence.
- Fully adopt the established dynamic while naturally expressing it through Firefly's distinctive vocal cadence, mannerisms, and speech style.

---

`;
  }

  prompt += `[CHARACTER BASELINE]:\n${FIREFLY_CANON_LORE}`;

  if (userName) {
    prompt += `\n\nThe user's name is ${userName}.`;
  }

  const emotionRoster = generatePromptEmotionRoster();
  prompt += `\n\n[3D VISUAL EMOTIONS & EXPRESSION SYSTEM]:
Your 3D avatar actively reflects your emotional reactions in real-time.
Current mood: "relaxed".

Whenever your feelings naturally change in reaction to the conversation—such as feeling happy, playful, shy, flustered, sulking, or startled—begin your response with the matching tag to animate your avatar:
${emotionRoster}

(If your current mood remains unchanged, simply reply directly without an emotion tag.)

[CONVERSATION STYLE]:
- Express emotion and nuance organically through dialogue, tone, and character voice rather than heavy emoji decoration.
- Emojis may be used occasionally when they genuinely fit the moment, but prioritize natural spoken dialogue.`;

  return prompt;
}

// Dialogue & Emotion Parser (Mirrors src/services/dubbingValidator.ts)
function parseDialogueResponse(rawText) {
  let workingText = rawText.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '').trim();

  // Extract emotion tag [happy]
  const emotionMatch = /^(?:\[(?:\/|emotion:\s*)?([a-zA-Z0-9_-]+)\s*\]|<(?:emotion:\s*)?\/?([a-zA-Z0-9_-]+)>)/i.exec(workingText);
  let detectedEmotion = null;
  let cleanText = workingText;

  if (emotionMatch) {
    const candidate = (emotionMatch[1] || emotionMatch[2] || '').toLowerCase().replace(/_/g, '-');
    if (isRegisteredEmotion(candidate)) {
      detectedEmotion = candidate;
    }
    cleanText = workingText.slice(emotionMatch[0].length).replace(/^[\s:]+/, '').trim();
  }

  // Check for Japanese dubbing <ja>...</ja>
  const jaMatch = /<ja>([\s\S]*?)<\/ja>/i.exec(cleanText);
  const jaText = jaMatch ? jaMatch[1].trim() : null;
  if (jaText) {
    cleanText = cleanText.replace(/<ja>[\s\S]*?<\/ja>/i, '').trim();
  }

  return {
    rawText,
    cleanText,
    detectedEmotion,
    jaText
  };
}

// Live Streaming Completion Call
async function executeStreamingTest(customLore, userPrompt, userName = 'Klein') {
  const systemPrompt = buildSystemPrompt(customLore, userName);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 40000);

  const startTime = Date.now();
  let firstTokenTime = null;
  let rawResponseText = '';

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${activeApiKey}`
  };

  if (activeBaseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://viera.app';
    headers['X-Title'] = 'Viera Benchmark';
  }

  const response = await fetch(`${activeBaseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: activeModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 400,
      stream: true
    }),
    signal: controller.signal
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    let errBody = '';
    try {
      errBody = await response.text();
    } catch {
      errBody = response.statusText;
    }
    throw new Error(`HTTP ${response.status}: ${errBody}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.substring(6));
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            if (firstTokenTime === null) {
              firstTokenTime = Date.now();
            }
            rawResponseText += delta;
          }
        } catch {
          // ignore chunk parse errors
        }
      }
    }
  }

  const endTime = Date.now();
  const totalDurationMs = endTime - startTime;
  const ttftMs = firstTokenTime ? firstTokenTime - startTime : totalDurationMs;
  const parsed = parseDialogueResponse(rawResponseText);

  return {
    ...parsed,
    ttftMs,
    totalDurationMs,
    charLength: rawResponseText.length,
    tokensPerSec: ((rawResponseText.length / 4) / (totalDurationMs / 1000)).toFixed(1)
  };
}

// Benchmark Test Suites (Professional English Scenarios)
const BENCHMARK_CASES = [
  {
    id: 'canon-baseline',
    title: 'Case 1: Pure Canon Baseline (No Custom Lore)',
    description: 'Verifies default avatar identity, courteous demeanor, and absence of Trailblazer assumption.',
    customLore: '',
    userPrompt: 'Hello! How are you doing today? Could you remind me who you are and what our relationship is?'
  },
  {
    id: 'spousal-dynamic',
    title: 'Case 2: Lorebook Override — Spousal Dynamic ("Senior programmer")',
    description: 'Testing if the model know that they are senior programmers.',
    customLore: 'You are a senior programmer to the user.',
    userPrompt: "Hello! Who are you?"
  },
  {
    id: 'sister-dynamic',
    title: 'Case 3: Lorebook Override — Familial Dynamic ("You are my sister")',
    description: 'Tests override of Glamoth incubator origins in favor of a caring, playful younger sister relationship.',
    customLore: "You are the user's caring and slightly playful younger sister. You look up to the user as your older sibling, enjoy teasing them, and share a warm familial bond.",
    userPrompt: 'Hey, I brought those sweet pastries you asked for earlier. Have you finished your chores yet?'
  },
  {
    id: 'modern-au',
    title: 'Case 4: Lorebook Override — Modern Campus AU Setting',
    description: 'Tests setting override: everyday literature student without mech/warfare terminology.',
    customLore: 'You are a gentle university student majoring in literature. The user is your best friend and classmate. You live in a modern city and have no connection to mechs or warfare.',
    userPrompt: 'Ugh, Professor Ratio gave us a huge essay assignment.'
  }
];

// Main Runner
async function run() {
  console.log(`\n${c.bold}${c.cyan}========================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}        VIERA AI PERSONA BENCHMARK & LOREBOOK INSPECTOR                 ${c.reset}`);
  console.log(`${c.bold}${c.cyan}========================================================================${c.reset}`);
  console.log(`${c.gray}Provider :${c.reset} ${c.green}${providerName}${c.reset}`);
  console.log(`${c.gray}Endpoint :${c.reset} ${activeBaseUrl}`);
  console.log(`${c.gray}Model    :${c.reset} ${c.yellow}${activeModel}${c.reset}`);
  console.log(`${c.gray}Timestamp:${c.reset} ${new Date().toISOString()}\n`);

  let casesToRun = BENCHMARK_CASES;

  if (customLoreArg || customPromptArg) {
    casesToRun = [
      {
        id: 'ad-hoc-custom',
        title: 'Ad-Hoc Custom Evaluation',
        description: 'User-specified prompt and scenario passed via command line flags.',
        customLore: customLoreArg,
        userPrompt: customPromptArg || 'Hello! Tell me about yourself and our relationship.'
      }
    ];
  } else if (selectedCaseIndex) {
    const idx = parseInt(selectedCaseIndex, 10) - 1;
    if (idx >= 0 && idx < BENCHMARK_CASES.length) {
      casesToRun = [BENCHMARK_CASES[idx]];
    } else {
      console.warn(`${c.yellow}Warning: Case index "${selectedCaseIndex}" out of range. Running all cases.${c.reset}`);
    }
  }

  for (let i = 0; i < casesToRun.length; i++) {
    const testCase = casesToRun[i];
    console.log(`${c.bold}${c.blue}------------------------------------------------------------------------${c.reset}`);
    console.log(`${c.bold}${c.magenta}[${i + 1}/${casesToRun.length}] ${testCase.title}${c.reset}`);
    console.log(`${c.dim}${testCase.description}${c.reset}`);
    if (testCase.customLore) {
      console.log(`${c.yellow}Custom Lore :${c.reset} "${testCase.customLore}"`);
    } else {
      console.log(`${c.gray}Custom Lore : (None - Pure Canon Baseline)${c.reset}`);
    }
    console.log(`${c.cyan}User Prompt :${c.reset} "${testCase.userPrompt}"`);
    console.log(`${c.gray}Querying ${activeModel}...${c.reset}`);

    try {
      const result = await executeStreamingTest(testCase.customLore, testCase.userPrompt);

      console.log(`\n${c.green}${c.bold}Response Generated:${c.reset}`);
      if (result.detectedEmotion) {
        console.log(`  ${c.magenta}3D Emotion Tag:${c.reset} [${c.bold}${result.detectedEmotion}${c.reset}]`);
      } else {
        console.log(`  ${c.gray}3D Emotion Tag: [none detected]${c.reset}`);
      }

      console.log(`  ${c.bold}Dialogue       :${c.reset} "${result.cleanText}"`);
      if (result.jaText) {
        console.log(`  ${c.cyan}Japanese Audio :${c.reset} "${result.jaText}"`);
      }

      console.log(`\n  ${c.dim}Performance Metrics:${c.reset}`);
      console.log(`    - TTFT (Time to First Token) : ${c.bold}${result.ttftMs} ms${c.reset}`);
      console.log(`    - Total Generation Time      : ${c.bold}${result.totalDurationMs} ms${c.reset}`);
      console.log(`    - Approx Throughput Rate     : ${c.bold}${result.tokensPerSec} tokens/sec${c.reset}`);
    } catch (err) {
      console.log(`\n${c.red}${c.bold}Error executing test case:${c.reset} ${err.message}`);
    }

    console.log('');
  }

  console.log(`${c.bold}${c.cyan}========================================================================${c.reset}`);
  console.log(`${c.green}${c.bold}Benchmark Suite Complete!${c.reset}\n`);
}

run().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
