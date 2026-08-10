import mongoose from 'mongoose';

const songSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    artist: { type: String, trim: true },
    fileUrl: { type: String, required: true },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Song', songSchema);
