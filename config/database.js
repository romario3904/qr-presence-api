// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

// Configuration SSL pour Render PostgreSQL
const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL;

// Configuration du pool de connexions
const poolConfig = connectionString 
  ? {
      connectionString,
      // Configuration spécifique pour Render PostgreSQL
      ssl: {
        rejectUnauthorized: false
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      allowExitOnIdle: false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ctrl_presence',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      allowExitOnIdle: false,
    };

const pool = new Pool(poolConfig);

// Log de configuration (masque les mots de passe)
console.log('🔧 Configuration PostgreSQL:');
console.log(`   Environnement: ${process.env.NODE_ENV || 'development'}`);
console.log(`   Host: ${poolConfig.host || 'from DATABASE_URL'}`);
console.log(`   Database: ${poolConfig.database || 'from DATABASE_URL'}`);
console.log(`   SSL: ${poolConfig.ssl ? 'Activé' : 'Désactivé'}`);

// Événements du pool
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔌 Nouvelle connexion établie avec PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('💥 Erreur inattendue sur le pool PostgreSQL:', err.message);
});

pool.on('acquire', (client) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('📥 Client acquis du pool');
  }
});

pool.on('remove', (client) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('📤 Client retiré du pool');
  }
});

// Fonction d'initialisation de la base de données
const initializeDatabase = async () => {
  let client;
  try {
    console.log('🔄 Test de connexion PostgreSQL...');
    
    client = await pool.connect();
    
    // Test de requête simple
    const result = await client.query('SELECT NOW() as server_time, version() as pg_version');
    console.log('✅ Connecté à PostgreSQL');
    console.log(`📅 Heure du serveur: ${result.rows[0].server_time}`);
    console.log(`📊 Version PostgreSQL: ${result.rows[0].pg_version.split(',')[0]}`);
    
    // Vérifier les tables existantes
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`📋 Tables disponibles (${tables.rows.length}):`);
    tables.rows.forEach(table => {
      console.log(`   - ${table.table_name}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Échec de la connexion PostgreSQL:', error.message);
    console.error('   Code:', error.code);
    console.error('   Détails:', error.detail || 'N/A');
    
    console.log('\n🔧 Conseils de dépannage:');
    console.log('   1. Vérifiez que DATABASE_URL est correctement défini sur Render');
    console.log('   2. Vérifiez que la base de données PostgreSQL externe est accessible');
    console.log('   3. Vérifiez les credentials de la base de données');
    
    if (error.code === 'ECONNREFUSED') {
      console.log('   4. Le serveur PostgreSQL ne répond pas. Vérifiez qu\'il est en cours d\'exécution');
    } else if (error.code === '3D000') {
      console.log('   5. La base de données n\'existe pas. Créez-la sur votre hébergeur PostgreSQL');
    }
    
    return false;
  } finally {
    if (client) client.release();
  }
};

// Fonction pour convertir la syntaxe MySQL (?) en PostgreSQL ($1, $2, etc.)
const convertMySQLToPostgreSQL = (query, params = []) => {
  if (!params || params.length === 0) {
    return { query, params };
  }
  
  let paramIndex = 1;
  const convertedQuery = query.replace(/\?/g, () => `$${paramIndex++}`);
  return { query: convertedQuery, params };
};

// Fonction query wrapper pour compatibilité
const query = async (sql, params = []) => {
  const client = await pool.connect();
  try {
    // Convertir la syntaxe MySQL en PostgreSQL si nécessaire
    const { query: convertedQuery, params: convertedParams } = convertMySQLToPostgreSQL(sql, params);
    const result = await client.query(convertedQuery, convertedParams);
    return result;
  } catch (error) {
    console.error('❌ Erreur SQL:', error.message);
    console.error('Query originale:', sql);
    console.error('Params:', params);
    throw {
      message: error.message,
      code: error.code,
      detail: error.detail
    };
  } finally {
    client.release();
  }
};

// Fonction execute pour compatibilité
const execute = async (queryText, params = []) => {
  const client = await pool.connect();
  try {
    // Convertir la syntaxe MySQL en PostgreSQL si nécessaire
    const { query: convertedQuery, params: convertedParams } = convertMySQLToPostgreSQL(queryText, params);
    const result = await client.query(convertedQuery, convertedParams);
    return [result.rows, result];
  } catch (error) {
    console.error('❌ Erreur SQL:', error.message);
    console.error('Query:', queryText);
    console.error('Params:', params);
    throw error;
  } finally {
    client.release();
  }
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
    console.error('Test de connexion échoué:', error.message);
    return false;
  }
};

// Fonction pour créer les tables si elles n'existent pas
const createTablesIfNotExist = async () => {
  try {
    const createTablesQuery = `
      -- Table des utilisateurs
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'etudiant',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Table des matières
      CREATE TABLE IF NOT EXISTS matieres (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        nom VARCHAR(255) NOT NULL,
        description TEXT,
        enseignant_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Table des présences
      CREATE TABLE IF NOT EXISTS presences (
        id SERIAL PRIMARY KEY,
        etudiant_id INTEGER REFERENCES users(id),
        matiere_id INTEGER REFERENCES matieres(id),
        date_presence DATE NOT NULL,
        heure_arrivee TIME,
        statut VARCHAR(50) DEFAULT 'present',
        qr_code TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Table des sessions QR
      CREATE TABLE IF NOT EXISTS qr_sessions (
        id SERIAL PRIMARY KEY,
        matiere_id INTEGER REFERENCES matieres(id),
        code VARCHAR(100) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Index pour améliorer les performances
      CREATE INDEX IF NOT EXISTS idx_presences_etudiant_date ON presences(etudiant_id, date_presence);
      CREATE INDEX IF NOT EXISTS idx_presences_matiere_date ON presences(matiere_id, date_presence);
      CREATE INDEX IF NOT EXISTS idx_qr_sessions_code ON qr_sessions(code);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `;
    
    await pool.query(createTablesQuery);
    console.log('✅ Tables vérifiées/créées avec succès');
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de la création des tables:', error.message);
    return false;
  }
};

module.exports = {
  pool,
  execute,
  getConnection,
  query,
  initializeDatabase,
  testConnection,
  createTablesIfNotExist
};