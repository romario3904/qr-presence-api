// Script pour vérifier la connexion PostgreSQL et créer la base si nécessaire
const { Pool } = require('pg');
require('dotenv').config();

async function checkDatabase() {
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'daroms004',
    database: 'postgres', // Se connecter à la base par défaut
    connectionTimeoutMillis: 30000,
  });

  const dbName = process.env.DB_NAME || 'ctrl_presence';
  let client;

  try {
    console.log('🔍 Vérification de la connexion PostgreSQL...');
    console.log(`📍 Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`📍 Port: ${process.env.DB_PORT || 5432}`);
    console.log(`📍 User: ${process.env.DB_USER || 'postgres'}`);
    
    client = await adminPool.connect();
    console.log('✅ Connecté à PostgreSQL');

    // Vérifier si la base de données existe
    const dbCheck = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (dbCheck.rows.length === 0) {
      console.log(`\n⚠️  La base de données "${dbName}" n'existe pas.`);
      console.log('💡 Création de la base de données...');
      
      // Note: On ne peut pas créer une DB dans une transaction
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Base de données "${dbName}" créée avec succès !`);
    } else {
      console.log(`✅ La base de données "${dbName}" existe déjà.`);
    }

    // Tester la connexion à la base cible
    client.release();
    await adminPool.end();

    const targetPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'daroms004',
      database: dbName,
      connectionTimeoutMillis: 30000,
    });

    const targetClient = await targetPool.connect();
    const result = await targetClient.query('SELECT NOW() as server_time, version() as version');
    console.log(`\n✅ Connexion à "${dbName}" réussie !`);
    console.log(`📅 Heure serveur: ${result.rows[0].server_time}`);
    console.log(`📦 Version PostgreSQL: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
    
    targetClient.release();
    await targetPool.end();

    console.log('\n🎉 Tout est prêt ! Vous pouvez démarrer le serveur.');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    console.error('   Code:', error.code);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 PostgreSQL n\'est pas démarré ou n\'écoute pas sur ce port.');
      console.log('   Démarrez PostgreSQL avec: net start postgresql-x64-XX (Windows)');
    } else if (error.code === '28P01' || error.message.includes('password')) {
      console.log('\n💡 Mot de passe incorrect. Vérifiez le fichier .env');
    } else if (error.code === '3D000') {
      console.log(`\n💡 La base "${dbName}" n'existe pas et n'a pas pu être créée.`);
      console.log('   Créez-la manuellement avec: CREATE DATABASE ctrl_presence;');
    }
    
    process.exit(1);
  }
}

checkDatabase();

