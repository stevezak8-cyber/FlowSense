import { escapeHtml } from "../lib/escape-html.js";

interface StatusUpdateData {
  customerName: string;
  technicianName: string;
  equipmentType: string | null;
  status: string;
}

export function statusUpdateHtml(data: StatusUpdateData): string {
  const techName = escapeHtml(data.technicianName);
  const equipmentType = escapeHtml(data.equipmentType);

  const statusMessage = data.status === "en_route"
    ? `${techName} is on the way to your location.`
    : `${techName} has started working on your ${equipmentType ?? "system"}.`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a;">Service Update</h2>
      <p>Hi ${escapeHtml(data.customerName)},</p>
      <p>${statusMessage}</p>
      <p style="color: #666; font-size: 14px;">— The Pneuros Team</p>
    </div>
  `;
}
