// "Luna" - LoFi's built-in assistant. Runs fully offline: tokenise -> stem -> score intents -> pull out
// entities (category, keywords) -> search real items -> reply in a tone that fits the person.
const router = require('express').Router();
const db = require('../db');
const { optional } = require('./auth');

const STOP = new Set('i a an the my is are was were to of in on at for and or it me can you do how please have has had that this with from some where what who when im ive any'.split(' '));
const stem = w => { const s = w.replace(/(ing|ed|es|s)$/, ''); return s.length > 2 ? s : w; };
const tokens = t => t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).map(stem);

const INTENTS = {
  greet: 'hi hello hey morning afternoon evening sup',
  lost: 'lost miss missing left forgot forgotten misplac find looking search anyone seen',
  found: 'found pick discover came across turned handed',
  chat: 'security guard officer talk speak human staff chat person',
  remind: 'remind reminder notify alert notification update',
  how: 'how report submit claim process work help steps',
  thanks: 'thank thanks cheers appreciate'
};
const LEX = Object.fromEntries(Object.entries(INTENTS).map(([k, v]) => [k, v.split(' ').map(stem)]));

const CATS = {
  Electronics: 'phone iphone samsung android laptop charger earbud airpod headphone tablet ipad calculator watch camera powerbank cable mouse',
  Bags: 'bag backpack handbag purse satchel pouch',
  Clothing: 'jacket hoodie sweater shirt shoe shoes cap scarf uniform tie blazer coat glove sock jersey',
  'Books & Stationery': 'book notebook pen pencil textbook folder geometry ruler diary',
  'Keys & Cards': 'key keys id card wallet lanyard badge',
  'Bottles & Lunch': 'bottle flask lunchbox lunch tumbler cup',
};
const CAT_LEX = Object.entries(CATS).map(([c, w]) => [c, w.split(' ').map(stem)]);

router.post('/', optional, async (req, res) => {
  const msg = String(req.body.message || '').slice(0, 300), toks = tokens(msg);
  const scores = Object.entries(LEX).map(([i, ws]) => [i, toks.filter(t => ws.some(w => t.startsWith(w) || w.startsWith(t))).length]).sort((a, b) => b[1] - a[1]);
  let intent = scores[0][1] ? scores[0][0] : 'unknown';
  const cat = (CAT_LEX.find(([, ws]) => toks.some(t => ws.includes(t))) || [])[0];
  if (cat && (intent === 'unknown' || intent === 'greet')) intent = 'lost';

  const urgent = /urgent|asap|panic|worried|important|please help|exam|stress/i.test(msg);
  const warm = urgent ? "Don't worry, we'll sort this out together. " : '';
  const out = { reply: '', items: [], actions: [] };

  if (intent === 'lost') {
    const words = toks.filter(t => !LEX.lost.includes(t));
    const found = db.prepare("SELECT * FROM items WHERE type='found' AND status='open'").all()
      .map(i => {
        const hay = tokens(req.user?.role === 'security' ? `${i.title} ${i.description} ${i.category} ${i.location}` : `${i.title} ${i.category}`);
        return { i, s: words.filter(w => hay.includes(w)).length + (cat && i.category === cat ? 1 : 0) };
      }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map(x => x.i);
    if (found.length) {
      out.reply = warm + (req.user ? `Good news, I found ${found.length} possible match${found.length > 1 ? 'es' : ''}:` : `I found ${found.length} possible match${found.length > 1 ? 'es' : ''}. Sign in to see where they were found.`);
      out.items = found.map(i => ({ id: i.id, title: i.title, note: req.user?.role === 'security' ? i.location : req.user ? 'Message security to verify' : 'Sign in for details' }));
      out.actions = req.user ? ['Message security'] : ['Sign in'];
    } else {
      out.reply = warm + "Nothing matches yet, but items arrive every day. Report it and you'll get an alert the moment something similar is turned in.";
      out.actions = ['Report an item'];
    }
  } else if (intent === 'found') { out.reply = 'Thank you for being honest! Report it so the owner can find it.'; out.actions = ['Report an item']; }
  else if (intent === 'chat') { out.reply = 'You can talk to the security team directly. They reply in your chat.'; out.actions = ['Message security']; }
  else if (intent === 'remind') { out.reply = 'You can set a reminder on any item, and your alerts page shows every update.'; out.actions = ['Open alerts']; }
  else if (intent === 'how') out.reply = 'It takes three steps: 1) Create a free account. 2) Report what you lost or found. 3) Watch your alerts or chat with security. Browsing is open to everyone.';
  else if (intent === 'thanks') out.reply = 'Anytime! I hope you find it soon.';
  else if (intent === 'greet') out.reply = `Hi${req.user ? ' ' + req.user.name.split(' ')[0] : ''}! Tell me what you lost, like "black phone in the library", and I'll look.`;
  else out.reply = 'I\'m not sure I got that. Try describing the item, like "blue water bottle", or ask how reporting works.';

  // Optional: let Claude phrase the reply. It only sees item titles, never locations or descriptions.
  if (process.env.ANTHROPIC_API_KEY) try { out.reply = await phrase(msg, out, req.user); } catch (e) { console.error('Claude unavailable, using built-in reply:', e.message); }
  res.json(out);
});

async function phrase(msg, out, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 250,
      system: "You are Luna, the assistant for LoFi, a school lost-and-found site. Reply in 1-3 short, warm, plain sentences that match the user's tone. Use only the facts provided. Never invent items, places or descriptions.",
      messages: [{ role: 'user', content: JSON.stringify({ user_message: msg, signed_in: !!user, matching_item_titles: out.items.map(i => i.title), buttons_shown: out.actions, draft_reply: out.reply }) }]
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || r.status);
  return d.content?.[0]?.text || out.reply;
}

module.exports = router;
