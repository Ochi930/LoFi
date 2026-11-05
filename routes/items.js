const router = require('express').Router();
const fs = require('fs'), path = require('path');
const db = require('../db');
const { auth, staff, optional } = require('./auth');

const UPLOADS = path.join(__dirname, '..', 'uploads'); // private folder, never served statically
fs.mkdirSync(UPLOADS, { recursive: true });
const STATUSES = ['open', 'reviewing', 'waitlisted', 'matched', 'returned'];

router.get('/categories', (req, res) => res.json(db.CATEGORIES));

/* Role-based view of items:
   security -> everything, plus photos | owner -> their own reports in full | everyone else -> public facts only (sensitive fields withheld, not just hidden) */
router.get('/', optional, (req, res) => {
  const { q = '', category = 'All', type = '', status = '', location = '', from = '', sort = 'new' } = req.query;
  const role = req.user?.role, has = (s, t) => (s || '').toLowerCase().includes(t.toLowerCase());
  const full = i => role === 'security' || i.user_id === req.user?.id;
  const rows = db.prepare('SELECT i.*, u.name reporter FROM items i JOIN users u ON u.id=i.user_id ORDER BY i.id ' + (sort === 'old' ? 'ASC' : 'DESC')).all()
    .filter(i => (category === 'All' || i.category === category) && (!type || i.type === type) && (!status || i.status === status) && (!from || i.date >= from) &&
      (!q || has(i.title + ' ' + i.category + (full(i) ? ' ' + i.description : ''), q)) && (!location || !full(i) || has(i.location, location)))
    .map(i => {
      const base = { id: i.id, type: i.type, title: i.title, category: i.category, status: i.status, date: i.date };
      return full(i) ? { ...base, description: i.description, location: i.location, mine: i.user_id === req.user.id, ...(role === 'security' && { reporter: i.reporter, has_photo: !!i.has_photo }) }
                     : { ...base, masked: true, locked: !req.user };
    });
  res.json(req.user ? rows : rows.slice(0, 12));
});

router.post('/', auth, (req, res) => {
  const { type, title, category, description, location, date, photo } = req.body;
  if (!['lost', 'found'].includes(type) || !title || !db.CATEGORIES.includes(category)) return res.status(400).json({ error: 'Add a title and pick a category.' });
  const id = Number(db.prepare('INSERT INTO items(user_id,type,title,category,description,location,date) VALUES(?,?,?,?,?,?,?)')
    .run(req.user.id, type, title.trim(), category, description || '', location || '', date || new Date().toISOString().slice(0, 10)).lastInsertRowid);
  const img = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(photo || '');
  if (img && img[1].length < 3e6) { fs.writeFileSync(path.join(UPLOADS, id + '.jpg'), Buffer.from(img[1], 'base64')); db.prepare('UPDATE items SET has_photo=1 WHERE id=?').run(id); }
  db.alert(req.user.id, 'We received your report', `We received your report for "${title}". We'll email you when security reads it.`);
  const opposite = type === 'found' ? 'lost' : 'found';
  db.prepare("SELECT DISTINCT user_id FROM items WHERE type=? AND category=? AND status='open' AND user_id!=?").all(opposite, category, req.user.id)
    .forEach(r => db.notify(r.user_id, `A new ${type} item in ${category} was reported. It might be yours.`));
  res.json({ id });
});

router.get('/:id/photo', auth, staff, (req, res) => {
  const f = path.join(UPLOADS, `${Number(req.params.id)}.jpg`);
  fs.existsSync(f) ? res.sendFile(f) : res.sendStatus(404);
});

const SAYS = {
  open: ['Your report is open again', 'is open again'],
  reviewing: ['Security has read your report', 'was read by security, who are now looking into it'],
  waitlisted: ['Your report is on the waitlist', 'is on the waitlist. We will contact you as soon as something matches'],
  matched: ['Possible match found', 'has a possible match. Please message security to verify it'],
  returned: ['Item returned', 'is marked as returned']
};
router.patch('/:id/status', auth, staff, (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
  const it = db.prepare('SELECT * FROM items WHERE id=?').get(req.params.id);
  if (!it) return res.sendStatus(404);
  db.prepare('UPDATE items SET status=? WHERE id=?').run(status, it.id);
  const people = new Set([it.user_id, ...db.prepare('SELECT user_id FROM reminders WHERE item_id=?').all(it.id).map(r => r.user_id)]);
  people.forEach(uid => db.alert(uid, SAYS[status][0], `Your report "${it.title}" ${SAYS[status][1]}.`));
  res.json({ ok: true });
});

module.exports = router;
