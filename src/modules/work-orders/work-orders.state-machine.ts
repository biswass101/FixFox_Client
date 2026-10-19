import { WorkOrderStatus, UserRole } from '@prisma/client';

const validTransitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.OPEN]: [
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.ASSIGNED]: [
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.OPEN,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.IN_PROGRESS]: [
    WorkOrderStatus.RESOLVED,
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.RESOLVED]: [
    WorkOrderStatus.CLOSED,
    WorkOrderStatus.IN_PROGRESS,
  ],
  [WorkOrderStatus.CLOSED]: [
    WorkOrderStatus.IN_PROGRESS,
  ],
  [WorkOrderStatus.CANCELLED]: [
    WorkOrderStatus.OPEN,
  ],
};

export function isValidTransition(
  currentStatus: WorkOrderStatus,
  targetStatus: WorkOrderStatus
): boolean {
  return validTransitions[currentStatus]?.includes(targetStatus) ?? false;
}

export function canUserTransitionStatus(
  role: UserRole,
  isAssignee: boolean,
  targetStatus: WorkOrderStatus
): boolean {
  if (role === UserRole.ADMIN || role === UserRole.MANAGER) {
    return true;
  }

  if (role === UserRole.TECHNICIAN) {
    if (!isAssignee) {
      return false;
    }
    return (
      targetStatus === WorkOrderStatus.IN_PROGRESS ||
      targetStatus === WorkOrderStatus.RESOLVED
    );
  }

  return false;
}

