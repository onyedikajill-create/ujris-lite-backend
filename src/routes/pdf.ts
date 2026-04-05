import express from 'express';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const router = express.Router();

router.post('/generate-pdf/:caseId', async (req, res) => {
  const { caseId } = req.params;
  const { analysis } = req.body;

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const addPage = (title: string, body: string) => {
      const page = pdfDoc.addPage([600, 800]);
      let y = 750;

      // Title
      page.drawText(title, { x: 50, y, size: 16, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
      y -= 30;

      // Body — wrap long lines
      const words = body.split(' ');
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (test.length > 80) {
          page.drawText(line, { x: 50, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
          y -= 18;
          line = word;
          if (y < 60) break;
        } else {
          line = test;
        }
      }
      if (line && y > 60) {
        page.drawText(line, { x: 50, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
      }
    };

    addPage('Case Summary', analysis.summary || 'No summary available.');
    addPage('Timeline', analysis.timeline || 'No timeline available.');
    addPage('Legal Arguments', analysis.arguments || 'No arguments available.');
    addPage('Appeal Letter', analysis.appealLetter || 'No appeal letter available.');

    const pdfBytes = await pdfDoc.save();

    console.log(`[PDF] Case ${caseId}: PDF generated`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ujris-case-${caseId}.pdf`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

export default router;
