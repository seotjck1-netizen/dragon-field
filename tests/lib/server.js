// 시험용 서버를 **따로 떨어진 폴더에서** 띄운다 (0.70.25).
//
// ⚠ 진짜 계정 폴더(server/data)를 절대 건드리지 않는다.
//   0.70.23 까지의 시험(/tmp/srvup.sh)은 시험마다 `rm -rf server/data` 를 했다.
//   작업 공간이 따로 떨어진 그릇일 때는 괜찮았지만, 시험이 저장소 안으로 들어온
//   지금 그대로 두면 **운영 중인 서버에서 `npm test` 한 번에 모든 계정이 사라진다.**
//   그래서 서버가 쓸 폴더를 임시 폴더로 돌려 준다(POINO_DATA_DIR · POINO_CONTENT_DIR).
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/** 게임이 보내는 것과 **같은 방식**의 비밀번호 해시(AccountSystem.hashPassword). */
function hashPw(id, pw) {
  return crypto.createHash('sha256').update(`poino/v1/${String(id).toLowerCase()}/${pw}`).digest('hex');
}

/**
 * @param {object} [env]  더 얹을 환경 변수. ADMIN_KEY 를 '' 로 주면 열쇠 없는 서버가 된다.
 * @returns {{ base, port, dir, call(path, body), stop() }}
 */
async function startServer(env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poino-test-'));
  const port = 20000 + Math.floor(Math.random() * 9000);
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      POINO_DATA_DIR: path.join(dir, 'data'),
      POINO_CONTENT_DIR: path.join(dir, 'content'),
      ADMIN_KEY: 'testkey',
      REGISTER_LIMIT: '500',
      DRAGON_EVERY_MS: '86400000',
      DRAGON_STAY_MS: '86400000',
      // 시트 끌어오기는 끈다 — 시험이 바깥 문서에 기대면 그날 문서에 따라 결과가 바뀐다
      SHEET_POLL_MIN: '0',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  const base = `http://127.0.0.1:${port}`;
  const call = async (p, body = {}, method = 'POST') => {
    const res = await fetch(base + p, {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, ...(data || {}) };
  };

  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(base + '/api/ping'); if (r.ok) break; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 150));
    if (i === 59) { child.kill(); throw new Error('시험 서버가 안 떴습니다:\n' + log.slice(-800)); }
  }

  return {
    base, port, dir, call,
    log: () => log,
    stop() {
      child.kill();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 이미 없음 */ }
    },
  };
}

module.exports = { startServer, hashPw, ROOT };
