/* ── CryptoLab — script.js ─────────────────── */

const API = '';   // same origin

// ── State ────────────────────────────────────
let messages = [];
let encryptionData = null;   // last /api/encrypt response
let selectedAlgo = 'AES';
let lastDecryptJson = '';    // pretty JSON for copy / download
let lastDecryptAlgo = 'AES';

// ── DOM refs ─────────────────────────────────
const msgList         = document.getElementById('messagesList');
const msgCount        = document.getElementById('msgCount');
const byteCount       = document.getElementById('byteCount');
const encryptBtn      = document.getElementById('encryptBtn');
const loadSampleBtn   = document.getElementById('loadSampleBtn');
const addMsgBtn       = document.getElementById('addMsgBtn');
const statusEl        = document.getElementById('serverStatus');

// results
const resultsPlaceholder = document.getElementById('resultsPlaceholder');
const resultsGrid        = document.getElementById('resultsGrid');

// metrics
const metricsPlaceholder = document.getElementById('metricsPlaceholder');
const metricsBody        = document.getElementById('metricsBody');

// decrypt
const decryptPlaceholder = document.getElementById('decryptPlaceholder');
const decryptBody        = document.getElementById('decryptBody');
const decryptBtn         = document.getElementById('decryptBtn');
const decryptResult      = document.getElementById('decryptResult');
const toggleAES          = document.getElementById('toggleAES');
const toggleDES          = document.getElementById('toggleDES');
const resultsGridEl      = document.getElementById('resultsGrid');
const decCopyJsonBtn     = document.getElementById('decCopyJson');
const decDlJsonBtn       = document.getElementById('decDlJson');

// ── Init ─────────────────────────────────────
(async function init() {
  try {
    const res = await fetch(`${API}/api/messages`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        setStatus('online', 'Connected');
        // Pre-populate with sample data
        loadMessages(data.messages);
        return;
      }
    }
    setStatus('', 'Server offline');
  } catch {
    setStatus('', 'Server offline');
  }
})();

resultsGridEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.io-btn');
  if (!btn || !encryptionData) return;
  const algo = btn.dataset.algo;
  const action = btn.dataset.action;
  const r = encryptionData.results[algo];
  if (!r) return;

  const prefix = algo === 'AES' ? 'ciphertext_aes' : 'ciphertext_des';

  if (action === 'copy-hex') {
    copyToClipboard(r.ciphertext_hex, 'Hex copied');
  } else if (action === 'copy-b64') {
    copyToClipboard(r.ciphertext_b64, 'Base64 copied');
  } else if (action === 'dl-hex') {
    downloadText(`${prefix}.hex.txt`, r.ciphertext_hex + '\n');
  } else if (action === 'dl-b64') {
    downloadText(`${prefix}.b64.txt`, r.ciphertext_b64 + '\n');
  } else if (action === 'dl-bin') {
    downloadBinary(`${prefix}.bin`, hexToBytes(r.ciphertext_hex));
  }
});

decCopyJsonBtn.addEventListener('click', () => {
  if (!lastDecryptJson) return;
  copyToClipboard(lastDecryptJson, 'JSON copied');
});

decDlJsonBtn.addEventListener('click', () => {
  if (!lastDecryptJson) return;
  const name = lastDecryptAlgo === 'AES' ? 'decrypted_aes.json' : 'decrypted_des.json';
  downloadText(name, lastDecryptJson);
});

function setStatus(cls, text) {
  statusEl.className = `header-status ${cls}`;
  statusEl.innerHTML = `<span class="dot"></span> ${text}`;
}

// ── Messages ──────────────────────────────────
function loadMessages(data) {
  messages = data.map(m => ({ ...m }));
  renderMessages();
}

function renderMessages() {
  msgList.innerHTML = '';
  messages.forEach((msg, i) => {
    const row = document.createElement('div');
    row.className = 'msg-item';
    row.innerHTML = `
      <input class="sender-input" placeholder="Sender" value="${esc(msg.sender)}"
             oninput="messages[${i}].sender=this.value; updateStats()" />
      <input placeholder="Message…" value="${esc(msg.message)}"
             oninput="messages[${i}].message=this.value; updateStats()" />
      <input class="ts-input" placeholder="Timestamp" value="${esc(msg.timestamp)}"
             oninput="messages[${i}].timestamp=this.value" />
      <button class="msg-remove" onclick="removeMessage(${i})" title="Remove">✕</button>
    `;
    msgList.appendChild(row);
  });
  updateStats();
}

function removeMessage(i) {
  messages.splice(i, 1);
  renderMessages();
}

window.removeMessage = removeMessage;

function updateStats() {
  const bytes = new TextEncoder().encode(JSON.stringify(messages)).length;
  msgCount.textContent = messages.length;
  byteCount.textContent = bytes;
}

addMsgBtn.addEventListener('click', () => {
  messages.push({
    sender: 'User',
    message: '',
    timestamp: new Date().toISOString()
  });
  renderMessages();
  // Focus the new message input
  setTimeout(() => {
    const inputs = msgList.querySelectorAll('.msg-item input:nth-child(2)');
    inputs[inputs.length - 1]?.focus();
  }, 50);
});

loadSampleBtn.addEventListener('click', async () => {
  loadSampleBtn.disabled = true;
  loadSampleBtn.textContent = 'Loading…';
  try {
    const res = await fetch(`${API}/api/messages`);
    const data = await res.json();
    if (data.success) {
      loadMessages(data.messages);
      toast('Sample messages loaded.', 'success');
    }
  } catch {
    toast('Could not reach server.', 'error');
  } finally {
    loadSampleBtn.disabled = false;
    loadSampleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Load Sample`;
  }
});

// ── Encrypt ───────────────────────────────────
encryptBtn.addEventListener('click', async () => {
  if (!messages.length) { toast('Add at least one message.', 'error'); return; }
  const anyEmpty = messages.some(m => !m.message.trim());
  if (anyEmpty) { toast('All messages need content.', 'error'); return; }

  setLoading(encryptBtn, true, 'Encrypting…');
  try {
    const res = await fetch(`${API}/api/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    encryptionData = data;
    lastDecryptJson = '';
    const rawDec = document.getElementById('decryptedRawOut');
    if (rawDec) rawDec.value = '';
    renderResults(data);
    renderMetrics(data);
    showDecryptPanel();
    let ok = 'Encryption successful ✓';
    if (data.output_saved && data.output_saved.length) {
      ok += ' · Saved to output/ folder';
    }
    if (data.data_input_saved) {
      ok += ` · Input saved to ${data.data_input_saved}`;
    } else if (data.data_input_cleared) {
      ok += ' · Matches sample — removed data/user_input.json';
    }
    toast(ok, 'success');

    // Smooth scroll to results
    setTimeout(() => {
      document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  } finally {
    setLoading(encryptBtn, false, null);
    encryptBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Encrypt &amp; Compare`;
  }
});

function renderResults(data) {
  const r = data.results;

  setText('aesCipherPreview', r.AES.ciphertext_preview);
  setText('aesKey',           r.AES.key_hex);
  setText('aesIV',            r.AES.iv_hex);
  setText('aesKeySize',       r.AES.key_size_bits + ' bits');
  setText('aesBlockSize',     r.AES.block_size_bytes + ' B');
  setText('aesCipherSize',    r.AES.ciphertext_size_bytes + ' B');
  setVal('aesCipherHexFull',  r.AES.ciphertext_hex);
  setVal('aesCipherB64Full', r.AES.ciphertext_b64);

  setText('desCipherPreview', r.DES.ciphertext_preview);
  setText('desKey',           r.DES.key_hex);
  setText('desIV',            r.DES.iv_hex);
  setText('desKeySize',       r.DES.key_size_bits + ' bits');
  setText('desBlockSize',     r.DES.block_size_bytes + ' B');
  setText('desCipherSize',    r.DES.ciphertext_size_bytes + ' B');
  setVal('desCipherHexFull',  r.DES.ciphertext_hex);
  setVal('desCipherB64Full', r.DES.ciphertext_b64);

  show(resultsGrid);
  hide(resultsPlaceholder);
}

function renderMetrics(data) {
  const r = data.results;

  setText('aesEncTime', r.AES.enc_time_ms + ' ms');
  setText('desEncTime', r.DES.enc_time_ms + ' ms');
  setText('aesDecTime', r.AES.dec_time_ms + ' ms');
  setText('desDecTime', r.DES.dec_time_ms + ' ms');

  // Bar charts
  const maxEnc = Math.max(r.AES.enc_time_ms, r.DES.enc_time_ms) || 1;
  renderBarChart('encTimeChart', [
    { label: 'AES', val: r.AES.enc_time_ms, display: r.AES.enc_time_ms + ' ms', pct: r.AES.enc_time_ms / maxEnc * 100, cls: 'aes-bar' },
    { label: 'DES', val: r.DES.enc_time_ms, display: r.DES.enc_time_ms + ' ms', pct: r.DES.enc_time_ms / maxEnc * 100, cls: 'des-bar' },
  ]);

  renderBarChart('keySizeChart', [
    { label: 'AES', display: '128 bits', pct: 100, cls: 'aes-bar' },
    { label: 'DES', display: '64 bits',  pct: 50,  cls: 'des-bar' },
  ]);

  renderBarChart('blockSizeChart', [
    { label: 'AES', display: '16 B', pct: 100, cls: 'aes-bar' },
    { label: 'DES', display: '8 B',  pct: 50,  cls: 'des-bar' },
  ]);

  const maxCipher = Math.max(r.AES.ciphertext_size_bytes, r.DES.ciphertext_size_bytes) || 1;
  renderBarChart('cipherSizeChart', [
    { label: 'AES', display: r.AES.ciphertext_size_bytes + ' B', pct: r.AES.ciphertext_size_bytes / maxCipher * 100, cls: 'aes-bar' },
    { label: 'DES', display: r.DES.ciphertext_size_bytes + ' B', pct: r.DES.ciphertext_size_bytes / maxCipher * 100, cls: 'des-bar' },
  ]);

  show(metricsBody);
  hide(metricsPlaceholder);
}

function renderBarChart(containerId, bars) {
  const el = document.getElementById(containerId);
  el.innerHTML = bars.map(b => `
    <div class="bar-row">
      <div class="bar-label">${b.label}</div>
      <div class="bar-track">
        <div class="bar-fill ${b.cls}" style="width:0%" data-pct="${b.pct}">
          ${b.display}
        </div>
      </div>
      <div class="bar-val">${b.display}</div>
    </div>
  `).join('');

  // Animate bars after paint
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.querySelectorAll('.bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.pct + '%';
    });
  }));
}

// ── Decrypt ───────────────────────────────────
function showDecryptPanel() {
  show(decryptBody);
  hide(decryptPlaceholder);
  hide(decryptResult);
}

toggleAES.addEventListener('click', () => selectAlgo('AES'));
toggleDES.addEventListener('click', () => selectAlgo('DES'));

function selectAlgo(algo) {
  selectedAlgo = algo;
  toggleAES.classList.toggle('active', algo === 'AES');
  toggleDES.classList.toggle('active', algo === 'DES');
}

decryptBtn.addEventListener('click', async () => {
  if (!encryptionData) return;
  const r = encryptionData.results[selectedAlgo];

  setLoading(decryptBtn, true, 'Decrypting…');
  try {
    const res = await fetch(`${API}/api/decrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext_hex: r.ciphertext_hex,
        key_hex: r.key_hex,
        iv_hex: r.iv_hex,
        algorithm: selectedAlgo
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    renderDecryptResult(data);
    let decOk = `${selectedAlgo} decryption verified ✓`;
    if (data.output_saved && data.output_saved.length) {
      decOk += ' · Saved to output/ folder';
    }
    toast(decOk, 'success');

    setTimeout(() => {
      document.getElementById('decrypt').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

  } catch (e) {
    toast(`Decrypt error: ${e.message}`, 'error');
  } finally {
    setLoading(decryptBtn, false, null);
    decryptBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg> Decrypt Selected`;
  }
});

function renderDecryptResult(data) {
  lastDecryptAlgo = data.algorithm || 'AES';
  document.getElementById('drAlgo').textContent = data.algorithm;
  document.getElementById('drTime').textContent = `Decrypted in ${data.dec_time_ms} ms`;

  lastDecryptJson = JSON.stringify(data.messages, null, 2);
  const rawEl = document.getElementById('decryptedRawOut');
  if (rawEl) rawEl.value = lastDecryptJson;

  const container = document.getElementById('decryptedMessages');
  container.innerHTML = data.messages.map(m => `
    <div class="dec-msg">
      <div class="dec-sender">${esc(m.sender)}</div>
      <div class="dec-text">${esc(m.message)}</div>
      <div class="dec-ts">${esc(m.timestamp)}</div>
    </div>
  `).join('');

  show(decryptResult);
}

// ── Helpers ───────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}
function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }
function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function setLoading(btn, loading, text) {
  btn.disabled = loading;
  if (text) btn.textContent = text;
  btn.classList.toggle('loading', loading);
}

// ── Toast ─────────────────────────────────────
let toastTimer;
function hexToBytes(hex) {
  const clean = String(hex).trim().replace(/\s+/g, '');
  if (clean.length % 2 !== 0) throw new Error('Invalid hex length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  downloadBlob(filename, blob);
}

function downloadBinary(filename, bytes) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg || 'Copied', 'success');
  } catch {
    toast('Copy failed — select text manually', 'error');
  }
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}
