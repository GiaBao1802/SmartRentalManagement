import type { AuthContext, SuperadminAuthContext } from "../auth/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthContext;
      platformAuth?: SuperadminAuthContext;
    }
  }
}

export {};
