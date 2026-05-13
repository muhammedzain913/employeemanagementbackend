const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

/** Calendar day bounds in UTC (same instant semantics as stored `checkIn`). */
function getUtcDayRange(referenceDate = new Date()) {
  const start = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function parseDateBoundary(value, endOfDay) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const d = new Date(String(value).trim());
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date parameter');
  }
  if (endOfDay) {
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
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

/**
 * Resolves [start, end] for filtering `checkIn` (inclusive).
 * Defaults to last 30 UTC calendar days through end of today UTC if `from`/`to` omitted.
 */
function resolveDateRange(query) {
  const now = new Date();
  const todayEnd = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  const defaultStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 29);

  let start = parseDateBoundary(query.from, false);
  let end = parseDateBoundary(query.to, true);

  if (!start && !end) {
    start = defaultStart;
    end = todayEnd;
  } else if (start && !end) {
    end = todayEnd;
  } else if (!start && end) {
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
  }

  if (start > end) {
    throw new Error('from must be on or before to');
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    throw new Error('Date range cannot exceed 366 days');
  }

  return { start, end };
}

const attendanceSelect = {
  id: true,
  userId: true,
  checkIn: true,
  checkOut: true,
  latitude: true,
  longitude: true,
  createdAt: true,
  updatedAt: true,
};

const userPublicForAttendance = {
  id: true,
  name: true,
  email: true,
  role: true,
};

/**
 * If the user already has an attendance row for the current UTC calendar day, returns it.
 * Otherwise creates a new check-in with GPS coordinates.
 */
async function processCheckIn(userId, { latitude, longitude }) {
  const { start, end } = getUtcDayRange();

  const existing = await prisma.attendance.findFirst({
    where: {
      userId,
      checkIn: {
        gte: start,
        lt: end,
      },
    },
    orderBy: { checkIn: 'desc' },
    select: attendanceSelect,
  });

  if (existing) {
    return { created: false, attendance: existing };
  }

  const attendance = await prisma.attendance.create({
    data: {
      userId,
      latitude,
      longitude,
    },
    select: attendanceSelect,
  });

  return { created: true, attendance };
}

/**
 * Sets `checkOut` for the latest attendance row in the current UTC calendar day.
 * If already checked out, returns the existing row.
 */
async function processCheckOut(userId) {
  const { start, end } = getUtcDayRange();

  const existing = await prisma.attendance.findFirst({
    where: {
      userId,
      checkIn: {
        gte: start,
        lt: end,
      },
    },
    orderBy: { checkIn: 'desc' },
    select: attendanceSelect,
  });

  if (!existing) {
    throw new Error('No check-in found for today');
  }

  if (existing.checkOut) {
    return { updated: false, attendance: existing };
  }

  const attendance = await prisma.attendance.update({
    where: { id: existing.id },
    data: { checkOut: new Date() },
    select: attendanceSelect,
  });

  return { updated: true, attendance };
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function parseOptionalUserIdFilter(query) {
  const raw = query.userId;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('userId filter must be a positive integer');
  }
  return id;
}

async function listAttendance(query) {
  const { start, end } = resolveDateRange(query);
  const { page, limit, skip } = parsePagination(query);
  const userId = parseOptionalUserIdFilter(query);

  const where = {
    checkIn: { gte: start, lte: end },
    ...(userId ? { userId } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.attendance.findMany({
      where,
      skip,
      take: limit,
      orderBy: { checkIn: 'desc' },
      select: {
        ...attendanceSelect,
        user: { select: userPublicForAttendance },
      },
    }),
    prisma.attendance.count({ where }),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
      dateRange: { from: start.toISOString(), to: end.toISOString() },
    },
  };
}

async function listAttendanceByEmployee(userIdParam, query) {
  const id = Number(userIdParam);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('Invalid user id');
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new Error('User not found');
  }

  return listAttendance({ ...query, userId: id });
}

async function getAttendanceReportSummary(query) {
  const { start, end } = resolveDateRange(query);
  const whereRange = { checkIn: { gte: start, lte: end } };

  const [byDay, distinctRow, byUserGroup] = await prisma.$transaction([
    prisma.$queryRaw(
      Prisma.sql`
        SELECT (("checkIn" AT TIME ZONE 'UTC')::date)::text AS day,
               COUNT(*)::int AS count
        FROM "Attendance"
        WHERE "checkIn" >= ${start}
          AND "checkIn" <= ${end}
        GROUP BY (("checkIn" AT TIME ZONE 'UTC')::date)
        ORDER BY day ASC
      `,
    ),
    prisma.$queryRaw(
      Prisma.sql`
        SELECT COUNT(*)::int AS total,
               COUNT(DISTINCT "userId")::int AS "uniqueUsers"
        FROM "Attendance"
        WHERE "checkIn" >= ${start}
          AND "checkIn" <= ${end}
      `,
    ),
    prisma.attendance.groupBy({
      by: ['userId'],
      where: whereRange,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 100,
    }),
  ]);

  const totalsRow = distinctRow[0] || {};
  const records = Number(totalsRow.total ?? totalsRow.Total ?? 0);
  const uniqueEmployees = Number(
    totalsRow.uniqueUsers ?? totalsRow.uniqueusers ?? 0,
  );
  const userIds = byUserGroup.map((g) => g.userId);
  const users =
    userIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const byEmployee = byUserGroup.map((row) => {
    const u = userMap.get(row.userId);
    return {
      userId: row.userId,
      name: u?.name ?? null,
      email: u?.email ?? null,
      checkIns: row._count.id,
    };
  });

  return {
    dateRange: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      records,
      uniqueEmployees,
    },
    byDay: byDay.map((row) => ({ date: row.day, count: row.count })),
    byEmployee,
  };
}

module.exports = {
  processCheckIn,
  processCheckOut,
  listAttendance,
  listAttendanceByEmployee,
  getAttendanceReportSummary,
};
