const leaveService = require('../services/leave.service');

function validateApplyLeave(req, res, next) {
  try {
    leaveService.assertApplyLeaveBody(req.body ?? {});
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { validateApplyLeave };
