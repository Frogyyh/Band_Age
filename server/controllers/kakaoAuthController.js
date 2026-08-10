import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';
import {
  getKakaoAuthorizeUrl,
  exchangeKakaoCode,
  fetchKakaoProfile,
} from '../config/kakao.js';

function getFrontendBaseUrl() {
  const first = (process.env.FRONTEND_URL || '').split(',')[0]?.trim();
  return first || 'http://localhost:5173';
}

function ensureKakaoConfigured(res) {
  if (!process.env.KAKAO_CLIENT_ID || !process.env.KAKAO_REDIRECT_URI) {
    res.status(500).json({ message: '카카오 로그인이 서버에 설정되어 있지 않습니다.' });
    return false;
  }
  return true;
}

// 브라우저를 카카오 로그인 동의 화면으로 리다이렉트한다.
export function kakaoLogin(req, res) {
  if (!ensureKakaoConfigured(res)) return;
  res.redirect(getKakaoAuthorizeUrl());
}

// 카카오가 인가 코드와 함께 이 주소로 리다이렉트해 온다.
export async function kakaoCallback(req, res) {
  if (!ensureKakaoConfigured(res)) return;

  const frontendBase = getFrontendBaseUrl();
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`${frontendBase}/?error=kakao_denied`);
  }

  try {
    const accessToken = await exchangeKakaoCode(code);
    const profile = await fetchKakaoProfile(accessToken);
    const kakaoId = String(profile.id);
    const nickname =
      profile.kakao_account?.profile?.nickname ||
      profile.properties?.nickname ||
      `카카오사용자${kakaoId.slice(-4)}`;

    let user = await User.findOne({ provider: 'kakao', providerId: kakaoId });
    let isNewUser = false;
    if (!user) {
      user = await User.create({
        username: `kakao_${kakaoId}`,
        nickname,
        provider: 'kakao',
        providerId: kakaoId,
      });
      isNewUser = true;
    }

    const token = generateToken(user._id);
    // 프론트엔드(index.html)는 로드 시 쿼리스트링의 token(+newUser)을 읽어 저장해야 한다.
    // newUser=1이면 프론트에서 닉네임 설정 모달을 띄운다 (지금은 카카오 닉네임이 기본값으로 들어가 있음).
    const newUserFlag = isNewUser ? '&newUser=1' : '';
    res.redirect(`${frontendBase}/?token=${token}${newUserFlag}`);
  } catch (err) {
    console.error('Kakao login failed:', err);
    res.redirect(`${frontendBase}/?error=kakao_failed`);
  }
}
