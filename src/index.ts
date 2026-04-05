import express from 'express';
import cors from 'cors';
import uploadRoutes from './routes/upload';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', uploadRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`UJRIS backend running on port ${PORT}`);
});
