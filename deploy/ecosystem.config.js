// pm2로 Node 백엔드 + Python 음원분리 서버를 같이 관리한다.
// 사용법: pm2 start deploy/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'band-age-api',
      cwd: '/home/ubuntu/band-age',
      script: 'server/index.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'band-age-audio-server',
      cwd: '/home/ubuntu/band-age/audio-server',
      script: 'server.py',
      interpreter: '/home/ubuntu/band-age/audio-server/venv/bin/python3',
    },
  ],
};
