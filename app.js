const SERVICES = [];
const BARBERS = [];
const $ = (selector) => document.querySelector(selector);
const supabaseClient = window.supabase?.createClient && window.TUDDEE_SUPABASE_URL && window.TUDDEE_SUPABASE_KEY
  ? window.supabase.createClient(window.TUDDEE_SUPABASE_URL, window.TUDDEE_SUPABASE_KEY)
  : null;
const form = $('#booking-form');
const serviceSelect = $('#service-select');
const barberSelect = $('#barber-select');
const dateInput = $('#date-select');
const timeSelect = $('#time-select');
const timeSlots = $('#time-slots');
const toast = $('#toast');
let currentUser = null;
let isAdmin = false;
let signupMode = false;
let toastTimer;
const money = (value) => new Intl.NumberFormat('th-TH').format(value);
const bangkokToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3800); }
function selectedService() { return SERVICES.find((service) => service.id === serviceSelect.value); }
function selectedBarber() { return BARBERS.find((barber) => barber.id === barberSelect.value); }
function minutes(time) { const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins; }
function overlaps(a, aDuration, b, bDuration) { return a < b + bDuration && b < a + aDuration; }
function formatDate(value) { return new Intl.DateTimeFormat('th-TH', { dateStyle:'medium', timeZone:'Asia/Bangkok' }).format(new Date(value)); }
function localDateLabel(value) { return new Intl.DateTimeFormat('th-TH', { weekday:'short', day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Bangkok' }).format(new Date(`${value}T00:00:00+07:00`)); }
function setOptions(select, placeholder, items, labelFor) { select.innerHTML = `<option value="">${placeholder}</option>` + items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(labelFor(item))}</option>`).join(''); }

async function loadCatalog() {
  if (!supabaseClient) throw new Error('Supabase config.js is missing');
  const [{ data: services, error: serviceError }, { data: barbers, error: barberError }] = await Promise.all([
    supabaseClient.from('services').select('id,name,description,price_thb,duration_minutes').eq('active', true).order('name'),
    supabaseClient.from('barbers').select('id,display_name').eq('active', true).order('display_name'),
  ]);
  if (serviceError) throw serviceError;
  if (barberError) throw barberError;
  SERVICES.splice(0, SERVICES.length, ...(services || []).map((s) => ({ ...s, price: s.price_thb, duration: s.duration_minutes, icon: '✂' })));
  BARBERS.splice(0, BARBERS.length, ...(barbers || []).map((b) => ({ id:b.id, name:b.display_name })));
  $('#service-cards').innerHTML = SERVICES.slice(0, 6).map((s) => `<article class="service-card"><div><span class="service-icon">${escapeHtml(s.icon)}</span><div><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.description)}</p></div></div><div class="service-price">฿${money(s.price)}<small>${s.duration} นาที</small></div></article>`).join('') || '<div class="empty-state">ยังไม่มีบริการที่เปิดให้จอง</div>';
  setOptions(serviceSelect, 'เลือกบริการ', SERVICES, (s) => `${s.name} — ฿${money(s.price)} (${s.duration} นาที)`);
  setOptions(barberSelect, 'เลือกช่าง', BARBERS, (b) => b.name);
  renderSummary();
}

function renderSummary() {
  const service = selectedService();
  $('#booking-summary').innerHTML = service ? `<span>${escapeHtml(service.name)} · ${service.duration} นาที</span><strong>฿${money(service.price)}</strong>` : '<span>เลือกบริการเพื่อดูสรุป</span>';
}

async function renderSlots() {
  const service = selectedService();
  const barber = selectedBarber();
  const date = dateInput.value;
  timeSelect.value = '';
  if (!service || !barber || !date) {
    timeSlots.innerHTML = '<div class="empty-slots">เลือกบริการ ช่าง และวันที่ เพื่อดูเวลาว่าง</div>';
    $('#slot-hint').textContent = 'เลือกวันที่และช่างก่อน';
    return;
  }
  timeSlots.innerHTML = '<div class="empty-slots">กำลังตรวจสอบคิว...</div>';
  const startOfDay = new Date(`${date}T00:00:00+07:00`).toISOString();
  const endOfDay = new Date(`${date}T23:59:59+07:00`).toISOString();
  const { data: booked, error } = await supabaseClient.rpc('get_booked_slots', { p_barber_id: barber.id, p_from: startOfDay, p_to: endOfDay });
  if (error) {
    timeSlots.innerHTML = '<div class="empty-slots">ยังโหลดคิวไม่ได้ กรุณารัน SQL migration สำหรับตรวจเวลาว่าง</div>';
    $('#slot-hint').textContent = 'ต้องตั้งค่า availability RPC';
    return;
  }
  const intervals = (booked || []).map((item) => ({ start: new Date(item.start_at).getTime(), end: new Date(item.end_at).getTime() }));
  const candidates = [];
  for (let mins = 600; mins + service.duration <= 1200; mins += 30) {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    const time = `${hh}:${mm}`;
    const start = new Date(`${date}T${time}:00+07:00`).getTime();
    const end = start + service.duration * 60000;
    const unavailable = start <= Date.now() || intervals.some((item) => start < item.end && item.start < end);
    candidates.push({ time, unavailable });
  }
  const availableCount = candidates.filter((slot) => !slot.unavailable).length;
  $('#slot-hint').textContent = `ว่าง ${availableCount} เวลา`;
  timeSlots.innerHTML = candidates.map(({ time, unavailable }) => `<button type="button" class="time-slot${unavailable ? ' busy' : ''}" data-time="${time}" ${unavailable ? 'disabled' : 'aria-pressed="false"'}>${time}</button>`).join('') || '<div class="empty-slots">ไม่มีเวลาให้จองสำหรับบริการนี้</div>';
  timeSlots.querySelectorAll('.time-slot:not(:disabled)').forEach((button) => button.addEventListener('click', () => {
    timeSlots.querySelectorAll('.time-slot').forEach((item) => { item.classList.remove('selected'); item.setAttribute('aria-pressed', 'false'); });
    button.classList.add('selected'); button.setAttribute('aria-pressed', 'true'); timeSelect.value = button.dataset.time;
  }));
}

async function loadCustomerBookings() {
  const list = $('#customer-bookings');
  if (!currentUser) { list.innerHTML = '<div class="empty-state">เข้าสู่ระบบเพื่อดูรายการนัดของคุณ</div>'; return; }
  const { data, error } = await supabaseClient.from('appointments')
    .select('id,customer_name,customer_phone,note,start_at,end_at,price_thb,status,services(name),barbers(display_name)')
    .order('start_at', { ascending: true });
  if (error) { list.innerHTML = '<div class="empty-state">โหลดรายการนัดไม่สำเร็จ</div>'; return; }
  const bookings = (data || []).filter((item) => item.status !== 'cancelled');
  if (!bookings.length) { list.innerHTML = '<div class="empty-state">ยังไม่มีรายการนัด — จองคิวแรกของคุณได้เลย</div>'; return; }
  list.innerHTML = bookings.map((b) => `<article class="appointment-item"><div><h4>${escapeHtml(b.services?.name)} · ${escapeHtml(b.barbers?.display_name)}</h4><p>${escapeHtml(b.customer_name)} · ${escapeHtml(b.customer_phone)} · รหัส ${b.id.slice(0, 8).toUpperCase()}</p></div><div class="appointment-time">${new Intl.DateTimeFormat('th-TH', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Bangkok' }).format(new Date(b.start_at))}<small>${formatDate(b.start_at)} · ฿${money(b.price_thb)}</small></div><button class="cancel-button" data-cancel="${b.id}">ยกเลิกคิว</button></article>`).join('');
}

async function submitBooking(event) {
  event.preventDefault();
  if (!currentUser) { showToast('กรุณาเข้าสู่ระบบก่อนจองคิว'); $('#auth-dialog').showModal(); return; }
  const service = selectedService(); const barber = selectedBarber(); const time = timeSelect.value;
  const name = $('#customer-name').value.trim(); const phone = $('#customer-phone').value.trim();
  if (!service || !barber || !dateInput.value || !time || !name || !phone) { showToast('กรุณากรอกข้อมูลและเลือกเวลาที่ว่างให้ครบ'); return; }
  const startAt = new Date(`${dateInput.value}T${time}:00+07:00`).toISOString();
  const button = form.querySelector('[type="submit"]'); button.disabled = true;
  const { error } = await supabaseClient.rpc('book_appointment', {
    p_service_id: service.id, p_barber_id: barber.id, p_start_at: startAt,
    p_customer_name: name, p_customer_phone: phone, p_note: $('#customer-note').value.trim(),
  });
  button.disabled = false;
  if (error) {
    const message = error.message.includes('SLOT_TAKEN') ? 'เวลานี้มีผู้จองแล้ว กรุณาเลือกเวลาใหม่' : error.message.includes('AUTH_REQUIRED') ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : 'จองไม่สำเร็จ กรุณาลองอีกครั้ง';
    showToast(message); await renderSlots(); return;
  }
  $('#customer-note').value = ''; timeSelect.value = '';
  showToast('จองคิวสำเร็จ!'); await Promise.all([renderSlots(), loadCustomerBookings()]);
  $('#my-appointments').scrollIntoView({ behavior:'smooth' });
}

async function cancelBooking(id) {
  if (!confirm('ยืนยันยกเลิกคิวนี้หรือไม่?')) return;
  const { error } = await supabaseClient.rpc('cancel_appointment', { p_appointment_id: id });
  if (error) { showToast('ยกเลิกไม่สำเร็จ กรุณาลองอีกครั้ง'); return; }
  showToast('ยกเลิกคิวเรียบร้อยแล้ว'); await Promise.all([loadCustomerBookings(), renderAdmin(), renderSlots()]);
}

async function refreshAuth(session) {
  currentUser = session?.user ?? null;
  isAdmin = false;
  if (currentUser) {
    const { data } = await supabaseClient.from('profiles').select('display_name,role').eq('id', currentUser.id).maybeSingle();
    isAdmin = data?.role === 'admin';
    $('#auth-open').textContent = data?.display_name || currentUser.email;
    $('#auth-open').title = currentUser.email;
    $('#auth-open').hidden = false;
    $('#signout').hidden = false;
    $('#admin-open').hidden = !isAdmin;
    if (!$('#customer-name').value && data?.display_name) $('#customer-name').value = data.display_name;
  } else {
    $('#auth-open').textContent = 'เข้าสู่ระบบ';
    $('#auth-open').title = '';
    $('#auth-open').hidden = false;
    $('#signout').hidden = true;
    $('#admin-open').hidden = true;
  }
  $('#booking-hint').textContent = currentUser ? `เข้าสู่ระบบเป็น ${currentUser.email} · ข้อมูลจัดเก็บใน Supabase` : 'ต้องเข้าสู่ระบบก่อนจองคิว · ข้อมูลจัดเก็บใน Supabase';
  await loadCustomerBookings();
}

function setSignupMode(enabled) {
  signupMode = enabled;
  $('#auth-title').textContent = enabled ? 'สร้างบัญชีลูกค้า' : 'เข้าสู่ระบบ';
  $('#auth-submit').textContent = enabled ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  $('#auth-name').hidden = !enabled;
  $('#auth-name-label').hidden = !enabled;
  $('#auth-name').required = enabled;
  $('#auth-password').autocomplete = enabled ? 'new-password' : 'current-password';
  $('#auth-switch').firstChild.textContent = enabled ? 'มีบัญชีแล้ว? ' : 'ยังไม่มีบัญชี? ';
  $('#auth-mode-toggle').textContent = enabled ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
}

async function submitAuth(event) {
  event.preventDefault();
  const email = $('#auth-email').value.trim(); const password = $('#auth-password').value;
  const button = $('#auth-submit'); button.disabled = true;
  let result;
  if (signupMode) {
    result = await supabaseClient.auth.signUp({ email, password, options: { data: { display_name: $('#auth-name').value.trim() } } });
  } else {
    result = await supabaseClient.auth.signInWithPassword({ email, password });
  }
  button.disabled = false;
  if (result.error) { showToast(result.error.message.includes('Invalid login') ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'ทำรายการไม่สำเร็จ กรุณาตรวจสอบข้อมูล'); return; }
  if (signupMode && !result.data.session) {
    $('#auth-dialog').close(); showToast('สมัครสำเร็จ กรุณายืนยันอีเมลจากกล่องจดหมายก่อนเข้าสู่ระบบ');
  } else {
    $('#auth-dialog').close(); $('#auth-form').reset(); showToast(signupMode ? 'สมัครและเข้าสู่ระบบสำเร็จ' : 'เข้าสู่ระบบสำเร็จ');
  }
}

async function renderAdmin() {
  if (!isAdmin) return;
  const { data, error } = await supabaseClient.from('appointments')
    .select('id,customer_name,customer_phone,note,start_at,end_at,price_thb,status,services(name),barbers(display_name)')
    .order('start_at', { ascending: true });
  if (error) { $('#admin-bookings').innerHTML = '<div class="empty-state">โหลดคิวไม่สำเร็จ</div>'; return; }
  const all = data || [];
  const active = all.filter((b) => b.status === 'confirmed');
  const today = bangkokToday();
  const todayItems = active.filter((b) => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Bangkok' }).format(new Date(b.start_at)) === today);
  $('#admin-stats').innerHTML = `<div class="stat-card"><small>คิววันนี้</small><b>${todayItems.length}</b></div><div class="stat-card"><small>คิวทั้งหมด</small><b>${active.length}</b></div><div class="stat-card"><small>รายได้ที่จองไว้</small><b>฿${money(active.reduce((sum, b) => sum + b.price_thb, 0))}</b></div>`;
  const filter = $('#admin-date').value;
  const visible = all.filter((b) => !filter || new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Bangkok' }).format(new Date(b.start_at)) === filter);
  $('#admin-bookings').innerHTML = visible.length ? visible.map((b) => {
    const time = new Intl.DateTimeFormat('th-TH', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Bangkok' }).format(new Date(b.start_at));
    const status = b.status === 'cancelled' ? 'ยกเลิกแล้ว' : b.status === 'completed' ? 'เสร็จแล้ว' : 'ยืนยันแล้ว';
    return `<article class="admin-item"><div><h4>${time} · ${escapeHtml(b.customer_name)} <span class="status ${b.status === 'cancelled' ? 'cancelled' : ''}">${status}</span></h4><p>${formatDate(b.start_at)} · ${escapeHtml(b.services?.name)} · ${escapeHtml(b.barbers?.display_name)} · ฿${money(b.price_thb)}<br>โทร ${escapeHtml(b.customer_phone)}${b.note ? ` · หมายเหตุ: ${escapeHtml(b.note)}` : ''}</p></div><div class="admin-actions"><button data-admin-cancel="${b.id}" ${b.status !== 'confirmed' ? 'disabled' : ''}>ยกเลิกคิว</button></div></article>`;
  }).join('') : '<div class="empty-state">ไม่มีคิวในวันที่เลือก</div>';
}

function init() {
  $('#year').textContent = new Date().getFullYear();
  dateInput.min = bangkokToday(); dateInput.value = bangkokToday();
  $('#service-cards').innerHTML = '<div class="empty-state">กำลังโหลดบริการ...</div>';
  form.addEventListener('submit', submitBooking);
  serviceSelect.addEventListener('change', () => { renderSummary(); renderSlots(); });
  barberSelect.addEventListener('change', renderSlots);
  dateInput.addEventListener('change', renderSlots);
  $('#customer-bookings').addEventListener('click', (event) => { const button = event.target.closest('[data-cancel]'); if (button) cancelBooking(button.dataset.cancel); });
  $('#refresh-bookings').addEventListener('click', loadCustomerBookings);
  $('#auth-open').addEventListener('click', () => currentUser ? showToast(`เข้าสู่ระบบเป็น ${currentUser.email}`) : $('#auth-dialog').showModal());
  $('#auth-close').addEventListener('click', () => $('#auth-dialog').close());
  $('#auth-form').addEventListener('submit', submitAuth);
  $('#auth-mode-toggle').addEventListener('click', () => setSignupMode(!signupMode));
  $('#signout').addEventListener('click', async () => { await supabaseClient.auth.signOut(); showToast('ออกจากระบบแล้ว'); });
  $('#admin-open').addEventListener('click', async () => { if (!isAdmin) return; $('#admin-date').value = bangkokToday(); await renderAdmin(); $('#admin-dialog').showModal(); });
  $('#admin-close').addEventListener('click', () => $('#admin-dialog').close());
  $('#admin-date').addEventListener('change', renderAdmin);
  $('#show-all').addEventListener('click', () => { $('#admin-date').value = ''; renderAdmin(); });
  $('#admin-bookings').addEventListener('click', (event) => { const button = event.target.closest('[data-admin-cancel]'); if (button) cancelBooking(button.dataset.adminCancel); });
  for (const dialog of [$('#admin-dialog'), $('#auth-dialog')]) dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  if (!supabaseClient) { showToast('ตั้งค่า Supabase ไม่ครบ'); return; }
  loadCatalog().then(renderSlots).catch((error) => { console.error(error); showToast('โหลดบริการไม่ได้ ตรวจสอบ Supabase SQL/RLS'); });
  supabaseClient.auth.getSession().then(({ data }) => refreshAuth(data.session));
  supabaseClient.auth.onAuthStateChange((_event, session) => { queueMicrotask(() => refreshAuth(session)); });
}
init();
