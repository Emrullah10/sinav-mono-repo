import bcrypt from 'bcrypt';

const encodeBcrypt = async (req, res, next) => {
  try {
    const { userPassword } = req.body;
    if (userPassword) {
      const salt = await bcrypt.genSalt(10);
      req.body.userPassword = await bcrypt.hash(userPassword, salt);
    }
  } catch (error) {
    return res.status(500).send('');
  }
  return next();
};

const checkUrl = () => (req, res, next) => {
  if (req.originalUrl.endsWith('/signup')) {
    return encodeBcrypt(req, res, next);
  }
  return next();
};

export default checkUrl;
