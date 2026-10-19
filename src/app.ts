import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { env } from './config/env';
import { logger } from './config/logger';
import { corsOptions } from './config/cors';
import { requestIdMiddleware } from './common/middleware/request-id';
import { notFoundHandler } from './common/middleware/not-found';
import { errorHandler } from './common/middleware/error-handler';
import { healthRoutes } from './modules/health/health.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { locationsRoutes } from './modules/locations/locations.routes';
import { assetsRoutes } from './modules/assets/assets.routes';
import { techniciansRoutes } from './modules/technicians/technicians.routes';
import { workOrdersRoutes } from './modules/work-orders/work-orders.routes';
import { invitationsRoutes } from './modules/invitations/invitations.routes';
import { notificationsRoutes } from './modules/notifications/notifications.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './docs/swagger';

const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
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

app.get('/api/docs/json', (_req, res) => {
  res.json(swaggerSpec);
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(healthRoutes);
app.use(`${env.API_PREFIX}/auth`, authRoutes);
app.use(`${env.API_PREFIX}/locations`, locationsRoutes);
app.use(`${env.API_PREFIX}/assets`, assetsRoutes);
app.use(`${env.API_PREFIX}/technicians`, techniciansRoutes);
app.use(`${env.API_PREFIX}/work-orders`, workOrdersRoutes);
app.use(`${env.API_PREFIX}/invitations`, invitationsRoutes);
app.use(`${env.API_PREFIX}/notifications`, notificationsRoutes);
app.use(`${env.API_PREFIX}/analytics`, analyticsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
