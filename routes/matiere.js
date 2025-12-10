// routes/matiere.js
const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/authMiddleware');
const { 
  getTeacherMatieres, 
  getMatiereById,
  getAllMatieres,
  createMatiere,
  updateMatiere,
  deleteMatiere
} = require('../controllers/matiereController');

// Récupérer toutes les matières (admin)
router.get('/all', authenticateToken, authorize(['admin', 'enseignant']), getAllMatieres);

// Récupérer toutes les matières de l'enseignant
router.get('/', authenticateToken, authorize('enseignant'), getTeacherMatieres);

// Créer une nouvelle matière
router.post('/', authenticateToken, authorize('enseignant'), createMatiere);

// Récupérer une matière spécifique
router.get('/:id', authenticateToken, authorize('enseignant'), getMatiereById);

// Mettre à jour une matière
router.put('/:id', authenticateToken, authorize('enseignant'), updateMatiere);

// Supprimer une matière
router.delete('/:id', authenticateToken, authorize('enseignant'), deleteMatiere);

// Route de santé spécifique pour matières
router.get('/health/check', authenticateToken, (req, res) => {
  console.log('🏥 Vérification santé route matières');
  res.json({
    success: true,
    message: 'Route matières fonctionnelle',
    timestamp: new Date().toISOString(),
    user: req.user.id
  });
});

module.exports = router;
