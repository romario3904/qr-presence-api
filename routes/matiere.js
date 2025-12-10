// routes/matiere.js
const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/authMiddleware');
const { 
  getAllMatieres,
  getMatiereById,
  createMatiere,
  updateMatiere,
  deleteMatiere
} = require('../controllers/matiereController');

// Récupérer toutes les matières (pour tous les utilisateurs authentifiés)
router.get('/', authenticateToken, getAllMatieres);

// Récupérer une matière spécifique
router.get('/:id', authenticateToken, getMatiereById);

// Créer une nouvelle matière (enseignant et admin)
router.post('/', authenticateToken, authorize(['enseignant', 'admin']), createMatiere);

// Mettre à jour une matière (enseignant et admin)
router.put('/:id', authenticateToken, authorize(['enseignant', 'admin']), updateMatiere);

// Supprimer une matière (enseignant et admin) - NOUVELLE ROUTE
router.delete('/:id', authenticateToken, authorize(['enseignant', 'admin']), deleteMatiere);

module.exports = router;
