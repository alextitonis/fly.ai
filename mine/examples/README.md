# fly.ai compute examples

Ready-to-run programs for the fly.ai compute network. Miners run them sandboxed in their browsers and send back the
outputs. Each example has its source, a prebuilt `.wasm` (or `.wgsl` shader), and a script to make inputs or
read outputs where it needs one.

- Buy compute: https://www.flyaiworld.com/compute/jobs
- The full API guide: https://www.flyaiworld.com/compute/compute-api.md
- Source: https://github.com/alextitonis/fly.ai/tree/main/mine/examples

| example | what it shows | jobs | output |
|---|---|---|---|
| [`pi-rust`](pi-rust) | Monte Carlo pi, integers only | `count: N`: each job is a seed | 8 bytes: hits |
| [`hash-search`](hash-search) | proof-of-work nonce search, double SHA-256 over a block header (Bitcoin's scheme) | one input per nonce range | the nonces that meet the target |
| [`btc-pool`](btc-pool) | a bridge from a Bitcoin mining pool (Stratum) to a keep-open hash-search order: jobs out, shares back to the pool | added by the bridge | shares submitted to your pool account |
| [`yespower`](yespower) | proof-of-work nonce search for the yespower family, ported to pure Rust from the reference implementation | one input per nonce range | the nonces that meet the target |
| [`yespower-pool`](yespower-pool) | the same bridge for a yespower pool, but as a house order: the project's own mining, and miners earn points | added by the bridge | shares submitted to the project's address |
| [`kaspa`](kaspa) | kHeavyHash as a WebGPU shader, plus a pool bridge: GPU mining for the project as a house order | added by the bridge | the nonces that met the pool's target |
| [`mandelbrot-tiles`](mandelbrot-tiles) | a 2048 × 2048 image rendered as 64 tiles, then stitched | `count: 64`: each job is a tile | 256 × 256 iteration counts |
| [`tsp-search`](tsp-search) | travelling salesman by random restarts: keep the best tour | `count: N`: each job is a restart | tour length + city order |
| [`wordcount-wasi`](wordcount-wasi) | an ordinary program: stdin in, stdout out (WASI) | one input per text file | lines of "count word" |
| [`matmul-wgsl`](matmul-wgsl) | GPU matrix multiply in a WGSL compute shader, compared within a float tolerance | one input per matrix pair | the product |
| [`es-cartpole`](es-cartpole) | a fitness for an `evolve` training run: how long a linear policy balances a cart-pole | made by the run, one per batch of perturbations | one f64 score per member |
| [`train-logreg`](train-logreg) | a train step for a `train` run (softmax regression): the template for bringing your own model | made by the run, one per data shard | the weight change, then the loss |

## Try one in five minutes

You need Node 22.18 or newer. Commands run from `mine/`.

**1. Run it locally, exactly as a miner would.** The runner does the miners' checks, runs the module twice
and tells you if the two runs agree:

```sh
node examples/run-local.ts examples/pi-rust/pi.wasm --index 0
# checks: ok · entry run · memory capped at 262144 KiB · imports flyai.input_len, flyai.input_read, flyai.output
# output: 8 bytes in 57 ms · first bytes …
# the same twice: miners will agree
```

**2. Order it.** This uploads the program, prices the order, creates it, and prints the exact amount to pay:

```sh
node examples/order.ts create --wallet 0xYourWallet --program examples/pi-rust/pi.wasm --count 1000 --timeout 30
# 1000 jobs at 20 $FLYAI each (lowest 20); the whole order costs at most 20000 $FLYAI
# order 3f2c… created (key and secret saved to order-3f2c….json; they aren't shown again)
# pay: send exactly 20000000000000412345 wei of $FLYAI …
#   cast send 0x0088CE79… "transfer(address,uint256)" 0x6258… 20000000000000412345 --rpc-url … --private-key $KEY
```

**3. Pay:** send that exact amount from the same wallet. Use MetaMask or any wallet, or the printed `cast`
command. Then hand over the transaction:

```sh
node examples/order.ts pay --order <id> --tx <transaction hash>
```

**4. Collect results as miners finish them:**

```sh
node examples/order.ts watch --order <id> --out results/
# live: 312/1000 settled …
```

Each job gives `results/<job number>.out`, the output, and `results/<job number>.json`, the result row. The
row says who checked it (`agreement`, `single` or `disputed`), any error, and every distinct answer if miners
disagreed.

You can do all of this from the website too: open **Buy compute**, choose **Your own program**, and upload
the file.

## The examples

### pi-rust

```sh
node examples/order.ts create --wallet 0x… --program examples/pi-rust/pi.wasm --count 1000 --timeout 30
node examples/order.ts watch --order <id> --out pi/
```

Each output is a u64 hit count over 5,000,000 samples, and π ≈ 4 × total hits / (jobs × 5,000,000). Integer
math only, so every miner agrees exactly.

### hash-search

```sh
node examples/hash-search/make-inputs.ts                     # demo: 4 ranges around Bitcoin's genesis block
node examples/hash-search/make-inputs.ts --header <160 hex> --target <64 hex> --start 0 --total 4294967296 --per-job 2000000 --out inputs/
node examples/order.ts create --wallet 0x… --program examples/hash-search/hash_search.wasm --inputs inputs/ --timeout 60
```

Each input is a header, a nonce range and a target. Each output lists the nonces whose double SHA-256 meets
the target. This is the pattern for proof-of-work mining, and for any "search a huge space in chunks" job.

- **No pool connection:** jobs have no network, so your own server takes the found nonces and submits them. [`btc-pool`](btc-pool) is that server for a Bitcoin pool.
- **CPU speed:** a CPU won't compete on Bitcoin itself. It's there to show the pattern and to test with.
- **Other coins:** compile their hash function in place of SHA-256d, for example RandomX for Monero.
- **Size jobs to your time limit:** measure with `run-local.ts` and aim for roughly half of it.

### mandelbrot-tiles

```sh
node examples/order.ts create --wallet 0x… --program examples/mandelbrot-tiles/mandelbrot_tiles.wasm --count 64 --timeout 60
node examples/order.ts watch --order <id> --out tiles/
node examples/mandelbrot-tiles/stitch.ts tiles/ mandelbrot.pgm
```

Each job renders one tile. The same pattern fits ray tracing, image filters and map tiles.

### tsp-search

```sh
node examples/order.ts create --wallet 0x… --program examples/tsp-search/tsp_search.wasm --count 500 --timeout 30
```

Each job starts from its own random tour and improves it until nothing helps. Take the smallest length from
the first 4 bytes of each output, and the tour is the 60 bytes after it. More jobs give a better best answer.
The same pattern fits SAT solving, scheduling, packing and any search with random restarts.

### wordcount-wasi

```sh
mkdir texts && cp *.txt texts/
node examples/order.ts create --wallet 0x… --program examples/wordcount-wasi/wordcount.wasm --inputs texts/
```

A plain `main()` that reads stdin and prints to stdout. Any program built for `wasm32-wasip1` works this way.

### matmul-wgsl

```sh
node examples/matmul-wgsl/make-inputs.ts --n 256 --jobs 20 --out mats/
node examples/order.ts create --wallet 0x… --program examples/matmul-wgsl/matmul.wgsl --inputs mats/ \
  --dispatch 16,16,1 --output-bytes 262144 --tolerance 0.01
```

GPU jobs run on miners' graphics cards. GPUs from different vendors round floats slightly differently, so
compare within a tolerance.

## Make your own

**1. Start from the closest example.** Copy its folder:

```sh
cp -r examples/pi-rust examples/my-job
```

**2. Write the job.** A module talks to the miner in one of two ways.

With the `flyai` imports:

```rust
#[link(wasm_import_module = "flyai")]
extern "C" {
    fn input_len() -> i32;              // the input's size
    fn input_read(ptr: *mut u8);        // copy the input into memory
    fn output(ptr: *const u8, len: i32); // append to the output
}

#[no_mangle]
pub extern "C" fn run() {
    let mut input = vec![0u8; unsafe { input_len() } as usize];
    unsafe { input_read(input.as_mut_ptr()) };
    let result = input.iter().rev().copied().collect::<Vec<u8>>(); // your work here
    unsafe { output(result.as_ptr(), result.len() as i32) };
}
```

Or with WASI: build for `wasm32-wasip1`, read stdin and write stdout. There are no files, network, clock or
arguments. Random numbers are allowed, and they're the same for every miner of a job.

For `count: N` jobs, the input is 4 bytes: the job number, u32 little-endian. Use it as a seed, a tile
number or an offset.

**3. Build it:**

| language | build |
|---|---|
| Rust (flyai imports) | `rustup target add wasm32-unknown-unknown` then `cargo build --release --target wasm32-unknown-unknown` (`[lib] crate-type = ["cdylib"]`) |
| Rust (WASI) | `rustup target add wasm32-wasip1` then `cargo build --release --target wasm32-wasip1` |
| C / C++ | wasi-sdk: `$WASI_SDK/bin/clang -O2 -o job.wasm job.c` |
| Zig | `zig build-exe job.zig -target wasm32-wasi -O ReleaseSmall` |
| Go | TinyGo: `tinygo build -target=wasip1 -opt=2 -o job.wasm .` |
| AssemblyScript | `asc job.ts -O3 --runtime stub -o job.wasm` (declare `@external("flyai", "output")`) |
| GPU | write a `.wgsl` file; no build (see `matmul-wgsl/matmul.wgsl` for the bindings) |

**4. Check it agrees with itself:**

```sh
node examples/run-local.ts examples/my-job/target/wasm32-unknown-unknown/release/my_job.wasm --index 0
```

- **Different outputs across runs:** fix that first. Sort anything unordered (hash maps), and don't read the
  clock.
- **Floats:** WebAssembly float math is the same on every machine. GPU float math isn't, so shaders need a
  tolerance.

**5. Order it.** Use `examples/order.ts create …` as above, or the website.

**6. Share it:** add the folder to this repo with a `.wasm`, its source and a line in the table above. The
test-suite check that every example passes the miners' checks and gives the right answer lives in
`examples/test-examples.ts`, so add yours there (`npm run test:examples`).

## Limits, per job

| | |
|---|---|
| module / shader | 8 MiB / 1 MiB |
| input | 8 MiB (uploads) |
| output | 4 MiB |
| memory | 256 MiB |
| time | your `timeout_s`, up to 600 s |
| imports | `flyai.*` and a deterministic WASI subset; no network, files, threads or clock |
| price | at least `min_bid` per started 30 s of the time limit; 80% goes straight to the miners who ran it |

Everything you upload is visible to the miners who run it, so don't put secrets in programs or inputs.
