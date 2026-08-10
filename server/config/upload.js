import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', 'uploads', 'avatars');

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user._id}-${Date.now()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('이미지 파일(jpg, png, webp, gif)만 업로드할 수 있습니다.'));
  }
  cb(null, true);
}

export const uploadAvatar = multer({
  storage,
  fileFilter,
  // 프론트에서 업로드 전에 512px로 리사이즈해서 보내지만, 혹시 모를 큰 파일을 대비해 여유를 둔다.
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});
