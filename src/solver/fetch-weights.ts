import { SolverError } from './types';

export type ProgressCallback = (loaded: number, total: number) => void;

interface FetchOpts {
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
  retries?: number;
}

/** Fetches a weight blob with download progress, gzip auto-decompression,
 *  an offline check, and one retry on transient network failure. */
export async function fetchWeights(url: string, opts: FetchOpts = {}): Promise<Uint8Array> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new SolverError('offline', 'no network connection');
  }
  const attempts = Math.max(1, opts.retries ?? 2);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const bytes = await fetchOnce(url, opts);
      return bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : bytes;
    } catch (e) {
      lastErr = e;
      if (opts.signal?.aborted) throw e;
    }
  }
  throw lastErr ?? new SolverError('fetch', 'unknown fetch failure');
}

async function fetchOnce(url: string, opts: FetchOpts): Promise<Uint8Array> {
  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) throw new SolverError('fetch', `weights fetch ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? '0');
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    opts.onProgress?.(buf.length, buf.length);
    return buf;
  }
  return await readStream(res.body, total, opts.onProgress);
}

async function readStream(
  body: ReadableStream<Uint8Array>,
  total: number,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total || loaded);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

async function gunzip(buf: Uint8Array): Promise<Uint8Array> {
  /* Bytes from `fetch` are always backed by an ArrayBuffer (never the
   * SharedArrayBuffer half of `ArrayBufferLike`), but TS 5.7+ now keeps
   * the generic open and refuses to accept it as a BlobPart. The cast
   * narrows it to the right shape. */
  const part = buf as Uint8Array<ArrayBuffer>;
  const stream = new Blob([part]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
