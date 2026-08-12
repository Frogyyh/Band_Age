"""
Band Age - 음원 분리 서버
==========================
FastAPI 서버: 사용자가 mp3를 업로드하면 Demucs로 분리 후 wav 파일을 반환합니다.
front5 프론트엔드(Vite, :5173)와 함께 로컬에서 실행하는 것을 전제로 한다.

실행:
  cd audio-server
  venv\\Scripts\\activate   (Windows)
  python server.py

접속:
  http://localhost:8000/api/health   → 헬스 체크 (프론트는 :5173에서 이 서버로 fetch)

음원 분리 흐름 (비동기):
  POST /separate         → job_id 즉시 반환 (202), 백그라운드에서 Demucs 실행 (항상 htdemucs_6s)
  GET  /jobs/{job_id}    → 작업 상태 폴링 (queued → processing → done | failed)
  done 상태에서 stems URL 포함 → 프론트가 stem 파일 로드

세션 파일 구조:
  sessions/<session_id>/
    originals/   ← 분리 직후 원본 (절대 덮어쓰지 않음)
    current/     ← 실제 재생/사용되는 파일 (믹스 수정본 or 원본 복사)

파일 관리 정책:
  - 믹스로 트랙 수정 → current/<stem>.wav 만 교체, originals 유지
  - 특정 트랙 되돌리기 → originals/<stem>.wav 를 current 로 복사
  - 세션 종료(DELETE /session) 또는 서버 재시작 시 전체 삭제
"""

import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Band Age - Audio Separator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR  = Path("uploads")
SESSION_DIR = Path("sessions")
UPLOAD_DIR.mkdir(exist_ok=True)

# 서버 재시작 시 이전 세션 파일 전체 삭제 (일부가 잠겨 있어도 부팅은 막지 않는다)
if SESSION_DIR.exists():
    shutil.rmtree(SESSION_DIR, ignore_errors=True)
SESSION_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a"}

# 항상 6-stem 모델만 사용한다 (3D 무대의 6개 악기 모두와 매핑하기 위해 클라이언트 선택을 받지 않는다).
MODEL = "htdemucs_6s"
MODEL_STEMS = ["vocals", "drums", "bass", "guitar", "piano", "other"]

MAX_FILE_MB       = 100          # 업로드 파일 크기 제한
MAX_CONCURRENT    = 2            # 동시 Demucs 작업 수 제한


# ── Job 상태 저장소 ────────────────────────────────────────────
# jobs[job_id] = {
#   "status":     "queued" | "processing" | "done" | "failed"
#   "session_id": str | None
#   "model":      str
#   "stems":      { name: url } | None
#   "error":      str | None
#   "created_at": float
# }
jobs: dict = {}
_sem = threading.Semaphore(MAX_CONCURRENT)   # 동시 실행 수 제한


# ── 백그라운드 Demucs 실행 ─────────────────────────────────────
def _run_demucs_job(
    job_id: str,
    session_id: str,
    tmp_path: Path,
    originals_dir: Path,
    current_dir: Path,
):
    """Demucs를 백그라운드 스레드에서 실행하고 jobs 딕셔너리를 업데이트한다."""
    with _sem:   # 최대 MAX_CONCURRENT 개까지만 동시 실행 (나머지는 queued 상태로 대기)
        jobs[job_id]["status"] = "processing"
        try:
            tmp_out = UPLOAD_DIR / f"_out_{session_id}"
            result = subprocess.run(
                [
                    sys.executable, "-m", "demucs",
                    "--name", MODEL,
                    "--out", str(tmp_out),
                    str(tmp_path),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            tmp_path.unlink(missing_ok=True)

            if result.returncode != 0:
                shutil.rmtree(tmp_out, ignore_errors=True)
                raise RuntimeError(f"Demucs 오류:\n{result.stderr}")

            # originals 에 저장 + current 에 복사
            demucs_out = tmp_out / MODEL / tmp_path.stem
            for wav in demucs_out.glob("*.wav"):
                shutil.move(str(wav), originals_dir / wav.name)
                shutil.copy2(originals_dir / wav.name, current_dir / wav.name)
            shutil.rmtree(tmp_out, ignore_errors=True)

            # 응답 URL 구성
            stems = {}
            for stem in MODEL_STEMS:
                if (current_dir / f"{stem}.wav").exists():
                    stems[stem] = f"/stems/{session_id}/{stem}.wav"

            jobs[job_id].update({
                "status":     "done",
                "session_id": session_id,
                "stems":      stems,
            })

        except Exception as exc:
            tmp_path.unlink(missing_ok=True)
            shutil.rmtree(SESSION_DIR / session_id, ignore_errors=True)
            jobs[job_id].update({
                "status": "failed",
                "error":  str(exc),
            })


# ── 헬스 체크 ──────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return JSONResponse({"ok": True})


# ── 로컬 단독 테스트용 업로드 페이지 (선택) ─────────────────────
@app.get("/")
def index():
    upload_page = Path(__file__).parent.parent / "separate.html"
    if upload_page.exists():
        return FileResponse(upload_page)
    return JSONResponse({"ok": True, "message": "Band Age Audio Separator API"})


# ── 음원 분리 요청 (비동기 Job) ────────────────────────────────
@app.post("/separate", status_code=202)
async def separate_audio(
    file: UploadFile = File(...),
):
    # 확장자 검증
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"지원하지 않는 형식입니다: {suffix}")

    # 파일 크기 제한
    content = await file.read()
    if len(content) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(413, f"파일 크기는 {MAX_FILE_MB}MB 이하여야 합니다.")

    # 세션 및 Job ID 생성
    session_id    = uuid.uuid4().hex
    job_id        = uuid.uuid4().hex
    originals_dir = SESSION_DIR / session_id / "originals"
    current_dir   = SESSION_DIR / session_id / "current"
    originals_dir.mkdir(parents=True)
    current_dir.mkdir(parents=True)

    # 임시 파일 저장
    tmp_path = UPLOAD_DIR / f"{session_id}{suffix}"
    tmp_path.write_bytes(content)

    # Job 등록
    jobs[job_id] = {
        "status":     "queued",
        "session_id": None,
        "model":      MODEL,
        "stems":      None,
        "error":      None,
        "created_at": time.time(),
    }

    # 백그라운드 스레드 시작
    threading.Thread(
        target=_run_demucs_job,
        args=(job_id, session_id, tmp_path, originals_dir, current_dir),
        daemon=True,
    ).start()

    return JSONResponse({"job_id": job_id, "status": "queued"}, status_code=202)


# ── 작업 상태 조회 ─────────────────────────────────────────────
@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job을 찾을 수 없습니다.")
    return JSONResponse({
        "job_id":     job_id,
        "status":     job["status"],       # queued | processing | done | failed
        "session_id": job["session_id"],   # done 상태에서만 값 있음
        "model":      job["model"],
        "stems":      job["stems"],        # done 상태에서만 값 있음 { name: url }
        "error":      job["error"],        # failed 상태에서만 값 있음
    })


# ── 트랙 서빙 (current 기준) ───────────────────────────────────
@app.get("/stems/{session_id}/{stem}")
def get_stem(session_id: str, stem: str):
    path = SESSION_DIR / session_id / "current" / stem
    if not path.exists():
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    return FileResponse(path, media_type="audio/wav")


# ── 믹스 수정: 특정 트랙 교체 (originals 는 유지) ──────────────
@app.put("/stems/{session_id}/{stem_name}")
async def update_stem(
    session_id: str,
    stem_name: str,
    file: UploadFile = File(...),
):
    current_dir = SESSION_DIR / session_id / "current"
    if not current_dir.exists():
        raise HTTPException(404, "세션을 찾을 수 없습니다.")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".wav", ".mp3", ".flac"}:
        raise HTTPException(400, "지원하지 않는 형식입니다.")

    target = current_dir / f"{stem_name}.wav"
    target.unlink(missing_ok=True)
    with target.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    return JSONResponse({"updated": stem_name, "url": f"/stems/{session_id}/{stem_name}.wav"})


# ── 특정 트랙 원본으로 되돌리기 ───────────────────────────────
@app.post("/stems/{session_id}/{stem_name}/revert")
def revert_stem(session_id: str, stem_name: str):
    session_path = SESSION_DIR / session_id
    original = session_path / "originals" / f"{stem_name}.wav"
    current  = session_path / "current"   / f"{stem_name}.wav"

    if not original.exists():
        raise HTTPException(404, f"원본 {stem_name} 을 찾을 수 없습니다.")

    shutil.copy2(original, current)
    return JSONResponse({"reverted": stem_name, "url": f"/stems/{session_id}/{stem_name}.wav"})


# ── 세션 종료: 임시 파일 전체 삭제 ────────────────────────────
@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    session_path = SESSION_DIR / session_id
    if not session_path.exists():
        raise HTTPException(404, "세션을 찾을 수 없습니다.")
    # 파일이 다른 프로세스에 의해 잠겨 있어도 요청 자체는 실패시키지 않는다 (서버 재시작 시 최종 정리됨).
    shutil.rmtree(session_path, ignore_errors=True)
    return JSONResponse({"deleted": session_id})


# ── 실행 ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
