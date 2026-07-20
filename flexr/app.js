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
  document.getElementById('swatchFlexr').classList.toggle('active', name === 'flexr');
  document.getElementById('swatchMono').classList.toggle('active', name === 'mono');
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
  toast(noDataMode ? 'No Data Mode on — LAN only, no STUN/relay used' : 'No Data Mode off — will use a STUN server to help pairing');
}

/* ============ Data usage counter (stays ~0 by design) ============ */
let bytesOverNetwork = 0; // only ever incremented by the one-time STUN handshake if noDataMode is off
function renderDataUsed() {
  const kb = (bytesOverNetwork / 1024).toFixed(1);
  document.getElementById('mobileDataUsed').textContent = kb + ' KB';
  document.getElementById('dataUsedProfile').textContent = kb + ' KB';
}
renderDataUsed();

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
  document.getElementById('fileList').innerHTML = `<div class="empty-state"><div class="icn">📭</div>${msg}</div>`;
}

async function pickFolder() {
  if (!window.showDirectoryPicker) {
    toast('This browser can\u2019t open folders directly — use "Add files" instead');
    return;
  }
  try {
    currentDirHandle = await window.showDirectoryPicker();
    await renderFileList();
  } catch (e) { /* user cancelled */ }
}

function fileIconFor(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','heic'].includes(ext)) return '🖼️';
  if (['mp4','mov','mkv','avi'].includes(ext)) return '🎬';
  if (['mp3','wav','m4a','flac'].includes(ext)) return '🎵';
  if (['apk'].includes(ext)) return '📱';
  if (['pdf'].includes(ext)) return '📄';
  if (['zip','rar','7z'].includes(ext)) return '🗜️';
  return '📦';
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
      <div class="file-del" onclick="deleteFile('${escapeAttr(r.name)}')">🗑</div>
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
  if (el.classList.contains('checked')) selectedFiles.set(name, row);
  else selectedFiles.delete(name);
}

async function deleteFile(name) {
  if (!confirm(`Delete "${name}"? This can\u2019t be undone.`)) return;
  try {
    await currentDirHandle.removeEntry(name);
    selectedFiles.delete(name);
    toast(`Deleted ${name}`);
    renderFileList();
  } catch (e) {
    toast('Couldn\u2019t delete — check folder permissions');
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
      <div class="file-chk checked"></div>
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
// so Nearby is an on-ramp to the QR pairing flow. The pings are ambient motion, not fake peers.

/* ============ WebRTC QR pairing (zero server, LAN-capable) ============ */
let pc = null;
let dataChannel = null;
let qrMode = 'show'; // 'show' (offerer/sender) | 'scan' (answerer/receiver)
let pairingRole = null; // 'offer' | 'answer'
let camStream = null;
let scanLoopId = null;

function iceServersFor() {
  // No Data Mode ON: no ICE servers at all — connection only succeeds if both devices
  // are reachable directly (same Wi-Fi/hotspot), guaranteeing zero external network use.
  // No Data Mode OFF: adds a public STUN server (a few hundred bytes, one-time) to help
  // pairing across trickier NATs.
  return noDataMode ? [] : [{ urls: 'stun:stun.l.google.com:19302' }];
}

function setQrMode(mode) {
  qrMode = mode;
  document.getElementById('tabShow').classList.toggle('active', mode === 'show');
  document.getElementById('tabScan').classList.toggle('active', mode === 'scan');
  document.getElementById('qrShowPane').style.display = mode === 'show' ? 'block' : 'none';
  document.getElementById('qrScanPane').style.display = mode === 'scan' ? 'block' : 'none';
  document.getElementById('qrTitle').textContent = mode === 'show' ? 'Your share code' : 'Scan to receive';
  stopScanLoop();
  if (mode === 'show') startOfferFlow();
  else startScanFlow();
}

async function startOfferFlow() {
  pairingRole = 'offer';
  teardownConnection(false);
  pc = new RTCPeerConnection({ iceServers: iceServersFor() });
  dataChannel = pc.createDataChannel('flexr');
  wireDataChannel();
  wirePeerConnection();

  pc.onicecandidate = null; // we wait for full gathering instead of trickling (keeps QR self-contained)
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  const payload = JSON.stringify({ t: 'offer', sdp: pc.localDescription });
  drawQR(payload);
}

async function startScanFlow() {
  pairingRole = 'answer';
  const video = document.getElementById('camVideo');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = camStream;
    startScanLoop();
  } catch (e) {
    document.getElementById('scanHint').textContent = 'Camera access denied — enable it in your browser settings.';
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
      if (code) { handleScannedPayload(code.data); return; }
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

async function handleScannedPayload(raw) {
  let data;
  try { data = JSON.parse(raw); } catch (e) { return; }
  stopScanLoop();

  if (data.t === 'offer' && pairingRole === 'answer') {
    teardownConnection(false);
    pc = new RTCPeerConnection({ iceServers: iceServersFor() });
    wirePeerConnection();
    pc.ondatachannel = (e) => { dataChannel = e.channel; wireDataChannel(); };
    await pc.setRemoteDescription(data.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);
    document.getElementById('scanHint').textContent = 'Scanned! Showing your reply code — have them scan it back.';
    setTimeout(() => {
      document.getElementById('qrShowPane').style.display = 'block';
      document.getElementById('qrScanPane').style.display = 'none';
      document.getElementById('qrTitle').textContent = 'Show this back to them';
      drawQR(JSON.stringify({ t: 'answer', sdp: pc.localDescription }));
    }, 400);
  } else if (data.t === 'answer' && pairingRole === 'offer') {
    await pc.setRemoteDescription(data.sdp);
    toast('Connecting…');
  }
}

function wirePeerConnection() {
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      toast('Devices paired — connection is direct, peer-to-peer');
      go('queue');
      flushQueueIfReady();
    } else if (['failed','disconnected','closed'].includes(pc.connectionState)) {
      // no-op, handled by cancel/teardown paths
    }
  };
}

function waitForIceGatheringComplete(peerConnection) {
  if (peerConnection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    function check() {
      if (peerConnection.iceGatheringState === 'complete') {
        peerConnection.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    }
    peerConnection.addEventListener('icegatheringstatechange', check);
  });
}

function drawQR(text) {
  const canvas = document.getElementById('qrcanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // qrcodejs draws into a div normally; use its low-level API via a temp element instead
  const tmp = document.createElement('div');
  new QRCode(tmp, { text, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.L });
  setTimeout(() => {
    const img = tmp.querySelector('img') || tmp.querySelector('canvas');
    if (img.tagName === 'IMG') {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, 220, 220);
      image.src = img.src;
    } else {
      ctx.drawImage(img, 0, 0, 220, 220);
    }
  }, 30);
}

function teardownConnection(notify=true) {
  if (dataChannel) { try{ dataChannel.close(); }catch(e){} dataChannel = null; }
  if (pc) { try{ pc.close(); }catch(e){} pc = null; }
  if (notify) toast('Connection closed');
}

/* ============ Data channel: chunked file transfer ============ */
const CHUNK_SIZE = 16 * 1024;
let queue = []; // {id, name, size, sent, status, cancel:false, direction:'up'|'down'}
let receivingMeta = null;
let receivingBuffer = [];
let receivingReceived = 0;

function wireDataChannel() {
  dataChannel.binaryType = 'arraybuffer';
  dataChannel.onopen = () => { toast('Data channel open — ready to transfer'); flushQueueIfReady(); };
  dataChannel.onclose = () => {};
  dataChannel.onmessage = (e) => handleIncoming(e.data);
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
    receivingBuffer.push(data);
    receivingReceived += data.byteLength;
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
        ${q.status==='sending'||q.status==='receiving' ? `<div class="q-cancel" onclick="cancelQueueItem('${q.id}')">✕</div>` : ''}
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
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify({ t: 'cancel', id }));
  }
  renderQueue();
  toast('Share cancelled');
}

async function flushQueueIfReady() {
  if (!dataChannel || dataChannel.readyState !== 'open') return;
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
  dataChannel.send(JSON.stringify({ t: 'meta', id, name: file.name, size: file.size }));

  let offset = 0;
  const item = queue.find(q => q.id === id);
  while (offset < file.size) {
    if (item.status === 'cancelled') return;
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buf = await slice.arrayBuffer();
    // simple backpressure
    while (dataChannel.bufferedAmount > 1_000_000) await new Promise(r => setTimeout(r, 30));
    dataChannel.send(buf);
    offset += buf.byteLength;
    updateQueueItem(id, { sent: offset });
  }
  dataChannel.send(JSON.stringify({ t: 'done', id }));
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
      <div class="activity-icn">${a.title.startsWith('Received') ? '📥' : '📤'}</div>
      <div class="activity-txt"><div class="t1">${escapeHtml(a.title)}</div><div class="t2">${a.time} · direct P2P</div></div>
      <div class="amt">${a.sizeLabel}</div>
    </div>
  `).join('');
}

/* ============ init ============ */
setQrMode('show');
renderQueue();
