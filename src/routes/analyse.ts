import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { fileStore } from '../store';

const router = express.Router();
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

router.post('/analyze/:caseId', async (req, res) => {
  const { caseId } = req.params;

  const files = Array.from(fileStore.values())
    .filter(f => f.caseId === caseId);

  if (files.length === 0) {
    return res.status(404).json({ error: 'No files found for this case' });
  }

  const text = files.map(f => f.buffer?.toString() || '').join('\n');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are a UK legal assistant helping a self-represented litigant analyze their case evidence.

Analyze the following documents and provide:
1. SUMMARY - Plain English summary of the case
2. TIMELINE - Key dates in chronological order
3. LEGAL ARGUMENTS - Strongest arguments for the claimant
4. WEAKNESSES - Gaps or risks in the case
5. APPEAL LETTER - A ready-to-send draft appeal letter

Documents:
${text.substring(0, 8000)}`
      }]
    });

    console.log(`[ANALYSE] Case ${caseId}: analysis complete`);

    res.json({
      success: true,
      caseId,
      analysis: message.content,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

export default router;
