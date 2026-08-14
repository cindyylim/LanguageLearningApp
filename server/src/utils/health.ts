import { connectToDatabase } from './mongo';
import { redisHealthCheck } from './redis';
import { connectToTestDatabase } from './testMongo';
import logger from './logger';

export type HealthStatus = 'OK' | 'DEGRADED';

export interface HealthPayload {
  status: HealthStatus;
  timestamp: string;
  environment: string;
  uptime: number;
  checks: {
    database: string;
    redis: string;
    ai: string;
  };
}

export async function getHealthStatus(): Promise<HealthPayload> {
  const health: HealthPayload = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    checks: {
      database: 'unknown',
      redis: 'unknown',
      // AI is optional and is not probed here — calling the model would 503 load balancers and burn quota.
      ai: 'optional',
    },
  };

  try {
    const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();
    await db.admin().ping();
    health.checks.database = 'healthy';
  } catch (error) {
    logger.error('Health check - Database failed:', error);
    health.checks.database = 'unhealthy';
    health.status = 'DEGRADED';
  }

  try {
    const ok = await redisHealthCheck();
    health.checks.redis = ok ? 'healthy' : 'unhealthy';
    if (!ok) health.status = 'DEGRADED';
  } catch (error) {
    logger.error('Health check - Redis failed:', error);
    health.checks.redis = 'unhealthy';
    health.status = 'DEGRADED';
  }

  return health;
}
