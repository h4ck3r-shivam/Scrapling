import { useEffect, useRef, useState } from "react";
import { wsUrl } from "@/lib/api";

export function useWs(path: string | null, onMessage: (data: unknown) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMsgRef = useRef(onMessage);
  onMsgRef.current = onMessage;

  useEffect(() => {
    if (!path) return;
    const url = wsUrl(path);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        onMsgRef.current(data);
      } catch {
        onMsgRef.current(ev.data);
      }
    };
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 25000);
    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [path]);

  return { connected, ws: wsRef.current };
}
