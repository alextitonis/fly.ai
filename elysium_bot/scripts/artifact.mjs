// Copies the compiled SnipeHelper (ABI + creation + runtime bytecode) into src/ so users never need Foundry.
import { readFileSync, writeFileSync } from "node:fs";
const a = JSON.parse(readFileSync(new URL("../contracts/out/SnipeHelper.sol/SnipeHelper.json", import.meta.url)));
const out = { abi: a.abi, bytecode: a.bytecode.object, deployedBytecode: a.deployedBytecode.object };
writeFileSync(new URL("../src/SnipeHelper.json", import.meta.url), JSON.stringify(out) + "\n");
console.log("wrote src/SnipeHelper.json");
