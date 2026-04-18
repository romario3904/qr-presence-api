const { Pool } = require('pg');
require('dotenv').config();

// Configuration pour Railway (utilise DATABASE_URL)
// Railway fournit DATABASE_URL automatiquement
let poolConfig;

if (process.env.DATABASE_URL) {
  // Mode Railway - utilisation de DATABASE_URL
  console.log('☁️  Mode Railway détecté - utilisation de DATABASE_URL');
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Crucial pour Railway
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  };
} else {
  // Mode développement local - utilisation des variables individuelles
  console.log('💻 Mode développement local - utilisation des variables individuelles');
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'daroms004',
    database: process.env.DB_NAME || 'ctrl_presence',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  };
}

const pool = new Pool(poolConfig);

const initializeDatabase = async () => {
  let client;
  try {
    console.log('🔄 Connexion à PostgreSQL...');
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as server_time');
    console.log('✅ Connecté à PostgreSQL');
    console.log(`📅 Heure: ${result.rows[0].server_time}`);
    
    // Créer les tables automatiquement
    await createTables();
    
    return true;
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return false;
  } finally {
    if (client) client.release();
  }
};

const createTables = async () => {
  const client = await pool.connect();
  try {
    console.log('📦 Création des tables...');
    
    await client.query(`
      -- Table utilisateurs
      CREATE TABLE IF NOT EXISTS utilisateurs (
          id_utilisateur SERIAL PRIMARY KEY,
          nom VARCHAR(100) NOT NULL,
          prenom VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          matricule VARCHAR(50) UNIQUE NOT NULL,
          mot_de_passe VARCHAR(255) NOT NULL,
          type_utilisateur VARCHAR(20) CHECK (type_utilisateur IN ('etudiant', 'enseignant', 'admin')) NOT NULL,
          statut VARCHAR(20) DEFAULT 'actif',
          date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Table etudiants
      CREATE TABLE IF NOT EXISTS etudiants (
          id_etudiant SERIAL PRIMARY KEY,
          matricule VARCHAR(50) UNIQUE NOT NULL,
          nom VARCHAR(100) NOT NULL,
          prenom VARCHAR(100) NOT NULL,
          niveau VARCHAR(50),
          mention VARCHAR(100),
          parcours VARCHAR(100),
          id_utilisateur INTEGER REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE
      );

      -- Table enseignants
      CREATE TABLE IF NOT EXISTS enseignants (
          id_enseignant SERIAL PRIMARY KEY,
          matricule VARCHAR(50) UNIQUE NOT NULL,
          nom VARCHAR(100) NOT NULL,
          prenom VARCHAR(100) NOT NULL,
          id_utilisateur INTEGER REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
          niveaux_enseignes TEXT,
          mention_enseignee VARCHAR(100),
          parcours_enseignes TEXT
      );

      -- Table matieres
      CREATE TABLE IF NOT EXISTS matieres (
          id_matiere SERIAL PRIMARY KEY,
          nom_matiere VARCHAR(200) NOT NULL,
          code_matiere VARCHAR(50) UNIQUE NOT NULL,
          description TEXT,
          credit INTEGER,
          niveau_enseignee VARCHAR(50),
          mention_enseignee VARCHAR(100),
          parcours_enseignee VARCHAR(100)
      );

      -- Table enseignant_matiere
      CREATE TABLE IF NOT EXISTS enseignant_matiere (
          id_enseignant INTEGER REFERENCES enseignants(id_enseignant) ON DELETE CASCADE,
          id_matiere INTEGER REFERENCES matieres(id_matiere) ON DELETE CASCADE,
          PRIMARY KEY (id_enseignant, id_matiere)
      );

      -- Table seances_cours
      CREATE TABLE IF NOT EXISTS seances_cours (
          id_seance SERIAL PRIMARY KEY,
          id_matiere INTEGER REFERENCES matieres(id_matiere) ON DELETE CASCADE,
          date_seance DATE NOT NULL,
          heure_debut TIME NOT NULL,
          heure_fin TIME NOT NULL,
          salle VARCHAR(100) NOT NULL,
          qr_code VARCHAR(255),
          qr_expire TIMESTAMP
      );

      -- Table presence
      CREATE TABLE IF NOT EXISTS presence (
          id_presence SERIAL PRIMARY KEY,
          id_seance INTEGER REFERENCES seances_cours(id_seance) ON DELETE CASCADE,
          id_etudiant INTEGER REFERENCES etudiants(id_etudiant) ON DELETE CASCADE,
          statut VARCHAR(20) CHECK (statut IN ('present', 'late', 'absent')) DEFAULT 'present',
          date_scan TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(id_seance, id_etudiant)
      );

      -- Index
      CREATE INDEX IF NOT EXISTS idx_presence_etudiant ON presence(id_etudiant);
      CREATE INDEX IF NOT EXISTS idx_presence_seance ON presence(id_seance);
      CREATE INDEX IF NOT EXISTS idx_seances_matiere ON seances_cours(id_matiere);
      CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs(email);
      CREATE INDEX IF NOT EXISTS idx_utilisateurs_matricule ON utilisateurs(matricule);
    `);
    
    console.log('✅ Tables créées avec succès');
    
    // Créer un admin par défaut
    const adminCheck = await client.query(
      "SELECT * FROM utilisateurs WHERE type_utilisateur = 'admin' LIMIT 1"
    );
    
    if (adminCheck.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        `INSERT INTO utilisateurs (nom, prenom, email, matricule, mot_de_passe, type_utilisateur) 
         VALUES ('Admin', 'System', 'admin@ctrlpresence.com', 'ADMIN001', $1, 'admin')`,
        [hashedPassword]
      );
      console.log('✅ Admin créé: admin@ctrlpresence.com / admin123');
    }
    
  } catch (error) {
    console.error('❌ Erreur création tables:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

const query = async (sql, params = []) => {
  try {
    const result = await pool.query(sql, params);
    return result;
  } catch (error) {
    console.error('❌ Erreur SQL:', error.message);
    throw error;
  }
};

const execute = async (queryText, params = []) => {
  const client = await pool.connect();
  try {
    const result = await client.query(queryText, params);
    return [result.rows, result];
  } catch (error) {
    console.error('❌ Erreur SQL:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

const getConnection = async () => {
  const client = await pool.connect();
  return {
    query: (text, params) => client.query(text, params),
    release: () => client.release(),
    beginTransaction: async () => {
      await client.query('BEGIN');
    },
    commit: async () => {
      await client.query('COMMIT');
    },
    rollback: async () => {
      await client.query('ROLLBACK');
    }
  };
};

const testConnection = async () => {
  try {
    const result = await pool.query('SELECT 1 as test');
    return result.rows[0].test === 1;
  } catch (error) {
    return false;
  }
};

module.exports = {
  pool,
  execute,
  getConnection,
  query,
  initializeDatabase,
  testConnection
};