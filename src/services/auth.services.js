const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const loginUser = async (email, password) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new Error('Invalid credentials');
  }
  return user;
};

const login = async ({ email, password }) => {
  if (!email || !password) {
    throw new Error('email and password are required');
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const user = await loginUser(email, password);

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      role: user.role?.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
};

const registerUser = async (userData) => {
  const { email, password, name, roleId } = userData;

  if (!email || !password || !name || roleId === undefined || roleId === null) {
    throw new Error('email, password, name, and roleId are required');
  }

  const parsedRoleId = Number(roleId);
  if (!Number.isInteger(parsedRoleId) || parsedRoleId < 1) {
    throw new Error('roleId must be a positive integer');
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new Error('User already exists');

  const role = await prisma.role.findUnique({ where: { id: parsedRoleId } });
  if (!role) throw new Error('Invalid roleId');

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  return prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      roleId: parsedRoleId,
    },
    include: { role: true },
  });
};

module.exports = {
  registerUser,
  loginUser,
  login,
};
