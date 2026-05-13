const authService = require('../services/auth.services');

const register = async (req, res, next) => {
  try {
    const newUser = await authService.registerUser(req.body);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  console.log('reached login endpoint',req.body)
  try {
    const result = await authService.login(req.body);
    console.log('result in login endpoint',result)
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    console.log('error in login endpoint',error)
    next(error);
  }
};

module.exports = { register, login };
