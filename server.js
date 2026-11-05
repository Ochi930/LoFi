const express = require('express');
const path = require('path');
const app = express();

require('./mailer');
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth').router);
app.use('/api/items', require('./routes/items'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/assistant', require('./routes/assistant'));

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong. Please try again.' }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LoFi is running on http://localhost:${PORT}`));
