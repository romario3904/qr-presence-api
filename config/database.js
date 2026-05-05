// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

// Configuration du pool PostgreSQL
let poolConfig = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
};

// Utiliser DATABASE_URL si disponible (Render/Neon)
if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
  poolConfig.ssl = process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false;
} else {
  // Configuration locale (fallback)
  poolConfig.host = process.env.DB_HOST || 'localhost';
  poolConfig.port = parseInt(process.env.DB_PORT) || 5432;
  poolConfig.user = process.env.DB_USER || 'postgres';
  poolConfig.password = process.env.DB_PASSWORD || 'daroms004';
  poolConfig.database = process.env.DB_NAME || 'ctrl_presence';
}

const pool = new Pool(poolConfig);

// Fonction d'initialisation de la base de données
const initializeDatabase = async () => {
  let client;
  try {
    console.log('🔄 Test de connexion PostgreSQL...');
    
    // Afficher la config (sans le mot de passe)
    if (process.env.DATABASE_URL) {
      const maskedUrl = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@');
      console.log(`📍 DATABASE_URL: ${maskedUrl}`);
    } else {
      console.log(`📍 Host: ${poolConfig.host}`);
      console.log(`📍 Port: ${poolConfig.port}`);
      console.log(`📍 User: ${poolConfig.user}`);
      console.log(`📍 Database: ${poolConfig.database}`);
    }
    
    client = await pool.connect();
    
    // Test de requête simple
    const result = await client.query('SELECT NOW() as server_time, version() as version');
    console.log('✅ Connecté à PostgreSQL');
    console.log(`📅 Heure serveur: ${result.rows[0].server_time}`);
    console.log(`📦 Version: ${result.rows[0].version.split(' ')[0]}`);
    
    return true;
  } catch (error) {
    console.error('❌ Échec de la connexion PostgreSQL:', error.message);
    console.error('   Code:', error.code);
    
    console.log('\n🔧 Conseils de dépannage:');
    console.log('   1. Vérifiez que DATABASE_URL est correcte sur Render');
    console.log('   2. Activez le "Connection pooling" sur Neon');
    console.log('   3. Vérifiez que l\'URL contient "-pooler"');
    
    return false;
  } finally {
    if (client) client.release();
  }
};

// Conversion MySQL ? en PostgreSQL $1, $2, etc.
const convertMySQLToPostgreSQL = (query, params = []) => {
  if (!params || params.length === 0) {
    return { query, params };
  }
  
  let paramIndex = 1;
  const convertedQuery = query.replace(/\?/g, () => `$${paramIndex++}`);
  return { query: convertedQuery, params };
};

// Fonction query wrapper
const query = async (sql, params = []) => {
  try {
    const { query: convertedQuery, params: convertedParams } = convertMySQLToPostgreSQL(sql, params);
    const result = await pool.query(convertedQuery, convertedParams);
    return result;
  } catch (error) {
    console.error('❌ Erreur SQL:', error.message);
    throw error;
  }
};

// Fonction execute pour compatibilité
const execute = async (queryText, params = []) => {
  const client = await pool.connect();
  try {
    const { query: convertedQuery, params: convertedParams } = convertMySQLToPostgreSQL(queryText, params);
    const result = await client.query(convertedQuery, convertedParams);
    return [result.rows, result];
  } catch (error) {
    console.error('❌ Erreur SQL:', error.message);
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
    const result = await pool.query('SELECT 1 as test');
    return result.rows[0].test === 1;
  } catch (error) {
    console.error('Test de connexion échoué:', error.message);
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