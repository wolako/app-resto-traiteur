const { Pool } = require('pg');
require('dotenv').config();

// ✅ Configuration optimisée de la pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  
  // ✅ Configuration UTF-8
  client_encoding: 'UTF8',
  
  // ✅ CORRECTION : Augmenter les timeouts et optimiser la pool
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // ✅ 10 secondes au lieu de 2
  
  // ✅ NOUVEAU : Options de reconnexion
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  
  // ✅ NOUVEAU : Timeout pour les requêtes
  statement_timeout: 30000, // 30 secondes max par requête
  query_timeout: 30000,
  
  // ✅ NOUVEAU : Gestion des erreurs de connexion
  allowExitOnIdle: false,
});

// ✅ Événements de la pool pour le monitoring
pool.on('connect', (client) => {
  console.log('🔗 Nouvelle connexion à PostgreSQL établie');
});

pool.on('acquire', (client) => {
  // Connection acquise du pool (pour debug si nécessaire)
});

pool.on('remove', (client) => {
  console.log('🔌 Connexion PostgreSQL fermée');
});

pool.on('error', (err, client) => {
  console.error('❌ Erreur inattendue sur la pool PostgreSQL:', err.message);
  // Ne pas arrêter le serveur, juste logger l'erreur
});

// ✅ CORRECTION : Test de connexion à la demande (pas au chargement du module)
const testConnection = async () => {
  let client;
  let retries = 3;
  let delay = 2000; // 2 secondes entre chaque tentative

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔍 Tentative de connexion à PostgreSQL (${i + 1}/${retries})...`);
      
      client = await pool.connect();
      const result = await client.query('SELECT NOW() as now, current_database() as db, current_user as user');
      
      console.log('✅ Connexion PostgreSQL réussie !');
      console.log(`   📊 Base de données: ${result.rows[0].db}`);
      console.log(`   👤 Utilisateur: ${result.rows[0].user}`);
      console.log(`   ⏰ Timestamp: ${result.rows[0].now}`);
      
      client.release();
      return true;
      
    } catch (err) {
      console.error(`❌ Tentative ${i + 1}/${retries} échouée:`, err.message);
      
      if (client) {
        try {
          client.release();
        } catch (releaseErr) {
          // Ignorer les erreurs de release
        }
      }
      
      // Si ce n'est pas la dernière tentative, attendre avant de réessayer
      if (i < retries - 1) {
        console.log(`⏳ Nouvelle tentative dans ${delay / 1000} secondes...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Augmenter le délai progressivement
      } else {
        // Dernière tentative échouée
        throw new Error(`Impossible de se connecter à PostgreSQL après ${retries} tentatives: ${err.message}`);
      }
    }
  }
};

// ✅ Fonction pour fermer proprement la pool
const closePool = async () => {
  try {
    await pool.end();
    console.log('🔌 Pool PostgreSQL fermée correctement');
  } catch (err) {
    console.error('❌ Erreur lors de la fermeture de la pool:', err.message);
  }
};

// ✅ Fonction pour vérifier la santé de la connexion
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT 1 as health');
    return { healthy: true, message: 'Database connection OK' };
  } catch (err) {
    return { healthy: false, message: err.message };
  }
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  testConnection,
  closePool,
  healthCheck,
};