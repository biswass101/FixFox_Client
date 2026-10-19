import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

describe('Health Endpoints', () => {
  it('GET /health/live returns 200 with status ok and uptime', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('GET /health/ready returns health status check structure', async () => {
    const res = await request(app).get('/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('dependencies');
    expect(res.body.dependencies).toHaveProperty('database');
    expect(res.body.dependencies).toHaveProperty('redis');
  });

  it('GET /unknown-route returns 404 with structured error envelope', async () => {
    const res = await request(app).get('/non-existent-endpoint');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Route GET /non-existent-endpoint not found',
      },
    });
  });
});
