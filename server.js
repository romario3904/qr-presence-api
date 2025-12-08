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
  process.env.FRONTEND_URL // URL de votre frontend déployé
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Autoriser les requêtes sans origin (comme les apps mobiles, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || 
        process.env.NODE_ENV === 'development' ||
        origin.includes('render.com')) {
      callback(null, true);
    } else {
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

// Middleware de logging (uniquement en développement)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.url}`);
    if (req.method === 'POST' || req.method === 'PUT') {
      console.log(`📦 Body:`, req.body);
    }
    next();
  });
}

// Middleware de sécurité
app.use((req, res, next) => {
  // Headers de sécurité
  res.setHeader('X-Powered-By', 'Controle Presence API');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Rate limiting headers
  res.setHeader('X-RateLimit-Limit', '100');
  res.setHeader('X-RateLimit-Remaining', '99');
  res.setHeader('X-RateLimit-Reset', Date.now() + 60000);
  
  next();
});

// Initialisation asynchrone du serveur
async function startServer() {
  try {
    console.log('🎯 Démarrage de l\'API Contrôle de Présence...');
    console.log('=============================================');
    console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔧 Version Node: ${process.version}`);
    
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
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`📍 URL: http://0.0.0.0:${PORT}`);
      console.log(`🌍 CORS autorisé pour: ${allowedOrigins.join(', ')}`);
      console.log('\n✅ API prête à recevoir des requêtes !');
    });
    
    // Augmenter le timeout pour les longues requêtes
    server.setTimeout(30000);
    
    // Gestion des erreurs d'écoute
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Le port ${PORT} est déjà utilisé`);
        console.log('💡 Solutions:');
        console.log(`   1. Changez le port dans le fichier .env`);
        console.log(`   2. Attendez quelques secondes et réessayez`);
      }
      process.exit(1);
    });
    
    // Gestion des connexions
    server.on('connection', (socket) => {
      socket.setTimeout(30000);
    });
    
    // Gestion propre de l'arrêt
    setupGracefulShutdown(server);
    
  } catch (error) {
    console.error('💥 Erreur au démarrage:', error.message);
    console.log('\n🔧 Vérifiez que:');
    console.log('   1. PostgreSQL est démarré');
    console.log('   2. Le fichier .env est correctement configuré');
    console.log('   3. La base de données existe');
    console.log('   4. Les variables d\'environnement sont définies');
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
      environment: process.env.NODE_ENV || 'development',
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
        status: dbHealthy ? 'OK' : 'ERROR',
        message: 'Serveur en ligne',
        database: dbHealthy ? 'CONNECTED' : 'DISCONNECTED',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
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
      baseUrl: `${req.protocol}://${req.get('host')}`,
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
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  });

  // Gestion des erreurs globales
  app.use((error, req, res, next) => {
    console.error('❌ Erreur:', error);
    
    const statusCode = error.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' 
      ? 'Erreur interne du serveur' 
      : error.message;
    
    res.status(statusCode).json({ 
      success: false,
      message,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    });
  });
}

// Fonction pour gérer l'arrêt propre
function setupGracefulShutdown(server) {
  const shutdown = async (signal) => {
    console.log(`\n🔻 Réception du signal ${signal}...`);
    
    // Empêcher de nouvelles connexions
    server.closeIdleConnections();
    
    // Fermer le serveur
    server.close(async () => {
      console.log('✅ Serveur HTTP fermé');
      
      // Fermer la base de données
      try {
        const { pool } = require('./config/database');
        await pool.end();
        console.log('✅ Pool de connexions PostgreSQL fermé');
      } catch (error) {
        console.error('❌ Erreur lors de la fermeture de la base de données:', error.message);
      }
      
      console.log('👋 Arrêt complet');
      process.exit(0);
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
  
  // Gérer les exceptions non catchées
  process.on('uncaughtException', (error) => {
    console.error('💥 Exception non catchée:', error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Rejet non géré:', reason);
  });
}

// Démarrer le serveur
if (require.main === module) {
  startServer();
}

module.exports = app;