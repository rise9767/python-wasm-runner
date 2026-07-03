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

## Extending it

- **Install PyPI packages at runtime** (pure-Python wheels only):
  ```javascript
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install("package-name");
  ```
  Add this inside `app.js` before `runCode()`, e.g. triggered by a
  "Packages" button.

- **File upload** is already wired up (`upload.addEventListener`
  in `app.js`) — files land in Pyodide's virtual filesystem, so
  `open("yourfile.csv")` in the user's Python code just works.

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
