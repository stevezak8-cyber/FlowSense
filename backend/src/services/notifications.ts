import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import type { AuthPayload } from "../middleware/types.js";

interface NotificationEvent {
  type: "job.created" | "job.assigned" | "job.status_changed" | "job.completed";
  message: string;
  jobId: string;
  timestamp: string;
}

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  role: string;
  organizationId: string;
}

const clients: ConnectedClient[] = [];

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? "", `http://${request.headers.host}`);
    // Prefer token from Sec-WebSocket-Protocol header (never appears in URL
    // access logs). Fall back to query param for backwards compatibility.
    const token =
      (request.headers["sec-websocket-protocol"] as string | undefined) ??
      url.searchParams.get("token");

    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
      wss.handleUpgrade(request, socket, head, (ws) => {
        const client: ConnectedClient = {
          ws,
          userId: payload.userId,
          role: payload.role,
          organizationId: payload.organizationId,
        };
        clients.push(client);
        console.log(`WebSocket connected: ${payload.userId} (${payload.role})`);

        ws.on("close", () => {
          const index = clients.indexOf(client);
          if (index !== -1) clients.splice(index, 1);
          console.log(`WebSocket disconnected: ${payload.userId}`);
        });

        ws.on("error", (err) => {
          console.error(`WebSocket error for ${payload.userId}:`, err.message);
        });
      });
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    }
  });

  return wss;
}

export function notifyInApp(userId: string, event: NotificationEvent) {
  const message = JSON.stringify(event);
  for (const client of clients) {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

export function broadcastToRole(
  organizationId: string,
  role: string,
  event: NotificationEvent
) {
  const message = JSON.stringify(event);
  for (const client of clients) {
    if (
      client.organizationId === organizationId &&
      client.role === role &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      client.ws.send(message);
    }
  }
}
