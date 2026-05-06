// routes/auth.js
const express = require('express');
const { login, register, getProfile, logout, verifyToken } = require('../controllers/authController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Routes publiques
router.post('/login', login);
router.post('/register', register);
// Déconnexion: volontairement publique pour permettre un reset côté client
// même si le token a expiré / est invalide (sinon la déconnexion peut échouer
// et laisser le front "bloqué" avec un état auth incohérent).
router.post('/logout', logout);

// Routes protégées
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