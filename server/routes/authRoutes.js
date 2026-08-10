import { Router } from 'express';
import {
  register,
  login,
  getMe,
  updateNickname,
  updateAvatar,
  deleteAccount,
} from '../controllers/authController.js';
import { kakaoLogin, kakaoCallback } from '../controllers/kakaoAuthController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadAvatar } from '../config/upload.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, getMe);
router.patch('/me', requireAuth, updateNickname);
router.delete('/me', requireAuth, deleteAccount);

router.post('/me/avatar', requireAuth, (req, res, next) => {
  uploadAvatar.single('avatar')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || '업로드에 실패했습니다.' });
    }
    next();
  });
}, updateAvatar);

router.get('/kakao', kakaoLogin);
router.get('/kakao/callback', kakaoCallback);

export default router;
