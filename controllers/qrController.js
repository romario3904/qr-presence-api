// controllers/qrController.js (VERSION CORRIGÉE)
const db = require('../config/database');

// Fonction pour générer un token QR unique
function generateQRToken() {
  return 'qr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Controller pour générer un QR code
const generateQRCode = async (req, res) => {
  let connection;
  try {
    const { id_matiere, date_seance, heure_debut, heure_fin, salle } = req.body;

    console.log('📥 Génération QR:', req.body);

    // Validation
    if (!id_matiere || !date_seance || !heure_debut || !heure_fin || !salle) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont obligatoires'
      });
    }

    // Récupérer l'ID enseignant
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

    const enseignantConnecteId = enseignants[0].id_enseignant;

    // Vérifier que l'enseignant est responsable
    const resultMatiereEnseignant = await db.query(
      `SELECT em.id_enseignant 
       FROM enseignant_matiere em 
       WHERE em.id_enseignant = $1 AND em.id_matiere = $2`,
      [enseignantConnecteId, id_matiere]
    );
    const matiereEnseignant = resultMatiereEnseignant.rows;

    if (matiereEnseignant.length === 0) {
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
    const seancesConflit = resultSeancesConflit.rows;

    if (seancesConflit.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Conflit de séance'
      });
    }

    // Générer token
    const qrToken = generateQRToken();
    const qrExpire = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 heures

    // Transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Créer la séance
      const result = await connection.query(
        `INSERT INTO seances_cours (id_matiere, date_seance, heure_debut, heure_fin, salle, qr_code, qr_expire) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_seance`,
        [id_matiere, date_seance, heure_debut, heure_fin, salle, qrToken, qrExpire]
      );

      const seanceId = result.rows[0].id_seance;

      // Récupérer les infos complètes
      const resultSeanceInfo = await connection.query(
        `SELECT s.*, m.nom_matiere, m.code_matiere, e.nom as enseignant_nom, e.prenom as enseignant_prenom
         FROM seances_cours s 
         JOIN matieres m ON s.id_matiere = m.id_matiere 
         JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
         JOIN enseignants e ON em.id_enseignant = e.id_enseignant
         WHERE s.id_seance = $1 AND em.id_enseignant = $2`,
        [seanceId, enseignantConnecteId]
      );
      const seanceInfo = resultSeanceInfo.rows;

      if (seanceInfo.length === 0) {
        throw new Error('Séance créée mais informations non trouvées');
      }

      await connection.commit();

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
      if (connection) await connection.rollback();
      throw transactionError;
    } finally {
      if (connection) connection.release();
    }

  } catch (error) {
    console.error('❌ Erreur génération QR:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du QR code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Controller pour vérifier un QR code
const verifyQRCode = async (req, res) => {
  try {
    const qrToken = req.body.qr_token || req.body.qr_data;

    if (!qrToken) {
      return res.status(400).json({
        success: false,
        message: 'Token QR manquant'
      });
    }

    console.log('🔍 Vérification QR token:', qrToken);

    // Vérifier le token
    const resultSeances = await db.query(
      `SELECT s.*, m.nom_matiere, m.code_matiere, e.nom as enseignant_nom, e.prenom as enseignant_prenom
       FROM seances_cours s
       JOIN matieres m ON s.id_matiere = m.id_matiere
       JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       JOIN enseignants e ON em.id_enseignant = e.id_enseignant
       WHERE s.qr_code = $1 AND s.qr_expire > NOW()`,
      [qrToken]
    );
    const seances = resultSeances.rows;

    if (seances.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'QR code invalide ou expiré'
      });
    }

    const seance = seances[0];

    // Récupérer l'étudiant
    const resultEtudiants = await db.query(
      'SELECT id_etudiant FROM etudiants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    const etudiants = resultEtudiants.rows;
    
    if (etudiants.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Profil étudiant non trouvé'
      });
    }

    const etudiantId = etudiants[0].id_etudiant;

    // Vérifier si déjà présent (table corrigée: presences au lieu de presence)
    const resultPresences = await db.query(
      'SELECT id_presence FROM presences WHERE id_seance = $1 AND id_etudiant = $2',
      [seance.id_seance, etudiantId]
    );
    const presences = resultPresences.rows;

    if (presences.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Vous êtes déjà marqué présent pour cette séance',
        presence: presences[0]
      });
    }

    // Calculer le statut
    const heureActuelle = new Date();
    const heureSeance = new Date(`${seance.date_seance}T${seance.heure_debut}`);
    const retardMinutes = Math.floor((heureActuelle - heureSeance) / (1000 * 60));
    
    let statut = 'present';
    if (retardMinutes > 15) statut = 'retard';
    if (retardMinutes > 60) statut = 'absent';

    // Marquer la présence (table corrigée)
    const resultInsert = await db.query(
      `INSERT INTO presences (id_seance, id_etudiant, id_matiere, statut) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [seance.id_seance, etudiantId, seance.id_matiere, statut]
    );

    console.log(`✅ Étudiant ${etudiantId} marqué ${statut} pour séance ${seance.id_seance}`);

    res.json({
      success: true,
      message: 'Présence enregistrée avec succès',
      statut: statut,
      heure_pointage: new Date().toISOString(),
      seance: {
        id_seance: seance.id_seance,
        nom_matiere: seance.nom_matiere,
        code_matiere: seance.code_matiere,
        date_seance: seance.date_seance,
        heure_debut: seance.heure_debut,
        heure_fin: seance.heure_fin,
        salle: seance.salle,
        enseignant: `${seance.enseignant_prenom} ${seance.enseignant_nom}`
      }
    });

  } catch (error) {
    console.error('❌ Erreur vérification QR:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification du QR code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Controller pour scanner un QR code
const scanQRCode = async (req, res) => {
  try {
    const { id_seance, id_etudiant, qr_data, qr_token } = req.body;
    
    console.log('📥 Scan direct:', req.body);
    
    if (!id_seance || !id_etudiant) {
      return res.status(400).json({
        success: false,
        message: 'ID séance et ID étudiant sont requis'
      });
    }
    
    // Vérifier la séance
    const resultSeances = await db.query(
      `SELECT s.*, m.nom_matiere, m.code_matiere 
       FROM seances_cours s
       LEFT JOIN matieres m ON s.id_matiere = m.id_matiere
       WHERE s.id_seance = $1`,
      [id_seance]
    );
    const seances = resultSeances.rows;
    
    if (seances.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Séance non trouvée'
      });
    }
    
    const seance = seances[0];
    
    // Vérifier l'étudiant
    const resultEtudiants = await db.query(
      'SELECT * FROM etudiants WHERE id_etudiant = $1',
      [id_etudiant]
    );
    const etudiants = resultEtudiants.rows;
    
    if (etudiants.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Étudiant non trouvé'
      });
    }
    
    // Vérifier si déjà présent (table corrigée)
    const resultPresences = await db.query(
      'SELECT * FROM presences WHERE id_seance = $1 AND id_etudiant = $2',
      [id_seance, id_etudiant]
    );
    const presences = resultPresences.rows;
    
    if (presences.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Vous avez déjà pointé votre présence pour cette séance',
        statut: presences[0].statut,
        heure_pointage: presences[0].date_scan
      });
    }
    
    // Calculer le statut
    const heureActuelle = new Date();
    const heureSeance = new Date(`${seance.date_seance}T${seance.heure_debut}`);
    const retardMinutes = Math.floor((heureActuelle - heureSeance) / (1000 * 60));
    
    let statut = 'present';
    if (retardMinutes > 15) statut = 'retard';
    if (retardMinutes > 60) statut = 'absent';
    
    // Enregistrer (table corrigée)
    const resultInsert = await db.query(
      `INSERT INTO presences (id_seance, id_etudiant, id_matiere, statut) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id_seance, id_etudiant, seance.id_matiere, statut]
    );
    
    res.json({
      success: true,
      message: 'Présence enregistrée avec succès',
      statut: statut,
      heure_pointage: new Date().toISOString(),
      seance: {
        id_seance: seance.id_seance,
        nom_matiere: seance.nom_matiere,
        code_matiere: seance.code_matiere,
        date_seance: seance.date_seance,
        heure_debut: seance.heure_debut,
        heure_fin: seance.heure_fin,
        salle: seance.salle
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur scan:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du scan',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Controller pour récupérer les séances d'un enseignant (FONCTION CORRIGÉE)
const getTeacherSeances = async (req, res) => {
  console.log('🔍 Début getTeacherSeances');
  console.log('User ID:', req.user.id);
  
  try {
    // Récupérer l'ID de l'enseignant
    const resultEnseignants = await db.query(
      'SELECT id_enseignant FROM enseignants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    const enseignants = resultEnseignants.rows;
    
    if (enseignants.length === 0) {
      console.log('❌ Profil enseignant non trouvé');
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const enseignantId = enseignants[0].id_enseignant;
    console.log('✅ ID enseignant:', enseignantId);

    // Récupérer les séances (REQUÊTE CORRIGÉE)
    const queryText = `
      SELECT 
        s.*, 
        m.nom_matiere, 
        m.code_matiere,
        COUNT(p.id_presence) as nombre_presents
      FROM seances_cours s
      JOIN matieres m ON s.id_matiere = m.id_matiere
      JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
      LEFT JOIN presences p ON s.id_seance = p.id_seance AND p.statut = 'present'
      WHERE em.id_enseignant = $1
      GROUP BY s.id_seance, m.nom_matiere, m.code_matiere
      ORDER BY s.date_seance DESC, s.heure_debut DESC
    `;
    
    console.log('SQL Query séances:', queryText);
    
    const resultSeances = await db.query(queryText, [enseignantId]);
    const seances = resultSeances.rows;

    console.log(`✅ ${seances.length} séances récupérées pour l'enseignant ${enseignantId}`);

    res.json({
      success: true,
      count: seances.length,
      seances: seances
    });

  } catch (error) {
    console.error('❌ Erreur récupération séances:', error);
    console.error('Stack trace:', error.stack);
    
    // Vérifier si les tables existent
    try {
      const checkSeancesTable = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'seances_cours'
        )
      `);
      console.log('Table seances_cours existe?', checkSeancesTable.rows[0].exists);
      
      const checkPresencesTable = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'presences'
        )
      `);
      console.log('Table presences existe?', checkPresencesTable.rows[0].exists);
    } catch (e) {
      console.error('Erreur vérification tables:', e);
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des séances',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      hint: process.env.NODE_ENV === 'development' ? 'Vérifiez les tables seances_cours et presences' : undefined
    });
  }
};

// Fonction pour récupérer les présences d'un étudiant
const getStudentPresences = async (req, res) => {
  try {
    // Vérifier si l'utilisateur est étudiant
    const resultEtudiants = await db.query(
      'SELECT id_etudiant FROM etudiants WHERE id_utilisateur = $1',
      [req.user.id]
    );
    const etudiants = resultEtudiants.rows;
    
    if (etudiants.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Profil étudiant non trouvé'
      });
    }

    const etudiantId = etudiants[0].id_etudiant;

    // Récupérer les présences (REQUÊTE CORRIGÉE)
    const resultPresences = await db.query(
      `SELECT p.*, 
              s.date_seance, s.heure_debut, s.heure_fin, s.salle, s.qr_code,
              m.nom_matiere, m.code_matiere,
              e.nom as enseignant_nom, e.prenom as enseignant_prenom
       FROM presences p
       JOIN seances_cours s ON p.id_seance = s.id_seance
       JOIN matieres m ON s.id_matiere = m.id_matiere
       JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       JOIN enseignants e ON em.id_enseignant = e.id_enseignant
       WHERE p.id_etudiant = $1
       ORDER BY s.date_seance DESC, s.heure_debut DESC`,
      [etudiantId]
    );
    const presences = resultPresences.rows;

    res.json({
      success: true,
      presences: presences,
      count: presences.length
    });

  } catch (error) {
    console.error('❌ Erreur récupération présences étudiant:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des présences'
    });
  }
};

// Fonction pour récupérer les présences d'un étudiant par ID (pour admin)
const getStudentPresencesById = async (req, res) => {
  try {
    const { id } = req.params;

    // Récupérer les présences
    const resultPresences = await db.query(
      `SELECT p.*, 
              s.date_seance, s.heure_debut, s.heure_fin, s.salle, s.qr_code,
              m.nom_matiere, m.code_matiere,
              e.nom as enseignant_nom, e.prenom as enseignant_prenom
       FROM presences p
       JOIN seances_cours s ON p.id_seance = s.id_seance
       JOIN matieres m ON s.id_matiere = m.id_matiere
       JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       JOIN enseignants e ON em.id_enseignant = e.id_enseignant
       WHERE p.id_etudiant = $1
       ORDER BY s.date_seance DESC, s.heure_debut DESC`,
      [id]
    );
    const presences = resultPresences.rows;

    res.json({
      success: true,
      presences: presences,
      count: presences.length
    });

  } catch (error) {
    console.error('❌ Erreur récupération présences étudiant par ID:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des présences'
    });
  }
};

module.exports = {
  generateQRCode,
  verifyQRCode,
  scanQRCode,
  getTeacherSeances,
  getStudentPresences,
  getStudentPresencesById
};
