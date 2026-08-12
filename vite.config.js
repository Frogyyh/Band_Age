import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      // audio-server 전체를 제외: venv(수만 개 파일) 재귀 감시 + demucs가 계속 써대는
      // uploads/sessions 임시 파일 때문에 워처가 CPU를 다 잡아먹는 문제 방지
      ignored: ['**/audio-server/**'],
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
