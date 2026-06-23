#!/usr/bin/env python3
# data.win 由来の metadata.json 再生成スクリプト
# 入力: /tmp/utall/CodeEntries/*.gml (全コードダンプ), /tmp/ut_assets/*.json (資産ID→名前)
#       lang/en/strings.json (基準キー集合)
# 出力: Paratranz-UT/assets/metadata.json
import os, re, json, collections

CODE_DIR = "/tmp/utall/CodeEntries"
ASSET_DIR = "/tmp/ut_assets"
ROOT = "/Users/syuya/Paratranz-UT"
OUT = os.path.join(ROOT, "Paratranz-UT/assets/metadata.json")

sounds = json.load(open(f"{ASSET_DIR}/sounds.json"))
sprites = json.load(open(f"{ASSET_DIR}/sprites.json"))
objects = json.load(open(f"{ASSET_DIR}/objects.json"))
object_info = json.load(open(f"{ASSET_DIR}/object_info.json"))
en = json.load(open(f"{ROOT}/lang/en/strings.json", encoding="utf-8-sig"))
en_keys = set(en)

def sound_name(i):
    return sounds[i] if 0 <= i < len(sounds) else None
def sprite_name(i):
    return sprites[i] if 0 <= i < len(sprites) else None
def object_name(i):
    return objects[i] if 0 <= i < len(objects) else None

# 色コード -> HEX
COLOR_MAP = {
    "R": "#FF0000", "G": "#00FF00", "Y": "#FFFF00", "B": "#0000FF",
    "O": "#FFA040", "P": "#FF00FF", "p": "#FFBBD4", "S": "#14A9FF",
    "L": "#0EC0FD", "K": "#00FFFF", "M": "#B2BDBE", "W": "#FFFFFF", "X": "#000000",
}
color_re = re.compile(r'\\([RGYBOPpSLKMWX])')

# --- 各オブジェクトの npc_voice_sfx (object名 -> sound名) ---
voice_re = re.compile(r'(?:^|[^.\w])npc_voice_sfx\s*=\s*(\d+)')
obj_voice = {}
for fn in os.listdir(CODE_DIR):
    if not fn.startswith("gml_Object_") or "_Create_0" not in fn:
        continue
    if fn.endswith("_old.gml"):
        continue
    obj = fn[len("gml_Object_"):].split("_Create_0")[0]
    txt = open(os.path.join(CODE_DIR, fn), encoding="utf-8", errors="replace").read()
    m = voice_re.search(txt)
    if m:
        snd = sound_name(int(m.group(1)))
        if snd:
            obj_voice[obj] = snd

# --- 正規表現 ---
str_part = r'"((?:[^"\\]|\\.)*)"'
# message[N] / message_col[N][x] = (任意) ... scr_get_lang_string("english", "key")
lang_re = re.compile(
    r'(?:message(?:_col)?\[(\d+)\](?:\[\d+\])?\s*=\s*)?(?:gml_Script_)?scr_get_lang_string\(\s*'
    + str_part + r'\s*,\s*' + str_part + r'\s*\)', re.S)
# 顔配列: prt[N] (カットシーン) と portrait[N] (一部対話)。portrait_alt[]は特殊モードなので除外
prt_re = re.compile(r'(?:prt|portrait)\[(\d+)\]\s*=\s*(\d+)')
sndarr_re = re.compile(r'sndfnt_array\[(\d+)\]\s*=\s*(\d+)')
sndscal_re = re.compile(r'(?:^|[^_\w])sndfnt\s*=\s*(\d+)')
talker_re = re.compile(r'talker\[(\d+)\]\s*=\s*(\d+)')

# 旧metadataの有効な色(c)を保持（色は別機構で抽出困難なため）
old_colors = {}
for _src in ("/tmp/metadata_old_backup.json", OUT):
    try:
        _old = json.load(open(_src, encoding="utf-8"))
        for k, v in _old.items():
            c = v.get("c")
            if c and re.fullmatch(r'#[0-9A-Fa-f]{6}', c):
                old_colors[k] = c
        if old_colors:
            break
    except Exception:
        pass

def accept_portrait(nm):
    # prt[]/portrait[] は明示的な顔配列なので緩く受け入れる（明白な非顔のみ除外）
    if not nm:
        return False
    if nm.startswith("bg_") or "bubble" in nm or nm.startswith("spr_heart"):
        return False
    return True

def nearest(items, line):
    # items: list of (line, value) -> value with min |line - target|
    best = None; bestd = 1e18
    for ln, val in items:
        d = abs(ln - line)
        if d < bestd:
            bestd = d; best = val
    return best

# バトル系コードエントリ判定（吹き出しモード）
def battle_bubble_for(code_entry):
    # obj_quote_battle_* オブジェクトのデフォルトsprite を吹き出しとして使う
    if code_entry.startswith("obj_quote_battle"):
        info = object_info.get(code_entry)
        if info and info.get("sprite", "").startswith("spr_quote_bubble"):
            return info["sprite"]
        # 親に委譲
        if info and info.get("parent"):
            pinfo = object_info.get(info["parent"])
            if pinfo and pinfo.get("sprite", "").startswith("spr_quote_bubble"):
                return pinfo["sprite"]
        return "spr_quote_bubble_battle"  # 既定
    return None

# バトルquoteで個別の声設定が無い主要キャラの声推定（実プレイ準拠）
sound_set = set(s for s in sounds if s)
def infer_battle_voice(code_short):
    if not code_short.startswith("obj_quote_battle_"):
        return None
    rest = code_short[len("obj_quote_battle_"):]
    token = rest.split("_")[0]
    special = {"flowey": "sndfnt_flowey"}
    if token in special and special[token] in sound_set:
        return special[token]
    cand = "snd_talk_" + token
    if cand in sound_set:
        return cand
    return None

metadata = {}
stats = collections.Counter()

for fn in sorted(os.listdir(CODE_DIR)):
    if not fn.endswith(".gml"):
        continue
    if fn.endswith("_old.gml"):
        continue
    code_entry = fn[:-4]
    if code_entry.startswith("gml_Object_"):
        code_short = code_entry[len("gml_Object_"):]
    elif code_entry.startswith("gml_GlobalScript_"):
        code_short = code_entry[len("gml_GlobalScript_"):]
    elif code_entry.startswith("gml_Script_"):
        code_short = code_entry[len("gml_Script_"):]
    elif code_entry.startswith("gml_RoomCC_") or code_entry.startswith("gml_Room_"):
        code_short = code_entry.split("_", 2)[-1] if False else code_entry
    else:
        code_short = code_entry

    text = open(os.path.join(CODE_DIR, fn), encoding="utf-8", errors="replace").read()
    # 文字オフセット->行番号 変換用
    nl_offsets = [0]
    for i, ch in enumerate(text):
        if ch == "\n":
            nl_offsets.append(i + 1)
    import bisect
    def line_of(off):
        return bisect.bisect_right(nl_offsets, off) - 1
    # 収集
    calls = []      # (line, N or None, english, key)
    snd_a = collections.defaultdict(list)
    prt_d = collections.defaultdict(list)
    talk_d = collections.defaultdict(list)
    snd_scalar = []  # (line, id)
    for m in lang_re.finditer(text):
        ln = line_of(m.start())
        N = int(m.group(1)) if m.group(1) is not None else None
        calls.append((ln, N, m.group(2), m.group(3)))
    for mm in prt_re.finditer(text):
        prt_d[int(mm.group(1))].append((line_of(mm.start()), int(mm.group(2))))
    for mm in sndarr_re.finditer(text):
        snd_a[int(mm.group(1))].append((line_of(mm.start()), int(mm.group(2))))
    for mm in talker_re.finditer(text):
        talk_d[int(mm.group(1))].append((line_of(mm.start()), int(mm.group(2))))
    for ms in sndscal_re.finditer(text):
        snd_scalar.append((line_of(ms.start()), int(ms.group(1))))

    bubble = battle_bubble_for(code_short)

    for ln, N, eng, key in calls:
        if key not in en_keys:
            continue
        entry = {}
        # --- 音声 ---
        snd = None
        if N is not None and snd_a.get(N):
            sid = nearest(snd_a[N], ln)
            if sid not in (0, -4):
                snd = sound_name(sid)
        if snd is None and snd_scalar:
            sid = nearest(snd_scalar, ln)
            if sid not in (0, -4):
                snd = sound_name(sid)
        if snd is None and N is not None and talk_d.get(N):
            oid = nearest(talk_d[N], ln)
            onm = object_name(oid)
            if onm and onm in obj_voice:
                snd = obj_voice[onm]
        if snd is None:
            snd = infer_battle_voice(code_short)
        if snd is None:
            snd = "sndfnt_default"
        entry["s"] = snd
        # --- 顔 ---
        # ショップ系・独白系は顔画像を出さない（プレビューで大きくなりすぎるため）
        #   ショップ: コードエントリに "shop" を含む
        #   独白: sprite_index 由来の顔フォールバックは採用しない
        face = None
        if "shop" not in code_short and N is not None and prt_d.get(N):
            pid = nearest(prt_d[N], ln)
            if pid > 0:
                pnm = sprite_name(pid)
                if accept_portrait(pnm):
                    face = pnm
        if face:
            entry["p"] = face
        # --- 吹き出し ---
        if bubble:
            entry["b"] = bubble
        # --- 色（旧metadataの有効値を保持） ---
        if key in old_colors:
            entry["c"] = old_colors[key]
        metadata[key] = entry
        stats["written"] += 1

# strings.json にあるが取れなかったキーは default 音声で補完
for k in en_keys:
    if k not in metadata:
        metadata[k] = {"s": "sndfnt_default"}
        stats["filled_default"] += 1

# 出力（キーソート）
with open(OUT, "w", encoding="utf-8") as f:
    json.dump({k: metadata[k] for k in sorted(metadata)}, f, ensure_ascii=False, indent=1)

print("written:", stats["written"], "filled_default:", stats["filled_default"])
print("total keys:", len(metadata))
sv = collections.Counter(v.get("s") for v in metadata.values())
print("distinct sounds:", len(sv), "top:", sv.most_common(8))
bv = collections.Counter(v.get("b") for v in metadata.values() if "b" in v)
print("distinct bubbles:", len(bv), "total b:", sum(bv.values()), bv.most_common(8))
pv = sum(1 for v in metadata.values() if "p" in v)
cv = sum(1 for v in metadata.values() if "c" in v)
print("with face:", pv, "with color:", cv)
print("obj_voice entries:", len(obj_voice))
