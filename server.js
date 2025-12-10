// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import de la base de données
const { initializeDatabase } = require('./config/database');

// Routes
const authRoutes = require('./routes/auth');
const qrRoutes = require('./routes/qr');
const presenceRoutes = require('./routes/presence');
const matiereRoutes = require('./routes/matiere');

const app = express();

// Configuration CORS pour production
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://qr-presence-app.vercel.app', // Votre frontend Vercel
  process.env.FRONTEND_URL // Variable d'environnement
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Autoriser les requêtes sans origin (comme les apps mobiles, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Vérifier si l'origine est autorisée
    const isAllowed = allowedOrigins.some(allowedOrigin => 
      origin === allowedOrigin || 
      origin.startsWith(allowedOrigin.replace('https://', 'http://'))
    );
    
    if (isAllowed || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS bloqué pour l'origine: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Powered-By']
};

// Middleware CORS
app.use(cors(corsOptions));

// Gérer les pré-vols OPTIONS
app.options('*', cors(corsOptions));

// Middleware pour parser le JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== MIDDLEWARE DE DEBUG DÉTAILLÉ ====================
app.use((req, res, next) => {
  console.log(`\n📥 ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  console.log('📋 Headers Authorization:', req.headers.authorization ? 'PRESENT' : 'MISSING');
  
  // Ne pas logger le token complet pour la sécurité
  if (req.headers.authorization) {
    const token = req.headers.authorization;
    if (token.startsWith('Bearer ')) {
      console.log(`🔐 Token présent (${token.length} caractères)`);
    }
  }
  
  // Logger les paramètres de requête
  if (Object.keys(req.query).length > 0) {
    console.log('🔍 Query params:', req.query);
  }
  
  // Logger le body pour POST/PUT
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('📦 Body:', req.body);
  }
  
  // Intercepter les réponses pour logger les erreurs
  const originalSend = res.send;
  res.send = function(body) {
    const responseTime = Date.now() - req._startTime;
    
    if (res.statusCode >= 400) {
      console.error(`❌ ${req.method} ${req.originalUrl} -> ${res.statusCode} (${responseTime}ms)`);
      console.error('📤 Réponse erreur:', typeof body === 'string' ? body.substring(0, 200) + '...' : body);
    } else {
      console.log(`✅ ${req.method} ${req.originalUrl} -> ${res.statusCode} (${responseTime}ms)`);
      
      // Logger les réponses de succès pour les routes critiques
      const criticalRoutes = ['/api/matiere', '/api/qr/seances', '/api/auth/login'];
      if (criticalRoutes.some(route => req.originalUrl.includes(route))) {
        console.log('📊 Réponse succès:', typeof body === 'string' ? 
          (body.length > 500 ? body.substring(0, 500) + '...' : body) : 
          JSON.stringify(body).substring(0, 200) + '...');
      }
    }
    
    return originalSend.call(this, body);
  };
  
  // Ajouter un timestamp pour calculer le temps de réponse
  req._startTime = Date.now();
  
  next();
});

// Middleware de sécurité
app.use((req, res, next) => {
  // Headers de sécurité
  res.setHeader('X-Powered-By', 'Controle Presence API');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  
  next();
});

// Initialisation asynchrone du serveur
async function startServer() {
  try {
    console.log('🎯 Démarrage de l\'API Contrôle de Présence...');
    console.log('=============================================');
    console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔧 Version Node: ${process.version}`);
    console.log(`🌐 CORS autorisé pour: ${allowedOrigins.join(', ')}`);
    
    // 1. Initialiser la base de données
    console.log('🔧 Initialisation de la base de données...');
    const dbConnected = await initializeDatabase();
    
    if (!dbConnected) {
      throw new Error('❌ Impossible de se connecter à la base de données');
    }
    
    console.log('✅ Base de données connectée avec succès');
    
    // 2. Vérifier/Créer les tables
    console.log('📊 Vérification de la structure de la base...');
    const { checkAndFixDatabaseStructure } = require('./config/database');
    await checkAndFixDatabaseStructure();
    
    // 3. Monter les routes
    console.log('🛣️  Configuration des routes...');
    
    // Routes avec logging spécifique
    const routesWithLogging = [
      { path: '/api/auth', router: authRoutes, name: 'Auth' },
      { path: '/api/qr', router: qrRoutes, name: 'QR' },
      { path: '/api/presence', router: presenceRoutes, name: 'Presence' },
      { path: '/api/matiere', router: matiereRoutes, name: 'Matiere' }
    ];
    
    routesWithLogging.forEach(({ path, router, name }) => {
      app.use(path, router);
      console.log(`   ${name} routes montées sur ${path}`);
    });
    
    // 4. Routes de base
    app.get('/', (req, res) => {
      res.json({
        message: 'API Contrôle de Présence 🚀',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        status: 'online',
        timestamp: new Date().toISOString(),
        endpoints: {
          auth: '/api/auth',
          qr: '/api/qr',
          presence: '/api/presence',
          matiere: '/api/matiere'
        }
      });
    });

    app.get('/api/health', async (req, res) => {
      try {
        console.log('🏥 Vérification santé du serveur...');
        const { testConnection } = require('./config/database');
        const dbHealthy = await testConnection();
        
        const healthStatus = {
          status: 'OK',
          message: 'API en ligne',
          database: dbHealthy ? 'CONNECTED' : 'DISCONNECTED',
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform
        };
        
        console.log('🏥 Statut santé:', healthStatus);
        
        res.json(healthStatus);
      } catch (error) {
        console.error('🏥 Erreur vérification santé:', error);
        res.status(500).json({
          status: 'ERROR',
          message: 'Erreur de vérification'
        });
      }
    });

    // Route de debug pour tester la DB
    app.get('/api/debug/db', async (req, res) => {
      try {
        console.log('🐛 Debug DB request...');
        const db = require('./config/database');
        
        // Test 1: Connexion simple
        const test1 = await db.query('SELECT 1 as test');
        
        // Test 2: Lister les tables
        const tables = await db.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
          ORDER BY table_name
        `);
        
        // Test 3: Compter les matières
        let matieresCount = 0;
        try {
          const matieres = await db.query('SELECT COUNT(*) as count FROM matieres');
          matieresCount = matieres.rows[0].count;
        } catch (error) {
          console.log('Table matieres non trouvée:', error.message);
        }
        
        // Test 4: Compter les enseignants
        let enseignantsCount = 0;
        try {
          const enseignants = await db.query('SELECT COUNT(*) as count FROM enseignants');
          enseignantsCount = enseignants.rows[0].count;
        } catch (error) {
          console.log('Table enseignants non trouvée:', error.message);
        }
        
        res.json({
          success: true,
          db_connected: true,
          tables: tables.rows.map(t => t.table_name),
          counts: {
            matieres: matieresCount,
            enseignants: enseignantsCount
          },
          test_query: test1.rows[0]
        });
        
      } catch (error) {
        console.error('🐛 Debug DB error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });

    // Gestion des erreurs 404
    app.use('*', (req, res) => {
      console.warn(`🚫 Route non trouvée: ${req.method} ${req.originalUrl}`);
      res.status(404).json({ 
        success: false,
        message: 'Route non trouvée',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    // Gestion des erreurs globales
    app.use((error, req, res, next) => {
      console.error('❌ Erreur globale non attrapée:');
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
      console.error('   URL:', req.originalUrl);
      console.error('   Method:', req.method);
      
      const statusCode = error.statusCode || 500;
      const message = process.env.NODE_ENV === 'production' 
        ? 'Erreur interne du serveur' 
        : error.message;
      
      res.status(statusCode).json({ 
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : undefined,
        timestamp: new Date().toISOString()
      });
    });
    
    // 5. Démarrer le serveur
    const PORT = process.env.PORT || 3002;
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`📍 URL: http://0.0.0.0:${PORT}`);
      console.log(`🌐 URL externe: https://qr-presence-api.onrender.com`);
      console.log('✅ API prête à recevoir des requêtes !');
      console.log('\n🔍 Routes disponibles:');
      console.log('   GET  /              - Page d\'accueil');
      console.log('   GET  /api/health    - Vérification santé');
      console.log('   GET  /api/debug/db  - Debug base de données');
      console.log('   GET  /api/matiere   - Matières (enseignant)');
      console.log('   GET  /api/qr/seances - Séances (enseignant)');
    });
    
    // Gestion des erreurs d'écoute
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Le port ${PORT} est déjà utilisé`);
      } else {
        console.error(`❌ Erreur démarrage serveur:`, error);
      }
      process.exit(1);
    });
    
    // Gestion de l'arrêt propre
    process.on('SIGTERM', () => {
      console.log('🛑 Signal SIGTERM reçu, arrêt propre du serveur...');
      server.close(() => {
        console.log('👋 Serveur arrêté proprement');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('💥 Erreur au démarrage:', error.message);
    console.error('Stack trace:', error.stack);
    console.log('\n🔧 Vérifiez que:');
    console.log('   1. DATABASE_URL est correct dans .env');
    console.log('   2. La base de données existe sur Render');
    console.log('   3. Les identifiants sont corrects');
    console.log('   4. Le service PostgreSQL est actif sur Render');
    process.exit(1);
  }
}

// Démarrer le serveur
if (require.main === module) {
  startServer();
}

module.exports = app;
