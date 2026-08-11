import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, '..', 'uploads');
const avatarDir = path.join(uploadsRoot, 'avatars');
const songDir = path.join(uploadsRoot, 'songs');

fs.mkdirSync(avatarDir, { recursive: true });
fs.mkdirSync(songDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user._id}-${Date.now()}${ext}`);
  },
});

function imageFileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('이미지 파일(jpg, png, webp, gif)만 업로드할 수 있습니다.'));
  }
  cb(null, true);
}

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFileFilter,
  // 프론트에서 업로드 전에 512px로 리사이즈해서 보내지만, 혹시 모를 큰 파일을 대비해 여유를 둔다.
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

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
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// fileUrl은 "/uploads/avatars/x.png" 같은 웹 경로. 실제 파일은 server/uploads/ 아래에 있으므로
// process.cwd() 기준(프로젝트 루트)이 아니라 이 설정 파일 기준으로 절대 경로를 계산해야 한다.
export function deleteUploadedFile(fileUrl) {
  if (!fileUrl) return;
  const filePath = path.join(uploadsRoot, fileUrl.replace(/^\/uploads\//, ''));
  fs.unlink(filePath, () => {});
}
