const { randomUUID } = require('crypto');

module.exports = function requestContext () {
  return (req, res, next) => {
    const requestId = randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  };
};

