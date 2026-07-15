export interface AuthPayload {
  userId: string;
  role: string;
  organizationId: string;
  technicianId?: string;
  customerId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}
