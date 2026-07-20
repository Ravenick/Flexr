# Flexr (PWA)

A local, peer-to-peer share app. No accounts, no server-side storage, and no
cellular/internet data used for the actual transfer: files move directly
between two devices' browsers over WebRTC.

## What's real vs. simulated in this build

**Fully working:**
- New logo (transparent PNG), four accent themes (Aurora, Berry, Emerald,
  Mono), and a theme switcher on the Profile screen
- Editable profile name and avatar photo (saved locally on the device)
- Hovering bubble for Share / Receive shortcuts
- File browser via the **File System Access API** (Chrome/Edge desktop, Chrome
  on Android): open a folder once, then list, share, and **delete** files
  inside it
- Fallback "Add files" picker for browsers without that API (list/share only,
  since a plain `<input type=file>` can't delete from disk; that's a browser
  sandbox limit, not a Flexr limit)
- Pairing two ways: scan a QR code, or type in a 4 digit code. Both use a
  lightweight PeerJS signaling hop just to introduce the two devices; once
  connected, every file byte still flows directly over a peer-to-peer
  `RTCDataChannel`, never through that relay
- Chunked file transfer over that data channel, with a live smart queue
  (progress bars, per-item **Cancel**)
- **No Data Mode** toggle: ON strips all ICE servers, so the connection can
  *only* succeed over a shared Wi-Fi/hotspot. OFF adds one public STUN server
  for tougher NATs (a few hundred bytes, one-time, not the file data itself)

**Simulated for now (needs a native shell to be fully real):**
- The "Nearby" radar screen's sweep/pings are ambient motion, not live scanned
  peers. A sandboxed browser can't broadcast/listen on the LAN (mDNS, UDP
  broadcast) the way a native Android app can. QR/code pairing is the real
  mechanism today; a future native wrapper (Capacitor/Trusted Web Activity)
  could add real local broadcast discovery so the radar shows genuine nearby
  devices.
- "Apps" tile is a placeholder. Browsers have no permission model for reading
  a device's installed-app list at all; that would require the native wrapper
  too.

## Running it

Any static file server works. From this folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in Chrome. To test a real two-device
transfer, serve it over HTTPS (or `localhost`) on both a laptop and a phone,
e.g. via `ngrok http 8080` or by deploying to Vercel/Netlify/GitHub Pages (all
free, all give you HTTPS which the camera and File System Access API
require).

Install it as an app: open the site in Chrome, tap the browser menu, then "Add
to Home screen." It'll launch full-screen with the new icon.

## Turning this into the app you first asked about (native, deeper file/app access)

The PWA above is genuinely capable for sharing and for delete-within-a-granted
folder. If you later want the radar to show real nearby devices, or deeper
access to manage/uninstall apps, that needs a thin native wrapper (e.g.
Capacitor) around this same HTML/JS. Happy to help with that next if you want
to go there.
