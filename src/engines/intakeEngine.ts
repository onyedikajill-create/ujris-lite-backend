import { z } from 'zod';
import { DecisionType, GroundsType } from '@prisma/client';
import { callAI, buildSystemPrompt } from '../services/aiService';
import { logger } from '../lib/logger';

// ── Zod Schemas ───────────────────────────────────────────────────────────────

export const CreateIntakeSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(5000),
  decisionType: z.nativeEnum(DecisionType).default('OTHER'),
  grounds: z.nativeEnum(GroundsType).default('OTHER'),
  desiredOutcome: z.string().min(10).max(1000).optional(),
  jurisdiction: z.string().max(100).optional(),
  opposingParty: z.string().max(200).optional(),
  incidentDate: z.string().datetime().optional(),
  submissionDeadline: z.string().datetime().optional(),
  intakeData: z.record(z.unknown()).optional(),
});

export const UpdateIntakeSchema = z.object({
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(20).max(5000).optional(),
  decisionType: z.nativeEnum(DecisionType).optional(),
  grounds: z.nativeEnum(GroundsType).optional(),
  desiredOutcome: z.string().min(10).max(1000).optional(),
  jurisdiction: z.string().max(100).optional(),
  opposingParty: z.string().max(200).optional(),
  incidentDate: z.string().datetime().optional(),
  submissionDeadline: z.string().datetime().optional(),
  intakeData: z.record(z.unknown()).optional(),
});

export type CreateIntakeInput = z.infer<typeof CreateIntakeSchema>;
export type UpdateIntakeInput = z.infer<typeof UpdateIntakeSchema>;

// ── Next Questions Logic (v1 merged) ─────────────────────────────────────────

interface NextQuestion {
  id: string;
  question: string;
  type: 'text' | 'date' | 'select' | 'boolean';
  required: boolean;
  options?: string[];
}

interface NextQuestionsResult {
  questions: NextQuestion[];
  intakeComplete: boolean;
  completionScore: number;
}

export async function generateNextQuestions(
  caseData: {
    title: string;
    description: string;
    decisionType: string;
    grounds: string;
    desiredOutcome?: string | null;
    jurisdiction?: string | null;
    opposingParty?: string | null;
    incidentDate?: Date | null;
    submissionDeadline?: Date | null;
    intakeData?: Record<string, unknown> | null;
  }
): Promise<NextQuestionsResult> {
  const systemPrompt = buildSystemPrompt(
    'an expert legal intake specialist',
    `Analyse the provided case intake data and generate targeted follow-up questions to complete the intake.
    
    RULES:
    - Generate 0-5 questions maximum
    - Only ask questions that are genuinely needed and not already answered
    - Questions must be specific to the case type and grounds
    - Return intakeComplete: true if enough information exists to generate a case document
    - completionScore is 0-100 representing intake completeness`
  );

  const userMessage = `Case intake data:
Title: ${caseData.title}
Description: ${caseData.description}
Decision Type: ${caseData.decisionType}
Grounds: ${caseData.grounds}
Desired Outcome: ${caseData.desiredOutcome ?? 'Not provided'}
Jurisdiction: ${caseData.jurisdiction ?? 'Not provided'}
Opposing Party: ${caseData.opposingParty ?? 'Not provided'}
Incident Date: ${caseData.incidentDate?.toISOString() ?? 'Not provided'}
Submission Deadline: ${caseData.submissionDeadline?.toISOString() ?? 'Not provided'}
Additional Data: ${JSON.stringify(caseData.intakeData ?? {})}

Generate follow-up questions in this exact JSON format:
{
  "questions": [
    {
      "id": "q_unique_id",
      "question": "Specific question text",
      "type": "text|date|select|boolean",
      "required": true|false,
      "options": ["option1", "option2"] // only for select type
    }
  ],
  "intakeComplete": true|false,
  "completionScore": 0-100
}`;

  try {
    const response = await callAI({
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 1024,
      temperature: 0.2,
    });

    const parsed = JSON.parse(response.content) as NextQuestionsResult;

    // Validate structure
    if (
      !Array.isArray(parsed.questions) ||
      typeof parsed.intakeComplete !== 'boolean' ||
      typeof parsed.completionScore !== 'number'
    ) {
      throw new Error('Invalid next questions response structure');
    }

    return {
      questions: parsed.questions.slice(0, 5),
      intakeComplete: parsed.intakeComplete,
      completionScore: Math.min(100, Math.max(0, parsed.completionScore)),
    };
  } catch (err) {
    logger.error({ err }, 'generateNextQuestions failed - using fallback');
    return generateFallbackQuestions(caseData);
  }
}

function generateFallbackQuestions(caseData: {
  desiredOutcome?: string | null;
  jurisdiction?: string | null;
  opposingParty?: string | null;
  incidentDate?: Date | null;
}): NextQuestionsResult {
  const questions: NextQuestion[] = [];

  if (!caseData.desiredOutcome) {
    questions.push({
      id: 'q_desired_outcome',
      question: 'What specific outcome are you seeking from this case?',
      type: 'text',
      required: true,
    });
  }

  if (!caseData.jurisdiction) {
    questions.push({
      id: 'q_jurisdiction',
      question: 'In which jurisdiction (country/region) did this matter arise?',
      type: 'text',
      required: true,
    });
  }

  if (!caseData.opposingParty) {
    questions.push({
      id: 'q_opposing_party',
      question: 'Who is the opposing party (organisation or individual name)?',
      type: 'text',
      required: false,
    });
  }

  if (!caseData.incidentDate) {
    questions.push({
      id: 'q_incident_date',
      question: 'When did the incident or issue first occur?',
      type: 'date',
      required: false,
    });
  }

  const answeredCount = 4 - questions.length;
  const completionScore = Math.round((answeredCount / 4) * 60);
  const intakeComplete = questions.length === 0;

  return { questions, intakeComplete, completionScore };
}

// ── Intake Validation ─────────────────────────────────────────────────────────

export function validateIntakeCompleteness(caseData: {
  title: string;
  description: string;
  decisionType: string;
  grounds: string;
  desiredOutcome?: string | null;
  jurisdiction?: string | null;
}): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  if (!caseData.title || caseData.title.length < 5) missingFields.push('title');
  if (!caseData.description || caseData.description.length < 20) missingFields.push('description');
  if (!caseData.decisionType) missingFields.push('decisionType');
  if (!caseData.grounds) missingFields.push('grounds');
  if (!caseData.desiredOutcome) missingFields.push('desiredOutcome');
  if (!caseData.jurisdiction) missingFields.push('jurisdiction');

  return { valid: missingFields.length === 0, missingFields };
}
