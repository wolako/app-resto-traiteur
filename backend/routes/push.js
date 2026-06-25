const express = require('express');
const router  = express.Router();
const pushController = require('../controllers/pushController');
const { authenticateToken } = require('../middleware/auth');

router.get('/vapid-public-key', pushController.getVapidPublicKey);
router.post('/subscribe',       authenticateToken, pushController.subscribe);
router.delete('/unsubscribe',   authenticateToken, pushController.unsubscribe);

module.exports = router;