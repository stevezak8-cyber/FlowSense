import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import type { NotificationEvent } from "@/api/types";

const TOKEN_KEY = "flowsense_token";

export function useNotifications() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectDelayRef = useRef(1000);

  const connect = useCallback(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws?token=${token}`);

    ws.onopen = () => {
      console.log("WebSocket connected");
      reconnectDelayRef.current = 1000; // Reset backoff on successful connection
    };

    ws.onmessage = (event) => {
      try {
        const notification = JSON.parse(event.data) as NotificationEvent;
        // Show toast notification
        toast(notification.message, {
          description: new Date(notification.timestamp).toLocaleTimeString(),
        });
      } catch (e) {
        console.error("Failed to parse notification:", e);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected, reconnecting...");
      wsRef.current = null;
      // Exponential backoff: 1s, 2s, 4s, 8s, ..., max 30s
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
        connect();
      }, reconnectDelayRef.current);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);
}
