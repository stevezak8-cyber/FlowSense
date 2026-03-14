interface BookingConfirmationData {
  customerName: string;
  serviceType: string | null;
  equipmentType: string | null;
  scheduledAt: string;
  symptomSummary: string | null;
  jobId: string;
}

export function bookingConfirmationHtml(data: BookingConfirmationData): string {
  const date = new Date(data.scheduledAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a;">Service Request Received</h2>
      <p>Hi ${data.customerName},</p>
      <p>Your service request has been received. Our team will review and assign a technician shortly.</p>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
        ${data.serviceType ? `<p style="margin: 4px 0;"><strong>Service:</strong> ${data.serviceType}</p>` : ""}
        ${data.equipmentType ? `<p style="margin: 4px 0;"><strong>Equipment:</strong> ${data.equipmentType}</p>` : ""}
        ${data.symptomSummary ? `<p style="margin: 4px 0;"><strong>Issue:</strong> ${data.symptomSummary}</p>` : ""}
        <p style="margin: 4px 0;"><strong>Reference:</strong> ${data.jobId.slice(0, 12)}</p>
      </div>
      <p style="color: #666; font-size: 14px;">— The FlowSense Team</p>
    </div>
  `;
}
