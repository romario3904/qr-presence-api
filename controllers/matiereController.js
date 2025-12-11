// controllers/matiereController.js
const db = require('../config/database');

const getTeacherMatieres = async (req, res) => {
  console.log('🔍 Début getTeacherMatieres');
  console.log('User ID:', req.user.id);
  
  try {
    // Récupérer l'ID de l'enseignant
    console.log('📋 Récupération ID enseignant pour utilisateur:', req.user.id);
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    const enseignants = resultEnseignants.rows;
    
    console.log('Résultat recherche enseignant:', enseignants);
    
    if (enseignants.length === 0) {
      console.log('❌ Profil enseignant non trouvé');
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const id_enseignant = enseignants[0].id_enseignant;
    console.log('✅ ID enseignant trouvé:', id_enseignant);

    // Récupérer les matières
    console.log('📋 Récupération des matières pour enseignant:', id_enseignant);
    const queryText = `
      SELECT DISTINCT m.* 
      FROM matieres m
      INNER JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
      WHERE em.id_enseignant = $1
      ORDER BY m.nom_matiere
    `;
    
    console.log('SQL Query:', queryText);
    console.log('Paramètres:', [id_enseignant]);
    
    const resultMatieres = await db.query(queryText, [id_enseignant]);
    const matieres = resultMatieres.rows;

    console.log('✅ Matières trouvées:', matieres.length);
    
    // Log de débogage pour voir les données
    if (matieres.length > 0) {
      console.log('Exemple de matière:', {
        id: matieres[0].id_matiere,
        nom: matieres[0].nom_matiere,
        code: matieres[0].code_matiere,
        colonnes: Object.keys(matiere[0])
      });
    }

    res.json({
      success: true,
      count: matieres.length,
      matieres: matieres
    });
  } catch (error) {
    console.error('❌ Erreur détaillée récupération matières:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    
    // Informations supplémentaires pour le débogage
    console.error('Table matieres existe?');
    try {
      const checkTable = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'matieres'
        )
      `);
      console.error('Table matieres exists:', checkTable.rows[0].exists);
    } catch (e) {
      console.error('Erreur vérification table:', e.message);
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des matières',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      hint: process.env.NODE_ENV === 'development' ? 'Vérifiez la structure de la table matieres' : undefined
    });
  }
};

const getMatiereById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Récupération matière ID:', id);
    
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
    console.error('Erreur récupération matière:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la matière'
    });
  }
};

// Nouvelle fonction pour récupérer toutes les matières (admin)
const getAllMatieres = async (req, res) => {
  try {
    console.log('🔍 Récupération de toutes les matières');
    const resultMatieres = await db.query(
      'SELECT * FROM matieres ORDER BY nom_matiere'
    );
    const matieres = resultMatieres.rows;

    console.log('✅ Toutes matières trouvées:', matieres.length);

    res.json({
      success: true,
      count: matieres.length,
      matieres: matieres
    });
  } catch (error) {
    console.error('Erreur récupération toutes matières:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des matières'
    });
  }
};

// Créer une nouvelle matière
const createMatiere = async (req, res) => {
  let connection;
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
    connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Créer la matière
      const resultMatiere = await connection.query(
        `INSERT INTO matieres (nom_matiere, code_matiere, description, credit, niveau_enseignee, mention_enseignee, parcours_enseignee) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id_matiere, nom_matiere, code_matiere, description, credit, niveau_enseignee, mention_enseignee, parcours_enseignee, created_at`,
        [nom_matiere, code_matiere, description || null, credit || null, niveau_enseignee || null, mention_enseignee || null, parcours_enseignee || null]
      );

      const nouvelleMatiere = resultMatiere.rows[0];

      // Associer la matière à l'enseignant
      await connection.query(
        'INSERT INTO enseignant_matiere (id_enseignant, id_matiere) VALUES ($1, $2)',
        [id_enseignant, nouvelleMatiere.id_matiere]
      );

      await connection.commit();

      console.log('✅ Matière créée:', nouvelleMatiere);

      res.status(201).json({
        success: true,
        message: 'Matière créée avec succès',
        id_matiere: nouvelleMatiere.id_matiere,
        matiere: nouvelleMatiere
      });

    } catch (transactionError) {
      if (connection) await connection.rollback();
      console.error('❌ Erreur transaction création matière:', transactionError);
      throw transactionError;
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (e) {
          console.error('Erreur release connection:', e);
        }
      }
    }

  } catch (error) {
    console.error('❌ Erreur création matière:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la matière',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Mettre à jour une matière
const updateMatiere = async (req, res) => {
  let connection;
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
           niveau_enseignee = $5, mention_enseignee = $6, parcours_enseignee = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_matiere = $8
       RETURNING id_matiere, nom_matiere, code_matiere, description, credit, niveau_enseignee, mention_enseignee, parcours_enseignee, created_at, updated_at`,
      [nom_matiere, code_matiere, description || null, credit || null, niveau_enseignee || null, mention_enseignee || null, parcours_enseignee || null, id]
    );

    if (resultUpdate.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Matière non trouvée'
      });
    }

    console.log('✅ Matière mise à jour:', resultUpdate.rows[0]);

    res.json({
      success: true,
      message: 'Matière mise à jour avec succès',
      matiere: resultUpdate.rows[0]
    });

  } catch (error) {
    console.error('❌ Erreur mise à jour matière:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de la matière'
    });
  }
};

// Ajouter une fonction de suppression
const deleteMatiere = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️  Suppression matière ID:', id);
    
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

    // Supprimer d'abord la liaison
    await db.query(
      'DELETE FROM enseignant_matiere WHERE id_enseignant = $1 AND id_matiere = $2',
      [id_enseignant, id]
    );

    // Puis supprimer la matière
    const resultDelete = await db.query(
      'DELETE FROM matieres WHERE id_matiere = $1 RETURNING id_matiere',
      [id]
    );

    if (resultDelete.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Matière non trouvée après vérification'
      });
    }

    console.log('✅ Matière supprimée:', id);

    res.json({
      success: true,
      message: 'Matière supprimée avec succès',
      id_matiere: id
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
  deleteMatiere  // Ajout de la fonction de suppression
};
