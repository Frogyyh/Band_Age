import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      // audio-server 전체를 제외: venv(수만 개 파일) 재귀 감시 + demucs가 계속 써대는
      // uploads/sessions 임시 파일 때문에 워처가 CPU를 다 잡아먹는 문제 방지
      ignored: ['**/audio-server/**'],
    },
    // 프론트 코드는 API_BASE를 상대경로('/api')로 쓴다 (배포 시 도메인이 바뀌어도
    // 코드를 안 고쳐도 되게). 로컬 개발에서는 그 상대경로가 실제 백엔드(4000)/
    // 음원분리 서버(8000)로 가도록 Vite dev 서버가 대신 프록시해준다.
    // 프로덕션에서는 nginx(deploy/nginx.conf)가 같은 역할을 한다.
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/separate': 'http://localhost:8000',
      '/jobs': 'http://localhost:8000',
      '/stems': 'http://localhost:8000',
      '/session': 'http://localhost:8000',
    },
  },
  build: {
    rollupOptions: {
      input: {
        landing: 'index.html',
        lobby: 'lobby.html',
        stage: 'stage.html',
        viewer: 'viewer.html'
      }
    }
  }
});
