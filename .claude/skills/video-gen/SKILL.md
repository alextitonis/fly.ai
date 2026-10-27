---
name: video-gen
description: Generate short AI video clips (memes, promos, social posts) from a text prompt or a start image via the OpenRouter video API. Use when someone asks to make, generate or render a video, clip, short, reel or animated meme. Cheapest model first, one clip at a time, report the cost after each clip.
---

# Video generation (OpenRouter)

Makes short clips with OpenRouter's async video API: submit a job, poll it, download the MP4.
Everything runs through `gen_video.py`, which sits next to this file and uses only the Python standard library.

## Setup (once per machine)

- An OpenRouter key in the environment: `OPENROUTER_API_KEY=sk-or-...`
  Use a key with a **spend cap** set in the OpenRouter dashboard. Video costs add up fast.
- Python 3.9+. Nothing to install.

## Rules for the agent

1. **Cost first.** Before the first clip, run `list` and pick the cheapest model that fits the request.
   Default to a cheap 480p "lite" tier, about 4–6 s long. Only move to premium models (Veo, Kling, etc.) when the user asks for quality.
2. **One clip at a time.** Make one clip, show the user the file and its cost (`usage.cost`), then ask before making more.
   Never start a batch without the user agreeing to a total, e.g. "5 clips ≈ $0.50, OK?".
3. **Short and vertical by default.** For social posts use `--aspect 9:16 --duration 5`. Ask for anything else only when it matters.
4. **Prompt like a shot list:** subject, action, camera, style, lighting, mood. Keep it to one scene per clip.
   Example: `"cartoon housefly in sunglasses DJing on a sugar cube, crowd of flies dancing, handheld close-up, neon club lighting, chaotic funny energy"`.
5. **No real people's likeness, no brand logos or trademarks** unless the user owns them. Don't generate anything sexual, violent or deceptive.
6. **Outputs** go in `./videos/` (or wherever the user says), with a `.json` sidecar that holds the prompt, model and cost.
   Never print or share the signed `urls` from the API, because anyone with one can download the clip.
7. If a job fails, show the `error` and change the prompt or model before trying again. Don't loop retries.

## Commands

```bash
# list video models (look for the cheap ones: "lite", 480p, low per-second price)
python .claude/skills/video-gen/gen_video.py list

# text -> video
python .claude/skills/video-gen/gen_video.py gen \
  --model <model-id> \
  --prompt "cartoon fly surfing a wave of coffee, slow motion, sunny" \
  --duration 5 --aspect 9:16 --resolution 480p

# image -> video (animate a still; first frame)
python .claude/skills/video-gen/gen_video.py gen --model <model-id> \
  --prompt "the fly blinks and takes off" --image ./fly.png

# no audio (cheaper on some models)
python .claude/skills/video-gen/gen_video.py gen ... --no-audio
```

The script prints the job id while it polls, then the saved path and cost.
If it is interrupted, resume with `python gen_video.py fetch <jobId>`.

## Using it from your own agents (Agent SDK / API tool)

Expose the script as a tool, or let the agent call it through Bash. A minimal tool definition:

```json
{
  "name": "generate_video",
  "description": "Generate one short video clip. Returns file path and cost. Call once per clip; confirm with the user before generating more.",
  "input_schema": {
    "type": "object",
    "properties": {
      "prompt": {"type": "string"},
      "model": {"type": "string", "description": "OpenRouter video model id; cheapest suitable"},
      "duration": {"type": "integer", "default": 5},
      "aspect_ratio": {"type": "string", "default": "9:16"},
      "resolution": {"type": "string", "default": "480p"},
      "image_path": {"type": "string", "description": "optional first-frame image"}
    },
    "required": ["prompt", "model"]
  }
}
```

The tool handler runs `gen_video.py gen ...` and returns its last line, which is JSON.
For sub-agents, give them this skill and the same rules: one clip, report cost, wait for approval.

## Tips

- Typical cost: lite tiers are a few cents per second, premium models are $0.10–$0.50+ per second. Check `list` because prices change.
- A job takes 30 s to a few minutes. The script checks every 15 s and gives up after 15 min; resume with `fetch`.
- To join clips or add captions, use ffmpeg:
  `ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`
- Each run creates a new job and gets billed again, so tweak the prompt only after watching the clip.
