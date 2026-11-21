#!/usr/bin/env python3
"""
게임에 넣는 새 몸 그림 — 몸 넷 × 장면 12 × 장비 층 (0.70.26).

    python3 tools/gear-art.py                  # 장비 그림(먼저)
    python3 tools/body-game.py                 # → assets/bodies/<몸>/<층>.webp · src/data/bodies.json · manifest
    python3 tools/body-game.py m1              # 몸 하나만(여럿을 따로 돌린 뒤 --index 로 모은다)
    python3 tools/body-game.py --index         # bodies.json · manifest 만 다시

── 무엇을 굽나 ───────────────────────────────────────────────
  몸   m1 남·깨끗 · f1 여·깨끗 · m2 남·거친 · f2 여·거친   (직업과 따로 고른다)
  장면 들판(2배, 160px):  stand · walk1 · walk2
       전투(4배, 320px):  bstand · stance_<무기> · attack_<무기>   무기 = sword · bow · staff · fist(맨손)
  층   base(맨몸) · cape_2~4(몸 뒤) · armor · boots · belt · necklace · gloves · pads · helmet (0~4 등급)
       · weapon_<무기>_<등급>
  게임은 이 순서로 겹쳐 그린다(src/core/BodyLook.js):
       cape → base → armor → boots → belt → necklace → gloves → pads → helmet → weapon

── 층을 어떻게 뽑나 ──────────────────────────────────────────
  장비 하나만 입힌 몸을 그려서 **맨몸과 다른 점만** 남긴다. 그래서 팔이 갑옷 앞을 지나는
  자리(팔 앞)는 갑옷 층에 안 들어간다 — 맨몸 그대로이기 때문이다. 겹쳐도 앞뒤가 맞는다.
  망토만은 몸 뒤에 있어서 망토 조각 하나만 따로 그린다(맨몸보다 먼저 깐다).

한 장(프레임)은 게임에서 80×80 이다 — 가운데 아래 48×64 가 몸이고, 둘레는 칼·효과가 나갈 자리.
발바닥은 아래 변에서 3점 위. 지금 게임 그림(48×64)과 발 자리가 같다.
"""
import importlib.util, json, math, os, sys
from multiprocessing import Pool
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..')


def _load(name, file):
    sp = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'tools', file))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


BA = _load('body_anim', 'body-anim.py')
BR = BA.BR
GA = _load('gear_art', 'gear-art.py')
GA.BR = BR
GA.register_weapons()
BV = _load('body_views', 'body-views.py')
BV.BR = BR
BT = _load('body_turn', 'body-turn.py')         # 0.70.30 — 8방향(규칙: docs/CHARACTER-VIEWS.md)
BT.init(BR)
VIEWS = BT.VIEWS                                 # fs · s · fsl · sl(눈동자만 옮긴 앞모습) · b(뒷모습)

OUT = os.path.join(ROOT, 'assets', 'bodies')
BODIES = ['m1', 'f1', 'm2', 'f2']
BODY_INFO = {
    'm1': {'gender': 'm', 'style': 'clean', 'label': '남 · 깨끗한 차림'},
    'f1': {'gender': 'f', 'style': 'clean', 'label': '여 · 깨끗한 차림'},
    'm2': {'gender': 'm', 'style': 'rugged', 'label': '남 · 거친 차림'},
    'f2': {'gender': 'f', 'style': 'rugged', 'label': '여 · 거친 차림'},
}
KINDS = ['sword', 'bow', 'staff']
FIELD, BATTLE = 160, 320
SLOTS = ['armor', 'boots', 'belt', 'necklace', 'gloves', 'pads', 'helmet']
TIERS = [0, 1, 2, 3, 4]
HOLD = {'sword': 148, 'bow': 180, 'staff': 176}
# 0.70.28 — 같은 등급 안의 다른 아이템(변형). 칸마다 등급(0~4) 뒤에 이 이름들이 붙는다.
SLOT_VARIANTS = {}
for (slot_, v_), _fn in GA.VARIANTS.items():
    for s_ in (['pads'] if slot_ == 'shoulder' else [slot_]):
        SLOT_VARIANTS.setdefault(s_, []).append(v_)
WEAPON_VARIANTS = {}
for (k_, v_) in GA.WEAPON_VARIANTS:
    WEAPON_VARIANTS.setdefault(k_, []).append(v_)


# ─────────────────────────────────────────────────────────────
# 장면 — 자세 · 무기 · 효과
# ─────────────────────────────────────────────────────────────
def held(q):
    """무기 든 손은 몸 바깥으로 조금 벌린다(body-anim 의 장비 동작과 같다)."""
    q = dict(q)
    r = dict(q.get('uarmR', {}))
    r['rot'] = r.get('rot', 0.0) - 12
    q['uarmR'] = r
    return q


def no_step(q):
    """내딛은 걸음(root tx)을 뺀다 — 전투 화면이 몸째 앞으로 내밀어 주므로(lunge), 그림에서까지 나가면
    칼끝이 틀(80×80) 밖으로 잘린다."""
    q = dict(q)
    r = dict(q.get('root', {}))
    r['tx'] = 0.0
    q['root'] = r
    return q


def scenes(body):
    """[(이름, 크기, 자세, 무기 종류 또는 None/'all', 효과 만드는 함수(wk) 또는 None)]"""
    out = []
    idle, _ = BA.anim_idle(body)
    walk, _ = BA.anim_walk(body)
    stand = held(idle[0].pose)
    out.append(('stand', FIELD, stand, 'all', None))
    out.append(('walk1', FIELD, held(walk[2].pose), 'all', None))
    out.append(('walk2', FIELD, held(walk[6].pose), 'all', None))
    out.append(('bstand', BATTLE, stand, 'all', None))
    # 칼 — 겨눔(0) · 벤 순간(4, 칼바람까지)
    sl = lambda wk: BA.anim_slash(body, wk)[0]
    out.append(('stance_sword', BATTLE, sl('sword:0')[0].pose, 'sword', lambda wk: sl(wk)[0]))
    out.append(('attack_sword', BATTLE, no_step(sl('sword:0')[4].pose), 'sword', lambda wk: _ns(sl(wk)[4])))
    # 활 — 겨눔(1, 화살을 먹인 채) · 놓은 순간(4, 날아가는 화살)
    sh = lambda wk: BA.anim_shoot(body, wk)[0]
    out.append(('stance_bow', BATTLE, sh('bow:0')[1].pose, 'bow', lambda wk: sh(wk)[1]))
    out.append(('attack_bow', BATTLE, sh('bow:0')[4].pose, 'bow', lambda wk: sh(wk)[4]))
    # 지팡이 — 치켜듦(2, 수정만 빛난다) · 내뻗음(4, 빛 구슬)
    ca = lambda wk: BA.anim_cast(body, wk)[0]
    out.append(('stance_staff', BATTLE, ca('staff:0')[2].pose, 'staff', lambda wk: ca(wk)[2]))
    out.append(('attack_staff', BATTLE, no_step(ca('staff:0')[4].pose), 'staff', lambda wk: _ns(ca(wk)[4])))
    # 맨손 — 가드 · 잽
    pu, _ = BA.anim_punch(body)
    out.append(('stance_fist', BATTLE, pu[0].pose, None, None))
    out.append(('attack_fist', BATTLE, no_step(pu[2].pose), None, None))
    # ── 0.70.28 — 달리기 · 점프 · 맞기 · 쓰러짐 ─────────────────
    # 달리기(질주 물약): 여섯 장 가운데 서로 다른 셋 — 왼발 앞 · 두 발이 스치는 순간 · 오른발 앞.
    #   게임은 왼 · 스침 · 오른 · 스침 차례로 돈다. 몸이 튀어 오르는 높이(_lift)는 그림에 넣는다.
    run, _ = BA.anim_run(body)
    out.append(('run_l', FIELD, held(run[1].pose), 'all', None))
    out.append(('run_p', FIELD, held(run[0].pose), 'all', None))
    out.append(('run_r', FIELD, held(run[4].pose), 'all', None))
    # 점프: 다리를 접어 올리고 팔을 벌린 공중 자세. 뜨는 높이는 게임이 준다(그림은 땅에 둔다).
    jmp, _ = BA.anim_jump(body)
    jq = dict(jmp[2].pose)
    jq['_lift'] = 0
    jq = BA.merge(jq, BA.P(uarmL=60, uarmR=-60, farmL=24, farmR=-24))
    out.append(('jump', FIELD, held(jq), 'all', None))
    # 맞기: 뒤로 젖혀진 순간(붉은 번쩍임은 전투 화면이 따로 준다)
    hu, _ = BA.anim_hurt(body)
    out.append(('hurt', BATTLE, hu[0].pose, 'all', None))
    # 쓰러짐: 옆으로 누운 마지막 장. 무기는 놓쳤다(누운 몸에 칼이 하늘로 서 있으면 어색하다).
    dn, _ = BA.anim_down(body)
    out.append(('down', BATTLE, dn[-1].pose, None, None))
    # ── 0.70.30 — 8방향 (규칙: docs/CHARACTER-VIEWS.md · 사용자 지정) ──────────────────────
    #   앞대각 · 옆(_fs · _s · 왼쪽은 _fsl · _sl) = **앞모습 그대로, 눈동자만** 가는 쪽으로 살짝. 맨몸 층만 굽는다.
    #   뒤(_b) = 머리부터 발까지 뒷모습(뒤대각도 이것). 자세는 모두 앞모습 서기 · 걷기 그대로.
    #   **뒤집지 않는다** — 무기는 어느 방향이든 화면 오른쪽 손에 있다.
    for v in VIEWS:
        poses = [stand, held(walk[2].pose), held(walk[6].pose)]
        for nm, q in zip(('stand', 'walk1', 'walk2'), poses):
            out.append((f'{nm}_{v}', FIELD, q, 'all', None))
    return out


def view_of(scene):
    for v in VIEWS:
        if scene.endswith('_' + v):
            return v
    return ''


def glance_scene(scene):
    """눈동자만 옮긴 장면인가 — 맨몸 층만 굽고, 장비 · 무기 · 망토는 앞모습 장면(sceneOf)의 것을 쓴다."""
    return view_of(scene) in BT.GLANCE


def game_arc(body, pose):
    """칼바람 — 틀(80×80) 안에 들어오게 작게. 어깨가 가운데, 반지름은 틀 끝까지 닿지 않게."""
    M = body.solve(pose)
    sh = BR.to_canvas(body.rig['R']['shoulder'])
    c = M['uarmR'] @ np.array([sh[0], sh[1], 1.0])
    rad = min(430.0, BR.CW - c[0] - 50, c[1] - 60)
    return BA.fx_arc((c[0], c[1]), rad * .55, rad, -100, 50, width_boost=1.0)


def _ns(frame):
    frame.pose = no_step(frame.pose)
    return frame


def keep_fx(frame, name, body=None):
    """무기 층에 넣을 효과만 추린다 — 발밑 마법진·반짝이는 뺀다(서 있는 내내 깔리면 어수선하다)."""
    fx = list(frame.fx)
    if name == 'attack_sword':
        return [game_arc(body, frame.pose)]     # 칼바람만(맞힌 불꽃은 전투 화면이 따로 그린다)
    if name == 'stance_staff':
        return [f for i, f in enumerate(fx) if i == 1]        # 수정 빛
    if name == 'attack_staff':
        return [f for i, f in enumerate(fx) if i != 0]         # 빛 구슬(마법진 뺌)
    return fx


# ─────────────────────────────────────────────────────────────
# 그리기 · 층 뽑기
# ─────────────────────────────────────────────────────────────
def small(pm, size):
    """굽는 틀(1280) → size. 미리 곱한 float RGBA(0..1) 로 돌려준다."""
    im = BR.to_image(pm, (size, size))
    f = np.asarray(im).astype(np.float32) / 255
    f[..., :3] *= f[..., 3:4]
    return f


def diff_layer(gear_s, base_s, thr=0.035):
    d = np.abs(gear_s - base_s).max(-1)
    m = d > thr
    if not m.any():
        return None
    m = ndi.binary_dilation(m, iterations=1)
    out = gear_s.copy()
    out[~m] = 0
    return out


def to_rgba8(pm):
    a = pm[..., 3:4]
    rgb = np.where(a > 1e-4, pm[..., :3] / np.maximum(a, 1e-4), 0)
    return (np.dstack([rgb, a]) * 255).clip(0, 255).round().astype(np.uint8)


def crop(rgba):
    a = rgba[..., 3]
    ys, xs = np.where(a > 2)
    if not len(xs):
        return None
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    return rgba[y0:y1, x0:x1], (int(x0), int(y0))


def render_pose(body, pose, gear=None, order=None, fx=None):
    pm, info = body.render(pose, gear or {}, order=order)
    info['body'] = body
    if gear and any(w.key.startswith('bow') for w, _ in info['weapon'].values()) \
            and not any(getattr(f, 'is_string', False) for f in (fx or [])):
        BA.fx_string()(pm, info)
    for f in fx or []:
        f(pm, info)
    return pm


def pad_gear(name, tier):
    parts, _ = GA.load_piece(name, 'shoulder', tier)
    return {'parts': {}, 'layers': {k: parts[k] for k in ('padL', 'padR') if k in parts}}


def cape_gear(name, tier):
    parts, _ = GA.load_piece(name, 'shoulder', tier)
    return {'parts': {}, 'layers': {'cape': parts['cape']}} if 'cape' in parts else None


def slot_gear(name, slot, tier):
    if slot == 'pads':
        return pad_gear(name, tier)
    return GA.gear_for(name, {slot: tier})


def bake_body(name, only=None):
    """only='cape' 이면 망토 층만 다시 굽고, 이미 있는 atlas.json 의 다른 층은 그대로 둔다."""
    t0 = __import__('time').time()
    back_im, drape = BV.load_views(name)
    rig = BR.RIGS[name]

    def mk(gear):
        """앞 · 뒤 몸 + 눈동자만 옮긴 앞 몸 넷. 뒤 몸은 뒤통수 그림 + 등 위 머리칼(drape) + 뒤 다리(무릎 뒤 · 뒤꿈치),
        앞머리(hairfront)는 뺀다. 눈동자 몸은 맨몸 층에만 쓰므로 장비를 입힌 mk 에서는 만들지 않는다."""
        bare = gear is None
        gear = gear or {'parts': {}, 'layers': {}}
        # 0.70.31 — 갑옷 · 허리띠는 뒷면(gear-art 의 armorB · beltB)을 입는다
        g2 = {'parts': gear.get('back_parts', gear.get('parts', {})), 'layers': {k: v for k, v in gear.get('layers', {}).items() if k != 'hairfront'},
              'image': back_im}
        g2['layers']['drape'] = drape
        if gear.get('pit') is not None:
            g2['pit'] = gear['pit']
        front, back = BR.Body(name, gear), BR.Body(name, g2)
        BT.backify_legs(back)
        out = {'': front, 'b': back}
        if bare:
            out.update({v: BT.GlanceBody(front, v) for v in BT.GLANCE})
        return out

    def draw(bodies, scene, pose, **kw):
        # 뒤집지 않는다 — 무기는 어느 방향이든 화면 오른쪽 손(docs/CHARACTER-VIEWS.md)
        return render_pose(bodies[view_of(scene)], pose, **kw)

    base = mk(None)
    base_body = base['']
    sc = scenes(base_body)
    layers = {}          # 층 이름 → {장면: (rgba8 조각, (x, y), 크기)}

    def put(key, scene, size, pm_small):
        rgba = to_rgba8(pm_small)
        c = crop(rgba)
        if c is None:
            return
        layers.setdefault(key, {})[scene] = (c[0], c[1], size)

    base_small = {}
    for scene, size, pose, kind, fx_of in sc:
        if only == 'cape':
            break
        base_small[scene] = small(draw(base, scene, pose), size)
        put('base', scene, size, base_small[scene])
    # 망토 — 따로
    for t in TIERS + SLOT_VARIANTS.get('pads', []):
        g = cape_gear(name, t)
        if not g:
            continue
        b = mk(g)
        for scene, size, pose, kind, fx_of in sc:
            if glance_scene(scene):
                continue
            # 뒤에서는 망토가 몸 **위**에 온다(BodyLook). 긴 머리칼(drape) · 뒤통수는 그 망토 위로 —
            #   망토 층에 함께 넣어 두면 겹친 차례가 미리보기(body-turn.BACK_ORDER)와 같다. 투구는 그 위(투구 층).
            order = ['cape', 'drape', 'head'] if view_of(scene) == 'b' else ['cape']
            put(f'cape_{t}', scene, size, small(draw(b, scene, pose, order=order), size))
    if only == 'cape':
        write_atlases(name, layers, merge=True)
        print(f'✓ {name} 망토 {len(layers)}층 {__import__("time").time() - t0:.0f}s', flush=True)
        return
    # 입는 장비 — 맨몸과 다른 점만
    for slot in SLOTS:
        for t in TIERS + SLOT_VARIANTS.get(slot, []):
            b = mk(slot_gear(name, slot, t))
            for scene, size, pose, kind, fx_of in sc:
                if glance_scene(scene):
                    continue
                lay = diff_layer(small(draw(b, scene, pose), size), base_small[scene])
                if lay is not None:
                    put(f'{slot}_{t}', scene, size, lay)
        print(f'  {name} {slot}', flush=True)
    # 무기
    for scene, size, pose, kind, fx_of in sc:
        if glance_scene(scene):
            continue
        kinds = KINDS if kind == 'all' else ([kind] if kind else [])
        for k in kinds:
            for t in TIERS + WEAPON_VARIANTS.get(k, []):
                wk = f'{k}:{t}'
                if fx_of:
                    fr = fx_of(wk)
                    gear, fx = fr.gear, keep_fx(fr, scene, base_body)
                else:
                    gear, fx = {'R': (wk, HOLD[k], 'world')}, []
                pm = draw(base, scene, pose, gear=gear, fx=fx)
                lay = diff_layer(small(pm, size), base_small[scene])
                if lay is not None:
                    put(f'weapon_{k}_{t}', scene, size, lay)
    print(f'  {name} weapons', flush=True)
    write_atlases(name, layers)
    print(f'✓ {name} {len(layers)}층 {__import__("time").time() - t0:.0f}s', flush=True)


# ─────────────────────────────────────────────────────────────
# 묶기 — 층마다 한 장(모든 장면의 조각을 선반에 쌓는다)
# ─────────────────────────────────────────────────────────────
def pack(items, width=1024, gap=2):
    """items: [(key, w, h)] → {key: (x, y)}, 높이. 키 큰 것부터 선반에 놓는다."""
    order = sorted(items, key=lambda it: -it[2])
    x = y = shelf = 0
    pos = {}
    width = max(width, max(w for _, w, _ in items) + gap)
    for key, w, h in order:
        if x + w > width:
            x = 0
            y += shelf + gap
            shelf = 0
        pos[key] = (x, y)
        x += w + gap
        shelf = max(shelf, h)
    return pos, y + shelf, width


def write_atlases(name, layers, merge=False):
    """merge=True 면 이미 있는 atlas.json 에 이 층들만 갈아 끼운다(다른 층 그림 · 좌표는 그대로)."""
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    meta = {}
    ap = os.path.join(d, 'atlas.json')
    if merge and os.path.exists(ap):
        meta = json.load(open(ap))
    for key, per in layers.items():
        items = [(scene, img.shape[1], img.shape[0]) for scene, (img, _, _) in per.items()]
        pos, h, w = pack(items, 512 if key != 'base' else 1024)
        sheet = np.zeros((h, w, 4), np.uint8)
        rects = {}
        for scene, (img, (ox, oy), size) in per.items():
            x, y = pos[scene]
            sheet[y:y + img.shape[0], x:x + img.shape[1]] = img
            rects[scene] = [x, y, img.shape[1], img.shape[0], ox, oy]
        im = Image.fromarray(sheet, 'RGBA')
        path = os.path.join(d, f'{key}.webp')
        im.save(path, 'WEBP', quality=80, method=6, alpha_quality=88)   # 0.70.29 — 90/100 → 80/88: 한 장짜리 html 을 줄인다
        meta[key] = {'w': w, 'h': h, 'rects': rects}
    json.dump(meta, open(os.path.join(d, 'atlas.json'), 'w'), separators=(',', ':'))


def index():
    """src/data/bodies.json + manifest(느리게 부르는 그림) 을 적는다."""
    bodies = {}
    man_path = os.path.join(ROOT, 'src', 'data', 'manifest.json')
    man = json.load(open(man_path))
    man = {k: v for k, v in man.items() if not k.startswith('body:')}
    for n in BODIES:
        ap = os.path.join(OUT, n, 'atlas.json')
        if not os.path.exists(ap):
            continue
        atlas = json.load(open(ap))
        bodies[n] = dict(BODY_INFO[n], layers=atlas)
        for key, m in atlas.items():
            man[f'body:{n}:{key}'] = {'src': f'assets/bodies/{n}/{key}.webp', 'w': m['w'], 'h': m['h'], 'lazy': True}
    data = {
        '_comment': 'tools/body-game.py 가 만든다 — 손으로 고치지 말 것. 층 좌표 [x, y, w, h, 장면 안의 x, y].',
        'frame': {'field': FIELD, 'battle': BATTLE, 'logical': 80},
        'scenes': {'stand': FIELD, 'walk1': FIELD, 'walk2': FIELD, 'bstand': BATTLE,
                   **{f'{a}_{k}': BATTLE for a in ('stance', 'attack') for k in KINDS + ['fist']},
                   'run_l': FIELD, 'run_p': FIELD, 'run_r': FIELD, 'jump': FIELD, 'hurt': BATTLE, 'down': BATTLE,
                   **{f'{a}_{v}': FIELD for a in ('stand', 'walk1', 'walk2') for v in VIEWS}},
        # 아이템 → 변형 이름. 이 아이템을 입으면 등급 층(armor_2) 대신 변형 층(armor_dragon)을 쓴다.
        'variants': {item: v for item, (slot_, v) in GA.ITEM_VARIANTS.items()},
        # 0.70.30 — 눈동자만 옮긴 장면 → 앞모습 장면. 맨몸(base) 말고는 이 짝의 조각을 그대로 쓴다(BodyLook.rectOf).
        'sceneOf': {f'{a}_{v}': a for a in ('stand', 'walk1', 'walk2') for v in BT.GLANCE},
        'order': ['cape', 'base', 'armor', 'boots', 'belt', 'necklace', 'gloves', 'pads', 'helmet', 'weapon'],
        'bodies': bodies,
    }
    json.dump(data, open(os.path.join(ROOT, 'src', 'data', 'bodies.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump(man, open(man_path, 'w'), ensure_ascii=False, indent=2)
    open(man_path, 'a').write('\n')
    total = sum(os.path.getsize(os.path.join(OUT, n, f)) for n in os.listdir(OUT) for f in os.listdir(os.path.join(OUT, n)))
    print(f'✓ bodies.json · manifest ({len(bodies)}몸, 그림 {total // 1024}KB)')


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--index' in args:
        index()
        sys.exit(0)
    names = [a for a in args if a in BODIES] or BODIES
    if '--capes' in args:
        # 망토 층만 다시(몸 넷 차례로) — 나머지 층은 그대로
        for n in names:
            bake_body(n, only='cape')
        index()
        sys.exit(0)
    if len(names) > 1:
        # ⚠ 0.70.30 — fork 로 나누면 cv2 · scipy 의 스레드가 잠긴 채로 복사되어 일꾼이 멈췄다(futex). spawn 으로 새로 띄운다.
        import multiprocessing as _mp
        with _mp.get_context('spawn').Pool(2) as p:
            p.map(bake_body, names)
    else:
        bake_body(names[0])
    index()
