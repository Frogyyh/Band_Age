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
  // access_token 외에 refresh_token/expires_in도 필요하다 (탈퇴 시점에
  // 카카오톡 메시지를 보내려면 로그인 당시 토큰을 나중에 재사용/갱신해야 함).
  return data;
}

export async function refreshKakaoAccessToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.KAKAO_CLIENT_ID,
    refresh_token: refreshToken,
  });
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
    throw new Error(data.error_description || 'Kakao token refresh failed');
  }
  return data;
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

// "나에게 보내기" — 카카오톡 메시지 전송(talk_message) 동의항목이 필요하다.
export async function sendKakaoMemoToSelf(accessToken, text) {
  const templateObject = {
    object_type: 'text',
    text,
    link: {
      web_url: process.env.FRONTEND_URL || 'http://localhost:5173',
      mobile_web_url: process.env.FRONTEND_URL || 'http://localhost:5173',
    },
  };
  const params = new URLSearchParams({ template_object: JSON.stringify(templateObject) });

  const res = await fetch(`${KAKAO_API_BASE}/v2/api/talk/memo/default/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.msg || 'Failed to send Kakao message');
  }
  return data;
}
