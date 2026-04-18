/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FEE CALCULATOR - VERSION CORRIGÉE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * FIX PRINCIPAL : PostgreSQL retourne les DECIMAL sous forme de string
 * (ex: "10000.00"). Math.round(Number()) force la conversion en entier.
 * Sans ça : "10000.00" + 390 = 10390.00 (float) → CinetPay rejette.
 */

function calculateDeliveryFee(distanceKm) {
  if (!distanceKm || distanceKm <= 0) return 0;
  if (distanceKm < 5)  return 500;
  if (distanceKm < 10) return 1000;
  if (distanceKm < 20) return 1500;
  return 2000;
}

function calculatePaymentFee(amount, paymentMethod) {
  if (!paymentMethod) return 0;
  if (paymentMethod === 'card') {
    return Math.round((amount * 0.035) + 150);
  }
  if (paymentMethod === 'Mixx By Yas' || paymentMethod === 'flooz') {
    return Math.round((amount * 0.029) + 100);
  }
  return 0;
}

function calculateOrderFees({ subtotal, paymentType, paymentMethod, deliveryDistance = null }) {
  // ✅ FIX : forcer la conversion en entier dès le début
  const amount = Math.round(Number(subtotal));
  let deliveryFee = 0;
  let paymentFee = 0;

  if (paymentType === 'cod' && deliveryDistance) {
    deliveryFee = calculateDeliveryFee(deliveryDistance);
  }

  if (paymentType === 'online') {
    paymentFee = calculatePaymentFee(amount, paymentMethod);
  }

  const totalAmount = amount + deliveryFee + paymentFee;

  return {
    subtotal_amount: amount,
    delivery_fee: deliveryFee,
    payment_fee: paymentFee,
    total_amount: totalAmount,
    restaurant_receives: amount,
    breakdown: {
      subtotal:    `${amount.toLocaleString('fr-FR')} FCFA`,
      deliveryFee: deliveryFee > 0 ? `${deliveryFee.toLocaleString('fr-FR')} FCFA` : 'Gratuit',
      paymentFee:  paymentFee  > 0 ? `${paymentFee.toLocaleString('fr-FR')} FCFA`  : 'Aucun',
      total:       `${totalAmount.toLocaleString('fr-FR')} FCFA`
    }
  };
}

/**
 * ✅ VERSION CORRIGÉE — calculateDepositFees
 * 
 * AVANT : depositAmount = "10000.00" (string PostgreSQL)
 *         depositPaymentFee = Math.round("10000.00" * 0.029) + 100 = 390
 *         total = "10000.00" + 390 = "10000.00390" ← BUG (concaténation string)
 * 
 * APRÈS : amount = Math.round(Number("10000.00")) = 10000 (entier)
 *         depositPaymentFee = Math.round(10000 * 0.029) + 100 = 390
 *         total = 10000 + 390 = 10390 ← CORRECT
 */
function calculateDepositFees(depositAmount, paymentMethod) {
  // ✅ FIX CRITIQUE : convertir en entier avant tout calcul
  const amount = Math.round(Number(depositAmount));
  let depositPaymentFee = 0;

  switch (paymentMethod) {
    case 'tmoney':
    case 'flooz':
    case 'Mixx By Yas':
      depositPaymentFee = Math.round(amount * 0.029) + 100;
      break;
    case 'card':
      depositPaymentFee = Math.round(amount * 0.035) + 150;
      break;
    case 'cod':
    case 'cash':
      depositPaymentFee = 0;
      break;
    default:
      depositPaymentFee = 0;
  }

  const totalDeposit = amount + depositPaymentFee; // ✅ toujours un entier

  return {
    deposit_amount:      amount,
    deposit_payment_fee: depositPaymentFee,
    total_deposit:       totalDeposit,
    breakdown: {
      depositAmount: `${amount.toLocaleString('fr-FR')} FCFA`,
      paymentFee:    depositPaymentFee > 0 ? `${depositPaymentFee.toLocaleString('fr-FR')} FCFA` : 'Aucun',
      totalDeposit:  `${totalDeposit.toLocaleString('fr-FR')} FCFA`
    }
  };
}

function calculateDepositAmount(totalAmount, percentage) {
  if (!totalAmount || !percentage) return 0;
  return Math.round((totalAmount * percentage) / 100);
}

function getPaymentMethodLabel(paymentMethod, amount) {
  if (paymentMethod === 'card') {
    const fee = Math.round((amount * 0.035) + 150);
    return `Carte bancaire (Frais: +${fee.toLocaleString('fr-FR')} FCFA)`;
  }
  if (paymentMethod === 'flooz') {
    const fee = Math.round((amount * 0.029) + 100);
    return `Flooz (Frais: +${fee.toLocaleString('fr-FR')} FCFA)`;
  }
  if (paymentMethod === 'Mixx By Yas') {
    const fee = Math.round((amount * 0.029) + 100);
    return `Mixx By Yas (Frais: +${fee.toLocaleString('fr-FR')} FCFA)`;
  }
  return paymentMethod;
}

function validateCalculationParams(params) {
  const errors = [];
  if (params.subtotal && (typeof params.subtotal !== 'number' || params.subtotal < 0)) {
    errors.push('Le sous-total doit être un nombre positif');
  }
  if (params.paymentType && !['online', 'cod'].includes(params.paymentType)) {
    errors.push('Type de paiement invalide (doit être "online" ou "cod")');
  }
  if (params.paymentMethod && !['flooz', 'Mixx By Yas', 'card', 'cash'].includes(params.paymentMethod)) {
    errors.push('Méthode de paiement invalide');
  }
  if (params.deliveryDistance && (typeof params.deliveryDistance !== 'number' || params.deliveryDistance < 0)) {
    errors.push('La distance de livraison doit être un nombre positif');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  calculateOrderFees,
  calculateDepositFees,
  calculateDeliveryFee,
  calculatePaymentFee,
  calculateDepositAmount,
  getPaymentMethodLabel,
  validateCalculationParams
};