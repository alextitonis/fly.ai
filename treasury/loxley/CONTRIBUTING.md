# Contributing

The desk is one file on purpose. Keep it that way.

- **No build, no framework, no install.** The desk is plain JavaScript inside the one `<script>`, plain CSS inside
  the one `<style>`; the terminal is plain Node in `cli/`. The only library it leans on is `viem`, for one reason
  (signing and ABI encoding are the wrong place for hand-rolled code), and it is bundled into `vendor/viem.js` by
  `npm run vendor` and committed, so nobody needs the npm registry to run or test the terminal. `cli/deps.js` is the
  only file that imports it. If a change needs a second library, it probably needs a different change.
- **Every number needs a source.** A new metric says where it is read from, in the code and in `docs/DESK.md`.
- **Nothing simulated without a label.** If a value can be made up (a fallback, a demo, a drill), the desk says so
  where the value is shown.
- **Money moves in two files.** Everything that can sign lives in `cli/wallet.js` and `cli/trade.js`, and only the
  commands `buy`, `sell`, `snipe --live` and `watch --guard` call them. A pull request that adds signing anywhere else,
  a key field to the browser desk, or a transaction that skips the simulate → minimum output → arm sequence is closed.
  A new kind of transaction needs a line in `SECURITY.md` under "what a transaction can be".
- **Tests run without network.** `npm test` runs the terminal against `test/mock-chain.js`, signed transactions
  included; `npm run test:desk` runs the desk against a mocked browser. If you add a read, add it to the mock and a
  check that it arrived. If you add a write, add it to the mock's `exec` and a check that it reverts when it should.
- **The same maths in both faces.** A rule that changes in `cli/engine.js` changes in `index.html` too, and the other
  way round. `docs/SCORING.md` is the contract.
- **The frame is 1080 × 1350.** Every block stays visible, nothing wraps, nothing scrolls, nothing overlaps. Screenshot
  before and after.

Open an issue before a large change. Small ones, just send them.
