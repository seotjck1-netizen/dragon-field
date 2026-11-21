#!/usr/bin/env python3
"""
장비 미리보기 모음 (0.70.26).

    python3 tools/gear-art.py                 # 장비 그림
    python3 tools/body-anim.py                # 기본 몸 동작
    python3 tools/body-anim.py --gear         # 장비를 입힌 동작
    python3 tools/gear-showcase.py            # ↓ 세 가지
      art/preview/gear-items.png    칸 × 등급 아이템 도감(이름 · 등급 색)
      art/preview/gear-lineup.png   몸마다 기본 → 일반 → … → 전설 한 줄
      art/preview/gear-anim.html    장비별 · 몸별 동작(고르기 · 크기 · 빠르기)
"""
import base64, importlib.util, io, json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
sp = importlib.util.spec_from_file_location('gear_art', os.path.join(ROOT, 'tools', 'gear-art.py'))
GA = importlib.util.module_from_spec(sp)
sp.loader.exec_module(GA)
BR = GA.BR
PREV = os.path.join(ROOT, 'art', 'preview')
ANIM = os.path.join(ROOT, 'art', 'anim')
BODIES = ['m1', 'f1', 'm2', 'f2']
BODY_LABEL = {'m1': '남 · 기본 몸', 'f1': '여 · 기본 몸', 'm2': '남 · 거친 몸', 'f2': '여 · 거친 몸'}
WEAPON_OF = {'m1': 'sword', 'f1': 'staff', 'm2': 'bow', 'f2': 'sword'}
WEAPON_LABEL = {'sword': '칼', 'bow': '활', 'staff': '지팡이'}

# 게임 아이템 이름(src/data/items.json). * 는 게임에 아직 없는 등급이라 붙여 본 이름.
NAMES = {
    'helmet': ['천 두건', '가죽 모자', '기사 투구', '룬 투구', '*용비늘 투구'],
    'armor': ['천 옷', '가죽 갑옷', '기사 갑옷', '룬 갑옷', '용비늘 성갑'],
    'shoulder': ['*천 어깨받이', '가죽 어깨보호구', '강철 어깨갑옷', '룬 어깨갑옷', '*용비늘 어깨갑옷'],
    'gloves': ['천 장갑', '*가죽 장갑', '강철 건틀릿', '룬 건틀릿', '*용발톱 건틀릿'],
    'boots': ['가죽 부츠', '*여행자의 장화', '질주의 부츠', '룬 부츠', '*용비늘 각반'],
    'belt': ['가죽 허리띠', '*주머니 허리띠', '마력의 허리띠', '룬 허리띠', '*용의 허리띠'],
    'necklace': ['나무 부적', '*송곳니 목걸이', '수호의 목걸이', '룬 목걸이', '*용의 눈'],
}
SLOT_LABEL = {'helmet': '투구', 'shoulder': '어깨', 'armor': '갑옷', 'gloves': '장갑', 'boots': '신발', 'belt': '벨트',
              'necklace': '목걸이', 'sword': '무기 · 칼', 'bow': '무기 · 활', 'staff': '무기 · 지팡이'}
NOTE = {('shoulder', 2): '망토 포함', ('shoulder', 3): '망토 포함', ('shoulder', 4): '망토 포함'}


def b64(img, fmt='PNG', q=90):
    buf = io.BytesIO()
    if fmt == 'WEBP':
        img.save(buf, 'WEBP', quality=q, method=6)
    else:
        img.save(buf, 'PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def crop_fit(img, size, pad=10):
    a = np.asarray(img)[..., 3]
    ys, xs = np.where(a > 8)
    if not len(xs):
        return Image.new('RGBA', (size, size))
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad), xs.max() + pad, ys.max() + pad)
    c = img.crop(box)
    k = min(size / c.width, size / c.height)
    c = c.resize((max(1, int(c.width * k)), max(1, int(c.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (size, size))
    out.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2))
    return out


def _crop(img, pad=4):
    a = np.asarray(img)[..., 3]
    ys, xs = np.where(a > 8)
    return img.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), xs.max() + pad, ys.max() + pad))


def piece_image(slot, t, body='m1'):
    """장비 한 벌을 몸 없이 — 도감 그림."""
    if slot in ('sword', 'bow', 'staff'):
        im = Image.open(os.path.join(GA.OUT, 'weapons', f'{slot}_{t}.png')).convert('RGBA')
        if slot == 'bow':
            from PIL import ImageDraw
            ends = json.load(open(os.path.join(GA.OUT, 'weapons', 'weapons.json')))[f'bow_{t}']['ends']
            d = ImageDraw.Draw(im)
            d.line([tuple(ends[0]), tuple(ends[1])], fill=(40, 34, 30, 255), width=5)
            d.line([tuple(ends[0]), tuple(ends[1])], fill=(215, 205, 185, 255), width=2)
        return _crop(im).rotate(-38 if slot != 'bow' else -30, Image.BICUBIC, expand=True)    # 비스듬히 — 도감 칸을 채운다
    parts, info = GA.load_piece(body, slot, t)
    if slot == 'shoulder':
        # 어깨받이 두 짝을 붙여 놓고, 망토가 있으면 뒤에 깐다
        L_, R_ = [_crop(Image.fromarray(parts[k], 'RGBA')) for k in ('padL', 'padR')]
        wdt = L_.width + R_.width + 16
        hgt = max(L_.height, R_.height)
        pair = Image.new('RGBA', (wdt, hgt))
        pair.alpha_composite(L_, (0, 0))
        pair.alpha_composite(R_, (L_.width + 16, 0))
        if 'cape' not in parts:
            return pair
        cape_ = _crop(Image.fromarray(parts['cape'], 'RGBA'))
        k = (wdt * 1.25) / cape_.width
        cape_ = cape_.resize((int(cape_.width * k), int(cape_.height * k)), Image.LANCZOS)
        out = Image.new('RGBA', (cape_.width, cape_.height + 10))
        out.alpha_composite(cape_, (0, 10))
        out.alpha_composite(pair, ((cape_.width - wdt) // 2, 0))
        return out
    order = ['cape', 'legL', 'legR', 'armL', 'armR', 'torso', 'padL', 'padR', 'head']
    if slot == 'gloves':
        order = ['armR']            # 장갑은 한 짝만(크게)
    canvas = np.zeros((GA.H, GA.W, 4), np.uint8)
    for k in order:
        if k in parts:
            canvas = BR._over(canvas, parts[k])
    return Image.fromarray(canvas, 'RGBA')


CSS = """
body{margin:0;background:#171d19;color:#efe9da;font:600 13px/1.35 system-ui,'Noto Sans KR',sans-serif;padding:18px}
h1{font-size:18px;margin:0 0 4px} .sub{color:#aab5a4;font-weight:400;font-size:12.5px;margin:0 0 14px}
table{border-collapse:separate;border-spacing:8px}
th{color:#c9d4c1;font-size:13px;font-weight:600;text-align:center;padding:2px 4px}
th.row{text-align:right;white-space:nowrap;padding-right:6px}
.card{width:128px;border-radius:10px;padding:8px 6px 7px;background:linear-gradient(180deg,#2a322d,#1f2622);
  border:2px solid var(--c);box-shadow:0 0 0 1px #0006 inset, 0 0 12px -2px var(--c);text-align:center}
.card img{width:112px;height:112px;display:block;margin:0 auto 5px;filter:drop-shadow(0 2px 2px #0008)}
.card .n{font-size:12.5px;color:var(--c)} .card .n i{font-style:normal;color:#8e988a;font-size:10.5px;margin-left:2px}
.card .t{font-size:10.5px;color:#9aa596;font-weight:500}
.leg{box-shadow:0 0 0 1px #0006 inset,0 0 18px 1px #ff3b3b}
.tiercol{font-size:13px}
"""


def items_page():
    slots = ['helmet', 'shoulder', 'armor', 'gloves', 'boots', 'belt', 'necklace', 'sword', 'bow', 'staff']
    rows = []
    for slot in slots:
        cells = []
        for t in GA.TIERS:
            img = crop_fit(piece_image(slot, t), 224, 14)
            name = NAMES[slot][t] if slot in NAMES else GA.WEAPON_NAMES[slot][t]
            ex = name.startswith('*')
            name = name.lstrip('*')
            note = NOTE.get((slot, t), '')
            cells.append(f'''<td><div class="card{' leg' if t == 4 else ''}" style="--c:{GA.TIER_COLOR[t]}">
              <img src="data:image/png;base64,{b64(img)}"><div class="n">{name}{'<i>예시</i>' if ex else ''}</div>
              <div class="t">{GA.TIER_NAME[t]}{' · ' + note if note else ''}</div></div></td>''')
        rows.append(f'<tr><th class="row">{SLOT_LABEL[slot]}</th>{"".join(cells)}</tr>')
    head = ''.join(f'<th class="tiercol" style="color:{GA.TIER_COLOR[t]}">{GA.TIER_NAME[t]}</th>' for t in GA.TIERS)
    return f'''<!doctype html><meta charset="utf-8"><style>{CSS}</style>
      <h1>장비 도감 — 희귀도 다섯 단계</h1>
      <p class="sub">이름은 게임 아이템을 따랐습니다. <b>예시</b>는 그 등급의 아이템이 아직 게임에 없어서 붙여 본 이름입니다.
      등급 색(테두리)은 게임 화면의 희귀도 색과 같습니다.</p>
      <table><tr><th></th>{head}</tr>{"".join(rows)}</table>'''


def lineup_page():
    rows = []
    for n in BODIES:
        cells = []
        base = Image.open(os.path.join(ANIM, n, 'idle_0.png')).convert('RGBA')
        imgs = [('기본(맨몸)', '#e9e4d6', base)]
        for t in GA.TIERS:
            p = os.path.join(ANIM, 'gear', f'{n}_{t}', 'idle_0.png')
            imgs.append((GA.TIER_NAME[t], GA.TIER_COLOR[t], Image.open(p).convert('RGBA')))
        for label, col, im in imgs:
            big = im.crop((40, 10, 280, 316))
            cells.append(f'''<td><div class="fig" style="--c:{col}"><img class="big" src="data:image/png;base64,{b64(big)}">
              <div class="small"><img src="data:image/png;base64,{b64(shrink(im, 80))}"></div>
              <div class="lb">{label}</div></div></td>''')
        rows.append(f'<tr><th class="row">{BODY_LABEL[n]}<br><span style="color:#9aa596;font-weight:500">{WEAPON_LABEL[WEAPON_OF[n]]}</span></th>{"".join(cells)}</tr>')
    css = CSS + """
      .fig{width:200px;border-radius:10px;background:repeating-linear-gradient(45deg,#4f8a3e 0 14px,#477f38 14px 28px);
        border:2px solid var(--c);position:relative;padding-bottom:4px}
      .fig img.big{width:200px;height:255px;display:block}
      .fig .small{position:absolute;right:6px;top:6px;background:#0004;border-radius:6px;padding:2px}
      .fig .small img{width:80px;height:80px;display:block}
      .fig .lb{text-align:center;color:var(--c);font-size:14px;text-shadow:0 1px 2px #000}
    """
    return f'''<!doctype html><meta charset="utf-8"><style>{css}</style>
      <h1>장비를 한 벌씩 입혀 본 모습 — 기본 → 일반 → 고급 → 희귀 → 영웅 → 전설</h1>
      <p class="sub">큰 그림은 원본(320×320 틀)이고, 오른쪽 위 작은 그림이 <b>게임에서 실제로 보이는 크기(80×80 틀 · 몸 48×64)</b>입니다.
      영웅은 보랏빛 반짝임, 전설은 붉은 불티가 몸 둘레에 돕니다.</p>
      <table>{"".join(rows)}</table>'''


def shoot(html, out, width):
    hp = out.replace('.png', '.html')
    open(hp, 'w').write(html)
    js = f"""
const {{ chromium }} = require('playwright');
(async () => {{
  const b = await chromium.launch(); const p = await b.newPage({{ viewport: {{ width: {width}, height: 800 }} }});
  await p.goto('file://{os.path.abspath(hp)}'); await p.waitForTimeout(400);
  await p.screenshot({{ path: '{os.path.abspath(out)}', fullPage: true }}); await b.close();
}})();"""
    jp = os.path.join(GA.SVGDIR, 'shot.js')
    os.makedirs(GA.SVGDIR, exist_ok=True)
    open(jp, 'w').write(js)
    env = dict(os.environ)
    subprocess.run(['node', jp], check=True, env=env)
    os.remove(hp)
    print('✓', os.path.relpath(out, ROOT))


# ─────────────────────────────────────────────────────────────
# 움직이는 미리보기
# ─────────────────────────────────────────────────────────────
ANIMS = [('idle', '대기'), ('walk', '걷기'), ('run', '달리기'), ('attack', '공격'), ('hurt', '맞기'), ('victory', '승리')]
BASE_ATTACK = 'punch'        # 맨몸은 주먹으로


def shrink(im, size):
    f = np.asarray(im).astype(np.float32) / 255
    f[..., :3] *= f[..., 3:4]
    return BR.to_image(f, (size, size))


def anim_page():
    gmeta = json.load(open(os.path.join(ANIM, 'gear', 'anims.json')))
    bmeta = json.load(open(os.path.join(ANIM, 'anims.json')))
    data = {}
    for n in BODIES:
        for t in ['base'] + [str(t) for t in GA.TIERS]:
            key = f'{n}_{t}'
            data[key] = {}
            for a, label in ANIMS:
                if t == 'base':
                    src = BASE_ATTACK if a == 'attack' else a
                    fr = bmeta[n][src]['frames']
                    path = lambda i: os.path.join(ANIM, n, f'{src}_{i}.png')
                    loop = bmeta[n][src]['loop']
                else:
                    fr = gmeta[key][a]['frames']
                    path = lambda i: os.path.join(ANIM, 'gear', key, f'{a}_{i}.png')
                    loop = gmeta[key][a]['loop']
                sheets = {}
                for size in (160, 80):
                    sh = Image.new('RGBA', (size * len(fr), size))
                    for i in range(len(fr)):
                        sh.alpha_composite(shrink(Image.open(path(i)).convert('RGBA'), size), (i * size, 0))
                    sheets[size] = b64(sh, 'WEBP', 86)
                data[key][a] = {'frames': fr, 'loop': loop, 'sheets': sheets}
    tiers = [['base', '기본(맨몸)', '#e9e4d6']] + [[str(t), GA.TIER_NAME[t], GA.TIER_COLOR[t]] for t in GA.TIERS]
    bodies = [[n, BODY_LABEL[n], WEAPON_LABEL[WEAPON_OF[n]]] for n in BODIES]
    page = HTML.replace('__DATA__', json.dumps(data)).replace('__TIERS__', json.dumps(tiers, ensure_ascii=False)) \
               .replace('__BODIES__', json.dumps(bodies, ensure_ascii=False)).replace('__ANIMS__', json.dumps(ANIMS, ensure_ascii=False))
    p = os.path.join(PREV, 'gear-anim.html')
    open(p, 'w').write(page)
    print('✓', os.path.relpath(p, ROOT), f'{len(page) // 1024}KB')


HTML = r'''<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>장비 동작 미리보기</title>
<style>
:root{--bg:#171d19;--panel:#222b25;--ink:#efe9da;--dim:#a9b4a3;--acc:#e6c35c}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:500 14px/1.45 system-ui,"Noto Sans KR",sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--panel);padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;border-bottom:1px solid #0005}
h1{font-size:16px;margin:0 10px 0 0}
.grp{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.grp span{color:var(--dim);font-size:12px;margin-right:4px}
button{background:#33443a;color:var(--ink);border:1px solid #0004;border-radius:6px;padding:4px 10px;font:inherit;font-size:13px;cursor:pointer}
button.on{background:var(--acc);color:#2a2410;font-weight:700}
main{padding:12px 16px 40px;overflow-x:auto}
table{border-collapse:separate;border-spacing:8px}
th{font-weight:600;color:var(--dim);font-size:13px;text-align:center}
th small{display:block;font-weight:500;color:#7f8a7b}
th.row{text-align:right;padding-right:6px;white-space:nowrap;font-size:14px}
.cell{border-radius:8px;overflow:hidden;background:repeating-linear-gradient(45deg,#5b8f47 0 14px,#4f8140 14px 28px);border:2px solid transparent}
.cell canvas{display:block}
.px canvas{image-rendering:pixelated}
.note{color:var(--dim);font-size:12.5px;margin:0 0 8px}
</style></head><body>
<header>
  <h1>장비 동작 미리보기</h1>
  <div class="grp" id="anim"><span>동작</span></div>
  <div class="grp" id="size"><span>크기</span>
    <button data-v="80" class="on">게임 1배</button><button data-v="160">2배</button><button data-v="px">4배 · 점 보기</button><button data-v="240">크게</button></div>
  <div class="grp" id="speed"><span>빠르기</span><button data-v="0.5">0.5배</button><button data-v="1" class="on">1배</button><button data-v="2">2배</button></div>
</header>
<main>
<p class="note">줄은 희귀도(기본 → 전설), 칸은 몸입니다. 무기는 몸마다 하나로 정해 두었습니다(칼 · 지팡이 · 활 · 칼). 맨몸의 공격은 주먹입니다.</p>
<table id="grid"></table>
</main>
<script>
const DATA=__DATA__, TIERS=__TIERS__, BODIES=__BODIES__, ANIMS=__ANIMS__;
let anim='walk', size=80, speed=1, pixel=false;
const imgs={}; const cells=[];
function sheet(k,a,s){const key=k+a+s; if(!imgs[key]){const im=new Image(); im.src='data:image/webp;base64,'+DATA[k][a].sheets[s]; imgs[key]=im;} return imgs[key];}
function build(){
  const g=document.getElementById('grid'); g.innerHTML=''; cells.length=0;
  const hr=document.createElement('tr'); hr.appendChild(document.createElement('th'));
  for(const [n,label,w] of BODIES){const th=document.createElement('th'); th.innerHTML=label+'<small>'+w+'</small>'; hr.appendChild(th);} g.appendChild(hr);
  for(const [t,label,col] of TIERS){
    const tr=document.createElement('tr'); const th=document.createElement('th'); th.className='row'; th.textContent=label; th.style.color=col; tr.appendChild(th);
    for(const [n] of BODIES){
      const td=document.createElement('td'); const d=document.createElement('div'); d.className='cell'+(pixel?' px':''); d.style.borderColor=col+'88';
      const c=document.createElement('canvas'); const dpr=window.devicePixelRatio||1; const S=pixel?320:size;
      c.width=S*dpr; c.height=S*dpr; c.style.width=S+'px'; c.style.height=S+'px'; d.appendChild(c); td.appendChild(d); tr.appendChild(td);
      cells.push({k:n+'_'+t,c,t0:performance.now()});
    }
    g.appendChild(tr);
  }
}
function frameAt(a,t){const fr=a.frames; let total=0; for(const f of fr) total+=f.ms; const hold=a.loop?0:600; const T=(total+hold)/speed; let x=(t%T)*speed;
  for(let i=0;i<fr.length;i++){ if(x<fr[i].ms) return i; x-=fr[i].ms; } return fr.length-1;}
function tick(now){
  for(const cell of cells){
    const a=DATA[cell.k][anim]; const i=frameAt(a,now-cell.t0);
    const src=pixel?80:(size>=160?160:80); const im=sheet(cell.k,anim,src);
    const ctx=cell.c.getContext('2d'); const W=cell.c.width; ctx.clearRect(0,0,W,W);
    const k=W/80, lift=(a.frames[i].lift||0)/4, s=Math.max(0.55,1-lift/28);
    ctx.fillStyle='rgba(0,0,0,'+(0.28*s)+')'; ctx.beginPath(); ctx.ellipse(40*k,76.5*k,12*k*s,3.2*k*s,0,0,Math.PI*2); ctx.fill();
    ctx.imageSmoothingEnabled=!pixel; ctx.imageSmoothingQuality='high';
    if(im.complete) ctx.drawImage(im,i*src,0,src,src,0,0,W,W);
  }
  requestAnimationFrame(tick);
}
const ag=document.getElementById('anim');
for(const [k,l] of ANIMS){const b=document.createElement('button'); b.dataset.v=k; b.textContent=l; if(k===anim) b.classList.add('on'); ag.appendChild(b);}
function pick(id,fn){document.querySelectorAll('#'+id+' button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#'+id+' button').forEach(x=>x.classList.remove('on'));b.classList.add('on');fn(b.dataset.v);});}
pick('anim',v=>{anim=v;});
pick('size',v=>{pixel=v==='px'; size=pixel?320:+v; build();});
pick('speed',v=>{speed=+v;});
build(); requestAnimationFrame(tick);
</script></body></html>'''


if __name__ == '__main__':
    what = sys.argv[1:] or ['items', 'lineup', 'anim']
    if 'items' in what:
        shoot(items_page(), os.path.join(PREV, 'gear-items.png'), 820)
    if 'lineup' in what:
        shoot(lineup_page(), os.path.join(PREV, 'gear-lineup.png'), 1500)
    if 'anim' in what:
        anim_page()
