const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  client_encoding: 'UTF8',

  min:                    parseInt(process.env.DB_POOL_MIN) || 2,
  max:                    parseInt(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis:      30000,
  connectionTimeoutMillis: 10000,

  keepAlive:                    true,
  keepAliveInitialDelayMillis:  10000,

  statement_timeout: 30000,
  query_timeout:     30000,

  allowExitOnIdle: false,
});

// ✅ Uniquement les erreurs critiques — connect/remove silencieux
pool.on('error', (err) => {
  console.error('❌ Erreur inattendue sur la pool PostgreSQL:', err.message);
});

const testConnection = async () => {
  let retries = 3;
  let delay   = 2000;

  for (let i = 0; i < retries; i++) {
    let client;
    try {
      console.log(`🔍 Tentative de connexion à PostgreSQL (${i + 1}/${retries})...`);
      client = await pool.connect();
      const result = await client.query(
        'SELECT NOW() as now, current_database() as db, current_user as "user"'
      );
      console.log('✅ Connexion PostgreSQL réussie !');
      console.log(`   📊 Base de données : ${result.rows[0].db}`);
      console.log(`   👤 Utilisateur     : ${result.rows[0].user}`);
      console.log(`   ⏰ Timestamp       : ${result.rows[0].now}`);
      client.release();
      return true;
    } catch (err) {
      console.error(`❌ Tentative ${i + 1}/${retries} échouée :`, err.message);
      if (client) { try { client.release(); } catch (_) {} }
      if (i < retries - 1) {
        console.log(`⏳ Nouvelle tentative dans ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        delay = Math.floor(delay * 1.5);
      } else {
        throw new Error(`Impossible de se connecter à PostgreSQL après ${retries} tentatives : ${err.message}`);
      }
    }
  }
};

const closePool = async () => {
  try {
    await pool.end();
    console.log('🔌 Pool PostgreSQL fermée correctement');
  } catch (err) {
    console.error('❌ Erreur lors de la fermeture de la pool :', err.message);
  }
};

const healthCheck = async () => {
  try {
    await pool.query('SELECT 1');
    return { healthy: true, message: 'Database connection OK' };
  } catch (err) {
    return { healthy: false, message: err.message };
  }
};

// ✅ Export UNIQUE et cohérent
// Tous les fichiers importent { pool } pour les requêtes
// pool.query() gère lui-même l'acquire/release automatiquement
module.exports = { pool, testConnection, closePool, healthCheck };