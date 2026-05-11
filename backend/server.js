const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
const sosoRoutes = require('./routes/sosovalue');
const agentRoutes = require('./routes/agent');

app.use('/api/soso', sosoRoutes);
app.use('/api/agent', agentRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
