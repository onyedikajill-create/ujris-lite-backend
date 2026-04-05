import express from 'express';
import multer from 'multer';
import { randomBytes } from 'crypto';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// In-memory storage for MVP (replace with S3/R2 in production)
const fileStore = new Map();

router.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const caseId = req.body.caseId;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = [];

    for (const file of files) {
      const fileId = randomBytes(16).toString('hex');
      fileStore.set(fileId, {
        id: fileId,
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        buffer: file.buffer,
        caseId,
        uploadedAt: new Date().toISOString(),
      });

      uploadedFiles.push({
        id: fileId,
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
      });
    }

    console.log(`[UPLOAD] Case ${caseId}: ${uploadedFiles.length} files uploaded`);

    res.json({
      success: true,
      caseId,
      files: uploadedFiles,
      count: uploadedFiles.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.get('/files/:caseId', (req, res) => {
  const caseId = req.params.caseId;
  const files = Array.from(fileStore.values())
    .filter((f: any) => f.caseId === caseId)
    .map((f: any) => ({ id: f.id, name: f.name, size: f.size, type: f.type }));

  res.json({ caseId, files, count: files.length });
});

export default router;
