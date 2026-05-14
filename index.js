require('dotenv').config();

const express = require('express');
const cors = require('cors');
const authRoutes = require('./src/routes/auth.routes');
const employeeRoutes = require('./src/routes/employee.routes');
const attendanceRoutes = require('./src/routes/attendance.routes');
const leaveRoutes = require('./src/routes/leave.routes');

const app = express();
const PORT = process.env.PORT || 3000;

let allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3001')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
if (allowedOrigins.length === 0) {
  allowedOrigins = ['http://localhost:3001'];
}
console.info(`CORS allowed origins: ${allowedOrigins.join(', ')}`);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World! Your Express server is running.');
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);

app.use((err, req, res, next) => {
  const message = err.message || 'Internal Server Error';
  const statusByMessage = {
    'User already exists': 409,
    'Invalid roleId': 400,
    'email, password, name, and roleId are required': 400,
    'roleId must be a positive integer': 400,
    'email and password are required': 400,
    'Invalid credentials': 401,
    'JWT_SECRET is not configured': 500,
    'employeeCode is required': 400,
    'Invalid user id': 400,
    'Invalid hireDate': 400,
    'Invalid employee status': 400,
    'roleId filter must be a positive integer': 400,
    'Employee not found': 404,
    'Email already in use': 409,
    'Employee code already in use': 409,
    'latitude and longitude are required': 400,
    'latitude and longitude must be valid numbers': 400,
    'latitude or longitude out of valid range': 400,
    'Invalid coordinates': 400,
    'No check-in found for today': 400,
    'Invalid date parameter': 400,
    'from must be on or before to': 400,
    'Date range cannot exceed 366 days': 400,
    'userId filter must be a positive integer': 400,
    'User not found': 404,
    'startDate and endDate are required': 400,
    'endDate must be on or after startDate': 400,
    'Leave range cannot exceed 366 days': 400,
    'reason is required': 400,
    'Leave dates overlap an existing pending or approved request': 409,
    'Invalid leave status filter': 400,
    'Invalid leave id': 400,
    'Leave request not found': 404,
    'Only pending leave requests can be approved': 400,
    'Only pending leave requests can be rejected': 400,
    'Leave dates overlap another approved request': 409,
    'year must be a valid integer': 400,
    'leaveAllocationDays must be an integer from 0 to 366': 400,
  };
  let status = statusByMessage[message];
  if (status === undefined) {
    if (message.startsWith('Leave exceeds allocation for')) {
      status = 400;
    } else if (message.startsWith('Approval would exceed allocation for')) {
      status = 400;
    } else {
      status = 500;
    }
  }
  res.status(status).json({
    success: false,
    message,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
