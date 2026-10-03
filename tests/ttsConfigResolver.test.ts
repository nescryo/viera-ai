import { describe, it, expect } from 'vitest';
import { resolveTtsSettings } from '../src/services/tts/ttsConfigResolver';
import type { ApiConfig } from '../src/types';

describe('ttsConfigResolver', () => {
  it('returns safe fallback settings when apiConfig is undefined', () => {
    const settings = resolveTtsSettings(undefined, 'Hello world');
    expect(settings.mode).toBe('normal');
    expect(settings.provider).toBe('fish-audio');
    expect(settings.apiKey).toBe('');
    expect(settings.model).toBe('s2.1-pro-free');
    expect(settings.isFallbackWebSpeech).toBe(true);
  });

  it('routes to Japanese settings when ttsMode is japanese-dub', () => {
    const config: ApiConfig = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      ttsMode: 'japanese-dub',
      jpTtsProvider: 'fish-audio',
      jpTtsApiKey: 'fish-jp-key',
      jpTtsReferenceId: 'jp-ref-123',
      jpTtsModel: 's2.1-pro-free',
      normalTtsProvider: 'universal',
      normalTtsApiKey: 'norm-key'
    };

    const settings = resolveTtsSettings(config, 'English chat text');
    expect(settings.mode).toBe('japanese');
    expect(settings.provider).toBe('fish-audio');
    expect(settings.apiKey).toBe('fish-jp-key');
    expect(settings.referenceId).toBe('jp-ref-123');
    expect(settings.isFallbackWebSpeech).toBe(false);
  });

  it('routes to Japanese settings automatically when text contains Japanese characters', () => {
    const config: ApiConfig = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      ttsMode: 'follow-chat',
      jpTtsProvider: 'fish-audio',
      jpTtsApiKey: 'fish-jp-key',
      normalTtsProvider: 'universal',
      normalTtsApiKey: 'norm-key'
    };

    const settings = resolveTtsSettings(config, 'こんにちは！元気ですか？');
    expect(settings.mode).toBe('japanese');
    expect(settings.provider).toBe('fish-audio');
    expect(settings.apiKey).toBe('fish-jp-key');
  });

  it('routes to normal TTS settings for standard chat text in follow-chat mode', () => {
    const config: ApiConfig = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      ttsMode: 'follow-chat',
      normalTtsProvider: 'universal',
      normalTtsUrl: 'https://api.custom.com/v1',
      normalTtsApiKey: 'norm-key-456',
      normalTtsModel: 'tts-1-hd',
      normalTtsVoice: 'shimmer',
      jpTtsProvider: 'fish-audio',
      jpTtsApiKey: 'fish-key'
    };

    const settings = resolveTtsSettings(config, 'How are you today?');
    expect(settings.mode).toBe('normal');
    expect(settings.provider).toBe('universal');
    expect(settings.baseUrl).toBe('https://api.custom.com/v1');
    expect(settings.apiKey).toBe('norm-key-456');
    expect(settings.model).toBe('tts-1-hd');
    expect(settings.voiceId).toBe('shimmer');
    expect(settings.isFallbackWebSpeech).toBe(false);
  });

  it('falls back to legacy ApiConfig fields when modern split fields are absent', () => {
    const legacyConfig: ApiConfig = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-legacy',
      model: 'gpt-4o',
      ttsProvider: 'fish-audio',
      fishAudioApiKey: 'fish-legacy-key',
      fishAudioReferenceId: 'ref-legacy-999',
      fishAudioModel: 'custom-model'
    };

    const settings = resolveTtsSettings(legacyConfig, 'Testing legacy fallback');
    expect(settings.provider).toBe('fish-audio');
    expect(settings.apiKey).toBe('fish-legacy-key');
    expect(settings.referenceId).toBe('ref-legacy-999');
    expect(settings.model).toBe('custom-model');
    expect(settings.isFallbackWebSpeech).toBe(false);
  });

  it('supports local edge and local universal servers without API keys', () => {
    const edgeConfig: ApiConfig = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      normalTtsProvider: 'edge'
    };
    const edgeSettings = resolveTtsSettings(edgeConfig, 'Edge test');
    expect(edgeSettings.provider).toBe('edge');
    expect(edgeSettings.isFallbackWebSpeech).toBe(false);

    const localUniversalConfig: ApiConfig = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      normalTtsProvider: 'universal',
      normalTtsUrl: 'http://localhost:8880/v1'
    };
    const localSettings = resolveTtsSettings(localUniversalConfig, 'Local universal test');
    expect(localSettings.provider).toBe('universal');
    expect(localSettings.isFallbackWebSpeech).toBe(false);
  });

  it('flags isFallbackWebSpeech when explicit webspeech provider is selected', () => {
    const config: ApiConfig = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      ttsProvider: 'webspeech'
    };
    const settings = resolveTtsSettings(config, 'Web speech test');
    expect(settings.provider).toBe('webspeech');
    expect(settings.isFallbackWebSpeech).toBe(true);
  });
});
