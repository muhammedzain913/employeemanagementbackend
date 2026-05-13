const leaveService = require('../services/leave.service');

const apply = async (req, res, next) => {
  try {
    const data = await leaveService.applyLeave(req.user.id, req.body ?? {});
    res.status(201).json({
      success: true,
      message: 'Leave request submitted',
      data,
    });
  } catch (error) {
    next(error);
  }
};

const myHistory = async (req, res, next) => {
  try {
    const result = await leaveService.getLeaveHistory(req.user.id, req.query);
    res.status(200).json({
      success: true,
      message: 'Leave history',
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

const myBalance = async (req, res, next) => {
  try {
    const data = await leaveService.getLeaveBalance(req.user.id, req.query);
    res.status(200).json({
      success: true,
      message: 'Leave balance',
      data,
    });
  } catch (error) {
    next(error);
  }
};

const myLeaveById = async (req, res, next) => {
  try {
    const data = await leaveService.getLeaveByIdForUser(
      req.params.leaveId,
      req.user.id,
    );
    res.status(200).json({
      success: true,
      message: 'Leave request',
      data,
    });
  } catch (error) {
    next(error);
  }
};

const listRequests = async (req, res, next) => {
  try {
    const result = await leaveService.listLeaveRequests(req.query);
    res.status(200).json({
      success: true,
      message: 'Leave requests',
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

const approve = async (req, res, next) => {
  try {
    const data = await leaveService.approveLeave(
      req.params.leaveId,
      req.body ?? {},
    );
    res.status(200).json({
      success: true,
      message: 'Leave approved',
      data,
    });
  } catch (error) {
    next(error);
  }
};

const reject = async (req, res, next) => {
  try {
    const data = await leaveService.rejectLeave(
      req.params.leaveId,
      req.body ?? {},
    );
    res.status(200).json({
      success: true,
      message: 'Leave rejected',
      data,
    });
  } catch (error) {
    next(error);
  }
};

const reports = async (req, res, next) => {
  try {
    const data = await leaveService.getLeaveReports(req.query);
    res.status(200).json({
      success: true,
      message: 'Leave reports',
      data,
    });
  } catch (error) {
    next(error);
  }
};

const balanceMonitoring = async (req, res, next) => {
  try {
    const result = await leaveService.getLeaveBalanceMonitoring(req.query);
    res.status(200).json({
      success: true,
      message: 'Leave balance monitoring',
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

const adminLeaveById = async (req, res, next) => {
  try {
    const data = await leaveService.getLeaveByIdAdmin(req.params.leaveId);
    res.status(200).json({
      success: true,
      message: 'Leave request',
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  apply,
  myHistory,
  myBalance,
  myLeaveById,
  listRequests,
  approve,
  reject,
  reports,
  balanceMonitoring,
  adminLeaveById,
};
