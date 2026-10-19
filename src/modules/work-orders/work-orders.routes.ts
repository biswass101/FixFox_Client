import { Router } from 'express';
import { workOrdersController } from './work-orders.controller';
import { authenticate } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/async-handler';
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  workOrderQuerySchema,
  assignTechnicianSchema,
  updateStatusSchema,
  resolveWorkOrderSchema,
  reopenWorkOrderSchema,
  createNoteSchema,
  createCostSchema,
  updateCostSchema,
} from './work-orders.schemas';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  validate(createWorkOrderSchema),
  asyncHandler(workOrdersController.create)
);

router.get(
  '/',
  validate(workOrderQuerySchema, 'query'),
  asyncHandler(workOrdersController.list)
);

router.get(
  '/:id',
  asyncHandler(workOrdersController.getById)
);

router.patch(
  '/:id',
  validate(updateWorkOrderSchema),
  asyncHandler(workOrdersController.update)
);

router.post(
  '/:id/assign',
  validate(assignTechnicianSchema),
  asyncHandler(workOrdersController.assign)
);

router.post(
  '/:id/status',
  validate(updateStatusSchema),
  asyncHandler(workOrdersController.updateStatus)
);

router.post(
  '/:id/resolve',
  validate(resolveWorkOrderSchema),
  asyncHandler(workOrdersController.resolve)
);

router.post(
  '/:id/close',
  asyncHandler(workOrdersController.close)
);

router.post(
  '/:id/reopen',
  validate(reopenWorkOrderSchema),
  asyncHandler(workOrdersController.reopen)
);

router.get(
  '/:id/history',
  asyncHandler(workOrdersController.getHistory)
);

router.get(
  '/:id/notes',
  asyncHandler(workOrdersController.listNotes)
);

router.post(
  '/:id/notes',
  validate(createNoteSchema),
  asyncHandler(workOrdersController.addNote)
);

router.get(
  '/:id/costs',
  asyncHandler(workOrdersController.listCosts)
);

router.post(
  '/:id/costs',
  validate(createCostSchema),
  asyncHandler(workOrdersController.addCost)
);

router.patch(
  '/:id/costs/:costId',
  validate(updateCostSchema),
  asyncHandler(workOrdersController.updateCost)
);

router.delete(
  '/:id/costs/:costId',
  asyncHandler(workOrdersController.deleteCost)
);

export { router as workOrdersRoutes };

