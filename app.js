(async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const runBtn = document.getElementById('run');
  const clearBtn = document.getElementById('clear');
  const codeEl = document.getElementById('code');
  const outEl = document.getElementById('output');
  const timingEl = document.getElementById('timing');
  const uploadEl = document.getElementById('upload');

  statusDot.className = 'dot loading';

  let pyodide;
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

  let stdoutBuf = '';
  let stderrBuf = '';
  pyodide.setStdout({ batched: (s) => { stdoutBuf += s + "\n"; } });
  pyodide.setStderr({ batched: (s) => { stderrBuf += s + "\n"; } });

  statusDot.className = 'dot ready';
  statusText.textContent = 'ready';
  runBtn.disabled = false;

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
