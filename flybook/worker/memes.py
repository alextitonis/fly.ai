"""Flybook memes: a $FLYAI holder turns one of their fly's posts into an AI image meme.

The picture comes from an image model on OpenRouter (IMAGE_MODEL); everything around it comes from the post:
  prompt   a cartoon fruit fly in the fly's colour, in the scene its brain read (a hallucination is shown as an
           imagined thought bubble), reacting the way its behaviour neurons did, in a preset style, plus the owner's
           optional short idea. The model is told: no text, no real people, no logos.
  text     stamped by us, not the model (image models misspell): the post's headline on top (the same line the app
           shows, web/src/words.ts) and what really happened underneath, plus a small "AI image" tag.
  idea     at most IDEA_MAX simple characters, a short blocklist, then a yes/no check by a cheap text model
           (CHECK_MODEL) before any image is paid for. The check's answer is never shown as content.
Cost measured 2026-09-14: image ~$0.039 (1,290 image tokens), idea check ~$0.00002.
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

OPENROUTER = "https://openrouter.ai/api/v1"
IMAGE_MODEL = os.environ.get("FLYBOOK_MEME_MODEL", "google/gemini-2.5-flash-image")
CHECK_MODEL = os.environ.get("FLYBOOK_MEME_CHECK_MODEL", "google/gemini-2.5-flash-lite")
DAILY_CAP = int(os.environ.get("FLYBOOK_MEME_DAILY_CAP", "10"))      # memes per UTC day, everyone together (50 -> 10 2026-10-16: OpenRouter spend)
IDEA_MAX = 60
FONT = Path(__file__).resolve().parent / "fonts" / "Anton-Regular.ttf"
SIZE = 1024

STYLES = {
    "classic": ("Classic meme", "a bold, funny internet meme illustration, bright and punchy"),
    "poster": ("Movie poster", "a dramatic blockbuster movie poster scene with cinematic lighting"),
    "renaissance": ("Renaissance painting", "an Italian Renaissance oil painting with museum lighting"),
    "anime": ("Anime", "a colourful Japanese anime still, expressive and dynamic"),
    "documentary": ("Nature documentary", "a macro nature documentary photograph with shallow depth of field"),
    "cartoon90s": ("90s cartoon", "a 1990s Saturday-morning cartoon frame with thick outlines and flat bright colours"),
}

SCENE = {
    "threat": "a huge dark shape looming over it",
    "mate": "another fly strutting past nearby",
    "wind": "a strong gust of wind blowing across it",
    "taste": "a tiny drop of something tasty right under its mouth",
    "touch": "something brushing against its big eyes",
    "cva": "the scent of another male fly drifting past as a wavy cloud",
}
REACTION = {
    "jumped": "leaping into the air in panic",
    "turned": "spinning around",
    "groomed": "frantically rubbing its face with its front legs",
    "buzzed": "buzzing its wings wildly",
    "backed_up": "backing away slowly",
    "walked": "strutting forward",
}
# web/src/words.ts WORDS[].really and LINES; keep in sync
REALLY = {"threat": "a looming shape", "mate": "a moving, fly-sized target", "wind": "wind on the antennae",
          "taste": "taste neurons in the mouth", "touch": "eye bristles touched", "cva": "cVA, the male pheromone",
          "nothing": "nothing at all"}
LINES = {
    "threat": {"sure": ["Something big is coming at me.", "Incoming. Something huge.", "A shadow just swooped over me.",
                        "That thing is getting bigger fast.", "Something's looming. Not sticking around.", "Big shape, closing in."],
               "unsure": ["Wait, is something coming at me?", "I'd swear something just loomed.", "Did a shadow just move?",
                          "Something big… maybe?"]},
    "mate": {"sure": ["Someone over there is worth following.", "There's a fly moving over there.", "Oh, who's that?",
                      "Something fly-sized just went past.", "Keeping my eyes on that one.", "A mover, right over there."],
             "unsure": ["Was that a fly going past?", "I think someone moved over there.", "Someone worth following… I think.",
                        "Saw a mover. Probably."]},
    "wind": {"sure": ["It's windy out here.", "Breeze on my antennae.", "Air's moving.", "Hold on, gust.", "Feeling the wind."],
             "unsure": ["Is that a breeze?", "Air moving… I think.", "Felt a draft, maybe."]},
    "taste": {"sure": ["Tasting something.", "Mm. Something on my tongue.", "That tastes like something.", "Food? Tasting it."],
              "unsure": ["Am I tasting something?", "Thought I tasted something.", "Something on my tongue… maybe."]},
    "touch": {"sure": ["Something brushed my eye.", "Hey, something touched my face.", "Bristles, touched.", "Something poked my eye."],
              "unsure": ["Did something brush my eye?", "Felt a touch… I think.", "Something on my face?"]},
    "cva": {"sure": ["Smells like another male around here.", "I smell another male.", "Male scent in the air.", "Another guy's been here."],
            "unsure": ["Is that another male I smell?", "Smells male… or not.", "Getting a whiff of someone, maybe."]},
}
ACTION_LABELS = {"jumped": "jumped", "backed_up": "backed up", "walked": "walked forward", "turned": "turned",
                 "groomed": "groomed", "buzzed": "buzzed its wings"}
CAUSE = {"loom": "{} jumping nearby", "target": "{} moving nearby", "bump": "{} bumping into it"}

IDEA_OK = re.compile(r"^[A-Za-z0-9 ,.'!?&-]{2,60}$")
BLOCK = re.compile(r"\b(nude|naked|sex|porn|nsfw|kill|murder|blood|gore|nazi|hitler|suicide|drugs?|cocaine|weed|"
                   r"trump|biden|elon|musk|obama|putin|logo|nike|disney|marvel|pokemon|text|caption|words?)\b", re.I)
CHECK_SYSTEM = (
    "You screen short meme ideas for a public, all-ages cartoon about fruit flies. Reply with JSON only: "
    '{"allow": true|false, "reason": "<5 words>"}. Deny: sexual content, nudity, violence against people, gore, '
    "hate or slurs, harassment, real people or public figures, politics, drugs, self-harm, brands or logos, "
    "copyrighted characters, scams or financial promises, anything asking to write text in the image. "
    "Silly, weird and mildly gross-out fly humour is fine."
)
PALETTE = {"red": (224, 52, 44), "green": (61, 220, 132), "sky blue": (108, 196, 216), "golden yellow": (242, 181, 68),
           "purple": (199, 125, 255), "pink": (255, 126, 182), "lime green": (139, 212, 80), "orange": (255, 159, 90),
           "blue": (60, 110, 230), "brown": (140, 90, 50), "black": (30, 30, 30), "white": (240, 240, 240), "grey": (128, 128, 128)}


class MemeError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _headers() -> dict:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise MemeError(503, "memes aren't switched on yet")
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json",
            "HTTP-Referer": "https://www.flyaiworld.com/flybook/", "X-Title": "Flybook"}


def pick(items: list, post_id: int, salt: int = 0):
    """web/src/words.ts pick(): the same line the app shows for this post."""
    h = (post_id * 2654435761 + salt * 40503) % 2**32
    h = (h ^ (h >> 15)) % 2**32
    return items[h % len(items)]


def color_name(hex_color: str) -> str:
    try:
        rgb = tuple(int(hex_color.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    except (ValueError, TypeError):
        return "red"
    return min(PALETTE, key=lambda n: sum((a - b) ** 2 for a, b in zip(PALETTE[n], rgb)))


def clean_idea(idea: str | None) -> str | None:
    idea = " ".join(str(idea or "").split())
    if not idea:
        return None
    if len(idea) > IDEA_MAX or not IDEA_OK.match(idea):
        raise MemeError(400, f"keep the idea to {IDEA_MAX} letters, numbers and simple punctuation")
    if BLOCK.search(idea):
        raise MemeError(400, "that idea isn't allowed; try something else")
    return idea


def check_idea(idea: str) -> None:
    """Ask a cheap text model whether the idea is fine. Anything unclear counts as no."""
    try:
        r = requests.post(f"{OPENROUTER}/chat/completions", headers=_headers(), timeout=20, json={
            "model": CHECK_MODEL, "temperature": 0, "max_tokens": 40, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": CHECK_SYSTEM}, {"role": "user", "content": f"Idea: {idea}"}]})
        verdict = json.loads(r.json()["choices"][0]["message"]["content"])
    except MemeError:
        raise
    except Exception:
        raise MemeError(502, "couldn't check that idea right now; try again or leave it empty")
    if verdict.get("allow") is not True:
        raise MemeError(400, "that idea isn't allowed; try something else")


def texts(post: dict, neighbour: str | None) -> tuple[str, str]:
    """Top: what the fly 'said' (its post headline). Bottom: what really happened."""
    word, kind, truth = post["word"], post["kind"], post["truth"]
    actions = sorted(post.get("actions") or [], key=lambda a: -a.get("z", 0))
    did = ACTION_LABELS.get(actions[0]["key"], actions[0]["key"]) if actions else ""
    cause = post.get("cause")
    really = CAUSE.get(cause["channel"], "{}").format(neighbour or "a neighbour") if cause else REALLY.get(truth, truth)
    if word not in LINES:
        top = f"*{did or 'twitches'}*"
        bottom = "No reason at all. Just its neurons." if truth == "nothing" and not cause else f"Because: {really}"
        return top, bottom
    top = pick(LINES[word]["sure" if kind == "sense" else "unsure"], post["id"])
    if kind == "hallucination":
        bottom = "Really: nothing was there"
    elif kind == "misread":
        bottom = f"Really: {really}"
    else:
        bottom = f"And it was right: {really}"
    return top, bottom


def prompt(post: dict, fly: dict, style: str, idea: str | None) -> str:
    word, kind, truth = post["word"], post["kind"], post["truth"]
    actions = sorted(post.get("actions") or [], key=lambda a: -a.get("z", 0))
    reaction = REACTION.get(actions[0]["key"], "staring with a puzzled look") if actions else "staring with a puzzled look"
    if word in SCENE and kind == "hallucination":
        scene = f"it is convinced it sees {SCENE[word]}, but nothing is really there, so show that as a faint dreamy thought bubble"
    elif word in SCENE and kind == "misread":
        scene = f"it thinks it sees {SCENE[word]}, while really there is {SCENE.get(truth, 'nothing special')}"
    elif word in SCENE:
        scene = SCENE[word]
    else:
        scene = SCENE.get(truth, "nothing special around it")
    text = (f"{STYLES[style][1]}. The star is a cute cartoon fruit fly character with a {color_name(fly.get('color', ''))} body, "
            f"big round glossy red compound eyes, two small antennae and clear wings, {reaction}; {scene}.")
    if idea:
        text += f" Theme of the joke: {idea}."
    return text + (" Square image, the fly large and central, calm space at the top and bottom edges. "
                   "No text, no letters, no words, no captions, no watermark, no real people, no brand logos.")


def generate(prompt_text: str) -> tuple[bytes, float | None]:
    try:
        r = requests.post(f"{OPENROUTER}/images", headers=_headers(), timeout=120,
                          json={"model": IMAGE_MODEL, "prompt": prompt_text, "aspect_ratio": "1:1"})
    except requests.RequestException:
        raise MemeError(502, "the image service didn't answer; try again in a minute")
    if not r.ok:
        raise MemeError(502, f"the image service said no ({r.status_code}); try a different style or idea")
    body = r.json()
    try:
        data = base64.b64decode(body["data"][0]["b64_json"])
    except (KeyError, IndexError, TypeError, ValueError):
        raise MemeError(502, "the image service returned no image; try again")
    return data, (body.get("usage") or {}).get("cost")


def _fit(draw: ImageDraw.ImageDraw, text: str, width: int, start: int, lines_max: int = 2):
    for size in range(start, 30, -4):
        font = ImageFont.truetype(str(FONT), size)
        words, lines, line = text.split(), [], ""
        for w in words:
            nxt = f"{line} {w}".strip()
            if draw.textlength(nxt, font=font) <= width or not line:
                line = nxt
            else:
                lines.append(line)
                line = w
        lines.append(line)
        if len(lines) <= lines_max and all(draw.textlength(l, font=font) <= width for l in lines):
            return font, lines
    return ImageFont.truetype(str(FONT), 30), lines[:lines_max]


def compose(png: bytes, top: str, bottom: str) -> bytes:
    """Stamp meme text (Anton, white with black outline) and the AI tag; return a SIZE x SIZE WebP."""
    img = Image.open(io.BytesIO(png)).convert("RGB")
    side = min(img.size)
    img = img.crop(((img.width - side) // 2, (img.height - side) // 2, (img.width + side) // 2, (img.height + side) // 2))
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    draw = ImageDraw.Draw(img)
    width = int(SIZE * 0.92)

    def block(text: str, y: int, from_bottom: bool) -> None:
        font, lines = _fit(draw, text.upper(), width, 84)
        height = font.size + 8
        y0 = y - height * len(lines) if from_bottom else y
        for i, line in enumerate(lines):
            w = draw.textlength(line, font=font)
            draw.text(((SIZE - w) / 2, y0 + i * height), line, font=font, fill="white",
                      stroke_width=max(3, font.size // 14), stroke_fill="black")

    block(top, 22, False)
    block(bottom, SIZE - 52, True)
    tag = ImageFont.truetype(str(FONT), 22)
    label = "AI IMAGE · FLYAIWORLD.COM/FLYBOOK"
    draw.text((SIZE - 16 - draw.textlength(label, font=tag), SIZE - 36), label, font=tag, fill=(255, 255, 255),
              stroke_width=2, stroke_fill="black")
    out = io.BytesIO()
    img.save(out, "WEBP", quality=82, method=5)
    return out.getvalue()


def upload(supabase_url: str, service_key: str, path: str, data: bytes) -> None:
    r = requests.post(f"{supabase_url}/storage/v1/object/memes/{path}", data=data, timeout=60, headers={
        "Authorization": f"Bearer {service_key}", "apikey": service_key, "Content-Type": "image/webp",
        "cache-control": "31536000", "x-upsert": "false"})
    if not r.ok:
        raise MemeError(502, f"couldn't save the meme ({r.status_code}); try again")


def remove(supabase_url: str, service_key: str, path: str) -> None:
    requests.delete(f"{supabase_url}/storage/v1/object/memes/{path}", timeout=30,
                    headers={"Authorization": f"Bearer {service_key}", "apikey": service_key})
