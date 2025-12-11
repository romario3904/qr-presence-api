// fix_matiere_structure.js
const db = require('./config/database');

async function fixMatiereStructure() {
  let client;
  try {
    console.log('🔄 Correction de la structure de la base de données...');
    
    client = await db.pool.connect();
    await client.query('BEGIN');
    
    // 1. Vérifier et renommer les colonnes si nécessaire
    console.log('🔍 Vérification de la table matieres...');
    const checkColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'matieres'
    `);
    
    const columns = checkColumns.rows.map(row => row.column_name);
    console.log('Colonnes actuelles:', columns);
    
    // Renommer 'nom' en 'nom_matiere' si existe
    if (columns.includes('nom') && !columns.includes('nom_matiere')) {
      console.log('🔄 Renommage de "nom" en "nom_matiere"...');
      await client.query('ALTER TABLE matieres RENAME COLUMN nom TO nom_matiere');
      console.log('✅ Colonne renommée');
    }
    
    // Renommer 'code' en 'code_matiere' si existe
    if (columns.includes('code') && !columns.includes('code_matiere')) {
      console.log('🔄 Renommage de "code" en "code_matiere"...');
      await client.query('ALTER TABLE matieres RENAME COLUMN code TO code_matiere');
      console.log('✅ Colonne renommée');
    }
    
    // 2. Ajouter les colonnes manquantes
    console.log('🔍 Ajout des colonnes manquantes...');
    
    const missingColumns = [
      { name: 'credit', type: 'INTEGER' },
      { name: 'niveau_enseignee', type: 'VARCHAR(50)' },
      { name: 'mention_enseignee', type: 'VARCHAR(100)' },
      { name: 'parcours_enseignee', type: 'VARCHAR(100)' },
      { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
    ];
    
    for (const col of missingColumns) {
      if (!columns.includes(col.name)) {
        console.log(`🔄 Ajout de "${col.name}"...`);
        await client.query(`ALTER TABLE matieres ADD COLUMN ${col.name} ${col.type}`);
        console.log(`✅ "${col.name}" ajoutée`);
      }
    }
    
    // 3. Créer la table enseignant_matiere si elle n'existe pas
    console.log('🔍 Vérification de la table enseignant_matiere...');
    const checkEnseignantMatiere = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'enseignant_matiere'
      )
    `);
    
    if (!checkEnseignantMatiere.rows[0].exists) {
      console.log('🔄 Création de la table enseignant_matiere...');
      await client.query(`
        CREATE TABLE enseignant_matiere (
          id_enseignant_matiere SERIAL PRIMARY KEY,
          id_enseignant INTEGER REFERENCES enseignants(id_enseignant),
          id_matiere INTEGER REFERENCES matieres(id_matiere),
          UNIQUE(id_enseignant, id_matiere),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Table enseignant_matiere créée');
      
      // Migrer les données si id_enseignant existe dans matieres
      console.log('🔄 Migration des données existantes...');
      const checkIdEnseignant = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'matieres' 
        AND column_name = 'id_enseignant'
      `);
      
      if (checkIdEnseignant.rows.length > 0) {
        console.log('🔄 Migration des liaisons enseignant-matiere...');
        await client.query(`
          INSERT INTO enseignant_matiere (id_enseignant, id_matiere)
          SELECT id_enseignant, id_matiere 
          FROM matieres 
          WHERE id_enseignant IS NOT NULL
        `);
        console.log('✅ Données migrées');
      }
    }
    
    // 4. Supprimer l'ancienne colonne id_enseignant si elle existe
    const checkOldColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'matieres' 
      AND column_name = 'id_enseignant'
    `);
    
    if (checkOldColumn.rows.length > 0) {
      console.log('🔄 Suppression de l\'ancienne colonne id_enseignant...');
      await client.query('ALTER TABLE matieres DROP COLUMN id_enseignant');
      console.log('✅ Ancienne colonne supprimée');
    }
    
    await client.query('COMMIT');
    console.log('✅ Structure de la base de données corrigée avec succès');
    
    // Afficher la structure finale
    const finalStructure = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'matieres'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Structure finale de la table matieres:');
    finalStructure.rows.forEach(col => {
      console.log(`   ${col.column_name} (${col.data_type})`);
    });
    
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('❌ Erreur lors de la correction:', error.message);
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
  fixMatiereStructure();
}
