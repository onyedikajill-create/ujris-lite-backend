import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import uploadRoutes from './routes/upload';
import analyseRoutes from './routes/analyse';
import pdfRoutes from './routes/pdf';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', uploadRoutes);
app.use('/api', analyseRoutes);
app.use('/api', pdfRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`UJRIS backend running on port ${PORT}`);
});
