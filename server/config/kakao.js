const KAKAO_AUTH_BASE = 'https://kauth.kakao.com';
const KAKAO_API_BASE = 'https://kapi.kakao.com';

export function getKakaoAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_CLIENT_ID,
    redirect_uri: process.env.KAKAO_REDIRECT_URI,
    response_type: 'code',
  });
  return `${KAKAO_AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

export async function exchangeKakaoCode(code) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.KAKAO_CLIENT_ID,
    redirect_uri: process.env.KAKAO_REDIRECT_URI,
    code,
  });
  // Kakao Developers 콘솔에서 "Client Secret 사용"을 켠 경우에만 필요.
  if (process.env.KAKAO_CLIENT_SECRET) {
    params.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
  }

  const res = await fetch(`${KAKAO_AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || 'Kakao token exchange failed');
  }
  return data.access_token;
}

export async function fetchKakaoProfile(accessToken) {
  const res = await fetch(`${KAKAO_API_BASE}/v2/user/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.msg || 'Failed to fetch Kakao profile');
  }
  return data;
}
