import type { CorsOptions } from 'cors';
import { env } from './env';

export const corsOptions: CorsOptions = {
  origin: env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Request-Id', 'X-Total-Count'],
  maxAge: 86400,
};
