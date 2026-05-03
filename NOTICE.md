# Third-Party Notices

`AutoPlay 2048` (npm: `autoplay-2048`) itself is licensed under the
MIT License (see `LICENSE`).
This file records third-party works that informed, are referenced by,
or are loaded into this project at runtime, and the license terms
under which we use, attribute, or redistribute them.

We do **not redistribute the source code** of any project listed
below — `src/lib/engine.ts` and `core/wrapper.cpp` are written from
scratch. We **do redistribute one third-party artefact** (the
trained N-Tuple weight file); see section 3 for its full provenance.

---

## 1. 2048 (the original game) — courtesy attribution

The puzzle game *2048* was created by **Gabriele Cirulli** in 2014.
This project is a fan re-implementation of the same gameplay; no
source code or visual asset from `gabrielecirulli/2048` is included
here. Game mechanics are not protected by copyright, but we credit
the original author by convention of the 2048-clone community.

Source: <https://github.com/gabrielecirulli/2048>

License (MIT) — full text reproduced for reference:

```
The MIT License (MIT)

Copyright (c) 2014 Gabriele Cirulli

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. TDL2048+ — algorithm, weight-file format, and trained weights

`core/wrapper.cpp` is a from-scratch C++ implementation of the
expectimax search and 4x6patt N-Tuple feature evaluation described
by **Hung Guei** in *TDL2048+*, and parses the binary `.w`
weight-file layout defined by that project. No source code from
`moporgic/TDL2048` is compiled into this repository.

The pre-trained 4x6patt weights file shipped under
`public/weights/` (see section 3 below for distribution details) is
obtained from the URL that the upstream `moporgic/TDL2048` README
and `makefile` document and auto-download as part of the project's
build pipeline:

* `README.md` — *"Note that if a pre-trained network is not found,
  it will be automatically downloaded."* — followed by the URL list
  including `https://moporgic.info/2048/model/4x6patt.w.xz`.
* `makefile`, profiling targets — `curl -OJRf moporgic.info/2048/model/$@.w.xz && xz -vd $@.w.xz`.

Both files are part of the MIT-licensed `moporgic/TDL2048`
distribution. We therefore treat the trained weights as part of the
upstream project artefact and redistribute them in this repository
**under the same MIT License, with attribution to Hung Guei**, as
section 3 records.

Source: <https://github.com/moporgic/TDL2048>

License (MIT) — full text reproduced for reference:

```
MIT License

Copyright (c) 2021 Hung Guei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Cited publications referenced for the algorithm:

* H. Guei, *"On Reinforcement Learning for the Game of 2048,"* Ph.D.
  dissertation, Inst. Comput. Sci. Eng., Nat. Yang Ming Chiao Tung
  Univ., Hsinchu, Taiwan, 2023. arXiv:2212.11087.
* H. Guei, L.-P. Chen and I-C. Wu, *"Optimistic Temporal Difference
  Learning for 2048,"* IEEE Trans. Games, vol. 14, no. 3,
  pp. 478–487, Sep. 2022, doi:10.1109/TG.2021.3109887.

---

## 3. Trained N-Tuple weights (`4x6patt.w` / `4x6patt.trained.w`)

A pre-trained 4x6patt N-Tuple weight file is the artefact that gives
this AI its strength. It is the work of **Hung Guei (NYCU CGI Lab)**
and is published as part of the MIT-licensed `moporgic/TDL2048`
project, with the canonical download URL hard-coded in that project's
README and makefile.

* Upstream URL: <https://moporgic.info/2048/model/4x6patt.w.xz>
  (~157 MB, xz-compressed)
* In this repository the file is shipped as
  `public/weights/4x6patt.trained.w.gz` (re-compressed to gzip so
  that the browser's `DecompressionStream('gzip')` can decode it).
  No content modification beyond decompression and re-compression.
* This repository's local copy is **gitignored**; downstream consumers
  obtain the file either by running the local helper documented in
  `public/weights/README.md`, or by deploying the production bundle
  produced from this repository, into which the file is copied from
  `public/`.

### License under which we redistribute

We redistribute the file **under the MIT License of `moporgic/TDL2048`
(Copyright (c) 2021 Hung Guei)**, on the basis that the upstream
README and makefile document the file as part of that project's
build pipeline and provide a stable public download URL for it.
Attribution as required by the MIT License is preserved in this
file (`NOTICE.md`), in the project `README.md`, and in the running
application's UI.

If you redistribute this repository or any deployment built from it,
you must keep this attribution notice with the weight file.

If the upstream author requests a different license arrangement for
the trained weights, this section will be updated to record the
change and the file will be removed pending the new terms.
