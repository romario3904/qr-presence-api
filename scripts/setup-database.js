// scripts/setup-database.js
require('dotenv').config();
const { createTablesIfNotExist } = require('../config/database');

async function setupDatabase() {
  console.log('🔄 Démarrage de la configuration de la base de données...');
  
  try {
    const success = await createTablesIfNotExist();
    
    if (success) {
      console.log('✅ Configuration de la base de données terminée avec succès!');
      process.exit(0);
    } else {
      console.error('❌ Échec de la configuration de la base de données');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Erreur lors de la configuration:', error);
    process.exit(1);
  }
}

setupDatabase();