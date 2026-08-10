import { Router } from 'express';
import { listPosts, createPost, getPost } from '../controllers/postController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', listPosts);
router.post('/', requireAuth, createPost);
router.get('/:id', getPost);

export default router;
