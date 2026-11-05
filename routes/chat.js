const router = require('express').Router();
const db = require('../db');
const { auth, staff } = require('./auth');
router.use(auth);

// Every student has one conversation thread (thread_id = their user id). Security sees all threads.
router.get('/threads', staff, (req, res) => res.json(db.prepare(
  `SELECT u.id, u.name, (SELECT body FROM messages WHERE thread_id=u.id ORDER BY id DESC LIMIT 1) last
   FROM users u WHERE u.id IN (SELECT thread_id FROM messages) ORDER BY (SELECT MAX(id) FROM messages WHERE thread_id=u.id) DESC`).all()));

const threadOf = req => req.user.role === 'security' ? Number(req.query.thread || req.body.thread) : req.user.id;

router.get('/messages', (req, res) => res.json(db.prepare(
  'SELECT m.*, u.name sender FROM messages m JOIN users u ON u.id=m.sender_id WHERE thread_id=? ORDER BY m.id').all(threadOf(req))));

router.post('/messages', (req, res) => {
  const body = (req.body.body || '').trim().slice(0, 1000), thread = threadOf(req);
  if (!body || !thread) return res.status(400).json({ error: 'Type a message first.' });
  db.prepare('INSERT INTO messages(thread_id,sender_id,body) VALUES(?,?,?)').run(thread, req.user.id, body);
  if (req.user.role === 'security' && !db.prepare("SELECT 1 FROM notifications WHERE user_id=? AND seen=0 AND text LIKE 'Security replied%'").get(thread))
    db.alert(thread, 'Security replied to you', 'Security replied to your message in LoFi chat.');
  res.json({ ok: true });
});

module.exports = router;
