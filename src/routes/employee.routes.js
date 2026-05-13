const express = require('express');
const router = express.Router();
const { protect, requireRoles, allowSelfOrRoles } = require('../middlewares/auth.middleware');
const employeeController = require('../controllers/employee.controller');

router.get('/me', protect, (req, res) => {
  res.json(req.user);
});

router.get(
  '/',
  protect,
  requireRoles('ADMIN', 'MANAGER'),
  employeeController.list,
);

router.post(
  '/',
  protect,
  requireRoles('ADMIN', 'MANAGER'),
  employeeController.create,
);

router.get(
  '/:userId',
  protect,
  allowSelfOrRoles('userId', 'ADMIN', 'MANAGER'),
  employeeController.getById,
);

router.patch(
  '/:userId',
  protect,
  requireRoles('ADMIN', 'MANAGER'),
  employeeController.update,
);

module.exports = router;
