(async () => {
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

  statusDot.className = 'dot loading';

  let pyodide;
  let builtinPackageNames = [];   // packages precompiled for this Pyodide build
  const installedPackages = new Set();

  try {
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/"
    });
  } catch (e) {
    statusDot.className = 'dot error';
    statusText.textContent = 'failed to load interpreter';
    outEl.innerHTML = '<span class="stderr">Could not load Pyodide. Check your network/CDN access and reload.</span>';
    return;
  }

  // Pull the list of packages Pyodide ships prebuilt as WASM, so search
  // can tell "instant install" apart from "pure-python via PyPI".
  try {
    const lockRes = await fetch("https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide-lock.json");
    const lock = await lockRes.json();
    builtinPackageNames = Object.keys(lock.packages || {});
  } catch (e) {
    // non-fatal — search just falls back to "install from PyPI" for everything
  }

  let stdoutBuf = '';
  let stderrBuf = '';
  pyodide.setStdout({ batched: (s) => { stdoutBuf += s + "\n"; } });
  pyodide.setStderr({ batched: (s) => { stderrBuf += s + "\n"; } });

  // micropip lets us install pure-Python packages straight from PyPI
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");

  statusDot.className = 'dot ready';
  statusText.textContent = 'ready';
  runBtn.disabled = false;

  // ---------- Packages: search / install / list ----------

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
      console.error(err);
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
    const q = pkgSearchEl.value.trim();
    if (!q) return;
    pkgResultsEl.innerHTML = '<div class="pkg-empty">searching…</div>';

    // 1) match against the built-in wasm package list (instant, no network)
    const builtinMatches = builtinPackageNames.filter((n) => n.includes(q.toLowerCase()));

    // 2) confirm the exact name exists on PyPI (covers pure-python installs)
    let pypiMatch = [];
    try {
      const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(q)}/json`);
      if (res.ok) pypiMatch = [q];
    } catch (e) {
      // offline / blocked — silently skip the PyPI existence check
    }

    const combined = [...new Set([...builtinMatches.slice(0, 12), ...pypiMatch])];
    renderResults(combined, q);
  }

  pkgSearchBtn.addEventListener('click', searchPackages);
  pkgSearchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); searchPackages(); }
  });

  renderInstalled();

  // ---------- Save / open the .py file ----------

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

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderOutput(stdout, stderr, error) {
    let html = '';
    if (stdout) html += escapeHtml(stdout);
    if (stderr) html += `<span class="stderr">${escapeHtml(stderr)}</span>`;
    if (error) html += `<span class="stderr">${escapeHtml(error)}</span>`;
    if (!html) html = '<span class="empty">// ran with no output</span>';
    outEl.innerHTML = html;
  }

  async function runCode() {
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

  // Uploaded files land in Pyodide's in-memory filesystem so
  // Python's normal open("filename") calls can read them.
  uploadEl.addEventListener('change', async (e) => {
    for (const file of e.target.files) {
      const buf = await file.arrayBuffer();
      pyodide.FS.writeFile(file.name, new Uint8Array(buf));
    }
    statusText.textContent = `ready — ${e.target.files.length} file(s) loaded`;
  });

  runBtn.addEventListener('click', runCode);
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
})();
