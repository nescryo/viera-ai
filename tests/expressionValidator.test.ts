import { describe, it, expect } from 'vitest';
import { extractAndValidateExpression } from '../src/services/expressionValidator';
import { extractAndValidateDialogue } from '../src/services/dubbingValidator';

describe('Expression Validator Suite', () => {
  describe('User Regression: Inline XML Emotion Tags (<pouting>)', () => {
    const rawAiOutput = `Eh... you don't like sweets? Honestly... that's a little disappointing. That we can't enjoy Oak Cake Rolls together, I mean. <pouting> I'm not going to hold it against you, though. Everyone has their own tastes—being forced into something is the worst feeling in the world. </pouting> Then how about something that isn't sweet? Tea, or something like that—I'd be happy to join you. As long as you actually rest, that's enough for me.`;

    it('extracts canonical emotion "pouting" from inline <pouting> tags in expressionValidator', () => {
      const result = extractAndValidateExpression(rawAiOutput);

      expect(result.emotion).toBe('pouting');
      expect(result.hasTag).toBe(true);
      expect(result.cleanText).not.toContain('<pouting>');
      expect(result.cleanText).not.toContain('</pouting>');
      expect(result.cleanText).toContain("I'm not going to hold it against you, though.");
    });

    it('cleanses <pouting> tags in the unified extractAndValidateDialogue pipeline', () => {
      const result = extractAndValidateDialogue(rawAiOutput);

      expect(result.emotion).toBe('pouting');
      expect(result.cleanText).not.toContain('<pouting>');
      expect(result.cleanText).not.toContain('</pouting>');
      expect(result.cleanText).toContain('Eh... you don\'t like sweets?');
      expect(result.cleanText).toContain('Everyone has their own tastes');
      expect(result.cleanText).toContain('As long as you actually rest, that\'s enough for me.');
    });
  });

  describe('Standard & Canonical Emotion Tag Formats', () => {
    it('parses standard front square bracket [happy]', () => {
      const input = '[happy] Good morning! Hope you slept well.';
      const result = extractAndValidateExpression(input);

      expect(result.emotion).toBe('happy');
      expect(result.cleanText).toBe('Good morning! Hope you slept well.');
      expect(result.hasTag).toBe(true);
    });

    it('parses prefixed square bracket [emotion: blush]', () => {
      const input = '[emotion: blush] T-thank you for the compliment.';
      const result = extractAndValidateExpression(input);

      expect(result.emotion).toBe('blush');
      expect(result.cleanText).toBe('T-thank you for the compliment.');
      expect(result.hasTag).toBe(true);
    });

    it('parses hyphenated emotion [blush-hardly] and underscored [blush_hardly]', () => {
      const input1 = '[blush-hardly] Wah! That was too sudden!';
      const result1 = extractAndValidateExpression(input1);
      expect(result1.emotion).toBe('blush-hardly');

      const input2 = '[blush_hardly] Wah! That was too sudden!';
      const result2 = extractAndValidateExpression(input2);
      expect(result2.emotion).toBe('blush-hardly');
    });

    it('parses front XML tag <relaxed>', () => {
      const input = '<relaxed> Just taking it easy today.';
      const result = extractAndValidateExpression(input);

      expect(result.emotion).toBe('relaxed');
      expect(result.cleanText).toBe('Just taking it easy today.');
      expect(result.hasTag).toBe(true);
    });

    it('strips hallucinated emotion tags while leaving clean dialogue intact', () => {
      const input = '[dancing] Look at this cool move!';
      const result = extractAndValidateExpression(input);

      expect(result.emotion).toBeNull();
      expect(result.hasTag).toBe(true);
      expect(result.cleanText).toBe('Look at this cool move!');
    });
  });

  describe('Tag Isolation & Safety (Never Clashes with <ja> or <think>)', () => {
    it('leaves <ja> dubbing tags completely untouched for dubbingValidator', () => {
      const input = '<ja>こんにちは</ja> Hello there!';
      const result = extractAndValidateExpression(input);

      expect(result.emotion).toBeNull();
      expect(result.cleanText).toContain('<ja>こんにちは</ja>');
    });

    it('leaves [ja] dubbing tags untouched', () => {
      const input = '[ja]こんにちは[/ja] Hello there!';
      const result = extractAndValidateExpression(input);

      expect(result.emotion).toBeNull();
      expect(result.cleanText).toContain('[ja]こんにちは[/ja]');
    });

    it('masks thinking model <think> reasoning blocks', () => {
      const input = '<think>I should act kindly</think>[happy] Hi!';
      const result = extractAndValidateExpression(input);

      expect(result.emotion).toBe('happy');
      expect(result.cleanText).toBe('Hi!');
      expect(result.cleanText).not.toContain('<think>');
    });
  });

  describe('Streaming Masking for In-Flight Emotion Tags', () => {
    it('masks in-flight opening bracket at start', () => {
      const input = '[pout';
      const result = extractAndValidateExpression(input);

      expect(result.isStreamingTag).toBe(true);
      expect(result.cleanText).toBe('');
      expect(result.emotion).toBeNull();
    });

    it('masks in-flight opening XML tag at end of text', () => {
      const input = 'Wait a second... <pout';
      const result = extractAndValidateExpression(input);

      expect(result.isStreamingTag).toBe(true);
      expect(result.cleanText).toBe('Wait a second...');
      expect(result.cleanText).not.toContain('<pout');
    });
  });
});
