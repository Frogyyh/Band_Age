import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: '인증이 필요합니다.' });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
}
