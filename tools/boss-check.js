#!/usr/bin/env node
// 보스가 제 땅의 잡몹보다 센지 본다.
//
// 왜 이 도구가 있나 (0.49)
//   10단계 보스 발가르는 체력 232, 같은 땅의 악마 병사는 260 이었다.
//   맵 배율(×9.521)은 둘에게 똑같이 걸리므로 순서가 그대로 남아,
//   **보스가 옆의 잡몹보다 얇은** 채로 오래 굴러갔다. 5단계도 같았다(103 < 118).
//   숫자를 손으로 볼 때는 잘 안 보인다 — 표가 두 곳(monsters·maps)에 나뉘어 있어서다.
//   그래서 자를 하나 만들어 둔다.
//
// 규칙: 어떤 땅의 보스는 그 땅에 서는 잡몹 **누구보다도** 체력과 공격력이 높아야 한다.
//       (방어력은 안 본다 — 잘 막는 잡몹이 있는 편이 재미있다)
//
//   node tools/boss-check.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', n), 'utf8'));

const monsters = read('monsters.json');
const mapsFile = read('maps.json');
const maps = mapsFile.maps || mapsFile;

const rows = [];
let bad = 0;

for (const [mapId, def] of Object.entries(maps)) {
  if (!def || typeof def !== 'object' || !def.boss) continue;
  const boss = monsters[def.boss];
  if (!boss) continue;
  const trash = (def.monsters || []).map((id) => [id, monsters[id]]).filter(([, m]) => m);
  if (!trash.length) continue; // 잡몹이 없는 땅(고룡의 둥지)은 견줄 상대가 없다

  for (const [id, m] of trash) {
    const hpOk = boss.stats.hp > m.stats.hp;
    const atkOk = boss.stats.atk > m.stats.atk;
    if (hpOk && atkOk) continue;
    bad++;
    rows.push(
      `  ✗ ${mapId} — 보스 ${boss.name}(hp ${boss.stats.hp} · atk ${boss.stats.atk}) 가 `
      + `잡몹 ${m.name}(hp ${m.stats.hp} · atk ${m.stats.atk}) 보다 `
      + `${!hpOk ? '얇습니다' : ''}${!hpOk && !atkOk ? ' · ' : ''}${!atkOk ? '약하게 때립니다' : ''}`
      + ` [${id}]`
    );
  }
}

console.log('');
console.log('  보스 ↔ 같은 땅 잡몹 견주기');
console.log('  ' + '─'.repeat(72));
if (bad) {
  for (const r of rows) console.log(r);
  console.log('');
  console.log(`  ${bad}군데가 규칙을 어깁니다.`);
  process.exit(1);
}
console.log('  ✓ 모든 보스가 제 땅의 잡몹보다 체력·공격력이 높습니다.');
console.log('');
