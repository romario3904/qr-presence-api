// routes/auth.js
const express = require('express');
const { login, register, getProfile, logout, verifyToken } = require('../controllers/authController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Routes publiques
router.post('/login', login);
router.post('/register', register);

// Routes protégées
router.post('/logout', authenticateToken, logout);
router.get('/profile', authenticateToken, getProfile);
router.get('/verify', authenticateToken, verifyToken); // Nouvelle route

// Route de test
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Auth routes are working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;