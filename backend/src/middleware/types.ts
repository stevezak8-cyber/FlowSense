export interface AuthPayload {
  userId: string;
  role: string;
  organizationId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}
