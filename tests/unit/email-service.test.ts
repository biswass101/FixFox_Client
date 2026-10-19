import { describe, it, expect } from 'vitest';
import { emailService } from '../../src/modules/email/email.service';

describe('Email Service', () => {
  it('dispatches work order assignment notification', async () => {
    await expect(
      emailService.notifyWorkOrderAssigned({
        to: 'tech@example.com',
        technicianName: 'John Tech',
        workOrderId: '11111111-1111-1111-1111-111111111111',
        title: 'Repair HVAC Air Handler',
        priority: 'HIGH',
        locationName: 'Roof level unit 4',
      })
    ).resolves.not.toThrow();
  });

  it('dispatches work order status change notification', async () => {
    await expect(
      emailService.notifyStatusChanged({
        to: 'reporter@example.com',
        recipientName: 'Alice Reporter',
        workOrderId: '11111111-1111-1111-1111-111111111111',
        title: 'Water leak',
        oldStatus: 'OPEN',
        newStatus: 'RESOLVED',
        changedByName: 'John Tech',
      })
    ).resolves.not.toThrow();
  });

  it('dispatches SLA overdue warning notification', async () => {
    await expect(
      emailService.notifySlaBreached({
        to: 'manager@example.com',
        recipientName: 'Bob Manager',
        workOrderId: '11111111-1111-1111-1111-111111111111',
        title: 'Emergency Generator Failure',
        priority: 'CRITICAL',
        dueAt: new Date(Date.now() - 3600000),
      })
    ).resolves.not.toThrow();
  });
});

