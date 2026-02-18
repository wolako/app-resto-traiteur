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
      // Vérifier les variables d'environnement pour Gmail
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        logger.warn('Configuration email manquante (EMAIL_USER ou EMAIL_PASS), service email désactivé');
        return;
      }

      // Configuration pour Gmail - CORRECTION: createTransport au lieu de createTransporter
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      // Vérifier la connexion
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

      logger.info('Email envoyé', {
        to,
        subject,
        messageId: info.messageId,
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Erreur envoi email', {
        to,
        subject,
        error: error.message,
      });

      return { success: false, error: error.message };
    }
  }

  // ... gardez le reste de vos méthodes (sendOrderConfirmation, sendPasswordResetEmail, etc.) tel quel
  // Les méthodes restantes restent inchangées

  async sendPasswordResetEmail(email, resetToken, firstName) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const appName = process.env.APP_NAME || 'Restaurant App';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .button { display: inline-block; padding: 14px 35px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; margin: 20px 0; font-weight: bold; }
          .button:hover { opacity: 0.9; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6c757d; background-color: #f8f9fa; }
          .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .link-box { background-color: #f8f9fa; padding: 15px; border-radius: 5px; word-break: break-all; margin: 15px 0; font-size: 12px; color: #495057; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Réinitialisation de mot de passe</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${firstName || 'cher utilisateur'}</strong>,</p>
            
            <p>Vous avez demandé la réinitialisation de votre mot de passe pour votre compte <strong>${appName}</strong>.</p>
            
            <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
            
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Réinitialiser mon mot de passe</a>
            </div>
            
            <p style="font-size: 13px; color: #6c757d;">Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :</p>
            <div class="link-box">${resetUrl}</div>
            
            <div class="warning">
              <strong>⚠️ Important :</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Ce lien est valide pendant <strong>1 heure</strong></li>
                <li>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email</li>
                <li>Ne partagez jamais ce lien avec personne</li>
              </ul>
            </div>
            
            <p style="margin-top: 30px;">Cordialement,<br><strong>L'équipe ${appName}</strong></p>
          </div>
          <div class="footer">
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Bonjour ${firstName || 'cher utilisateur'},

      Vous avez demandé la réinitialisation de votre mot de passe pour votre compte ${appName}.

      Cliquez sur ce lien pour réinitialiser votre mot de passe :
      ${resetUrl}

      Ce lien est valide pendant 1 heure.

      Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.

      Cordialement,
      L'équipe ${appName}
    `;

    return this.sendEmail({
      to: email,
      subject: '🔐 Réinitialisation de votre mot de passe',
      html,
      text,
    });
  }

  async sendPasswordChangedEmail(email, firstName) {
    const appName = process.env.APP_NAME || 'Restaurant App';
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@restaurant-app.com';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .alert { background-color: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6c757d; background-color: #f8f9fa; }
          .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Mot de passe modifié avec succès</h1>
          </div>
          <div class="content">
            <div class="success-icon">🎉</div>
            
            <p>Bonjour <strong>${firstName || 'cher utilisateur'}</strong>,</p>
            
            <p>Votre mot de passe a été modifié avec succès le <strong>${new Date().toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</strong>.</p>
            
            <p>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
            
            <div class="alert">
              <strong>🔒 Sécurité de votre compte</strong>
              <p style="margin: 10px 0 0 0;">Si vous n'êtes pas à l'origine de cette modification, veuillez contacter immédiatement notre support à <a href="mailto:${supportEmail}">${supportEmail}</a></p>
            </div>
            
            <p style="margin-top: 30px;">Merci de votre confiance,<br><strong>L'équipe ${appName}</strong></p>
          </div>
          <div class="footer">
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Bonjour ${firstName || 'cher utilisateur'},

      Votre mot de passe a été modifié avec succès le ${new Date().toLocaleString('fr-FR')}.

      Si vous n'êtes pas à l'origine de cette modification, contactez immédiatement notre support à ${supportEmail}

      Cordialement,
      L'équipe ${appName}
    `;

    return this.sendEmail({
      to: email,
      subject: '✅ Votre mot de passe a été modifié',
      html,
      text,
    });
  }

  /**
   * Envoyer un email de vérification d'adresse email
   * @param {string} email - Adresse email du destinataire
   * @param {string} verificationToken - Token de vérification
   * @param {string} firstName - Prénom de l'utilisateur
   * @param {string} businessName - Nom de l'établissement
   * @returns {Promise} Résultat de l'envoi
   */
  async sendEmailVerification(email, verificationToken, firstName, businessName) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    const appName = process.env.APP_NAME || 'Restaurant App';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .button { display: inline-block; padding: 14px 35px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; margin: 20px 0; font-weight: bold; }
          .button:hover { opacity: 0.9; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6c757d; background-color: #f8f9fa; }
          .info-box { background-color: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .link-box { background-color: #f8f9fa; padding: 15px; border-radius: 5px; word-break: break-all; margin: 15px 0; font-size: 12px; color: #495057; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✉️ Vérification de votre adresse email</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${firstName || 'cher utilisateur'}</strong>,</p>
            
            <p>Bienvenue sur <strong>${appName}</strong> ! 🎉</p>
            
            <p>Merci d'avoir créé votre compte${businessName ? ` pour <strong>${businessName}</strong>` : ''}.</p>
            
            <p>Pour finaliser votre inscription et commencer à utiliser nos services, veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :</p>
            
            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">Vérifier mon email</a>
            </div>
            
            <p style="font-size: 13px; color: #6c757d;">Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :</p>
            <div class="link-box">${verificationUrl}</div>
            
            <div class="info-box">
              <strong>📌 Important :</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Ce lien est valide pendant <strong>24 heures</strong></li>
                <li>Vous devez vérifier votre email pour accéder à toutes les fonctionnalités</li>
                <li>Si vous n'avez pas créé ce compte, ignorez cet email</li>
              </ul>
            </div>
            
            <p style="margin-top: 30px;">Cordialement,<br><strong>L'équipe ${appName}</strong></p>
          </div>
          <div class="footer">
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Bonjour ${firstName || 'cher utilisateur'},

      Bienvenue sur ${appName} !

      Merci d'avoir créé votre compte${businessName ? ` pour ${businessName}` : ''}.

      Pour finaliser votre inscription, veuillez vérifier votre adresse email en cliquant sur ce lien :
      ${verificationUrl}

      Ce lien est valide pendant 24 heures.

      Si vous n'avez pas créé ce compte, ignorez cet email.

      Cordialement,
      L'équipe ${appName}
    `;

    return this.sendEmail({
      to: email,
      subject: '✉️ Vérifiez votre adresse email',
      html,
      text,
    });
  }

  /**
   * Envoyer un email de confirmation de réservation au client
   */
  async sendReservationConfirmation(reservation, restaurant) {
    const appName = process.env.APP_NAME || 'Restaurant App';
    const reservationDate = new Date(reservation.reservation_date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .reservation-card { background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .reservation-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #dee2e6; }
          .reservation-row:last-child { border-bottom: none; }
          .label { font-weight: bold; color: #495057; }
          .value { color: #212529; }
          .highlight { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0; }
          .info-box { background-color: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6c757d; background-color: #f8f9fa; }
          .restaurant-info { background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Réservation Confirmée !</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${reservation.client_name}</strong>,</p>
            
            <p>Nous avons le plaisir de vous confirmer votre réservation au <strong>${restaurant.name}</strong> ! 🎉</p>
            
            <div class="highlight">
              <h2 style="margin: 0; font-size: 20px;">📅 ${reservationDate}</h2>
              <h3 style="margin: 10px 0; font-size: 24px;">🕐 ${reservation.time_slot}</h3>
            </div>

            <div class="reservation-card">
              <h3 style="margin-top: 0;">Détails de votre réservation</h3>
              <div class="reservation-row">
                <span class="label">Numéro de réservation</span>
                <span class="value">#${reservation.id}</span>
              </div>
              <div class="reservation-row">
                <span class="label">Restaurant</span>
                <span class="value">${restaurant.name}</span>
              </div>
              <div class="reservation-row">
                <span class="label">Date</span>
                <span class="value">${reservationDate}</span>
              </div>
              <div class="reservation-row">
                <span class="label">Heure</span>
                <span class="value">${reservation.time_slot}</span>
              </div>
              <div class="reservation-row">
                <span class="label">Nombre de personnes</span>
                <span class="value">${reservation.number_of_people} personne${reservation.number_of_people > 1 ? 's' : ''}</span>
              </div>
              ${reservation.special_requests ? `
              <div class="reservation-row">
                <span class="label">Demandes spéciales</span>
                <span class="value">${reservation.special_requests}</span>
              </div>
              ` : ''}
            </div>

            <div class="restaurant-info">
              <h4 style="margin-top: 0;">📍 Informations du restaurant</h4>
              ${restaurant.address ? `<p><strong>Adresse :</strong> ${restaurant.address}</p>` : ''}
              ${restaurant.phone ? `<p><strong>Téléphone :</strong> ${restaurant.phone}</p>` : ''}
            </div>

            <div class="info-box">
              <strong>📌 Important :</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Merci d'arriver à l'heure pour profiter pleinement de votre réservation</li>
                <li>En cas d'empêchement, veuillez nous contacter au plus tôt</li>
                <li>Conservez cet email comme confirmation</li>
              </ul>
            </div>
            
            <p style="margin-top: 30px;">Nous avons hâte de vous accueillir ! 🍽️</p>
            
            <p>Cordialement,<br><strong>L'équipe ${restaurant.name}</strong></p>
          </div>
          <div class="footer">
            <p>Cet email a été envoyé automatiquement suite à la confirmation de votre réservation.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Réservation Confirmée !

      Bonjour ${reservation.client_name},

      Nous avons le plaisir de vous confirmer votre réservation au ${restaurant.name} !

      Détails de votre réservation :
      - Numéro : #${reservation.id}
      - Restaurant : ${restaurant.name}
      - Date : ${reservationDate}
      - Heure : ${reservation.time_slot}
      - Nombre de personnes : ${reservation.number_of_people}
      ${reservation.special_requests ? `- Demandes spéciales : ${reservation.special_requests}` : ''}

      ${restaurant.address ? `Adresse : ${restaurant.address}` : ''}
      ${restaurant.phone ? `Téléphone : ${restaurant.phone}` : ''}

      Merci d'arriver à l'heure. En cas d'empêchement, contactez-nous au plus tôt.

      Nous avons hâte de vous accueillir !

      Cordialement,
      L'équipe ${restaurant.name}
    `;

    return this.sendEmail({
      to: reservation.client_email,
      subject: `✅ Réservation confirmée au ${restaurant.name}`,
      html,
      text,
    });
  }

  /**
   * Envoyer un email d'annulation de réservation au client
   */
  async sendReservationCancellation(reservation, restaurant) {
    const appName = process.env.APP_NAME || 'Restaurant App';
    const reservationDate = new Date(reservation.reservation_date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .reservation-card { background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6c757d; background-color: #f8f9fa; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>❌ Réservation Annulée</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${reservation.client_name}</strong>,</p>
            
            <p>Nous vous informons que votre réservation au <strong>${restaurant.name}</strong> a été annulée.</p>
            
            <div class="reservation-card">
              <h3 style="margin-top: 0;">Détails de la réservation annulée</h3>
              <p><strong>Numéro :</strong> #${reservation.id}</p>
              <p><strong>Date :</strong> ${reservationDate}</p>
              <p><strong>Heure :</strong> ${reservation.time_slot}</p>
              <p><strong>Nombre de personnes :</strong> ${reservation.number_of_people}</p>
            </div>

            <p>Si vous souhaitez effectuer une nouvelle réservation, n'hésitez pas à nous contacter.</p>
            
            <p>Cordialement,<br><strong>L'équipe ${restaurant.name}</strong></p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Réservation Annulée

      Bonjour ${reservation.client_name},

      Nous vous informons que votre réservation au ${restaurant.name} a été annulée.

      Détails :
      - Numéro : #${reservation.id}
      - Date : ${reservationDate}
      - Heure : ${reservation.time_slot}
      - Nombre de personnes : ${reservation.number_of_people}

      Si vous souhaitez effectuer une nouvelle réservation, n'hésitez pas à nous contacter.

      Cordialement,
      L'équipe ${restaurant.name}
    `;

    return this.sendEmail({
      to: reservation.client_email,
      subject: `❌ Réservation annulée - ${restaurant.name}`,
      html,
      text,
    });
  }

  /**
   * Envoyer un email de confirmation de commande spéciale au client
   */
  async sendSpecialOrderConfirmation(specialOrder, business) {
    const appName = process.env.APP_NAME || 'Restaurant App';
    const eventDate = new Date(specialOrder.event_date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .order-card { background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .order-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #dee2e6; }
          .order-row:last-child { border-bottom: none; }
          .label { font-weight: bold; color: #495057; }
          .value { color: #212529; }
          .highlight { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0; }
          .info-box { background-color: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6c757d; background-color: #f8f9fa; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Demande de Commande Spéciale Reçue !</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${specialOrder.client_name}</strong>,</p>
            
            <p>Nous avons bien reçu votre demande de commande spéciale auprès de <strong>${business.name}</strong> !</p>
            
            <div class="highlight">
              <h2 style="margin: 0; font-size: 20px;">📅 ${eventDate}</h2>
              <h3 style="margin: 10px 0; font-size: 18px;">🕐 ${specialOrder.event_time}</h3>
            </div>

            <div class="order-card">
              <h3 style="margin-top: 0;">Détails de votre commande</h3>
              <div class="order-row">
                <span class="label">Numéro de commande</span>
                <span class="value">#${specialOrder.id}</span>
              </div>
              <div class="order-row">
                <span class="label">Traiteur</span>
                <span class="value">${business.name}</span>
              </div>
              <div class="order-row">
                <span class="label">Type d'événement</span>
                <span class="value">${specialOrder.event_type}</span>
              </div>
              <div class="order-row">
                <span class="label">Date de l'événement</span>
                <span class="value">${eventDate}</span>
              </div>
              <div class="order-row">
                <span class="label">Heure</span>
                <span class="value">${specialOrder.event_time}</span>
              </div>
              <div class="order-row">
                <span class="label">Nombre d'invités</span>
                <span class="value">${specialOrder.number_of_guests} personne${specialOrder.number_of_guests > 1 ? 's' : ''}</span>
              </div>
              <div class="order-row">
                <span class="label">Lieu</span>
                <span class="value">${specialOrder.delivery_address}, ${specialOrder.city}</span>
              </div>
              ${specialOrder.estimated_budget ? `
              <div class="order-row">
                <span class="label">Budget estimé</span>
                <span class="value">${specialOrder.estimated_budget.toLocaleString()} FCFA</span>
              </div>
              ` : ''}
            </div>

            <div class="info-box">
              <strong>📌 Prochaines étapes :</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Le traiteur examinera votre demande dans les plus brefs délais</li>
                <li>Vous serez contacté par téléphone au <strong>${specialOrder.client_phone}</strong> pour discuter des détails</li>
                <li>Un devis personnalisé vous sera envoyé</li>
                <li>Une fois le devis accepté, la commande sera confirmée</li>
              </ul>
            </div>

            <div class="order-card">
              <h4 style="margin-top: 0;">Vos préférences de menu</h4>
              <p><strong>Menu souhaité :</strong></p>
              <p>${specialOrder.menu_preferences}</p>
              ${specialOrder.dietary_restrictions ? `
              <p><strong>Restrictions alimentaires :</strong></p>
              <p>${specialOrder.dietary_restrictions}</p>
              ` : ''}
              ${specialOrder.special_requests ? `
              <p><strong>Demandes spéciales :</strong></p>
              <p>${specialOrder.special_requests}</p>
              ` : ''}
            </div>

            ${business.phone ? `
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="margin-top: 0;">📞 Contact du traiteur</h4>
              <p><strong>Téléphone :</strong> ${business.phone}</p>
              ${business.email ? `<p><strong>Email :</strong> ${business.email}</p>` : ''}
              ${business.address ? `<p><strong>Adresse :</strong> ${business.address}</p>` : ''}
            </div>
            ` : ''}
            
            <p style="margin-top: 30px;">Nous vous remercions pour votre confiance et avons hâte d'organiser votre événement ! 🎊</p>
            
            <p>Cordialement,<br><strong>L'équipe ${business.name}</strong></p>
          </div>
          <div class="footer">
            <p>Cet email a été envoyé automatiquement suite à votre demande de commande spéciale.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Demande de Commande Spéciale Reçue !

      Bonjour ${specialOrder.client_name},

      Nous avons bien reçu votre demande de commande spéciale auprès de ${business.name} !

      Détails de votre commande :
      - Numéro : #${specialOrder.id}
      - Traiteur : ${business.name}
      - Type d'événement : ${specialOrder.event_type}
      - Date : ${eventDate}
      - Heure : ${specialOrder.event_time}
      - Nombre d'invités : ${specialOrder.number_of_guests}
      - Lieu : ${specialOrder.delivery_address}, ${specialOrder.city}
      ${specialOrder.estimated_budget ? `- Budget estimé : ${specialOrder.estimated_budget.toLocaleString()} FCFA` : ''}

      Prochaines étapes :
      - Le traiteur examinera votre demande dans les plus brefs délais
      - Vous serez contacté au ${specialOrder.client_phone} pour discuter des détails
      - Un devis personnalisé vous sera envoyé
      - Une fois le devis accepté, la commande sera confirmée

      ${business.phone ? `Contact du traiteur : ${business.phone}` : ''}

      Nous vous remercions pour votre confiance !

      Cordialement,
      L'équipe ${business.name}
    `;

    return this.sendEmail({
      to: specialOrder.client_email,
      subject: `🎉 Demande de commande spéciale reçue - ${business.name}`,
      html,
      text,
    });
  }

  /**
   * Envoyer un email de notification de commande spéciale au traiteur
   */
  async sendSpecialOrderNotificationToCaterer(specialOrder, business, businessOwnerEmail) {
    const appName = process.env.APP_NAME || 'Restaurant App';
    const eventDate = new Date(specialOrder.event_date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .alert-box { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .order-card { background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .order-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #dee2e6; }
          .order-row:last-child { border-bottom: none; }
          .label { font-weight: bold; color: #495057; }
          .value { color: #212529; }
          .button { display: inline-block; padding: 14px 35px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; margin: 20px 0; font-weight: bold; text-align: center; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6c757d; background-color: #f8f9fa; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Nouvelle Commande Spéciale !</h1>
          </div>
          <div class="content">
            <div class="alert-box">
              <strong>⚡ Action requise !</strong> Une nouvelle demande de commande spéciale vient d'être reçue.
            </div>

            <div class="order-card">
              <h3 style="margin-top: 0;">Informations de la commande #${specialOrder.id}</h3>
              <div class="order-row">
                <span class="label">Type d'événement</span>
                <span class="value">${specialOrder.event_type}</span>
              </div>
              <div class="order-row">
                <span class="label">Date de l'événement</span>
                <span class="value">${eventDate}</span>
              </div>
              <div class="order-row">
                <span class="label">Heure</span>
                <span class="value">${specialOrder.event_time}</span>
              </div>
              <div class="order-row">
                <span class="label">Nombre d'invités</span>
                <span class="value">${specialOrder.number_of_guests} personne${specialOrder.number_of_guests > 1 ? 's' : ''}</span>
              </div>
              <div class="order-row">
                <span class="label">Lieu</span>
                <span class="value">${specialOrder.delivery_address}, ${specialOrder.city}</span>
              </div>
              ${specialOrder.estimated_budget ? `
              <div class="order-row">
                <span class="label">Budget estimé</span>
                <span class="value">${specialOrder.estimated_budget.toLocaleString()} FCFA</span>
              </div>
              ` : ''}
            </div>

            <div class="order-card">
              <h4 style="margin-top: 0;">Informations du client</h4>
              <p><strong>Nom :</strong> ${specialOrder.client_name}</p>
              <p><strong>Email :</strong> ${specialOrder.client_email}</p>
              <p><strong>Téléphone :</strong> ${specialOrder.client_phone}</p>
            </div>

            <div class="order-card">
              <h4 style="margin-top: 0;">Préférences de menu</h4>
              <p>${specialOrder.menu_preferences}</p>
              ${specialOrder.dietary_restrictions ? `
              <p><strong>Restrictions alimentaires :</strong></p>
              <p>${specialOrder.dietary_restrictions}</p>
              ` : ''}
              ${specialOrder.special_requests ? `
              <p><strong>Demandes spéciales :</strong></p>
              <p>${specialOrder.special_requests}</p>
              ` : ''}
            </div>

            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/traiteur/dashboard" class="button">Voir dans le Dashboard</a>
            </div>

            <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>📋 Actions à effectuer :</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Examiner les détails de la demande</li>
                <li>Contacter le client au <strong>${specialOrder.client_phone}</strong></li>
                <li>Préparer un devis personnalisé</li>
                <li>Confirmer ou ajuster les détails</li>
              </ul>
            </div>
            
            <p style="margin-top: 30px;">Bonne journée,<br><strong>L'équipe ${appName}</strong></p>
          </div>
          <div class="footer">
            <p>Cet email a été envoyé automatiquement suite à une nouvelle commande spéciale.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Nouvelle Commande Spéciale !

      Commande #${specialOrder.id}

      Type d'événement : ${specialOrder.event_type}
      Date : ${eventDate}
      Heure : ${specialOrder.event_time}
      Nombre d'invités : ${specialOrder.number_of_guests}
      Lieu : ${specialOrder.delivery_address}, ${specialOrder.city}
      ${specialOrder.estimated_budget ? `Budget estimé : ${specialOrder.estimated_budget.toLocaleString()} FCFA` : ''}

      Informations du client :
      - Nom : ${specialOrder.client_name}
      - Email : ${specialOrder.client_email}
      - Téléphone : ${specialOrder.client_phone}

      Préférences de menu :
      ${specialOrder.menu_preferences}

      Actions à effectuer :
      - Examiner les détails de la demande
      - Contacter le client au ${specialOrder.client_phone}
      - Préparer un devis personnalisé
      - Confirmer ou ajuster les détails

      Accédez à votre dashboard : ${process.env.FRONTEND_URL}/traiteur/dashboard

      Cordialement,
      L'équipe ${appName}
    `;

    return this.sendEmail({
      to: businessOwnerEmail,
      subject: `🔔 Nouvelle commande spéciale #${specialOrder.id} - ${specialOrder.event_type}`,
      html,
      text,
    });
  }

  /**
   * Rappel d'expiration imminente (J-7, J-3, J-1)
   * @param {object} params
   * @param {string} params.ownerEmail
   * @param {string} params.ownerFirstName
   * @param {string} params.businessName
   * @param {string} params.planName
   * @param {number} params.planPrice
   * @param {Date}   params.endDate
   * @param {number} params.daysLeft - 7, 3 ou 1
   */
  async sendSubscriptionExpiryReminder({
    ownerEmail,
    ownerFirstName,
    businessName,
    planName,
    planPrice,
    endDate,
    daysLeft
  }) {
    const appName    = process.env.APP_NAME    || 'RestoTraiteur';
    const frontendUrl = process.env.FRONTEND_URL || 'https://votre-app.com';
    const renewUrl   = `${frontendUrl}/restaurant/dashboard#subscription`;

    const formattedDate = new Date(endDate).toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Couleur et urgence selon les jours restants
    const urgency = daysLeft === 1
      ? { color: '#e74c3c', label: '🚨 URGENT', emoji: '🚨' }
      : daysLeft <= 3
      ? { color: '#f39c12', label: '⚠️ Attention', emoji: '⚠️' }
      : { color: '#3498db', label: '📅 Rappel',   emoji: '📅' };

    const dayText = daysLeft === 1 ? 'demain' : `dans ${daysLeft} jours`;

    const html = `
      <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: ${urgency.color}; color: white; padding: 30px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 22px; }
            .content { padding: 30px; }
            .alert-banner { background: ${urgency.color}22; border-left: 4px solid ${urgency.color}; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .info-card { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #dee2e6; }
            .info-row:last-child { border-bottom: none; }
            .label { font-weight: bold; color: #666; }
            .value { color: #333; }
            .countdown { text-align: center; padding: 20px; background: ${urgency.color}; color: white; border-radius: 8px; margin: 20px 0; }
            .countdown .number { font-size: 48px; font-weight: bold; display: block; }
            .countdown .text { font-size: 16px; opacity: 0.9; }
            .btn { display: inline-block; padding: 15px 40px; background: ${urgency.color}; color: white; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; margin: 20px 0; }
            .features { background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #6c757d; background: #f8f9fa; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${urgency.emoji} Votre abonnement expire ${dayText}</h1>
            </div>
            <div class="content">
              <p>Bonjour <strong>${ownerFirstName || 'cher partenaire'}</strong>,</p>

              <div class="alert-banner">
                <strong>${urgency.label} :</strong> L'abonnement de <strong>${businessName}</strong>
                expire le <strong>${formattedDate}</strong>.
              </div>

              <div class="countdown">
                <span class="number">${daysLeft}</span>
                <span class="text">${daysLeft === 1 ? 'jour restant' : 'jours restants'}</span>
              </div>

              <div class="info-card">
                <h3 style="margin-top:0;">📋 Votre abonnement actuel</h3>
                <div class="info-row">
                  <span class="label">Établissement</span>
                  <span class="value">${businessName}</span>
                </div>
                <div class="info-row">
                  <span class="label">Plan</span>
                  <span class="value"><strong>${planName}</strong></span>
                </div>
                <div class="info-row">
                  <span class="label">Date d'expiration</span>
                  <span class="value">${formattedDate}</span>
                </div>
                ${planPrice ? `
                <div class="info-row">
                  <span class="label">Tarif</span>
                  <span class="value">${Number(planPrice).toLocaleString('fr-FR')} FCFA / mois</span>
                </div>` : ''}
              </div>

              <div class="features">
                <h4 style="margin-top:0;">⚡ Ce que vous perdez si vous ne renouvelez pas :</h4>
                <ul style="margin:10px 0; padding-left:20px;">
                  <li>Visibilité sur la plateforme réduite</li>
                  <li>Limites sur les commandes et réservations</li>
                  <li>Accès aux fonctionnalités Premium désactivé</li>
                  <li>Support prioritaire suspendu</li>
                </ul>
              </div>

              <div style="text-align:center;">
                <a href="${renewUrl}" class="btn">🔄 Renouveler maintenant</a>
              </div>

              <p style="color:#666; font-size:13px; text-align:center;">
                Besoin d'aide ? Contactez-nous à <a href="mailto:${process.env.SUPPORT_EMAIL || 'support@restotraiteur.com'}">${process.env.SUPPORT_EMAIL || 'support@restotraiteur.com'}</a>
              </p>

              <p>Cordialement,<br><strong>L'équipe ${appName}</strong></p>
            </div>
            <div class="footer">
              <p>Cet email est envoyé automatiquement. Merci de ne pas y répondre directement.</p>
              <p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p>
            </div>
          </div>
        </body>
      </html>`;

    const text = `
      Bonjour ${ownerFirstName || 'cher partenaire'},

      ${urgency.label} : Votre abonnement ${planName} pour ${businessName} expire ${dayText} (${formattedDate}).

      Il vous reste ${daysLeft} ${daysLeft === 1 ? 'jour' : 'jours'}.

      Pour renouveler votre abonnement : ${renewUrl}

      Sans renouvellement, votre visibilité et vos fonctionnalités seront limitées.

      Cordialement,
      L'équipe ${appName}
      `;

    return this.sendEmail({
      to:      ownerEmail,
      subject: `${urgency.emoji} Votre abonnement ${planName} expire ${dayText} - ${businessName}`,
      html,
      text
    });
  }

  /**
   * Notification d'expiration effective (abonnement expiré hier)
   */
  async sendSubscriptionExpiredNotification({
    ownerEmail,
    ownerFirstName,
    businessName,
    planName,
    endDate
  }) {
    const appName     = process.env.APP_NAME    || 'RestoTraiteur';
    const frontendUrl  = process.env.FRONTEND_URL || 'https://votre-app.com';
    const renewUrl    = `${frontendUrl}/restaurant/dashboard#subscription`;

    const formattedDate = new Date(endDate).toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const html = `
      <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; }
              .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #636e72, #2d3436); color: white; padding: 30px 20px; text-align: center; }
              .content { padding: 30px; }
              .expired-banner { background: #ffeaa7; border-left: 4px solid #fdcb6e; padding: 15px; border-radius: 4px; margin: 20px 0; }
              .info-card { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
              .btn-renew { display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #00b894, #00cec9); color: white; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #6c757d; background: #f8f9fa; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⏰ Votre abonnement a expiré</h1>
              </div>
              <div class="content">
                <p>Bonjour <strong>${ownerFirstName || 'cher partenaire'}</strong>,</p>

                <div class="expired-banner">
                  <strong>⏰ Information :</strong> Votre abonnement <strong>${planName}</strong>
                  pour <strong>${businessName}</strong> a expiré le <strong>${formattedDate}</strong>.
                </div>

                <div class="info-card">
                  <h4 style="margin-top:0; color:#e17055;">🔒 Fonctionnalités actuellement limitées :</h4>
                  <ul style="margin:0; padding-left:20px; color:#555;">
                    <li>Votre établissement passe au plan gratuit</li>
                    <li>Visibilité réduite sur la plateforme</li>
                    <li>Limitation du nombre de commandes/réservations</li>
                    <li>Fonctionnalités Premium désactivées</li>
                  </ul>
                </div>

                <div class="info-card" style="border-left: 4px solid #00b894; background: #e8f8f5;">
                  <h4 style="margin-top:0; color:#00b894;">✅ Renouvelez pour retrouver tous vos avantages</h4>
                  <ul style="margin:0; padding-left:20px;">
                    <li>Visibilité complète et prioritaire</li>
                    <li>Commandes et réservations illimitées</li>
                    <li>Support prioritaire</li>
                    <li>Outils de branding personnalisé</li>
                  </ul>
                </div>

                <div style="text-align:center; margin: 30px 0;">
                  <a href="${renewUrl}" class="btn-renew">🔄 Renouveler mon abonnement</a>
                </div>

                <p>Votre compte et vos données sont conservés. Vous pouvez reprendre votre activité à tout moment.</p>

                <p>Cordialement,<br><strong>L'équipe ${appName}</strong></p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} ${appName}. Tous droits réservés.</p>
              </div>
            </div>
          </body>
        </html>`;

    const text = `
      Bonjour ${ownerFirstName || 'cher partenaire'},

      Votre abonnement ${planName} pour ${businessName} a expiré le ${formattedDate}.

      Votre établissement est maintenant sur le plan gratuit avec des fonctionnalités limitées.

      Pour renouveler : ${renewUrl}

      Vos données sont conservées. Vous pouvez reprendre à tout moment.

      Cordialement,
      L'équipe ${appName}
    `;

    return this.sendEmail({
      to:      ownerEmail,
      subject: `⏰ Abonnement expiré - ${businessName} | Renouvelez maintenant`,
      html,
      text
    });
  }

  /**
   * Envoyer un reçu de commande par email avec PDF en pièce jointe
   * Fonctionne pour clients connectés ET invités
   *
   * @param {Object} params
   * @param {string} params.toEmail       - Email du destinataire
   * @param {string} params.toName        - Nom du destinataire
   * @param {Object} params.order         - Données complètes de la commande
   * @param {Buffer} params.pdfBuffer     - Buffer du PDF généré
   * @param {boolean} params.isSpecial    - true si commande spéciale
   */
  async sendOrderReceipt({ toEmail, toName, order, pdfBuffer, isSpecial = false }) {
    try {
      const orderRef = `${isSpecial ? 'SP-' : ''}${order.id}`;
      const amount = parseFloat(order.total_amount || order.estimated_budget || 0)
        .toLocaleString('fr-FR', { minimumFractionDigits: 0 });

      const html = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Votre reçu RestoTraiteur</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
            .wrapper { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 40px 30px; text-align: center; }
            .header h1 { color: #fff; font-size: 28px; margin: 0 0 6px; }
            .header p { color: rgba(255,255,255,.85); font-size: 14px; margin: 0; }
            .receipt-badge { display: inline-block; background: rgba(255,255,255,.2); color: #fff; padding: 6px 18px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-top: 16px; }
            .body { padding: 36px 40px; }
            .greeting { font-size: 16px; color: #212529; margin-bottom: 24px; }
            .summary-card { background: #f8f9fa; border-radius: 10px; padding: 24px; margin: 24px 0; border-left: 4px solid #667eea; }
            .summary-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e9ecef; }
            .summary-row:last-child { border-bottom: none; }
            .summary-label { color: #6c757d; font-size: 13px; }
            .summary-value { font-weight: 600; color: #212529; font-size: 13px; }
            .total-row { background: #fff; border-radius: 8px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin: 16px 0; border: 2px solid #667eea; }
            .total-label { font-size: 16px; font-weight: 700; color: #212529; }
            .total-amount { font-size: 22px; font-weight: 700; color: #667eea; }
            .pdf-note { background: #e8f4f8; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0; }
            .pdf-note p { margin: 0; font-size: 13px; color: #495057; }
            .pdf-icon { font-size: 28px; margin-bottom: 8px; }
            .footer { background: #f8f9fa; padding: 24px 40px; text-align: center; border-top: 1px solid #e9ecef; }
            .footer p { color: #adb5bd; font-size: 12px; margin: 4px 0; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="header">
              <h1>🧾 Votre Reçu</h1>
              <p>RestoTraiteur — Votre plateforme de commande</p>
              <span class="receipt-badge">Commande N° ${orderRef}</span>
            </div>
            <div class="body">
              <p class="greeting">Bonjour <strong>${toName || 'cher client'}</strong>,</p>
              <p style="color:#495057; font-size:14px; line-height:1.6;">
                Merci pour votre commande ! Vous trouverez ci-joint votre reçu PDF.
                Voici un résumé de votre commande :
              </p>

              <div class="summary-card">
                <div class="summary-row">
                  <span class="summary-label">Référence</span>
                  <span class="summary-value">#${orderRef}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Établissement</span>
                  <span class="summary-value">${order.business_name || 'N/A'}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Date</span>
                  <span class="summary-value">${new Date(order.created_at || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                </div>
                ${order.payment_method ? `
                <div class="summary-row">
                  <span class="summary-label">Paiement</span>
                  <span class="summary-value">${order.payment_method.toUpperCase()}</span>
                </div>` : ''}
                ${isSpecial && order.event_type ? `
                <div class="summary-row">
                  <span class="summary-label">Type d'événement</span>
                  <span class="summary-value">${order.event_type}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Date de l'événement</span>
                  <span class="summary-value">${order.event_date ? new Date(order.event_date).toLocaleDateString('fr-FR') : 'N/A'}</span>
                </div>` : ''}
              </div>

              <div class="total-row">
                <span class="total-label">💰 Total</span>
                <span class="total-amount">${amount} FCFA</span>
              </div>

              <div class="pdf-note">
                <div class="pdf-icon">📄</div>
                <p><strong>Votre reçu PDF est en pièce jointe</strong></p>
                <p>Conservez-le pour vos archives. Il fait foi de paiement.</p>
              </div>

              <p style="color:#6c757d; font-size:13px; text-align:center; margin-top:24px;">
                Une question ? Contactez-nous à
                <a href="mailto:support@restotraiteur.com" style="color:#667eea;">support@restotraiteur.com</a>
              </p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} RestoTraiteur — Tous droits réservés</p>
              <p>Ce reçu a été généré automatiquement suite à votre commande.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: `"RestoTraiteur" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: `🧾 Votre reçu — Commande #${orderRef} — RestoTraiteur`,
        html,
        attachments: [
          {
            filename: `recu-${orderRef}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }
        ]
      };

      await this.transporter.sendMail(mailOptions);
      this.logger?.info?.(`✅ Reçu PDF envoyé à ${toEmail} pour commande #${orderRef}`);
      return { success: true };

    } catch (error) {
      this.logger?.error?.('Erreur envoi reçu email:', error.message);
      return { success: false, error: error.message };
    }
  }

}

const emailService = new EmailService();

module.exports = {
  emailService,
};