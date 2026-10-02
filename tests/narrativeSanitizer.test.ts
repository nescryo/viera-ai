import { describe, it, expect } from 'vitest';
import { sanitizeTextForSpeech } from '../src/services/tts/ttsChunker';
import { extractAndValidateExpression } from '../src/services/expressionValidator';

describe('Narrative Exposition & Speech Sanitizer Suite', () => {
  describe('Narrative Tag Stripping from TTS Audio', () => {
    it('strips <narrative>...</narrative> blocks completely from speech audio', () => {
      const input = `"...Hello." <narrative>She looks up from where she'd been sitting, hands loosely folded in her lap.</narrative> "It's been quiet today."`;
      const sanitized = sanitizeTextForSpeech(input);

      expect(sanitized).not.toContain('<narrative>');
      expect(sanitized).not.toContain('</narrative>');
      expect(sanitized).not.toContain("She looks up from where she'd been sitting");
      expect(sanitized).toContain('"...Hello." "It\'s been quiet today."');
    });

    it('handles multiple narrative blocks mixed with dialogue', () => {
      const input = `"...Hello." <narrative>Brief pause.</narrative> "I'm Firefly." <narrative>A small genuine smile.</narrative> "...What brings you here?"`;
      const sanitized = sanitizeTextForSpeech(input);

      expect(sanitized).not.toContain('Brief pause.');
      expect(sanitized).not.toContain('A small genuine smile.');
      expect(sanitized).toContain('"...Hello."');
      expect(sanitized).toContain('"I\'m Firefly."');
      expect(sanitized).toContain('"...What brings you here?"');
    });

    it('masks in-flight unclosed narrative tag during streaming', () => {
      const streamingInput = `"...Hello." <narrative>She looks up from where`;
      const sanitized = sanitizeTextForSpeech(streamingInput);

      expect(sanitized).not.toContain('<narrative>');
      expect(sanitized).not.toContain('She looks up from where');
      expect(sanitized).toBe('"...Hello."');
    });
  });

  describe('Assistant Mode & Non-Narrative Speech Compatibility', () => {
    it('leaves plain assistant responses and technical terms completely intact', () => {
      const input = 'Tentu! Untuk menjalankan unit test, kamu bisa menggunakan perintah "npm test".';
      const sanitized = sanitizeTextForSpeech(input);

      expect(sanitized).toBe('Tentu! Untuk menjalankan unit test, kamu bisa menggunakan perintah "npm test".');
    });

    it('preserves bold text emphasis (e.g. shouting or strong emphasis)', () => {
      const input = 'Jangan lakukan itu! Itu **sangat berbahaya** untukmu!';
      const sanitized = sanitizeTextForSpeech(input);

      expect(sanitized).toContain('sangat berbahaya');
      expect(sanitized).toBe('Jangan lakukan itu! Itu sangat berbahaya untukmu!');
    });

    it('preserves italicized / emphasized dialogue words like *did* while stripping the asterisk symbols', () => {
      const input = '<narrative>A small, real smile.</narrative> "...so if you *did* see something, you don\'t have to pretend."';
      const sanitized = sanitizeTextForSpeech(input);

      expect(sanitized).not.toContain('<narrative>');
      expect(sanitized).not.toContain('A small, real smile.');
      expect(sanitized).toContain('did see something');
      expect(sanitized).toBe('"...so if you did see something, you don\'t have to pretend."');
    });
  });

  describe('Expression Validator Safety with Narrative Tags', () => {
    it('never strips or interferes with <narrative> tags in expressionValidator', () => {
      const input = '[happy] "...Hello." <narrative>She looks up warmly.</narrative>';
      const result = extractAndValidateExpression(input);

      expect(result.emotion).toBe('happy');
      expect(result.cleanText).toContain('<narrative>She looks up warmly.</narrative>');
    });
  });
});
