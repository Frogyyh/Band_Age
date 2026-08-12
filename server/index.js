import 'dotenv/config';
import { app } from './app.js';
import { connectDB } from './config/db.js';

// 배포 환경(Render/Railway/EC2 등)에 이 값들이 설정되지 않으면
// 로컬에서는 잘 되다가 배포하면 원인 모르게 죽는 흔한 원인이라 미리 검증한다.
const REQUIRED_ENV_VARS = ['MONGODB_URI', 'JWT_SECRET'];
for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

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
