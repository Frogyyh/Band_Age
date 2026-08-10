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
    provider: {
      type: String,
      enum: ['local', 'google', 'kakao'],
      default: 'local',
    },
    // SNS 로그인 시 발급되는 외부 계정 식별자 (예: Google sub, Kakao id 값)
    providerId: {
      type: String,
      default: null,
    },
    favoriteSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
    uploadedSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
  },
  { timestamps: true }
);

userSchema.index({ provider: 1, providerId: 1 }, { unique: true, sparse: true });

export default mongoose.model('User', userSchema);
