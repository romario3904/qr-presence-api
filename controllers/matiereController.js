// controllers/matiereController.js
const db = require('../config/database');

const getTeacherMatieres = async (req, res) => {
  console.log('🔍 Début récupération matières enseignant');
  console.log('👤 User ID:', req.user?.id);
  
  try {
    // Vérifier la connexion DB
    try {
      await db.query('SELECT 1');
      console.log('✅ Connexion DB OK');
    } catch (dbError) {
      console.error('❌ Connexion DB échouée:', dbError.message);
      return res.status(500).json({
        success: false,
        message: 'Base de données inaccessible',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    // Récupérer l'ID de l'enseignant
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    
    console.log('👨‍🏫 Résultat enseignant:', resultEnseignants.rows);
    
    if (resultEnseignants.rows.length === 0) {
      console.log('⚠️ Aucun profil enseignant trouvé pour:', req.user.id);
      return res.json({
        success: true,
        count: 0,
        matieres: [],
        message: 'Aucun profil enseignant trouvé'
      });
    }

    const id_enseignant = resultEnseignants.rows[0].id_enseignant;

    // Récupérer les matières
    const resultMatieres = await db.query(
      `SELECT DISTINCT m.* 
       FROM matieres m
       INNER JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       WHERE em.id_enseignant = $1
       ORDER BY m.nom_matiere`,
      [id_enseignant]
    );
    
    console.log(`✅ ${resultMatieres.rows.length} matières récupérées`);

    res.json({
      success: true,
      count: resultMatieres.rows.length,
      matieres: resultMatieres.rows
    });
  } catch (error) {
    console.error('❌ Erreur récupération matières:', error);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des matières',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        code: error.code,
        detail: error.detail
      } : undefined
    });
  }
};

const getMatiereById = async (req, res) => {
  console.log('🔍 Récupération matière par ID:', req.params.id);
  
  try {
    const { id } = req.params;
    
    // Récupérer l'ID de l'enseignant
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    
    if (resultEnseignants.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const id_enseignant = resultEnseignants.rows[0].id_enseignant;

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

const getAllMatieres = async (req, res) => {
  console.log('🔍 Récupération toutes les matières');
  
  try {
    const resultMatieres = await db.query(
      'SELECT * FROM matieres ORDER BY nom_matiere'
    );
    
    console.log(`✅ ${resultMatieres.rows.length} matières totales`);

    res.json({
      success: true,
      count: resultMatieres.rows.length,
      matieres: resultMatieres.rows
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

const createMatiere = async (req, res) => {
  console.log('📥 Création matière:', req.body);
  
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
    
    if (resultEnseignants.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const id_enseignant = resultEnseignants.rows[0].id_enseignant;

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

    // Transaction
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Créer la matière
      const resultMatiere = await client.query(
        `INSERT INTO matieres (nom_matiere, code_matiere, description, credit, niveau_enseignee, mention_enseignee, parcours_enseignee) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id_matiere, nom_matiere, code_matiere, description, credit, niveau_enseignee, mention_enseignee, parcours_enseignee`,
        [nom_matiere, code_matiere, description || null, credit || null, niveau_enseignee || null, mention_enseignee || null, parcours_enseignee || null]
      );

      const nouvelleMatiere = resultMatiere.rows[0];

      // Associer la matière à l'enseignant
      await client.query(
        'INSERT INTO enseignant_matiere (id_enseignant, id_matiere) VALUES ($1, $2)',
        [id_enseignant, nouvelleMatiere.id_matiere]
      );

      await client.query('COMMIT');

      console.log('✅ Matière créée:', nouvelleMatiere.id_matiere);

      res.status(201).json({
        success: true,
        message: 'Matière créée avec succès',
        id_matiere: nouvelleMatiere.id_matiere,
        matiere: nouvelleMatiere
      });

    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Erreur création matière:', error);
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la matière',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        code: error.code,
        constraint: error.constraint
      } : undefined
    });
  }
};

const updateMatiere = async (req, res) => {
  console.log('📥 Mise à jour matière:', { id: req.params.id, ...req.body });
  
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
    
    if (resultEnseignants.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const id_enseignant = resultEnseignants.rows[0].id_enseignant;

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

// Nouvelle fonction pour supprimer une matière
const deleteMatiere = async (req, res) => {
  console.log('🗑️ Suppression matière:', req.params.id);
  
  try {
    const { id } = req.params;

    // Récupérer l'ID de l'enseignant
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    
    if (resultEnseignants.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const id_enseignant = resultEnseignants.rows[0].id_enseignant;

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

    // Supprimer la matière
    await db.query(
      'DELETE FROM matieres WHERE id_matiere = $1',
      [id]
    );

    console.log('✅ Matière supprimée:', id);

    res.json({
      success: true,
      message: 'Matière supprimée avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur suppression matière:', error);
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la matière',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getTeacherMatieres,
  getMatiereById,
  getAllMatieres,
  createMatiere,
  updateMatiere,
  deleteMatiere
};
