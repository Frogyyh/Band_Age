import mongoose from 'mongoose';

const songSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    artist: { type: String, trim: true },
    fileUrl: { type: String, required: true },
    // 재생 시간(초). 업로드 시 브라우저에서 오디오 메타데이터로 읽어서 보낸다.
    duration: { type: Number, default: null },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // 목록 조회마다 uploader를 populate하지 않도록 닉네임을 그대로 저장해둔다.
    uploaderNickname: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Song', songSchema);
