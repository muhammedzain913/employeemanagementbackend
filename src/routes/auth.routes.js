const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { protect, requireRoles } = require('../middlewares/auth.middleware');

// Public route for initial setup or Admin use [cite: 42, 113]
router.post('/register', protect, requireRoles('ADMIN'), authController.register);
router.post('/login', authController.login);

module.exports = router;