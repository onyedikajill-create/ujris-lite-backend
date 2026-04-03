import { callAI, buildSystemPrompt, AIMessage } from '../services/aiService';
import { logger } from '../lib/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CaseGenerationInput {
  caseId: string;
  title: string;
  description: string;
  decisionType: string;
  grounds: string;
  desiredOutcome: string | null;
  jurisdiction: string | null;
  opposingParty: string | null;
  incidentDate: Date | null;
  submissionDeadline: Date | null;
  intakeData: Record<string, unknown> | null;
  evidenceSummary: string | null;
  evidenceCount: number;
}

export interface GeneratedCase {
  caseDocument: string;
  executiveSummary: string;
  legalArguments: LegalArgument[];
  recommendedActions: RecommendedAction[];
  strengthScore: number;
  riskAssessment: string;
}

export interface LegalArgument {
  heading: string;
  argument: string;
  supportingEvidence: string[];
  strength: 'strong' | 'moderate' | 'weak';
}

export interface RecommendedAction {
  priority: 'immediate' | 'short-term' | 'long-term';
  action: string;
  rationale: string;
  deadline?: string;
}

// ── System Prompt ─────────────────────────────────────────────────────────────

function buildCaseSystemPrompt(): string {
  return buildSystemPrompt(
    'an expert legal case preparation specialist with 20 years of UK and international legal experience',
    `You prepare comprehensive, structured legal case documents for individuals pursuing formal proceedings.

Your case documents must:
1. Present facts clearly and chronologically
2. Identify all applicable legal grounds with precision
3. Structure arguments using IRAC (Issue, Rule, Application, Conclusion)
4. Reference realistic legal frameworks (Employment Rights Act 1996, Equality Act 2010, Consumer Rights Act 2015, Human Rights Act 1998, etc.)
5. Assess case strength honestly - do not inflate
6. Provide actionable, prioritised recommendations
7. Flag all procedural deadlines and risks
8. Use formal legal English

CRITICAL: Respond ONLY in valid JSON matching the specified schema. Do not include markdown, preamble, or explanation outside JSON.`
  );
}

// ── Structured Prompt Builder (v1 logic) ──────────────────────────────────────

function buildCaseUserPrompt(input: CaseGenerationInput): string {
  const deadlineInfo = input.submissionDeadline
    ? `CRITICAL DEADLINE: ${new Date(input.submissionDeadline).toLocaleDateString('en-GB')}`
    : 'No submission deadline specified';

  const evidenceInfo =
    input.evidenceCount > 0
      ? `${input.evidenceCount} evidence item(s) submitted.\nEvidence Summary: ${input.evidenceSummary ?? 'Not yet analysed'}`
      : 'No evidence submitted yet';

  const additionalContext =
    input.intakeData && Object.keys(input.intakeData).length > 0
      ? `Additional intake information: ${JSON.stringify(input.intakeData)}`
      : '';

  return `Generate a comprehensive legal case document for the following case:

=== CASE REFERENCE: ${input.caseId} ===

TITLE: ${input.title}
DECISION TYPE: ${input.decisionType}
LEGAL GROUNDS: ${input.grounds}
JURISDICTION: ${input.jurisdiction ?? 'England & Wales (assumed)'}
OPPOSING PARTY: ${input.opposingParty ?? 'Not specified'}
INCIDENT DATE: ${input.incidentDate ? new Date(input.incidentDate).toLocaleDateString('en-GB') : 'Not specified'}
${deadlineInfo}

CASE DESCRIPTION:
${input.description}

DESIRED OUTCOME:
${input.desiredOutcome ?? 'Not specified - infer appropriate remedies'}

EVIDENCE:
${evidenceInfo}

${additionalContext}

Generate the complete case document in this EXACT JSON format:
{
  "caseDocument": "Full formal case document as continuous prose (minimum 800 words). Must include: Introduction, Background Facts, Legal Framework, Arguments, Evidence Assessment, Relief Sought, Conclusion.",
  "executiveSummary": "Concise 150-200 word executive summary of the case, key arguments, and prospects.",
  "legalArguments": [
    {
      "heading": "Argument heading",
      "argument": "Detailed argument text using IRAC structure",
      "supportingEvidence": ["Evidence reference 1", "Evidence reference 2"],
      "strength": "strong|moderate|weak"
    }
  ],
  "recommendedActions": [
    {
      "priority": "immediate|short-term|long-term",
      "action": "Specific action to take",
      "rationale": "Why this action is important",
      "deadline": "Specific date or timeframe if applicable"
    }
  ],
  "strengthScore": 0-100,
  "riskAssessment": "Honest 100-150 word assessment of case risks, weaknesses, and probability of success"
}`;
}

// ── Main Generator ────────────────────────────────────────────────────────────

export async function generateCaseDocument(
  input: CaseGenerationInput
): Promise<{ result: GeneratedCase; tokensUsed: number; processingTimeMs: number }> {
  const systemPrompt = buildCaseSystemPrompt();
  const userMessage = buildCaseUserPrompt(input);

  const messages: AIMessage[] = [{ role: 'user', content: userMessage }];

  try {
    logger.info({ caseId: input.caseId }, 'Starting case document generation');

    const response = await callAI({
      systemPrompt,
      messages,
      maxTokens: parseInt(process.env.AI_MAX_TOKENS ?? '4096', 10),
      temperature: 0.3,
    });

    const parsed = parseAndValidateCaseResponse(response.content, input);

    logger.info(
      {
        caseId: input.caseId,
        strengthScore: parsed.strengthScore,
        tokensUsed: response.tokensUsed,
        processingTimeMs: response.processingTimeMs,
      },
      'Case document generated'
    );

    return {
      result: parsed,
      tokensUsed: response.tokensUsed,
      processingTimeMs: response.processingTimeMs,
    };
  } catch (err) {
    logger.error({ err, caseId: input.caseId }, 'Case generation failed - using fallback');
    return {
      result: generateFallbackCase(input),
      tokensUsed: 0,
      processingTimeMs: 0,
    };
  }
}

// ── Response Validation ───────────────────────────────────────────────────────

function parseAndValidateCaseResponse(
  content: string,
  input: CaseGenerationInput
): GeneratedCase {
  let raw: Partial<GeneratedCase>;

  try {
    raw = JSON.parse(content) as Partial<GeneratedCase>;
  } catch {
    // Attempt to extract JSON block from content
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }
    raw = JSON.parse(jsonMatch[0]) as Partial<GeneratedCase>;
  }

  // Validate required fields
  if (!raw.caseDocument || typeof raw.caseDocument !== 'string' || raw.caseDocument.length < 100) {
    throw new Error('Invalid caseDocument in response');
  }

  const legalArguments: LegalArgument[] = Array.isArray(raw.legalArguments)
    ? raw.legalArguments.map((arg) => validateLegalArgument(arg))
    : generateFallbackArguments(input);

  const recommendedActions: RecommendedAction[] = Array.isArray(raw.recommendedActions)
    ? raw.recommendedActions.map((act) => validateRecommendedAction(act))
    : generateFallbackActions(input);

  return {
    caseDocument: String(raw.caseDocument),
    executiveSummary:
      typeof raw.executiveSummary === 'string' && raw.executiveSummary.length > 20
        ? raw.executiveSummary
        : `Case: ${input.title}. This case involves ${input.decisionType} proceedings on grounds of ${input.grounds}. Full document has been prepared for review.`,
    legalArguments,
    recommendedActions,
    strengthScore:
      typeof raw.strengthScore === 'number'
        ? Math.min(100, Math.max(0, Math.round(raw.strengthScore)))
        : 50,
    riskAssessment:
      typeof raw.riskAssessment === 'string' && raw.riskAssessment.length > 20
        ? raw.riskAssessment
        : 'Risk assessment could not be completed automatically. Legal advice is recommended.',
  };
}

function validateLegalArgument(arg: unknown): LegalArgument {
  const a = arg as Partial<LegalArgument>;
  return {
    heading: typeof a.heading === 'string' ? a.heading : 'Legal Argument',
    argument: typeof a.argument === 'string' ? a.argument : 'Argument details not available',
    supportingEvidence: Array.isArray(a.supportingEvidence)
      ? (a.supportingEvidence as string[])
      : [],
    strength:
      a.strength === 'strong' || a.strength === 'moderate' || a.strength === 'weak'
        ? a.strength
        : 'moderate',
  };
}

function validateRecommendedAction(act: unknown): RecommendedAction {
  const a = act as Partial<RecommendedAction>;
  return {
    priority:
      a.priority === 'immediate' || a.priority === 'short-term' || a.priority === 'long-term'
        ? a.priority
        : 'short-term',
    action: typeof a.action === 'string' ? a.action : 'Review case with legal advisor',
    rationale: typeof a.rationale === 'string' ? a.rationale : 'Professional review recommended',
    deadline: typeof a.deadline === 'string' ? a.deadline : undefined,
  };
}

// ── Fallback Generators ───────────────────────────────────────────────────────

function generateFallbackCase(input: CaseGenerationInput): GeneratedCase {
  return {
    caseDocument: `CASE DOCUMENT - ${input.title}

INTRODUCTION
This case document has been prepared for ${input.title}, concerning a matter of ${input.decisionType} on grounds of ${input.grounds}.

CASE REFERENCE: ${input.caseId}
JURISDICTION: ${input.jurisdiction ?? 'England & Wales'}
OPPOSING PARTY: ${input.opposingParty ?? 'Not specified'}

BACKGROUND FACTS
${input.description}

DESIRED OUTCOME
${input.desiredOutcome ?? 'To be determined following legal consultation'}

LEGAL GROUNDS
This case is brought on grounds of ${input.grounds} under applicable legal frameworks in ${input.jurisdiction ?? 'England & Wales'}.

EVIDENCE
${input.evidenceCount} item(s) of evidence have been submitted in support of this case.

NOTE: This case document was generated using the fallback system. A full AI-generated document will be available once the AI service is restored. Legal advice is strongly recommended.`,
    executiveSummary: `Case: ${input.title}. Type: ${input.decisionType}. Grounds: ${input.grounds}. This case has been documented for formal proceedings. AI-enhanced analysis will be available shortly.`,
    legalArguments: generateFallbackArguments(input),
    recommendedActions: generateFallbackActions(input),
    strengthScore: 50,
    riskAssessment:
      'Automated risk assessment unavailable. Please consult a qualified legal advisor to assess the strength and risks of this case.',
  };
}

function generateFallbackArguments(input: CaseGenerationInput): LegalArgument[] {
  return [
    {
      heading: `Primary Grounds: ${input.grounds}`,
      argument: `The claimant brings this case on grounds of ${input.grounds} in the context of ${input.decisionType} proceedings. ${input.description}`,
      supportingEvidence: input.evidenceCount > 0 ? ['Submitted evidence documents'] : [],
      strength: 'moderate',
    },
  ];
}

function generateFallbackActions(input: CaseGenerationInput): RecommendedAction[] {
  const actions: RecommendedAction[] = [
    {
      priority: 'immediate',
      action: 'Consult a qualified legal advisor',
      rationale: 'Professional legal advice is essential before proceeding',
    },
    {
      priority: 'immediate',
      action: 'Preserve all relevant documentation and evidence',
      rationale: 'Evidence preservation is critical for case success',
    },
    {
      priority: 'short-term',
      action: 'Gather any additional supporting evidence',
      rationale: 'Strong evidence base improves case prospects',
    },
  ];

  if (input.submissionDeadline) {
    actions.unshift({
      priority: 'immediate',
      action: `Note critical deadline: ${new Date(input.submissionDeadline).toLocaleDateString('en-GB')}`,
      rationale: 'Missing deadlines can invalidate proceedings',
      deadline: new Date(input.submissionDeadline).toLocaleDateString('en-GB'),
    });
  }

  return actions;
}
