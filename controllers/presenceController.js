// controllers/presenceController.js
const db = require('../config/database');

const getStudentPresence = async (req, res) => {
  try {
    const id_etudiant = req.user.profil?.id_etudiant || req.user.id_etudiant;

    if (!id_etudiant) {
      return res.status(400).json({
        success: false,
        message: 'ID étudiant manquant'
      });
    }

    const [presences] = await db.execute(
      `SELECT p.*, sc.date_seance, sc.heure_debut, sc.salle,
              m.nom_matiere, m.code_matiere, ens.nom as enseignant_nom, ens.prenom as enseignant_prenom
       FROM presence p
       JOIN seances_cours sc ON p.id_seance = sc.id_seance
       JOIN matieres m ON sc.id_matiere = m.id_matiere
       JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       JOIN enseignants ens ON em.id_enseignant = ens.id_enseignant
       WHERE p.id_etudiant = $1
       ORDER BY sc.date_seance DESC, sc.heure_debut DESC`,
      [id_etudiant]
    );

    res.json({
      success: true,
      presences: presences
    });
  } catch (error) {
    console.error('Erreur récupération présence étudiant:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
};

const getStudentPresenceById = async (req, res) => {
  try {
    const { id_etudiant } = req.params;
    
    // Pour les étudiants, vérifier qu'ils consultent leur propre présence
    if (req.user.type_utilisateur === 'etudiant') {
      const userEtudiantId = req.user.profil?.id_etudiant;
      if (parseInt(id_etudiant) !== parseInt(userEtudiantId)) {
        return res.status(403).json({
          success: false,
          message: 'Vous ne pouvez consulter que vos propres présences'
        });
      }
    }
    
    // Pour les enseignants, vérifier si l'étudiant est dans leurs matières
    if (req.user.type_utilisateur === 'enseignant') {
      const id_enseignant = req.user.profil?.id_enseignant;
      const [verification] = await db.execute(
        `SELECT 1 
         FROM etudiants e
         JOIN matieres m ON (e.niveau = m.niveau OR e.mention = m.mention OR e.parcours = m.parcours)
         JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
         WHERE e.id_etudiant = $1 AND em.id_enseignant = $2
         LIMIT 1`,
        [id_etudiant, id_enseignant]
      );
      
      if (verification.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas accès aux présences de cet étudiant'
        });
      }
    }

    const [presences] = await db.execute(
      `SELECT p.*, sc.date_seance, sc.heure_debut, sc.salle,
              m.nom_matiere, m.code_matiere, ens.nom as enseignant_nom, ens.prenom as enseignant_prenom
       FROM presence p
       JOIN seances_cours sc ON p.id_seance = sc.id_seance
       JOIN matieres m ON sc.id_matiere = m.id_matiere
       JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       JOIN enseignants ens ON em.id_enseignant = ens.id_enseignant
       WHERE p.id_etudiant = $1
       ORDER BY sc.date_seance DESC, sc.heure_debut DESC`,
      [id_etudiant]
    );

    // Récupérer les infos de l'étudiant
    const [etudiantInfo] = await db.execute(
      `SELECT id_etudiant, matricule, nom, prenom, niveau, mention, parcours
       FROM etudiants 
       WHERE id_etudiant = $1`,
      [id_etudiant]
    );

    res.json({
      success: true,
      etudiant: etudiantInfo[0] || null,
      presences: presences,
      total: presences.length,
      presents: presences.filter(p => p.statut === 'present').length,
      late: presences.filter(p => p.statut === 'late').length,
      absent: presences.filter(p => p.statut === 'absent').length
    });
  } catch (error) {
    console.error('Erreur récupération présence étudiant par ID:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
};

const getSeancePresence = async (req, res) => {
  try {
    const { id_seance } = req.params;

    // Vérifier que l'enseignant est responsable
    if (req.user.type_utilisateur === 'enseignant') {
      const [seances] = await db.execute(
        `SELECT m.id_matiere 
         FROM seances_cours sc
         JOIN matieres m ON sc.id_matiere = m.id_matiere
         JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
         WHERE sc.id_seance = $1 AND em.id_enseignant = $2`,
        [id_seance, req.user.profil?.id_enseignant]
      );

      if (seances.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à cette séance'
        });
      }
    }

    const [presences] = await db.execute(
      `SELECT p.*, e.matricule, e.nom, e.prenom, e.niveau, e.mention
       FROM presence p
       JOIN etudiants e ON p.id_etudiant = e.id_etudiant
       WHERE p.id_seance = $1
       ORDER BY e.nom, e.prenom`,
      [id_seance]
    );

    // Récupérer les infos de la séance
    const [seanceInfo] = await db.execute(
      `SELECT sc.*, m.nom_matiere, m.code_matiere
       FROM seances_cours sc
       JOIN matieres m ON sc.id_matiere = m.id_matiere
       WHERE sc.id_seance = $1`,
      [id_seance]
    );

    res.json({
      success: true,
      seance: seanceInfo[0] || {},
      presences: presences,
      total: presences.length,
      presents: presences.filter(p => p.statut === 'present').length,
      late: presences.filter(p => p.statut === 'late').length,
      absent: presences.filter(p => p.statut === 'absent').length
    });
  } catch (error) {
    console.error('Erreur récupération présence séance:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
};

const getTeacherMatieres = async (req, res) => {
  try {
    const id_enseignant = req.user.profil?.id_enseignant;

    if (!id_enseignant) {
      return res.status(403).json({
        success: false,
        message: 'Profil enseignant non trouvé'
      });
    }

    const [matieres] = await db.execute(
      `SELECT m.* 
       FROM matieres m
       JOIN enseignant_matiere em ON m.id_matiere = em.id_matiere
       WHERE em.id_enseignant = $1
       ORDER BY m.nom_matiere`,
      [id_enseignant]
    );

    res.json({
      success: true,
      matieres: matieres
    });
  } catch (error) {
    console.error('Erreur récupération matières:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
};

const markPresence = async (req, res) => {
  try {
    const { id_seance, id_etudiant, statut } = req.body;
    
    if (!id_seance || !id_etudiant || !statut) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont requis'
      });
    }
    
    // Vérifier si déjà présent
    const [existing] = await db.execute(
      'SELECT * FROM presence WHERE id_seance = $1 AND id_etudiant = $2',
      [id_seance, id_etudiant]
    );
    
    if (existing.length > 0) {
      // Mettre à jour
      await db.execute(
        'UPDATE presence SET statut = $1, date_scan = NOW() WHERE id_seance = $2 AND id_etudiant = $3',
        [statut, id_seance, id_etudiant]
      );
    } else {
      // Insérer
      await db.execute(
        'INSERT INTO presence (id_seance, id_etudiant, statut, date_scan) VALUES ($1, $2, $3, NOW())',
        [id_seance, id_etudiant, statut]
      );
    }
    
    res.json({
      success: true,
      message: 'Présence mise à jour avec succès'
    });
    
  } catch (error) {
    console.error('Erreur marquage présence:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
};

module.exports = { 
  getStudentPresence, 
  getStudentPresenceById,
  getSeancePresence, 
  getTeacherMatieres,
  markPresence 
};