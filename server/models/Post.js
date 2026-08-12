import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    content: { type: String, required: true, trim: true, maxlength: 5000 },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // 목록 조회마다 author를 populate하지 않도록 닉네임을 그대로 저장해둔다.
    // 작성 시점 기준으로 고정되고, 이후 닉네임을 바꿔도 과거 글은 안 바뀐다.
    authorNickname: { type: String, required: true },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Post', postSchema);
