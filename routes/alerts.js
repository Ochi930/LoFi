const router = require('express').Router();
const db = require('../db');
const { auth } = require('./auth');
router.use(auth);

router.get('/notifications', (req, res) => res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30').all(req.user.id)));
router.post('/notifications/seen', (req, res) => { db.prepare('UPDATE notifications SET seen=1 WHERE user_id=?').run(req.user.id); res.json({ ok: true }); });

router.get('/reminders', (req, res) => res.json(db.prepare(
  'SELECT r.*, i.title item_title FROM reminders r LEFT JOIN items i ON i.id=r.item_id WHERE r.user_id=? ORDER BY r.remind_at').all(req.user.id)));
router.post('/reminders', (req, res) => {
  const { item_id = null, note, remind_at } = req.body;
  if (!remind_at) return res.status(400).json({ error: 'Pick when you want to be reminded.' });
  db.prepare('INSERT INTO reminders(user_id,item_id,note,remind_at) VALUES(?,?,?,?)').run(req.user.id, item_id, note || 'Check on my item', remind_at);
  res.json({ ok: true });
});
router.post('/reminders/:id/done', (req, res) => { db.prepare('UPDATE reminders SET done=1 WHERE id=? AND user_id=?').run(req.params.id, req.user.id); res.json({ ok: true }); });

module.exports = router;
