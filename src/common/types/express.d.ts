declare namespace Express {
  interface Request {
    requestId: string;
    user?: {
      userId: string;
      organizationId: string;
      role: string;
      sessionId: string;
    };
  }
}
