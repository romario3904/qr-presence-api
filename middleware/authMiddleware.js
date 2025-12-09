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
      console.error('❌ Erreur de vérification du token:', err.message);
      
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false,
          message: 'Token expiré' 
        });
      }
      
      if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({ 
          success: false,
          message: 'Token invalide' 
        });
      }
      
      return res.status(403).json({ 
        success: false,
        message: 'Erreur d\'authentification' 
      });
    }
    
    req.user = user;
    console.log('✅ Token valide pour l\'utilisateur:', user.id);
    
    try {
      // Charger le profil depuis PostgreSQL
      const userType = req.user.type_utilisateur;
      req.user.profil = {};

      if (userType === 'enseignant') {
        const enseignants = await db.query(
          'SELECT id_enseignant, niveaux_enseignes, mention_enseignee, parcours_enseignes FROM enseignants WHERE id_utilisateur = $1',
          [user.id]
        );
        if (enseignants.rows.length > 0) {
          const enseignant = enseignants.rows[0];
          const niveauxArray = enseignant.niveaux_enseignes ? enseignant.niveaux_enseignes.split(',') : [];
          const parcoursArray = enseignant.parcours_enseignes ? enseignant.parcours_enseignes.split(',') : [];
          
          req.user.profil.id_enseignant = enseignant.id_enseignant;
          req.user.profil.niveaux_enseignes = niveauxArray;
          req.user.profil.mention_enseignee = enseignant.mention_enseignee;
          req.user.profil.parcours_enseignes = parcoursArray;
        }
      } else if (userType === 'etudiant') {
        const etudiants = await db.query(
          'SELECT id_etudiant, niveau, mention, parcours FROM etudiants WHERE id_utilisateur = $1',
          [user.id]
        );
        if (etudiants.rows.length > 0) {
          const etudiant = etudiants.rows[0];
          req.user.profil.id_etudiant = etudiant.id_etudiant;
          req.user.profil.niveau = etudiant.niveau;
          req.user.profil.mention = etudiant.mention;
          req.user.profil.parcours = etudiant.parcours;
        }
      }

      console.log(`✅ Profil chargé:`, req.user.profil);
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
      return res.status(401).json({ 
        success: false,
        message: 'Utilisateur non authentifié' 
      });
    }

    if (!allowedTypes.includes(req.user.type_utilisateur)) {
      console.log(`❌ Accès refusé: ${req.user.type_utilisateur} n'est pas autorisé`);
      return res.status(403).json({ 
        success: false,
        message: 'Accès non autorisé pour votre type d\'utilisateur',
        requiredTypes: allowedTypes,
        userType: req.user.type_utilisateur
      });
    }

    console.log(`✅ Accès autorisé pour: ${req.user.type_utilisateur}`);
    next();
  };
};

module.exports = { 
  authenticateToken, 
  authorize
};
