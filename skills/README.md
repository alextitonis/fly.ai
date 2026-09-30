# Claude skills

Also on the site: [flyaiworld.com/agents](https://flyaiworld.com/agents) (fly-mode, flyai-compute) and [flyaiworld.com/desk-api](https://flyaiworld.com/desk-api) (flyai-x402).

## fly-mode 🪰

Makes Claude act like a fruit fly, with every reaction coming from a real fly brain: your message becomes something
a fly can sense (a looming shape, a taste, a fly walking past, wind, a touch, a smell), that sense is stimulated in
the MaleCNS v1.0 connectome (166,700 neurons, [`flybrain`](https://pypi.org/project/flybrain/)), and what its neurons
make it do (jump, buzz, groom, turn...) decides how Claude replies. Every reply ends with a brain log.

Install for Claude Code:

```bash
pip install flybrain
cp -r skills/fly-mode ~/.claude/skills/          # all projects
# or: cp -r skills/fly-mode .claude/skills/       # this project only
```

Then say "be a fly". Say "human mode" to stop.

Try the brain on its own:

```bash
python skills/fly-mode/scripts/fly_brain.py "someone brought pizza"
```

The keyword table that turns words into senses is hand-written and is the only made-up part; the reaction is the
connectome's. The first run downloads ~260 MB of brain files.

## flyai-compute 🖥️

Lets Claude Code run jobs on [fly.ai compute](https://www.flyaiworld.com/compute/): fly connectome experiments, or
your own WebAssembly programs and WGSL GPU shaders, run by browser miners. Claude prices the job, creates the order
once you say yes, gives you a pay link to pay in $FLYAI from your own wallet (Claude never touches a key), then
downloads the results as they settle.

```bash
cp -r skills/flyai-compute ~/.claude/skills/     # needs Node 18+, nothing else
```

Then say "run this on fly.ai compute" or "run a connectome sweep of looming vs touch". The script works on its own too:

```bash
node skills/flyai-compute/scripts/flyai.mjs quote --program mine/examples/pi-rust/pi.wasm --count 1000
```

## flyai-x402 🪙

Buys one answer at a time from fly.ai's pay-per-request API, a few cents each, paid over x402 in USDG on Robinhood
Chain or USDC on Base:

| What | Price | You get |
|---|---|---|
| Polymarket read | $0.05 | The fly desk model's probability for a market next to the market's price, with its record |
| Forecast | $0.03 | A TimesFM forecast with a band: a token the desk tracks, or your own series |
| Trade cost | $0.02 | The real round-trip cost of a Robinhood Chain token at your size, through its best pool |
| Token check | $0.03 | Pools, age, links, copycats, contract and holder facts for a Robinhood Chain token |
| Fly brain | $0.05 | A run of the real connectome: stimulate a sense, read what the fly did |
| Fly meme | $0.20 | A generated fly meme image for your idea |

Claude shows the cost and pays only after you say yes, from a wallet key you set in your own environment
(`FLYAI_X402_KEY`); it never sees the key.

```bash
pip install requests eth-account
cp -r skills/flyai-x402 ~/.claude/skills/
```

Then ask "what does the fly desk think of this market?" with a polymarket.com link, or "what does it cost to trade
$200 of NVDA on Robinhood Chain?". The script works on its own too:

```bash
python skills/flyai-x402/scripts/flyai_x402.py products               # free
python skills/flyai-x402/scripts/flyai_x402.py cost NVDA --usd 200 --yes
```

Where a model is involved its record comes with the answer. So far the Polymarket model has not beaten the market's
own price: read it as an opinion.
