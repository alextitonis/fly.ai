// Turns one frame of the game window into a JPEG (base64) off the pet's main thread (src/coach.ts): the only heavy step
// the pet does for the coach, and only when a frame is actually sent.
const QUALITY = 0.72;

self.onmessage = async (e: MessageEvent<{ id: number; bitmap: ImageBitmap }>) => {
  const { id, bitmap } = e.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY })).arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    (self as unknown as Worker).postMessage({ id, jpeg: btoa(bin) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  } finally {
    bitmap.close();
  }
};
