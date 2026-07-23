import { useEffect } from "react";
import { create } from "zustand";
import { api } from "./api";

export interface LiveEvent {
  topic: string;
  payload: Record<string, any>;
  ts: string;
}

interface RealtimeState {
  connected: boolean;
  events: LiveEvent[];
  lastCritical: LiveEvent | null;
  setConnected: (b: boolean) => void;
  push: (e: LiveEvent) => void;
  seed: (events: LiveEvent[]) => void;
}

const CRITICAL = new Set(["result.abnormal", "compliance.flagged"]);
const isCritical = (e: LiveEvent) =>
  CRITICAL.has(e.topic) || (e.topic === "triage.completed" && e.payload?.red_flag);

export const useRealtime = create<RealtimeState>((set) => ({
  connected: false,
  events: [],
  lastCritical: null,
  setConnected: (b) => set({ connected: b }),
  push: (e) =>
    set((s) => ({
      events: [e, ...s.events].slice(0, 60),
      lastCritical: isCritical(e) ? e : s.lastCritical,
    })),
  seed: (events) => set((s) => (s.events.length ? {} : { events })),
}));

function wsUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (base) return base.replace(/^http/, "ws") + "/ws/stream";
  const proto = location.protocol === "https:" ? "wss" : "ws";
  if (location.port === "5173") {
    return `${proto}://${location.hostname}:8000/ws/stream`;
  }
  return `${proto}://${location.host}/ws/stream`;
}

let socket: WebSocket | null = null;

/** Opens a single app-wide WebSocket connection with auto-reconnect. Call once (in Layout). */
export function useRealtimeConnection(): void {
  useEffect(() => {
    if (socket) return;
    let stopped = false;

    // Seed with recent backlog so the stream isn't empty on first load.
    api.events(30).then((r) => useRealtime.getState().seed(r.events)).catch(() => {});

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      socket = ws;
      ws.onopen = () => useRealtime.getState().setConnected(true);
      ws.onclose = () => {
        useRealtime.getState().setConnected(false);
        socket = null;
        if (!stopped) setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as LiveEvent;
          if (data.topic !== "ping" && data.topic !== "hello") useRealtime.getState().push(data);
        } catch {
          /* ignore malformed frames */
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (socket) {
        const closingSocket = socket;
        closingSocket.onclose = null;
        closingSocket.onmessage = null;
        closingSocket.onerror = null;
        if (closingSocket.readyState === WebSocket.CONNECTING) {
          // React Strict Mode immediately mounts/unmounts effects once in
          // development. Wait for the handshake before closing so the browser
          // does not report "closed before the connection is established".
          closingSocket.onopen = () => closingSocket.close();
        } else if (closingSocket.readyState === WebSocket.OPEN) {
          closingSocket.close();
        }
        socket = null;
      }
      useRealtime.getState().setConnected(false);
    };
  }, []);
}
