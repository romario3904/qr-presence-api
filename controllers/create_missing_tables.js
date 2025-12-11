// create_missing_tables.js
const db = require('./config/database');

async function createMissingTables() {
  let client;
  try {
    console.log('🔄 Création des tables manquantes...');
    
    client = await db.pool.connect();
    await client.query('BEGIN');
    
    // Table seances_cours
    console.log('🔍 Vérification table seances_cours...');
    const checkSeances = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'seances_cours'
      )
    `);
    
    if (!checkSeances.rows[0].exists) {
      console.log('🔄 Création de la table seances_cours...');
      await client.query(`
        CREATE TABLE seances_cours (
          id_seance SERIAL PRIMARY KEY,
          id_matiere INTEGER REFERENCES matieres(id_matiere),
          date_seance DATE NOT NULL,
          heure_debut TIME NOT NULL,
          heure_fin TIME NOT NULL,
          salle VARCHAR(50) NOT NULL,
          qr_code VARCHAR(255),
          qr_expire TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Table seances_cours créée');
    } else {
      console.log('✅ Table seances_cours existe déjà');
    }
    
    // Table presences (version corrigée)
    console.log('🔍 Vérification table presences...');
    const checkPresences = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'presences'
      )
    `);
    
    if (!checkPresences.rows[0].exists) {
      console.log('🔄 Création de la table presences...');
      await client.query(`
        CREATE TABLE presences (
          id_presence SERIAL PRIMARY KEY,
          id_etudiant INTEGER REFERENCES etudiants(id_etudiant),
          id_seance INTEGER REFERENCES seances_cours(id_seance),
          id_matiere INTEGER REFERENCES matieres(id_matiere),
          statut VARCHAR(20) DEFAULT 'present' CHECK (statut IN ('present', 'absent', 'retard', 'justifie')),
          date_scan TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Table presences créée');
    } else {
      console.log('✅ Table presences existe déjà');
      
      // Vérifier et ajouter la colonne id_seance si elle manque
      const checkIdSeance = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'presences' 
        AND column_name = 'id_seance'
      `);
      
      if (checkIdSeance.rows.length === 0) {
        console.log('🔄 Ajout de la colonne id_seance à la table presences...');
        await client.query('ALTER TABLE presences ADD COLUMN id_seance INTEGER REFERENCES seances_cours(id_seance)');
        console.log('✅ Colonne id_seance ajoutée');
      }
    }
    
    // Créer les index
    console.log('🔍 Création des index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_seances_cours_matiere ON seances_cours(id_matiere);
      CREATE INDEX IF NOT EXISTS idx_seances_cours_date ON seances_cours(date_seance);
      CREATE INDEX IF NOT EXISTS idx_seances_cours_qr_expire ON seances_cours(qr_expire);
      CREATE INDEX IF NOT EXISTS idx_presences_seance ON presences(id_seance);
      CREATE INDEX IF NOT EXISTS idx_presences_etudiant_seance ON presences(id_etudiant, id_seance);
    `);
    
    await client.query('COMMIT');
    console.log('✅ Tables manquantes créées avec succès');
    
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('❌ Erreur création tables:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (client) {
      client.release();
    }
    process.exit(0);
  }
}

// Exécuter seulement si appelé directement
if (require.main === module) {
  createMissingTables();
}
