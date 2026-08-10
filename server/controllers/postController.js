import Post from '../models/Post.js';

export async function listPosts(req, res, next) {
  try {
    const sortKey = req.query.sort === 'views' ? { views: -1, createdAt: -1 } : { createdAt: -1 };
    const posts = await Post.find().sort(sortKey).limit(100);
    res.json(posts);
  } catch (err) {
    next(err);
  }
}

export async function createPost(req, res, next) {
  try {
    const { title, content } = req.body;
    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({ message: '제목과 내용을 입력하세요.' });
    }

    const post = await Post.create({
      title: title.trim(),
      content: content.trim(),
      author: req.user._id,
      authorNickname: req.user.nickname,
    });
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
}

export async function getPost(req, res, next) {
  try {
    const post = await Post.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
    if (!post) {
      return res.status(404).json({ message: '게시물을 찾을 수 없습니다.' });
    }
    res.json(post);
  } catch (err) {
    next(err);
  }
}
