const path = require('path');
const dotenv = require('dotenv');

// Always resolve the private configuration from backend-code/.env instead of
// depending on the shell's current working directory. Existing system/cloud
// environment variables keep priority because dotenv does not override them.
const envPath = path.resolve(__dirname, '..', '.env');
const result = dotenv.config({ path: envPath });

module.exports = {
  envPath,
  loaded: !result.error,
  parsedKeys: Object.keys(result.parsed || {})
};
