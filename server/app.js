import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import postRoutes from './routes/postRoutes.js';
import songRoutes from './routes/songRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// User 스키마가 Song을 populate()로 참조하므로, 실제로 쓰이지 않더라도
// 모델이 한 번은 로드되어 mongoose에 등록되어 있어야 한다.
import './models/Song.js';

export const app = express();

// Render/Railway/API Gateway 등은 리버스 프록시 뒤에서 앱을 실행하므로,
// 이 설정이 없으면 req.ip, https 판별 등이 프록시 기준이 아닌 값으로 잘못 잡힌다.
app.set('trust proxy', 1);

// 배포된 프론트엔드 도메인을 FRONTEND_URL(콤마로 여러 개 가능)에 넣어 제한한다.
// 설정하지 않으면 개발 편의를 위해 모든 오리진을 허용한다.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn('[WARN] FRONTEND_URL is not set — allowing all origins (CORS open).');
}

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  })
);
app.use(express.json());
// Lambda 배포 시에는 파일이 S3에 저장되므로 이 로컬 static 서빙은 EC2/Beanstalk처럼
// 디스크가 살아있는 환경에서만 의미가 있다 (server/lambda.js 쪽에서는 안 씀).
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/songs', songRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});
