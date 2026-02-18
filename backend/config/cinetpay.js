const axios = require('axios');
require('dotenv').config();

const cinetpayConfig = {
  apiKey: process.env.CINETPAY_API_KEY,
  siteId: process.env.CINETPAY_SITE_ID,
  secretKey: process.env.CINETPAY_SECRET_KEY,
  apiUrl: process.env.CINETPAY_API_URL,
  notifyUrl: process.env.CINETPAY_NOTIFY_URL,
  returnUrl: process.env.CINETPAY_RETURN_URL,
  cancelUrl: process.env.CINETPAY_CANCEL_URL,
};

// Client axios configuré pour CinetPay
const cinetpayClient = axios.create({
  baseURL: cinetpayConfig.apiUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur pour logs
cinetpayClient.interceptors.request.use(
  (config) => {
    console.log(`🔄 Requête CinetPay: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Erreur requête CinetPay:', error);
    return Promise.reject(error);
  }
);

cinetpayClient.interceptors.response.use(
  (response) => {
    console.log(`✅ Réponse CinetPay: ${response.status} - ${response.data?.message || 'Success'}`);
    return response;
  },
  (error) => {
    console.error('❌ Erreur réponse CinetPay:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

module.exports = {
  cinetpayConfig,
  cinetpayClient,
};