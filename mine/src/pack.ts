/**
 * One finished house order's outputs as one file. Thousands of small files take whole 4 KB blocks on the volume and a
 * download each; one atlas order went from 7.9 MB to about 1.3 MB.
 *
 * The file is gzip members of ~256 KB of records, each record [sha256, 32 B][length, u32 LE][bytes]. Gunzipped whole it is
 * one list of records (decodePack, for a pull); blob_packed holds each output's member, so one output reads a small range
 * (readMember). 2026-11-02: the first version was one gzip, and reading one output inflated all of it: the research
 * process went past 1.6 GB and the kernel killed it.
 */
import { createHash } from "node:crypto";
import { closeSync, openSync, readSync, writeSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

const MEMBER_BYTES = 256 * 1024;

/** hash -> bytes. With `check`, a record whose bytes don't match its hash throws. */
export function decodePack(file: Uint8Array, check = false): Map<string, Buffer> {
  const raw = gunzipSync(file);
  const out = new Map<string, Buffer>();
  for (let at = 0; at < raw.length;) {
    const hash = raw.toString("hex", at, at + 32);
    const size = raw.readUInt32LE(at + 32);
    const bytes = raw.subarray(at + 36, at + 36 + size);
    if (bytes.length !== size) throw new Error("pack is cut short");
    if (check && createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error(`pack record ${hash.slice(0, 12)} doesn't match its hash`);
    out.set(hash, bytes);
    at += 36 + size;
  }
  return out;
}

export interface Placed { hash: string; offset: number; length: number }

/** Appends records to a file member by member, holding at most one member in memory. */
export class PackWriter {
  placed: Placed[] = [];
  members = 0;
  rawBytes = 0;
  private fd: number;
  private at = 0;
  private parts: Uint8Array[] = [];
  private hashes: string[] = [];
  private held = 0;
  private sha = createHash("sha256");

  constructor(path: string) { this.fd = openSync(path, "w"); }

  add(hash: string, bytes: Uint8Array): void {
    const head = Buffer.alloc(36);
    head.write(hash, 0, 32, "hex");
    head.writeUInt32LE(bytes.length, 32);
    this.parts.push(head, bytes);
    this.hashes.push(hash);
    this.held += bytes.length + 36;
    this.rawBytes += bytes.length;
    if (this.held >= MEMBER_BYTES) this.flush();
  }

  private flush(): void {
    if (!this.hashes.length) return;
    const member = gzipSync(Buffer.concat(this.parts));
    writeSync(this.fd, member);
    this.sha.update(member);
    for (const hash of this.hashes) this.placed.push({ hash, offset: this.at, length: member.length });
    this.at += member.length;
    this.members++;
    this.parts = [];
    this.hashes = [];
    this.held = 0;
  }

  /** The file's own hash and size. */
  close(): { hash: string; size: number } {
    this.flush();
    closeSync(this.fd);
    return { hash: this.sha.digest("hex"), size: this.at };
  }
}

/** The records of the member at this range. */
export function readMember(path: string, offset: number, length: number, check = false): Map<string, Buffer> {
  const fd = openSync(path, "r");
  try {
    const member = Buffer.alloc(length);
    if (readSync(fd, member, 0, length, offset) !== length) throw new Error("pack is cut short");
    return decodePack(member, check);
  } finally {
    closeSync(fd);
  }
}
