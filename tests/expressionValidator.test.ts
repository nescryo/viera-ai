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

      expect(result.emotion).toBe('relaxed+blush:0.6');
      expect(result.cleanText).toBe('T-thank you for the compliment.');
      expect(result.hasTag).toBe(true);
    });

    it('parses hyphenated emotion [blush-hardly] and underscored [blush_hardly]', () => {
      const input1 = '[blush-hardly] Wah! That was too sudden!';
      const result1 = extractAndValidateExpression(input1);
      expect(result1.emotion).toBe('relaxed+blush:1');

      const input2 = '[blush_hardly] Wah! That was too sudden!';
      const result2 = extractAndValidateExpression(input2);
      expect(result2.emotion).toBe('relaxed+blush:1');
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

  describe('Modifiers (shape-key style layering)', () => {
    it('parses a base emotion with a named modifier level', () => {
      const result = extractAndValidateExpression('[sad+blush:low] I... thank you.');
      expect(result.emotion).toBe('sad+blush:0.3');
      expect(result.cleanText).toBe('I... thank you.');
    });

    it('parses a level on the base expression', () => {
      expect(extractAndValidateExpression('[happy:low] Hi!').emotion).toBe('happy:0.3');
      expect(extractAndValidateExpression('[sad:0.5+blush:high] Hi!').emotion).toBe('sad:0.5+blush:1');
    });

    it('scales a macro alias by its level and lets explicit modifiers override', () => {
      expect(extractAndValidateExpression('[blush-hardly:low] Hi!').emotion).toBe('relaxed:0.3+blush:0.3');
      expect(extractAndValidateExpression('[blush+blush:low] Hi!').emotion).toBe('relaxed+blush:0.3');
    });

    it('parses the rig-backed modifiers', () => {
      expect(extractAndValidateExpression('[surprised+cold-sweat:high] Hi!').emotion).toBe('surprised+cold-sweat:1');
      expect(extractAndValidateExpression('[sad+tears+gloom:low] Hi!').emotion).toBe('sad+tears:0.6+gloom:0.3');
    });

    it('parses an eye symbol as an exclusive slot where the last one wins', () => {
      expect(extractAndValidateExpression('[happy+heart-eyes] Hi!').emotion).toBe('happy+heart-eyes');
      expect(extractAndValidateExpression('[happy+heart-eyes+smug-eyes:0.5] Hi!').emotion).toBe('happy+smug-eyes:0.5');
      expect(extractAndValidateExpression('[happy+blush:low+spiral-eyes] Hi!').emotion).toBe('happy+blush:0.3+spiral-eyes');
    });

    it('parses the eye shape modifiers alongside an eye symbol', () => {
      expect(extractAndValidateExpression('[angry+eye-squint:high] Hi!').emotion).toBe('angry+eye-squint:1');
      expect(extractAndValidateExpression('[surprised+shock-eyes:low+heart-eyes] Hi!').emotion).toBe('surprised+shock-eyes:0.3+heart-eyes');
    });

    it('maps near-miss spellings of the eye modifiers to the canonical ID', () => {
      expect(extractAndValidateExpression('[angry+squint:high] Hi!').emotion).toBe('angry+eye-squint:1');
      expect(extractAndValidateExpression('[surprised+shocked-eyes] Hi!').emotion).toBe('surprised+shock-eyes:0.6');
      expect(extractAndValidateExpression('[happy+wide_eyes:low] Hi!').emotion).toBe('happy+shock-eyes:0.3');
    });

    it('does not let an alias lookup resolve inherited object keys', () => {
      expect(extractAndValidateExpression('[happy+constructor] Hi!').emotion).toBe('happy');
    });

    it('uses the default weight when no level is given', () => {
      expect(extractAndValidateExpression('[happy+blush] Hi!').emotion).toBe('happy+blush:0.6');
    });

    it('accepts numeric levels and clamps them to 1', () => {
      expect(extractAndValidateExpression('[happy+blush:0.4] Hi!').emotion).toBe('happy+blush:0.4');
      expect(extractAndValidateExpression('[happy+blush:7] Hi!').emotion).toBe('happy+blush:1');
    });

    it('drops unknown modifiers but keeps the base emotion', () => {
      const result = extractAndValidateExpression('[happy+glitter:high] Hi!');
      expect(result.emotion).toBe('happy');
      expect(result.cleanText).toBe('Hi!');
    });

    it('leaves non-emotion bracketed text such as [10:30] untouched', () => {
      const result = extractAndValidateExpression('Meet me at [10:30] ok?');
      expect(result.emotion).toBeNull();
      expect(result.cleanText).toContain('[10:30]');
    });

    it('masks an in-flight modifier tag while streaming', () => {
      const result = extractAndValidateExpression('[sad+bl');
      expect(result.isStreamingTag).toBe(true);
      expect(result.cleanText).toBe('');
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
