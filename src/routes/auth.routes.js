const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Public route for initial setup or Admin use [cite: 42, 113]
router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;