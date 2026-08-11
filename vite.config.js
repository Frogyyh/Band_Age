import { defineConfig } from 'vite';

export default defineConfig({
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
