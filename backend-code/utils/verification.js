const DEFAULT_EXPIRE_MS = 5 * 60 * 1000;

function ensureStore () {
  if (!global.__verificationStore) {
    global.__verificationStore = {};
  }
  return global.__verificationStore;
}

function setCode (key, code, expireMs = DEFAULT_EXPIRE_MS) {
  const store = ensureStore();
  store[key] = {
    code,
    expiresAt: Date.now() + expireMs
  };
}

function getCode (key) {
  const store = ensureStore();
  return store[key];
}

function clearCode (key) {
  const store = ensureStore();
  delete store[key];
}

function isValid (record, code, universalCode) {
  if (!record && code !== universalCode) {
    return false;
  }

  if (code === universalCode) {
    return true;
  }

  if (!record || record.code !== code) {
    return false;
  }

  if (Date.now() > record.expiresAt) {
    return false;
  }

  return true;
}

module.exports = {
  setCode,
  getCode,
  clearCode,
  isValid
};

