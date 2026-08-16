function success (res, data = null, meta = {}) {
  res.json({
    success: true,
    data,
    meta
  });
}

function paginated (res, list, pagination) {
  res.json({
    success: true,
    data: list,
    pagination
  });
}

function failure (res, statusCode, message, code = 'ERROR', details) {
  const payload = {
    success: false,
    error: message,
    code
  };

  if (details) {
    payload.details = details;
  }

  res.status(statusCode).json(payload);
}

module.exports = {
  success,
  paginated,
  failure
};

