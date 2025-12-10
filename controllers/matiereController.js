// controllers/matiereController.js - VERSION SIMPLIFIÉE ET CORRIGÉE
const db = require('../config/database');

// Récupérer toutes les matières de l'enseignant
const getTeacherMatieres = async (req, res) => {
  try {
    console.log('🔄 SIMPLE - Récupération matières démarrée pour utilisateur:', req.user?.id);
    
    // OPTION: Tenter de récupérer avec requête simple
    try {
      // Vérifier si la table existe
      const tableExists = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'matieres'
        )
      `);
      
      if (!tableExists.rows[0].exists) {
        console.log('⚠️ Table matieres n\'existe pas');
        return res.json({ 
          success: true, 
          count: 0, 
          matieres: [] 
        });
      }
      
      // Vérifier si la table enseignant_matiere existe
      const tableEnseignantMatiereExists = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'enseignant_matiere'
        )
      `);
      
      if (tableEnseignantMatiereExists.rows[0].exists) {
        // Version avec relation enseignant-matière
        try {
          // Récupérer l'ID de l'enseignant si disponible
          if (req.user && req.user.id) {
            const resultEnseignants = await db.query(
              'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
              [req.user.id]
            );
            
            if (resultEnseignants.rows.length > 0) {
              const id_enseignant = resultEnseignants.rows[0].id_enseignant;
              
              const resultMatieres = await db.query(
                `SELECT DISTINCT m.* 
                 FROM matieres m
                 INNER JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
                 WHERE em.id_enseignant = $1
                 ORDER BY m.nom_matiere`,
                [id_enseignant]
              );
              
              console.log(`✅ ${resultMatieres.rows.length} matières trouvées pour enseignant ${id_enseignant}`);
              
              return res.json({
                success: true,
                count: resultMatieres.rows.length,
                matieres: resultMatieres.rows
              });
            }
          }
        } catch (joinError) {
          console.log('⚠️ Erreur jointure enseignant_matiere:', joinError.message);
          // Continuer avec la requête simple
        }
      }
      
      // Table existe mais pas de relation ou erreur, récupérer toutes les matières
      const result = await db.query(`
        SELECT id_matiere, nom_matiere, code_matiere, 
               description, credit, niveau_enseignee,
               mention_enseignee, parcours_enseignee,
               created_at
        FROM matieres 
        ORDER BY nom_matiere
      `);
      
      console.log(`✅ ${result.rows.length} matières trouvées (toutes)`);
      
      return res.json({
        success: true,
        count: result.rows.length,
        matieres: result.rows
      });
      
    } catch (queryError) {
      console.log('⚠️ Erreur requête simple:', queryError.message);
      
      // En cas d'erreur, retourner un tableau vide
      return res.json({ 
        success: true, 
        count: 0, 
        matieres: [] 
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur globale récupération matières:', error.message);
    
    // TOUJOURS retourner un format valide
    res.json({
      success: true,
      count: 0,
      matieres: []
    });
  }
};

// Créer une nouvelle matière - VERSION SIMPLIFIÉE
const createMatiere = async (req, res) => {
  try {
    console.log('📥 Création matière - Données reçues:', req.body);
    console.log('👤 Utilisateur:', req.user);
    
    const { 
      nom_matiere, 
      code_matiere, 
      description, 
      credit, 
      niveau_enseignee, 
      mention_enseignee, 
      parcours_enseignee 
    } = req.body;

    // Validation basique
    if (!nom_matiere || !code_matiere) {
      return res.status(400).json({
        success: false,
        message: 'Le nom et le code de la matière sont obligatoires'
      });
    }

    // Vérifier si la table existe
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'matieres'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('⚠️ Table matieres n\'existe pas, création...');
      // Créer la table si elle n'existe pas
      await db.query(`
        CREATE TABLE IF NOT EXISTS matieres (
          id_matiere SERIAL PRIMARY KEY,
          nom_matiere VARCHAR(255) NOT NULL,
          code_matiere VARCHAR(50) UNIQUE NOT NULL,
          description TEXT,
          credit INTEGER,
          niveau_enseignee VARCHAR(50),
          mention_enseignee VARCHAR(100),
          parcours_enseignee VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Table matieres créée');
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

    // Créer la matière directement
    const result = await db.query(
      `INSERT INTO matieres (nom_matiere, code_matiere, description, credit, 
        niveau_enseignee, mention_enseignee, parcours_enseignee) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        nom_matiere, 
        code_matiere, 
        description || null, 
        credit ? parseInt(credit) : null, 
        niveau_enseignee || null, 
        mention_enseignee || null, 
        parcours_enseignee || null
      ]
    );

    const nouvelleMatiere = result.rows[0];
    console.log('✅ Matière créée avec ID:', nouvelleMatiere.id_matiere);

    // Associer à l'enseignant si disponible
    if (req.user && req.user.id) {
      try {
        // Vérifier si la table enseignant_matiere existe
        const tableEnseignantMatiereExists = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'enseignant_matiere'
          )
        `);
        
        if (!tableEnseignantMatiereExists.rows[0].exists) {
          // Créer la table si elle n'existe pas
          await db.query(`
            CREATE TABLE IF NOT EXISTS enseignant_matiere (
              id_enseignant INTEGER NOT NULL,
              id_matiere INTEGER NOT NULL,
              date_assignation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id_enseignant, id_matiere)
            )
          `);
        }
        
        // Récupérer l'ID de l'enseignant
        const resultEnseignants = await db.query(
          'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
          [req.user.id]
        );
        
        if (resultEnseignants.rows.length > 0) {
          const id_enseignant = resultEnseignants.rows[0].id_enseignant;
          
          await db.query(
            'INSERT INTO enseignant_matiere (id_enseignant, id_matiere) VALUES ($1, $2)',
            [id_enseignant, nouvelleMatiere.id_matiere]
          );
          
          console.log(`🔗 Matière associée à l'enseignant ${id_enseignant}`);
        }
      } catch (associationError) {
        console.log('⚠️ Erreur association enseignant:', associationError.message);
        // Continuer même si l'association échoue
      }
    }

    res.status(201).json({
      success: true,
      message: 'Matière créée avec succès',
      matiere: nouvelleMatiere
    });

  } catch (error) {
    console.error('❌ Erreur création matière:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    });
    
    // Gestion des erreurs courantes
    if (error.code === '23505') { // Violation d'unicité
      return res.status(400).json({
        success: false,
        message: 'Une matière avec ce code existe déjà'
      });
    }
    
    if (error.message.includes('relation "matieres" does not exist')) {
      return res.status(500).json({
        success: false,
        message: 'La table matieres n\'existe pas dans la base de données'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la matière',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Récupérer une matière spécifique
const getMatiereById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Récupération matière ID:', id);
    
    const result = await db.query(
      'SELECT * FROM matieres WHERE id_matiere = $1', 
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Matière non trouvée' 
      });
    }
    
    res.json({ 
      success: true, 
      matiere: result.rows[0] 
    });
  } catch (error) {
    console.error('❌ Erreur récupération matière:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Récupérer toutes les matières (admin)
const getAllMatieres = async (req, res) => {
  try {
    console.log('📋 Récupération de toutes les matières');
    
    // Vérifier si la table existe
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'matieres'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      return res.json({ 
        success: true, 
        count: 0, 
        matieres: [] 
      });
    }
    
    const result = await db.query(
      'SELECT * FROM matieres ORDER BY nom_matiere'
    );
    
    console.log(`✅ ${result.rows.length} matières trouvées (toutes)`);
    
    res.json({ 
      success: true, 
      count: result.rows.length, 
      matieres: result.rows 
    });
  } catch (error) {
    console.error('❌ Erreur récupération toutes matières:', error);
    res.json({ 
      success: true, 
      count: 0, 
      matieres: [],
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Mettre à jour une matière
const updateMatiere = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📥 Mise à jour matière ID:', id, 'Données:', req.body);
    
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

    // Vérifier si le code existe déjà pour une autre matière
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

    // Mettre à jour la matière
    const result = await db.query(
      `UPDATE matieres 
       SET nom_matiere = $1, code_matiere = $2, description = $3, credit = $4,
           niveau_enseignee = $5, mention_enseignee = $6, parcours_enseignee = $7
       WHERE id_matiere = $8 
       RETURNING *`,
      [
        nom_matiere, 
        code_matiere, 
        description || null, 
        credit ? parseInt(credit) : null, 
        niveau_enseignee || null, 
        mention_enseignee || null, 
        parcours_enseignee || null, 
        id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Matière non trouvée' 
      });
    }
    
    console.log('✅ Matière mise à jour:', id);
    
    res.json({ 
      success: true, 
      message: 'Matière mise à jour avec succès', 
      matiere: result.rows[0] 
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

// Fonction pour supprimer une matière
const deleteMatiere = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ Suppression matière ID:', id);
    
    // D'abord supprimer les relations dans enseignant_matiere
    try {
      await db.query(
        'DELETE FROM enseignant_matiere WHERE id_matiere = $1',
        [id]
      );
    } catch (relationError) {
      console.log('⚠️ Erreur suppression relations:', relationError.message);
      // Continuer même si la table n'existe pas
    }
    
    // Puis supprimer la matière
    const result = await db.query(
      'DELETE FROM matieres WHERE id_matiere = $1 RETURNING id_matiere',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Matière non trouvée' 
      });
    }
    
    console.log('✅ Matière supprimée:', id);
    
    res.json({ 
      success: true, 
      message: 'Matière supprimée avec succès' 
    });
  } catch (error) {
    console.error('❌ Erreur suppression matière:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la suppression de la matière' 
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
