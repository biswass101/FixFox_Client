import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { logger } from './config/logger';
import { corsOptions } from './config/cors';
import { requestIdMiddleware } from './common/middleware/request-id';
import { notFoundHandler } from './common/middleware/not-found';
import { errorHandler } from './common/middleware/error-handler';
import { healthRoutes } from './modules/health/health.routes';

const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(requestIdMiddleware);

app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({
      requestId: (req as express.Request).requestId,
    }),
    autoLogging: {
      ignore: (req) => req.url === '/health/live' || req.url === '/health/ready',
    },
  })
);

app.use(healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
