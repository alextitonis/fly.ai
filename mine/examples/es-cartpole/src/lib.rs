//! A fitness function for an `evolve` run on fly.ai compute: how long a linear policy balances a cart-pole.
//!
//! The run evolves 5 numbers (4 weights on the cart's state + a bias). Every member of a generation is scored by
//! this module on the same episodes; the server takes the evolution step between generations.
//!
//! Input (src/train.ts wasmFitnessInput):  u32 episode seed | u32 dim | f64 params[dim], all little-endian
//! Output: one f64, the score: steps survived (up to 500), averaged over 3 starts drawn from the episode seed.
//!
//! WebAssembly float math is the same on every engine, and sin/cos here come from Rust's own software libm, so every
//! miner returns the same 8 bytes.
//!
//!   cargo build --release --target wasm32-unknown-unknown

#[link(wasm_import_module = "flyai")]
extern "C" {
    fn input_len() -> i32;
    fn input_read(ptr: *mut u8);
    fn output(ptr: *const u8, len: i32);
}

const GRAVITY: f64 = 9.8;
const CART: f64 = 1.0;
const POLE: f64 = 0.1;
const HALF_LENGTH: f64 = 0.5;
const FORCE: f64 = 10.0;
const DT: f64 = 0.02;
const MAX_STEPS: u32 = 500;

fn sin(x: f64) -> f64 {
    // a Taylor series after range reduction: plain + - * / only, so no engine's own sin is involved
    let pi = core::f64::consts::PI;
    let mut y = x % (2.0 * pi);
    if y > pi { y -= 2.0 * pi; }
    if y < -pi { y += 2.0 * pi; }
    let y2 = y * y;
    let mut term = y;
    let mut sum = y;
    for k in 1..12 {
        term *= -y2 / ((2 * k) as f64 * (2 * k + 1) as f64);
        sum += term;
    }
    sum
}
fn cos(x: f64) -> f64 { sin(x + core::f64::consts::FRAC_PI_2) }

fn episode(w: &[f64], seed: u32) -> u32 {
    // xorshift32 from the seed: the start state, the same for every member of the generation
    let mut s = seed | 1;
    let mut uniform = || {
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        (s as f64 / 4294967296.0) * 0.1 - 0.05
    };
    let (mut x, mut v, mut th, mut om) = (uniform(), uniform(), uniform(), uniform());
    for step in 0..MAX_STEPS {
        let act = w[0] * x + w[1] * v + w[2] * th + w[3] * om + w.get(4).copied().unwrap_or(0.0);
        let force = if act > 0.0 { FORCE } else { -FORCE };
        let (c, sn) = (cos(th), sin(th));
        let total = CART + POLE;
        let temp = (force + POLE * HALF_LENGTH * om * om * sn) / total;
        let alpha = (GRAVITY * sn - c * temp) / (HALF_LENGTH * (4.0 / 3.0 - POLE * c * c / total));
        let acc = temp - POLE * HALF_LENGTH * alpha * c / total;
        x += DT * v;
        v += DT * acc;
        th += DT * om;
        om += DT * alpha;
        if x.abs() > 2.4 || th.abs() > 0.2095 {
            return step;
        }
    }
    MAX_STEPS
}

#[no_mangle]
pub extern "C" fn run() {
    let mut input = vec![0u8; unsafe { input_len() } as usize];
    unsafe { input_read(input.as_mut_ptr()) };
    let seed = u32::from_le_bytes(input[0..4].try_into().unwrap());
    let dim = u32::from_le_bytes(input[4..8].try_into().unwrap()) as usize;
    let w: Vec<f64> = (0..dim).map(|i| f64::from_le_bytes(input[8 + i * 8..16 + i * 8].try_into().unwrap())).collect();
    let mut total = 0u32;
    for k in 0..3u32 {
        total += episode(&w, seed.wrapping_mul(2654435761).wrapping_add(k * 40503));
    }
    let score = total as f64 / 3.0;
    let bytes = score.to_le_bytes();
    unsafe { output(bytes.as_ptr(), 8) };
}
