import { validateIntakeCompleteness, CreateIntakeSchema } from '../engines/intakeEngine';

describe('intakeEngine', () => {
  describe('validateIntakeCompleteness', () => {
    it('returns valid when all required fields present', () => {
      const result = validateIntakeCompleteness({
        title: 'My appeal case',
        description: 'This is a detailed description of what happened in this case.',
        decisionType: 'APPEAL',
        grounds: 'DISCRIMINATION',
        desiredOutcome: 'Reinstatement and compensation',
        jurisdiction: 'England & Wales',
      });
      expect(result.valid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('returns invalid when required fields missing', () => {
      const result = validateIntakeCompleteness({
        title: 'My case',
        description: 'Short',
        decisionType: 'APPEAL',
        grounds: 'DISCRIMINATION',
        desiredOutcome: null,
        jurisdiction: null,
      });
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('desiredOutcome');
      expect(result.missingFields).toContain('jurisdiction');
    });

    it('flags short description as invalid', () => {
      const result = validateIntakeCompleteness({
        title: 'My case',
        description: 'Too short',
        decisionType: 'APPEAL',
        grounds: 'DISCRIMINATION',
        desiredOutcome: 'Compensation',
        jurisdiction: 'England & Wales',
      });
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('description');
    });
  });

  describe('CreateIntakeSchema', () => {
    it('parses valid input', () => {
      const result = CreateIntakeSchema.safeParse({
        title: 'Valid title here',
        description: 'This is a long enough description for the case details.',
        decisionType: 'APPEAL',
        grounds: 'DISCRIMINATION',
        desiredOutcome: 'Full reinstatement and back pay',
        jurisdiction: 'England & Wales',
      });
      expect(result.success).toBe(true);
    });

    it('rejects title too short', () => {
      const result = CreateIntakeSchema.safeParse({
        title: 'Hi',
        description: 'This is a long enough description for the case details.',
        decisionType: 'APPEAL',
        grounds: 'DISCRIMINATION',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid decisionType', () => {
      const result = CreateIntakeSchema.safeParse({
        title: 'Valid title here',
        description: 'This is a long enough description for the case details.',
        decisionType: 'INVALID_TYPE',
        grounds: 'DISCRIMINATION',
      });
      expect(result.success).toBe(false);
    });
  });
});
