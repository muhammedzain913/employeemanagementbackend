const express = require('express');
const router = express.Router();
const { protect, requireRoles } = require('../middlewares/auth.middleware');
const { validateApplyLeave } = require('../middlewares/leave.validation');
const leaveController = require('../controllers/leave.controller');

const adminOrManager = [protect, requireRoles('ADMIN', 'MANAGER')];

router.get('/reports', ...adminOrManager, leaveController.reports);
router.get('/balances', ...adminOrManager, leaveController.balanceMonitoring);
router.get('/requests', ...adminOrManager, leaveController.listRequests);
router.get('/requests/:leaveId', ...adminOrManager, leaveController.adminLeaveById);
router.patch(
  '/requests/:leaveId/approve',
  ...adminOrManager,
  leaveController.approve,
);
router.patch(
  '/requests/:leaveId/reject',
  ...adminOrManager,
  leaveController.reject,
);

router.get('/me/history', protect, leaveController.myHistory);
router.get('/me/balance', protect, leaveController.myBalance);
router.get('/me/:leaveId', protect, leaveController.myLeaveById);

router.post('/', protect, validateApplyLeave, leaveController.apply);

module.exports = router;
