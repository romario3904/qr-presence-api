// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Initialisation PostgreSQL...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL présent:', !!process.env.DATABASE_URL);

// Configuration du pool pour production
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

if (!process.env.DATABASE_URL) {
  console.error('❌ ERREUR: DATABASE_URL non défini dans .env');
  console.error('Veuillez définir DATABASE_URL dans votre fichier .env');
  process.exit(1);
}

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  console.log('✅ Connexion PostgreSQL établie');
});

pool.on('error', (err) => {
  console.error('💥 Erreur PostgreSQL:', err.message);
  console.error('Code erreur:', err.code);
});

// Fonction d'initialisation de la base de données
const initializeDatabase = async () => {
  let client;
  try {
    console.log('🔄 Test de connexion à la base de données...');
    
    client = await pool.connect();
    
    const result = await client.query('SELECT NOW() as server_time, version() as pg_version');
    console.log('✅ Connecté à PostgreSQL avec succès');
    console.log(`📅 Heure du serveur: ${result.rows[0].server_time}`);
    console.log(`📊 Version PostgreSQL: ${result.rows[0].pg_version.split(',')[0]}`);
    
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`📋 Tables disponibles (${tables.rows.length}):`);
    tables.rows.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table.table_name}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Échec de la connexion PostgreSQL:');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
    return false;
  } finally {
    if (client) client.release();
  }
};

// Fonction query simple
const query = async (text, params = []) => {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } catch (error) {
    console.error('❌ Erreur SQL:');
    console.error('Message:', error.message);
    console.error('Query:', text);
    console.error('Params:', params);
    throw error;
  } finally {
    client.release();
  }
};

// Alias pour compatibilité
const execute = async (queryText, params = []) => {
  return query(queryText, params);
};

// Fonction getConnection pour transactions
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

// Fonction pour tester la connexion
const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    return result.rows[0]?.current_time ? true : false;
  } catch (error) {
    console.error('❌ Test de connexion échoué:', error.message);
    return false;
  }
};

// Fonction pour créer les tables nécessaires - CORRIGÉE
const createTablesIfNotExist = async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const createTablesQuery = `
      -- Table des utilisateurs
      CREATE TABLE IF NOT EXISTS utilisateurs (
        id_utilisateur SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        matricule VARCHAR(50) UNIQUE NOT NULL,
        mot_de_passe VARCHAR(255) NOT NULL,
        type_utilisateur VARCHAR(50) NOT NULL CHECK (type_utilisateur IN ('enseignant', 'etudiant', 'admin')),
        statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif', 'suspendu')),
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Table des enseignants
      CREATE TABLE IF NOT EXISTS enseignants (
        id_enseignant SERIAL PRIMARY KEY,
        matricule VARCHAR(50) UNIQUE NOT NULL,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        id_utilisateur INTEGER REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
        niveaux_enseignes TEXT,
        mention_enseignee VARCHAR(100),
        parcours_enseignes TEXT,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Table des étudiants
      CREATE TABLE IF NOT EXISTS etudiants (
        id_etudiant SERIAL PRIMARY KEY,
        matricule VARCHAR(50) UNIQUE NOT NULL,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        niveau VARCHAR(50),
        mention VARCHAR(100),
        parcours VARCHAR(100),
        id_utilisateur INTEGER REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Table des matières - CORRIGÉE
      CREATE TABLE IF NOT EXISTS matieres (
        id_matiere SERIAL PRIMARY KEY,
        nom_matiere VARCHAR(255) NOT NULL,  -- Changé de 'nom' à 'nom_matiere'
        code_matiere VARCHAR(50) UNIQUE NOT NULL,  -- Changé de 'code' à 'code_matiere'
        description TEXT,
        credit INTEGER,
        niveau_enseignee VARCHAR(50),
        mention_enseignee VARCHAR(100),
        parcours_enseignee VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Table de relation enseignant_matiere
      CREATE TABLE IF NOT EXISTS enseignant_matiere (
        id_enseignant INTEGER REFERENCES enseignants(id_enseignant) ON DELETE CASCADE,
        id_matiere INTEGER REFERENCES matieres(id_matiere) ON DELETE CASCADE,
        date_assignation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_enseignant, id_matiere)
      );

      -- Table des présences
      CREATE TABLE IF NOT EXISTS presences (
        id_presence SERIAL PRIMARY KEY,
        id_etudiant INTEGER REFERENCES etudiants(id_etudiant),
        id_matiere INTEGER REFERENCES matieres(id_matiere),
        date_presence DATE NOT NULL,
        heure_arrivee TIME,
        statut VARCHAR(50) DEFAULT 'present' CHECK (statut IN ('present', 'absent', 'retard', 'justifie')),
        qr_code TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Table des sessions QR
      CREATE TABLE IF NOT EXISTS qr_sessions (
        id_session SERIAL PRIMARY KEY,
        id_matiere INTEGER REFERENCES matieres(id_matiere),
        code VARCHAR(100) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await client.query(createTablesQuery);

    // Créer les index
    const createIndexesQuery = `
      -- Index pour utilisateurs
      CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs(email);
      CREATE INDEX IF NOT EXISTS idx_utilisateurs_matricule ON utilisateurs(matricule);
      
      -- Index pour enseignants
      CREATE INDEX IF NOT EXISTS idx_enseignants_id_utilisateur ON enseignants(id_utilisateur);
      
      -- Index pour étudiants
      CREATE INDEX IF NOT EXISTS idx_etudiants_id_utilisateur ON etudiants(id_utilisateur);
      CREATE INDEX IF NOT EXISTS idx_etudiants_matricule ON etudiants(matricule);
      
      -- Index pour matières
      CREATE INDEX IF NOT EXISTS idx_matieres_code_matiere ON matieres(code_matiere);
      
      -- Index pour enseignant_matiere
      CREATE INDEX IF NOT EXISTS idx_enseignant_matiere_enseignant ON enseignant_matiere(id_enseignant);
      CREATE INDEX IF NOT EXISTS idx_enseignant_matiere_matiere ON enseignant_matiere(id_matiere);
      
      -- Index pour présences
      CREATE INDEX IF NOT EXISTS idx_presences_etudiant_date ON presences(id_etudiant, date_presence);
      CREATE INDEX IF NOT EXISTS idx_presences_matiere_date ON presences(id_matiere, date_presence);
      
      -- Index pour QR sessions
      CREATE INDEX IF NOT EXISTS idx_qr_sessions_code ON qr_sessions(code);
      CREATE INDEX IF NOT EXISTS idx_qr_sessions_expires ON qr_sessions(expires_at);
    `;

    await client.query(createIndexesQuery);

    await client.query('COMMIT');
    console.log('✅ Tables et index créés avec succès');
    return true;
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('❌ Erreur lors de la création des tables:', error.message);
    return false;
  } finally {
    if (client) client.release();
  }
};

// Fonction pour vérifier et créer les tables si nécessaire
const checkAndFixDatabaseStructure = async () => {
  try {
    console.log('🔍 Vérification de la structure de la base...');
    
    const requiredTables = ['utilisateurs', 'enseignants', 'etudiants', 'matieres', 'enseignant_matiere', 'presences', 'qr_sessions'];
    
    for (const table of requiredTables) {
      try {
        const check = await query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [table]);
        
        if (!check.rows[0].exists) {
          console.log(`⚠️  Table "${table}" manquante, création de toutes les tables...`);
          await createTablesIfNotExist();
          console.log(`✅ Tables créées`);
          break; // Les tables sont créées ensemble
        }
      } catch (error) {
        console.error(`❌ Erreur vérification table "${table}":`, error.message);
      }
    }
    
    console.log('✅ Structure vérifiée avec succès');
    return true;
  } catch (error) {
    console.error('❌ Erreur vérification structure:', error.message);
    return false;
  }
};

module.exports = {
  pool,
  execute,
  query,
  getConnection,
  initializeDatabase,
  testConnection,
  createTablesIfNotExist,
  checkAndFixDatabaseStructure
};
