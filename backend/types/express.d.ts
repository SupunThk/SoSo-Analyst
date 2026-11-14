// Fields our middleware adds to Express requests.
import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Correlation id set by the request-id middleware in server.ts. */
    id?: string;
    /** Wallet session attached by requireSession (utils/auth.js). */
    auth?: {
      walletHash: string;
      [key: string]: unknown;
    };
  }
}
