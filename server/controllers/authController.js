import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import User from '../models/User.js';
import Post from '../models/Post.js';
import { generateToken } from '../utils/generateToken.js';
import { refreshKakaoAccessToken, sendKakaoMemoToSelf } from '../config/kakao.js';

function toPublicUser(user) {
  return {
    id: user._id,
    username: user.username,
    nickname: user.nickname,
    provider: user.provider,
    avatarUrl: user.avatarUrl || null,
  };
}

function deleteAvatarFile(avatarUrl) {
  if (!avatarUrl) return;
  const filePath = path.join(process.cwd(), avatarUrl.replace(/^\//, ''));
  fs.unlink(filePath, () => {});
}

export async function register(req, res, next) {
  try {
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
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
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
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user._id)
      .populate('favoriteSongs')
      .populate('uploadedSongs');

    res.json({
      ...toPublicUser(user),
      favoriteSongs: user.favoriteSongs,
      uploadedSongs: user.uploadedSongs,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateNickname(req, res, next) {
  try {
    const nickname = (req.body.nickname || '').trim();
    if (!nickname) {
      return res.status(400).json({ message: '닉네임을 입력하세요.' });
    }
    if (nickname.length > 30) {
      return res.status(400).json({ message: '닉네임은 30자 이하여야 합니다.' });
    }

    req.user.nickname = nickname;
    await req.user.save();

    res.json(toPublicUser(req.user));
  } catch (err) {
    next(err);
  }
}

export async function updateAvatar(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '이미지 파일을 첨부하세요.' });
    }

    deleteAvatarFile(req.user.avatarUrl);
    req.user.avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await req.user.save();

    res.json(toPublicUser(req.user));
  } catch (err) {
    next(err);
  }
}

// 로그인 당시 저장해둔 카카오 토큰으로 "나에게 보내기" 알림을 보낸다.
// 실패해도 탈퇴 자체를 막을 이유는 없으니 호출부에서 별도로 감싸서 무시한다.
async function sendKakaoWithdrawalNotice(userId, nickname) {
  const withTokens = await User.findById(userId).select(
    '+kakaoAccessToken +kakaoRefreshToken +kakaoTokenExpiresAt'
  );
  if (!withTokens || !withTokens.kakaoAccessToken) return;

  let accessToken = withTokens.kakaoAccessToken;
  const isExpired =
    !withTokens.kakaoTokenExpiresAt || withTokens.kakaoTokenExpiresAt.getTime() < Date.now();

  if (isExpired) {
    if (!withTokens.kakaoRefreshToken) return;
    const refreshed = await refreshKakaoAccessToken(withTokens.kakaoRefreshToken);
    accessToken = refreshed.access_token;
  }

  await sendKakaoMemoToSelf(
    accessToken,
    `[Band-Age] ${nickname}님, 회원 탈퇴가 정상적으로 처리되었습니다. 그동안 이용해주셔서 감사합니다.`
  );
}

export async function deleteAccount(req, res, next) {
  try {
    if (req.user.provider === 'local') {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ message: '비밀번호를 입력하세요.' });
      }
      const withPassword = await User.findById(req.user._id).select('+password');
      const match = await bcrypt.compare(password, withPassword.password);
      if (!match) {
        return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
      }
    }

    if (req.user.provider === 'kakao') {
      try {
        await sendKakaoWithdrawalNotice(req.user._id, req.user.nickname);
      } catch (err) {
        console.error('Failed to send Kakao withdrawal notice:', err);
      }
    }

    deleteAvatarFile(req.user.avatarUrl);
    // 작성한 게시물은 남기되(게시판 기록 보존), 이 계정으로는 더 이상 로그인할 수 없게 한다.
    await Post.updateMany(
      { author: req.user._id },
      { $set: { authorNickname: `${req.user.nickname} (탈퇴)` } }
    );
    await User.deleteOne({ _id: req.user._id });

    res.json({ message: '탈퇴가 완료되었습니다.' });
  } catch (err) {
    next(err);
  }
}
