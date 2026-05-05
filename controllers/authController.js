// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Controller pour l'inscription (VERSION CORRIGÉE)
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

    // Validation des champs obligatoires
    if (!nom || !prenom || !email || !matricule || !mot_de_passe || !role) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs obligatoires sont requis'
      });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUsers = await db.query(
      'SELECT id_utilisateur FROM utilisateurs WHERE email = $1 OR matricule = $2',
      [email, matricule]
    );

    if (existingUsers.rows.length > 0) {
      const existingUser = existingUsers.rows[0];
      // Pour savoir lequel existe, on refait une requête spécifique
      const emailCheck = await db.query('SELECT id_utilisateur FROM utilisateurs WHERE email = $1', [email]);
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Un utilisateur avec cet email existe déjà'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Un utilisateur avec ce matricule existe déjà'
      });
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
      
      if (!userResult.rows || userResult.rows.length === 0) {
        throw new Error('Échec de la création de l\'utilisateur');
      }
      
      const user = userResult.rows[0];
      console.log('✅ Utilisateur créé, ID:', user.id_utilisateur);

      // Créer le profil selon le rôle
      if (role === 'enseignant') {
        const niveauxStr = Array.isArray(niveaux_enseignes) ? niveaux_enseignes.join(',') : (niveaux_enseignes || '');
        const parcoursStr = Array.isArray(parcours_enseignes) ? parcours_enseignes.join(',') : (parcours_enseignes || '');
        
        await connection.query(
          `INSERT INTO enseignants (matricule, nom, prenom, id_utilisateur, niveaux_enseignes, mention_enseignee, parcours_enseignes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [matricule, nom, prenom, user.id_utilisateur, niveauxStr, mention_enseignee || '', parcoursStr]
        );
        console.log('✅ Profil enseignant créé');
        
      } else if (role === 'etudiant') {
        await connection.query(
          `INSERT INTO etudiants (matricule, nom, prenom, niveau, mention, parcours, id_utilisateur) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [matricule, nom, prenom, niveau || 'L1', mention || 'Informatique', parcours || 'GB', user.id_utilisateur]
        );
        console.log('✅ Profil étudiant créé');
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
        user: {
          id: user.id_utilisateur,
          nom: user.nom,
          prenom: user.prenom,
          email: user.email,
          matricule: user.matricule,
          type_utilisateur: user.type_utilisateur,
          statut: user.statut
        },
        token
      });

    } catch (transactionError) {
      if (connection) await connection.rollback();
      console.error('❌ Erreur transaction:', transactionError);
      throw transactionError;
    } finally {
      if (connection) connection.release();
    }

  } catch (error) {
    console.error('❌ Erreur inscription détaillée:', error);
    console.error('Stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du compte: ' + error.message
    });
  }
};

// Controller pour la connexion (VERSION CORRIGÉE)
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

    const result = await db.query(
      `SELECT id_utilisateur, nom, prenom, email, matricule, mot_de_passe, type_utilisateur, statut 
       FROM utilisateurs 
       WHERE matricule = $1 AND statut = 'actif'`,
      [matricule]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Matricule ou mot de passe incorrect'
      });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Matricule ou mot de passe incorrect'
      });
    }

    // Récupérer le profil
    let profil = null;
    if (user.type_utilisateur === 'enseignant') {
      const enseignantResult = await db.query(
        'SELECT id_enseignant, niveaux_enseignes, mention_enseignee, parcours_enseignes FROM enseignants WHERE id_utilisateur = $1',
        [user.id_utilisateur]
      );
      if (enseignantResult.rows.length > 0) {
        const enseignant = enseignantResult.rows[0];
        profil = { 
          id_enseignant: enseignant.id_enseignant,
          niveaux_enseignes: enseignant.niveaux_enseignes ? enseignant.niveaux_enseignes.split(',') : [],
          mention_enseignee: enseignant.mention_enseignee,
          parcours_enseignes: enseignant.parcours_enseignes ? enseignant.parcours_enseignes.split(',') : []
        };
      }
    } else if (user.type_utilisateur === 'etudiant') {
      const etudiantResult = await db.query(
        'SELECT id_etudiant, niveau, mention, parcours FROM etudiants WHERE id_utilisateur = $1',
        [user.id_utilisateur]
      );
      if (etudiantResult.rows.length > 0) {
        const etudiant = etudiantResult.rows[0];
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
      message: 'Erreur serveur lors de la connexion: ' + error.message
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT id_utilisateur, nom, prenom, email, matricule, type_utilisateur, statut, date_creation
       FROM utilisateurs
       WHERE id_utilisateur = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const user = result.rows[0];
    
    let profil = null;
    if (user.type_utilisateur === 'enseignant') {
      const enseignantResult = await db.query(
        'SELECT id_enseignant, niveaux_enseignes, mention_enseignee, parcours_enseignes FROM enseignants WHERE id_utilisateur = $1',
        [userId]
      );
      if (enseignantResult.rows.length > 0) {
        const enseignant = enseignantResult.rows[0];
        profil = {
          id_enseignant: enseignant.id_enseignant,
          niveaux_enseignes: enseignant.niveaux_enseignes ? enseignant.niveaux_enseignes.split(',') : [],
          mention_enseignee: enseignant.mention_enseignee,
          parcours_enseignes: enseignant.parcours_enseignes ? enseignant.parcours_enseignes.split(',') : []
        };
      }
    } else if (user.type_utilisateur === 'etudiant') {
      const etudiantResult = await db.query(
        'SELECT id_etudiant, niveau, mention, parcours FROM etudiants WHERE id_utilisateur = $1',
        [userId]
      );
      if (etudiantResult.rows.length > 0) {
        const etudiant = etudiantResult.rows[0];
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
      user: { ...user, profil }
    });
  } catch (error) {
    console.error('❌ Erreur récupération profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

const logout = (req, res) => {
  res.json({ success: true, message: 'Déconnexion réussie' });
};

const verifyToken = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      `SELECT id_utilisateur, nom, prenom, email, matricule, type_utilisateur, statut
       FROM utilisateurs
       WHERE id_utilisateur = $1 AND statut = 'actif'`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé ou inactif'
      });
    }

    const user = result.rows[0];
    
    let profil = null;
    if (user.type_utilisateur === 'enseignant') {
      const enseignantResult = await db.query(
        'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
        [userId]
      );
      if (enseignantResult.rows.length > 0) {
        profil = { id_enseignant: enseignantResult.rows[0].id_enseignant };
      }
    } else if (user.type_utilisateur === 'etudiant') {
      const etudiantResult = await db.query(
        'SELECT id_etudiant FROM etudiants WHERE id_utilisateur = $1',
        [userId]
      );
      if (etudiantResult.rows.length > 0) {
        profil = { id_etudiant: etudiantResult.rows[0].id_etudiant };
      }
    }

    res.json({
      success: true,
      message: 'Token valide',
      user: { ...user, profil }
    });

  } catch (error) {
    console.error('❌ Erreur vérification token:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification'
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