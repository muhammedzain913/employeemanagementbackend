const express = require('express');
const app = express();
const PORT = 3000;

// A simple route
app.get('/', (req, res) => {
  res.send('Hello World! Your Express server is running.');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is purring at http://localhost:${PORT}`);
});