// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Controller pour la connexion
const login = async (req, res) => {
  try {
    const { matricule, mot_de_passe } = req.body;

    if (!matricule || !mot_de_passe) {
      return res.status(400).json({
        success: false,
        message: 'Matricule et mot de passe requis'
      });
    }

    console.log('🔐 Tentative de connexion pour matricule:', matricule);

    const query = `
      SELECT id_utilisateur, nom, prenom, email, matricule, mot_de_passe, type_utilisateur, statut 
      FROM utilisateurs 
      WHERE matricule = $1 AND statut = 'actif'
    `;
    
    const results = await db.query(query, [matricule]);

    if (results.rows.length === 0) {
      console.log('❌ Aucun utilisateur trouvé avec ce matricule');
      return res.status(401).json({
        success: false,
        message: 'Matricule ou mot de passe incorrect'
      });
    }

    const user = results.rows[0];
    console.log('✅ Utilisateur trouvé:', user.email);

    const isPasswordValid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    
    if (!isPasswordValid) {
      console.log('❌ Mot de passe incorrect');
      return res.status(401).json({
        success: false,
        message: 'Matricule ou mot de passe incorrect'
      });
    }

    // Récupérer le profil selon le type
    let profil = null;
    if (user.type_utilisateur === 'enseignant') {
      const enseignantResults = await db.query(
        'SELECT id_enseignant, niveaux_enseignes, mention_enseignee, parcours_enseignes FROM enseignants WHERE id_utilisateur = $1',
        [user.id_utilisateur]
      );
      if (enseignantResults.rows.length > 0) {
        const enseignant = enseignantResults.rows[0];
        profil = { 
          id_enseignant: enseignant.id_enseignant,
          niveaux_enseignes: enseignant.niveaux_enseignes ? enseignant.niveaux_enseignes.split(',') : [],
          mention_enseignee: enseignant.mention_enseignee,
          parcours_enseignes: enseignant.parcours_enseignes ? enseignant.parcours_enseignes.split(',') : []
        };
      }
    } else if (user.type_utilisateur === 'etudiant') {
      const etudiantResults = await db.query(
        'SELECT id_etudiant, niveau, mention, parcours FROM etudiants WHERE id_utilisateur = $1',
        [user.id_utilisateur]
      );
      if (etudiantResults.rows.length > 0) {
        const etudiant = etudiantResults.rows[0];
        profil = { 
          id_etudiant: etudiant.id_etudiant,
          niveau: etudiant.niveau,
          mention: etudiant.mention,
          parcours: etudiant.parcours
        };
      }
    }

    const token = jwt.sign(
      { 
        id: user.id_utilisateur,
        matricule: user.matricule,
        type_utilisateur: user.type_utilisateur,
        profil: profil
      },
      process.env.JWT_SECRET || 'votre_secret_jwt_tres_securise',
      { expiresIn: '24h' }
    );

    console.log('🎉 Connexion réussie pour:', user.email);

    res.json({
      success: true,
      message: 'Connexion réussie',
      user: {
        id: user.id_utilisateur,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        matricule: user.matricule,
        type_utilisateur: user.type_utilisateur,
        statut: user.statut,
        profil: profil
      },
      token
    });

  } catch (error) {
    console.error('❌ Erreur de connexion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la connexion',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Controller pour l'inscription
const register = async (req, res) => {
  let connection;
  try {
    const { 
      nom, 
      prenom, 
      email, 
      matricule, 
      mot_de_passe, 
      role, 
      niveau, 
      mention, 
      parcours,
      niveaux_enseignes,
      mention_enseignee,
      parcours_enseignes 
    } = req.body;

    console.log('📨 Requête d\'inscription reçue:', { email, matricule, role });

    // Validation
    if (!nom || !prenom || !email || !matricule || !mot_de_passe || !role) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs obligatoires sont requis'
      });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUsers = await db.query(
      'SELECT * FROM utilisateurs WHERE email = $1 OR matricule = $2',
      [email, matricule]
    );

    if (existingUsers.rows.length > 0) {
      const existingUser = existingUsers.rows[0];
      if (existingUser.email === email) {
        return res.status(400).json({
          success: false,
          message: 'Un utilisateur avec cet email existe déjà'
        });
      }
      if (existingUser.matricule === matricule) {
        return res.status(400).json({
          success: false,
          message: 'Un utilisateur avec ce matricule existe déjà'
        });
      }
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(mot_de_passe, 10);

    // Obtenir une connexion pour transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Insérer l'utilisateur
      const insertQuery = `
        INSERT INTO utilisateurs (nom, prenom, email, matricule, mot_de_passe, type_utilisateur, statut) 
        VALUES ($1, $2, $3, $4, $5, $6, 'actif')
        RETURNING id_utilisateur, nom, prenom, email, matricule, type_utilisateur, statut, date_creation
      `;

      const insertParams = [nom, prenom, email, matricule, hashedPassword, role];
      const userResult = await connection.query(insertQuery, insertParams);
      const user = userResult.rows[0];

      console.log('✅ Utilisateur créé, ID:', user.id_utilisateur);

      // Créer le profil selon le rôle
      if (role === 'enseignant') {
        const niveauxStr = Array.isArray(niveaux_enseignes) ? niveaux_enseignes.join(',') : niveaux_enseignes;
        const parcoursStr = Array.isArray(parcours_enseignes) ? parcours_enseignes.join(',') : parcours_enseignes;
        
        const enseignantResult = await connection.query(
          `INSERT INTO enseignants (matricule, nom, prenom, id_utilisateur, niveaux_enseignes, mention_enseignee, parcours_enseignes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           RETURNING id_enseignant`,
          [matricule, nom, prenom, user.id_utilisateur, niveauxStr, mention_enseignee, parcoursStr]
        );
        console.log('✅ Profil enseignant créé, ID:', enseignantResult.rows[0].id_enseignant);
      } else if (role === 'etudiant') {
        const etudiantResult = await connection.query(
          `INSERT INTO etudiants (matricule, nom, prenom, niveau, mention, parcours, id_utilisateur) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           RETURNING id_etudiant`,
          [matricule, nom, prenom, niveau, mention, parcours, user.id_utilisateur]
        );
        console.log('✅ Profil étudiant créé, ID:', etudiantResult.rows[0].id_etudiant);
      }

      await connection.commit();

      // Générer le token
      const token = jwt.sign(
        { 
          id: user.id_utilisateur,
          matricule: user.matricule,
          type_utilisateur: user.type_utilisateur
        },
        process.env.JWT_SECRET || 'votre_secret_jwt_tres_securise',
        { expiresIn: '24h' }
      );

      res.status(201).json({
        success: true,
        message: 'Compte créé avec succès',
        user,
        token
      });

    } catch (transactionError) {
      if (connection) await connection.rollback();
      throw transactionError;
    } finally {
      if (connection) connection.release();
    }

  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du compte',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Controller pour le profil
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const results = await db.query(
      `SELECT id_utilisateur, nom, prenom, email, matricule, type_utilisateur, statut, date_creation
       FROM utilisateurs
       WHERE id_utilisateur = $1`,
      [userId]
    );

    if (results.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const user = results.rows[0];
    
    // Récupérer le profil
    let profil = null;
    if (user.type_utilisateur === 'enseignant') {
      const enseignants = await db.query(
        'SELECT id_enseignant, niveaux_enseignes, mention_enseignee, parcours_enseignes FROM enseignants WHERE id_utilisateur = $1',
        [userId]
      );
      if (enseignants.rows.length > 0) {
        const enseignant = enseignants.rows[0];
        profil = {
          id_enseignant: enseignant.id_enseignant,
          niveaux_enseignes: enseignant.niveaux_enseignes ? enseignant.niveaux_enseignes.split(',') : [],
          mention_enseignee: enseignant.mention_enseignee,
          parcours_enseignes: enseignant.parcours_enseignes ? enseignant.parcours_enseignes.split(',') : []
        };
      }
    } else if (user.type_utilisateur === 'etudiant') {
      const etudiants = await db.query(
        'SELECT id_etudiant, niveau, mention, parcours FROM etudiants WHERE id_utilisateur = $1',
        [userId]
      );
      if (etudiants.rows.length > 0) {
        const etudiant = etudiants.rows[0];
        profil = {
          id_etudiant: etudiant.id_etudiant,
          niveau: etudiant.niveau,
          mention: etudiant.mention,
          parcours: etudiant.parcours
        };
      }
    }

    res.json({
      success: true,
      user: {
        ...user,
        profil
      }
    });
  } catch (error) {
    console.error('❌ Erreur récupération profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Controller pour la déconnexion
const logout = (req, res) => {
  res.json({
    success: true,
    message: 'Déconnexion réussie'
  });
};

// Controller pour vérifier le token
const verifyToken = async (req, res) => {
  try {
    // Si le middleware authenticateToken a réussi, le token est valide
    const userId = req.user.id;
    
    const results = await db.query(
      `SELECT id_utilisateur, nom, prenom, email, matricule, type_utilisateur, statut
       FROM utilisateurs
       WHERE id_utilisateur = $1 AND statut = 'actif'`,
      [userId]
    );

    if (results.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé ou inactif'
      });
    }

    const user = results.rows[0];
    
    // Récupérer le profil
    let profil = null;
    if (user.type_utilisateur === 'enseignant') {
      const enseignants = await db.query(
        'SELECT id_enseignant, niveaux_enseignes, mention_enseignee, parcours_enseignes FROM enseignants WHERE id_utilisateur = $1',
        [userId]
      );
      if (enseignants.rows.length > 0) {
        const enseignant = enseignants.rows[0];
        profil = {
          id_enseignant: enseignant.id_enseignant,
          niveaux_enseignes: enseignant.niveaux_enseignes ? enseignant.niveaux_enseignes.split(',') : [],
          mention_enseignee: enseignant.mention_enseignee,
          parcours_enseignes: enseignant.parcours_enseignes ? enseignant.parcours_enseignes.split(',') : []
        };
      }
    } else if (user.type_utilisateur === 'etudiant') {
      const etudiants = await db.query(
        'SELECT id_etudiant, niveau, mention, parcours FROM etudiants WHERE id_utilisateur = $1',
        [userId]
      );
      if (etudiants.rows.length > 0) {
        const etudiant = etudiants.rows[0];
        profil = {
          id_etudiant: etudiant.id_etudiant,
          niveau: etudiant.niveau,
          mention: etudiant.mention,
          parcours: etudiant.parcours
        };
      }
    }

    res.json({
      success: true,
      message: 'Token valide',
      user: {
        id: user.id_utilisateur,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        matricule: user.matricule,
        type_utilisateur: user.type_utilisateur,
        statut: user.statut,
        profil: profil
      }
    });

  } catch (error) {
    console.error('❌ Erreur vérification token:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  login,
  register,
  getProfile,
  logout,
  verifyToken
};
