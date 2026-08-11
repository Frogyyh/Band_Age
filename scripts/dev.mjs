import { spawn } from 'node:child_process';

const children = new Set();
let shuttingDown = false;

function start(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  });
  children.add(child);
  child.on('exit', (code) => {
    children.delete(child);
    if (!shuttingDown && code) {
      console.error(`[dev] ${label} exited with code ${code}.`);
    }
  });
  return child;
}

start('API server', ['server/index.js']);
start('Vite client', ['node_modules/vite/bin/vite.js', '--configLoader', 'runner']);

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => child.kill());
  setTimeout(() => process.exit(0), 100).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
