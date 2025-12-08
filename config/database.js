// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'daroms004',
  database: process.env.DB_NAME || 'ctrl_presence',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // Augmenté à 30 secondes
  ssl: false,
  allowExitOnIdle: false,
});

// Fonction d'initialisation de la base de données
const initializeDatabase = async () => {
  let client;
  try {
    console.log('🔄 Test de connexion PostgreSQL...');
    console.log(`📍 Configuration:`);
    console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`   Port: ${process.env.DB_PORT || 5432}`);
    console.log(`   User: ${process.env.DB_USER || 'postgres'}`);
    console.log(`   Database: ${process.env.DB_NAME || 'ctrl_presence'}`);
    
    client = await pool.connect();
    
    // Test de requête simple
    const result = await client.query('SELECT NOW() as server_time');
    console.log('✅ Connecté à PostgreSQL');
    console.log(`📅 Heure du serveur: ${result.rows[0].server_time}`);
    
    // Vérifier le nombre de connexions actives
    const connections = await client.query(
      'SELECT COUNT(*) as active_connections FROM pg_stat_activity WHERE state = $1',
      ['active']
    );
    console.log(`🔌 Connexions actives: ${connections.rows[0].active_connections}`);
    
    return true;
  } catch (error) {
    console.error('❌ Échec de la connexion PostgreSQL:', error.message);
    console.error('   Code:', error.code);
    console.error('   Détails:', error.detail || 'N/A');
    
    console.log('\n🔧 Conseils de dépannage:');
    console.log('   1. Vérifiez que PostgreSQL est en cours d\'exécution');
    console.log('   2. Vérifiez les paramètres dans le fichier .env');
    console.log('   3. Vérifiez que la base de données "ctrl_presence" existe');
    console.log('   4. Testez la connexion avec: psql -U postgres -d ctrl_presence');
    console.log('   5. Vérifiez le fichier pg_hba.conf si nécessaire');
    
    // Si la base n'existe pas, donner des instructions
    if (error.code === '3D000' || error.message.includes('does not exist')) {
      console.log('\n💡 La base de données n\'existe pas. Créez-la avec:');
      console.log('   CREATE DATABASE ctrl_presence;');
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

// Fonction query wrapper pour compatibilité avec syntaxe MySQL
// Retourne directement l'objet result (comme pool.query) pour compatibilité avec qrController
const query = async (sql, params = []) => {
  try {
    // Convertir la syntaxe MySQL en PostgreSQL si nécessaire
    const { query: convertedQuery, params: convertedParams } = convertMySQLToPostgreSQL(sql, params);
    const result = await pool.query(convertedQuery, convertedParams);
    return result;
  } catch (error) {
    console.error('❌ Erreur SQL:', error.message);
    console.error('Query originale:', sql);
    console.error('Query convertie:', convertMySQLToPostgreSQL(sql, params).query);
    console.error('Params:', params);
    throw error;
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
  query, // Utiliser notre wrapper qui convertit MySQL -> PostgreSQL
  initializeDatabase,
  testConnection
};