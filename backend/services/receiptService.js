// backend/services/receiptService.js
// Génère des reçus PDF pour les commandes payées
// Dépendance : npm install pdfkit

const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');

class ReceiptService {

  /**
   * Génère un reçu PDF en mémoire et retourne un Buffer
   */
  async generateReceiptBuffer(orderData) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Reçu ${orderData.id}`,
          Author: 'RestoTraiteur',
          Subject: 'Reçu de commande',
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this._buildReceipt(doc, orderData);
      doc.end();
    });
  }

  /**
   * Formate un montant sans espace insécable (\u00A0).
   * PDFKit ne rend pas \u00A0 correctement → on utilise un espace simple.
   */
  _fmt(amount) {
    return Math.round(parseFloat(amount || 0))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
  }

  /**
   * Construit le contenu du reçu
   */
  _buildReceipt(doc, order) {
    const isSpecial = order.is_special === true;
    const pageW     = doc.page.width;   // 595
    const marginL   = 50;
    const marginR   = 50;
    const contentW  = pageW - marginL - marginR;  // 495

    // ── Bande supérieure ─────────────────────────────────
    doc.rect(0, 0, pageW, 6).fill('#C94040');

    // ── LOGO à gauche ────────────────────────────────────
    doc
      .font('Helvetica-Bold').fontSize(26)
      .fillColor('#C94040').text('Resto', marginL, 22, { continued: true })
      .fillColor('#2A9D5C').text('Traiteur');

    doc
      .font('Helvetica').fontSize(9.5)
      .fillColor('#6C757D')
      .text('Votre plateforme de commande en ligne', marginL, 53);

    // ── REÇU + numéro à droite ────────────────────────────
    const ref = `N° ${isSpecial ? 'SP-' : ''}${order.id}`;
    doc
      .font('Helvetica-Bold').fontSize(28)
      .fillColor('#1A1A2E')
      .text('REÇU', 0, 22, { align: 'right', width: pageW - marginR });

    doc
      .font('Helvetica').fontSize(11)
      .fillColor('#C94040')
      .text(ref, 0, 56, { align: 'right', width: pageW - marginR });

    // ── Ligne de séparation ───────────────────────────────
    const sepY = 78;
    doc.moveTo(marginL, sepY).lineTo(pageW - marginR, sepY)
       .strokeColor('#E9ECEF').lineWidth(1).stroke();

    // ════════════════════════════════════════════════════
    // BLOCS ÉTABLISSEMENT (gauche) + CLIENT (droite)
    // Deux colonnes côte à côte, chacune avec une bordure
    // colorée en haut : rouge pour établissement, vert pour client
    // ════════════════════════════════════════════════════
    const blockY   = 90;
    const blockW   = (contentW - 12) / 2;  // largeur de chaque bloc
    const blockH   = 72;
    const leftX    = marginL;
    const rightX   = marginL + blockW + 12;  // ✅ Bloc CLIENT ancré à droite

    // Fond gris clair
    doc.rect(leftX,  blockY, blockW, blockH).fill('#F8F9FA');
    doc.rect(rightX, blockY, blockW, blockH).fill('#F8F9FA');

    // Bordure colorée en haut : rouge = établissement, vert = client
    doc.rect(leftX,  blockY, blockW, 3).fill('#C94040');
    doc.rect(rightX, blockY, blockW, 3).fill('#2A9D5C');

    // Contenu bloc ÉTABLISSEMENT
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#9CA3AF')
       .text('ÉTABLISSEMENT', leftX + 10, blockY + 9, { characterSpacing: 0.5 });

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1A1A2E')
       .text(order.business_name || 'N/A', leftX + 10, blockY + 22, { width: blockW - 20 });

    let bizLineY = blockY + 38;
    if (order.business_address) {
      doc.font('Helvetica').fontSize(9).fillColor('#495057')
         .text(order.business_address, leftX + 10, bizLineY, { width: blockW - 20 });
      bizLineY += 13;
    }
    if (order.business_phone) {
      doc.font('Helvetica').fontSize(9).fillColor('#495057')
         .text(`Tél : ${order.business_phone}`, leftX + 10, bizLineY, { width: blockW - 20 });
    }

    // ✅ Contenu bloc CLIENT — positionné à rightX (droite)
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#9CA3AF')
       .text('CLIENT', rightX + 10, blockY + 9, {
          width: blockW - 20,
          align: 'right',         // ✅ label aligné à droite
          characterSpacing: 0.5
        });

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1A1A2E')
       .text(order.client_name || 'Invité', rightX + 10, blockY + 22, {
          width: blockW - 20,
          align: 'right',         // ✅ nom aligné à droite
        });

    let clientLineY = blockY + 38;
    if (order.client_email) {
      doc.font('Helvetica').fontSize(9).fillColor('#495057')
         .text(order.client_email, rightX + 10, clientLineY, { width: blockW - 20, align: 'right', });
      clientLineY += 13;
    }
    if (order.client_phone) {
      doc.font('Helvetica').fontSize(9).fillColor('#495057')
         .text(`Tél : ${order.client_phone}`, rightX + 10, clientLineY, { width: blockW - 20, align: 'right', });
    }

    // ── Ligne de séparation après les blocs ──────────────
    const afterBlockY = blockY + blockH + 10;
    doc.moveTo(marginL, afterBlockY).lineTo(pageW - marginR, afterBlockY)
       .strokeColor('#E9ECEF').lineWidth(0.5).stroke();

    // ════════════════════════════════════════════════════
    // BANDE MÉTA : Date | Paiement | Statut
    // Trois colonnes avec label en gris clair et valeur en gras
    // ════════════════════════════════════════════════════
    const metaY  = afterBlockY + 8;
    const metaH  = 52;
    const metaCW = contentW / 3;

    doc.rect(marginL, metaY, contentW, metaH).fill('#F8F9FA');
    // Séparateurs verticaux
    doc.moveTo(marginL + metaCW,     metaY + 6).lineTo(marginL + metaCW,     metaY + metaH - 6)
       .strokeColor('#DEE2E6').lineWidth(0.5).stroke();
    doc.moveTo(marginL + metaCW * 2, metaY + 6).lineTo(marginL + metaCW * 2, metaY + metaH - 6)
       .strokeColor('#DEE2E6').lineWidth(0.5).stroke();

    const dateStr = new Date(order.created_at || Date.now())
      .toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const statusLabel = this._getStatusLabel(order.status || order.payment_status);
    const statusColor = { 'En attente': '#D4A843', 'Confirmée': '#2A9D5C', 'Livrée': '#2A9D5C', 'Annulée': '#C94040' }[statusLabel] || '#495057';

    const metaCells = [
      { label: 'Date de commande',    value: dateStr,    color: '#1A1A2E' },
      { label: 'Méthode de paiement', value: (order.payment_method || 'N/A').toUpperCase(), color: '#1A1A2E' },
      { label: 'Statut',              value: statusLabel, color: statusColor },
    ];

    metaCells.forEach((cell, i) => {
      const cx = marginL + metaCW * i;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#9CA3AF')
         .text(cell.label, cx + 10, metaY + 9, { width: metaCW - 16, characterSpacing: 0.3 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(cell.color)
         .text(cell.value, cx + 10, metaY + 24, { width: metaCW - 16 });
    });

    // Bordure autour de la bande méta
    doc.rect(marginL, metaY, contentW, metaH).strokeColor('#E9ECEF').lineWidth(0.5).stroke();

    // ════════════════════════════════════════════════════
    // TABLEAU DES ARTICLES
    // ════════════════════════════════════════════════════
    const tableY = metaY + metaH + 14;

    if (!isSpecial && order.items && order.items.length > 0) {
      this._drawItemsTable(doc, order.items, tableY, marginL, contentW);
    } else if (isSpecial) {
      this._drawSpecialOrderDetails(doc, order, tableY, marginL, contentW);
    } else {
      doc.font('Helvetica').fontSize(11).fillColor('#6C757D')
         .text('Détails des articles non disponibles', marginL, tableY + 10);
      doc.moveDown(2);
    }

    // ── Ligne de total ────────────────────────────────────
    const totalY     = doc.y + 14;
    const totalBoxW  = 220;
    const totalBoxX  = pageW - marginR - totalBoxW;

    doc.rect(totalBoxX, totalY, totalBoxW, 44).fill('#C94040');
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#FFFFFF')
       .text('TOTAL', totalBoxX + 14, totalY + 8);
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#FFFFFF')
       .text(this._fmt(order.total_amount || order.estimated_budget || 0),
             totalBoxX + 14, totalY + 22, { width: totalBoxW - 28, align: 'right' });

    // ── Notes ─────────────────────────────────────────────
    if (order.notes) {
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#495057').text('Notes :');
      doc.font('Helvetica').fontSize(10).fillColor('#6C757D').text(order.notes);
    }

    // ════════════════════════════════════════════════════
    // PIED DE PAGE
    // ════════════════════════════════════════════════════
    const footerY = doc.page.height - 60;

    doc.rect(marginL, footerY, contentW, 34).fill('#F8F9FA');
    doc.font('Helvetica').fontSize(8.5).fillColor('#6C757D')
       .text('Merci pour votre confiance !  ·  support@restotraiteur.com',
             marginL, footerY + 7, { align: 'center', width: contentW });
    doc.font('Helvetica').fontSize(8).fillColor('#ADB5BD')
       .text(`Reçu généré le ${new Date().toLocaleDateString('fr-FR')}  —  RestoTraiteur © ${new Date().getFullYear()}`,
             marginL, footerY + 20, { align: 'center', width: contentW });

    // Bande inférieure
    doc.rect(0, doc.page.height - 6, pageW, 6).fill('#C94040');
  }

  /**
   * Dessine le tableau des articles (commande normale)
   */
  _drawItemsTable(doc, items, startY, marginL, contentW) {
    const colW = {
      name:     contentW * 0.47,
      qty:      contentW * 0.10,
      price:    contentW * 0.21,
      subtotal: contentW * 0.22,
    };
    const x = {
      name:     marginL,
      qty:      marginL + colW.name,
      price:    marginL + colW.name + colW.qty,
      subtotal: marginL + colW.name + colW.qty + colW.price,
    };
    const rowH = 26;

    // En-tête
    doc.rect(marginL, startY, contentW, 24).fill('#1A1A2E');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF');
    doc.text('ARTICLE',     x.name     + 6, startY + 8);
    doc.text('QTÉ',         x.qty,      startY + 8, { width: colW.qty,      align: 'center' });
    doc.text('PRIX UNIT.',  x.price,    startY + 8, { width: colW.price,    align: 'right' });
    doc.text('SOUS-TOTAL',  x.subtotal, startY + 8, { width: colW.subtotal, align: 'right' });

    let rowY = startY + 24;
    items.forEach((item, i) => {
      doc.rect(marginL, rowY, contentW, rowH).fill(i % 2 === 0 ? '#FFFFFF' : '#F8F9FA');
      doc.font('Helvetica').fontSize(9.5).fillColor('#1A1A2E');
      doc.text(item.item_name || item.name || 'Article', x.name + 6, rowY + 8, { width: colW.name - 10 });
      doc.text(String(item.quantity), x.qty, rowY + 8, { width: colW.qty, align: 'center' });
      doc.text(this._fmt(item.unit_price), x.price, rowY + 8, { width: colW.price - 6, align: 'right' });
      doc.font('Helvetica-Bold')
         .text(this._fmt(item.subtotal), x.subtotal, rowY + 8, { width: colW.subtotal - 6, align: 'right' });
      rowY += rowH;
    });

    // Bordure du tableau
    doc.rect(marginL, startY, contentW, rowY - startY).strokeColor('#E9ECEF').lineWidth(0.5).stroke();
    doc.y = rowY;
  }

  /**
   * Dessine les détails d'une commande spéciale
   */
  _drawSpecialOrderDetails(doc, order, startY, marginL, contentW) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1A1A2E')
       .text('Détails de la commande spéciale', marginL, startY);

    const details = [
      ['Type d\'événement',    order.event_type],
      ['Date de l\'événement', order.event_date ? new Date(order.event_date).toLocaleDateString('fr-FR') : 'N/A'],
      ['Heure',                order.event_time || 'N/A'],
      ['Nombre de convives',   order.number_of_guests ? `${order.number_of_guests} personnes` : 'N/A'],
      ['Adresse',              order.delivery_address || 'N/A'],
      ['Ville',                order.city || 'N/A'],
      ['Préférences menu',     order.menu_preferences || 'N/A'],
      ['Restrictions alim.',   order.dietary_restrictions && order.dietary_restrictions !== 'Non' ? order.dietary_restrictions : 'Non'],
      ['Demandes spéciales',   order.special_requests && order.special_requests !== 'Non' ? order.special_requests : 'Non'],
    ];

    let y = startY + 18;
    details.forEach(([label, value], i) => {
      doc.rect(marginL, y, contentW, 22).fill(i % 2 === 0 ? '#F8F9FA' : '#FFFFFF');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#495057').text(label + ' :', marginL + 8, y + 7);
      doc.font('Helvetica').fontSize(9).fillColor('#1A1A2E').text(value || 'N/A', marginL + 175, y + 7, { width: contentW - 185 });
      y += 22;
    });
    doc.y = y;
  }

  _getStatusLabel(status) {
    const labels = {
      pending: 'En attente', confirmed: 'Confirmée', preparing: 'En préparation',
      ready: 'Prête', delivered: 'Livrée', cancelled: 'Annulée',
      paid: 'Payé', success: 'Payé', failed: 'Échoué',
    };
    return labels[status] || status || 'N/A';
  }

  async buildOrderReceiptData(pool, orderId) {
    const orderResult = await pool.query(
      `SELECT o.*, b.name AS business_name, b.address AS business_address, b.phone AS business_phone
       FROM orders o JOIN businesses b ON o.business_id = b.id WHERE o.id = $1`,
      [orderId]
    );
    if (!orderResult.rows.length) return null;
    const order = orderResult.rows[0];
    const itemsResult = await pool.query(
      `SELECT oi.*, mi.name AS item_name, mi.description AS item_description
       FROM order_items oi JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = $1 ORDER BY oi.id`,
      [orderId]
    );
    order.items = itemsResult.rows;
    order.is_special = false;
    return order;
  }

  async buildSpecialOrderReceiptData(pool, specialOrderId) {
    const result = await pool.query(
      `SELECT so.*, b.name AS business_name, b.address AS business_address, b.phone AS business_phone
       FROM special_orders so JOIN businesses b ON so.business_id = b.id WHERE so.id = $1`,
      [specialOrderId]
    );
    if (!result.rows.length) return null;
    const order = result.rows[0];
    order.is_special = true;
    order.total_amount = order.estimated_budget;
    order.payment_method = 'N/A';
    return order;
  }
}

module.exports = new ReceiptService();