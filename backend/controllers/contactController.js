// controllers/contactController.js
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const { asyncHandler }             = require('../middleware/errorHandler');
const logger                       = require('../utils/logger');
const { pool }                     = require('../config/db');
const { emailService }             = require('../services/emailService');

// ── POST /api/contact ─────────────────────────────────────────
const sendMessage = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !subject || !message?.trim()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Tous les champs sont requis', code: ERROR_CODES.VALIDATION_ERROR
    });
  }
  if (message.trim().length < 10) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Le message doit faire au moins 10 caractères', code: ERROR_CODES.VALIDATION_ERROR
    });
  }
  const validSubjects = ['question', 'support', 'business', 'complaint', 'other'];
  if (!validSubjects.includes(subject)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Sujet invalide', code: ERROR_CODES.VALIDATION_ERROR
    });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || null;

  const result = await pool.query(
    `INSERT INTO contact_messages (name, email, phone, subject, message, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
    [name.trim(), email.trim().toLowerCase(), phone.trim(), subject, message.trim(), ip]
  );

  const { id, created_at } = result.rows[0];
  logger.info('Nouveau message de contact', { id, email: email.trim().toLowerCase(), subject });

  // Notifier l'admin par email (non bloquant)
  emailService.sendContactNotification({
    name: name.trim(), email: email.trim().toLowerCase(),
    phone: phone.trim(), subject, message: message.trim(), messageId: id
  }).catch(err => logger.warn('Notification email contact non bloquante:', err.message));

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Votre message a bien été envoyé. Nous vous répondrons sous 24h.',
    data: { id, created_at }
  });
});

// ── GET /api/contact — Liste admin ────────────────────────────
const getMessages = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let whereClause = '';
  if (status && status !== 'all') { params.push(status); whereClause = `WHERE status = $${params.length}`; }
  params.push(parseInt(limit), offset);

  const [rows, count, unread] = await Promise.all([
    pool.query(`SELECT * FROM contact_messages ${whereClause} ORDER BY CASE WHEN status = 'unread' THEN 0 ELSE 1 END, created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
    pool.query(`SELECT COUNT(*) FROM contact_messages ${whereClause}`, params.slice(0, -2)),
    pool.query(`SELECT COUNT(*) FROM contact_messages WHERE status = 'unread'`)
  ]);

  return res.json({ success: true, data: {
    messages: rows.rows, total: parseInt(count.rows[0].count),
    unread: parseInt(unread.rows[0].count), page: parseInt(page),
    limit: parseInt(limit), total_pages: Math.ceil(parseInt(count.rows[0].count) / parseInt(limit))
  }});
});

// ── GET /api/contact/:id — Détail + marque lu ─────────────────
const getMessage = asyncHandler(async (req, res) => {
  const result = await pool.query(`SELECT * FROM contact_messages WHERE id = $1`, [req.params.id]);
  if (result.rows.length === 0) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Message introuvable', code: ERROR_CODES.NOT_FOUND });
  }
  if (result.rows[0].status === 'unread') {
    await pool.query(`UPDATE contact_messages SET status = 'read' WHERE id = $1`, [req.params.id]);
    result.rows[0].status = 'read';
  }
  return res.json({ success: true, data: result.rows[0] });
});

// ── PATCH /api/contact/:id/reply — Répondre + email au client ─
const replyToMessage = asyncHandler(async (req, res) => {
  const { reply } = req.body;
  if (!reply?.trim()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'La réponse est requise', code: ERROR_CODES.VALIDATION_ERROR });
  }

  const result = await pool.query(
    `UPDATE contact_messages SET status = 'replied', reply = $1, replied_at = NOW(), replied_by = $2 WHERE id = $3 RETURNING *`,
    [reply.trim(), req.user.id, req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Message introuvable', code: ERROR_CODES.NOT_FOUND });
  }

  const msg = result.rows[0];
  logger.info('Réponse contact envoyée', { id: req.params.id, adminId: req.user.id });

  // Envoyer la réponse par email au client (non bloquant)
  emailService.sendContactReply({
    toEmail: msg.email, toName: msg.name,
    originalSubject: msg.subject, originalMessage: msg.message,
    reply: reply.trim(), messageId: msg.id
  }).catch(err => logger.warn('Email réponse contact non bloquant:', err.message));

  return res.json({ success: true, data: msg });
});

// ── PATCH /api/contact/:id/archive — Archiver ────────────────
const archiveMessage = asyncHandler(async (req, res) => {
  const result = await pool.query(`UPDATE contact_messages SET status = 'archived' WHERE id = $1 RETURNING id`, [req.params.id]);
  if (result.rows.length === 0) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Message introuvable', code: ERROR_CODES.NOT_FOUND });
  }
  return res.json({ success: true, message: 'Message archivé' });
});

module.exports = { sendMessage, getMessages, getMessage, replyToMessage, archiveMessage };