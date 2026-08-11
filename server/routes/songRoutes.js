import { Router } from 'express';
import { listAllSongs, listMySongs, uploadSongFile, deleteSong } from '../controllers/songController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadSong } from '../config/upload.js';

const router = Router();

router.get('/', listAllSongs);
router.get('/mine', requireAuth, listMySongs);

router.post('/', requireAuth, (req, res, next) => {
  uploadSong.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || '업로드에 실패했습니다.' });
    }
    next();
  });
}, uploadSongFile);

router.delete('/:id', requireAuth, deleteSong);

export default router;
