import { describe, it, expect } from 'vitest';
import {
  extractAndValidateDialogue,
  extractAndValidateDubbing,
  checkLengthRatioAnomaly
} from '../src/services/dubbingValidator';

describe('Dubbing & Dialogue Validator Suite', () => {
  describe('Real-World Interleaved AI Output (User Regression)', () => {
    const rawAiOutput = `*folds arms, giving you a knowing look* There you go again, Yokoyama. That habit of yours hasn't changed one bit. <ja>でも……ちゃんと食べないと駄目です。私みたいに、食べることを当たり前にできない人間もいるんですから。</ja> But still... you really should eat properly. After all, there are people like me who can't take something as simple as a meal for granted. <ja>何か作りましょうか？　熱を出すのは得意なんですよ。……料理にも、使えますから。</ja> Want me to make you something? I'm good at generating heat. ...It works for cooking too, you know.`;

    it('extracts all interleaved <ja> tags into a unified clean Japanese audio text', () => {
      const result = extractAndValidateDialogue(rawAiOutput);

      expect(result.isValidJapanese).toBe(true);
      expect(result.jaText).toBe(
        'でも……ちゃんと食べないと駄目です。私みたいに、食べることを当たり前にできない人間もいるんですから。 何か作りましょうか？　熱を出すのは得意なんですよ。……料理にも、使えますから。'
      );
    });

    it('cleanses all <ja> blocks from user-facing subtitle without leaking XML tags', () => {
      const result = extractAndValidateDialogue(rawAiOutput);

      expect(result.cleanText).not.toContain('<ja>');
      expect(result.cleanText).not.toContain('</ja>');
      expect(result.cleanText).toContain('There you go again, Yokoyama.');
      expect(result.cleanText).toContain('But still... you really should eat properly.');
      expect(result.cleanText).toContain('Want me to make you something?');
    });

    it('extracts roleplay stage directions properly from the clean subtitle', () => {
      const result = extractAndValidateDialogue(rawAiOutput);

      expect(result.actions).toContain('folds arms, giving you a knowing look');
    });
  });

  describe('Standard Dialogue Format', () => {
    it('handles canonical format with emotion and single <ja> block', () => {
      const input = '[happy] <ja>こんにちは、今日もいい天気ですね！</ja> Hello, the weather is nice today!';
      const result = extractAndValidateDialogue(input);

      expect(result.emotion).toBe('happy');
      expect(result.jaText).toBe('こんにちは、今日もいい天気ですね！');
      expect(result.cleanText).toBe('Hello, the weather is nice today!');
      expect(result.isValidJapanese).toBe(true);
      expect(result.isStreaming).toBe(false);
    });

    it('handles square bracket [ja] tags', () => {
      const input = '[relaxed] [ja]了解しました、すぐに対応します。[/ja] Understood, I will handle it right away.';
      const result = extractAndValidateDialogue(input);

      expect(result.emotion).toBe('relaxed');
      expect(result.jaText).toBe('了解しました、すぐに対応します。');
      expect(result.cleanText).toBe('Understood, I will handle it right away.');
      expect(result.isValidJapanese).toBe(true);
    });

    it('handles plain chat without any dubbing or emotion tags', () => {
      const input = 'Sure, I can assist you with your project.';
      const result = extractAndValidateDialogue(input);

      expect(result.emotion).toBeNull();
      expect(result.jaText).toBeNull();
      expect(result.cleanText).toBe('Sure, I can assist you with your project.');
      expect(result.isValidJapanese).toBe(false);
      expect(result.isStreaming).toBe(false);
    });
  });

  describe('Streaming & Masking Protection', () => {
    it('masks in-flight opening tag without closing tag at start', () => {
      const input = '<ja>こんにちは';
      const result = extractAndValidateDubbing(input);

      expect(result.isStreamingJa).toBe(true);
      expect(result.cleanText).toBe('');
      expect(result.jaText).toBeNull();
    });

    it('masks in-flight opening tag when preceded by emotion', () => {
      const input = '[happy] <ja>元気';
      const result = extractAndValidateDialogue(input);

      expect(result.emotion).toBe('happy');
      expect(result.isStreaming).toBe(true);
      expect(result.cleanText).toBe('');
    });

    it('masks in-flight unclosed emotion tag', () => {
      const input = '[blush';
      const result = extractAndValidateDialogue(input);

      expect(result.emotion).toBeNull();
      expect(result.isStreaming).toBe(true);
      expect(result.cleanText).toBe('');
    });
  });

  describe('Length Ratio Anomaly Heuristic', () => {
    it('does not flag natural short Japanese phrases as anomaly', () => {
      expect(checkLengthRatioAnomaly('元気？', 'How are you doing today? Hope everything is fine!')).toBe(false);
      expect(checkLengthRatioAnomaly('了解', 'I completely understand what you mean and agree with your proposal.')).toBe(false);
    });

    it('flags severe length discrepancy', () => {
      expect(checkLengthRatioAnomaly('a', 'A'.repeat(60))).toBe(true);
      expect(checkLengthRatioAnomaly('あ'.repeat(70), 'a')).toBe(true);
    });
  });
});
