import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';

function toPublicUser(user) {
  return {
    id: user._id,
    username: user.username,
    nickname: user.nickname,
    provider: user.provider,
  };
}

export async function register(req, res) {
  const { username, password, nickname } = req.body;

  if (!username || !password || !nickname) {
    return res.status(400).json({ message: 'username, password, nickname은 필수입니다.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: '비밀번호는 8자 이상이어야 합니다.' });
  }

  const existing = await User.findOne({ username });
  if (existing) {
    return res.status(409).json({ message: '이미 사용 중인 아이디입니다.' });
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({
    username,
    password: hashed,
    nickname,
    provider: 'local',
  });

  const token = generateToken(user._id);
  res.status(201).json({ token, user: toPublicUser(user) });
}

export async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'username, password는 필수입니다.' });
  }

  const user = await User.findOne({ username }).select('+password');
  if (!user || user.provider !== 'local' || !user.password) {
    return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  const token = generateToken(user._id);
  res.json({ token, user: toPublicUser(user) });
}

export async function getMe(req, res) {
  const user = await User.findById(req.user._id)
    .populate('favoriteSongs')
    .populate('uploadedSongs');

  res.json({
    ...toPublicUser(user),
    favoriteSongs: user.favoriteSongs,
    uploadedSongs: user.uploadedSongs,
  });
}
