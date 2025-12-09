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

// Middleware de logging
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} ${req.method} ${req.url}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log(`📦 Body:`, req.body);
  }
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
    app.use('/api/auth', authRoutes);
    app.use('/api/qr', qrRoutes);
    app.use('/api/presence', presenceRoutes);
    app.use('/api/matiere', matiereRoutes);
    
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
        const { testConnection } = require('./config/database');
        const dbHealthy = await testConnection();
        
        res.json({ 
          status: 'OK',
          message: 'API en ligne',
          database: dbHealthy ? 'CONNECTED' : 'DISCONNECTED',
          environment: process.env.NODE_ENV || 'development',
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
        timestamp: new Date().toISOString()
      });
    });
    
    // 5. Démarrer le serveur
    const PORT = process.env.PORT || 3002;
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`📍 URL: http://0.0.0.0:${PORT}`);
      console.log('✅ API prête à recevoir des requêtes !');
    });
    
    // Gestion des erreurs d'écoute
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Le port ${PORT} est déjà utilisé`);
      }
      process.exit(1);
    });
    
  } catch (error) {
    console.error('💥 Erreur au démarrage:', error.message);
    console.log('\n🔧 Vérifiez que:');
    console.log('   1. DATABASE_URL est correct dans .env');
    console.log('   2. La base de données existe sur Render');
    console.log('   3. Les identifiants sont corrects');
    process.exit(1);
  }
}

// Démarrer le serveur
if (require.main === module) {
  startServer();
}

module.exports = app;
