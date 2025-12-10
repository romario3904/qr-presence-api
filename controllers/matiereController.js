// controllers/matiereController.js
const db = require('../config/database');

const getTeacherMatieres = async (req, res) => {
  try {
    console.log(`👨‍🏫 Récupération matières pour utilisateur ID: ${req.user.id}`);
    
    // Récupérer l'ID de l'enseignant
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    const enseignants = resultEnseignants.rows;
    
    if (enseignants.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const id_enseignant = enseignants[0].id_enseignant;
    console.log(`📚 ID Enseignant: ${id_enseignant}`);

    // Récupérer les matières
    const resultMatieres = await db.query(
      `SELECT DISTINCT m.* 
       FROM matieres m
       INNER JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       WHERE em.id_enseignant = $1
       ORDER BY m.nom_matiere`,
      [id_enseignant]
    );
    const matieres = resultMatieres.rows;

    console.log(`✅ ${matieres.length} matières trouvées pour l'enseignant ${id_enseignant}`);

    res.json({
      success: true,
      count: matieres.length,
      matieres: matieres
    });
  } catch (error) {
    console.error('❌ Erreur récupération matières:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des matières',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getMatiereById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Récupération matière ID: ${id} pour utilisateur: ${req.user.id}`);
    
    // Récupérer l'ID de l'enseignant
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    const enseignants = resultEnseignants.rows;
    
    if (enseignants.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const id_enseignant = enseignants[0].id_enseignant;

    // Vérifier que l'enseignant possède cette matière
    const resultMatiere = await db.query(
      `SELECT m.* 
       FROM matieres m
       INNER JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       WHERE em.id_enseignant = $1 AND m.id_matiere = $2`,
      [id_enseignant, id]
    );
    const matiere = resultMatiere.rows;

    if (matiere.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Matière non trouvée ou non autorisée'
      });
    }

    res.json({
      success: true,
      matiere: matiere[0]
    });
  } catch (error) {
    console.error('❌ Erreur récupération matière:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la matière',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Récupérer toutes les matières (admin)
const getAllMatieres = async (req, res) => {
  try {
    console.log('📋 Récupération de toutes les matières');
    
    const resultMatieres = await db.query(
      'SELECT * FROM matieres ORDER BY nom_matiere'
    );
    const matieres = resultMatieres.rows;

    console.log(`✅ ${matieres.length} matières trouvées`);

    res.json({
      success: true,
      count: matieres.length,
      matieres: matieres
    });
  } catch (error) {
    console.error('❌ Erreur récupération toutes matières:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des matières',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Créer une nouvelle matière - SIMPLIFIÉE sans transaction
const createMatiere = async (req, res) => {
  try {
    const { 
      nom_matiere, 
      code_matiere, 
      description, 
      credit, 
      niveau_enseignee, 
      mention_enseignee, 
      parcours_enseignee 
    } = req.body;

    console.log('📥 Création matière:', req.body);

    // Validation
    if (!nom_matiere || !code_matiere) {
      return res.status(400).json({
        success: false,
        message: 'Le nom et le code de la matière sont obligatoires'
      });
    }

    // Récupérer l'ID de l'enseignant
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    const enseignants = resultEnseignants.rows;
    
    if (enseignants.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const id_enseignant = enseignants[0].id_enseignant;
    console.log(`👨‍🏫 ID enseignant: ${id_enseignant}`);

    // Vérifier si la matière existe déjà
    const existingMatiere = await db.query(
      'SELECT id_matiere FROM matieres WHERE code_matiere = $1',
      [code_matiere]
    );

    if (existingMatiere.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Une matière avec ce code existe déjà'
      });
    }

    // Créer la matière
    const resultMatiere = await db.query(
      `INSERT INTO matieres (nom_matiere, code_matiere, description, credit, niveau_enseignee, mention_enseignee, parcours_enseignee) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id_matiere, nom_matiere, code_matiere, description, credit, niveau_enseignee, mention_enseignee, parcours_enseignee`,
      [nom_matiere, code_matiere, description || null, credit || null, niveau_enseignee || null, mention_enseignee || null, parcours_enseignee || null]
    );

    const nouvelleMatiere = resultMatiere.rows[0];
    console.log(`✅ Matière créée avec ID: ${nouvelleMatiere.id_matiere}`);

    // Associer la matière à l'enseignant
    await db.query(
      'INSERT INTO enseignant_matiere (id_enseignant, id_matiere) VALUES ($1, $2)',
      [id_enseignant, nouvelleMatiere.id_matiere]
    );

    console.log(`🔗 Matière ${nouvelleMatiere.id_matiere} associée à l'enseignant ${id_enseignant}`);

    res.status(201).json({
      success: true,
      message: 'Matière créée avec succès',
      id_matiere: nouvelleMatiere.id_matiere,
      matiere: nouvelleMatiere
    });

  } catch (error) {
    console.error('❌ Erreur création matière:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la matière',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Mettre à jour une matière
const updateMatiere = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nom_matiere, 
      code_matiere, 
      description, 
      credit, 
      niveau_enseignee, 
      mention_enseignee, 
      parcours_enseignee 
    } = req.body;

    console.log('📥 Mise à jour matière ID:', id, 'Données:', req.body);

    // Validation
    if (!nom_matiere || !code_matiere) {
      return res.status(400).json({
        success: false,
        message: 'Le nom et le code de la matière sont obligatoires'
      });
    }

    // Récupérer l'ID de l'enseignant
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    const enseignants = resultEnseignants.rows;
    
    if (enseignants.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const id_enseignant = enseignants[0].id_enseignant;

    // Vérifier que l'enseignant possède cette matière
    const resultMatiere = await db.query(
      `SELECT m.* 
       FROM matieres m
       INNER JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       WHERE em.id_enseignant = $1 AND m.id_matiere = $2`,
      [id_enseignant, id]
    );

    if (resultMatiere.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Matière non trouvée ou non autorisée'
      });
    }

    // Vérifier si le code existe déjà pour une autre matière
    if (code_matiere !== resultMatiere.rows[0].code_matiere) {
      const existingCode = await db.query(
        'SELECT id_matiere FROM matieres WHERE code_matiere = $1 AND id_matiere != $2',
        [code_matiere, id]
      );

      if (existingCode.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Une matière avec ce code existe déjà'
        });
      }
    }

    // Mettre à jour la matière
    const resultUpdate = await db.query(
      `UPDATE matieres 
       SET nom_matiere = $1, code_matiere = $2, description = $3, credit = $4, 
           niveau_enseignee = $5, mention_enseignee = $6, parcours_enseignee = $7
       WHERE id_matiere = $8
       RETURNING id_matiere, nom_matiere, code_matiere, description, credit, niveau_enseignee, mention_enseignee, parcours_enseignee`,
      [nom_matiere, code_matiere, description || null, credit || null, niveau_enseignee || null, mention_enseignee || null, parcours_enseignee || null, id]
    );

    if (resultUpdate.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Matière non trouvée'
      });
    }

    console.log('✅ Matière mise à jour:', id);

    res.json({
      success: true,
      message: 'Matière mise à jour avec succès',
      matiere: resultUpdate.rows[0]
    });

  } catch (error) {
    console.error('❌ Erreur mise à jour matière:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de la matière',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getTeacherMatieres,
  getMatiereById,
  getAllMatieres,
  createMatiere,
  updateMatiere
};
