const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');

const USER_PUBLIC = {
  id: true,
  email: true,
  name: true,
  roleId: true,
  createdAt: true,
  role: true,
};

const employeeInclude = {
  user: { select: USER_PUBLIC },
};

const EMPLOYEE_STATUSES = new Set(['ACTIVE', 'ON_LEAVE', 'TERMINATED']);

function parseHireDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid hireDate');
  return d;
}

async function assertUniqueEmail(email, excludeUserId) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== excludeUserId) {
    throw new Error('Email already in use');
  }
}

async function assertUniqueEmployeeCode(code, excludeProfileId) {
  const existing = await prisma.employeeProfile.findUnique({
    where: { employeeCode: code },
  });
  if (existing && existing.id !== excludeProfileId) {
    throw new Error('Employee code already in use');
  }
}

async function createEmployee(payload) {
  const {
    email,
    password,
    name,
    roleId,
    employeeCode,
    phone,
    department,
    jobTitle,
    hireDate,
  } = payload;

  if (!email || !password || !name || roleId === undefined || roleId === null) {
    throw new Error('email, password, name, and roleId are required');
  }
  if (!employeeCode) {
    throw new Error('employeeCode is required');
  }

  const parsedRoleId = Number(roleId);
  if (!Number.isInteger(parsedRoleId) || parsedRoleId < 1) {
    throw new Error('roleId must be a positive integer');
  }

  const role = await prisma.role.findUnique({ where: { id: parsedRoleId } });
  if (!role) throw new Error('Invalid roleId');

  await assertUniqueEmail(email);
  await assertUniqueEmployeeCode(employeeCode, null);

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const hire = parseHireDate(hireDate);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      roleId: parsedRoleId,
      employeeProfile: {
        create: {
          employeeCode: String(employeeCode).trim(),
          phone: phone || null,
          department: department || null,
          jobTitle: jobTitle || null,
          hireDate: hire,
        },
      },
    },
    include: { employeeProfile: true },
  });

  return prisma.employeeProfile.findUnique({
    where: { userId: user.id },
    include: employeeInclude,
  });
}

async function getEmployeeByUserId(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) throw new Error('Invalid user id');

  const profile = await prisma.employeeProfile.findUnique({
    where: { userId: id },
    include: employeeInclude,
  });
  if (!profile) throw new Error('Employee not found');
  return profile;
}

async function updateEmployee(userId, payload) {
  const profile = await getEmployeeByUserId(userId);

  const {
    name,
    email,
    employeeCode,
    phone,
    department,
    jobTitle,
    hireDate,
    status,
  } = payload;

  if (status !== undefined && status !== null && status !== '') {
    if (!EMPLOYEE_STATUSES.has(status)) {
      throw new Error('Invalid employee status');
    }
  }

  if (email !== undefined && email !== null && email !== '') {
    await assertUniqueEmail(email, profile.userId);
  }

  if (employeeCode !== undefined && employeeCode !== null && employeeCode !== '') {
    await assertUniqueEmployeeCode(String(employeeCode).trim(), profile.id);
  }

  const hire =
    hireDate !== undefined ? parseHireDate(hireDate) : undefined;

  await prisma.$transaction(async (tx) => {
    const userData = {};
    if (name !== undefined) userData.name = name;
    if (email !== undefined && email !== '') userData.email = email;

    if (Object.keys(userData).length) {
      await tx.user.update({
        where: { id: profile.userId },
        data: userData,
      });
    }

    const profileData = {};
    if (employeeCode !== undefined && employeeCode !== '') {
      profileData.employeeCode = String(employeeCode).trim();
    }
    if (phone !== undefined) profileData.phone = phone || null;
    if (department !== undefined) profileData.department = department || null;
    if (jobTitle !== undefined) profileData.jobTitle = jobTitle || null;
    if (hireDate !== undefined) profileData.hireDate = hire;
    if (status !== undefined && status !== null && status !== '') {
      profileData.status = status;
    }

    if (Object.keys(profileData).length) {
      await tx.employeeProfile.update({
        where: { id: profile.id },
        data: profileData,
      });
    }
  });

  return prisma.employeeProfile.findUnique({
    where: { id: profile.id },
    include: employeeInclude,
  });
}

async function listEmployees(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const search = query.search ? String(query.search).trim() : '';
  const department = query.department ? String(query.department).trim() : '';
  const roleIdRaw = query.roleId;
  const statusRaw = query.status ? String(query.status).trim() : '';

  const and = [];

  if (search) {
    and.push({
      OR: [
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  if (department) {
    and.push({
      department: { equals: department, mode: 'insensitive' },
    });
  }

  if (roleIdRaw !== undefined && roleIdRaw !== null && roleIdRaw !== '') {
    const rid = Number(roleIdRaw);
    if (!Number.isInteger(rid) || rid < 1) {
      throw new Error('roleId filter must be a positive integer');
    }
    and.push({ user: { roleId: rid } });
  }

  if (statusRaw) {
    if (!EMPLOYEE_STATUSES.has(statusRaw)) {
      throw new Error('Invalid employee status');
    }
    and.push({ status: statusRaw });
  }

  const where = and.length ? { AND: and } : {};

  const [items, total] = await prisma.$transaction([
    prisma.employeeProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ id: 'desc' }],
      include: employeeInclude,
    }),
    prisma.employeeProfile.count({ where }),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    },
  };
}

module.exports = {
  createEmployee,
  getEmployeeByUserId,
  updateEmployee,
  listEmployees,
};
