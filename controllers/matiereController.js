// controllers/matiereController.js
const db = require('../config/database');

// Fonction pour récupérer toutes les matières (pour enseignant et admin)
const getAllMatieres = async (req, res) => {
  try {
    console.log('📥 Récupération des matières pour user:', req.user);
    
    // Vérifier le rôle de l'utilisateur
    if (req.user.role === 'admin') {
      // Admin peut voir toutes les matières
      const resultMatieres = await db.query(
        'SELECT * FROM matieres ORDER BY nom_matiere'
      );
      const matieres = resultMatieres.rows;

      return res.json({
        success: true,
        count: matieres.length,
        matieres: matieres
      });
    } else if (req.user.role === 'enseignant') {
      // Enseignant - Vérifier s'il existe dans la table enseignants
      const resultEnseignant = await db.query(
        'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
        [req.user.id]
      );
      
      if (resultEnseignant.rows.length === 0) {
        // Si l'enseignant n'existe pas encore, retourner un tableau vide
        console.log('⚠️ Enseignant non trouvé dans la table enseignants');
        return res.json({
          success: true,
          count: 0,
          matieres: []
        });
      }

      const id_enseignant = resultEnseignant.rows[0].id_enseignant;
      
      // Récupérer les matières de l'enseignant
      const resultMatieres = await db.query(
        `SELECT m.* 
         FROM matieres m
         LEFT JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
         WHERE em.id_enseignant = $1 OR m.est_public = true
         ORDER BY m.nom_matiere`,
        [id_enseignant]
      );
      const matieres = resultMatieres.rows;

      return res.json({
        success: true,
        count: matieres.length,
        matieres: matieres
      });
    } else {
      // Autres rôles (étudiant, etc.)
      const resultMatieres = await db.query(
        'SELECT * FROM matieres WHERE est_public = true ORDER BY nom_matiere'
      );
      const matieres = resultMatieres.rows;

      return res.json({
        success: true,
        count: matieres.length,
        matieres: matieres
      });
    }
  } catch (error) {
    console.error('❌ Erreur récupération matières:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des matières',
      error: error.message
    });
  }
};

const getMatiereById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Récupérer la matière
    const resultMatiere = await db.query(
      'SELECT * FROM matieres WHERE id_matiere = $1',
      [id]
    );
    
    if (resultMatiere.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Matière non trouvée'
      });
    }

    const matiere = resultMatiere.rows[0];

    // Vérifier les autorisations
    if (req.user.role === 'enseignant') {
      const resultEnseignant = await db.query(
        'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
        [req.user.id]
      );
      
      if (resultEnseignant.rows.length > 0) {
        const id_enseignant = resultEnseignant.rows[0].id_enseignant;
        
        // Vérifier si l'enseignant a accès à cette matière
        const resultAccess = await db.query(
          'SELECT * FROM enseignant_matiere WHERE id_enseignant = $1 AND id_matiere = $2',
          [id_enseignant, id]
        );
        
        // Si la matière n'est pas publique et que l'enseignant n'y a pas accès
        if (resultAccess.rows.length === 0 && !matiere.est_public) {
          return res.status(403).json({
            success: false,
            message: 'Accès non autorisé à cette matière'
          });
        }
      }
    }

    res.json({
      success: true,
      matiere: matiere
    });
  } catch (error) {
    console.error('❌ Erreur récupération matière:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la matière'
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
      `INSERT INTO matieres 
       (nom_matiere, code_matiere, description, credit, niveau_enseignee, mention_enseignee, parcours_enseignee, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING id_matiere, nom_matiere, code_matiere, description, credit, niveau_enseignee, mention_enseignee, parcours_enseignee`,
      [
        nom_matiere, 
        code_matiere, 
        description || null, 
        credit || null, 
        niveau_enseignee || null, 
        mention_enseignee || null, 
        parcours_enseignee || null,
        req.user.id
      ]
    );

    const nouvelleMatiere = resultMatiere.rows[0];

    // Si l'utilisateur est un enseignant, associer la matière
    if (req.user.role === 'enseignant') {
      const resultEnseignant = await db.query(
        'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
        [req.user.id]
      );
      
      if (resultEnseignant.rows.length > 0) {
        const id_enseignant = resultEnseignant.rows[0].id_enseignant;
        
        await db.query(
          'INSERT INTO enseignant_matiere (id_enseignant, id_matiere) VALUES ($1, $2)',
          [id_enseignant, nouvelleMatiere.id_matiere]
        );
      }
    }

    console.log('✅ Matière créée:', nouvelleMatiere.id_matiere);

    res.status(201).json({
      success: true,
      message: 'Matière créée avec succès',
      matiere: nouvelleMatiere
    });

  } catch (error) {
    console.error('❌ Erreur création matière:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la matière',
      error: error.message
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

    console.log('📥 Mise à jour matière:', { id, ...req.body });

    // Validation
    if (!nom_matiere || !code_matiere) {
      return res.status(400).json({
        success: false,
        message: 'Le nom et le code de la matière sont obligatoires'
      });
    }

    // Vérifier si la matière existe
    const existingMatiere = await db.query(
      'SELECT * FROM matieres WHERE id_matiere = $1',
      [id]
    );

    if (existingMatiere.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Matière non trouvée'
      });
    }

    // Vérifier les autorisations
    if (req.user.role === 'enseignant') {
      // Vérifier si l'enseignant a créé cette matière
      if (existingMatiere.rows[0].created_by !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à modifier cette matière'
        });
      }
    }

    // Vérifier si le code existe déjà pour une autre matière
    if (code_matiere !== existingMatiere.rows[0].code_matiere) {
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
       RETURNING id_matiere, nom_matiere, code_matiere, description, credit, 
                 niveau_enseignee, mention_enseignee, parcours_enseignee`,
      [
        nom_matiere, 
        code_matiere, 
        description || null, 
        credit || null, 
        niveau_enseignee || null, 
        mention_enseignee || null, 
        parcours_enseignee || null, 
        id
      ]
    );

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
      error: error.message
    });
  }
};

// Supprimer une matière (NOUVELLE FONCTION)
const deleteMatiere = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Suppression matière:', id);

    // Vérifier si la matière existe
    const existingMatiere = await db.query(
      'SELECT * FROM matieres WHERE id_matiere = $1',
      [id]
    );

    if (existingMatiere.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Matière non trouvée'
      });
    }

    // Vérifier les autorisations
    if (req.user.role === 'enseignant') {
      // Vérifier si l'enseignant a créé cette matière
      if (existingMatiere.rows[0].created_by !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à supprimer cette matière'
        });
      }
    }

    // Supprimer d'abord les relations dans enseignant_matiere
    await db.query(
      'DELETE FROM enseignant_matiere WHERE id_matiere = $1',
      [id]
    );

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
      error: error.message
    });
  }
};

// Fonction pour récupérer les matières d'un enseignant spécifique (compatibilité)
const getTeacherMatieres = async (req, res) => {
  try {
    // Appeler getAllMatieres qui gère déjà la logique
    return await getAllMatieres(req, res);
  } catch (error) {
    console.error('❌ Erreur getTeacherMatieres:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des matières'
    });
  }
};

module.exports = {
  getAllMatieres,
  getMatiereById,
  createMatiere,
  updateMatiere,
  deleteMatiere,
  getTeacherMatieres
};
