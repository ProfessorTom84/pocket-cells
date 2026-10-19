/* the AI model's worker: loads mind.js (the model engine), then answers one situation line at a time */
importScripts("mind.js");
let M = null;
onmessage = async (e) => {
  const m = e.data;
  if (m.type === "open") {
    try {
      M = await createMind();
      const put = (buf) => { const p = M._mind_alloc(buf.byteLength); M.HEAPU8.set(new Uint8Array(buf), p); return p; };
      const ok = M._mind_open(put(m.model), m.model.byteLength, put(m.tok), m.tok.byteLength);
      postMessage({ type: "ready", ok: ok > 0, schema: ok });
    } catch (err) { postMessage({ type: "ready", ok: false, error: String(err) }); }
    return;
  }
  if (m.type === "infer" && M) {
    const t0 = performance.now(), n = M.lengthBytesUTF8(m.line) + 1, p = M._mind_alloc(n);
    M.stringToUTF8(m.line, p, n);
    const r = M._mind_infer(p) >> 2, out = M.HEAP32.subarray(r, r + 3);
    M._free(p);
    postMessage({ type: "answer", ticket: m.ticket, goal: out[0], urgency: out[1], conf: out[2], ms: performance.now() - t0 });
  }
};
