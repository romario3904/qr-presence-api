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

// Configuration CORS
const parseCorsOrigins = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '*') return '*';
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const corsOriginsFromEnv = parseCorsOrigins(process.env.CORS_ORIGIN);
const defaultDevOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];

const corsOptions = {
  origin:
    corsOriginsFromEnv === '*'
      ? (origin, cb) => cb(null, true)
      : corsOriginsFromEnv || defaultDevOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
};

// Middleware CORS
app.use(cors(corsOptions));

// Middleware pour parser le JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de logging
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log(`📦 Body:`, req.body);
  }
  next();
});

// Initialisation asynchrone du serveur
async function startServer() {
  try {
    console.log('🎯 Démarrage de l\'API Contrôle de Présence...');
    console.log('=============================================');
    
    // 1. Initialiser la base de données
    console.log('🔧 Initialisation de la base de données...');
    const dbConnected = await initializeDatabase();
    
    if (!dbConnected) {
      throw new Error('❌ Impossible de se connecter à la base de données');
    }
    
    console.log('✅ Base de données connectée avec succès');
    
    // 2. Monter les routes
    console.log('🛣️  Configuration des routes...');
    app.use('/api/auth', authRoutes);
    app.use('/api/qr', qrRoutes);
    app.use('/api/presence', presenceRoutes);
    app.use('/api/matiere', matiereRoutes);
    
    // 3. Routes de base
    setupBaseRoutes();
    
    // 4. Démarrer le serveur
    const PORT = process.env.PORT || 3002;
    
    const server = app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`🌍 CORS autorisé pour: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
      console.log(`📊 Environnement: ${process.env.NODE_ENV || 'development'}`);
      console.log('\n✅ API prête à recevoir des requêtes !');
    });
    
    // Gestion des erreurs d'écoute
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Le port ${PORT} est déjà utilisé`);
        console.log('💡 Solutions:');
        console.log(`   1. Changez le port dans le fichier .env`);
        console.log(`   2. Tuez le processus avec:`);
        console.log(`      netstat -ano | findstr :${PORT}`);
        console.log(`      taskkill /PID [PID] /F`);
      }
      process.exit(1);
    });
    
    // Gestion propre de l'arrêt
    setupGracefulShutdown(server);
    
  } catch (error) {
    console.error('💥 Erreur au démarrage:', error.message);
    console.log('\n🔧 Vérifiez que:');
    console.log('   1. PostgreSQL est démarré');
    console.log('   2. Le fichier .env est correctement configuré');
    console.log('   3. La base "ctrl_presence" existe');
    process.exit(1);
  }
}

// Fonction pour configurer les routes de base
function setupBaseRoutes() {
  // Route racine
  app.get('/', (req, res) => {
    res.json({
      message: 'API Server is running! 🚀',
      version: '1.0.0',
      database: 'PostgreSQL',
      timestamp: new Date().toISOString(),
      endpoints: {
        auth: '/api/auth',
        qr: '/api/qr',
        presence: '/api/presence',
        matiere: '/api/matiere',
        health: '/api/health',
        docs: '/api/docs'
      }
    });
  });

  // Route de santé
  app.get('/api/health', async (req, res) => {
    try {
      const { testConnection } = require('./config/database');
      const dbHealthy = await testConnection();
      
      res.json({ 
        status: 'OK',
        message: 'Serveur en ligne',
        database: dbHealthy ? 'CONNECTED' : 'DISCONNECTED',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    } catch (error) {
      res.status(500).json({
        status: 'ERROR',
        message: 'Erreur de vérification'
      });
    }
  });

  // Documentation API
  app.get('/api/docs', (req, res) => {
    res.json({
      title: 'API Documentation',
      version: '1.0.0',
      endpoints: {
        auth: {
          login: 'POST /api/auth/login',
          register: 'POST /api/auth/register',
          me: 'GET /api/auth/me'
        },
        qr: {
          generate: 'POST /api/qr/generate',
          validate: 'POST /api/qr/validate'
        },
        presence: {
          mark: 'POST /api/presence/mark',
          history: 'GET /api/presence/history'
        },
        matiere: {
          list: 'GET /api/matiere',
          create: 'POST /api/matiere'
        }
      }
    });
  });

  // Gestion des erreurs 404
  app.use('*', (req, res) => {
    res.status(404).json({ 
      success: false,
      message: 'Route non trouvée',
      path: req.originalUrl
    });
  });

  // Gestion des erreurs globales
  app.use((error, req, res, next) => {
    console.error('❌ Erreur:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur interne du serveur'
    });
  });
}

// Fonction pour gérer l'arrêt propre
function setupGracefulShutdown(server) {
  const shutdown = async (signal) => {
    console.log(`\n🔻 Réception du signal ${signal}...`);
    
    // Fermer le serveur
    server.close(() => {
      console.log('✅ Serveur HTTP fermé');
      
      // Fermer la base de données
      const { pool } = require('./config/database');
      pool.end(() => {
        console.log('✅ Pool de connexions PostgreSQL fermé');
        console.log('👋 Arrêt complet');
        process.exit(0);
      });
    });
    
    // Timeout forcé après 10 secondes
    setTimeout(() => {
      console.error('❌ Arrêt forcé après timeout');
      process.exit(1);
    }, 10000);
  };
  
  // Capturer les signaux d'arrêt
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Démarrer le serveur
if (require.main === module) {
  startServer();
}

module.exports = app;