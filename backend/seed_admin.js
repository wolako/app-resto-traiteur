const bcrypt = require('bcryptjs');
const { pool } = require('./config/db');
const { logger } = require('./utils/logger');

/**
 * Créer le compte super-admin par défaut
 */
async function createSuperAdmin() {
  const defaultAdmin = {
    email: process.env.ADMIN_EMAIL || 'admin@restotraiteur.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@2025!',
    first_name: 'Super',
    last_name: 'Admin',
    phone: process.env.ADMIN_PHONE || '+22890000000',
    role: 'superadmin'
  };

  try {
    // Vérifier si le super-admin existe déjà
    const checkQuery = 'SELECT id, email FROM users WHERE email = $1 OR role = $2';
    const checkResult = await pool.query(checkQuery, [defaultAdmin.email, 'superadmin']);

    if (checkResult.rows.length > 0) {
      console.log(`✅ Super-admin already exists: ${checkResult.rows[0].email}`);
      logger.info('Super-admin already exists', { email: checkResult.rows[0].email });
      return;
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(defaultAdmin.password, 12);

    // Créer le super-admin
    const insertQuery = `
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, role
    `;
    
    const result = await pool.query(insertQuery, [
      defaultAdmin.email,
      hashedPassword,
      defaultAdmin.role,
      defaultAdmin.first_name,
      defaultAdmin.last_name,
      defaultAdmin.phone,
      true
    ]);

    console.log('='.repeat(60));
    console.log('🔐 Super-admin created successfully!');
    console.log('='.repeat(60));
    console.log(`📧 Email    : ${defaultAdmin.email}`);
    console.log(`🔑 Password : ${defaultAdmin.password}`);
    console.log(`🆔 User ID  : ${result.rows[0].id}`);
    console.log('='.repeat(60));
    console.log('⚠️  IMPORTANT: Change the default password in production!');
    console.log('='.repeat(60));

    logger.info('Super-admin created', {
      userId: result.rows[0].id,
      email: result.rows[0].email
    });

  } catch (error) {
    // Si l'erreur est une violation d'unicité, c'est OK
    if (error.code === '23505') {
      console.log('✅ Super-admin already exists (unique constraint)');
      return;
    }

    console.error('❌ Error creating super-admin:', error.message);
    logger.error('Error creating super-admin', {
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // Ne pas arrêter le serveur pour cette erreur
    // throw error;
  }
}

/**
 * Créer des comptes de test (optionnel - uniquement en développement)
 */
// async function createTestAccounts() {
//   if (process.env.NODE_ENV === 'production') {
//     console.log('⏭️  Skipping test accounts creation in production');
//     return;
//   }

//   const testAccounts = [
//     {
//       email: 'restaurant1@test.com',
//       password: 'password',
//       role: 'restaurant',
//       first_name: 'Jean',
//       last_name: 'Dupont',
//       phone: '+22890234567',
//       business_name: 'Chez Jean Restaurant',
//       business_type: 'restaurant'
//     },
//     {
//       email: 'caterer1@test.com',
//       password: 'password',
//       role: 'caterer',
//       first_name: 'Paul',
//       last_name: 'Kouassi',
//       phone: '+22890456789',
//       business_name: 'Traiteur Paul Événements',
//       business_type: 'caterer'
//     },
//     {
//       email: 'client1@test.com',
//       password: 'password',
//       role: 'client',
//       first_name: 'Kofi',
//       last_name: 'Asante',
//       phone: '+22890678901'
//     }
//   ];

//   console.log('\n📝 Creating test accounts...');

//   for (const account of testAccounts) {
//     try {
//       // Vérifier si l'utilisateur existe
//       const checkResult = await pool.query('SELECT id FROM users WHERE email = $1', [account.email]);
      
//       if (checkResult.rows.length > 0) {
//         console.log(`  ⏭️  ${account.email} already exists`);
//         continue;
//       }

//       // Hasher le mot de passe
//       const hashedPassword = await bcrypt.hash(account.password, 12);

//       // Créer l'utilisateur
//       const userResult = await pool.query(
//         `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active)
//          VALUES ($1, $2, $3, $4, $5, $6, $7)
//          RETURNING id`,
//         [account.email, hashedPassword, account.role, account.first_name, account.last_name, account.phone, true]
//       );

//       console.log(`  ✅ Created ${account.role}: ${account.email}`);

//       // Créer le business si nécessaire
//       if (account.business_name && (account.role === 'restaurant' || account.role === 'caterer')) {
//         await pool.query(
//           `INSERT INTO businesses (user_id, name, type, is_active)
//            VALUES ($1, $2, $3, $4)`,
//           [userResult.rows[0].id, account.business_name, account.business_type, true]
//         );
//         console.log(`     └─ Business created: ${account.business_name}`);
//       }

//     } catch (error) {
//       if (error.code === '23505') {
//         console.log(`  ⏭️  ${account.email} already exists (unique constraint)`);
//       } else {
//         console.error(`  ❌ Error creating ${account.email}:`, error.message);
//       }
//     }
//   }

//   console.log('✅ Test accounts creation completed\n');
// }

module.exports = {
  createSuperAdmin,
//   createTestAccounts
};