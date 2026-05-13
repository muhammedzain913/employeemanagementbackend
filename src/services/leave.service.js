const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

const leaveSelect = {
  id: true,
  userId: true,
  startDate: true,
  endDate: true,
  reason: true,
  status: true,
  adminRemarks: true,
  createdAt: true,
  updatedAt: true,
};

const userPublicForLeave = {
  id: true,
  name: true,
  email: true,
  role: true,
};

function atUtcMidnight(d) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function atUtcEndOfDay(d) {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/** Inclusive calendar days between two instants (same UTC calendar day counts as 1). */
function inclusiveUtcCalendarDays(start, end) {
  const s = atUtcMidnight(start);
  const e = atUtcMidnight(end);
  const diff = e.getTime() - s.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

function parseDateToUtcBoundary(value, endOfDay) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error('startDate and endDate are required');
  }
  const d = new Date(String(value).trim());
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date parameter');
  }
  return endOfDay ? atUtcEndOfDay(d) : atUtcMidnight(d);
}

function resolveLeaveRange(body) {
  const start = parseDateToUtcBoundary(body.startDate, false);
  const end = parseDateToUtcBoundary(body.endDate, true);
  if (start > end) {
    throw new Error('endDate must be on or after startDate');
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    throw new Error('Leave range cannot exceed 366 days');
  }
  return { start, end };
}

function yearUtcBounds(year) {
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

function yearsSpanned(start, end) {
  const y0 = start.getUTCFullYear();
  const y1 = end.getUTCFullYear();
  const years = [];
  for (let y = y0; y <= y1; y += 1) {
    years.push(y);
  }
  return years;
}

/** Days of [leaveStart, leaveEnd] falling inside calendar year `year` (UTC). */
function leaveDaysInYear(leaveStart, leaveEnd, year) {
  const { start: ys, end: ye } = yearUtcBounds(year);
  const clipStart = new Date(Math.max(leaveStart.getTime(), ys.getTime()));
  const clipEnd = new Date(Math.min(leaveEnd.getTime(), ye.getTime()));
  if (clipStart > clipEnd) return 0;
  return inclusiveUtcCalendarDays(clipStart, clipEnd);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

async function getLeaveAllocationDays(userId) {
  const profile = await prisma.employeeProfile.findUnique({
    where: { userId },
    select: { leaveAllocationDays: true },
  });
  if (!profile) {
    return Number(process.env.DEFAULT_LEAVE_ALLOCATION_DAYS) || 20;
  }
  return profile.leaveAllocationDays;
}

async function listCommittedLeaves(userId, statuses) {
  return prisma.leave.findMany({
    where: { userId, status: { in: statuses } },
    select: { id: true, startDate: true, endDate: true, status: true },
  });
}

function sumCommittedDaysInYear(leaves, year, statuses, excludeLeaveId) {
  return leaves
    .filter(
      (l) =>
        statuses.includes(l.status) &&
        (excludeLeaveId === undefined || l.id !== excludeLeaveId),
    )
    .reduce((sum, l) => sum + leaveDaysInYear(l.startDate, l.endDate, year), 0);
}

async function assertNoOverlapAndWithinAllocation(userId, start, end, excludeLeaveId) {
  const leaves = await listCommittedLeaves(userId, ['PENDING', 'APPROVED']);

  for (const l of leaves) {
    if (excludeLeaveId !== undefined && l.id === excludeLeaveId) continue;
    if (rangesOverlap(start, end, l.startDate, l.endDate)) {
      throw new Error('Leave dates overlap an existing pending or approved request');
    }
  }

  const allocation = await getLeaveAllocationDays(userId);
  const years = yearsSpanned(start, end);

  for (const year of years) {
    const newDays = leaveDaysInYear(start, end, year);
    if (newDays === 0) continue;
    const used = sumCommittedDaysInYear(leaves, year, ['PENDING', 'APPROVED'], excludeLeaveId);
    if (used + newDays > allocation) {
      throw new Error(
        `Leave exceeds allocation for ${year}: ${used + newDays} days requested vs ${allocation} allowed`,
      );
    }
  }
}

function parseApplyLeaveInput(body) {
  const { start, end } = resolveLeaveRange(body);
  const reason = body.reason != null ? String(body.reason).trim() : '';
  if (!reason) {
    throw new Error('reason is required');
  }
  return { start, end, reason };
}

function assertApplyLeaveBody(body) {
  parseApplyLeaveInput(body);
}

async function applyLeave(userId, body) {
  const { start, end, reason } = parseApplyLeaveInput(body);
  await assertNoOverlapAndWithinAllocation(userId, start, end);

  const leave = await prisma.leave.create({
    data: {
      userId,
      startDate: start,
      endDate: end,
      reason,
      status: 'PENDING',
    },
    select: leaveSelect,
  });

  return leave;
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function parseOptionalLeaveStatus(query) {
  const raw = query.status;
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim().toUpperCase();
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(s)) {
    throw new Error('Invalid leave status filter');
  }
  return s;
}

function parseOptionalUserIdFilter(query) {
  const raw = query.userId;
  if (raw === undefined || raw === null || raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('userId filter must be a positive integer');
  }
  return id;
}

function parseDateRangeForLeaveFilter(query) {
  const fromRaw = query.from;
  const toRaw = query.to;
  if (
    (fromRaw === undefined || fromRaw === null || String(fromRaw).trim() === '') &&
    (toRaw === undefined || toRaw === null || String(toRaw).trim() === '')
  ) {
    return null;
  }
  const from =
    fromRaw !== undefined && fromRaw !== null && String(fromRaw).trim() !== ''
      ? parseDateToUtcBoundary(fromRaw, false)
      : null;
  const to =
    toRaw !== undefined && toRaw !== null && String(toRaw).trim() !== ''
      ? parseDateToUtcBoundary(toRaw, true)
      : null;
  if (from && to && from > to) {
    throw new Error('from must be on or before to');
  }
  return { from, to };
}

/** Default: UTC year-to-date. Partial query mirrors attendance-style fill. */
function resolveReportDateRange(query) {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  const todayEnd = atUtcEndOfDay(now);

  const fromRaw = query.from;
  const toRaw = query.to;
  const hasFrom =
    fromRaw !== undefined && fromRaw !== null && String(fromRaw).trim() !== '';
  const hasTo = toRaw !== undefined && toRaw !== null && String(toRaw).trim() !== '';

  let start;
  let end;

  if (!hasFrom && !hasTo) {
    start = yearStart;
    end = todayEnd;
  } else if (hasFrom && !hasTo) {
    start = parseDateToUtcBoundary(fromRaw, false);
    end = todayEnd;
  } else if (!hasFrom && hasTo) {
    end = parseDateToUtcBoundary(toRaw, true);
    start = new Date(
      Date.UTC(
        end.getUTCFullYear(),
        end.getUTCMonth(),
        end.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    start.setUTCDate(start.getUTCDate() - 29);
  } else {
    start = parseDateToUtcBoundary(fromRaw, false);
    end = parseDateToUtcBoundary(toRaw, true);
  }

  if (start > end) {
    throw new Error('from must be on or before to');
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    throw new Error('Date range cannot exceed 366 days');
  }

  return { start, end };
}

async function getLeaveHistory(userId, query) {
  const { page, limit, skip } = parsePagination(query);
  const status = parseOptionalLeaveStatus(query);
  const range = parseDateRangeForLeaveFilter(query);

  const where = {
    userId,
    ...(status ? { status } : {}),
    ...(range?.from || range?.to
      ? {
          AND: [
            ...(range.from ? [{ endDate: { gte: range.from } }] : []),
            ...(range.to ? [{ startDate: { lte: range.to } }] : []),
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.leave.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: leaveSelect,
    }),
    prisma.leave.count({ where }),
  ]);

  return {
    items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  };
}

async function getLeaveBalance(userId, query) {
  const yearRaw = query.year;
  const year =
    yearRaw !== undefined && yearRaw !== null && String(yearRaw).trim() !== ''
      ? Number(yearRaw)
      : new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new Error('year must be a valid integer');
  }

  const allocation = await getLeaveAllocationDays(userId);
  const leaves = await listCommittedLeaves(userId, ['PENDING', 'APPROVED']);

  const approvedDays = sumCommittedDaysInYear(leaves, year, ['APPROVED']);
  const pendingDays = sumCommittedDaysInYear(leaves, year, ['PENDING']);
  const remaining = Math.max(0, allocation - approvedDays);

  return {
    year,
    allocationDays: allocation,
    approvedDaysInYear: approvedDays,
    pendingDaysInYear: pendingDays,
    remainingApprovedDays: remaining,
  };
}

async function getLeaveByIdForUser(leaveId, userId) {
  const id = Number(leaveId);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('Invalid leave id');
  }

  const leave = await prisma.leave.findFirst({
    where: { id, userId },
    select: leaveSelect,
  });
  if (!leave) {
    throw new Error('Leave request not found');
  }
  return leave;
}

async function getLeaveByIdAdmin(leaveId) {
  const id = Number(leaveId);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('Invalid leave id');
  }

  const leave = await prisma.leave.findUnique({
    where: { id },
    select: {
      ...leaveSelect,
      user: { select: userPublicForLeave },
    },
  });
  if (!leave) {
    throw new Error('Leave request not found');
  }
  return leave;
}

async function listLeaveRequests(query) {
  const { page, limit, skip } = parsePagination(query);
  const status = parseOptionalLeaveStatus(query);
  const userId = parseOptionalUserIdFilter(query);
  const range = parseDateRangeForLeaveFilter(query);

  const where = {
    ...(status ? { status } : {}),
    ...(userId ? { userId } : {}),
    ...(range?.from || range?.to
      ? {
          AND: [
            ...(range.from ? [{ endDate: { gte: range.from } }] : []),
            ...(range.to ? [{ startDate: { lte: range.to } }] : []),
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.leave.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        ...leaveSelect,
        user: { select: userPublicForLeave },
      },
    }),
    prisma.leave.count({ where }),
  ]);

  return {
    items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  };
}

async function approveLeave(leaveId, body = {}) {
  const id = Number(leaveId);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('Invalid leave id');
  }

  const remarks =
    body.adminRemarks !== undefined && body.adminRemarks !== null
      ? String(body.adminRemarks).trim() || null
      : null;

  return prisma.$transaction(async (tx) => {
    const row = await tx.leave.findUnique({ where: { id } });
    if (!row) {
      throw new Error('Leave request not found');
    }
    if (row.status !== 'PENDING') {
      throw new Error('Only pending leave requests can be approved');
    }

    const leaves = await tx.leave.findMany({
      where: {
        userId: row.userId,
        status: 'APPROVED',
        id: { not: id },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    });

    for (const l of leaves) {
      if (rangesOverlap(row.startDate, row.endDate, l.startDate, l.endDate)) {
        throw new Error('Leave dates overlap another approved request');
      }
    }

    const profile = await tx.employeeProfile.findUnique({
      where: { userId: row.userId },
      select: { leaveAllocationDays: true },
    });
    const allocation =
      profile != null
        ? profile.leaveAllocationDays
        : Number(process.env.DEFAULT_LEAVE_ALLOCATION_DAYS) || 20;
    const years = yearsSpanned(row.startDate, row.endDate);
    const allCommitted = await tx.leave.findMany({
      where: {
        userId: row.userId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    });

    for (const year of years) {
      const newDays = leaveDaysInYear(row.startDate, row.endDate, year);
      if (newDays === 0) continue;
      const used = sumCommittedDaysInYear(
        allCommitted,
        year,
        ['PENDING', 'APPROVED'],
        id,
      );
      if (used + newDays > allocation) {
        throw new Error(
          `Approval would exceed allocation for ${year}: ${used + newDays} vs ${allocation}`,
        );
      }
    }

    return tx.leave.update({
      where: { id },
      data: {
        status: 'APPROVED',
        adminRemarks: remarks,
      },
      select: {
        ...leaveSelect,
        user: { select: userPublicForLeave },
      },
    });
  });
}

async function rejectLeave(leaveId, body = {}) {
  const id = Number(leaveId);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('Invalid leave id');
  }

  const remarks =
    body.adminRemarks !== undefined && body.adminRemarks !== null
      ? String(body.adminRemarks).trim() || null
      : null;

  const row = await prisma.leave.findUnique({ where: { id } });
  if (!row) {
    throw new Error('Leave request not found');
  }
  if (row.status !== 'PENDING') {
    throw new Error('Only pending leave requests can be rejected');
  }

  return prisma.leave.update({
    where: { id },
    data: {
      status: 'REJECTED',
      adminRemarks: remarks,
    },
    select: {
      ...leaveSelect,
      user: { select: userPublicForLeave },
    },
  });
}

async function getLeaveReports(query) {
  const { start, end } = resolveReportDateRange(query);
  const department =
    query.department !== undefined &&
    query.department !== null &&
    String(query.department).trim() !== ''
      ? String(query.department).trim()
      : null;

  const whereLeave = {
    AND: [{ endDate: { gte: start } }, { startDate: { lte: end } }],
    ...(department
      ? {
          user: {
            employeeProfile: {
              department: { equals: department, mode: 'insensitive' },
            },
          },
        }
      : {}),
  };

  const byMonth = department
    ? await prisma.$queryRaw(
        Prisma.sql`
        SELECT to_char(date_trunc('month', "startDate" AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
               COUNT(*)::int AS count
        FROM "Leave"
        WHERE "endDate" >= ${start}
          AND "startDate" <= ${end}
          AND EXISTS (
            SELECT 1 FROM "User" u
            INNER JOIN "EmployeeProfile" ep ON ep."userId" = u.id
            WHERE u.id = "Leave"."userId"
              AND LOWER(ep.department) = LOWER(${department})
          )
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      )
    : await prisma.$queryRaw(
        Prisma.sql`
        SELECT to_char(date_trunc('month', "startDate" AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
               COUNT(*)::int AS count
        FROM "Leave"
        WHERE "endDate" >= ${start}
          AND "startDate" <= ${end}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      );

  const [byStatus, total] = await prisma.$transaction([
    prisma.leave.groupBy({
      by: ['status'],
      where: whereLeave,
      _count: { id: true },
    }),
    prisma.leave.count({ where: whereLeave }),
  ]);

  return {
    dateRange: { from: start.toISOString(), to: end.toISOString() },
    department: department || null,
    total,
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count.id })),
    byMonth: byMonth.map((row) => ({
      month: row.month,
      count: row.count,
    })),
  };
}

async function getLeaveBalanceMonitoring(query) {
  const { page, limit, skip } = parsePagination(query);
  const yearRaw = query.year;
  const year =
    yearRaw !== undefined && yearRaw !== null && String(yearRaw).trim() !== ''
      ? Number(yearRaw)
      : new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new Error('year must be a valid integer');
  }

  const department =
    query.department !== undefined &&
    query.department !== null &&
    String(query.department).trim() !== ''
      ? String(query.department).trim()
      : null;

  const profileWhere = department
    ? { department: { equals: department, mode: 'insensitive' } }
    : {};

  const [profiles, total] = await prisma.$transaction([
    prisma.employeeProfile.findMany({
      where: profileWhere,
      skip,
      take: limit,
      orderBy: { id: 'asc' },
      select: {
        userId: true,
        department: true,
        leaveAllocationDays: true,
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    }),
    prisma.employeeProfile.count({ where: profileWhere }),
  ]);

  const userIds = profiles.map((p) => p.userId);
  const leaves =
    userIds.length === 0
      ? []
      : await prisma.leave.findMany({
          where: {
            userId: { in: userIds },
            status: { in: ['PENDING', 'APPROVED'] },
          },
          select: { userId: true, startDate: true, endDate: true, status: true },
        });

  const byUser = new Map();
  for (const uid of userIds) {
    byUser.set(uid, []);
  }
  for (const l of leaves) {
    byUser.get(l.userId).push(l);
  }

  const items = profiles.map((p) => {
    const list = byUser.get(p.userId) || [];
    const approvedDays = sumCommittedDaysInYear(list, year, ['APPROVED']);
    const pendingDays = sumCommittedDaysInYear(list, year, ['PENDING']);
    const allocation = p.leaveAllocationDays;
    return {
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      role: p.user.role,
      department: p.department,
      year,
      allocationDays: allocation,
      approvedDaysInYear: approvedDays,
      pendingDaysInYear: pendingDays,
      remainingApprovedDays: Math.max(0, allocation - approvedDays),
    };
  });

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
      year,
    },
  };
}

module.exports = {
  assertApplyLeaveBody,
  applyLeave,
  getLeaveHistory,
  getLeaveBalance,
  getLeaveByIdForUser,
  getLeaveByIdAdmin,
  listLeaveRequests,
  approveLeave,
  rejectLeave,
  getLeaveReports,
  getLeaveBalanceMonitoring,
};
