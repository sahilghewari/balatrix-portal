const crypto = require('crypto');

function isSecretStrong(secret) {
  return Boolean(secret && secret.length >= 32);
}

function ensureSecretStrong(secret) {
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters for security.');
  }
}

function generateRandomSecret(length = 48) {
  return crypto.randomBytes(length).toString('hex');
}

module.exports = {
  isSecretStrong,
  ensureSecretStrong,
  generateRandomSecret,
};
