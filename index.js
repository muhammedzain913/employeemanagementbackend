require('dotenv').config();

const express = require('express');
const authRoutes = require('./src/routes/auth.routes');
const employeeRoutes = require('./src/routes/employee.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World! Your Express server is running.');
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);

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
  };
  const status = statusByMessage[message] || 500;
  res.status(status).json({
    success: false,
    message,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
