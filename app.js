const SERVICES=[{id:'cut',name:'ตัดผม',description:'สระ · ตัด · เซ็ตทรง',price:250,duration:45,icon:'✂'},{id:'fade',name:'ตัดทรงเฟด',description:'ไล่เฟดเนียน คมทุกองศา',price:300,duration:60,icon:'◒'},{id:'beard',name:'ตัดแต่งหนวด',description:'เก็บรายละเอียดให้เข้าทรง',price:150,duration:30,icon:'✦'},{id:'wash',name:'สระและเซ็ต',description:'ผ่อนคลาย พร้อมจัดทรง',price:120,duration:30,icon:'◉'},{id:'combo',name:'ตัดผม + หนวด',description:'ครบจบในครั้งเดียว',price:350,duration:60,icon:'✂'},{id:'style',name:'ออกแบบทรงผม',description:'ปรึกษาช่างก่อนเริ่มตัด',price:400,duration:75,icon:'✧'}];
const BARBERS=[{id:'ton',name:'ช่างต้น'},{id:'max',name:'ช่างแม็กซ์'},{id:'bank',name:'ช่างแบงค์'}];
const STORAGE_KEY='tuddee-bookings-v1';
const $=s=>document.querySelector(s);
const form=$('#booking-form'),serviceSelect=$('#service-select'),barberSelect=$('#barber-select'),dateInput=$('#date-select'),timeSelect=$('#time-select'),timeSlots=$('#time-slots'),toast=$('#toast');
let toastTimer;
const money=n=>new Intl.NumberFormat('th-TH').format(n);
const localDate=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const today=localDate(new Date());
function getBookings(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch{return []}}
function saveBookings(items){localStorage.setItem(STORAGE_KEY,JSON.stringify(items))}
function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),3200)}
function init(){
  $('#year').textContent=new Date().getFullYear();dateInput.min=today;dateInput.value=today;
  $('#service-cards').innerHTML=SERVICES.slice(0,3).map(s=>`<article class="service-card"><div><span class="service-icon">${s.icon}</span><div><h3>${s.name}</h3><p>${s.description}</p></div></div><div class="service-price">฿${money(s.price)}<small>${s.duration} นาที</small></div></article>`).join('');
  serviceSelect.innerHTML='<option value="">เลือกบริการ</option>'+SERVICES.map(s=>`<option value="${s.id}">${s.name} — ฿${money(s.price)} (${s.duration} นาที)</option>`).join('');
  barberSelect.innerHTML='<option value="">เลือกช่าง</option>'+BARBERS.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
  serviceSelect.addEventListener('change',()=>{renderSlots();renderSummary()});barberSelect.addEventListener('change',renderSlots);dateInput.addEventListener('change',()=>{timeSelect.value='';renderSlots()});
  form.addEventListener('submit',submitBooking);$('#customer-bookings').addEventListener('click',handleCustomerAction);$('#refresh-bookings').addEventListener('click',renderCustomerBookings);
  $('#admin-open').addEventListener('click',openAdmin);$('#admin-close').addEventListener('click',()=>$('#admin-dialog').close());$('#admin-dialog').addEventListener('click',e=>{if(e.target===$('#admin-dialog'))$('#admin-dialog').close()});$('#admin-date').addEventListener('change',renderAdmin);$('#show-all').addEventListener('click',()=>{$('#admin-date').value='';renderAdmin()});$('#admin-bookings').addEventListener('click',handleAdminAction);
  renderSummary();renderSlots();renderCustomerBookings();
}
function selectedService(){return SERVICES.find(s=>s.id===serviceSelect.value)}
function renderSummary(){const s=selectedService();$('#booking-summary').innerHTML=s?`<span>${s.name} · ${s.duration} นาที</span><strong>฿${money(s.price)}</strong>`:'<span>เลือกบริการเพื่อดูสรุป</span>'}
function timeToMinutes(t){const [h,m]=t.split(':').map(Number);return h*60+m}
function overlaps(startA,durationA,startB,durationB){return startA<startB+durationB&&startB<startA+durationA}
function renderSlots(){
 const service=selectedService(),date=dateInput.value,barber=barberSelect.value;timeSelect.value='';
 if(!date||!barber||!service){timeSlots.innerHTML='<div class="empty-slots">เลือกบริการ ช่าง และวันที่ เพื่อดูเวลาว่าง</div>';$('#slot-hint').textContent='เลือกวันที่และช่างก่อน';return}
 const slots=[];for(let mins=600;mins+service.duration<=1200;mins+=30){const hh=String(Math.floor(mins/60)).padStart(2,'0'),mm=String(mins%60).padStart(2,'0');slots.push(`${hh}:${mm}`)}
 const bookings=getBookings().filter(b=>b.date===date&&b.barberId===barber&&b.status!=='cancelled');
 const available=slots.filter(t=>!bookings.some(b=>overlaps(timeToMinutes(t),service.duration,timeToMinutes(b.time),b.duration)));
 $('#slot-hint').textContent=`ว่าง ${available.length} เวลา`;
 timeSlots.innerHTML=slots.map(t=>{const busy=!available.includes(t);return `<button type="button" class="time-slot${busy?' busy':''}" data-time="${t}" ${busy?'disabled aria-label="'+t+' ไม่ว่าง"':'aria-pressed="false"'}>${t}</button>`}).join('')||'<div class="empty-slots">ไม่มีเวลาให้จองสำหรับบริการนี้</div>';
 timeSlots.querySelectorAll('.time-slot:not(:disabled)').forEach(button=>button.addEventListener('click',()=>{timeSlots.querySelectorAll('.time-slot').forEach(x=>{x.classList.remove('selected');x.setAttribute('aria-pressed','false')});button.classList.add('selected');button.setAttribute('aria-pressed','true');timeSelect.value=button.dataset.time}));
}
function submitBooking(event){event.preventDefault();const service=selectedService(),barber=BARBERS.find(b=>b.id===barberSelect.value),date=dateInput.value,time=timeSelect.value,name=$('#customer-name').value.trim(),phone=$('#customer-phone').value.trim();
 if(!service||!barber||!date||!time){showToast('กรุณาเลือกบริการ ช่าง วันที่ และเวลาที่ว่าง');return}
 if(date<today){showToast('ไม่สามารถจองวันที่ผ่านมาแล้วได้');return}
 if(!name||!phone){showToast('กรุณากรอกชื่อและเบอร์โทรศัพท์');return}
 const list=getBookings();if(list.some(b=>b.date===date&&b.barberId===barber.id&&b.status!=='cancelled'&&overlaps(timeToMinutes(time),service.duration,timeToMinutes(b.time),b.duration))){showToast('ขออภัย เวลานี้เพิ่งถูกจอง กรุณาเลือกเวลาอื่น');renderSlots();return}
 const booking={id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`,serviceId:service.id,serviceName:service.name,price:service.price,duration:service.duration,barberId:barber.id,barberName:barber.name,date,time,name,phone,note:$('#customer-note').value.trim(),status:'confirmed',createdAt:new Date().toISOString()};
 list.push(booking);saveBookings(list);form.reset();dateInput.value=today;timeSelect.value='';renderSummary();renderSlots();renderCustomerBookings();showToast(`จองคิวสำเร็จ! รหัสนัด ${booking.id.slice(0,8).toUpperCase()}`);$('#my-appointments').scrollIntoView({behavior:'smooth'});
}
function formatDate(date){return new Date(`${date}T00:00:00`).toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
function renderCustomerBookings(){const items=getBookings().filter(b=>b.status!=='cancelled').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));const el=$('#customer-bookings');if(!items.length){el.innerHTML='<div class="empty-state">ยังไม่มีรายการนัดในเบราว์เซอร์นี้ — จองคิวแรกของคุณได้เลย</div>';return}el.innerHTML=items.map(b=>`<article class="appointment-item"><div><h4>${escapeHtml(b.serviceName)} · ${escapeHtml(b.barberName)}</h4><p>${escapeHtml(b.name)} · ${escapeHtml(b.phone)} · รหัส ${b.id.slice(0,8).toUpperCase()}</p></div><div class="appointment-time">${escapeHtml(b.time)}<small>${formatDate(b.date)} · ฿${money(b.price)}</small></div><button class="cancel-button" data-cancel="${b.id}">ยกเลิกคิว</button></article>`).join('')}
function handleCustomerAction(e){const id=e.target.dataset.cancel;if(!id)return;if(!confirm('ยืนยันยกเลิกคิวนี้หรือไม่?'))return;saveBookings(getBookings().map(b=>b.id===id?{...b,status:'cancelled'}:b));renderCustomerBookings();renderSlots();showToast('ยกเลิกคิวเรียบร้อยแล้ว')}
function openAdmin(){const d=$('#admin-date');d.value=today;renderAdmin();$('#admin-dialog').showModal()}
function renderAdmin(){const filter=$('#admin-date').value;const all=getBookings().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));const active=all.filter(b=>b.status!=='cancelled');const todayItems=active.filter(b=>b.date===today);$('#admin-stats').innerHTML=`<div class="stat-card"><small>คิววันนี้</small><b>${todayItems.length}</b></div><div class="stat-card"><small>คิวทั้งหมด</small><b>${active.length}</b></div><div class="stat-card"><small>รายได้ที่จองไว้</small><b>฿${money(active.reduce((sum,b)=>sum+b.price,0))}</b></div>`;
 const visible=all.filter(b=>!filter||b.date===filter);$('#admin-bookings').innerHTML=visible.length?visible.map(b=>`<article class="admin-item"><div><h4>${escapeHtml(b.time)} · ${escapeHtml(b.name)} <span class="status ${b.status==='cancelled'?'cancelled':''}">${b.status==='cancelled'?'ยกเลิกแล้ว':'ยืนยันแล้ว'}</span></h4><p>${formatDate(b.date)} · ${escapeHtml(b.serviceName)} · ${escapeHtml(b.barberName)} · ฿${money(b.price)}<br>โทร ${escapeHtml(b.phone)}${b.note?` · หมายเหตุ: ${escapeHtml(b.note)}`:''}</p></div><div class="admin-actions"><button data-admin-cancel="${b.id}" ${b.status==='cancelled'?'disabled':''}>ยกเลิกคิว</button></div></article>`).join(''):'<div class="empty-state">ไม่มีคิวในวันที่เลือก</div>'}
function handleAdminAction(e){const id=e.target.dataset.adminCancel;if(!id)return;if(!confirm('ยืนยันยกเลิกคิวนี้หรือไม่?'))return;saveBookings(getBookings().map(b=>b.id===id?{...b,status:'cancelled'}:b));renderAdmin();renderCustomerBookings();renderSlots();showToast('อัปเดตสถานะคิวแล้ว')}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
init();
