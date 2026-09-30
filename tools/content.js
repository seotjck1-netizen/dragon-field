#!/usr/bin/env node
/**
 * 콘텐츠(아이템·드랍표·퀘스트 등) 배포 도구.
 *
 *   node tools/content.js status          지금 배포 중인 버전과 표 상태
 *   node tools/content.js check           표가 서로 앞뒤가 맞는지 검사만
 *   node tools/content.js push            src/data → server/content 로 복사
 *   node tools/content.js publish "메모"   검사 후 버전을 올려 배포
 *   node tools/content.js release "메모"   push + publish 를 한 번에
 *   node tools/content.js history         남아 있는 버전 목록
 *   node tools/content.js rollback 3      v3 내용으로 되돌린다
 *
 * 서버가 켜져 있으면 server/content 폴더를 감시하고 있으므로
 * push 만 해도 자동으로 검사·배포·알림까지 간다. publish 는 수동 배포용이다.
 */
const content = require('../server/content.js');

const [, , cmd = 'status', ...rest] = process.argv;
const note = rest.join(' ');

function printIssues(result) {
  for (const e of result.errors || []) console.log('  ✗', e);
  for (const w of result.warnings || []) console.log('  ·', w);
}

function status() {
  content.initFromSource();
  const v = content.readVersion();
  const r = content.inspect();
  console.log(`\n배포 중인 콘텐츠 : v${v.version}`);
  console.log(`배포 시각        : ${v.publishedAt || '-'}`);
  if (v.note) console.log(`메모             : ${v.note}`);
  console.log(`폴더             : ${content.CONTENT_DIR}\n`);
  if (r.ok) {
    console.log('✓ 표에 문제가 없습니다.');
    for (const w of r.warnings) console.log('  ·', w);
  } else {
    console.log('⚠ 문제가 있어 이대로는 배포되지 않습니다:');
    printIssues(r);
  }
  console.log('');
}

function check() {
  content.initFromSource();
  const r = content.inspect();
  if (r.ok) {
    console.log('✓ 표에 문제가 없습니다.');
    for (const w of r.warnings) console.log('  ·', w);
  } else {
    console.log('⚠ 문제를 찾았습니다:');
    printIssues(r);
    process.exitCode = 1;
  }
}

function push() {
  content.initFromSource();
  const changed = content.pushFromSource();
  if (!changed.length) {
    console.log('바뀐 표가 없습니다. (src/data 와 server/content 가 같습니다)');
    return [];
  }
  console.log(`src/data → server/content 복사 ${changed.length}개:`);
  for (const c of changed) console.log('  ·', c);
  return changed;
}

function publish(msg) {
  content.initFromSource();
  const r = content.publish(msg);
  if (!r.ok) {
    console.log('⚠ 검사에 걸려 배포하지 않았습니다:');
    printIssues(r);
    process.exitCode = 1;
    return;
  }
  for (const w of r.warnings) console.log('  ·', w);
  console.log(`✓ 콘텐츠 v${r.version} 배포 완료${r.note ? ` — ${r.note}` : ''}`);
  console.log('  (서버가 켜져 있다면 접속자에게 자동으로 알림이 갑니다)');
}

if (cmd === 'status') status();
else if (cmd === 'check') check();
else if (cmd === 'push') push();
else if (cmd === 'publish') publish(note);
else if (cmd === 'release') {
  push();
  publish(note || '개발본 반영');
} else if (cmd === 'history') {
  const list = content.history();
  const cur = content.readVersion().version;
  console.log(`\n지금 : v${cur}`);
  console.log(`스냅샷: ${list.length ? list.map((v) => `v${v}`).join(', ') : '없음'}\n`);
} else if (cmd === 'rollback') {
  const target = Number(rest[0]);
  if (!target) {
    console.log('되돌릴 버전을 적어 주세요. 예) node tools/content.js rollback 3');
    process.exitCode = 1;
  } else {
    const r = content.rollback(target);
    if (!r.ok) {
      console.log('⚠', r.error);
      process.exitCode = 1;
    } else {
      console.log(`✓ v${target} 내용으로 되돌렸습니다 (새 버전 v${r.version})`);
    }
  }
} else {
  console.log('알 수 없는 명령입니다. 파일 맨 위의 사용법을 보세요.');
  process.exitCode = 1;
}
