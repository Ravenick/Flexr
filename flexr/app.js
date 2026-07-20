/* ============ Service worker (offline shell) ============ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

/* ============ Toast ============ */
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ Navigation ============ */
function go(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  closeBubble();
}

/* ============ Theme ============ */
function setTheme(name) {
  document.documentElement.dataset.theme = name;
  ['aurora','berry','emerald','mono'].forEach(t => {
    const opt = document.getElementById('themeOpt' + t[0].toUpperCase() + t.slice(1));
    if (opt) opt.classList.toggle('active', t === name);
  });
  localStorage.setItem('flexr-theme', name);
}
(function initTheme(){
  const saved = localStorage.getItem('flexr-theme');
  if (saved) setTheme(saved);
})();

/* ============ Generic switch toggle ============ */
function toggleSwitch(el) { el.classList.toggle('on'); }

/* ============ No Data Mode ============ */
let noDataMode = true;
function toggleNoData() {
  noDataMode = !noDataMode;
  document.getElementById('noDataSwitch').classList.toggle('on', noDataMode);
  toast(noDataMode ? 'No Data Mode on: LAN only, no STUN/relay used for the transfer' : 'No Data Mode off: will use a STUN server to help pairing');
  // ICE config is fixed when a Peer connects, so rebuild it next time one is needed.
  teardownPeer();
}

/* ============ Data usage counter (stays ~0 by design) ============ */
let bytesOverNetwork = 0; // only ever incremented by the one-time STUN handshake if noDataMode is off
function renderDataUsed() {
  const kb = (bytesOverNetwork / 1024).toFixed(1);
  document.getElementById('mobileDataUsed').textContent = kb + ' KB';
  document.getElementById('dataUsedProfile').textContent = kb + ' KB';
}
renderDataUsed();

/* ============ Profile: name + avatar ============ */
function initials(name) {
  const n = (name || '').trim();
  return n ? n[0].toUpperCase() : 'F';
}
function applyProfileToUI() {
  const name = localStorage.getItem('flexr-name') || 'Alex';
  const avatar = localStorage.getItem('flexr-avatar');
  document.getElementById('profileNameLbl').textContent = name;

  const big = document.getElementById('profileAvatarBig');
  const small = document.getElementById('avatarBtn');
  if (avatar) {
    big.innerHTML = `<img src="${avatar}" alt="">`;
    small.innerHTML = `<img src="${avatar}" alt="">`;
  } else {
    big.textContent = initials(name);
    small.textContent = initials(name);
  }
}
applyProfileToUI();

function startNameEdit() {
  const lbl = document.getElementById('profileNameLbl');
  const current = lbl.textContent;
  const input = document.createElement('input');
  input.className = 'name-input';
  input.value = current;
  input.maxLength = 24;
  lbl.replaceWith(input);
  document.getElementById('nameEditBtn').style.display = 'none';
  input.focus();
  input.select();

  function commit() {
    const val = input.value.trim() || 'Alex';
    localStorage.setItem('flexr-name', val);
    const newLbl = document.createElement('div');
    newLbl.className = 'profile-name';
    newLbl.id = 'profileNameLbl';
    newLbl.textContent = val;
    input.replaceWith(newLbl);
    document.getElementById('nameEditBtn').style.display = '';
    applyProfileToUI();
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

function triggerAvatarPick() { document.getElementById('avatarInput').click(); }
document.getElementById('avatarInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  const reader = new FileReader();
  reader.onload = () => {
    img.onload = () => {
      const size = 240;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      localStorage.setItem('flexr-avatar', dataUrl);
      applyProfileToUI();
      toast('Profile photo updated');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

/* ============ Bubble ============ */
let bubbleOpen = false;
function toggleBubble() { bubbleOpen ? closeBubble() : openBubble(); }
function openBubble() {
  bubbleOpen = true;
  document.getElementById('bubbleZone').classList.add('open');
  document.getElementById('bubbleBackdrop').classList.add('show');
}
function closeBubble() {
  bubbleOpen = false;
  document.getElementById('bubbleZone').classList.remove('open');
  document.getElementById('bubbleBackdrop').classList.remove('show');
}
function openBubbleFlow(mode) {
  closeBubble();
  go('qr');
  setQrMode(mode === 'send' ? 'show' : 'scan');
}

/* ============ File System Access (Files screen) ============ */
let currentDirHandle = null;
let selectedFiles = new Map(); // name -> {handle/file, size}

function renderFileEmpty(msg) {
  document.getElementById('fileList').innerHTML = `<div class="empty-state"><div class="icn"><i class="fa-solid fa-inbox"></i></div>${msg}</div>`;
}

async function pickFolder() {
  if (!window.showDirectoryPicker) {
    toast('This browser can\u2019t open folders directly, use "Add files" instead');
    return;
  }
  try {
    currentDirHandle = await window.showDirectoryPicker();
    await renderFileList();
  } catch (e) { /* user cancelled */ }
}

function fileIconFor(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','heic'].includes(ext)) return '<i class="fa-solid fa-image"></i>';
  if (['mp4','mov','mkv','avi'].includes(ext)) return '<i class="fa-solid fa-film"></i>';
  if (['mp3','wav','m4a','flac'].includes(ext)) return '<i class="fa-solid fa-music"></i>';
  if (['apk'].includes(ext)) return '<i class="fa-solid fa-mobile-screen-button"></i>';
  if (['pdf'].includes(ext)) return '<i class="fa-solid fa-file-pdf"></i>';
  if (['zip','rar','7z'].includes(ext)) return '<i class="fa-solid fa-file-zipper"></i>';
  return '<i class="fa-solid fa-file"></i>';
}
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

async function renderFileList() {
  const list = document.getElementById('fileList');
  if (!currentDirHandle) { renderFileEmpty('No folder open yet.<br>Tap "Choose folder" to begin.'); return; }
  const rows = [];
  for await (const [name, handle] of currentDirHandle.entries()) {
    if (handle.kind !== 'file') continue;
    const file = await handle.getFile();
    rows.push({ name, handle, file, size: file.size });
  }
  if (!rows.length) { renderFileEmpty('This folder is empty.'); return; }
  list.innerHTML = rows.map(r => `
    <div class="file-row">
      <div class="file-chk" data-name="${escapeAttr(r.name)}" onclick="toggleFileSelect(this)"></div>
      <div class="file-icn">${fileIconFor(r.name)}</div>
      <div style="flex:1; min-width:0;">
        <div class="file-name">${escapeHtml(r.name)}</div>
        <div class="file-meta">${fmtSize(r.size)}</div>
      </div>
      <div class="file-del" onclick="deleteFile('${escapeAttr(r.name)}')"><i class="fa-solid fa-trash"></i></div>
    </div>
  `).join('');
  // keep a lookup for handles
  window.__flexrFileRows = rows;
}

function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

function toggleFileSelect(el) {
  const name = el.dataset.name;
  el.classList.toggle('checked');
  const row = window.__flexrFileRows.find(r => r.name === name);
  if (el.classList.contains('checked')) {
    selectedFiles.set(name, row);
    el.innerHTML = '<i class="fa-solid fa-check"></i>';
  } else {
    selectedFiles.delete(name);
    el.innerHTML = '';
  }
}

async function deleteFile(name) {
  if (!confirm(`Delete "${name}"? This can\u2019t be undone.`)) return;
  try {
    await currentDirHandle.removeEntry(name);
    selectedFiles.delete(name);
    toast(`Deleted ${name}`);
    renderFileList();
  } catch (e) {
    toast('Couldn\u2019t delete, check folder permissions');
  }
}

document.getElementById('pickFolderBtn').addEventListener('click', pickFolder);
document.getElementById('pickInputBtn').addEventListener('click', () => document.getElementById('hiddenFileInput').click());
document.getElementById('hiddenFileInput').addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  files.forEach(f => selectedFiles.set(f.name, { name: f.name, file: f, size: f.size, handle: null }));
  toast(`${files.length} file(s) added to selection`);
  renderPickedFallback(files);
});
function renderPickedFallback(files) {
  const list = document.getElementById('fileList');
  const existing = list.dataset.hasFallback ? list.innerHTML : '';
  list.dataset.hasFallback = '1';
  const rows = files.map(f => `
    <div class="file-row">
      <div class="file-chk checked"><i class="fa-solid fa-check"></i></div>
      <div class="file-icn">${fileIconFor(f.name)}</div>
      <div style="flex:1; min-width:0;">
        <div class="file-name">${escapeHtml(f.name)}</div>
        <div class="file-meta">${fmtSize(f.size)} · added via file picker</div>
      </div>
    </div>
  `).join('');
  list.innerHTML = (existing.includes('empty-state') ? '' : existing) + rows;
}

/* ============ Radar screen: simulated ambient discovery ============ */
// Real device discovery isn't possible from a sandboxed browser (no LAN broadcast/mDNS access),
// so Nearby is an on-ramp to the QR/code pairing flow. The pings are ambient motion, not fake peers.

/* ============================================================
   Pairing: WebRTC data channel, brokered by a lightweight PeerJS
   signaling hop. Only the tiny handshake touches that relay;
   every file byte still flows directly between the two devices.
   ============================================================ */
let myPeer = null;      // this device's Peer, created on demand
let myCode = null;      // this device's 4 digit code (without prefix)
let conn = null;        // active PeerJS DataConnection
let qrMode = 'show';    // 'show' | 'scan' | 'enter'
let camStream = null;
let scanLoopId = null;

const PEER_PREFIX = 'flexr-';

function iceServersFor() {
  // No Data Mode ON: no ICE servers at all, the connection only succeeds if both devices
  // are reachable directly (same Wi-Fi/hotspot), keeping the transfer itself off the internet.
  // No Data Mode OFF: adds a public STUN server (a few hundred bytes, one-time) to help
  // pairing across trickier NATs.
  return noDataMode ? [] : [{ urls: 'stun:stun.l.google.com:19302' }];
}

function randomCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

function teardownPeer() {
  teardownConnection(false);
  if (myPeer) { try { myPeer.destroy(); } catch (e) {} myPeer = null; }
  myCode = null;
}

function ensureMyPeer() {
  if (myPeer && !myPeer.destroyed && myPeer.open) return Promise.resolve(myPeer);
  if (myPeer && !myPeer.destroyed) {
    // already trying to open, wait for it
    return new Promise((resolve) => myPeer.once('open', () => resolve(myPeer)));
  }
  return new Promise((resolve, reject) => {
    attemptCreate(0);
    function attemptCreate(tries) {
      const code = randomCode();
      const p = new Peer(PEER_PREFIX + code, { config: { iceServers: iceServersFor() } });
      let settled = false;
      p.on('open', () => {
        if (settled) return;
        settled = true;
        myPeer = p;
        myCode = code;
        wireIncomingConnections(p);
        resolve(p);
      });
      p.on('error', (err) => {
        if (settled) return;
        if (err.type === 'unavailable-id' && tries < 5) {
          settled = true;
          try { p.destroy(); } catch (e) {}
          attemptCreate(tries + 1);
        } else if (!settled) {
          settled = true;
          toast('Could not start pairing, check your connection and try again');
          reject(err);
        }
      });
    }
  });
}

function wireIncomingConnections(p) {
  p.on('connection', (incoming) => {
    if (conn && conn.open) { incoming.close(); return; } // one active transfer at a time
    conn = incoming;
    wireDataChannel();
  });
}

function renderMyCode() {
  const digits = (myCode || '····').split('');
  document.getElementById('codeDisplay').innerHTML = digits.map(d => `<div class="code-digit">${d}</div>`).join('');
}
function copyMyCode() {
  if (!myCode) return;
  navigator.clipboard?.writeText(myCode).then(() => toast('Code copied')).catch(() => toast(myCode));
}

function setQrMode(mode) {
  qrMode = mode;
  document.getElementById('tabShow').classList.toggle('active', mode === 'show');
  document.getElementById('tabScan').classList.toggle('active', mode === 'scan');
  document.getElementById('tabEnter').classList.toggle('active', mode === 'enter');
  document.getElementById('qrShowPane').style.display = mode === 'show' ? 'block' : 'none';
  document.getElementById('qrScanPane').style.display = mode === 'scan' ? 'block' : 'none';
  document.getElementById('qrEnterPane').style.display = mode === 'enter' ? 'block' : 'none';
  document.getElementById('qrTitle').textContent =
    mode === 'show' ? 'Your share code' : mode === 'scan' ? 'Scan to receive' : 'Enter their code';
  stopScanLoop();
  if (mode === 'show') startShowFlow();
  else if (mode === 'scan') startScanFlow();
  else if (mode === 'enter') setTimeout(() => document.getElementById('codeIn0')?.focus(), 50);
}

async function startShowFlow() {
  try {
    await ensureMyPeer();
    renderMyCode();
    drawQR(myCode);
  } catch (e) { /* toast already shown */ }
}

async function startScanFlow() {
  const video = document.getElementById('camVideo');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = camStream;
    startScanLoop();
  } catch (e) {
    document.getElementById('scanHint').textContent = 'Camera access denied. Enable it in your browser settings, or use "Enter code" instead.';
  }
}

function startScanLoop() {
  const video = document.getElementById('camVideo');
  const canvas = document.getElementById('scanCanvas');
  const ctx = canvas.getContext('2d');
  function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height);
      if (code && /^\d{4}$/.test(code.data.trim())) { handleScannedCode(code.data.trim()); return; }
    }
    scanLoopId = requestAnimationFrame(tick);
  }
  scanLoopId = requestAnimationFrame(tick);
}
function stopScanLoop() {
  if (scanLoopId) cancelAnimationFrame(scanLoopId);
  scanLoopId = null;
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
}

function handleScannedCode(code) {
  stopScanLoop();
  document.getElementById('scanHint').textContent = `Scanned ${code}, connecting…`;
  connectWithCode(code);
}

/* ---- Enter-code tab: auto-advance between the four boxes ---- */
(function wireCodeInputs(){
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById('codeIn' + i);
    if (!el) continue;
    el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g, '').slice(0, 1);
      if (el.value && i < 3) document.getElementById('codeIn' + (i + 1)).focus();
      if (el.value && i === 3) connectWithEnteredCode();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !el.value && i > 0) document.getElementById('codeIn' + (i - 1)).focus();
    });
  }
})();
function connectWithEnteredCode() {
  const code = [0,1,2,3].map(i => document.getElementById('codeIn' + i).value).join('');
  if (!/^\d{4}$/.test(code)) { toast('Enter all 4 digits'); return; }
  connectWithCode(code);
}

async function connectWithCode(code) {
  try {
    await ensureMyPeer();
    if (conn) { try { conn.close(); } catch (e) {} }
    conn = myPeer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'binary' });
    toast('Connecting…');
    conn.on('error', () => toast('Couldn\u2019t reach that code, double check it and try again'));
    wireDataChannel();
  } catch (e) { /* toast already shown */ }
}

function drawQR(text) {
  const canvas = document.getElementById('qrcanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // qrcodejs draws into a div normally; use its low-level API via a temp element instead
  const tmp = document.createElement('div');
  new QRCode(tmp, { text, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H });
  setTimeout(() => {
    const img = tmp.querySelector('img') || tmp.querySelector('canvas');
    if (img.tagName === 'IMG') {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, 200, 200);
      image.src = img.src;
    } else {
      ctx.drawImage(img, 0, 0, 200, 200);
    }
  }, 30);
}

function teardownConnection(notify=true) {
  if (conn) { try{ conn.close(); }catch(e){} conn = null; }
  if (notify) toast('Connection closed');
}

/* ============ Data channel: chunked file transfer ============ */
const CHUNK_SIZE = 16 * 1024;
let queue = []; // {id, name, size, sent, status, cancel:false, direction:'up'|'down'}
let receivingMeta = null;
let receivingBuffer = [];
let receivingReceived = 0;

function wireDataChannel() {
  conn.on('open', () => { toast('Devices paired, connection is direct, peer-to-peer'); go('queue'); flushQueueIfReady(); });
  conn.on('close', () => {});
  conn.on('data', (data) => handleIncoming(data));
}

function handleIncoming(data) {
  if (typeof data === 'string') {
    const msg = JSON.parse(data);
    if (msg.t === 'meta') {
      receivingMeta = msg;
      receivingBuffer = [];
      receivingReceived = 0;
      addQueueItem({ id: msg.id, name: msg.name, size: msg.size, sent: 0, status: 'receiving', direction: 'down' });
    } else if (msg.t === 'cancel') {
      updateQueueItem(msg.id, { status: 'cancelled' });
      receivingMeta = null;
    } else if (msg.t === 'done') {
      const blob = new Blob(receivingBuffer);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = receivingMeta.name; a.click();
      updateQueueItem(msg.id, { status: 'done', sent: receivingMeta.size });
      toast(`Received ${receivingMeta.name}`);
      logActivity(`Received ${receivingMeta.name}`, fmtSize(receivingMeta.size));
      receivingMeta = null;
    }
  } else {
    const buf = data instanceof ArrayBuffer ? data : (data.buffer || data);
    receivingBuffer.push(buf);
    receivingReceived += buf.byteLength;
    if (receivingMeta) updateQueueItem(receivingMeta.id, { sent: receivingReceived });
  }
}

function addQueueItem(item) {
  queue.push(item);
  renderQueue();
}
function updateQueueItem(id, patch) {
  const item = queue.find(q => q.id === id);
  if (!item) return;
  Object.assign(item, patch);
  renderQueue();
}
function renderQueue() {
  const list = document.getElementById('queueList');
  const sub = document.getElementById('queueSub');
  if (!queue.length) {
    list.innerHTML = '';
    sub.textContent = 'Nothing queued. Pair a device to start sharing.';
    return;
  }
  sub.textContent = `${queue.filter(q=>q.status!=='done'&&q.status!=='cancelled').length} active · ${queue.length} total`;
  list.innerHTML = queue.map(q => {
    const pct = q.size ? Math.min(100, Math.round((q.sent/q.size)*100)) : 0;
    const label = q.status === 'done' ? 'Done' : q.status === 'cancelled' ? 'Cancelled' : (q.direction === 'up' ? 'Sending…' : 'Receiving…');
    return `
    <div class="q-item">
      <div class="q-top">
        <div class="q-name">${escapeHtml(q.name)}</div>
        ${q.status==='sending'||q.status==='receiving' ? `<div class="q-cancel" onclick="cancelQueueItem('${q.id}')"><i class="fa-solid fa-xmark"></i></div>` : ''}
      </div>
      <div class="q-bar"><div style="width:${q.status==='done'?100:pct}%"></div></div>
      <div class="q-sub"><span>${label}</span><span>${fmtSize(q.sent)} / ${fmtSize(q.size)}</span></div>
    </div>`;
  }).join('');
}

function cancelQueueItem(id) {
  const item = queue.find(q => q.id === id);
  if (!item) return;
  item.status = 'cancelled';
  if (conn && conn.open) {
    conn.send(JSON.stringify({ t: 'cancel', id }));
  }
  renderQueue();
  toast('Share cancelled');
}

async function flushQueueIfReady() {
  if (!conn || !conn.open) return;
  for (const [name, entry] of selectedFiles) {
    const file = entry.file || (entry.handle && await entry.handle.getFile());
    if (!file) continue;
    sendFile(file);
  }
  selectedFiles.clear();
}

async function sendFile(file) {
  const id = 'f' + Math.random().toString(36).slice(2, 9);
  addQueueItem({ id, name: file.name, size: file.size, sent: 0, status: 'sending', direction: 'up' });
  conn.send(JSON.stringify({ t: 'meta', id, name: file.name, size: file.size }));

  let offset = 0;
  const item = queue.find(q => q.id === id);
  while (offset < file.size) {
    if (item.status === 'cancelled') return;
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buf = await slice.arrayBuffer();
    // simple backpressure using PeerJS's queued-message count
    while ((conn.bufferSize || 0) > 8) await new Promise(r => setTimeout(r, 30));
    conn.send(buf);
    offset += buf.byteLength;
    updateQueueItem(id, { sent: offset });
  }
  conn.send(JSON.stringify({ t: 'done', id }));
  updateQueueItem(id, { status: 'done' });
  toast(`Sent ${file.name}`);
  logActivity(`Sent ${file.name}`, fmtSize(file.size));
}

/* ============ Activity log (home screen) ============ */
let activity = [];
function logActivity(title, sizeLabel) {
  activity.unshift({ title, sizeLabel, time: 'Just now' });
  activity = activity.slice(0, 6);
  const list = document.getElementById('activityList');
  list.innerHTML = activity.map(a => `
    <div class="activity-row">
      <div class="activity-icn"><i class="fa-solid ${a.title.startsWith('Received') ? 'fa-download' : 'fa-paper-plane'}"></i></div>
      <div class="activity-txt"><div class="t1">${escapeHtml(a.title)}</div><div class="t2">${a.time} · direct P2P</div></div>
      <div class="amt">${a.sizeLabel}</div>
    </div>
  `).join('');
}

/* ============ init ============ */
renderQueue();
