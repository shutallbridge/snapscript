# Shipping build123d and OCP as a standalone program

Research for [#108](https://github.com/shutallbridge/snapscript/issues/108), part of the
[0.1.0 map](https://github.com/shutallbridge/snapscript/issues/100). Researched 2026-10-31.

## The question

The instructor tool runs on the instructor's own computer (macOS, Windows or Linux). It must
be able to generate the base parts, which `magnets bases` does today with build123d, without
the instructor installing Python. How can build123d, and OCP (the Python bindings to the
OpenCascade CAD kernel underneath it), be shipped that way? How big is the result, what has to
be built and signed for each platform, and what are the alternatives?

## Short answer

Two routes work today, and I ran both on this Mac:

1. **A private Python that the tool installs with uv** (recommended for 0.1.0). The instructor
   tool carries the `uv` program, which is one file of about 15 MB per platform, built and
   published by Astral. The first time bases are needed, uv downloads a standalone Python and the
   pinned packages into a folder the tool owns, then runs `magnets bases`. That is about 300 MB of
   downloads once, and about 700 MB on disk. We build nothing per platform. We publish one
   pure-Python package of the base generator. It needs the network on first use.
2. **A frozen program built with PyInstaller** (the fallback). PyInstaller packs Python, build123d
   and OCP into one folder. It worked here on the second try. Its output matched the unfrozen
   run byte for byte: same STL, and STEP files that differ only in their timestamp. The folder
   is about 365 MB on disk, or about 85 MB compressed for download. It has to be built on each
   of the three operating systems (CI runners can do it), and signed and notarized for macOS.
   CadQuery's own editor ships this way.

Ruled out: **PyOxidizer** (unmaintained since its last release in 2022), and **rewriting the
bases in JavaScript on OpenCascade.js** (no release since 2020). **Nuitka** probably works, but it
only recently stopped hanging on OCP and gives nothing over PyInstaller here.

**WebAssembly is worth watching.** There is a working WebAssembly build of OCP for build123d
(OCP.wasm, run through Pyodide), and Pyodide also runs inside Node. It would be a single
artifact for every platform, with no native code to sign. But it is one person's young project,
and I couldn't test it here.

Either native route meets the same Windows problem. OCP's Windows files are not signed, and
Smart App Control (a Windows 11 security feature that refuses to run unsigned, unrecognised code)
can block them. The OCP maintainers have no signed builds. If we want to rule this out, we
would have to sign the files ourselves, which only the PyInstaller route lets us do.

## What the base generator pulls in

`magnets bases` imports build123d only in `parts.py` and inside `cli.py`'s `bases` command
(`magnets/src/magnets/parts.py:11`, `magnets/src/magnets/cli.py:134`).
`magnets/pyproject.toml` puts build123d in the `bases` extra. The locked build123d 0.13.0
depends on `cadquery-ocp-novtk` 8.0.1.1.0, the version of OCP built without VTK, plus a
long tail of other packages: numpy, scipy, scikit-learn, sympy, IPython, ezdxf, lib3mf, fontTools,
Pillow (through threejs-materials) and others (`magnets/uv.lock`).

Two things matter for shipping:

- **OCP is most of the size.** The OCP package is one 221 MB library on macOS
  (`OCP.cpython-312-darwin.so`). Its wheels on PyPI are 47–67 MB compressed. They exist for
  CPython 3.11–3.14 on macOS 11+ (arm64 and x86_64), Linux with glibc 2.28+ (`manylinux_2_28`;
  x86_64 and aarch64) and Windows x64. There is **no Windows on ARM wheel**
  ([PyPI file list](https://pypi.org/project/cadquery-ocp-novtk/#files)).
- **The CP-SAT solver is imported even when only bases are built.** `magnets/api.py:14` imports
  `solver`, which imports `ortools` at the top (`magnets/src/magnets/solver.py:18`). Leaving
  ortools out (57 MB in the frozen folder) means making that import lazy, or giving the shipped
  program an entry point that doesn't go through `api.py`'s solver import. It is a small change,
  but it has to be made.

## What I tried on this machine

macOS 26.5 on Apple Silicon, uv 0.13.6, Python 3.12, PyInstaller 6.22.3.

| Try | Result |
| --- | --- |
| PyInstaller, a ten-line build123d script (box minus a hole, export STL and STEP), `--onedir` | Built in about 30 s. **Failed at run time**: `lib3mf.dylib could not be found`. build123d imports lib3mf, which loads its library at run time, and PyInstaller can't see that. |
| Same, plus `--collect-all lib3mf` | **Worked.** 365 MB folder; 84 MB as `.tar.xz`, 126 MB as `.zip`. STL identical to the unfrozen run. |
| The real CLI (`magnets bases example --step`) frozen, with `--collect-all lib3mf --collect-data magnets` | **Worked.** 445 MB folder (it includes ortools); 104 MB as `.tar.xz`. All 30 STL files were byte-identical to the unfrozen run's. The STEP files differed only in their timestamp line. |
| Trimming the frozen folder (excluding IPython, jedi, scikit-learn, Pillow) | **Failed** each time. build123d imports IPython (`topology/shape_core.py`), and threejs-materials imports Pillow, when they load. Trimming saved at most about 15%, since OCP is most of the size. Not worth patching. |
| uv route: `uv tool install --python 3.12 'magnets[bases]'` with uv's Python, cache and tool folders all pointed into one private directory | **Worked.** 91 s to install from an empty cache. A 66 MB Python, a 710 MB tool environment, and a cache the tool can delete afterwards. STL identical. |
| Pyodide (WebAssembly Python) in Node with OCP.wasm | **Not run.** The sandbox here blocked running OCP.wasm's third-party bootstrap script. Everything said below about this route comes from its sources. |

Two side observations:

- **The first launch on macOS was slow on both routes.** It took 50–70 s, and later runs took
  1.5–4 s. It happened to the PyInstaller folder and to the uv-installed environment alike, so it
  is macOS checking a large set of new binaries the first time, not PyInstaller. The instructor
  tool should say "first run can take a minute".
- **On macOS, PyInstaller and uv's standalone Python both sign every binary ad hoc** (codesign
  reports `Signature=adhoc`). Files that uv fetched had no quarantine flag (`com.apple.quarantine`),
  so Gatekeeper didn't check them. A PyInstaller folder downloaded through a browser *would*
  carry the flag (see signing below).

## The routes

### PyInstaller (works; the fallback)

- **Others ship OCP this way.** CadQuery's editor, CQ-editor, builds its releases with PyInstaller
  from pip wheels, with a matrix of Ubuntu 22.04, Windows and macOS runners
  ([build workflow](https://github.com/CadQuery/CQ-editor/blob/master/.github/workflows/build.yml),
  [spec file](https://github.com/CadQuery/CQ-editor/blob/master/pyinstaller.spec)). The spec
  lists `OCP` as a hidden import. Release 0.7.0's zipped downloads are 208 MB (macOS arm64),
  216 MB (Windows) and 317 MB (Linux), and those include Qt and a GUI
  ([releases](https://github.com/CadQuery/CQ-editor/releases)). A CadQuery maintainer warns:
  "Pyinstaller is difficult to work with for complex packages, and the builds break often in CI"
  ([cadquery#1655](https://github.com/CadQuery/cadquery/issues/1655)). The fixes reported in
  [OCP#133](https://github.com/CadQuery/OCP/issues/133) were `--collect-data` / `--collect-all`
  for the packages that load files at run time. That matches the lib3mf failure above.
- **No cross-building.** "The output of PyInstaller is specific to the active operating system
  and the active version of Python," and "you must install PyInstaller on each platform and
  bundle your app separately on each"
  ([operating mode](https://pyinstaller.org/en/stable/operating-mode.html),
  [usage](https://pyinstaller.org/en/stable/usage.html)). That makes three CI jobs (macOS arm64,
  Windows x64, Linux x86_64), plus Linux aarch64 and macOS x86_64 if wanted.
- **Ship it as a folder (`--onedir`), not as one file.** A one-file build unpacks itself into a
  temporary `_MEI…` folder on every run, starts more slowly, and leaves that folder behind if it
  is killed ([operating mode](https://pyinstaller.org/en/stable/operating-mode.html)). For a
  roughly 365 MB payload, that would mean copying about 365 MB on every run.
- **Linux:** the frozen folder needs a glibc at least as new as the build machine's, and OCP
  already needs 2.28+. Building on an older distribution's runner keeps it widely compatible.
  CQ-editor builds on Ubuntu 22.04.

### Nuitka (probably works; no advantage here)

Nuitka compiles Python to C and bundles it. Until recently, a standalone build of `import OCP.OCP`
hung on macOS at "Detecting used DLLs". The fix shipped in Nuitka 4.1 in May 2026
([Nuitka#3861](https://github.com/Nuitka/Nuitka/issues/3861)). Like PyInstaller, it needs the
platform's own compiler (Clang/Xcode on macOS, MSVC/MinGW/Zig on Windows, GCC/Clang on Linux), so
it also means one build per OS ([user manual](https://nuitka.net/user-documentation/user-manual.html)).
It has macOS signing options (`--macos-sign-identity`, `--macos-sign-notarization`, from
`nuitka --help` in 4.3.3). Compiling scipy, sympy and the rest would take far longer than
PyInstaller, and the time is spent in OCP's C++ either way, so compiling gains nothing. I
didn't build with it.

### PyOxidizer (ruled out)

Its last release is 0.24.0, from December 2022
([releases](https://github.com/indygreg/PyOxidizer/releases)). Its author stepped back in 2024.
A handover to the PyO3 organisation was discussed and has stalled
([PyOxidizer#751](https://github.com/indygreg/PyOxidizer/issues/751)).

### A private Python installed with uv (recommended)

How it would work: the instructor tool carries or downloads the `uv` program for the platform. It
is a single file, published for every supported platform on
[GitHub Releases](https://github.com/astral-sh/uv/releases); the 0.13.6 archives are 14–17 MB.
When bases are needed, the tool runs `uv tool install` (or `uvx`) for a pinned version of the
base generator, then runs it.

- **Python comes with it.** "By default, uv will automatically download Python versions if they
  cannot be found on the system," and these are builds from Astral's python-build-standalone
  ([Python versions](https://docs.astral.sh/uv/concepts/python-versions/)).
  `UV_MANAGED_PYTHON=1` makes uv ignore any Python the instructor already has.
- **It can live entirely in the tool's own folder.** `UV_PYTHON_INSTALL_DIR`, `UV_TOOL_DIR`,
  `UV_TOOL_BIN_DIR` and `UV_CACHE_DIR` move everything, and `UV_NO_CONFIG` stops uv reading the
  instructor's own uv settings ([environment variables](https://docs.astral.sh/uv/reference/environment/)).
  This is how I ran it above.
- **Versions are pinned.** `uv tool install 'pkg==X'`, with `--with` for extra pins; "each tool
  environment is linked to a specific Python version"
  ([tools](https://docs.astral.sh/uv/concepts/tools/)). For a fully pinned dependency tree, the
  published package should pin its own dependencies exactly, or the tool should pass a constraints
  file (`UV_CONSTRAINT`). The docs don't say whether tool installs honour a lockfile.
- **Platforms:** uv supports macOS 13+, Windows 10+ and Linux (glibc 2.17+ on x86_64, 2.28+ on
  aarch64), with static musl builds too ([platform support](https://docs.astral.sh/uv/reference/policies/platforms/)).
  OCP's wheels narrow this to macOS 11+, glibc 2.28+ and Windows x64.
- **Size:** a 66 MB Python, plus about 260–300 MB of wheels to download per platform (summed from
  the lockfile's wheel sizes for the installed set), about 20 MB less without ortools. On disk
  that is about 700 MB, and the download cache can be cleared afterwards.
- **What we'd build:** one pure-Python wheel of the base generator per release, published to
  PyPI or to a GitHub release. No per-platform builds of our own: Astral builds uv and Python,
  and the OCP project builds OCP.
- **Costs:** a network connection the first time (uv can install offline from a local
  folder with `--find-links`/`UV_FIND_LINKS` and a `file://` Python mirror, if that's ever
  needed). It depends on PyPI keeping those exact wheels, and they can be yanked. The first
  install takes a minute or two.

### WebAssembly (watch; not for 0.1.0 without a test)

- **OCP.wasm** ports build123d's native dependencies to Pyodide, a build of Python that runs in
  WebAssembly, and says "Performance and support may vary across browsers"
  ([README](https://github.com/yeicor/OCP.wasm)). Its OCP build is on PyPI as
  `cadquery-ocp-novtk-OCP.wasm`: one 22 MB wheel, for Pyodide's Python 3.14 only, last built
  2026-09-24 ([PyPI](https://pypi.org/project/cadquery-ocp-novtk-OCP.wasm/)). Its bootstrap
  installs build123d from PyPI with micropip and fakes the native OCP packages it replaces
  ([bootstrap.py](https://github.com/yeicor/OCP.wasm/blob/master/build123d/bootstrap.py)).
  Pyodide is on npm (314.0.7) and runs under Node. The instructor tool could therefore, in
  principle, run the unchanged `parts.py` in-process: one artifact for every OS and no native
  code to sign. The risks: one maintainer (about 50 stars), Python 3.14 only, the bootstrap
  patches packages at install time, and I couldn't test speed or correctness here.
- **OpenCascade.js** (the Emscripten port of OpenCascade itself) has no release since v1.1.1 in
  2020 and no push since 2023. It is still on OpenCascade 7.6.2
  ([repo](https://github.com/donalffons/opencascade.js)). Using it would mean rewriting `parts.py`
  against a different, lower-level API. replicad, a JavaScript CAD library built on it, is active
  ([repo](https://github.com/sgenoud/replicad)), but it is still a rewrite, and two copies of the
  geometry would drift apart. Ruled out.

## Signing, per platform

**macOS.** Software from outside the App Store is checked for "the Developer ID signature", and
"macOS Catalina and later also requires software to be notarized"
([Apple support](https://support.apple.com/en-us/102445)). Notarization requires a Developer ID
certificate, the Hardened Runtime for app *and command-line* targets, and a secure timestamp
([notarizing](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)).
Generating the certificate requires being the Account Holder in the Apple Developer Program
([Developer ID](https://developer.apple.com/developer-id/)). A notarized command-line folder can't
carry its ticket: "Although tickets are created for standalone binaries, it's not currently
possible to staple tickets to them". Gatekeeper looks the ticket up online instead. You submit a
ZIP, disk image or flat package
([customizing the workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)).
PyInstaller ad hoc signs by default. With `--codesign-identity` it signs every collected binary
and turns on the hardened runtime ([feature notes](https://pyinstaller.org/en/stable/feature-notes.html)).
Not checked: whether OCP or numpy need extra entitlements under the hardened runtime. A first
notarized build would show it.

- PyInstaller route: sign everything with a Developer ID, zip it, notarize it. It is needed
  only if the folder reaches the instructor through a browser or another download that sets the
  quarantine flag.
- uv route: nothing of ours to sign. uv-fetched files had no quarantine flag here, and uv's
  Python and OCP come ad hoc signed. The instructor tool's own download (the npm package, or
  whatever it ends up being) is a separate question.

**Windows.** Smart App Control blocks "unknown, unsigned code" unless the code is "signed with a
trusted certificate"
([Smart App Control](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview)).
This already bites OCP: a 2026-10 report has Smart App Control blocking OCP's bundled, unsigned
`TKDEIGES` DLL from the cadquery-ocp wheel. Asked whether signed Windows wheels exist, the
maintainer answered "Not at this time"
([ocp-build-system#68](https://github.com/CadQuery/ocp-build-system/issues/68)). It hits both
native routes. Smart App Control isn't on everywhere: on devices an organisation manages, it
"switches off within 48 hours … unless the user turns it on first"
([App Control](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/appcontrol)).
But where it is on, the uv route can't work around it. The PyInstaller route can, by signing every `.dll` and
`.pyd` in the folder, plus the program. Microsoft's Artifact Signing (formerly Trusted Signing)
is one way to sign: certificates are open to organisations in a listed set of countries
(including Japan, the EU, the UK and the US), and to individual developers only in the United
States or Canada ([quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)).
SmartScreen warnings on signed files fade as the file "has sufficient download history"
([FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq)).

**Linux.** No signing.

## Recommendation

For 0.1.0, **the uv route**. It is the least build work: no per-platform builds and no signing of
our own. It runs exactly what the tests run, and base generation is rare. Per the map, it runs
when a builder makes a kit for a version, so a one-time download of about 300 MB and an install
of about a minute are acceptable. The work is to publish the base generator as a pinned wheel,
make the ortools import lazy, and have the instructor tool manage a private uv folder.

Keep **PyInstaller `--onedir`** as the fallback, for offline instructors or Windows machines with
Smart App Control on. It costs three CI builds per release, about 85–105 MB downloads, macOS
notarization, and Windows signing.

Revisit **OCP.wasm** later. If it proves fast and correct under Node, it would remove the
native-code question entirely.

## Open questions this leaves

- What form the instructor tool itself ships in (npm package, single executable, …). That
  decides who downloads uv and whether quarantine applies. It belongs to the instructor-tool
  ticket.
- Whether bases must work offline. If so, the PyInstaller route, or a pre-filled uv folder.
- Whether OCP.wasm's speed and output match native. That needs a test outside this sandbox.
