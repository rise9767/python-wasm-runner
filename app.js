// ---------- Grab elements ----------
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const runBtn = document.getElementById('run');
const clearBtn = document.getElementById('clear');
const codeEl = document.getElementById('code');
const outEl = document.getElementById('output');
const timingEl = document.getElementById('timing');
const uploadEl = document.getElementById('upload');
const filenameEl = document.getElementById('filename');
const openFileBtn = document.getElementById('openFile');
const openFileInput = document.getElementById('openFileInput');
const saveFileBtn = document.getElementById('saveFile');
const pkgSearchEl = document.getElementById('pkgSearch');
const pkgSearchBtn = document.getElementById('pkgSearchBtn');
const pkgResultsEl = document.getElementById('pkgResults');
const installedListEl = document.getElementById('installedList');
const installedCountEl = document.getElementById('installedCount');

let pyodide = null;          // stays null until the interpreter is ready
let micropip = null;
let builtinPackageNames = [];
const installedPackages = new Set();

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// =====================================================================
// SECTION 1 — UI that does NOT depend on Pyodide.
// Wired up immediately, synchronously, before any network call runs,
// so Save/Open/editing all work even if the interpreter is still
// loading or fails to load entirely.
// =====================================================================

saveFileBtn.addEventListener('click', () => {
  const name = filenameEl.value.trim() || 'main.py';
  const blob = new Blob([codeEl.value], { type: 'text/x-python' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.py') ? name : name + '.py';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

openFileBtn.addEventListener('click', () => openFileInput.click());

openFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  codeEl.value = text;
  filenameEl.value = file.name;
  openFileInput.value = ''; // allow re-selecting the same file later
});

clearBtn.addEventListener('click', () => {
  outEl.innerHTML = '<span class="empty">// nothing run yet</span>';
  timingEl.textContent = '';
});

codeEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!runBtn.disabled) runCode();
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = codeEl.selectionStart, end = codeEl.selectionEnd;
    codeEl.value = codeEl.value.slice(0, start) + '    ' + codeEl.value.slice(end);
    codeEl.selectionStart = codeEl.selectionEnd = start + 4;
  }
});

// =====================================================================
// SECTION 2 — Pyodide-dependent features (Run, Packages, data upload).
// These are only wired to do real work once loadPyodideRuntime()
// below has finished; until then they show a clear "not ready" state
// instead of silently doing nothing.
// =====================================================================

function renderInstalled() {
  installedCountEl.textContent = installedPackages.size ? `(${installedPackages.size})` : '';
  if (installedPackages.size === 0) {
    installedListEl.innerHTML = '<div class="pkg-empty">nothing installed yet</div>';
    return;
  }
  installedListEl.innerHTML = '';
  [...installedPackages].sort().forEach((name) => {
    const row = document.createElement('div');
    row.className = 'pkg-row installed-row';
    row.innerHTML = `<span class="pkg-name">${name}</span><span class="pkg-tag">installed</span>`;
    installedListEl.appendChild(row);
  });
}

async function installPackage(name, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  btn.className = 'pkg-add-btn installing';
  try {
    if (builtinPackageNames.includes(name)) {
      await pyodide.loadPackage(name);
    } else {
      await micropip.install(name);
    }
    installedPackages.add(name);
    btn.textContent = '✓ added';
    btn.className = 'pkg-add-btn';
    renderInstalled();
  } catch (err) {
    btn.textContent = 'failed';
    btn.className = 'pkg-add-btn failed';
    btn.disabled = false;
    console.error('Package install failed:', name, err);
  }
}

function renderResults(names, source) {
  if (names.length === 0) {
    pkgResultsEl.innerHTML = `<div class="pkg-empty">no match for "${source}" — try the exact PyPI project name</div>`;
    return;
  }
  pkgResultsEl.innerHTML = '';
  names.forEach((name) => {
    const isBuiltin = builtinPackageNames.includes(name);
    const row = document.createElement('div');
    row.className = 'pkg-row';
    const already = installedPackages.has(name);
    row.innerHTML = `
      <span class="pkg-name">${name}${isBuiltin ? '<span class="pkg-tag">wasm built-in</span>' : '<span class="pkg-tag">pypi</span>'}</span>
      <button class="pkg-add-btn" ${already ? 'disabled' : ''}>${already ? '✓ added' : 'Add'}</button>
    `;
    const btn = row.querySelector('button');
    if (!already) btn.addEventListener('click', () => installPackage(name, btn));
    pkgResultsEl.appendChild(row);
  });
}

async function searchPackages() {
  if (!pyodide) {
    pkgResultsEl.innerHTML = '<div class="pkg-empty">interpreter still starting up — try again in a moment</div>';
    return;
  }
  const q = pkgSearchEl.value.trim();
  if (!q) return;
  pkgResultsEl.innerHTML = '<div class="pkg-empty">searching…</div>';

  // 1) match against the built-in wasm package list (instant, no network)
  const builtinMatches = builtinPackageNames.filter((n) => n.includes(q.toLowerCase()));

  // 2) confirm the exact name exists on PyPI (covers pure-python installs).
  //    If this fetch is blocked (CORS/offline/sandboxed preview), fail
  //    quietly and just show whatever built-in matches we found.
  let pypiMatch = [];
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(q)}/json`);
    if (res.ok) pypiMatch = [q];
  } catch (e) {
    console.warn('PyPI lookup failed (this is non-fatal):', e);
  }

  const combined = [...new Set([...builtinMatches.slice(0, 12), ...pypiMatch])];
  renderResults(combined, q);
}

pkgSearchBtn.addEventListener('click', searchPackages);
pkgSearchEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); searchPackages(); }
});

function renderOutput(stdout, stderr, error) {
  let html = '';
  if (stdout) html += escapeHtml(stdout);
  if (stderr) html += `<span class="stderr">${escapeHtml(stderr)}</span>`;
  if (error) html += `<span class="stderr">${escapeHtml(error)}</span>`;
  if (!html) html = '<span class="empty">// ran with no output</span>';
  outEl.innerHTML = html;
}

let stdoutBuf = '';
let stderrBuf = '';

async function runCode() {
  if (!pyodide) {
    outEl.innerHTML = '<span class="stderr">Interpreter is not ready yet. Wait for the status dot to turn green.</span>';
    return;
  }
  const src = codeEl.value;
  stdoutBuf = '';
  stderrBuf = '';
  runBtn.disabled = true;
  statusDot.className = 'dot loading';
  statusText.textContent = 'running…';
  const t0 = performance.now();

  let errorMsg = '';
  try {
    await pyodide.runPythonAsync(src);
  } catch (err) {
    errorMsg = String(err);
  }

  const t1 = performance.now();
  timingEl.textContent = `${(t1 - t0).toFixed(0)} ms`;
  renderOutput(stdoutBuf, stderrBuf, errorMsg);

  statusDot.className = errorMsg ? 'dot error' : 'dot ready';
  statusText.textContent = errorMsg ? 'finished with error' : 'ready';
  runBtn.disabled = false;
}
runBtn.addEventListener('click', runCode);

uploadEl.addEventListener('change', async (e) => {
  if (!pyodide) {
    statusText.textContent = 'interpreter not ready yet — try again shortly';
    return;
  }
  for (const file of e.target.files) {
    const buf = await file.arrayBuffer();
    pyodide.FS.writeFile(file.name, new Uint8Array(buf));
  }
  statusText.textContent = `ready — ${e.target.files.length} file(s) loaded`;
});

// =====================================================================
// SECTION 3 — Boot the interpreter. Runs after listeners are attached,
// so a slow or failed load never blocks the rest of the UI.
// =====================================================================

async function loadPyodideRuntime() {
  statusDot.className = 'dot loading';
  statusText.textContent = 'booting interpreter…';

  try {
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/"
    });
  } catch (e) {
    console.error('Pyodide failed to load:', e);
    statusDot.className = 'dot error';
    statusText.textContent = 'interpreter failed to load';
    outEl.innerHTML = '<span class="stderr">Could not load the Python interpreter (Pyodide) from the CDN. ' +
      'This usually means the page can\'t reach cdn.jsdelivr.net — check your network, ' +
      'disable any ad/script blocker for this page, or make sure you\'re viewing it over http(s):// ' +
      'rather than a sandboxed preview, then reload. Save/Open still work without it.</span>';
    return; // Run/Packages stay disabled; everything else above still works.
  }

  pyodide.setStdout({ batched: (s) => { stdoutBuf += s + "\n"; } });
  pyodide.setStderr({ batched: (s) => { stderrBuf += s + "\n"; } });

  // Package list for "wasm built-in" search results — optional, so a
  // failure here doesn't block the interpreter from being usable.
  try {
    const lockRes = await fetch("https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide-lock.json");
    const lock = await lockRes.json();
    builtinPackageNames = Object.keys(lock.packages || {});
  } catch (e) {
    console.warn('Could not fetch built-in package list (non-fatal):', e);
  }

  // micropip lets us install pure-Python packages straight from PyPI —
  // also optional; Run still works fine without it.
  try {
    await pyodide.loadPackage("micropip");
    micropip = pyodide.pyimport("micropip");
  } catch (e) {
    console.warn('Could not load micropip (non-fatal — PyPI installs will be unavailable):', e);
  }

  statusDot.className = 'dot ready';
  statusText.textContent = 'ready';
  runBtn.disabled = false;
  renderInstalled();
}

loadPyodideRuntime();
