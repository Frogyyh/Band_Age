import { Router } from 'express';
import { listPosts, createPost, getPost, deletePost } from '../controllers/postController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', listPosts);
router.post('/', requireAuth, createPost);
router.get('/:id', getPost);
router.delete('/:id', requireAuth, deletePost);

export default router;
