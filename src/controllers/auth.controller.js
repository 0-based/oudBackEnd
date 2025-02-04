const { userService, authService, emailService } = require('../services');
const AppError = require('../utils/AppError');
const httpStatus = require('http-status');
const logger = require('../config/logger');

/**
 * 
 * @param {User} user 
 * @param {Response} res 
 * @author Abdelrahman Tarek
 */
const createTokenAndSend = (user, res) => {
  user.password = undefined;
  user.passwordConfirm = undefined;
  user.__v = undefined;
  const token = authService.generateAuthToken(user._id);
  res.setHeader('x-auth-token', token);
  return res.status(httpStatus.OK).json({
    token: token,
    user: user
  });
};

/**
 * Verify user account
 * 
 * @version 1.0.0
 * @throws AppError 400 status
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @description takes user verify token and change verify to true if token is valid else return 400 status
 * @summary User Verify
 */
exports.verify = async (req, res, next) => {
  const hashedToken = authService.getHashedToken(req.params.token);

  const user = await userService.getUser({
    verifyToken: hashedToken
  });
  if (!user) return next(new AppError('Token is invalid', httpStatus.BAD_REQUEST));

  user.verified = true;
  user.verifyToken = undefined;

  await user.save({ validateBeforeSave: false });
  createTokenAndSend(user, res);
}

/**
 * Request verify email
 * 
 * @version 1.0.0
 * @throws AppError 500 status, AppError 400 status
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @summary User Request Verify
 */
exports.requestVerify = async (req, res, next) => {
  if (!req.user) {
    return next(new AppError('PLease Authentcate first', httpStatus.INTERNAL_SERVER_ERROR));
  }
  const user = req.user;

  if (user.verified) {
    return next(new AppError('User is Already verified!', httpStatus.BAD_REQUEST));
  }

  const verifyToken = authService.createVerifyToken(user);
  await user.save({ validateBeforeSave: false });

  const verifyURL = `${req.get(
    'host'
  )}/verify/${verifyToken}`;

  const message = `Hello ${user.username}<br>
  CONFIRM ACCOUNT You are almost done<br>Confirm your account below to finish creating your Oud account`;

  emailService.sendEmail({
    email: user.email,
    subject: 'Verify your Oud account',
    message,
    button: 'CONFIRM ACCOUNT',
    link: verifyURL
  }).then().catch(error => {
    const { message, code, response } = error;
    logger.error(`${code} : ${message}: ${response.body.errors[0].message}`);
  });

  user.verifyToken = undefined;
  createTokenAndSend(user, res);
};

/**
 * Signup
 * 
 * @version 1.0.0
 * @throws AppError 400 status
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @description takes user details from the user and return user and token with 200 status code
 *  if valid else return error with 400 status code
 * @summary User Registration
 */
exports.signup = async (req, res, next) => {
  if (req.body.password !== req.body.passwordConfirm) {
    return next(new AppError('Please confirm your password', httpStatus.BAD_REQUEST));
  }

  if (req.body.role === 'artist') {
    return next(new AppError(`You can't create artist account without request`, httpStatus.UNAUTHORIZED));
  }

  if (req.body.role === 'premium') {
    return next(new AppError(`You can't create premium account without credit`, httpStatus.UNAUTHORIZED));
  }

  const newUser = await userService.createUser(req.body);

  // generate verify token
  const verifyToken = authService.createVerifyToken(newUser);

  // save user
  await newUser.save({
    validateBeforeSave: false
  });

  // use mail to verify user
  const verifyURL = `${req.get(
    'host'
  )}/verify/${verifyToken}`;

  const message = `Hello ${newUser.username}<br>
  CONFIRM ACCOUNT You are almost done<br>Confirm your account below to finish creating your Oud account`;

  emailService.sendEmail({
    email: newUser.email,
    subject: 'Verify your Oud account',
    message,
    button: 'CONFIRM ACCOUNT',
    link: verifyURL
  }).then().catch(error => {
    const { message, code, response } = error;
    logger.error(`${code} : ${message}: ${response.body.errors[0].message}`);
  });

  newUser.verifyToken = undefined;
  createTokenAndSend(newUser, res);
};

/**
 * Login
 * 
 * @version 1.0.0
 * @throws AppError 400 status
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @description takes user email and password from the user and return user and token with 200 status code
 *  if valid else return error with 400 status code
 * @summary User Login
 */
exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  const user = await userService.findUserAndCheckPassword(
    { email: email },
    password
  );
  if (!user) {
    return next(new AppError('Incorrect email or password!', httpStatus.UNAUTHORIZED));
  }
  user.lastLogin = new Date();

  await user.save();

  createTokenAndSend(user, res);
};

/**
 * Update password
 * 
 * @version 1.0.0
 * @throws AppError 400 status, AppError 401 status
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @description takes currentPassword, Password and passwordConfirm. if currentPassword is wrong return 401 status
 * if password != passwordConfirm return 400
 * @summary User Update Password
 */
exports.updatePassword = async (req, res, next) => {
  const { currentPassword, password, passwordConfirm } = req.body;

  if (!req.user) {
    return next(new AppError('PLease Authentcate first', httpStatus.INTERNAL_SERVER_ERROR));
  }
  // get user with a password
  if (password !== passwordConfirm) {
    return next(new AppError('Please confirm your password', httpStatus.BAD_REQUEST));
  }

  const user = await userService.findUserByIdAndCheckPassword(
    req.user._id,
    currentPassword
  );
  if (!user) {
    return next(new AppError('Incorrect password!', httpStatus.UNAUTHORIZED));
  }

  user.password = password;
  user.passwordConfirm = password;
  await user.save();
  createTokenAndSend(user, res);
};

/**
 * Forgot password
 * 
 * @version 1.0.0
 * @throws AppError 404 status, AppError 401 status, AppError 500 status 
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @description takes user email then generate reset token and send it via email to reset your password
 * @summary User forgot password
 */
exports.forgotPassword = async (req, res, next) => {
  const user = await userService.getUser({ email: req.body.email });
  if (!user) {
    return next(new AppError('No user with the given email!', httpStatus.NOT_FOUND));
  }
  // TODOS
  // generate reset token and save user
  const resetToken = authService.createPasswordResetToken(user);
  await user.save({
    validateBeforeSave: false
  });
  // send reset token via email
  const resetURL = `${req.get(
    'host'
  )}/resetPassword/${resetToken}`;

  const message = `Forgot your password?<br>Reset your password below`;

  emailService.sendEmail({
    email: user.email,
    subject: 'Reset your password',
    message,
    button: 'RESET PASSWORD',
    link: resetURL
  }).then().catch(error => {
    const { message, code, response } = error;
    logger.error(`${code} : ${message}: ${response.body.errors[0].message}`);
  });

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Token sent to email!'
  });
};


/**
 * Reset password
 * 
 * @version 1.0.0
 * @throws AppError 400 status 
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @summary User reset password
 */
exports.resetPassword = async (req, res, next) => {
  // get user based on token
  const hashedToken = authService.getHashedToken(req.params.token);

  const user = await userService.getUser({
    passwordResetToken: hashedToken,
    passwordResetExpires: {
      $gt: Date.now()
    }
  });
  // if token has not expired, and there is user, set the new password
  if (!user) return next(new AppError('Token is invalid or has expired', httpStatus.BAD_REQUEST));

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  createTokenAndSend(user, res)
};


/**
 * Facebook Authentication
 * 
 * @throws AppError 400 status
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @summary if token is invalid return 400, if user`s account already connected to facebook send user 
 * and token with 200 status else send user information with 200 status
 */
exports.facebookAuth = async (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Invalid Token', httpStatus.BAD_REQUEST));
  }
  if (req.user._id) {
    createTokenAndSend(req.user, res);
  } else {
    res.status(httpStatus.OK).json({
      user: req.user
    });
  }
};

/**
 * Facebook connect
 * 
 * @throws AppError 500 status
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @summary if not authentivated return 500, if user sent access_token call next to connect to facebook
 * else disconnect from facebook and send user and token
 */
exports.facebookConnect = async (req, res, next) => {
  if (req.body.access_token) {
    // connect case
    return next(); // send to passport facebookOAuth
  } else {
    // disconnect case
    if (!req.user) {
      return next(new AppError('Must Authenticate user', httpStatus.INTERNAL_SERVER_ERROR));
    }
    // set facebook account to null
    req.user.facebook_id = undefined;
    createTokenAndSend(req.user, res);
  }
};

/**
 * Google Authentication
 * 
 * @throws AppError 400 status
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @summary if token is invalid return 400, if user`s account already connected to google send user 
 * and token with 200 status else send user information with 200 status
 */
exports.googleAuth = async (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Invalid Token', httpStatus.BAD_REQUEST));
  }
  if (req.user._id) {
    createTokenAndSend(req.user, res);
  } else {
    res.status(httpStatus.OK).json({
      user: req.user
    });
  }
};

/**
 * Google connect
 * 
 * @throws AppError 500 status
 * @author Abdelrahman Tarek
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @summary if not authentivated return 500, if user sent access_token call next to connect to google
 * else disconnect from google and send user and token
 */
exports.googleConnect = async (req, res, next) => {
  if (req.body.access_token) {
    // connect case
    return next(); // send to passport googleOAuth
  } else {
    // disconnect case
    if (!req.user) {
      return next(new AppError('Must Authenticate user', httpStatus.INTERNAL_SERVER_ERROR));
    }
    // set google account to null
    req.user.google_id = undefined;
    createTokenAndSend(req.user, res);
  }
};