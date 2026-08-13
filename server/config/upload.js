import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, '..', 'uploads');
const songDir = path.join(uploadsRoot, 'songs');

fs.mkdirSync(songDir, { recursive: true });

const songStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, songDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user._id}-${Date.now()}${ext}`);
  },
});

function audioFileFilter(req, file, cb) {
  const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('오디오 파일만 업로드할 수 있습니다.'));
  }
  cb(null, true);
}

export const uploadSong = multer({
  storage: songStorage,
  fileFilter: audioFileFilter,
  // 스테이지 믹스다운은 무압축 WAV로 내보내져서 곡 길이에 따라 수십~100MB를 넘길 수 있다
  // (44.1kHz 스테레오 기준 1분당 약 10MB). 넉넉히 200MB로 잡는다.
  limits: { fileSize: 200 * 1024 * 1024 },
});

// fileUrl은 "/uploads/songs/x.mp3" 같은 웹 경로. 실제 파일은 server/uploads/ 아래에 있으므로
// process.cwd() 기준(프로젝트 루트)이 아니라 이 설정 파일 기준으로 절대 경로를 계산해야 한다.
export function deleteUploadedFile(fileUrl) {
  if (!fileUrl) return;
  const filePath = path.join(uploadsRoot, fileUrl.replace(/^\/uploads\//, ''));
  fs.unlink(filePath, () => {});
}
