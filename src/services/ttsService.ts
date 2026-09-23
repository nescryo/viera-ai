import type { Persona, ApiConfig } from '../types';

export interface TTSBoundaryEvent {
  name: string;
  charIndex: number;
  charLength?: number;
  word?: string;
}

class TTSService {
  private synth: SpeechSynthesis | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
    }
  }

  private currentBufferSource: AudioBufferSourceNode | null = null;
  private currentSpeechSessionId: number = 0;

  // Point 4: Web Audio API AudioContext & Acoustic Polish Methods
  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private createImpulseResponse(ctx: AudioContext, duration: number = 0.22, decay: number = 2.2): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      const dec = Math.pow(n / length, decay);
      left[i] = (Math.random() * 2 - 1) * dec * 0.12;
      right[i] = (Math.random() * 2 - 1) * dec * 0.12;
    }
    return impulse;
  }

  // Sample-exact RAM playback via AudioBufferSourceNode (Zero latency & Zero initial clipping)
  private async playProcessedArrayBuffer(
    arrayBuffer: ArrayBuffer,
    onStart?: () => void,
    onEnd?: () => void,
    onErrorFallback?: () => void
  ) {
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Decode PCM WAV bytes directly in RAM
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Create sample-exact AudioBufferSourceNode
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      this.currentBufferSource = source;

      // 1. Equalizer for warm anime vocal tone (subtle low warmth, soft high cut)
      const lowEq = ctx.createBiquadFilter();
      lowEq.type = 'lowshelf';
      lowEq.frequency.value = 250;
      lowEq.gain.value = 2.2; // Gentle vocal warmth

      const highEq = ctx.createBiquadFilter();
      highEq.type = 'highshelf';
      highEq.frequency.value = 5500;
      highEq.gain.value = -1.8; // Soften harsh digital highs

      // 2. Soft Studio Reverb (Convolver Node)
      const convolver = ctx.createConvolver();
      convolver.buffer = this.createImpulseResponse(ctx, 0.22, 2.2);

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.10; // 10% subtle studio room reverb blend

      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.95;

      // Audio Graph routing:
      source.connect(lowEq);
      lowEq.connect(highEq);

      // Dry path (main voice)
      highEq.connect(dryGain);
      dryGain.connect(ctx.destination);

      // Wet path (studio acoustic room reverb)
      highEq.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(ctx.destination);

      source.onended = () => {
        this.currentBufferSource = null;
        if (onEnd) onEnd();
      };

      if (onStart) onStart();
      // Schedule playback 50ms in the hardware audio clock to guarantee 100% unmuted DAC startup!
      source.start(ctx.currentTime + 0.05);
    } catch (err) {
      console.warn("Web Audio API decode/play error, using fallback:", err);
      if (onErrorFallback) onErrorFallback();
    }
  }



  public prepareTextForSpeech(text: string): string {
    if (!text) return '';
    let result = text;
    // Extract <ja> tag content if present
    const jaMatch = /<ja>([\s\S]*?)<\/ja>/i.exec(text);
    if (jaMatch && jaMatch[1].trim()) {
      result = jaMatch[1].trim();
    }
    const cleaned = result
      .replace(/<[^>]+>/g, '')
      .replace(/\*.*?\*/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/[`#~_>]/g, '')
      .replace(/[\r\n]+/g, '、') // Replace newlines with Japanese comma so Fish Audio doesn't cut off mid-text!
      .replace(/\s+/g, ' ')
      .trim();

    return this.normalizeJapaneseSentenceFlow(cleaned);
  }

  public speak(
    text: string, 
    persona: Persona, 
    onStart?: () => void, 
    onEnd?: () => void,
    onBoundary?: (event: TTSBoundaryEvent) => void,
    apiConfig?: ApiConfig
  ) {
    this.stop();

    const targetText = this.prepareTextForSpeech(text);

    if (!targetText) {
      if (onEnd) onEnd();
      return;
    }

    const ttsProvider = apiConfig?.ttsProvider || 'fish-audio';

    if (ttsProvider === 'fish-audio') {
      this.speakFishAudio(targetText, persona, apiConfig, onStart, onEnd);
    } else if (ttsProvider === 'custom') {
      this.speakCustomTTS(targetText, persona, apiConfig, onStart, onEnd);
    } else if (ttsProvider === 'edge') {
      this.speakEdgeNeural(targetText, persona, onStart, onEnd, onBoundary);
    } else {
      this.speakWebSpeech(targetText, persona, onStart, onEnd, onBoundary);
    }
  }

  // Helper method for Point 2: Japanese Sentence Flow Normalization, Clause Breathing Punctuation & Dialogue Brackets
  private normalizeJapaneseSentenceFlow(jaText: string): string {
    let result = this.sanitizeHonorificsForTTS(jaText.trim());

    // 1. Normalize ASCII punctuation marks to authentic Japanese punctuation
    result = result
      .replace(/,/g, '、')
      .replace(/\./g, '。')
      .replace(/\?/g, '？')
      .replace(/!/g, '！');

    // 2. Convert Western quotes "..." to Japanese dialogue brackets 「...」
    result = result
      .replace(/"([^"]+)"/g, '「$1」')
      .replace(/'([^']+)'/g, '「$1」');

    // 3. Insert natural breathing pauses (Japanese comma 、) after clauses & conjunctions if unpunctuated
    result = result
      .replace(/(ので|から|けど|けれど|のに|だから|そして|それで|ですが|けれども|のですが)(?![、。！？…「」\s])/g, '$1、')
      .replace(/(ね|よ|わ)(?=[A-Z\u3040-\u30ff\u4e00-\u9fff])(?![、。！？…「」\s])/g, '$1、');

    // 4. Ensure non-empty Japanese text ends with proper punctuation for natural pitch cadence
    if (result && !/[。！？…「」]$/.test(result)) {
      result += '。';
    }

    return result;
  }

  public stop() {
    this.currentSpeechSessionId++;
    if (this.currentBufferSource) {
      try {
        this.currentBufferSource.onended = null;
        this.currentBufferSource.stop();
      } catch {
        // ignore if already stopped
      }
      this.currentBufferSource = null;
    }
    if (this.currentAudio) {
      this.currentAudio.onplay = null;
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (this.synth) {
      this.synth.cancel();
    }
  }

  // 1. Edge-TTS Neural Voice Engine with Dynamic Intonation Modulation
  private speakEdgeNeural(
    text: string,
    persona: Persona,
    onStart?: () => void,
    onEnd?: () => void,
    onBoundary?: (event: TTSBoundaryEvent) => void
  ) {
    if (!this.synth) {
      if (onEnd) onEnd();
      return;
    }

    // Insert expressive micro-pauses for natural intonation
    const expressiveText = text
      .replace(/(!|\?|\.|,)/g, '$1 ')
      .replace(/\s+/g, ' ');

    // Detect Japanese characters vs English/Indonesian
    const hasJapaneseChars = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);

    const utterance = new SpeechSynthesisUtterance(expressiveText);
    utterance.pitch = hasJapaneseChars ? 1.25 : 1.18; // Sweet anime pitch
    utterance.rate = 0.98;  // Gentle natural conversational speed
    utterance.lang = hasJapaneseChars ? 'ja-JP' : (persona.voice?.lang || 'en-US');

    const voices = this.synth.getVoices();
    if (voices.length > 0) {
      // Prioritize Sweet Female Neural Voices (Ana, Emma, Jenny, Aria, Samantha, Google US English)
      const sweetFemaleVoice = voices.find(v => 
        (v.name.includes('Ana') || v.name.includes('Emma') || v.name.includes('Jenny') || v.name.includes('Aria') || v.name.includes('Samantha') || v.name.includes('Google US English') || v.name.includes('Zira')) &&
        (hasJapaneseChars ? v.lang.startsWith('ja') : v.lang.startsWith('en'))
      ) || voices.find(v => 
        (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Google') || v.name.includes('Online')) &&
        (hasJapaneseChars ? v.lang.startsWith('ja') : v.lang.startsWith('en'))
      ) || voices.find(v => hasJapaneseChars ? v.lang.startsWith('ja') : v.lang.startsWith('en')) || voices[0];

      if (sweetFemaleVoice) {
        utterance.voice = sweetFemaleVoice;
      }
    }

    utterance.onstart = () => {
      if (onStart) onStart();
    };

    utterance.onboundary = (e: SpeechSynthesisEvent) => {
      if (onBoundary) {
        const spokenWord = text.substring(e.charIndex, e.charIndex + (e.charLength || 5));
        onBoundary({
          name: e.name || 'word',
          charIndex: e.charIndex,
          charLength: e.charLength,
          word: spokenWord
        });
      }
    };

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      if (onEnd) onEnd();
    };

    this.synth.speak(utterance);
  }

  public sanitizeHonorificsForTTS(text: string): string {
    if (!text) return text;
    return text
      .replace(/([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fff]+)-chan\b/gi, '$1ちゃん')
      .replace(/([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fff]+)-san\b/gi, '$1さん')
      .replace(/([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fff]+)-kun\b/gi, '$1くん')
      .replace(/([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fff]+)-sama\b/gi, '$1さま')
      .replace(/([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fff]+)\s+no\s+(?:san|San)\b/gi, '$1さん')
      .replace(/([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fff]+)\s+no\s+(?:chan|Chan)\b/gi, '$1ちゃん')
      .replace(/([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fff]+)\s+(?:san|San)\b/gi, '$1さん')
      .replace(/([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fff]+)\s+(?:chan|Chan)\b/gi, '$1ちゃん');
  }

  private async translateToJapanese(text: string): Promise<string> {
    let processedText = this.sanitizeHonorificsForTTS(text.trim());

    // 1. Clean English letter stutter prefixes & normalize clipped Japanese hesitation fillers (e.g. "えっと" -> "えーっとね、")
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(processedText)) {
      processedText = processedText
        .replace(/\b[wW][-–—\s]+(?=待っ|なに|何|やめ|いいえ|お願い|ごめん|バカ|バーカ)/g, 'ま、')
        .replace(/\b([a-zA-Z])[-–—\s]+(?=[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff])/g, 'っ、')
        .replace(/^えっと([….\s！]*)$/g, 'えーっとね、')
        .replace(/^あの([….\s！]*)$/g, 'あのね、');
      return processedText;
    }

    // 2. Preprocess English stuttering patterns & anime squeals into authentic Japanese Kana
    processedText = processedText
      .replace(/\bh[-–—\s]+hyaa?\b/gi, 'ひゃ、ひゃあぁー')
      .replace(/\bk[-–—\s]+kyaa?\b/gi, 'きゃ、きゃあぁー')
      .replace(/\bu[-–—\s]+uwaa?\b/gi, 'う、うわぁぁー')
      .replace(/\bf[-–—\s]+fuee?\b/gi, 'ふ、ふぇぇー')
      .replace(/\bi[-–—.\s]+i\b/gi, 'わ、私…')
      .replace(/\by[-–—.\s]+you\b/gi, 'あ、あんた')
      .replace(/\bm[-–—.\s]+me\b/gi, 'わ、私')
      .replace(/\bw[-–—\s]+wait\b/gi, 'ま、待って')
      .replace(/\bw[-–—\s]+what\b/gi, 'えっ、な、なに')
      .replace(/\bd[-–—\s]+don'?t\b/gi, 'や、やめて')
      .replace(/\bn[-–—\s]+no\b/gi, 'い、いいえ')
      .replace(/\bp[-–—\s]+please\b/gi, 'お、お願い')
      .replace(/\bs[-–—\s]+sorry\b/gi, 'ご、ごめんなさい')
      .replace(/\bb[-–—\s]+baka\b/gi, 'ば、バーカ')
      .replace(/\bh[-–—\s]+huh\b/gi, 'はっ、はぁ')
      .replace(/\be[-–—\s]+eh\b/gi, 'えっ、えーっ')
      .replace(/\ba[-–—\s]+ah\b/gi, 'あっ、あぁ');

    // If preprocessed text now contains Japanese Kana/Kanji, return immediately!
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(processedText)) {
      return processedText;
    }

    // 3. Normalize single-letter English stutters (e.g. "t- test" -> "test") so translation API doesn't get letter sound artifacts
    const cleanStutterText = processedText.replace(/\b([a-zA-Z])[-–—\s]+([a-zA-Z]{2,})\b/g, '$2');

    const lower = cleanStutterText.toLowerCase().replace(/^[,.!?\s]+|[,.!?\s]+$/g, '');

    // Fast Anime Roleplay Phrase Dictionary for authentic intimate voice dubbing
    const animeDict: Record<string, string> = {
      'hello there': 'やあ、こんにちは',
      'hello': 'こんにちは',
      'hi': 'やあ',
      'good morning': 'おはようございます',
      'good evening': 'こんばんは',
      'good night': 'おやすみなさい',
      'how are you feeling today': '今日の気分はいかがですか？',
      'how are you today': '今日は調子どうですか？',
      'how are you': 'お元気ですか？',
      'are you okay': '大丈夫ですか？',
      'are you alright': '大丈夫ですか？',
      'trailblazer': 'トレイルブレイザーさん',
      'thank you': 'ありがとうございます',
      'thank you so much': '本当にありがとうございます',
      'see you later': 'また後でね',
      'don\'t worry': '心配しないでね',
      'h- hyaa': 'ひゃ、ひゃあぁー？！',
      'h-hyaa': 'ひゃ、ひゃあぁー？！',
      'h- hyaa?': 'ひゃ、ひゃあぁー？！',
      'h-hyaa?': 'ひゃ、ひゃあぁー？！',
      'h- hyaa!': 'ひゃ、ひゃあぁー？！',
      'h-hyaa!': 'ひゃ、ひゃあぁー？！',
      'h- hyaa?!': 'ひゃ、ひゃあぁー？！',
      'h-hyaa?!': 'ひゃ、ひゃあぁー？！',
      'hyaa': 'ひゃあぁー！',
      'hyaa?': 'ひゃあぁー？！',
      'hyaa!': 'ひゃあぁー！',
      'hyaa?!': 'ひゃあぁー？！',
      'hya': 'ひゃあぁー！',
      'kyaa': 'きゃあぁー！',
      'kyaa!': 'きゃあぁー！',
      'kyaa?!': 'きゃ、きゃあぁー？！',
      'k-kyaa': 'きゃ、きゃあぁー？！',
      'k-kyaa?': 'きゃ、きゃあぁー？！',
      'k-kyaa!': 'きゃ、きゃあぁー？！',
      'k-kyaa?!': 'きゃ、きゃあぁー？！',
      'uwaa': 'うわぁぁー！',
      'uwaa!': 'うわぁぁー！',
      'uwaa?!': 'う、うわぁぁー？！',
      'fuee': 'ふぇぇー…',
      'fuee...': 'ふぇぇー…',
      'i- i': 'わ、私…',
      'i-i': 'わ、私…',
      'i- i...': 'わ、私…',
      'i-i...': 'わ、私…',
      'i... i...': 'わ、私…',
      'i... i': 'わ、私…',
      'i i': 'わ、私…',
      'etto': 'えーっとね、',
      'etto...': 'えーっとね、',
      'ettoo': 'えーっとね、',
      'ettoo...': 'えーっとね、',
      'eto': 'えーっとね、',
      'eto...': 'えーっとね、',
      'e-etto': 'えーっとね、',
      'ano': 'あのね、',
      'ano...': 'あのね、',
      'anoo': 'あのね、',
      'anoo...': 'あのね、',
      'e- eh': 'えっ、えーっ？',
      'e-eh': 'えっ、えーっ？',
      'e- eh?': 'えっ、えーっ？',
      'e-eh?': 'えっ、えーっ？',
      'eh': 'えー？',
      'eh?': 'えーっ？',
      'huh': 'えっ？',
      'huh?': 'えっ…？',
      'h-huh': 'はっ、はぁ…？',
      'h-huh?': 'はっ、はぁ…？',
      'what': 'えっ',
      'what?': 'えーっ？',
      'what-': 'えっ…',
      'wait': '待って',
      'wait-': '待って…',
      'umm': 'あのー…',
      'umm...': 'あのね…',
      'hm': 'んー…',
      'hmmm': 'ふーむ…',
      'ah': 'あっ',
      'ah!': 'あっ！',
      'oops': 'あっ…'
    };

    if (animeDict[lower]) {
      return animeDict[lower];
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanStutterText)}&langpair=en|ja`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data && data.responseData && data.responseData.translatedText) {
        const jaRes = data.responseData.translatedText;
        if (jaRes && !jaRes.includes('MYMEMORY WARNING')) {
          return jaRes;
        }
      }
    } catch (e) {
      console.warn("Auto EN->JA translation failed or timed out, using raw text:", e);
    }
    return cleanStutterText;
  }



  private detectEmotionFromText(text: string): 'tsundere' | 'sweet' | 'whisper' | 'sad' | 'joy' | 'shy' | 'blush-hardly' | 'teasing' | 'jealous' | 'terrified' | 'pouting' | 'relaxed' {
    const lower = text.toLowerCase();
    
    // Explicit action asterisks or explicit emotion tags
    if (/\[blush-hardly\]/i.test(text) || /\*(?:blushes hard|blushing hardly|flustered|crimson)\*/i.test(text) || /aku cinta kamu|i love you|marry me|cinta kamu/i.test(lower)) {
      return 'blush-hardly';
    }
    if (/\[terrified\]/i.test(text) || /\*(?:terrified|screams|trembles|scared)\*/i.test(text) || /hantu|takut|ghost|scary|seram/i.test(lower)) {
      return 'terrified';
    }
    if (/\[teasing\]|\[smug\]/i.test(text) || /\*(?:smirks|teases|winks|playful|smug|proud)\*/i.test(text) || /goda|tease|jahil|ehe|hebat|pintar|smart|pro/i.test(lower)) {
      return 'teasing';
    }
    if (/\[jealous\]/i.test(text) || /\*(?:jealous|glares jealous)\*/i.test(text) || /cewek lain|wanita lain|other girl/i.test(lower)) {
      return 'jealous';
    }
    if (/\[pouting\]/i.test(text) || /\*(?:pouts|puffs cheeks|sulking)\*/i.test(text) || /cemberut|pout|ngambek/i.test(lower)) {
      return 'pouting';
    }

    if (/\*(?:blushes|pouts|angry|tsundere|shouts|yells)\*/i.test(text) || /tsundere|baka|shut up|idiot|h-mph|hmph|don'?t get the wrong idea|marah|ばか|バーカ/i.test(lower)) {
      return 'tsundere';
    }
    if (/\*(?:whispers|berbisik|bisik)\*/i.test(text) || /\b(?:whispers|berbisik)\b/i.test(lower)) {
      return 'whisper';
    }
    if (/\*(?:cries|sobs|crying|sad)\*/i.test(text) || /cries|crying|sorry|gomen|sob|sedih|nangis|泣|かなしい/i.test(lower)) {
      return 'sad';
    }
    if (/\*(?:shy|flustered)\*/i.test(text) || /pemalu|malu|shy|flustered|blush/i.test(lower)) {
      return 'shy';
    }
    if (/\*(?:giggles|laughs|smiles|happy)\*/i.test(text) || /giggles|happy|love|sweet|yay|hehe|haha|senang|gembira|sayang|あまあま|甘い/i.test(lower)) {
      return 'sweet';
    }
    if (text.includes('!') || text.includes('！')) {
      return 'joy';
    }
    return 'relaxed';
  }

  // Universal Smart Auto-Detect Custom TTS (ElevenLabs, OpenAI, OpenRouter, Local/Custom Server)
  private async speakCustomTTS(
    text: string,
    persona: Persona,
    apiConfig?: ApiConfig,
    onStart?: () => void,
    onEnd?: () => void
  ) {
    const rawUrl = (apiConfig?.customTtsUrl || '').trim();
    if (!rawUrl) {
      console.warn("[Viera TTS] Custom TTS URL not configured. Falling back to Edge Neural.");
      this.speakEdgeNeural(text, persona, onStart, onEnd);
      return;
    }

    const apiKey = apiConfig?.customTtsApiKey?.trim() || '';
    const customModel = apiConfig?.customTtsModel?.trim() || '';
    const customVoice = apiConfig?.customTtsVoiceId?.trim() || '';

    try {
      const isElevenLabs = rawUrl.toLowerCase().includes('elevenlabs.io');
      const isOpenAI = rawUrl.toLowerCase().includes('openai.com') || rawUrl.toLowerCase().includes('openrouter.ai');

      let targetUrl = rawUrl;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      let body: string;

      if (isElevenLabs) {
        // Smart Auto-Detect for ElevenLabs:
        // Format: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
        const voiceId = customVoice || '21m00Tcm4TlvDq8ikWAM';
        if (!targetUrl.includes('/v1/text-to-speech/')) {
          targetUrl = `${targetUrl.replace(/\/+$/, '')}/v1/text-to-speech/${voiceId}`;
        }
        if (apiKey) {
          headers['xi-api-key'] = apiKey;
        }
        body = JSON.stringify({
          text,
          model_id: customModel || 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        });
      } else if (isOpenAI) {
        // Smart Auto-Detect for OpenAI / OpenRouter:
        // Format: POST /v1/audio/speech
        if (targetUrl.endsWith('.com') || targetUrl.endsWith('.ai') || targetUrl.endsWith('.com/') || targetUrl.endsWith('.ai/')) {
          targetUrl = `${targetUrl.replace(/\/+$/, '')}/v1/audio/speech`;
        }
        if (apiKey) {
          headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        }
        body = JSON.stringify({
          model: customModel || 'tts-1',
          input: text,
          voice: customVoice || 'nova',
          response_format: 'mp3'
        });
      } else {
        // Universal Custom Server (OpenAI-compatible + Simple { text, input } dual payload):
        if (apiKey) {
          headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
          headers['x-api-key'] = apiKey;
        }
        body = JSON.stringify({
          input: text,
          text: text,
          model: customModel || 'tts-1',
          voice: customVoice || 'default',
          response_format: 'mp3'
        });
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        throw new Error(`Custom TTS HTTP status ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      await this.playProcessedArrayBuffer(
        arrayBuffer,
        onStart,
        onEnd,
        () => this.speakEdgeNeural(text, persona, onStart, onEnd)
      );
    } catch (err) {
      console.warn("[Viera TTS] Custom TTS request failed, falling back to Edge Neural:", err);
      this.speakEdgeNeural(text, persona, onStart, onEnd);
    }
  }

  // Fish Audio S2.1 Pro TTS Integration (Zero-Shot Multilingual Voice Cloning)
  private async speakFishAudio(
    text: string,
    persona: Persona,
    apiConfig?: ApiConfig,
    onStart?: () => void,
    onEnd?: () => void
  ) {
    const currentSessionId = ++this.currentSpeechSessionId;
    const apiKey = apiConfig?.fishAudioApiKey || apiConfig?.openRouterApiKey;
    let refId = apiConfig?.fishAudioReferenceId || '';
    const dummyIds = [
      '7f92f8afb8ec43bf81429cc1c9199cb1',
      'a31d904791884392945d8b8849b29141',
      'd86289b43e624c9eb4ef6fb34c679234',
      'b1424683f124403fa8572183c5e88411',
      'custom'
    ];
    if (!refId.trim() || dummyIds.includes(refId.trim())) {
      refId = '';
    }

    if (!apiKey) {
      console.warn("[Viera TTS Warning] Fish Audio requires an API Key (Fish Audio API Key or OpenRouter API Key in Settings). Falling back to Edge Neural.");
      this.speakEdgeNeural(text, persona, onStart, onEnd);
      return;
    }

    try {
      // Use exact Japanese text prepared from LLM output (flattened, no newlines causing truncation)
      const jaText = this.prepareTextForSpeech(text);
      if (currentSessionId !== this.currentSpeechSessionId) return;

      // Ironclad Language Guardrail: Ensure text sent to Fish Audio is ALWAYS valid Japanese so Firefly's Fish Audio voice is ALWAYS preserved!
      let validJaText = jaText;
      const hasJapaneseChars = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(jaText);
      if (!hasJapaneseChars) {
        console.warn("[Viera TTS Guardrail] Text contains no Japanese Kana/Kanji. Auto-converting to Japanese so Firefly's Fish Audio voice stays active:", text);
        validJaText = await this.translateToJapanese(jaText);
        if (currentSessionId !== this.currentSpeechSessionId) return;
      }

      const emotion = this.detectEmotionFromText(text);
      let synthText = validJaText;
      if (emotion === 'whisper') {
        synthText = `[whisper] ${jaText}`;
      } else if (emotion === 'tsundere' || emotion === 'teasing') {
        synthText = `[excited] ${jaText}`;
      }

      // Check if accessing via OpenRouter or Direct Fish Audio API (via Vite proxy to bypass CORS)
      const isOpenRouter = !apiConfig?.fishAudioApiKey && !!apiConfig?.openRouterApiKey;
      const endpoint = isOpenRouter
        ? 'https://openrouter.ai/api/v1/audio/speech'
        : '/fish_audio_api/v1/tts';

      const selectedModel = apiConfig?.fishAudioModel || 's2.1-pro-free';
      // Clean model name for Fish Audio header (e.g. 's2.1-pro-free' or 's2.1-pro')
      const headerModel = selectedModel.replace(/^fish-audio\//, '');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'model': headerModel
      };

      const payload: Record<string, any> = isOpenRouter
        ? {
            model: selectedModel.startsWith('fish-audio/') ? selectedModel : `fish-audio/${selectedModel}`,
            input: synthText,
            voice: refId || undefined
          }
        : {
            text: synthText,
            format: 'mp3',
            latency: 'normal',
            normalize: true
          };

      if (!isOpenRouter && refId) {
        payload.reference_id = refId;
      }

      console.log(`[Viera TTS Log] Sending Fish Audio request to ${endpoint} (Header Model: ${headerModel}, Voice Ref: ${refId || 'default'})...`);

      let response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (currentSessionId !== this.currentSpeechSessionId) return;

      // Retry 1: If 400 Bad Request (Reference not found), retry without reference_id using default system voice!
      if (!response.ok && response.status === 400) {
        console.warn("[Viera TTS Warning] Reference ID not found on Fish Audio. Retrying with Fish Audio default system voice...");
        delete payload.reference_id;
        delete payload.voice;
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }

      // Retry 2: If direct Fish Audio API returns 401 (Invalid Token) or 402 (Insufficient Credit) and OpenRouter key is available, retry via OpenRouter!
      if (!response.ok && (response.status === 401 || response.status === 402) && apiConfig?.openRouterApiKey && !isOpenRouter) {
        console.warn(`[Viera TTS Warning] Fish Audio direct API returned status ${response.status}. Retrying automatically via OpenRouter Gateway...`);
        const openRouterEndpoint = 'https://openrouter.ai/api/v1/audio/speech';
        const openRouterHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.openRouterApiKey}`
        };
        const openRouterPayload = {
          model: selectedModel.startsWith('fish-audio/') ? selectedModel : `fish-audio/${selectedModel}`,
          input: synthText
        };

        response = await fetch(openRouterEndpoint, {
          method: 'POST',
          headers: openRouterHeaders,
          body: JSON.stringify(openRouterPayload)
        });
      }

      if (currentSessionId !== this.currentSpeechSessionId) return;

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error(`[Viera TTS Error] Fish Audio returned status ${response.status}:`, errText);
        throw new Error(`Fish Audio API returned status ${response.status}: ${errText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const jsonBody = await response.json().catch(() => ({}));
        console.error("[Viera TTS Error] Fish Audio endpoint returned JSON error instead of audio bytes:", jsonBody);
        throw new Error(`Fish Audio API returned JSON response: ${JSON.stringify(jsonBody)}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      if (currentSessionId !== this.currentSpeechSessionId) return;

      // Play via Web Audio API Acoustic Polish & Lip Sync Analyser
      await this.playProcessedArrayBuffer(
        arrayBuffer,
        () => {
          if (currentSessionId !== this.currentSpeechSessionId) return;
          if (onStart) onStart();
        },
        () => {
          if (currentSessionId !== this.currentSpeechSessionId) return;
          if (onEnd) onEnd();
        },
        () => this.speakEdgeNeural(text, persona, onStart, onEnd)
      );
    } catch (err: any) {
      if (currentSessionId !== this.currentSpeechSessionId) return;
      console.warn("[Viera TTS Warning] Fish Audio fetch failed, falling back to Edge Neural Voice. Reason:", err?.message || err);
      this.speakEdgeNeural(text, persona, onStart, onEnd);
    }
  }

  // 3. Fallback Web Speech Synthesis
  private speakWebSpeech(
    text: string,
    persona: Persona,
    onStart?: () => void,
    onEnd?: () => void,
    onBoundary?: (event: TTSBoundaryEvent) => void
  ) {
    this.speakEdgeNeural(text, persona, onStart, onEnd, onBoundary);
  }

  public isSpeaking(): boolean {
    const isSynthSpeaking = this.synth ? this.synth.speaking : false;
    const isAudioPlaying = this.currentAudio ? !this.currentAudio.paused : false;
    const isBufferPlaying = this.currentBufferSource !== null;
    return isSynthSpeaking || isAudioPlaying || isBufferPlaying;
  }
}

export const ttsService = new TTSService();
