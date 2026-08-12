@echo off
chcp 65001 >nul
echo.
echo  [Band Age - 음원 분리 서버]
echo.

cd /d "%~dp0"

if not exist venv\Scripts\activate.bat (
    echo  가상환경 생성 중...
    python -m venv venv
)
call venv\Scripts\activate.bat

python -c "import fastapi, uvicorn, demucs" 2>nul
if errorlevel 1 (
    echo  패키지 설치 중... (처음 실행 시 수 분 소요)
    pip install -r requirements.txt
)

echo  서버 시작: http://localhost:8000
echo  종료: Ctrl+C
echo.
python server.py
pause
