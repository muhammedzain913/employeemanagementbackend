const attendanceService = require('../services/attendance.service');

const checkIn = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude } = req.checkInCoordinates;

    const { created, attendance } = await attendanceService.processCheckIn(userId, {
      latitude,
      longitude,
    });

    const status = created ? 201 : 200;
    const message = created
      ? 'Check-in recorded successfully'
      : 'Already checked in today';

    res.status(status).json({
      success: true,
      message,
      data: attendance,
      meta: { created },
    });
  } catch (error) {
    next(error);
  }
};

const checkOut = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { updated, attendance } = await attendanceService.processCheckOut(userId);

    const message = updated
      ? 'Check-out recorded successfully'
      : 'Already checked out today';

    res.status(200).json({
      success: true,
      message,
      data: attendance,
      meta: { updated },
    });
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const result = await attendanceService.listAttendance(req.query);
    res.status(200).json({
      success: true,
      message: 'Attendance retrieved',
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

const listByEmployee = async (req, res, next) => {
  try {
    const result = await attendanceService.listAttendanceByEmployee(
      req.params.userId,
      req.query,
    );
    res.status(200).json({
      success: true,
      message: 'Employee attendance retrieved',
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

const myHistory = async (req, res, next) => {
  try {
    const result = await attendanceService.listAttendance({
      ...req.query,
      userId: req.user.id,
    });
    res.status(200).json({
      success: true,
      message: 'My attendance history',
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

const reportSummary = async (req, res, next) => {
  try {
    const data = await attendanceService.getAttendanceReportSummary(req.query);
    res.status(200).json({
      success: true,
      message: 'Attendance report summary',
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { checkIn, checkOut, list, listByEmployee, myHistory, reportSummary };
