import Song from '../models/Song.js';
import User from '../models/User.js';
import { deleteUploadedFile } from '../config/upload.js';

export async function listAllSongs(req, res, next) {
  try {
    const songs = await Song.find().sort({ createdAt: -1 }).limit(100);
    res.json(songs);
  } catch (err) {
    next(err);
  }
}

export async function listMySongs(req, res, next) {
  try {
    const songs = await Song.find({ uploader: req.user._id }).sort({ createdAt: -1 });
    res.json(songs);
  } catch (err) {
    next(err);
  }
}

export async function uploadSongFile(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '오디오 파일을 첨부하세요.' });
    }
    const title = (req.body.title || req.file.originalname).trim().slice(0, 100);
    const duration = Number(req.body.duration);

    const song = await Song.create({
      title,
      fileUrl: `/uploads/songs/${req.file.filename}`,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      uploader: req.user._id,
      uploaderNickname: req.user.nickname,
    });

    await User.updateOne({ _id: req.user._id }, { $push: { uploadedSongs: song._id } });

    res.status(201).json(song);
  } catch (err) {
    next(err);
  }
}

export async function deleteSong(req, res, next) {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: '트랙을 찾을 수 없습니다.' });
    }
    if (song.uploader.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: '본인이 업로드한 트랙만 삭제할 수 있습니다.' });
    }

    deleteUploadedFile(song.fileUrl);
    await Song.deleteOne({ _id: song._id });
    await User.updateOne({ _id: req.user._id }, { $pull: { uploadedSongs: song._id } });

    res.json({ message: '트랙이 삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
}
