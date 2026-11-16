// electron-builder calls this for each Windows file it signs. It signs through SSL.com eSigner's CodeSignTool, whose key lives
// in their cloud (new certificates can't be plain files since 2023). With no account set up it skips, and the build is unsigned.
const { spawnSync } = require("node:child_process");
const { basename, join } = require("node:path");

exports.default = async function sign({ path }) {
  const { ESIGNER_USERNAME, ESIGNER_PASSWORD, ESIGNER_CREDENTIAL_ID, ESIGNER_TOTP_SECRET, CODE_SIGN_TOOL_DIR } = process.env;
  if (!ESIGNER_USERNAME || !CODE_SIGN_TOOL_DIR) {
    console.log(`  not signing ${basename(path)}: no eSigner account set up (flypet/SIGNING.md)`);
    return;
  }
  const res = spawnSync(join(CODE_SIGN_TOOL_DIR, "CodeSignTool.bat"), ["sign",
    `-username=${ESIGNER_USERNAME}`, `-password=${ESIGNER_PASSWORD}`, `-credential_id=${ESIGNER_CREDENTIAL_ID}`,
    `-totp_secret=${ESIGNER_TOTP_SECRET}`, `-input_file_path=${path}`, "-override=true"],
    { cwd: CODE_SIGN_TOOL_DIR, shell: true, encoding: "utf8" });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (res.status !== 0 || /error/i.test(out)) throw new Error(`signing ${basename(path)} failed`);   // the output can hold secrets
  console.log(`  signed ${basename(path)}`);
};
