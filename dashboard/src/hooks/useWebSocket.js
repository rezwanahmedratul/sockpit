'use client';

import { useEffect, useRef, useState } from 'react';
import { getAccessToken } from '@/lib/auth';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000';

export function useWebSocket(onEvent) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    // Connect to WebSocket server with dashboard query token
    const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}&type=dashboard`);
    wsRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (onEvent && typeof onEvent === 'function') {
          onEvent(message);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket event:', err);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
    };

    socket.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };

    return () => {
      socket.close();
    };
  }, [onEvent]);

  return { isConnected };
}
