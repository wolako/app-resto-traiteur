// services/email.service.js
// ✅ CORRECTION sendOrderReceipt :
//    - Remplacement de display:flex par des <table> HTML (compatibilité Gmail/Outlook/Apple Mail)
//    - Design RestoTraiteur cohérent (rouge/vert, pas violet générique)
//    - Labels et valeurs toujours séparés grâce aux <td>

const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        logger.warn('Configuration email manquante (EMAIL_USER ou EMAIL_PASS), service email désactivé');
        return;
      }

      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('Erreur de vérification Gmail:', error);
          this.isConfigured = false;
        } else {
          this.isConfigured = true;
          logger.info('Service email Gmail initialisé avec succès');
        }
      });

    } catch (error) {
      logger.error('Erreur initialisation service email:', error);
      this.isConfigured = false;
    }
  }

  async sendEmail({ to, subject, html, text }) {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Service email non configuré');
      return { success: false, message: 'Service email non disponible' };
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_USER || 'noreply@restaurant-app.com',
        to,
        subject,
        html,
        text,
      });

      logger.info('Email envoyé', { to, subject, messageId: info.messageId });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Erreur envoi email', { to, subject, error: error.message });
      return { success: false, error: error.message };
    }
  }

  // ─── Méthodes existantes (inchangées) ──────────────────────────────────────
  async sendPasswordResetEmail(email, resetToken, firstName) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const appName = process.env.APP_NAME || 'Restaurant App';
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4}
        .container{max-width:600px;margin:20px auto;background-color:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
        .header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px 20px;text-align:center}
        .header h1{margin:0;font-size:24px}
        .content{padding:30px}
        .button{display:inline-block;padding:14px 35px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;text-decoration:none;border-radius:25px;margin:20px 0;font-weight:bold}
        .footer{text-align:center;padding:20px;font-size:12px;color:#6c757d;background-color:#f8f9fa}
        .warning{background-color:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px}
        .link-box{background-color:#f8f9fa;padding:15px;border-radius:5px;word-break:break-all;margin:15px 0;font-size:12px;color:#495057}
      </style></head>
      <body><div class="container">
        <div class="header"><h1>🔐 Réinitialisation de mot de passe</h1></div>
        <div class="content">
          <p>Bonjour <strong>${firstName || 'cher utilisateur'}</strong>,</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe pour votre compte <strong>${appName}</strong>.</p>
          <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
          <div style="text-align:center"><a href="${resetUrl}" class="button">Réinitialiser mon mot de passe</a></div>
          <p style="font-size:13px;color:#6c757d">Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :</p>
          <div class="link-box">${resetUrl}</div>
          <div class="warning"><strong>⚠️ Important :</strong><ul style="margin:10px 0;padding-left:20px">
            <li>Ce lien est valide pendant <strong>1 heure</strong></li>
            <li>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email</li>
            <li>Ne partagez jamais ce lien avec personne</li>
          </ul></div>
          <p style="margin-top:30px">Cordialement,<br><strong>L'équipe ${appName}</strong></p>
        </div>
        <div class="footer"><p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
      </div></body></html>`;
    return this.sendEmail({ to: email, subject: '🔐 Réinitialisation de votre mot de passe', html,
      text: `Bonjour ${firstName || 'cher utilisateur'},\n\nRéinitialisez votre mot de passe : ${resetUrl}\n\nCe lien est valide 1 heure.\n\nL'équipe ${appName}` });
  }

  async sendPasswordChangedEmail(email, firstName) {
    const appName = process.env.APP_NAME || 'Restaurant App';
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@restaurant-app.com';
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4}
        .container{max-width:600px;margin:20px auto;background-color:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
        .header{background:linear-gradient(135deg,#11998e 0%,#38ef7d 100%);color:white;padding:30px 20px;text-align:center}
        .content{padding:30px}.alert{background-color:#d1ecf1;border-left:4px solid #17a2b8;padding:15px;margin:20px 0;border-radius:4px}
        .footer{text-align:center;padding:20px;font-size:12px;color:#6c757d;background-color:#f8f9fa}
      </style></head>
      <body><div class="container">
        <div class="header"><h1>✅ Mot de passe modifié avec succès</h1></div>
        <div class="content">
          <div style="font-size:48px;text-align:center;margin:20px 0">🎉</div>
          <p>Bonjour <strong>${firstName || 'cher utilisateur'}</strong>,</p>
          <p>Votre mot de passe a été modifié avec succès le <strong>${new Date().toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</strong>.</p>
          <div class="alert"><strong>🔒 Sécurité de votre compte</strong><p style="margin:10px 0 0 0">Si vous n'êtes pas à l'origine de cette modification, contactez immédiatement notre support à <a href="mailto:${supportEmail}">${supportEmail}</a></p></div>
          <p style="margin-top:30px">Merci de votre confiance,<br><strong>L'équipe ${appName}</strong></p>
        </div>
        <div class="footer"><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
      </div></body></html>`;
    return this.sendEmail({ to: email, subject: '✅ Votre mot de passe a été modifié', html,
      text: `Bonjour ${firstName || 'cher utilisateur'},\n\nVotre mot de passe a été modifié le ${new Date().toLocaleString('fr-FR')}.\n\nSi vous n'êtes pas à l'origine, contactez ${supportEmail}\n\nL'équipe ${appName}` });
  }

  async sendEmailVerification(email, verificationToken, firstName, businessName) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    const appName = process.env.APP_NAME || 'Restaurant App';
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4}
        .container{max-width:600px;margin:20px auto;background-color:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
        .header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px 20px;text-align:center}
        .content{padding:30px}.button{display:inline-block;padding:14px 35px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;text-decoration:none;border-radius:25px;margin:20px 0;font-weight:bold}
        .footer{text-align:center;padding:20px;font-size:12px;color:#6c757d;background-color:#f8f9fa}
        .info-box{background-color:#e3f2fd;border-left:4px solid #2196F3;padding:15px;margin:20px 0;border-radius:4px}
        .link-box{background-color:#f8f9fa;padding:15px;border-radius:5px;word-break:break-all;margin:15px 0;font-size:12px;color:#495057}
      </style></head>
      <body><div class="container">
        <div class="header"><h1>✉️ Vérification de votre adresse email</h1></div>
        <div class="content">
          <p>Bonjour <strong>${firstName || 'cher utilisateur'}</strong>,</p>
          <p>Bienvenue sur <strong>${appName}</strong> ! 🎉</p>
          <p>Merci d'avoir créé votre compte${businessName ? ` pour <strong>${businessName}</strong>` : ''}.</p>
          <p>Pour finaliser votre inscription, veuillez vérifier votre adresse email :</p>
          <div style="text-align:center"><a href="${verificationUrl}" class="button">Vérifier mon email</a></div>
          <div class="link-box">${verificationUrl}</div>
          <div class="info-box"><strong>📌 Important :</strong><ul style="margin:10px 0;padding-left:20px">
            <li>Ce lien est valide pendant <strong>24 heures</strong></li>
            <li>Vous devez vérifier votre email pour accéder à toutes les fonctionnalités</li>
            <li>Si vous n'avez pas créé ce compte, ignorez cet email</li>
          </ul></div>
          <p style="margin-top:30px">Cordialement,<br><strong>L'équipe ${appName}</strong></p>
        </div>
        <div class="footer"><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
      </div></body></html>`;
    return this.sendEmail({ to: email, subject: '✉️ Vérifiez votre adresse email', html,
      text: `Bonjour ${firstName || 'cher utilisateur'},\n\nVérifiez votre email : ${verificationUrl}\n\nLien valide 24h.\n\nL'équipe ${appName}` });
  }

  async sendReservationConfirmation(reservation, restaurant) {
    const appName = process.env.APP_NAME || 'Restaurant App';
    const reservationDate = new Date(reservation.reservation_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4}
        .container{max-width:600px;margin:20px auto;background-color:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
        .header{background:linear-gradient(135deg,#11998e 0%,#38ef7d 100%);color:white;padding:30px 20px;text-align:center}
        .content{padding:30px}.highlight{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:15px;border-radius:5px;text-align:center;margin:20px 0}
        .info-box{background-color:#d1ecf1;border-left:4px solid #0c5460;padding:15px;margin:20px 0;border-radius:4px}
        .footer{text-align:center;padding:20px;font-size:12px;color:#6c757d;background-color:#f8f9fa}
        .detail-table{width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:8px;overflow:hidden;margin:20px 0}
        .detail-table td{padding:10px 16px;border-bottom:1px solid #dee2e6;font-size:14px}
        .detail-table td:first-child{font-weight:bold;color:#495057;width:45%}
        .detail-table td:last-child{color:#212529}
        .detail-table tr:last-child td{border-bottom:none}
      </style></head>
      <body><div class="container">
        <div class="header"><h1>✅ Réservation Confirmée !</h1></div>
        <div class="content">
          <p>Bonjour <strong>${reservation.client_name}</strong>,</p>
          <p>Nous avons le plaisir de vous confirmer votre réservation au <strong>${restaurant.name}</strong> ! 🎉</p>
          <div class="highlight">
            <h2 style="margin:0;font-size:20px">📅 ${reservationDate}</h2>
            <h3 style="margin:10px 0;font-size:24px">🕐 ${reservation.time_slot}</h3>
          </div>
          <table class="detail-table">
            <tr><td>Numéro de réservation</td><td>${reservation.id}</td></tr>
            <tr><td>Restaurant</td><td>${restaurant.name}</td></tr>
            <tr><td>Date</td><td>${reservationDate}</td></tr>
            <tr><td>Heure</td><td>${reservation.time_slot}</td></tr>
            <tr><td>Nombre de personnes</td><td>${reservation.number_of_people} personne${reservation.number_of_people > 1 ? 's' : ''}</td></tr>
            ${reservation.special_requests ? `<tr><td>Demandes spéciales</td><td>${reservation.special_requests}</td></tr>` : ''}
          </table>
          ${restaurant.address || restaurant.phone ? `<div style="background-color:#fff3cd;padding:15px;border-radius:5px;margin:20px 0">
            <h4 style="margin-top:0">📍 Informations du restaurant</h4>
            ${restaurant.address ? `<p style="margin:4px 0"><strong>Adresse :</strong> ${restaurant.address}</p>` : ''}
            ${restaurant.phone ? `<p style="margin:4px 0"><strong>Téléphone :</strong> ${restaurant.phone}</p>` : ''}
          </div>` : ''}
          <div class="info-box"><strong>📌 Important :</strong><ul style="margin:10px 0;padding-left:20px">
            <li>Merci d'arriver à l'heure</li>
            <li>En cas d'empêchement, veuillez nous contacter au plus tôt</li>
          </ul></div>
          <p style="margin-top:30px">Nous avons hâte de vous accueillir ! 🍽️<br><strong>L'équipe ${restaurant.name}</strong></p>
        </div>
        <div class="footer"><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
      </div></body></html>`;
    return this.sendEmail({ to: reservation.client_email, subject: `✅ Réservation confirmée au ${restaurant.name}`, html,
      text: `Réservation confirmée au ${restaurant.name} le ${reservationDate} à ${reservation.time_slot} pour ${reservation.number_of_people} personne(s).` });
  }

  async sendReservationCancellation(reservation, restaurant) {
    const appName = process.env.APP_NAME || 'Restaurant App';
    const reservationDate = new Date(reservation.reservation_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4}
        .container{max-width:600px;margin:20px auto;background-color:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
        .header{background:linear-gradient(135deg,#e74c3c 0%,#c0392b 100%);color:white;padding:30px 20px;text-align:center}
        .content{padding:30px}.footer{text-align:center;padding:20px;font-size:12px;color:#6c757d;background-color:#f8f9fa}
        .detail-table{width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:8px;overflow:hidden;margin:20px 0}
        .detail-table td{padding:10px 16px;border-bottom:1px solid #dee2e6;font-size:14px}
        .detail-table td:first-child{font-weight:bold;color:#495057;width:45%}
        .detail-table tr:last-child td{border-bottom:none}
      </style></head>
      <body><div class="container">
        <div class="header"><h1>❌ Réservation Annulée</h1></div>
        <div class="content">
          <p>Bonjour <strong>${reservation.client_name}</strong>,</p>
          <p>Votre réservation au <strong>${restaurant.name}</strong> a été annulée.</p>
          <table class="detail-table">
            <tr><td>Numéro</td><td>${reservation.id}</td></tr>
            <tr><td>Date</td><td>${reservationDate}</td></tr>
            <tr><td>Heure</td><td>${reservation.time_slot}</td></tr>
            <tr><td>Nombre de personnes</td><td>${reservation.number_of_people}</td></tr>
          </table>
          <p>Si vous souhaitez effectuer une nouvelle réservation, n'hésitez pas à nous contacter.</p>
          <p>Cordialement,<br><strong>L'équipe ${restaurant.name}</strong></p>
        </div>
        <div class="footer"><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
      </div></body></html>`;
    return this.sendEmail({ to: reservation.client_email, subject: `❌ Réservation annulée - ${restaurant.name}`, html,
      text: `Votre réservation au ${restaurant.name} le ${reservationDate} a été annulée.` });
  }

  async sendSpecialOrderConfirmation(specialOrder, business) {
    const appName = process.env.APP_NAME || 'Restaurant App';
    const eventDate = new Date(specialOrder.event_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4}
        .container{max-width:600px;margin:20px auto;background-color:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
        .header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px 20px;text-align:center}
        .content{padding:30px}.info-box{background-color:#d1ecf1;border-left:4px solid #0c5460;padding:15px;margin:20px 0;border-radius:4px}
        .footer{text-align:center;padding:20px;font-size:12px;color:#6c757d;background-color:#f8f9fa}
        .detail-table{width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:8px;overflow:hidden;margin:20px 0}
        .detail-table td{padding:10px 16px;border-bottom:1px solid #dee2e6;font-size:14px}
        .detail-table td:first-child{font-weight:bold;color:#495057;width:45%}
        .detail-table tr:last-child td{border-bottom:none}
      </style></head>
      <body><div class="container">
        <div class="header"><h1>🎉 Demande de Commande Spéciale Reçue !</h1></div>
        <div class="content">
          <p>Bonjour <strong>${specialOrder.client_name}</strong>,</p>
          <p>Nous avons bien reçu votre demande auprès de <strong>${business.name}</strong> !</p>
          <div style="background:linear-gradient(135deg,#11998e,#38ef7d);color:white;padding:15px;border-radius:5px;text-align:center;margin:20px 0">
            <h2 style="margin:0;font-size:20px">📅 ${eventDate}</h2>
            <h3 style="margin:10px 0;font-size:18px">🕐 ${specialOrder.event_time}</h3>
          </div>
          <table class="detail-table">
            <tr><td>Numéro de commande</td><td>${specialOrder.id}</td></tr>
            <tr><td>Traiteur</td><td>${business.name}</td></tr>
            <tr><td>Type d'événement</td><td>${specialOrder.event_type}</td></tr>
            <tr><td>Date de l'événement</td><td>${eventDate}</td></tr>
            <tr><td>Heure</td><td>${specialOrder.event_time}</td></tr>
            <tr><td>Nombre d'invités</td><td>${specialOrder.number_of_guests} personne${specialOrder.number_of_guests > 1 ? 's' : ''}</td></tr>
            <tr><td>Lieu</td><td>${specialOrder.delivery_address}, ${specialOrder.city}</td></tr>
            ${specialOrder.estimated_budget ? `<tr><td>Budget estimé</td><td>${specialOrder.estimated_budget.toLocaleString()} FCFA</td></tr>` : ''}
          </table>
          <div class="info-box"><strong>📌 Prochaines étapes :</strong><ul style="margin:10px 0;padding-left:20px">
            <li>Le traiteur examinera votre demande dans les plus brefs délais</li>
            <li>Vous serez contacté au <strong>${specialOrder.client_phone}</strong></li>
            <li>Un devis personnalisé vous sera envoyé</li>
          </ul></div>
          <p>Cordialement,<br><strong>L'équipe ${business.name}</strong></p>
        </div>
        <div class="footer"><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
      </div></body></html>`;
    return this.sendEmail({ to: specialOrder.client_email, subject: `🎉 Demande de commande spéciale reçue - ${business.name}`, html,
      text: `Demande de commande spéciale reçue. Commande ${specialOrder.id} - ${business.name} - ${eventDate}` });
  }

  async sendSpecialOrderNotificationToCaterer(specialOrder, business, businessOwnerEmail) {
    const appName = process.env.APP_NAME || 'Restaurant App';
    const eventDate = new Date(specialOrder.event_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4}
        .container{max-width:600px;margin:20px auto;background-color:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
        .header{background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);color:white;padding:30px 20px;text-align:center}
        .content{padding:30px}.alert-box{background-color:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px}
        .footer{text-align:center;padding:20px;font-size:12px;color:#6c757d;background-color:#f8f9fa}
        .detail-table{width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:8px;overflow:hidden;margin:20px 0}
        .detail-table td{padding:10px 16px;border-bottom:1px solid #dee2e6;font-size:14px}
        .detail-table td:first-child{font-weight:bold;color:#495057;width:45%}
        .detail-table tr:last-child td{border-bottom:none}
        .button{display:inline-block;padding:14px 35px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;text-decoration:none;border-radius:25px;margin:20px 0;font-weight:bold}
      </style></head>
      <body><div class="container">
        <div class="header"><h1>🔔 Nouvelle Commande Spéciale !</h1></div>
        <div class="content">
          <div class="alert-box"><strong>⚡ Action requise !</strong> Une nouvelle demande de commande spéciale vient d'être reçue.</div>
          <table class="detail-table">
            <tr><td>Type d'événement</td><td>${specialOrder.event_type}</td></tr>
            <tr><td>Date</td><td>${eventDate}</td></tr>
            <tr><td>Heure</td><td>${specialOrder.event_time}</td></tr>
            <tr><td>Nombre d'invités</td><td>${specialOrder.number_of_guests}</td></tr>
            <tr><td>Lieu</td><td>${specialOrder.delivery_address}, ${specialOrder.city}</td></tr>
            ${specialOrder.estimated_budget ? `<tr><td>Budget estimé</td><td>${specialOrder.estimated_budget.toLocaleString()} FCFA</td></tr>` : ''}
            <tr><td>Client</td><td>${specialOrder.client_name}</td></tr>
            <tr><td>Téléphone client</td><td>${specialOrder.client_phone}</td></tr>
            <tr><td>Email client</td><td>${specialOrder.client_email}</td></tr>
          </table>
          <div style="text-align:center">
            <a href="${process.env.FRONTEND_URL}/traiteur/dashboard" class="button">Voir dans le Dashboard</a>
          </div>
          <p>Cordialement,<br><strong>L'équipe ${appName}</strong></p>
        </div>
        <div class="footer"><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
      </div></body></html>`;
    return this.sendEmail({ to: businessOwnerEmail, subject: `🔔 Nouvelle commande spéciale ${specialOrder.id} - ${specialOrder.event_type}`, html,
      text: `Nouvelle commande spéciale ${specialOrder.id}. Client : ${specialOrder.client_name}, ${specialOrder.client_phone}` });
  }

  async sendSubscriptionExpiryReminder({ ownerEmail, ownerFirstName, businessName, planName, planPrice, endDate, daysLeft }) {
    const appName = process.env.APP_NAME || 'RestoTraiteur';
    const frontendUrl = process.env.FRONTEND_URL || 'https://votre-app.com';
    const renewUrl = `${frontendUrl}/restaurant/dashboard#subscription`;
    const formattedDate = new Date(endDate).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const urgency = daysLeft === 1 ? { color: '#e74c3c', label: '🚨 URGENT', emoji: '🚨' }
      : daysLeft <= 3 ? { color: '#f39c12', label: '⚠️ Attention', emoji: '⚠️' }
      : { color: '#3498db', label: '📅 Rappel', emoji: '📅' };
    const dayText = daysLeft === 1 ? 'demain' : `dans ${daysLeft} jours`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background-color:#f4f4f4;margin:0;padding:0}
      .container{max-width:600px;margin:20px auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
      .header{background:${urgency.color};color:white;padding:30px 20px;text-align:center}
      .content{padding:30px}
      .alert-banner{background:${urgency.color}22;border-left:4px solid ${urgency.color};padding:15px;margin:20px 0;border-radius:4px}
      .countdown{text-align:center;padding:20px;background:${urgency.color};color:white;border-radius:8px;margin:20px 0}
      .detail-table{width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:8px;overflow:hidden;margin:20px 0}
      .detail-table td{padding:10px 16px;border-bottom:1px solid #dee2e6;font-size:14px}
      .detail-table td:first-child{font-weight:bold;color:#495057;width:45%}
      .detail-table tr:last-child td{border-bottom:none}
      .btn{display:inline-block;padding:15px 40px;background:${urgency.color};color:white;text-decoration:none;border-radius:25px;font-weight:bold;font-size:16px;margin:20px 0}
      .footer{text-align:center;padding:20px;font-size:12px;color:#6c757d;background:#f8f9fa}
    </style></head>
    <body><div class="container">
      <div class="header"><h1>${urgency.emoji} Votre abonnement expire ${dayText}</h1></div>
      <div class="content">
        <p>Bonjour <strong>${ownerFirstName || 'cher partenaire'}</strong>,</p>
        <div class="alert-banner"><strong>${urgency.label} :</strong> L'abonnement de <strong>${businessName}</strong> expire le <strong>${formattedDate}</strong>.</div>
        <div class="countdown">
          <span style="font-size:48px;font-weight:bold;display:block">${daysLeft}</span>
          <span style="font-size:16px;opacity:0.9">${daysLeft === 1 ? 'jour restant' : 'jours restants'}</span>
        </div>
        <table class="detail-table">
          <tr><td>Établissement</td><td>${businessName}</td></tr>
          <tr><td>Plan</td><td><strong>${planName}</strong></td></tr>
          <tr><td>Date d'expiration</td><td>${formattedDate}</td></tr>
          ${planPrice ? `<tr><td>Tarif</td><td>${Number(planPrice).toLocaleString('fr-FR')} FCFA / mois</td></tr>` : ''}
        </table>
        <div style="background:#e8f5e9;padding:15px;border-radius:8px;margin:20px 0">
          <h4 style="margin-top:0">⚡ Ce que vous perdez si vous ne renouvelez pas :</h4>
          <ul style="margin:10px 0;padding-left:20px"><li>Visibilité réduite</li><li>Limites sur les commandes</li><li>Fonctionnalités Premium désactivées</li></ul>
        </div>
        <div style="text-align:center"><a href="${renewUrl}" class="btn">🔄 Renouveler maintenant</a></div>
        <p>Cordialement,<br><strong>L'équipe ${appName}</strong></p>
      </div>
      <div class="footer"><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
    </div></body></html>`;
    return this.sendEmail({ to: ownerEmail, subject: `${urgency.emoji} Votre abonnement ${planName} expire ${dayText} - ${businessName}`, html,
      text: `Bonjour ${ownerFirstName},\n\nVotre abonnement ${planName} pour ${businessName} expire ${dayText} (${formattedDate}).\n\nRenouveler : ${renewUrl}\n\nL'équipe ${appName}` });
  }

  async sendSubscriptionExpiredNotification({ ownerEmail, ownerFirstName, businessName, planName, endDate }) {
    const appName = process.env.APP_NAME || 'RestoTraiteur';
    const frontendUrl = process.env.FRONTEND_URL || 'https://votre-app.com';
    const renewUrl = `${frontendUrl}/restaurant/dashboard#subscription`;
    const formattedDate = new Date(endDate).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f4f4f4}
      .container{max-width:600px;margin:20px auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
      .header{background:linear-gradient(135deg,#636e72,#2d3436);color:white;padding:30px 20px;text-align:center}
      .content{padding:30px}.footer{text-align:center;padding:20px;font-size:12px;color:#6c757d;background:#f8f9fa}
      .btn-renew{display:inline-block;padding:15px 40px;background:linear-gradient(135deg,#00b894,#00cec9);color:white;text-decoration:none;border-radius:25px;font-weight:bold;font-size:16px}
    </style></head>
    <body><div class="container">
      <div class="header"><h1>⏰ Votre abonnement a expiré</h1></div>
      <div class="content">
        <p>Bonjour <strong>${ownerFirstName || 'cher partenaire'}</strong>,</p>
        <div style="background:#ffeaa7;border-left:4px solid #fdcb6e;padding:15px;border-radius:4px;margin:20px 0">
          Votre abonnement <strong>${planName}</strong> pour <strong>${businessName}</strong> a expiré le <strong>${formattedDate}</strong>.
        </div>
        <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0">
          <h4 style="margin-top:0;color:#e17055">🔒 Fonctionnalités actuellement limitées</h4>
          <ul style="margin:0;padding-left:20px;color:#555"><li>Plan gratuit activé</li><li>Visibilité réduite</li><li>Fonctionnalités Premium désactivées</li></ul>
        </div>
        <div style="text-align:center;margin:30px 0"><a href="${renewUrl}" class="btn-renew">🔄 Renouveler mon abonnement</a></div>
        <p>Vos données sont conservées. Vous pouvez reprendre à tout moment.</p>
        <p>Cordialement,<br><strong>L'équipe ${appName}</strong></p>
      </div>
      <div class="footer"><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
    </div></body></html>`;
    return this.sendEmail({ to: ownerEmail, subject: `⏰ Abonnement expiré - ${businessName} | Renouvelez maintenant`, html,
      text: `Votre abonnement ${planName} pour ${businessName} a expiré le ${formattedDate}. Renouveler : ${renewUrl}` });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ✅ CORRIGÉ : sendOrderReceipt
  //
  // PROBLÈME PRÉCÉDENT :
  //   .summary-row { display: flex; justify-content: space-between }
  //   → display:flex dans <style> est ignoré par Gmail, Outlook, Apple Mail
  //   → résultat : "Référence23", "ÉtablissementCaféwola", "Date12 avril 2026"
  //
  // CORRECTION :
  //   Utiliser <table><tr><td> pour chaque ligne label/valeur
  //   → compatible avec TOUS les clients email
  //   Design RestoTraiteur (rouge/vert) au lieu du violet générique
  // ═══════════════════════════════════════════════════════════════════════════
  async sendOrderReceipt({ toEmail, toName, order, pdfBuffer, isSpecial = false }) {
    try {
      const orderRef = `${isSpecial ? 'SP-' : ''}${order.id}`;
      const amount   = parseFloat(order.total_amount || order.estimated_budget || 0)
        .toLocaleString('fr-FR', { minimumFractionDigits: 0 });

      const orderDate = new Date(order.created_at || Date.now())
        .toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

      const statusColors = {
        'En attente':     { bg: '#FFF8E7', color: '#D4A843', border: '#F0D080' },
        'pending':        { bg: '#FFF8E7', color: '#D4A843', border: '#F0D080' },
        'Confirmée':      { bg: '#EAF6EF', color: '#2A9D5C', border: '#A8DBC0' },
        'confirmed':      { bg: '#EAF6EF', color: '#2A9D5C', border: '#A8DBC0' },
        'Livrée':         { bg: '#EAF6EF', color: '#2A9D5C', border: '#A8DBC0' },
        'delivered':      { bg: '#EAF6EF', color: '#2A9D5C', border: '#A8DBC0' },
        'Annulée':        { bg: '#F9ECEC', color: '#C94040', border: '#F0A0A0' },
        'cancelled':      { bg: '#F9ECEC', color: '#C94040', border: '#F0A0A0' },
      };
      const statusRaw = order.status || order.payment_status || 'En attente';
      const sc = statusColors[statusRaw] || statusColors['En attente'];

      // ── Lignes du tableau récapitulatif ──────────────────
      // Chaque ligne = <tr><td label><td value> → jamais collés
      const metaRows = [
        { label: 'Référence',      value: `${orderRef}` },
        { label: 'Établissement',  value: order.business_name || 'N/A' },
        { label: 'Date',           value: orderDate },
        order.payment_method
          ? { label: 'Paiement', value: order.payment_method.toUpperCase() }
          : null,
        ...(isSpecial && order.event_type ? [
          { label: "Type d'événement", value: order.event_type },
          { label: "Date de l'événement", value: order.event_date ? new Date(order.event_date).toLocaleDateString('fr-FR') : 'N/A' },
        ] : []),
      ].filter(Boolean);

      const metaRowsHTML = metaRows.map((row, i) => `
        <tr style="background:${i % 2 === 0 ? '#FFFFFF' : '#F8F9FA'};">
          <td style="padding:11px 16px;
                     font-size:13px;
                     font-weight:700;
                     color:#6C757D;
                     width:45%;
                     border-bottom:1px solid #F0F0F0;
                     white-space:nowrap;">
            ${row.label}
          </td>
          <td style="padding:11px 16px;
                     font-size:13px;
                     font-weight:600;
                     color:#1A1A2E;
                     border-bottom:1px solid #F0F0F0;">
            ${row.value}
          </td>
        </tr>`).join('');

      const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre reçu RestoTraiteur</title>
</head>
<body style="margin:0; padding:0; background-color:#F4F6F8;
             font-family:'Segoe UI', Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#F4F6F8; padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:580px;">

        <!-- ══ EN-TÊTE ══ -->
        <tr>
          <td style="background:#1A1A2E; border-radius:12px 12px 0 0;
                     padding:24px 32px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle">
                  <span style="font-size:22px; font-weight:800; letter-spacing:-0.5px; line-height:1;">
                    <span style="color:#C94040;">Resto</span><span style="color:#2A9D5C;">Traiteur</span>
                  </span>
                  <br>
                  <span style="font-size:11px; color:#9CA3AF; margin-top:3px; display:block;">
                    Votre plateforme de commande en ligne
                  </span>
                </td>
                <td align="right" valign="middle">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background:rgba(201,64,64,0.15);
                                 border:1px solid rgba(201,64,64,0.35);
                                 border-radius:8px;
                                 padding:8px 16px;
                                 text-align:center;">
                        <span style="display:block; font-size:10px; color:#F09090;
                                     font-weight:700; text-transform:uppercase;
                                     letter-spacing:1px; line-height:1.3;">
                          REÇU
                        </span>
                        <span style="display:block; font-size:18px; color:#FFFFFF;
                                     font-weight:800; line-height:1.2; margin-top:2px;">
                          ${orderRef}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ BANNIÈRE ROUGE ══ -->
        <tr>
          <td style="background:#C94040; padding:12px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#FFFFFF; font-size:14px; font-weight:700;
                           vertical-align:middle;">
                  ✅ Commande enregistrée
                </td>
                <td align="right" valign="middle">
                  <span style="background:${sc.bg};
                               color:${sc.color};
                               border:1px solid ${sc.border};
                               border-radius:20px;
                               padding:4px 14px;
                               font-size:12px;
                               font-weight:700;
                               white-space:nowrap;">
                    ${statusRaw}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ══ CORPS ══ -->
        <tr>
          <td style="background:#FFFFFF; padding:28px 32px;">

            <!-- Message -->
            <p style="margin:0 0 20px; font-size:15px; color:#1A1A2E; line-height:1.6;">
              Bonjour <strong>${toName || 'cher client'}</strong>,<br>
              merci pour votre commande&nbsp;! Voici le récapitulatif&nbsp;:
            </p>

            <!-- ── Tableau récapitulatif ──
                 Chaque ligne : <td label> | <td valeur>
                 Jamais collés car cellules séparées -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="border:1px solid #E9ECEF;
                          border-radius:8px;
                          overflow:hidden;
                          margin-bottom:20px;
                          border-collapse:collapse;">
              <thead>
                <tr style="background:#1A1A2E;">
                  <td colspan="2" style="padding:10px 16px;
                                         font-size:11px;
                                         color:#9CA3AF;
                                         font-weight:700;
                                         text-transform:uppercase;
                                         letter-spacing:0.5px;">
                    Détails de la commande
                  </td>
                </tr>
              </thead>
              <tbody>
                ${metaRowsHTML}
              </tbody>
            </table>

            <!-- ── Montant total ── -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background:#C94040;
                          border-radius:8px;
                          overflow:hidden;
                          margin-bottom:24px;">
              <tr>
                <td style="padding:14px 20px;
                           font-size:15px;
                           font-weight:700;
                           color:#FFFFFF;">
                  💰 Total
                </td>
                <td style="padding:14px 20px;
                           font-size:20px;
                           font-weight:800;
                           color:#FFFFFF;
                           text-align:right;
                           white-space:nowrap;">
                  ${amount}&nbsp;FCFA
                </td>
              </tr>
            </table>

            <!-- ── Note PDF ── -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background:#EAF6EF;
                          border:1px solid #A8DBC0;
                          border-radius:8px;
                          margin-bottom:20px;">
              <tr>
                <td style="padding:16px 20px; text-align:center;">
                  <div style="font-size:26px; margin-bottom:6px;">📄</div>
                  <p style="margin:0; font-size:13px; color:#1A3A2A; font-weight:700;">
                    Votre reçu PDF est en pièce jointe
                  </p>
                  <p style="margin:4px 0 0; font-size:12px; color:#2A9D5C;">
                    Conservez-le pour vos archives — il fait foi de paiement.
                  </p>
                </td>
              </tr>
            </table>

            <p style="font-size:12px; color:#6C757D; text-align:center; margin:0;">
              Une question&nbsp;?
              <a href="mailto:support@restotraiteur.com"
                 style="color:#C94040; font-weight:600; text-decoration:none;">
                support@restotraiteur.com
              </a>
            </p>

          </td>
        </tr>

        <!-- ══ PIED ══ -->
        <tr>
          <td style="background:#F8F9FA;
                     border:1px solid #E9ECEF;
                     border-top:none;
                     border-radius:0 0 12px 12px;
                     padding:16px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:11px; color:#ADB5BD;">
                  Ce reçu a été généré automatiquement.
                </td>
                <td align="right" style="font-size:11px; color:#ADB5BD;">
                  RestoTraiteur © ${new Date().getFullYear()}
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`.trim();

      const mailOptions = {
        from: `"RestoTraiteur" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to:   toEmail,
        subject: `🧾 Votre reçu — Commande ${orderRef} — RestoTraiteur`,
        html,
        attachments: [{
          filename:    `recu-${orderRef}.pdf`,
          content:     pdfBuffer,
          contentType: 'application/pdf',
        }],
      };

      await this.transporter.sendMail(mailOptions);
      logger.info?.(`✅ Reçu PDF envoyé à ${toEmail} pour commande #${orderRef}`);
      return { success: true };

    } catch (error) {
      logger.error?.('Erreur envoi reçu email:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendQuoteEmail(data) {
    const appName = process.env.APP_NAME || 'RestoTraiteur';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>
      body{font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#333;background-color:#f5f5f5;margin:0;padding:0}
      .container{max-width:650px;margin:0 auto;background:#fff}
      .header{background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);color:white;padding:40px 30px;text-align:center}
      .content{padding:35px 30px}
      .detail-table{width:100%;border-collapse:collapse;background:#f9fafb;border-radius:12px;overflow:hidden;margin-bottom:20px;border:1px solid #e5e7eb}
      .detail-table th{background:#16a34a;color:white;padding:10px 16px;font-size:12px;text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:0.4px}
      .detail-table td{padding:11px 16px;border-bottom:1px solid #f3f4f6;font-size:14px}
      .detail-table td:first-child{color:#6b7280;font-weight:600;width:45%}
      .detail-table td:last-child{color:#111827;font-weight:600}
      .detail-table tr:last-child td{border-bottom:none}
      .amount-box{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #22c55e;border-radius:12px;padding:28px;text-align:center;margin:24px 0}
      .cta-button{display:inline-block;background:linear-gradient(135deg,#22c55e,#16a34a);color:white;padding:16px 48px;text-decoration:none;border-radius:30px;font-weight:700;font-size:16px;margin:24px 0}
      .footer{text-align:center;padding:30px;background:#f9fafb;border-top:1px solid #e5e7eb}
    </style></head>
    <body><div class="container">
      <div class="header"><h1>🎂 Votre Devis Traiteur</h1><p>${appName} - ${data.businessName}</p></div>
      <div class="content">
        <p style="font-size:16px;margin-bottom:24px">Bonjour <strong>${data.clientName}</strong>,</p>
        <p style="color:#4b5563;margin-bottom:28px">Voici votre devis pour votre <strong>${this.getEventTypeLabel(data.eventType)}</strong> :</p>
        <table class="detail-table">
          <tr><th colspan="2">📋 Détails de l'événement</th></tr>
          <tr><td>Type d'événement</td><td>${this.getEventTypeLabel(data.eventType)}</td></tr>
          <tr><td>Date</td><td>${this.formatDate(data.eventDate)} à ${data.eventTime}</td></tr>
          <tr><td>Nombre d'invités</td><td>${data.numberOfGuests} personnes</td></tr>
        </table>
        <table class="detail-table">
          <tr><th colspan="2">💰 Montant du devis</th></tr>
          <tr><td>Prestation traiteur</td><td>${this.formatAmount(data.quotedAmount)} FCFA</td></tr>
          ${data.transportFee > 0 ? `<tr><td>Frais de transport</td><td>${this.formatAmount(data.transportFee)} FCFA</td></tr>` : ''}
          <tr><td style="font-size:15px;font-weight:700;color:#111827">TOTAL</td><td style="font-size:18px;color:#16a34a">${this.formatAmount(data.finalAmount)} FCFA</td></tr>
        </table>
        <div class="amount-box">
          <div style="font-size:13px;color:#15803d;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">💳 Acompte à verser (${data.depositPercentage}%)</div>
          <div style="font-size:42px;font-weight:700;color:#16a34a;line-height:1">${this.formatAmount(data.depositAmount)} <span style="font-size:20px;color:#6b7280;font-weight:400">FCFA</span></div>
          <div style="font-size:13px;color:#6b7280;margin-top:10px">Solde : <strong>${this.formatAmount(data.finalAmount - data.depositAmount)} FCFA</strong> le jour de l'événement</div>
        </div>
        ${data.quoteNotes ? `<div style="background:#f9fafb;padding:20px;border-radius:12px;border:1px solid #e5e7eb;margin-bottom:20px"><h4 style="margin-top:0;color:#16a34a">📝 Notes du traiteur</h4><p style="margin:0;white-space:pre-line">${data.quoteNotes}</p></div>` : ''}
        <div style="text-align:center;margin:32px 0"><a href="${data.paymentLink}" class="cta-button">💳 Payer l'acompte maintenant</a></div>
        <div style="background:#fef3c7;border-left:4px solid #fbbf24;padding:16px;border-radius:8px;margin:20px 0">
          <h4 style="margin:0 0 10px;color:#78350f">💳 Méthodes de paiement</h4>
          <p style="margin:0;color:#78350f;font-size:13px">📱 Mixx By Yas &nbsp;|&nbsp; 💚 Flooz &nbsp;|&nbsp; 💳 Carte bancaire &nbsp;|&nbsp; 💵 À la livraison</p>
        </div>
        <div style="background:#eff6ff;border-radius:10px;padding:20px;margin:24px 0">
          <h4 style="margin-top:0;color:#1e40af">📞 Contact</h4>
          <p style="margin:4px 0"><strong>${data.businessName}</strong></p>
          ${data.businessPhone ? `<p style="margin:4px 0">📞 ${data.businessPhone}</p>` : ''}
          ${data.businessAddress ? `<p style="margin:4px 0">📍 ${data.businessAddress}</p>` : ''}
        </div>
        <div style="background:#fefce8;border-left:4px solid #eab308;padding:16px;border-radius:6px;margin:20px 0;color:#713f12;font-size:14px">
          <strong>📌 Important :</strong> Ce devis est valable 7 jours.
        </div>
        <p style="margin-top:32px">Nous avons hâte d'organiser votre événement ! 🎉</p>
      </div>
      <div class="footer"><p><strong>Merci de votre confiance !</strong></p><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
    </div></body></html>`;
    return this.sendEmail({ to: data.clientEmail, subject: `🎂 Votre devis ${data.businessName} - ${this.formatAmount(data.finalAmount)} FCFA`, html });
  }

  getEventTypeLabel(type) {
    const labels = { mariage: '💍 Mariage', anniversaire: '🎂 Anniversaire', bapteme: '👶 Baptême', entreprise: '🏢 Événement d\'entreprise', reception: '🎉 Réception', autre: '🎪 Autre' };
    return labels[type] || type;
  }
  formatDate(date) { return new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
  formatAmount(amount) { return Math.round(amount).toLocaleString('fr-FR'); }

  async sendContactNotification({ name, email, phone, subject, message, messageId }) {
    const appName    = process.env.APP_NAME    || 'RestoTraiteur';
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    const frontendUrl = process.env.FRONTEND_URL || 'https://votre-app.com';
    const subjectLabels = { question: '❓ Question Générale', support: '🛠 Support Technique', business: '🤝 Partenariat Professionnel', complaint: '⚠️ Réclamation', other: '📌 Autre' };
    const subjectLabel = subjectLabels[subject] || subject;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f4f4f4;margin:0}
      .container{max-width:600px;margin:20px auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
      .header{background:linear-gradient(135deg,#C94040,#E07B39);color:white;padding:28px 24px;text-align:center}
      .content{padding:28px 28px 20px}
      .detail-table{width:100%;border-collapse:collapse;background:#f9f9f9;border:1px solid #ececec;border-radius:10px;overflow:hidden;margin:20px 0}
      .detail-table td{padding:10px 16px;border-bottom:1px solid #ececec;font-size:13px}
      .detail-table td:first-child{font-weight:700;color:#555;width:30%}
      .detail-table tr:last-child td{border-bottom:none}
      .msg-box{background:#f0f4ff;border-left:4px solid #C94040;border-radius:6px;padding:16px;margin:20px 0;white-space:pre-wrap;font-size:14px;color:#333}
      .btn{display:inline-block;padding:13px 36px;background:linear-gradient(135deg,#C94040,#E07B39);color:white;text-decoration:none;border-radius:25px;font-weight:700;font-size:14px}
      .footer{text-align:center;padding:18px;font-size:11px;color:#aaa;background:#f8f8f8;border-top:1px solid #eee}
    </style></head>
    <body><div class="container">
      <div class="header"><h1>📬 Nouveau message de contact</h1><p style="margin:6px 0 0;opacity:.88;font-size:13px">${appName} — Message #${messageId}</p></div>
      <div class="content">
        <p>Un nouveau message a été reçu via le formulaire de contact.</p>
        <span style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700;background:#FFF3CD;color:#856404;border:1px solid #FFE083">${subjectLabel}</span>
        <table class="detail-table">
          <tr><td>Nom</td><td>${name}</td></tr>
          <tr><td>Email</td><td><a href="mailto:${email}" style="color:#C94040">${email}</a></td></tr>
          <tr><td>Téléphone</td><td><a href="tel:${phone}" style="color:#C94040">${phone}</a></td></tr>
          <tr><td>Sujet</td><td>${subjectLabel}</td></tr>
        </table>
        <p style="font-weight:700;margin-bottom:8px">Message :</p>
        <div class="msg-box">${message}</div>
        <div style="text-align:center;margin:24px 0"><a href="${frontendUrl}/admin/dashboard" class="btn">📋 Voir dans le dashboard admin</a></div>
        <p style="font-size:12px;color:#888;text-align:center">Répondre à <a href="mailto:${email}" style="color:#C94040">${email}</a></p>
      </div>
      <div class="footer"><p>Cet email est envoyé automatiquement — ${appName}</p><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
    </div></body></html>`;
    return this.sendEmail({ to: adminEmail, subject: `📬 [Contact ${messageId}] ${subjectLabel} — ${name}`, html,
      text: `Nouveau message de ${name} <${email}> — Tél: ${phone}\n\nSujet : ${subjectLabel}\n\n${message}\n\nDashboard : ${frontendUrl}/admin/dashboard` });
  }

  async sendContactReply({ toEmail, toName, originalSubject, originalMessage, reply, messageId }) {
    const appName = process.env.APP_NAME || 'RestoTraiteur';
    const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER;
    const subjectLabels = { question: 'Question Générale', support: 'Support Technique', business: 'Partenariat Professionnel', complaint: 'Réclamation', other: 'Autre' };
    const subjectLabel = subjectLabels[originalSubject] || originalSubject;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f4f4f4;margin:0}
      .container{max-width:600px;margin:20px auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
      .header{background:linear-gradient(135deg,#C94040,#E07B39);color:white;padding:28px 24px;text-align:center}
      .content{padding:28px}
      .reply-box{background:#f0f9f0;border-left:4px solid #2A9D5C;border-radius:6px;padding:18px;margin:20px 0;white-space:pre-wrap;font-size:14px;color:#1a3a1a}
      .original-box{background:#f8f8f8;border-left:3px solid #ccc;border-radius:4px;padding:14px;margin:20px 0;color:#666;font-size:13px;white-space:pre-wrap}
      .footer{text-align:center;padding:18px;font-size:11px;color:#aaa;background:#f8f8f8;border-top:1px solid #eee}
    </style></head>
    <body><div class="container">
      <div class="header"><h1>✉️ Réponse à votre message</h1></div>
      <div class="content">
        <p>Bonjour <strong>${toName}</strong>,</p>
        <p>Voici notre réponse à votre message concernant <strong>${subjectLabel}</strong> :</p>
        <div class="reply-box">${reply}</div>
        <p style="font-size:13px;color:#888">Pour toute question, contactez-nous à <a href="mailto:${supportEmail}" style="color:#C94040">${supportEmail}</a>.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:12px;color:#aaa;margin-bottom:4px">Votre message original (référence ${messageId}) :</p>
        <div class="original-box">${originalMessage}</div>
        <p style="margin-top:24px">Cordialement,<br><strong>L'équipe ${appName}</strong></p>
      </div>
      <div class="footer"><p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p></div>
    </div></body></html>`;
    return this.sendEmail({ to: toEmail, subject: `Re: ${subjectLabel} — ${appName}`, html,
      text: `Bonjour ${toName},\n\n${reply}\n\n---\nVotre message :\n${originalMessage}\n\nContact : ${supportEmail}` });
  }
}

const emailService = new EmailService();
module.exports = { emailService };