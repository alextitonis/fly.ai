// The Microsoft Store package (2026-11-14, the user: "microsoft store for now"). The Store signs what we upload, so no
// certificate is needed; the package only has to carry the app's Store identity, which Partner Center gives once the
// name "Fly Pet" is reserved (Product management > Product identity):
//   FLYPET_STORE_IDENTITY   Package/Identity/Name           e.g. 12345flyai.FlyPet
//   FLYPET_STORE_PUBLISHER  Package/Identity/Publisher      e.g. CN=ABCDEF12-3456-7890-ABCD-EF1234567890
// Fly Pet's own values (reserved 2026-11-14, publisher display name "Fly.ai") are the defaults below.
//   npm run store       -> release/FlyPet-Store-<version>.appx  (upload it in Partner Center)
const { spawnSync } = require("node:child_process");

const identity = process.env.FLYPET_STORE_IDENTITY || "Fly.ai.FlyPet";   // Partner Center 2026-11-14
const publisher = process.env.FLYPET_STORE_PUBLISHER || "CN=D0284B10-5688-4988-8377-459D0CB4EC37";
const res = spawnSync("npx", ["electron-builder", "--win", "appx", "--publish", "never",
  `-c.appx.identityName=${identity}`, `-c.appx.publisher=${publisher}`], { stdio: "inherit", shell: true });
process.exit(res.status ?? 1);
