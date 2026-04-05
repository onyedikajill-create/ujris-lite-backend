"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateIntakeSchema = exports.CreateIntakeSchema = void 0;
exports.generateNextQuestions = generateNextQuestions;
exports.validateIntakeCompleteness = validateIntakeCompleteness;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const aiService_1 = require("../services/aiService");
const logger_1 = require("../lib/logger");
exports.CreateIntakeSchema = zod_1.z.object({
    title: zod_1.z.string().min(5).max(200),
    description: zod_1.z.string().min(20).max(5000),
    decisionType: zod_1.z.nativeEnum(client_1.DecisionType).default('OTHER'),
    grounds: zod_1.z.nativeEnum(client_1.GroundsType).default('OTHER'),
    desiredOutcome: zod_1.z.string().min(10).max(1000).optional(),
    jurisdiction: zod_1.z.string().max(100).optional(),
    opposingParty: zod_1.z.string().max(200).optional(),
    incidentDate: zod_1.z.string().datetime().optional(),
    submissionDeadline: zod_1.z.string().datetime().optional(),
    intakeData: zod_1.z.record(zod_1.z.unknown()).optional(),
});
exports.UpdateIntakeSchema = zod_1.z.object({
    title: zod_1.z.string().min(5).max(200).optional(),
    description: zod_1.z.string().min(20).max(5000).optional(),
    decisionType: zod_1.z.nativeEnum(client_1.DecisionType).optional(),
    grounds: zod_1.z.nativeEnum(client_1.GroundsType).optional(),
    desiredOutcome: zod_1.z.string().min(10).max(1000).optional(),
    jurisdiction: zod_1.z.string().max(100).optional(),
    opposingParty: zod_1.z.string().max(200).optional(),
    incidentDate: zod_1.z.string().datetime().optional(),
    submissionDeadline: zod_1.z.string().datetime().optional(),
    intakeData: zod_1.z.record(zod_1.z.unknown()).optional(),
});
async function generateNextQuestions(caseData) {
    const systemPrompt = (0, aiService_1.buildSystemPrompt)('an expert legal intake specialist', `Analyse the provided case intake data and generate targeted follow-up questions to complete the intake.
    
    RULES:
    - Generate 0-5 questions maximum
    - Only ask questions that are genuinely needed and not already answered
    - Questions must be specific to the case type and grounds
    - Return intakeComplete: true if enough information exists to generate a case document
    - completionScore is 0-100 representing intake completeness`);
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
        const response = await (0, aiService_1.callAI)({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            maxTokens: 1024,
            temperature: 0.2,
        });
        const parsed = JSON.parse(response.content);
        if (!Array.isArray(parsed.questions) ||
            typeof parsed.intakeComplete !== 'boolean' ||
            typeof parsed.completionScore !== 'number') {
            throw new Error('Invalid next questions response structure');
        }
        return {
            questions: parsed.questions.slice(0, 5),
            intakeComplete: parsed.intakeComplete,
            completionScore: Math.min(100, Math.max(0, parsed.completionScore)),
        };
    }
    catch (err) {
        logger_1.logger.error({ err }, 'generateNextQuestions failed - using fallback');
        return generateFallbackQuestions(caseData);
    }
}
function generateFallbackQuestions(caseData) {
    const questions = [];
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
function validateIntakeCompleteness(caseData) {
    const missingFields = [];
    if (!caseData.title || caseData.title.length < 5)
        missingFields.push('title');
    if (!caseData.description || caseData.description.length < 20)
        missingFields.push('description');
    if (!caseData.decisionType)
        missingFields.push('decisionType');
    if (!caseData.grounds)
        missingFields.push('grounds');
    if (!caseData.desiredOutcome)
        missingFields.push('desiredOutcome');
    if (!caseData.jurisdiction)
        missingFields.push('jurisdiction');
    return { valid: missingFields.length === 0, missingFields };
}
//# sourceMappingURL=intakeEngine.js.map