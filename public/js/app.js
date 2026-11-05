const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ic = n => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const CAT_ICON = { All: 'grid', Electronics: 'phone', Bags: 'bag', Clothing: 'shirt', 'Books & Stationery': 'book', 'Keys & Cards': 'key', 'Bottles & Lunch': 'bottle', Other: 'sparkle' };
const GATED = { report: 'report an item', chat: 'chat with security', alerts: 'see your alerts' };
const STATUS = { open: 'Open', reviewing: 'Read by security', waitlisted: 'Waitlisted', matched: 'Matched', returned: 'Returned' };
const DUMMY = 'Black case with a small mark near the corner, found close to the main hall';

let token = localStorage.getItem('lofi_token');
let user = JSON.parse(localStorage.getItem('lofi_user') || 'null');
let cats = [], cat = 'All', thread = null, timer = null, unseen = 0;

async function api(path, opt = {}) {
  const res = await fetch('/api' + path, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: opt.body && JSON.stringify(opt.body)
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) signOut();
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3500); }

/* ---------- Navigation & access ---------- */
function nav() {
  const link = (v, l) => `<a href="#${v}" data-v="${v}">${l}${!user && GATED[v] ? ic('lock') : ''}</a>`;
  $('#nav').innerHTML = link('home', 'Browse') + link('report', 'Report') + link('chat', 'Chat') +
    link('alerts', `Alerts${unseen ? `<span class="dot">${unseen}</span>` : ''}`) +
    (user ? `<button id="out">Sign out</button>` : `<button id="in">Sign in</button><button class="join" id="join">Join LoFi</button>`);
  if (user) $('#out').onclick = signOut; else { $('#in').onclick = () => openAuth(); $('#join').onclick = () => openAuth('register'); }
  document.querySelector('.priv').hidden = user?.role !== 'security' && !user;
  const v = location.hash.slice(1) || 'home'; document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
}
function go(v) {
  if (!['home', 'report', 'chat', 'alerts'].includes(v)) v = 'home';
  if (GATED[v] && !user) { openAuth('login', `Sign in to ${GATED[v]}.`); v = 'home'; }
  document.querySelectorAll('main > section').forEach(s => s.hidden = s.id !== 'v-' + v);
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
  clearInterval(timer);
  if (v === 'home') loadItems();
  if (v === 'chat') { thread = null; loadChat(); timer = setInterval(loadChat, 3000); }
  if (v === 'alerts') loadAlerts();
}
window.onhashchange = () => go(location.hash.slice(1));

/* ---------- Auth ---------- */
function openAuth(mode = 'login', msg) {
  $('#authForm').mode.value = mode; syncAuth();
  if (msg) $('#authMsg').textContent = msg;
  $('#authErr').textContent = ''; $('#auth').showModal();
}
function syncAuth() {
  const f = $('#authForm'), reg = f.mode.value === 'register';
  document.querySelectorAll('.reg').forEach(l => l.hidden = !reg);
  f.name.required = f.confirm.required = reg;
  f.password.autocomplete = reg ? 'new-password' : 'current-password';
  $('#authGo').textContent = reg ? 'Create my account' : 'Sign in';
  $('#authMsg').textContent = reg ? 'Free and quick. Students only need a name and email.' : 'Sign in to see your reports, report items and chat with security.';
}
document.querySelectorAll('#authForm [name=mode]').forEach(r => r.onchange = syncAuth);
$('#authClose').onclick = () => $('#auth').close();
$('#authForm').onsubmit = async e => {
  e.preventDefault(); const f = e.target, reg = f.mode.value === 'register';
  if (reg && f.password.value !== f.confirm.value) { $('#authErr').textContent = 'The two passwords do not match.'; return; }
  try {
    const d = await api('/auth/' + f.mode.value, { method: 'POST', body: { name: f.name.value, email: f.email.value, password: f.password.value, confirm: f.confirm.value } });
    token = d.token; user = d.user;
    localStorage.setItem('lofi_token', token); localStorage.setItem('lofi_user', JSON.stringify(user));
    $('#auth').close(); f.reset(); toast(`Welcome, ${user.name.split(' ')[0]}!`); nav(); go(location.hash.slice(1) || 'home'); checkAlerts();
  } catch (err) { $('#authErr').textContent = err.message; }
};
function signOut() { token = null; user = null; localStorage.clear(); unseen = 0; location.hash = 'home'; nav(); go('home'); }

/* ---------- Browse & filters ---------- */
function renderChips() {
  $('#chips').innerHTML = ['All', ...cats].map(c => `<button class="chip" role="tab" aria-selected="${c === cat}" data-c="${esc(c)}">${ic(CAT_ICON[c])}${esc(c)}</button>`).join('');
  document.querySelectorAll('.chip').forEach(b => b.onclick = () => { cat = b.dataset.c; renderChips(); loadItems(); });
}
const F = $('#filters');
F.onchange = F.onsubmit = e => { e.preventDefault?.(); loadItems(); };
F.onreset = () => setTimeout(loadItems);
async function loadItems() {
  const p = new URLSearchParams(new FormData(F)); p.set('category', cat); p.set('q', $('#q').value);
  const items = await api('/items?' + p);
  $('#grid').innerHTML = items.length ? items.map(card).join('') : `<p class="empty">Nothing matches yet. If you lost something, <a href="#report">report it</a> and we'll keep watch.</p>`;
  document.querySelectorAll('[data-unlock]').forEach(b => b.onclick = () => b.dataset.unlock === '1' ? openAuth('login', 'Sign in to ask about this item.') : (location.hash = 'chat'));
  document.querySelectorAll('[data-remind]').forEach(b => b.onclick = () => remindTomorrow(b.dataset.remind));
  document.querySelectorAll('[data-status]').forEach(s => s.onchange = async () => { await api(`/items/${s.dataset.status}/status`, { method: 'PATCH', body: { status: s.value } }); toast('Status updated. The reporter has been emailed.'); loadItems(); });
  document.querySelectorAll('[data-photo]').forEach(async im => {
    const r = await fetch(`/api/items/${im.dataset.photo}/photo`, { headers: { Authorization: 'Bearer ' + token } });
    r.ok ? (im.src = URL.createObjectURL(await r.blob())) : im.remove();
  });
}
function card(i) {
  const head = `<div class="ico">${ic(CAT_ICON[i.category] || 'sparkle')}</div><h3>${esc(i.title)}</h3>
    <div class="meta"><span class="tag ${i.type}">${i.type}</span><span class="tag ${i.status}">${STATUS[i.status]}</span><span class="tag">${esc(i.category)}</span><span class="tag">${esc(i.date)}</span></div>`;
  if (i.masked) return `<article class="card">${head}<div class="veil"><p class="blur" aria-hidden="true">${DUMMY}</p>
    <button class="veil-btn" data-unlock="${i.locked ? 1 : 0}">${ic('lock')}${i.locked ? 'Sign in to view details' : 'Message security to verify'}</button></div>
    ${user ? `<div class="row"><button class="btn small ghost" data-remind="${i.id}">${ic('bell')} Remind me</button></div>` : ''}</article>`;
  const sel = user.role === 'security' ? `<select data-status="${i.id}" aria-label="Change status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === i.status ? 'selected' : ''}>${v}</option>`).join('')}</select>` : '';
  return `<article class="card">${head}${i.has_photo ? `<img class="photo" data-photo="${i.id}" alt="Photo of ${esc(i.title)}">` : ''}
    <p>${esc(i.description) || 'No description.'}</p><p class="where">${ic('pin')} ${esc(i.location) || 'Location not given'}</p>
    ${i.reporter ? `<p class="hint">Reported by ${esc(i.reporter)}</p>` : ''}
    <div class="row"><button class="btn small ghost" data-remind="${i.id}">${ic('bell')} Remind me</button>${sel}</div></article>`;
}
async function remindTomorrow(id) {
  const d = new Date(Date.now() + 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  await api('/alerts/reminders', { method: 'POST', body: { item_id: Number(id), note: 'Check on this item', remind_at: d } });
  toast('Reminder set for tomorrow. Change it in Alerts.');
}
$('#searchBtn').onclick = loadItems; $('#q').onkeydown = e => e.key === 'Enter' && loadItems();

/* ---------- Report (with optional photo, visible to security only) ---------- */
const shrink = file => new Promise(res => {
  const img = new Image();
  img.onload = () => { const s = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .8)); };
  img.onerror = () => res(null); img.src = URL.createObjectURL(file);
});
$('#reportForm').onsubmit = async e => {
  e.preventDefault(); const f = e.target, fd = new FormData(f), file = fd.get('photofile'); fd.delete('photofile');
  const body = Object.fromEntries(fd); if (file && file.size) body.photo = await shrink(file);
  try { await api('/items', { method: 'POST', body }); f.reset(); toast("Report sent. We've emailed you a confirmation."); location.hash = 'home'; }
  catch (err) { toast(err.message); }
};

/* ---------- Chat ---------- */
async function loadChat() {
  if (!user) return;
  const staff = user.role === 'security'; $('#threads').hidden = !staff;
  if (staff) {
    const ts = await api('/chat/threads');
    $('#threads').innerHTML = ts.map(t => `<button data-t="${t.id}" class="${t.id === thread ? 'on' : ''}">${esc(t.name)}<small>${esc(t.last)}</small></button>`).join('') || '<p class="hint">No chats yet.</p>';
    document.querySelectorAll('#threads button').forEach(b => b.onclick = () => { thread = Number(b.dataset.t); loadChat(); });
    if (!thread) { $('#msgs').innerHTML = '<p class="hint">Pick a student to reply.</p>'; return; }
  }
  const ms = await api('/chat/messages' + (staff ? `?thread=${thread}` : ''));
  const box = $('#msgs'), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
  box.innerHTML = ms.length ? ms.map(m => `<div class="m ${m.sender_id === user.id ? 'me' : ''}"><small>${esc(m.sender)}</small>${esc(m.body)}</div>`).join('') : '<p class="hint">Say hello. Describe your item and security will reply here.</p>';
  if (atEnd) box.scrollTop = box.scrollHeight;
}
$('#chatForm').onsubmit = async e => {
  e.preventDefault(); const i = $('#chatInput'); if (!i.value.trim()) return;
  try { await api('/chat/messages', { method: 'POST', body: { body: i.value, thread } }); i.value = ''; await loadChat(); $('#msgs').scrollTop = 1e6; } catch (err) { toast(err.message); }
};

/* ---------- Alerts & reminders ---------- */
async function loadAlerts() {
  const [ns, rs] = await Promise.all([api('/alerts/notifications'), api('/alerts/reminders')]);
  $('#notes').innerHTML = ns.map(n => `<div class="note ${n.seen ? '' : 'new'}">${esc(n.text)}</div>`).join('') || '<p class="hint">All quiet. Updates about your items will show up here.</p>';
  $('#rems').innerHTML = rs.map(r => `<div class="note"><span>${esc(r.note)}${r.item_title ? ` · <em>${esc(r.item_title)}</em>` : ''}<br><small>${new Date(r.remind_at).toLocaleString()}</small></span>${r.done ? ic('check') : `<button class="btn small ghost" data-done="${r.id}">Done</button>`}</div>`).join('') || '<p class="hint">No reminders yet.</p>';
  document.querySelectorAll('[data-done]').forEach(b => b.onclick = async () => { await api(`/alerts/reminders/${b.dataset.done}/done`, { method: 'POST' }); loadAlerts(); });
  await api('/alerts/notifications/seen', { method: 'POST' }); unseen = 0; nav();
}
$('#remForm').onsubmit = async e => {
  e.preventDefault(); const f = e.target;
  try { await api('/alerts/reminders', { method: 'POST', body: { note: f.note.value, remind_at: f.remind_at.value } }); f.reset(); loadAlerts(); } catch (err) { toast(err.message); }
};
async function checkAlerts() {
  if (!user) return;
  try {
    const [ns, rs] = await Promise.all([api('/alerts/notifications'), api('/alerts/reminders')]);
    unseen = ns.filter(n => !n.seen).length; nav();
    rs.filter(r => !r.done && new Date(r.remind_at) <= new Date()).forEach(r => toast('Reminder: ' + r.note));
  } catch {}
}
setInterval(checkAlerts, 30000);

/* ---------- Luna assistant ---------- */
$('#botBtn').onclick = () => { const b = $('#bot'); b.hidden = !b.hidden; if (!b.hidden && !$('#botMsgs').children.length) say('Hi, I\'m Luna. Tell me what you lost, like "black phone in the library", and I\'ll look.'); };
function say(text, me, extra = '') { const d = document.createElement('div'); d.className = 'm' + (me ? ' me' : ''); d.innerHTML = esc(text) + extra; $('#botMsgs').append(d); $('#botMsgs').scrollTop = 1e6; return d; }
const ACTIONS = { 'Report an item': () => (location.hash = 'report'), 'Message security': () => (location.hash = 'chat'), 'Open alerts': () => (location.hash = 'alerts'), 'Sign in': () => openAuth() };
$('#botForm').onsubmit = async e => {
  e.preventDefault(); const i = $('#botInput'), m = i.value.trim(); if (!m) return; i.value = ''; say(m, true);
  try {
    const r = await api('/assistant', { method: 'POST', body: { message: m } });
    const d = say(r.reply, false, r.items.map(x => `<span class="mini"><b>${esc(x.title)}</b> · ${esc(x.note)}</span>`).join(''));
    r.actions.forEach(a => { const b = document.createElement('button'); b.className = 'btn small'; b.style.marginTop = '.5rem'; b.textContent = a; b.onclick = ACTIONS[a]; d.append(b); });
  } catch (err) { say(err.message); }
};

/* ---------- Start ---------- */
(async function init() {
  cats = await api('/items/categories');
  $('#catSelect').innerHTML = cats.map(c => `<option>${esc(c)}</option>`).join('');
  renderChips(); nav(); go(location.hash.slice(1) || 'home'); checkAlerts();
})();
