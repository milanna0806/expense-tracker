// 1. Вставьте данные своего проекта Supabase (Project Settings → API)
const SUPABASE_URL = 'https://phezoeinwrgdouuhafgz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0QVrXPIHnMUzE5b3fRMOPQ_E40ygTnC';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
const CATEGORIES = { food: 'Продукты', transport: 'Транспорт', entertainment: 'Развлечения', bills: 'Коммуналка' };
const fmt = (n) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let user = null;
let channel = null;

// Сюда Supabase вернёт пользователя из писем (подтверждение email, сброс пароля) и из Google.
// Этот адрес должен быть в Supabase → Authentication → URL Configuration → Redirect URLs.
const REDIRECT_URL = window.location.origin + window.location.pathname;
const MIN_PASSWORD = 8;

const loginGoogle = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: REDIRECT_URL } });
const logout = () => sb.auth.signOut();

let mode = 'login';        // login | signup | forgot | recovery
let recovering = false;    // пользователь пришёл по ссылке из письма и ещё не задал новый пароль
let cooldownTimer = null;

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

function applySession(rawSession) {
  // Пока человек не задал новый пароль, приложение не показываем
  const session = recovering ? null : rawSession;
  user = session?.user ?? null;
  const btn = $('auth-btn');
  btn.textContent = user ? 'Выйти' : 'Войти';
  btn.onclick = user ? logout : () => { if (mode === 'recovery') return; setMode('login'); $('auth-email').focus(); };
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

// --- Форма входа / регистрации / восстановления пароля ---
const MODES = {
  login:    { title: 'Вход',               submit: 'Войти',              fields: ['email', 'password'],       tabs: true,  google: true },
  signup:   { title: 'Регистрация',        submit: 'Создать аккаунт',    fields: ['email', 'password', 'password2'], tabs: true,  google: true },
  forgot:   { title: 'Восстановление пароля', submit: 'Отправить ссылку', fields: ['email'],                  tabs: false, google: false,
              hint: 'Укажите email, с которым регистрировались. Мы отправим ссылку для создания нового пароля.' },
  recovery: { title: 'Новый пароль',       submit: 'Сохранить пароль',   fields: ['password', 'password2'],  tabs: false, google: false,
              hint: `Придумайте новый пароль (минимум ${MIN_PASSWORD} символов).` }
};

function showMsg(text, kind = 'error') {
  const el = $('auth-msg');
  el.hidden = !text;
  el.textContent = text || '';
  el.className = 'auth__msg auth__msg--' + kind;
}

function setMode(next) {
  mode = next;
  const m = MODES[next];
  $('auth-title').textContent = m.title;
  $('auth-submit').textContent = m.submit;
  $('auth-hint').hidden = !m.hint;
  $('auth-hint').textContent = m.hint || '';
  $('auth-email').hidden = !m.fields.includes('email');
  $('auth-password').hidden = !m.fields.includes('password');
  $('auth-password2').hidden = !m.fields.includes('password2');
  $('auth-show').closest('label').hidden = !m.fields.includes('password');
  $('auth-tabs').hidden = !m.tabs;
  $('tab-login').classList.toggle('is-active', next === 'login');
  $('tab-signup').classList.toggle('is-active', next === 'signup');
  $('forgot-btn').hidden = next !== 'login';
  $('back-btn').hidden = next !== 'forgot';
  $('google-btn').hidden = !m.google;
  $('auth-divider').hidden = !m.google;
  $('auth-password').autocomplete = next === 'login' ? 'current-password' : 'new-password';
  $('auth-password').value = '';
  $('auth-password2').value = '';
  showMsg('');
}

function authError(err) {
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'Неверный email или пароль. Если забыли пароль — нажмите «Забыли пароль?».';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Email ещё не подтверждён. Проверьте почту (и папку «Спам») и перейдите по ссылке из письма.';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Этот email уже зарегистрирован. Войдите или восстановите пароль.';
  if (code === 'weak_password' || msg.includes('password should')) return `Пароль слишком простой. Минимум ${MIN_PASSWORD} символов.`;
  if (code === 'same_password' || msg.includes('different from the old')) return 'Новый пароль должен отличаться от старого.';
  if (err.status === 429 || code.includes('rate_limit') || msg.includes('rate limit') || msg.includes('too many')) return 'Слишком много попыток. Подождите минуту и повторите.';
  if (code === 'otp_expired' || msg.includes('expired')) return 'Ссылка устарела или уже использована. Запросите новую.';
  if (msg.includes('network') || msg.includes('failed to fetch')) return 'Нет соединения с сервером. Проверьте интернет.';
  return 'Ошибка: ' + err.message;
}

// Защита от спама кнопкой «Отправить ссылку»
function startCooldown(seconds = 60) {
  const btn = $('auth-submit');
  let left = seconds;
  btn.disabled = true;
  clearInterval(cooldownTimer);
  const tick = () => {
    if (mode !== 'forgot') { clearInterval(cooldownTimer); btn.disabled = false; return; }
    if (left <= 0) { clearInterval(cooldownTimer); btn.disabled = false; btn.textContent = MODES.forgot.submit; return; }
    btn.textContent = `Отправить ещё раз (${left})`;
    left -= 1;
  };
  tick();
  cooldownTimer = setInterval(tick, 1000);
}

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const password2 = $('auth-password2').value;
  const needs = MODES[mode].fields;

  if (needs.includes('email') && !/^\S+@\S+\.\S+$/.test(email)) return showMsg('Введите корректный email.');
  if (mode === 'login' && !password) return showMsg('Введите пароль.');
  if ((mode === 'signup' || mode === 'recovery') && password.length < MIN_PASSWORD) return showMsg(`Пароль должен быть не короче ${MIN_PASSWORD} символов.`);
  if (needs.includes('password2') && password !== password2) return showMsg('Пароли не совпадают.');

  const submit = $('auth-submit');
  submit.disabled = true;
  showMsg('');

  try {
    if (mode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // дальше сработает onAuthStateChange
    } else if (mode === 'signup') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: REDIRECT_URL } });
      if (error) throw error;
      // Если email уже занят, Supabase (с включённым подтверждением) не выдаёт ошибку, но identities пустой
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw { code: 'user_already_exists', message: 'User already registered' };
      }
      if (!data.session) {
        showMsg(`Мы отправили письмо на ${email}. Перейдите по ссылке в нём, чтобы подтвердить email, и затем войдите.`, 'ok');
        $('auth-password').value = '';
        $('auth-password2').value = '';
      }
    } else if (mode === 'forgot') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_URL });
      if (error) throw error;
      // Ответ одинаковый независимо от того, есть ли такой email — не раскрываем, кто зарегистрирован
      showMsg('Если аккаунт с таким email существует, мы отправили на него ссылку для сброса пароля. Проверьте почту и папку «Спам».', 'ok');
      startCooldown();
      return;
    } else if (mode === 'recovery') {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      recovering = false;
      history.replaceState(null, '', REDIRECT_URL);
      const { data } = await sb.auth.getSession();
      setMode('login');
      applySession(data.session);
      return;
    }
  } catch (err) {
    showMsg(authError(err));
  }
  submit.disabled = false;
});

document.querySelectorAll('.auth__tab').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('forgot-btn').addEventListener('click', () => {
  const email = $('auth-email').value;
  setMode('forgot');
  $('auth-email').value = email;
  $('auth-email').focus();
});
$('back-btn').addEventListener('click', () => { $('auth-submit').disabled = false; setMode('login'); });
$('google-btn').addEventListener('click', loginGoogle);
$('auth-show').addEventListener('change', (e) => {
  const type = e.target.checked ? 'text' : 'password';
  $('auth-password').type = type;
  $('auth-password2').type = type;
});

// Ссылка из письма могла устареть — Supabase кладёт ошибку в #hash
(function handleLinkError() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (!params.get('error')) return;
  history.replaceState(null, '', REDIRECT_URL);
  setMode('forgot');
  showMsg(authError({ code: params.get('error_code') || '', message: params.get('error_description') || '' }) + ' Запросите новую ссылку ниже.');
})();

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

sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    recovering = true;
    setMode('recovery');
  }
  applySession(session);
});

// --- Переключатель темы ---
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch (e) {}
  $('theme-btn').textContent = t === 'dark' ? '☀️' : '🌙';
}
$('theme-btn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
setTheme(document.documentElement.dataset.theme || 'light');

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
