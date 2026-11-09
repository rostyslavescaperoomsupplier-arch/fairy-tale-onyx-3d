// Texture generation worker: builds PBR maps off the main thread (OffscreenCanvas)
// and sends them back as ImageBitmaps (transferred, no copy).
import { buildBitmaps } from './texgen.js?v=202611091207';
let chain = Promise.resolve();
self.onmessage = (e) => {
  const job = e.data;
  chain = chain.then(() => buildBitmaps(job)).then(
    (r) => self.postMessage(r, [r.color, r.normal]),
    (err) => self.postMessage({ key: job.key, error: String((err && err.message) || err) }));
};
self.postMessage({ ready: typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function' && !!new OffscreenCanvas(1, 1).getContext('2d') });
