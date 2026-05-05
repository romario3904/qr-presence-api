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

// Configuration CORS - IMPORTANT pour Vercel
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
  'https://*.vercel.app'
].filter(Boolean);

const corsOptions = {
  origin: function(origin, callback) {
    // Permettre les requêtes sans origin (Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`).test(origin);
      }
      return allowed === origin;
    })) {
      callback(null, true);
    } else {
      console.log(`❌ CORS bloqué: ${origin}`);
      callback(null, true); // En production, mettez false
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
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
    console.log(`📦 Body:`, JSON.stringify(req.body).substring(0, 200));
  }
  next();
});

// Route de santé (sans authentification)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Lancement du serveur
async function startServer() {
  try {
    console.log('🎯 Démarrage de l\'API Contrôle de Présence...');
    console.log('=============================================');
    console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
    
    // Initialiser la base de données
    console.log('🔧 Connexion à la base de données...');
    const dbConnected = await initializeDatabase();
    
    if (!dbConnected) {
      console.error('❌ Impossible de se connecter à la base de données');
      process.exit(1);
    }
    
    console.log('✅ Base de données connectée');
    
    // Monter les routes
    console.log('🛣️  Configuration des routes...');
    app.use('/api/auth', authRoutes);
    app.use('/api/qr', qrRoutes);
    app.use('/api/presence', presenceRoutes);
    app.use('/api/matiere', matiereRoutes);
    
    // Route racine
    app.get('/', (req, res) => {
      res.json({
        message: 'API Contrôle de Présence 🚀',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          auth: '/api/auth',
          qr: '/api/qr',
          presence: '/api/presence',
          matiere: '/api/matiere'
        }
      });
    });
    
    // Route 404
    app.use('*', (req, res) => {
      res.status(404).json({ 
        success: false,
        message: 'Route non trouvée',
        path: req.originalUrl
      });
    });
    
    // Gestion des erreurs globales
    app.use((error, req, res, next) => {
      console.error('❌ Erreur serveur:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur interne du serveur'
      });
    });
    
    // Démarrer le serveur
    const PORT = process.env.PORT || 3002;
    
    const server = app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`📍 URL: https://${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
      console.log('\n✅ API prête !');
    });
    
    // Gestion des erreurs d'écoute
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Le port ${PORT} est déjà utilisé`);
      }
      process.exit(1);
    });
    
    // Arrêt propre
    process.on('SIGINT', () => {
      console.log('\n🔻 Arrêt du serveur...');
      server.close(() => {
        pool.end(() => {
          console.log('👋 Arrêt complet');
          process.exit(0);
        });
      });
    });
    
  } catch (error) {
    console.error('💥 Erreur au démarrage:', error.message);
    process.exit(1);
  }
}

// Si exécuté directement
if (require.main === module) {
  startServer();
}

module.exports = app;