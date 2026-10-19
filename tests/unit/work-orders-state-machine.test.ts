import { describe, it, expect } from 'vitest';
import { WorkOrderStatus, UserRole } from '@prisma/client';
import {
  isValidTransition,
  canUserTransitionStatus,
} from '../../src/modules/work-orders/work-orders.state-machine';

describe('Work Order State Machine', () => {
  describe('isValidTransition', () => {
    it('allows valid transitions from OPEN', () => {
      expect(isValidTransition(WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS)).toBe(false);
      expect(isValidTransition(WorkOrderStatus.OPEN, WorkOrderStatus.CANCELLED)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.OPEN, WorkOrderStatus.RESOLVED)).toBe(false);
      expect(isValidTransition(WorkOrderStatus.OPEN, WorkOrderStatus.CLOSED)).toBe(false);
    });

    it('allows valid transitions from ASSIGNED', () => {
      expect(isValidTransition(WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.ASSIGNED, WorkOrderStatus.OPEN)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.ASSIGNED, WorkOrderStatus.CANCELLED)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.ASSIGNED, WorkOrderStatus.RESOLVED)).toBe(false);
      expect(isValidTransition(WorkOrderStatus.ASSIGNED, WorkOrderStatus.CLOSED)).toBe(false);
    });

    it('allows valid transitions from IN_PROGRESS', () => {
      expect(isValidTransition(WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.RESOLVED)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.ASSIGNED)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CLOSED)).toBe(false);
    });

    it('allows valid transitions from RESOLVED', () => {
      expect(isValidTransition(WorkOrderStatus.RESOLVED, WorkOrderStatus.CLOSED)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.RESOLVED, WorkOrderStatus.IN_PROGRESS)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.RESOLVED, WorkOrderStatus.OPEN)).toBe(false);
    });

    it('allows reopening from CLOSED and CANCELLED', () => {
      expect(isValidTransition(WorkOrderStatus.CLOSED, WorkOrderStatus.IN_PROGRESS)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.CLOSED, WorkOrderStatus.RESOLVED)).toBe(false);
      expect(isValidTransition(WorkOrderStatus.CANCELLED, WorkOrderStatus.OPEN)).toBe(true);
      expect(isValidTransition(WorkOrderStatus.CANCELLED, WorkOrderStatus.CLOSED)).toBe(false);
    });
  });

  describe('canUserTransitionStatus', () => {
    it('allows ADMIN and MANAGER full transition authority', () => {
      expect(canUserTransitionStatus(UserRole.ADMIN, false, WorkOrderStatus.RESOLVED)).toBe(true);
      expect(canUserTransitionStatus(UserRole.MANAGER, false, WorkOrderStatus.CLOSED)).toBe(true);
      expect(canUserTransitionStatus(UserRole.ADMIN, false, WorkOrderStatus.CANCELLED)).toBe(true);
    });

    it('allows assigned TECHNICIAN to start and resolve work', () => {
      expect(canUserTransitionStatus(UserRole.TECHNICIAN, true, WorkOrderStatus.IN_PROGRESS)).toBe(true);
      expect(canUserTransitionStatus(UserRole.TECHNICIAN, true, WorkOrderStatus.RESOLVED)).toBe(true);
      expect(canUserTransitionStatus(UserRole.TECHNICIAN, true, WorkOrderStatus.CLOSED)).toBe(false);
      expect(canUserTransitionStatus(UserRole.TECHNICIAN, true, WorkOrderStatus.CANCELLED)).toBe(false);
    });

    it('denies unassigned TECHNICIAN from making transitions', () => {
      expect(canUserTransitionStatus(UserRole.TECHNICIAN, false, WorkOrderStatus.IN_PROGRESS)).toBe(false);
      expect(canUserTransitionStatus(UserRole.TECHNICIAN, false, WorkOrderStatus.RESOLVED)).toBe(false);
    });

    it('denies REPORTER from making transitions', () => {
      expect(canUserTransitionStatus(UserRole.REPORTER, false, WorkOrderStatus.IN_PROGRESS)).toBe(false);
      expect(canUserTransitionStatus(UserRole.REPORTER, false, WorkOrderStatus.RESOLVED)).toBe(false);
      expect(canUserTransitionStatus(UserRole.REPORTER, false, WorkOrderStatus.CLOSED)).toBe(false);
    });
  });
});

