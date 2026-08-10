import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    // 로컬 회원가입 사용자만 필요. SNS(구글 등) 로그인 사용자는 비밀번호가 없음.
    password: {
      type: String,
      required: function () {
        return this.provider === 'local';
      },
      select: false,
    },
    nickname: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    provider: {
      type: String,
      enum: ['local', 'google', 'kakao'],
      default: 'local',
    },
    // SNS 로그인 시 발급되는 외부 계정 식별자 (예: Google sub, Kakao id 값).
    // 로컬 가입 사용자는 이 필드를 아예 비워둬야 한다 — sparse 유니크 인덱스가
    // "필드 없음"만 건너뛰고 null 값은 중복으로 취급하기 때문에, default: null을
    // 쓰면 두 번째 로컬 가입부터 E11000 duplicate key로 죽는다.
    providerId: {
      type: String,
    },
    // 탈퇴 시 카카오톡 "나에게 보내기"로 알림을 보내기 위해 보관한다.
    // 로그인마다 갱신되고, 절대 일반 조회 응답에는 포함되지 않는다.
    kakaoAccessToken: { type: String, select: false },
    kakaoRefreshToken: { type: String, select: false },
    kakaoTokenExpiresAt: { type: Date, select: false },
    favoriteSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
    uploadedSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
  },
  { timestamps: true }
);

// sparse가 아니라 partialFilterExpression을 쓴다: 복합 sparse 인덱스는
// "인덱싱 대상 필드가 전부 없는 문서"만 건너뛰는데, provider는 로컬 사용자도
// 항상 값이 있어서 절대 건너뛰어지지 않는다. partialFilterExpression은
// providerId가 있는(SNS) 문서만 정확히 골라 인덱싱한다.
userSchema.index(
  { provider: 1, providerId: 1 },
  { unique: true, partialFilterExpression: { providerId: { $exists: true } } }
);

export default mongoose.model('User', userSchema);
