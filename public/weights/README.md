# public/weights — pre-trained N-Tuple Network weights

This directory holds the trained `4x6patt` N-Tuple weight file that
the WASM solver loads at runtime. The file is **not committed to git**
(see the project root `.gitignore`) but it **is copied verbatim into
the production bundle** by `vite build`, so any deployment of this
repository ships the weights to end users.

## Provenance and license

The file originates from the MIT-licensed `moporgic/TDL2048` project
(Copyright (c) 2021 Hung Guei). The upstream README and makefile
document its canonical download URL and auto-download it during
build. We redistribute it under the same MIT License, with
attribution. See [`/NOTICE.md`](../../NOTICE.md), section 3, for the
full provenance and the legal basis.

## Local setup (developers)

```bash
# From the repo root
mkdir -p public/weights

# Pull the upstream file (≈157 MB, xz-compressed)
curl -L -o public/weights/4x6patt.w.xz \
  https://moporgic.info/2048/model/4x6patt.w.xz

# Decompress (xz must be installed locally)
unxz -k public/weights/4x6patt.w.xz   # produces 4x6patt.w (256 MB)

# Re-gzip so the browser can decompress with DecompressionStream('gzip')
gzip -k public/weights/4x6patt.w      # produces 4x6patt.w.gz

# Match the filename the app expects:
mv public/weights/4x6patt.w.gz public/weights/4x6patt.trained.w.gz
```

After this, `npm run dev` will serve the file at
`/weights/4x6patt.trained.w.gz` and the solver will load successfully.

## Attribution preservation

Because this directory ships into deployments, the same MIT attribution
that covers the upstream weights must follow them. The application's
"How it plays" panel and root `README.md` both carry that attribution,
so do not remove or weaken those in any fork or deploy.
