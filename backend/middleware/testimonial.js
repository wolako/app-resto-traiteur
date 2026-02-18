// backend/middlewares/testimonial.validation.js

const { body, validationResult } = require('express-validator');

// Middleware pour gérer les erreurs de validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// Validation pour créer un témoignage
const validateCreateTestimonial = [
  body('rating')
    .notEmpty().withMessage('La note est requise')
    .isInt({ min: 1, max: 5 }).withMessage('La note doit être entre 1 et 5'),
  
  body('comment')
    .notEmpty().withMessage('Le commentaire est requis')
    .isString().withMessage('Le commentaire doit être une chaîne de caractères')
    .isLength({ min: 50, max: 500 }).withMessage('Le commentaire doit contenir entre 50 et 500 caractères')
    .trim(),
  
  body('displayName')
    .optional()
    .isString().withMessage('Le nom affiché doit être une chaîne de caractères')
    .isLength({ min: 2, max: 255 }).withMessage('Le nom affiché doit contenir entre 2 et 255 caractères')
    .trim(),
  
  body('allowPhoto')
    .optional()
    .isBoolean().withMessage('allowPhoto doit être un booléen'),
  
  handleValidationErrors
];

// Validation pour mettre à jour un témoignage
const validateUpdateTestimonial = [
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 }).withMessage('La note doit être entre 1 et 5'),
  
  body('comment')
    .optional()
    .isString().withMessage('Le commentaire doit être une chaîne de caractères')
    .isLength({ min: 50, max: 500 }).withMessage('Le commentaire doit contenir entre 50 et 500 caractères')
    .trim(),
  
  body('displayName')
    .optional()
    .isString().withMessage('Le nom affiché doit être une chaîne de caractères')
    .isLength({ min: 2, max: 255 }).withMessage('Le nom affiché doit contenir entre 2 et 255 caractères')
    .trim(),
  
  body('allowPhoto')
    .optional()
    .isBoolean().withMessage('allowPhoto doit être un booléen'),
  
  handleValidationErrors
];

// Validation pour approuver un témoignage
const validateApproveTestimonial = [
  body('featured')
    .optional()
    .isBoolean().withMessage('featured doit être un booléen'),
  
  handleValidationErrors
];

// Validation pour rejeter un témoignage
const validateRejectTestimonial = [
  body('reason')
    .optional()
    .isString().withMessage('La raison doit être une chaîne de caractères')
    .isLength({ max: 500 }).withMessage('La raison ne doit pas dépasser 500 caractères')
    .trim(),
  
  handleValidationErrors
];

module.exports = {
  validateCreateTestimonial,
  validateUpdateTestimonial,
  validateApproveTestimonial,
  validateRejectTestimonial
};