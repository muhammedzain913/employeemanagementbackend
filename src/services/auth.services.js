const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');

const loginUser = async (email, password) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { roles: true } // Fetching those complex roles we built!
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new Error('Invalid credentials');
  }
  return user;
};