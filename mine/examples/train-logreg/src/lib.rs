//! A train step for a `train` run on fly.ai compute: softmax regression, written as your own model would be.
//!
//! Use it as the template for bringing any model: read the header, the weights and the shard, take `steps` local
//! steps, write back the change in the weights (and the mean loss). The server averages the miners' changes and
//! starts the next round.
//!
//! Input (src/train.ts wasmTrainInput), little-endian:
//!   u32 header length | header JSON {"steps","batch","lr","weight_decay","seed","params"} | zero padding to 4 bytes
//!   | f32 theta[params] | the data shard as uploaded ("FLYDATA1", u32 rows, u32 x_dim, u32 y_kind = 0, u32 classes,
//!   f32 x[rows * x_dim], u32 labels[rows])
//! Output: f32 delta[params] (new weights - old), then f32 mean loss, f32 accuracy.
//! The weights are W (classes x x_dim, row-major) then b (classes), so params = classes * (x_dim + 1).
//!
//!   cargo build --release --target wasm32-unknown-unknown

#[link(wasm_import_module = "flyai")]
extern "C" {
    fn input_len() -> i32;
    fn input_read(ptr: *mut u8);
    fn output(ptr: *const u8, len: i32);
}

fn u32_at(b: &[u8], at: usize) -> u32 { u32::from_le_bytes(b[at..at + 4].try_into().unwrap()) }
fn f32_at(b: &[u8], at: usize) -> f32 { f32::from_le_bytes(b[at..at + 4].try_into().unwrap()) }

/// The number after `"key":` in a flat JSON object (enough for the header, which the server writes).
fn field(json: &str, key: &str) -> f64 {
    let pat = format!("\"{}\":", key);
    let at = json.find(&pat).expect("a header field is missing") + pat.len();
    let rest = &json[at..];
    let end = rest.find(|c: char| c == ',' || c == '}').unwrap();
    rest[..end].trim().parse().expect("a header field isn't a number")
}

/// exp by range reduction and a series: plain arithmetic, the same bits on every engine.
fn exp(x: f64) -> f64 {
    let x = x.max(-700.0).min(700.0);
    let k = (x / core::f64::consts::LN_2).round();
    let r = x - k * core::f64::consts::LN_2;
    let mut term = 1.0;
    let mut sum = 1.0;
    for n in 1..20 {
        term *= r / n as f64;
        sum += term;
    }
    sum * f64::powi(2.0, k as i32)
}
fn ln(x: f64) -> f64 {
    // Newton on exp(y) = x
    let mut y = 0.0;
    for _ in 0..60 {
        y -= 1.0 - x / exp(y);
    }
    y
}

#[no_mangle]
pub extern "C" fn run() {
    let mut input = vec![0u8; unsafe { input_len() } as usize];
    unsafe { input_read(input.as_mut_ptr()) };
    let hlen = u32_at(&input, 0) as usize;
    let header = core::str::from_utf8(&input[4..4 + hlen]).unwrap();
    let steps = field(header, "steps") as usize;
    let batch = field(header, "batch") as usize;
    let lr = field(header, "lr");
    let wd = field(header, "weight_decay");
    let mut seed = field(header, "seed") as u32 | 1;
    let params = field(header, "params") as usize;
    let at = (4 + hlen + 3) / 4 * 4;
    let theta0: Vec<f64> = (0..params).map(|i| f32_at(&input, at + i * 4) as f64).collect();
    let shard = &input[at + params * 4..];
    assert!(&shard[0..8] == b"FLYDATA1", "the shard isn't FLYDATA1");
    let rows = u32_at(shard, 8) as usize;
    let xd = u32_at(shard, 12) as usize;
    let classes = u32_at(shard, 20) as usize;
    assert!(u32_at(shard, 16) == 0 && params == classes * (xd + 1), "params must be classes * (x_dim + 1) and labels classes");
    let x = |r: usize, i: usize| f32_at(shard, 24 + (r * xd + i) * 4) as f64;
    let label = |r: usize| u32_at(shard, 24 + rows * xd * 4 + r * 4) as usize;

    let mut theta = theta0.clone();
    let mut grad = vec![0.0f64; params];
    let mut z = vec![0.0f64; classes];
    let (mut loss_sum, mut hits, mut seen) = (0.0f64, 0u32, 0u32);
    for _ in 0..steps {
        grad.iter_mut().for_each(|g| *g = 0.0);
        for _ in 0..batch.min(rows) {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            let r = seed as usize % rows;
            let y = label(r);
            let mut max = f64::MIN;
            for c in 0..classes {
                let mut s = theta[classes * xd + c];
                for i in 0..xd { s += theta[c * xd + i] * x(r, i); }
                z[c] = s;
                if s > max { max = s; }
            }
            let total: f64 = z.iter().map(|&s| exp(s - max)).sum();
            let best = (0..classes).fold(0, |b, c| if z[c] > z[b] { c } else { b });
            if best == y { hits += 1; }
            loss_sum += -(z[y] - max - ln(total));
            seen += 1;
            for c in 0..classes {
                let g = exp(z[c] - max) / total - if c == y { 1.0 } else { 0.0 };
                for i in 0..xd { grad[c * xd + i] += g * x(r, i); }
                grad[classes * xd + c] += g;
            }
        }
        let n = batch.min(rows) as f64;
        for k in 0..params { theta[k] -= lr * (grad[k] / n + wd * theta[k]); }
    }
    let mut out: Vec<u8> = Vec::with_capacity(params * 4 + 8);
    for k in 0..params { out.extend_from_slice(&((theta[k] - theta0[k]) as f32).to_le_bytes()); }
    out.extend_from_slice(&((loss_sum / seen.max(1) as f64) as f32).to_le_bytes());
    out.extend_from_slice(&((hits as f64 / seen.max(1) as f64) as f32).to_le_bytes());
    unsafe { output(out.as_ptr(), out.len() as i32) };
}
