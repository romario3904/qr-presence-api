// routes/presence.js
const express = require('express');
const { 
  getStudentPresence, 
  getSeancePresence, 
  getTeacherMatieres,
  markPresence,
  getStudentPresenceById // À ajouter dans le controller
} = require('../controllers/presenceController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Routes
router.get('/student', authenticateToken, authorize('etudiant'), getStudentPresence);
router.get('/student/:id_etudiant', authenticateToken, authorize(['etudiant', 'enseignant']), getStudentPresenceById); // Nouvelle route
router.get('/seance/:id_seance', authenticateToken, authorize('enseignant'), getSeancePresence);
router.get('/matieres', authenticateToken, authorize('enseignant'), getTeacherMatieres);
router.post('/mark', authenticateToken, authorize('enseignant'), markPresence);

module.exports = router;