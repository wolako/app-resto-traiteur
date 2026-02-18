// backend/services/receiptService.js
// Génère des reçus PDF pour les commandes payées
// Dépendance : npm install pdfkit

const PDFDocument = require('pdfkit');
const path = require('path');
const logger = require('../utils/logger');

class ReceiptService {

  /**
   * Génère un reçu PDF en mémoire et retourne un Buffer
   * Compatible commandes normales ET commandes spéciales
   */
  async generateReceiptBuffer(orderData) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Reçu #${orderData.id}`,
          Author: 'RestoTraiteur',
          Subject: 'Reçu de commande',
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this._buildReceipt(doc, orderData);
      doc.end();
    });
  }

  /**
   * Construit le contenu du reçu dans le document PDF
   */
  _buildReceipt(doc, order) {
    const isSpecial = order.is_special === true;
    const pageWidth = doc.page.width - 100; // marges

    // ─── HEADER ──────────────────────────────────────────
    // Bande de couleur en haut
    doc.rect(0, 0, doc.page.width, 8).fill('#667eea');

    // Logo / Nom de la plateforme
    doc.moveDown(1);
    doc
      .font('Helvetica-Bold')
      .fontSize(26)
      .fillColor('#667eea')
      .text('RestoTraiteur', 50, 30, { align: 'left' });

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#6c757d')
      .text('Votre plateforme de commande en ligne', 50, 60);

    // Titre REÇU à droite
    doc
      .font('Helvetica-Bold')
      .fontSize(32)
      .fillColor('#212529')
      .text('REÇU', 0, 30, { align: 'right' });

    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#6c757d')
      .text(
        `N° ${isSpecial ? 'SP-' : ''}${order.id}`,
        0, 68,
        { align: 'right' }
      );

    // Ligne de séparation
    doc.moveDown(2);
    doc.moveTo(50, 100).lineTo(doc.page.width - 50, 100).strokeColor('#dee2e6').lineWidth(1).stroke();

    // ─── INFOS COMMANDE & CLIENT ─────────────────────────
    const startY = 120;

    // Colonne gauche — infos établissement
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#6c757d')
      .text('ÉTABLISSEMENT', 50, startY);

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#212529')
      .text(order.business_name || 'N/A', 50, startY + 16);

    if (order.business_address) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#495057')
        .text(order.business_address, 50, startY + 34);
    }

    if (order.business_phone) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#495057')
        .text(`Tél : ${order.business_phone}`, 50, startY + 48);
    }

    // Colonne droite — infos client
    const rightX = doc.page.width / 2 + 20;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#6c757d')
      .text('CLIENT', rightX, startY);

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#212529')
      .text(order.client_name || 'Invité', rightX, startY + 16);

    if (order.client_email) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#495057')
        .text(order.client_email, rightX, startY + 34);
    }

    if (order.client_phone) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#495057')
        .text(`Tél : ${order.client_phone}`, rightX, startY + 48);
    }

    // ─── INFOS DATE & PAIEMENT ───────────────────────────
    const infoY = startY + 80;
    doc.moveTo(50, infoY).lineTo(doc.page.width - 50, infoY).strokeColor('#dee2e6').lineWidth(0.5).stroke();

    const dateStr = new Date(order.created_at || Date.now()).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const boxY = infoY + 12;
    const colW = (pageWidth) / 3;

    // Case Date
    this._infoBox(doc, 50, boxY, colW - 10, 'Date de commande', dateStr);

    // Case méthode de paiement
    const payMethod = order.payment_method || 'N/A';
    this._infoBox(doc, 50 + colW, boxY, colW - 10, 'Méthode de paiement', payMethod.toUpperCase());

    // Case statut
    const statusLabel = this._getStatusLabel(order.status || order.payment_status);
    this._infoBox(doc, 50 + colW * 2, boxY, colW - 10, 'Statut', statusLabel, '#28a745');

    // ─── TABLEAU DES ARTICLES ─────────────────────────────
    const tableY = boxY + 75;

    if (!isSpecial && order.items && order.items.length > 0) {
      this._drawItemsTable(doc, order.items, tableY);
    } else if (isSpecial) {
      this._drawSpecialOrderDetails(doc, order, tableY);
    } else {
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#6c757d')
        .text('Détails des articles non disponibles', 50, tableY + 10);
    }

    // ─── TOTAL ───────────────────────────────────────────
    const totalY = doc.y + 20;
    const totalAmount = parseFloat(order.total_amount || order.estimated_budget || 0);

    // Fond gris clair pour le total
    doc.rect(doc.page.width - 250, totalY, 200, 45).fill('#f8f9fa');

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#212529')
      .text('TOTAL', doc.page.width - 240, totalY + 8);

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#667eea')
      .text(
        `${this._formatAmount(totalAmount)} FCFA`,
        doc.page.width - 240, totalY + 24,
        { width: 180, align: 'right' }
      );

    // ─── NOTES ───────────────────────────────────────────
    if (order.notes) {
      doc.moveDown(2);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#495057')
        .text('Notes :');
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#6c757d')
        .text(order.notes);
    }

    // ─── FOOTER ──────────────────────────────────────────
    const footerY = doc.page.height - 80;

    doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).strokeColor('#dee2e6').lineWidth(0.5).stroke();

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#adb5bd')
      .text(
        'Merci pour votre confiance ! Pour toute question : support@restotraiteur.com',
        50, footerY + 10,
        { align: 'center', width: pageWidth }
      );

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#adb5bd')
      .text(
        `Reçu généré le ${new Date().toLocaleDateString('fr-FR')} — RestoTraiteur © ${new Date().getFullYear()}`,
        50, footerY + 24,
        { align: 'center', width: pageWidth }
      );

    // Bande de couleur en bas
    doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill('#667eea');
  }

  /**
   * Dessine une case d'info (label + valeur)
   */
  _infoBox(doc, x, y, width, label, value, valueColor = '#212529') {
    doc.rect(x, y, width, 58).fill('#f8f9fa');
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#6c757d')
      .text(label, x + 8, y + 8, { width: width - 16 });
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(valueColor)
      .text(value, x + 8, y + 26, { width: width - 16 });
  }

  /**
   * Dessine le tableau des articles (commande normale)
   */
  _drawItemsTable(doc, items, startY) {
    const cols = {
      name:     { x: 50,  w: 220 },
      qty:      { x: 280, w: 60  },
      price:    { x: 350, w: 100 },
      subtotal: { x: 460, w: 90  },
    };

    // En-tête tableau
    doc.rect(50, startY, doc.page.width - 100, 24).fill('#667eea');

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff');
    doc.text('Article',      cols.name.x + 5,     startY + 7);
    doc.text('Qté',          cols.qty.x,           startY + 7, { width: cols.qty.w, align: 'center' });
    doc.text('Prix unit.',   cols.price.x,         startY + 7, { width: cols.price.w, align: 'right' });
    doc.text('Sous-total',   cols.subtotal.x,      startY + 7, { width: cols.subtotal.w, align: 'right' });

    let rowY = startY + 24;

    items.forEach((item, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8f9fa';
      doc.rect(50, rowY, doc.page.width - 100, 28).fill(bg);

      doc.font('Helvetica').fontSize(10).fillColor('#212529');
      doc.text(item.item_name || item.name || 'Article', cols.name.x + 5, rowY + 9, { width: cols.name.w - 10 });
      doc.text(String(item.quantity), cols.qty.x, rowY + 9, { width: cols.qty.w, align: 'center' });
      doc.text(
        `${this._formatAmount(item.unit_price)} FCFA`,
        cols.price.x, rowY + 9,
        { width: cols.price.w, align: 'right' }
      );
      doc.text(
        `${this._formatAmount(item.subtotal)} FCFA`,
        cols.subtotal.x, rowY + 9,
        { width: cols.subtotal.w, align: 'right' }
      );

      rowY += 28;
    });

    // Bordure du tableau
    doc.rect(50, startY, doc.page.width - 100, rowY - startY).strokeColor('#dee2e6').lineWidth(0.5).stroke();

    doc.moveDown(0.5);
  }

  /**
   * Dessine les détails d'une commande spéciale (traiteur)
   */
  _drawSpecialOrderDetails(doc, order, startY) {
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#212529')
      .text('Détails de la commande spéciale', 50, startY);

    const details = [
      ['Type d\'événement', order.event_type],
      ['Date de l\'événement', order.event_date ? new Date(order.event_date).toLocaleDateString('fr-FR') : 'N/A'],
      ['Heure', order.event_time || 'N/A'],
      ['Nombre de convives', order.number_of_guests ? `${order.number_of_guests} personnes` : 'N/A'],
      ['Adresse de livraison', order.delivery_address || 'N/A'],
      ['Ville', order.city || 'N/A'],
      ['Préférences menu', order.menu_preferences || 'N/A'],
    ];

    if (order.dietary_restrictions) {
      details.push(['Restrictions alimentaires', order.dietary_restrictions]);
    }
    if (order.special_requests) {
      details.push(['Demandes spéciales', order.special_requests]);
    }

    let y = startY + 20;
    details.forEach(([label, value], i) => {
      const bg = i % 2 === 0 ? '#f8f9fa' : '#ffffff';
      doc.rect(50, y, doc.page.width - 100, 22).fill(bg);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#495057').text(label + ' :', 60, y + 6);
      doc.font('Helvetica').fontSize(10).fillColor('#212529').text(value || 'N/A', 230, y + 6, { width: 300 });
      y += 22;
    });

    doc.y = y;
  }

  /**
   * Formate un montant avec séparateur de milliers
   */
  _formatAmount(amount) {
    return parseFloat(amount || 0).toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  /**
   * Retourne le libellé du statut
   */
  _getStatusLabel(status) {
    const labels = {
      pending:   'En attente',
      confirmed: 'Confirmée',
      preparing: 'En préparation',
      ready:     'Prête',
      delivered: 'Livrée',
      cancelled: 'Annulée',
      paid:      '✓ Payé',
      success:   '✓ Payé',
      failed:    'Échoué',
    };
    return labels[status] || status || 'N/A';
  }

  /**
   * Construit les données complètes d'une commande pour le reçu
   * (inclut les items depuis la DB)
   */
  async buildOrderReceiptData(pool, orderId) {
    // Commande + business
    const orderResult = await pool.query(
      `SELECT o.*, b.name AS business_name, b.address AS business_address, b.phone AS business_phone
       FROM orders o
       JOIN businesses b ON o.business_id = b.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) return null;

    const order = orderResult.rows[0];

    // Items
    const itemsResult = await pool.query(
      `SELECT oi.*, mi.name AS item_name, mi.description AS item_description
       FROM order_items oi
       JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = $1
       ORDER BY oi.id`,
      [orderId]
    );

    order.items = itemsResult.rows;
    order.is_special = false;
    return order;
  }

  /**
   * Construit les données d'une commande spéciale pour le reçu
   */
  async buildSpecialOrderReceiptData(pool, specialOrderId) {
    const result = await pool.query(
      `SELECT so.*, b.name AS business_name, b.address AS business_address, b.phone AS business_phone
       FROM special_orders so
       JOIN businesses b ON so.business_id = b.id
       WHERE so.id = $1`,
      [specialOrderId]
    );

    if (result.rows.length === 0) return null;

    const order = result.rows[0];
    order.is_special = true;
    order.total_amount = order.estimated_budget;
    order.status = order.status;
    order.payment_method = 'N/A';
    return order;
  }
}

module.exports = new ReceiptService();