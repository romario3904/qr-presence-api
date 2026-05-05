// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Token d\'accès requis' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'votre_secret_jwt_tres_securise', async (err, user) => {
    if (err) {
      console.error('❌ Erreur token:', err.message);
      
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expiré' });
      }
      return res.status(403).json({ success: false, message: 'Token invalide' });
    }
    
    req.user = user;
    
    try {
      // Charger le profil
      if (user.type_utilisateur === 'enseignant') {
        const result = await db.query(
          'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
          [user.id]
        );
        if (result.rows.length > 0) {
          req.user.profil = { id_enseignant: result.rows[0].id_enseignant };
        }
      } else if (user.type_utilisateur === 'etudiant') {
        const result = await db.query(
          'SELECT id_etudiant FROM etudiants WHERE id_utilisateur = $1',
          [user.id]
        );
        if (result.rows.length > 0) {
          req.user.profil = { id_etudiant: result.rows[0].id_etudiant };
        }
      } else {
        req.user.profil = {};
      }
      
      next();
    } catch (profileError) {
      console.error('Erreur chargement profil:', profileError);
      req.user.profil = {};
      next();
    }
  });
};

const authorize = (...allowedTypes) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    if (!allowedTypes.includes(req.user.type_utilisateur)) {
      return res.status(403).json({ 
        success: false, 
        message: `Accès refusé. Rôle requis: ${allowedTypes.join(', ')}`,
        userType: req.user.type_utilisateur
      });
    }
    next();
  };
};

module.exports = { authenticateToken, authorize };