const jwt = require('jsonwebtoken');

// When REQUIRE_AUTH=true every request needs a valid Bearer JWT.
// Disabled by default so the API works out of the box.
module.exports = (req, res, next) => {
  if (process.env.REQUIRE_AUTH !== 'true') return next();

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  try {
    req.user = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
