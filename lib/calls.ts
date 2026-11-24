"use client";

// 📞 Audio calls (2026-11-24): the voice goes straight between the two browsers /
// phones (WebRTC); Firestore calls/{id} only carries "who calls whom" + the
// connection notes. Server: callStart / callIce (functions), firestore.rules.

import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

export type CallStatus = "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended" | "busy";
export type CallView = {
  id: string;
  role: "caller" | "callee";
  peer: string; // the friend's username
  status: CallStatus | "connecting" | "starting";
  acceptedAtMs: number;
  muted: boolean;
  speaker: boolean;
  error: string;
  /** false when the server sent no TURN relay (Cloudflare keys missing): calls on mobile data may not connect */
  relay?: boolean;
  /** 🛰 this browser reached the relay ("ok"), could not ("fail"), or is still trying */
  relayCheck?: "ok" | "fail";
};

type Listener = (v: CallView | null) => void;
const listeners = new Set<Listener>();
let view: CallView | null = null;
function emit(next: CallView | null) {
  view = next;
  listeners.forEach((l) => l(view));
}
export function onCallView(l: Listener) {
  listeners.add(l);
  l(view);
  return () => listeners.delete(l);
}
const patch = (p: Partial<CallView>) => view && emit({ ...view, ...p });
// (a function, so TypeScript does not assume the call view never changes while awaiting)
const currentView = (): CallView | null => view;

let pc: RTCPeerConnection | null = null;
let local: MediaStream | null = null;
let audioEl: HTMLAudioElement | null = null;
let unsubs: (() => void)[] = [];
let myUid = "";
let ringTimer = 0;
let endTimer = 0;
let beatTimer = 0;
let connectTimer = 0;

const FINAL: string[] = ["declined", "cancelled", "missed", "ended", "busy"];

async function iceServers(given?: RTCIceServer[]): Promise<RTCIceServer[]> {
  let list: RTCIceServer[] = given && given.length ? given : [];
  if (!list.length) {
    try {
      const r = await httpsCallable<unknown, { iceServers: RTCIceServer[] }>(functions, "callIce")({});
      list = r.data.iceServers || [];
    } catch {
      list = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
    }
  }
  // 🛰 is there a TURN relay? (without it many mobile networks can't connect)
  const relay = list.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/.test(String(u))));
  patch({ relay });
  return list;
}

async function micStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't make calls.");
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch {
    throw new Error("Please allow the microphone to make calls.");
  }
}

function makePeer(servers: RTCIceServer[], callId: string, onCandidateReady: (c: RTCIceCandidate) => void) {
  const p = new RTCPeerConnection({ iceServers: servers });
  local?.getTracks().forEach((t) => p.addTrack(t, local!));
  let gotRelay = false;
  p.onicecandidate = (e) => {
    if (e.candidate) {
      if (e.candidate.type === "relay" && !gotRelay) {
        gotRelay = true;
        patch({ relayCheck: "ok" });
      }
      onCandidateReady(e.candidate);
    } else if (!gotRelay) patch({ relayCheck: "fail" }); // gathering finished without a relay address
  };
  p.ontrack = (e) => {
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "");
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
    }
    // 🔊 the friend's voice (a stream without an id gets its own stream, so it still plays)
    audioEl.muted = false;
    audioEl.volume = 1;
    audioEl.srcObject = e.streams[0] || new MediaStream([e.track]);
    const el = audioEl;
    void el.play().catch(() => {
      // the browser wants a tap first: play on the next tap anywhere
      const go = () => void el.play().catch(() => {});
      window.addEventListener("pointerdown", go, { once: true });
    });
  };
  p.onconnectionstatechange = () => {
    if (!view || view.id !== callId) return;
    if (p.connectionState === "connected") patch({ status: "accepted", error: "" });
    if (p.connectionState === "failed") {
      patch({ error: "The call could not connect." });
      void hangUp();
    }
  };
  return p;
}

function writeIce(callId: string, c: RTCIceCandidate) {
  const j = c.toJSON();
  if (!j.candidate) return;
  void addDoc(collection(db, "calls", callId, "ice"), {
    from: myUid,
    c: { candidate: j.candidate, sdpMid: j.sdpMid ?? null, sdpMLineIndex: j.sdpMLineIndex ?? null },
    at: serverTimestamp(),
  }).catch(() => {});
}

function listenIce(callId: string, fromUid: string) {
  const seen = new Set<string>();
  unsubs.push(
    onSnapshot(query(collection(db, "calls", callId, "ice"), where("from", "==", fromUid)), (s) => {
      s.docChanges().forEach((ch) => {
        if (ch.type !== "added" || seen.has(ch.doc.id)) return;
        seen.add(ch.doc.id);
        const c = ch.doc.get("c");
        if (c?.candidate && pc) void pc.addIceCandidate(c).catch(() => {});
      });
    })
  );
}

function cleanup(final?: CallStatus, keepMsMs = 1800) {
  window.clearTimeout(ringTimer);
  window.clearInterval(beatTimer);
  window.clearTimeout(connectTimer);
  beatTimer = 0;
  connectTimer = 0;
  stopTone();
  unsubs.forEach((u) => u());
  unsubs = [];
  try {
    pc?.close();
  } catch {
    /* already closed */
  }
  pc = null;
  local?.getTracks().forEach((t) => t.stop());
  local = null;
  if (audioEl) {
    audioEl.srcObject = null;
    audioEl.remove();
    audioEl = null;
  }
  if (final && view) {
    patch({ status: final });
    window.clearTimeout(endTimer);
    endTimer = window.setTimeout(() => emit(null), keepMsMs);
  } else emit(null);
}

function watchCall(callId: string, peerUid: string) {
  unsubs.push(
    onSnapshot(doc(db, "calls", callId), async (s) => {
      if (!s.exists() || !view || view.id !== callId) return;
      const st = String(s.get("status") || "") as CallStatus;
      if (FINAL.includes(st)) return cleanup(st);
      if (st === "accepted") {
        stopTone();
        window.clearTimeout(ringTimer);
        const acc = s.get("acceptedAt")?.toMillis?.() || Date.now();
        if (view.role === "caller" && pc && !pc.currentRemoteDescription) {
          const ans = s.get("answer");
          if (ans?.sdp) {
            await pc.setRemoteDescription(ans).catch(() => {});
            listenIce(callId, peerUid);
          }
        }
        patch({ acceptedAtMs: acc, status: pc?.connectionState === "connected" ? "accepted" : "connecting" });
        // 💓 "I'm still on the call" every 20 s (the server ends a call nobody is on any more)
        if (!beatTimer) {
          const field = view.role === "caller" ? "beatCaller" : "beatCallee";
          const ref = doc(db, "calls", callId);
          const beat = () => void updateDoc(ref, { [field]: serverTimestamp() }).catch(() => {});
          beat();
          beatTimer = window.setInterval(beat, 20000);
        }
        // ⏳ picked up but the voice can't get through in 25 s → say so and hang up
        if (!connectTimer && pc?.connectionState !== "connected") {
          connectTimer = window.setTimeout(() => {
            if (view?.id === callId && view.status === "connecting") {
              patch({ error: "Couldn't connect. Check the internet (try Wi-Fi) and call again." });
              void hangUp();
            }
          }, 25000);
        }
      }
    })
  );
}

/** 📞 call a friend (from the private chat). */
export async function startCall(me: { uid: string; username: string }, friend: string) {
  if (view) return;
  myUid = me.uid;
  emit({ id: "", role: "caller", peer: friend, status: "starting", acceptedAtMs: 0, muted: false, speaker: false, error: "" });
  try {
    local = await micStream();
    const servers = await iceServers();
    const pending: RTCIceCandidate[] = [];
    let callId = "";
    pc = makePeer(servers, "", (c) => (callId ? writeIce(callId, c) : pending.push(c)));
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    const r = await httpsCallable<unknown, { callId: string; busy?: boolean; iceServers?: RTCIceServer[] }>(functions, "callStart")({
      to: friend,
      offer: { type: "offer", sdp: offer.sdp },
    });
    callId = r.data.callId;
    // hung up while the call was being made → take the ring back at once
    const now = currentView();
    if (!now || now.role !== "caller" || now.status !== "starting" || !pc) {
      if (!r.data.busy) await updateDoc(doc(db, "calls", callId), { status: "cancelled" }).catch(() => {});
      return;
    }
    if (r.data.busy) {
      patch({ id: callId, error: `${friend} is on another call.` });
      return cleanup("busy", 2600);
    }
    // the connection state handler needs the id
    const p = pc;
    p.onconnectionstatechange = () => {
      if (!view || view.id !== callId) return;
      if (p.connectionState === "connected") patch({ status: "accepted", error: "" });
      if (p.connectionState === "failed") {
        patch({ error: "The call could not connect." });
        void hangUp();
      }
    };
    patch({ id: callId, status: "ringing" });
    pending.splice(0).forEach((c) => writeIce(callId, c));
    startTone("ringback");
    // the other side's uid is only known to the server: read it from the call
    let watching = false;
    unsubs.push(
      onSnapshot(doc(db, "calls", callId), (s) => {
        const peerUid = String(s.get("calleeUid") || "");
        if (peerUid && !watching) {
          watching = true;
          watchCall(callId, peerUid);
        }
      })
    );
    // nobody picks up in 45 seconds → missed
    ringTimer = window.setTimeout(() => {
      if (view?.id === callId && view.status === "ringing") void updateDoc(doc(db, "calls", callId), { status: "missed" }).catch(() => cleanup("missed"));
    }, 45000);
  } catch (e) {
    const msg = (e as { message?: string })?.message || "Could not start the call.";
    patch({ error: msg.replace(/^.*?:\s*/, "") });
    cleanup("ended", 2600);
  }
}

/** 🔔 a friend is calling me (from the incoming-call listener). */
export function ringIncoming(me: { uid: string }, callId: string, from: string) {
  if (view) return false;
  myUid = me.uid;
  emit({ id: callId, role: "callee", peer: from, status: "ringing", acceptedAtMs: 0, muted: false, speaker: false, error: "" });
  startTone("ring");
  unsubs.push(
    onSnapshot(doc(db, "calls", callId), (s) => {
      const st = String(s.get("status") || "");
      if (view?.id === callId && view.status === "ringing" && FINAL.includes(st)) cleanup(st as CallStatus, 1200);
    })
  );
  return true;
}

export async function acceptCall() {
  if (!view || view.role !== "callee" || view.status !== "ringing") return;
  const callId = view.id;
  stopTone();
  patch({ status: "connecting" });
  try {
    local = await micStream();
    const servers = await iceServers();
    const callSnap = await new Promise<{ offer: RTCSessionDescriptionInit; callerUid: string }>((res, rej) => {
      const u = onSnapshot(
        doc(db, "calls", callId),
        (s) => {
          u();
          if (!s.exists() || s.get("status") !== "ringing") return rej(new Error("The call has ended."));
          res({ offer: s.get("offer"), callerUid: String(s.get("callerUid") || "") });
        },
        rej
      );
    });
    pc = makePeer(servers, callId, (c) => writeIce(callId, c));
    await pc.setRemoteDescription(callSnap.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await updateDoc(doc(db, "calls", callId), { status: "accepted", answer: { type: "answer", sdp: answer.sdp }, acceptedAt: serverTimestamp() });
    listenIce(callId, callSnap.callerUid);
    watchCall(callId, callSnap.callerUid);
  } catch (e) {
    patch({ error: (e as { message?: string })?.message || "Could not answer." });
    cleanup("ended", 2200);
  }
}

export async function declineCall() {
  if (!view) return;
  const id = view.id;
  await updateDoc(doc(db, "calls", id), { status: "declined" }).catch(() => {});
  cleanup("declined", 600);
}

export async function hangUp() {
  if (!view) return;
  const { id, status, role } = view;
  if (id) {
    const ref = doc(db, "calls", id);
    if (status === "ringing" || status === "starting") {
      if (role === "caller") await updateDoc(ref, { status: "cancelled" }).catch(() => {});
      else await updateDoc(ref, { status: "declined" }).catch(() => {});
    } else {
      await updateDoc(ref, { status: "ended", endedBy: myUid }).catch(() => {});
    }
  }
  cleanup("ended", view?.error ? 3500 : 1400);
}

export function toggleMute() {
  if (!view || !local) return;
  const muted = !view.muted;
  local.getAudioTracks().forEach((t) => (t.enabled = !muted));
  patch({ muted });
}

export function toggleSpeaker() {
  if (!view) return;
  // browsers choose the output themselves; louder playback is the best we can do
  const speaker = !view.speaker;
  if (audioEl) audioEl.volume = speaker ? 1 : 0.7;
  patch({ speaker });
}

// 🎵 ring tones made in the browser (no sound files)
let toneCtx: AudioContext | null = null;
let toneTimer = 0;
function startTone(kind: "ring" | "ringback") {
  stopTone();
  try {
    toneCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const beep = () => {
      if (!toneCtx) return;
      const o = toneCtx.createOscillator();
      const g = toneCtx.createGain();
      o.frequency.value = kind === "ring" ? 880 : 440;
      g.gain.value = kind === "ring" ? 0.18 : 0.08;
      o.connect(g).connect(toneCtx.destination);
      o.start();
      o.stop(toneCtx.currentTime + (kind === "ring" ? 0.9 : 1.2));
      if (kind === "ring" && navigator.vibrate) navigator.vibrate([400, 200, 400]);
    };
    beep();
    toneTimer = window.setInterval(beep, kind === "ring" ? 2000 : 3500);
  } catch {
    /* no sound */
  }
}
function stopTone() {
  window.clearInterval(toneTimer);
  try {
    void toneCtx?.close();
  } catch {
    /* closed */
  }
  toneCtx = null;
}

/** Listen for calls ringing me (signed-in, any page). */
export function listenIncoming(me: { uid: string }, onCall: (id: string, from: string) => void) {
  return onSnapshot(
    query(collection(db, "calls"), where("calleeUid", "==", me.uid), where("status", "==", "ringing")),
    (s) => {
      s.docChanges().forEach((ch) => {
        if (ch.type !== "added") return;
        const created = ch.doc.get("createdAt")?.toMillis?.() || Date.now();
        if (Date.now() - created > 50000) return; // an old ring
        onCall(ch.doc.id, String(ch.doc.get("callerName") || "Someone"));
      });
    },
    () => {}
  );
}
