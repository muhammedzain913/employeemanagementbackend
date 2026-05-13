const express = require('express');
const router = express.Router();
const { protect, requireRoles } = require('../middlewares/auth.middleware');
const { validateCheckInCoordinates } = require('../middlewares/attendance.validation');
const attendanceController = require('../controllers/attendance.controller');

const adminOrManager = [protect, requireRoles('ADMIN', 'MANAGER')];

router.post(
  '/check-in',
  protect,
  validateCheckInCoordinates,
  attendanceController.checkIn,
);

router.patch('/check-out', protect, attendanceController.checkOut);

router.get('/me/history', protect, attendanceController.myHistory);

router.get(
  '/reports/summary',
  ...adminOrManager,
  attendanceController.reportSummary,
);

router.get(
  '/employee/:userId',
  ...adminOrManager,
  attendanceController.listByEmployee,
);

router.get('/', ...adminOrManager, attendanceController.list);

module.exports = router;
