const employeeService = require('../services/employee.service');

const create = async (req, res, next) => {
  try {
    const data = await employeeService.createEmployee(req.body);
    res.status(201).json({
      success: true,
      message: 'Employee created',
      data,
    });
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const result = await employeeService.listEmployees(req.query);
    res.status(200).json({
      success: true,
      message: 'Employees retrieved',
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const data = await employeeService.getEmployeeByUserId(req.params.userId);
    res.status(200).json({
      success: true,
      message: 'Employee profile',
      data,
    });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const data = await employeeService.updateEmployee(
      req.params.userId,
      req.body,
    );
    res.status(200).json({
      success: true,
      message: 'Employee updated',
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { create, list, getById, update };
