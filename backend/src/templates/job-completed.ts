interface JobCompletedData {
  customerName: string;
  equipmentType: string | null;
  technicianName: string;
  completedAt: string;
}

export function jobCompletedHtml(data: JobCompletedData): string {
  const date = new Date(data.completedAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a;">Service Complete</h2>
      <p>Hi ${data.customerName},</p>
      <p>Your ${data.equipmentType ?? "HVAC"} service has been completed by ${data.technicianName} on ${date}.</p>
      <p>An invoice will follow shortly with the service details and cost.</p>
      <p>If you have any questions about the work performed, please don't hesitate to reach out.</p>
      <p style="color: #666; font-size: 14px;">— The FlowSense Team</p>
    </div>
  `;
}
