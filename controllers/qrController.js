// controllers/qrController.js
const db = require('../config/database');

// Fonction pour générer un token QR unique
function generateQRToken() {
  return 'qr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Controller pour générer un QR code
const generateQRCode = async (req, res) => {
  console.log('🎫 Début génération QR code');
  console.log('📥 Body:', req.body);
  console.log('👤 User:', req.user);
  
  let client;
  try {
    const { id_matiere, date_seance, heure_debut, heure_fin, salle } = req.body;

    // Validation
    if (!id_matiere || !date_seance || !heure_debut || !heure_fin || !salle) {
      console.log('❌ Validation échouée:', { id_matiere, date_seance, heure_debut, heure_fin, salle });
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont obligatoires'
      });
    }

    // Vérifier la connexion DB
    try {
      await db.query('SELECT 1');
      console.log('✅ Connexion DB OK');
    } catch (dbError) {
      console.error('❌ Connexion DB échouée:', dbError.message);
      return res.status(500).json({
        success: false,
        message: 'Base de données inaccessible'
      });
    }

    // Récupérer l'ID enseignant
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    
    console.log('👨‍🏫 Résultat enseignants:', resultEnseignants.rows);
    
    if (resultEnseignants.rows.length === 0) {
      console.log('❌ Aucun profil enseignant trouvé');
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const enseignantConnecteId = resultEnseignants.rows[0].id_enseignant;
    console.log('👨‍🏫 ID Enseignant:', enseignantConnecteId);

    // Vérifier que l'enseignant est responsable
    const resultMatiereEnseignant = await db.query(
      `SELECT em.id_enseignant 
       FROM enseignant_matiere em 
       WHERE em.id_enseignant = $1 AND em.id_matiere = $2`,
      [enseignantConnecteId, id_matiere]
    );
    
    console.log('📚 Résultat vérification matière:', resultMatiereEnseignant.rows);

    if (resultMatiereEnseignant.rows.length === 0) {
      console.log('❌ Enseignant non responsable de la matière');
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas responsable de cette matière'
      });
    }

    // Vérifier les conflits
    const resultSeancesConflit = await db.query(
      `SELECT id_seance FROM seances_cours 
       WHERE id_matiere = $1 AND date_seance = $2 AND salle = $3
       AND ((heure_debut BETWEEN $4 AND $5) OR (heure_fin BETWEEN $6 AND $7))`,
      [id_matiere, date_seance, salle, heure_debut, heure_fin, heure_debut, heure_fin]
    );
    
    console.log('⚠️ Conflits potentiels:', resultSeancesConflit.rows);

    if (resultSeancesConflit.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Conflit de séance'
      });
    }

    // Générer token
    const qrToken = generateQRToken();
    const qrExpire = new Date(Date.now() + 2 * 60 * 60 * 1000);
    console.log('🔐 Token généré:', qrToken);
    console.log('⏰ Expire à:', qrExpire);

    // Transaction
    client = await db.getClient();
    await client.query('BEGIN');

    try {
      // Créer la séance
      const result = await client.query(
        `INSERT INTO seances_cours (id_matiere, date_seance, heure_debut, heure_fin, salle, qr_code, qr_expire) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_seance`,
        [id_matiere, date_seance, heure_debut, heure_fin, salle, qrToken, qrExpire]
      );

      const seanceId = result.rows[0].id_seance;
      console.log('✅ Séance créée avec ID:', seanceId);

      // Récupérer les infos complètes
      const resultSeanceInfo = await client.query(
        `SELECT s.*, m.nom_matiere, m.code_matiere, e.nom as enseignant_nom, e.prenom as enseignant_prenom
         FROM seances_cours s 
         JOIN matieres m ON s.id_matiere = m.id_matiere 
         JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
         JOIN enseignants e ON em.id_enseignant = e.id_enseignant
         WHERE s.id_seance = $1 AND em.id_enseignant = $2`,
        [seanceId, enseignantConnecteId]
      );
      
      const seanceInfo = resultSeanceInfo.rows;
      console.log('📊 Infos séance:', seanceInfo);

      if (seanceInfo.length === 0) {
        throw new Error('Séance créée mais informations non trouvées');
      }

      await client.query('COMMIT');

      console.log('✅ QR généré pour séance:', seanceId);

      res.json({
        success: true,
        message: 'QR code généré avec succès',
        seance: seanceInfo[0],
        qrToken: qrToken,
        qrExpire: qrExpire,
        qrData: {
          id_seance: seanceId,
          token: qrToken,
          expires: qrExpire
        }
      });

    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      if (client) client.release();
    }

  } catch (error) {
    console.error('❌ Erreur génération QR:', error);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du QR code',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        code: error.code,
        constraint: error.constraint
      } : undefined
    });
  }
};

// Controller pour récupérer les séances d'un enseignant
const getTeacherSeances = async (req, res) => {
  console.log('📅 Début récupération séances enseignant');
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
        message: 'Base de données inaccessible'
      });
    }

    // Récupérer l'ID de l'enseignant
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    
    console.log('👨‍🏫 Résultat enseignants:', resultEnseignants.rows);
    
    if (resultEnseignants.rows.length === 0) {
      console.log('⚠️ Aucun profil enseignant trouvé');
      return res.json({
        success: true,
        seances: [],
        message: 'Aucun profil enseignant trouvé'
      });
    }

    const enseignantId = resultEnseignants.rows[0].id_enseignant;
    console.log('👨‍🏫 ID Enseignant pour séances:', enseignantId);

    // Récupérer les séances
    const resultSeances = await db.query(
      `SELECT s.*, m.nom_matiere, m.code_matiere,
              COUNT(p.id_presence) as nombre_presents
       FROM seances_cours s
       JOIN matieres m ON s.id_matiere = m.id_matiere
       JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       LEFT JOIN presence p ON s.id_seance = p.id_seance
       WHERE em.id_enseignant = $1
       GROUP BY s.id_seance, m.nom_matiere, m.code_matiere
       ORDER BY s.date_seance DESC, s.heure_debut DESC`,
      [enseignantId]
    );
    
    const seances = resultSeances.rows;
    console.log(`✅ ${seances.length} séances récupérées pour l'enseignant ${enseignantId}`);

    res.json({
      success: true,
      seances: seances
    });

  } catch (error) {
    console.error('❌ Erreur récupération séances:', error);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des séances',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        code: error.code,
        detail: error.detail
      } : undefined
    });
  }
};

// Les autres fonctions restent similaires mais ajoutez des logs...
// verifyQRCode, scanQRCode, getStudentPresences, getStudentPresencesById

module.exports = {
  generateQRCode,
  verifyQRCode,
  scanQRCode,
  getTeacherSeances,
  getStudentPresences,
  getStudentPresencesById
};
