// index.html + 모든 JS/CSS/PNG 를 하나의 HTML 파일로 굽는다.
// 사용: node tools/build-single-file.js  →  dist/dragon-field.html
//
// 진입점은 manifest.json 을 읽어 자동 생성한다. 에셋을 추가해도 이 파일은 고칠 필요가 없다.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GEN = path.join(__dirname, '.entry.generated.js');

// 0.80.27 — 한 장짜리 html 에 넣지 않는 그림. 갑옷 한 벌 8방향(dir8:<몸>:<등급>, 24장 · 5MB 남짓)을 넣으면 20MB 를 넘는다.
// 그림 표에서 아예 빼므로 게임은 그 그림을 모른다 → 갑옷을 입으면 예전 그림(앞모습 + 층)으로 그린다(BodyLook.dir8Outfit).
const SINGLE_SKIP = (key) => /^dir8:[^:]+:[^:]+$/.test(key);

function makeEntry() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/manifest.json'), 'utf8'));
  const imports = [];
  const pairs = [];
  const skip = Object.keys(manifest).filter(SINGLE_SKIP);

  Object.entries(manifest).forEach(([key, def], i) => {
    if (!def.src || SINGLE_SKIP(key)) return;
    const varName = `a${i}`;
    imports.push(`import ${varName} from '../${def.src}';`);
    pairs.push(`  ${JSON.stringify(key)}: ${varName},`);
  });

  // 0.59 — 배경 음악도 파일 안에 박는다.
  //
  // 그림과 같은 이유다. 한 장짜리 html 의 값어치는 **인터넷도 서버도 없이 파일 하나로
  // 도는 것**이고, mp3 를 옆에 두면 그 성질이 깨진다(파일을 옮기다 음악만 빠진다).
  // esbuild 의 dataurl 로 넣으므로 코드는 서버로 돌 때와 같은 길(fetch)을 쓴다.
  const audio = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/audio.json'), 'utf8'));
  const songs = audio['곡'] || {};
  const audioImports = [];
  const audioPairs = [];
  Object.entries(songs).forEach(([key, def], i) => {
    if (!def || !def.src) return;
    const varName = `m${i}`;
    audioImports.push(`import ${varName} from '../${def.src}';`);
    audioPairs.push(`  ${JSON.stringify(key)}: ${varName},`);
  });

  return `// 자동 생성 파일 — build-single-file.js 가 만든다. 직접 고치지 말 것.
import { bootstrap, prepareDatabase } from '../src/main.js';
import manifest from '../src/data/manifest.json';
import items from '../src/data/items.json';
import monsters from '../src/data/monsters.json';
import maps from '../src/data/maps.json';
import npcs from '../src/data/npcs.json';
import player from '../src/data/player.json';
import appearance from '../src/data/appearance.json';
import classes from '../src/data/classes.json';
import traits from '../src/data/traits.json';
import stats from '../src/data/stats.json';
import skills from '../src/data/skills.json';
import drops from '../src/data/drops.json';
import quests from '../src/data/quests.json';
import affixes from '../src/data/affixes.json';
import bodies from '../src/data/bodies.json';
import dir8 from '../src/data/dir8.json';
import audio from '../src/data/audio.json';
import achievements from '../src/data/achievements.json';
import tower from '../src/data/tower.json';
import arena from '../src/data/arena.json';
${imports.join('\n')}
${audioImports.join('\n')}

const INLINED = {
${pairs.join('\n')}
};

const INLINED_AUDIO = {
${audioPairs.join('\n')}
};

const SKIP = new Set(${JSON.stringify(skip)});
const inlinedManifest = Object.fromEntries(
  Object.entries(manifest)
    .filter(([key]) => !SKIP.has(key))
    .map(([key, def]) => [key, { ...def, src: INLINED[key] || def.src }])
);

// 곡의 주소를 data: 로 갈아 끼운다. 나머지 칸(loop 등)은 그대로 둔다.
const inlinedAudio = {
  ...audio,
  ['\uACE1']: Object.fromEntries(
    Object.entries(audio['\uACE1'] || {}).map(([key, def]) => [
      key, { ...def, src: INLINED_AUDIO[key] || def.src },
    ])
  ),
};

bootstrap(prepareDatabase({
  manifest: inlinedManifest, items, monsters, maps, npcs, player, appearance,
  classes, traits, stats, skills, drops, quests, affixes, bodies, dir8, audio: inlinedAudio, achievements, tower, arena,
}));
`;
}

/**
 * 표(src/data/*.json)의 기준 시각 — 가장 최근에 손댄 표의 시각.
 *
 * 왜 필요한가 (0.58):
 * 한 장짜리 html 은 표를 **안에 박아 굽는다.** 그러니 구운 뒤에 구글 시트를 고쳐도
 * 그 파일은 절대 안 바뀐다 — 구조가 그렇다. 그런데 화면에 아무 표시가 없어서
 * "받은 html 이 시트와 다르다" 로만 보였다. 그래서 이 시각을 파일에 새겨
 * 접속 화면에 찍는다. 시트를 고친 시각보다 이게 앞서면 다시 구우면 된다.
 */
function dataStamp() {
  const dir = path.join(ROOT, 'src/data');
  let newest = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const t = fs.statSync(path.join(dir, f)).mtimeMs;
    if (t > newest) newest = t;
  }
  const d = new Date(newest);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

// 0.80.27 — 한 장짜리 html 에만 그림을 더 세게 압축해 박는다(사용자 답 "B안"). 저장소 그림은 그대로라
// 웹 판(서버)은 원본 화질이다. 사본은 dist/.pack-q<품질>a<투명>/ 에 두고, 원본이 바뀌면 다시 굽는다.
// python3 · PIL 이 없으면 원본을 그대로 박는다(그러면 20MB 를 넘을 수 있다 — 끝에 크기를 본다).
const PACK = {
  quality: 60,
  alpha: 75,
  prefixes: [
    'assets/bodies/',
    'assets/sprites/monsters/',
    'assets/sprites/characters/',
    'assets/sprites/npc/',
    'assets/ui/title/',
  ],
};
const PACK_DIR = path.join(ROOT, 'dist', `.pack-q${PACK.quality}a${PACK.alpha}`);

function packImages() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/manifest.json'), 'utf8'));
  const list = [...new Set(
    Object.values(manifest)
      .map((d) => d && d.src)
      .filter((s) => s && s.endsWith('.webp') && PACK.prefixes.some((p) => s.startsWith(p)))
  )];
  fs.mkdirSync(PACK_DIR, { recursive: true });
  const listFile = path.join(PACK_DIR, 'list.json');
  fs.writeFileSync(listFile, JSON.stringify(list));
  const r = require('child_process').spawnSync(
    'python3',
    [path.join(__dirname, 'pack-single.py'), listFile, PACK_DIR, String(PACK.quality), String(PACK.alpha)],
    { stdio: 'inherit' }
  );
  if (r.status !== 0) {
    console.log('⚠ 그림 다시 압축을 못 했습니다(python3 · PIL) — 원본 그림을 그대로 박습니다.');
    return new Set();
  }
  return new Set(list.filter((rel) => fs.existsSync(path.join(PACK_DIR, rel))));
}

function packPlugin(packed) {
  return {
    name: 'pack-single',
    setup(build) {
      build.onLoad({ filter: /\.webp$/ }, (args) => {
        const rel = path.relative(ROOT, args.path).split(path.sep).join('/');
        if (!packed.has(rel)) return undefined;
        return { contents: fs.readFileSync(path.join(PACK_DIR, rel)), loader: 'dataurl' };
      });
    },
  };
}

(async () => {
  fs.writeFileSync(GEN, makeEntry());
  const packed = packImages();

  const result = await esbuild.build({
    entryPoints: [GEN],
    bundle: true,
    write: false,
    format: 'iife',
    minify: true,
    plugins: [packPlugin(packed)],
    loader: { '.png': 'dataurl', '.webp': 'dataurl', '.mp3': 'dataurl', '.json': 'json' },
    // 표의 기준 시각을 파일에 새긴다(config.js 의 DATA_STAMP 가 이걸 읽는다).
    define: { __DF_DATA_STAMP: JSON.stringify(dataStamp()) },
    target: ['es2020'],
  });

  const js = result.outputFiles[0].text;
  const reset = fs.readFileSync(path.join(ROOT, 'styles/reset.css'), 'utf8');
  const ui = fs.readFileSync(path.join(ROOT, 'styles/ui.css'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  const rawBody = html
    .split('<body>')[1]
    .split('</body>')[0]
    .replace(/<script[\s\S]*?<\/script>/g, '');

  // esbuild는 JS 안의 비ASCII를 \u 이스케이프하지만 HTML 본문은 그대로 남는다.
  // 파일이 charset 없이 서빙돼도 깨지지 않도록 본문의 비ASCII를 숫자 참조로 바꾼다.
  const body = rawBody.replace(/[^\x00-\x7F]/g, (c) => `&#${c.codePointAt(0)};`);

  // index.html 의 <head> 안 메타 태그를 그대로 가져온다.
  // 특히 viewport 메타가 빠지면 아이폰 사파리가 980px 짜리 데스크톱 화면으로 그려서
  // 게임이 화면 밖으로 튀어나간다. (단일 파일이야말로 폰에서 열 확률이 높다)
  const headMeta = (html.match(/<meta[^>]*>/g) || [])
    .filter((m) => !/charset/i.test(m))
    .join('\n');

  const out = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
${headMeta}
<title>드래곤 필드</title>
<style>
${reset}
${ui}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>
`;

  const dir = path.join(ROOT, 'dist');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'dragon-field.html');
  fs.writeFileSync(file, out);
  fs.unlinkSync(GEN);
  console.log(`✓ ${file}  (${(out.length / 1024).toFixed(0)} KB)`);
})();
