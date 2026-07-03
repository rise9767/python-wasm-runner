# Python Runner (WASM)

A single-page app that runs Python in the browser via Pyodide (CPython
compiled to WebAssembly). No backend, no build step.

## Files

```
python-wasm-runner/
├── index.html   # page structure
├── style.css    # layout + theme
├── app.js       # boots Pyodide, runs code, handles output/uploads
└── README.md
```

## What you need installed

- **Nothing, to just view it.** Pyodide loads itself from a CDN
  (`cdn.jsdelivr.net`) at runtime — there's no npm package to install
  and no Python installation required on your machine.
- **A local static file server**, because browsers block some of what
  Pyodide needs (WebAssembly fetches, workers) when you open the HTML
  file directly with `file://`. Pick ONE of these:

  **Option A — Python (already on most machines)**
  ```bash
  cd python-wasm-runner
  python3 -m http.server 8000
  ```

  **Option B — Node.js**
  ```bash
  npm install -g serve
  cd python-wasm-runner
  serve -l 8000
  ```

  **Option C — VS Code**
  Install the "Live Server" extension, right-click `index.html`,
  choose "Open with Live Server".

## Run it

1. Start one of the servers above.
2. Open `http://localhost:8000` in your browser.
3. Wait for the status dot (top right) to turn green — that means
   Pyodide finished downloading and initializing (a few seconds on
   first load, cached after that).
4. Type Python in the editor, click **Run** (or `Ctrl/Cmd+Enter`).

## Troubleshooting: "Open / Save / Search don't do anything"

This was a real bug in an earlier version: every button's event listener
was wired up inside one `async` function that started with
`await loadPyodide(...)`. If that call was slow, blocked, or failed —
CDN blocked by network/ad-blocker, offline, viewed inside a sandboxed
preview with no outbound network — the function returned early and
**no button on the page ever got wired up**, including Save/Open,
which don't need Python at all.

Fixed now: Save, Open, Clear, and general editing are wired up first,
synchronously, before any network call runs — they work regardless of
whether the interpreter loads. Run and the package search/install only
activate once the status dot turns green; clicking them before that
shows a clear "not ready" message instead of doing nothing silently.

If the status dot stays amber/red and never turns green:
- Open the browser dev console (F12) and check for a red error —
  it'll usually say it can't reach `cdn.jsdelivr.net`.
- Confirm you're loading the page over `http://` or `https://`
  (see the server setup above), not a `file://` path or a sandboxed
  in-app preview with no outbound network.
- Check for an ad blocker, corporate proxy, or browser extension that
  blocks `cdn.jsdelivr.net`.

## Features

- **Package manager (sidebar)** — search installs from two sources:
  - Packages Pyodide ships precompiled as WASM (numpy, pandas,
    matplotlib, scipy, scikit-learn, etc.) install instantly via
    `pyodide.loadPackage()`, tagged **wasm built-in** in results.
  - Anything else is checked against PyPI's JSON API
    (`pypi.org/pypi/<name>/json`) and, if it exists, installed as a
    pure-Python wheel via `micropip.install()`, tagged **pypi**.
    Packages with C extensions that Pyodide hasn't precompiled won't
    install this way — that's a Pyodide/WASM limitation, not this
    app's.
  - The "Installed" list below tracks what's been added this session.

- **Save / Open `.py` file** — top of the editor panel:
  - The filename field is editable; **Save** downloads the editor's
    contents as a `.py` file via a `Blob` + temporary download link
    (no server involved).
  - **Open** triggers a native file picker restricted to `.py` files;
    the selected file's text replaces the editor contents and the
    filename field updates to match.
  - This is a plain download/upload — it does not overwrite a file on
    disk in place. Re-uploading a saved file and re-downloading is the
    round trip.

- **Data file upload** (separate from the package manager and from
  Open) — files land in Pyodide's virtual filesystem, so
  `open("yourfile.csv")` in the user's Python code just works.

## Extending it further

- **matplotlib**: Pyodide ships it. To display a plot instead of
  saving to disk, render to a `<canvas>` or convert the figure to a
  base64 PNG and inject it as an `<img>` in the output panel.

- **Multiple files**: swap the single `<textarea>` for a small list
  of tabs, each backed by its own string in a JS object, and write
  each to `pyodide.FS` before running the entry file.

## Deploying

Since it's static files, you can host it anywhere: GitHub Pages,
Netlify, Vercel, an S3 bucket, or your own server — just serve the
three files (`index.html`, `style.css`, `app.js`) over HTTP/HTTPS.
