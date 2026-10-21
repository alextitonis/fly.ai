/**
 * The bell's Sunday claim reminder (src/profiles.ts claimRow): the wallet's FLYAI in the week that just settled, one
 * row for all its flies, gone once the 24 h claim window closes; nothing for wallets the week didn't pay.
 *   npm run test:claimremind
 */
import { claimRow, CLAIM_WINDOW_MS, type DeskClaims } from "./profiles.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

const ME = "0xc3f177cde371108fcbde27aa746b22aed7d8326a";
const settled = Date.parse("2026-10-25T00:00:00Z");
const claims: DeskClaims = {
  epoch: 3, settled_at: "2026-10-25T00:00:00Z",
  leaves: [
    { account: "0xC3f177cDe371108FCBde27aA746B22AeD7d8326a", fly: 588, epoch_wei: "2000000000000000000" },
    { account: "0xC3f177cDe371108FCBde27aA746B22AeD7d8326a", fly: 571, epoch_wei: "500000000000000000" },
    { account: "0xC3f177cDe371108FCBde27aA746B22AeD7d8326a", fly: 12, epoch_wei: "0" },   // earned in older weeks only
    { account: "0x0000000000000000000000000000000000000001", fly: 7, epoch_wei: "9000000000000000000" },
  ],
};

const row = claimRow(claims, ME, settled + 3600_000);
check("one row for the wallet's flies that earned this week", !!row && row.flies.join() === "588,571", JSON.stringify(row?.flies));
check("the week's FLYAI summed", row?.amount_wei === "2500000000000000000", row?.amount_wei);
check("dated at the close, closing 24 h later", row?.at === settled && row?.closes === settled + CLAIM_WINDOW_MS);
check("the epoch named", row?.epoch === 3);
check("gone once the window closes", claimRow(claims, ME, settled + CLAIM_WINDOW_MS + 1) === null);
check("nothing for a wallet the week didn't pay", claimRow(claims, "0x00000000000000000000000000000000000000ff", settled) === null);
check("nothing without a settle time (an older desk)", claimRow({ ...claims, settled_at: null }, ME, settled) === null);
check("nothing when the desk is unreachable", claimRow(null, ME, settled) === null);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("all ok");
