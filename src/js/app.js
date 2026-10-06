// 1. Вставьте данные своего проекта Supabase (Project Settings → API)
const SUPABASE_URL = 'https://phezoeinwrgdouuhafgz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0QVrXPIHnMUzE5b3fRMOPQ_E40ygTnC';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
const CATEGORIES = { food: 'Продукты', transport: 'Транспорт', entertainment: 'Развлечения', bills: 'Коммуналка' };
const fmt = (n) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let user = null;
let channel = null;

const login = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
const logout = () => sb.auth.signOut();

function renderSummary(rows) {
  const sum = (t) => rows.filter((r) => r.type === t).reduce((s, r) => s + Number(r.amount), 0);
  const inc = sum('income'), exp = sum('expense');
  $('income').textContent = fmt(inc);
  $('expense').textContent = fmt(exp);
  $('balance').textContent = fmt(inc - exp);
  renderStats(rows);
}

function renderList(rows) {
  const list = $('tx-list');
  list.replaceChildren();
  $('tx-empty').hidden = rows.length > 0;
  $('tx-empty').textContent = 'Транзакций пока нет';
  rows.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'transaction-item';

    const title = document.createElement('span');
    title.className = 'transaction-item__title';
    title.textContent = r.title;

    const badge = document.createElement('span');
    badge.className = `badge category--${r.category}`;
    badge.textContent = CATEGORIES[r.category] || r.category;

    const date = document.createElement('span');
    date.className = 'transaction-item__date';
    date.textContent = new Date(r.created_at).toLocaleDateString('ru-RU');

    const amount = document.createElement('span');
    amount.className = `transaction-item__amount transaction-item__amount--${r.type}`;
    amount.textContent = (r.type === 'income' ? '+' : '−') + fmt(r.amount);

    li.append(title, badge, date, amount);
    list.append(li);
  });
}

async function loadTransactions() {
  const { data, error } = await sb.from('transactions').select('*').order('created_at', { ascending: false });
  if (error) return alert('Ошибка загрузки: ' + error.message);
  renderSummary(data);
  renderList(data);
}

function subscribe() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('transactions-' + user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` }, loadTransactions)
    .subscribe();
}

function applySession(session) {
  user = session?.user ?? null;
  const btn = $('auth-btn');
  btn.textContent = user ? 'Выйти' : 'Войти через Google';
  btn.onclick = user ? logout : login;
  $('greeting').textContent = user ? `Привет, ${user.user_metadata?.full_name || user.email}!` : '';
  $('welcome').hidden = !!user;
  $('app').hidden = !user;
  $('greeting').hidden = !user;

  if (user) {
    loadTransactions();
    subscribe();
  } else {
    if (channel) sb.removeChannel(channel);
    renderSummary([]);
    renderList([]);
    $('tx-empty').hidden = false;
    $('tx-empty').textContent = 'Войдите, чтобы увидеть транзакции';
  }
}

$('tx-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await sb.from('transactions').insert({
    user_id: user.id,
    title: f.get('title').trim(),
    amount: Number(f.get('amount')),
    type: f.get('type'),
    category: f.get('category')
  });
  if (error) return alert('Ошибка: ' + error.message);
  e.target.reset();
  loadTransactions();
});

sb.auth.onAuthStateChange((_event, session) => applySession(session));

// --- Переключатель темы ---
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch (e) {}
  $('theme-btn').textContent = t === 'dark' ? '☀️' : '🌙';
}
$('theme-btn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
setTheme(document.documentElement.dataset.theme || 'light');
$('welcome-btn').addEventListener('click', login);

// --- Диаграмма расходов по категориям ---
function renderStats(rows) {
  const byCat = {};
  rows.filter((r) => r.type === 'expense').forEach((r) => {
    byCat[r.category] = (byCat[r.category] || 0) + Number(r.amount);
  });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const color = (c) => `var(--cat-${c}, #9ca3af)`;

  $('donut-total').textContent = fmt(total);

  let acc = 0;
  const parts = entries.map(([c, v]) => {
    const from = acc;
    acc += (v / total) * 100;
    return `${color(c)} ${from}% ${acc}%`;
  });
  $('donut').style.background = total ? `conic-gradient(${parts.join(', ')})` : 'var(--surface-alt)';

  const legend = $('legend');
  legend.replaceChildren();
  if (!total) {
    const li = document.createElement('li');
    li.className = 'legend__empty';
    li.textContent = 'Расходов пока нет';
    legend.append(li);
    return;
  }
  entries.forEach(([c, v]) => {
    const li = document.createElement('li');
    li.className = 'legend__item';
    const dot = document.createElement('span');
    dot.className = 'legend__dot';
    dot.style.background = color(c);
    const name = document.createElement('span');
    name.className = 'legend__name';
    name.textContent = CATEGORIES[c] || c;
    const sum = document.createElement('span');
    sum.className = 'legend__sum';
    sum.textContent = fmt(v);
    const pct = document.createElement('span');
    pct.className = 'legend__pct';
    pct.textContent = Math.round((v / total) * 100) + '%';
    li.append(dot, name, sum, pct);
    legend.append(li);
  });
}
