// routes/qr.js
const express = require('express');
const { 
  generateQRCode, 
  verifyQRCode, 
  getTeacherSeances, 
  scanQRCode,
  getStudentPresences,
  getStudentPresencesById 
} = require('../controllers/qrController');
const { authenticateToken, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Routes
router.post('/generate', authenticateToken, authorize('enseignant'), generateQRCode);
router.post('/verify', authenticateToken, authorize('etudiant'), verifyQRCode);
router.post('/scan', authenticateToken, scanQRCode);
router.get('/seances', authenticateToken, authorize('enseignant'), getTeacherSeances);

// Routes pour les présences étudiant
router.get('/presence/student', authenticateToken, authorize('etudiant'), getStudentPresences);
router.get('/presence/student/:id', authenticateToken, getStudentPresencesById);

module.exports = router;
