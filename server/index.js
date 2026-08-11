import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import postRoutes from './routes/postRoutes.js';
import songRoutes from './routes/songRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// User 스키마가 Song을 populate()로 참조하므로, 실제로 쓰이지 않더라도
// 모델이 한 번은 로드되어 mongoose에 등록되어 있어야 한다.
import './models/Song.js';

// 배포 환경(Render/Railway 등)에 이 값들이 설정되지 않으면
// 로컬에서는 잘 되다가 배포하면 원인 모르게 죽는 흔한 원인이라 미리 검증한다.
const REQUIRED_ENV_VARS = ['MONGODB_URI', 'JWT_SECRET'];
for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = express();

// Render/Railway 등은 리버스 프록시 뒤에서 앱을 실행하므로,
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

// 플랫폼이 동적으로 할당하는 포트를 반드시 사용해야 한다 (하드코딩 시 배포 환경에서 바인딩 실패).
const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // 배포 플랫폼은 재배포/스케일 다운 시 SIGTERM을 보낸다.
    // 이를 무시하면 연결이 끊기지 않은 채 강제 종료되어 요청이 유실될 수 있다.
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => process.exit(0));
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
