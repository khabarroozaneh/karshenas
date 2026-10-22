const KEY='wpjoo.expert.v2',VERSION='۱۴۰۵/۰۷/۳۰';
const $=s=>document.querySelector(s);
const fa=n=>String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
let vt=$('#versionTag');if(vt)vt.textContent='• نسخه '+VERSION;

/* ===== پایگاه داده =====
   leads:   لیدهای ورودی با اطلاعات کامل فنی (سرعت، افزونه‌ها، خطاها، تشخیص وردپرس)
   reports: گزارش‌های تماس کارشناس (هر لید ممکن است چند گزارش داشته باشد)
   meetings: گزارش‌های جلسه به ازای هر leadId
   draft:   تماس نیمه‌تمام برای بازیابی */
let db=JSON.parse(localStorage.getItem(KEY)||'{"leads":[],"reports":[],"meetings":[],"draft":null,"cursor":0,"duplicates":0}');
if(!Array.isArray(db.leads))db.leads=[];
if(!Array.isArray(db.reports))db.reports=[];
if(!Array.isArray(db.meetings))db.meetings=[];
if(!db.notified||typeof db.notified!=='object')db.notified={};
if(!Array.isArray(db.dismissed))db.dismissed=[];
if(typeof db.duplicates!=='number')db.duplicates=0;

function save(){localStorage.setItem(KEY,JSON.stringify(db));refresh()}
function go(id){document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));$('#'+id).classList.add('active');
  if(id==='work')renderWork();
  if(id==='appointmentsView')renderAppointments();
  if(id==='contracts')renderContracts();
  if(id==='calendar')renderCalendar();
  if(id==='reports')renderReports();
  refresh()}
document.addEventListener('click',e=>{let b=e.target.closest('[data-go]');if(b)go(b.dataset.go)});

/* ===== ابزارها ===== */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function norm(v=''){return v.toString().trim().toLowerCase().replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/^tel:/,'').replace(/\/$/,'').replace(/[\s().-]/g,'')}
function fingerprints(x){let u=norm(x.url||x.website||x.domain||x.link),p=norm(x.phone||x.mobile||x.tel),n=norm(x.name||x.title);return [...new Set([u&&'url:'+u,p&&'phone:'+p,n&&p&&'namephone:'+n+'|'+p].filter(Boolean))]}
function pick(x,keys){for(const k of keys){let v=String(x[k]??'').trim();if(v)return v}return ''}
function site(x){return x.url||x.website||x.domain||x.link||'بدون لینک'}
// آدرس سایت به‌صورت لینک نمایش داده می‌شود تا با کلیک، در مرورگر باز شود
function siteLink(x){let s=typeof x==='string'?x:site(x);if(!s||s==='بدون لینک'||s==='ثبت نشده')return esc(s);let u=/^https?:\/\//.test(s)?s:'https://'+s;return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(s)}</a>`}
function download(name,data){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
// نام فایل‌ها شمسی و قابل‌فهم است تا کاربر راحت‌تر آن‌ها را پیدا کند
function jdate(){let j=Jalali.fromDate(new Date());return Jalali.fa(Jalali.pad(j.jy))+'-'+Jalali.fa(Jalali.pad(j.jm))+'-'+Jalali.fa(Jalali.pad(j.jd))}
function fmt(v){let d=v instanceof Date?v:new Date(v);return Number.isNaN(d.getTime())?'ثبت نشده':Jalali.storageText(d,'ثبت نشده')}

/* ===== نمایش اطلاعات فنی سایت =====
   کارشناس پیش از تماس، اطلاعات کامل را می‌بیند:
   نمره و معیارهای سرعت، افزونه‌های نصب‌شده، مشکلات سایت به زبان ساده و شواهد وردپرس */
function siteIntel(lead){
  if(!lead||typeof lead!=='object')return'';
  let src={...(lead.leadSnapshot||{}),...lead};
  let plugins=Array.isArray(src.plugins)?src.plugins.filter(Boolean):[];
  let issues=Array.isArray(src.issues)?src.issues.filter(Boolean):[];
  let s=src.speed;
  let facts=Array.isArray(src.wordpressFacts)?src.wordpressFacts.filter(Boolean):[];
  if(!plugins.length&&!issues.length&&!s&&!facts.length)return'';
  let out='';
  if(s&&s.score!=null){
    // معیارهای اصلی در یک نگاه: نمره + LCP + FCP + TTFB
    let bits=[`نمره ${fa(s.score)} از ۱۰۰ (${esc(s.grade||'نامشخص')})`];
    // دقت تست: میانهٔ چند اجرا (مثل گوگل PageSpeed)
    let runs=Number(s.runs)||1;
    if(runs>1)bits.unshift(`میانهٔ ${fa(runs)} اجرا`);
    [['lcp','بارگذاری اصلی'],['fcp','اولین محتوا'],['ttfb','پاسخ سرور']].forEach(([k,lbl])=>{
      if(s[k]!=null)bits.push(`${lbl}: ${fa(Math.round(s[k]))} میلی‌ثانیه`);
    });
    if(s.tbt!=null)bits.push(`قفل صفحه: ${fa(Math.round(s.tbt))} میلی‌ثانیه`);
    out+=`<div class="line"><b>سرعت سایت:</b> ${bits.join(' • ')}</div>`;
  }
  if(plugins.length){
    out+=`<div class="line"><b>افزونه‌های نصب‌شده:</b> ${plugins.map(p=>`<span class="chip">${esc(p)}</span>`).join('')}</div>`;
  }
  if(issues.length){
    out+=`<div class="site-intel"><b>مشکلات سایت (به زبان ساده — برای ارائه به مشتری):</b><ul>${issues.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div>`;
  }
  if(facts.length){
    out+=`<div class="site-intel"><b>شواهد وردپرس:</b><ul>${facts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></div>`;
  }
  return out;
}

/* ===== منطق وضعیت‌ها ===== */
// وضعیت‌های پایانی: با این نتایج، پروندهٔ تماس آن لید کامل می‌شود
const TERMINAL=['قرارداد بسته شد (در همین تماس)','انصراف و عدم تمایل مشتری','اشتباه بودن شماره','سایت نداشتند','رد شد'];
const CONTRACT_CALL='قرارداد بسته شد (در همین تماس)';   // بستن قرارداد در همان تماس اول
const CONTRACT_MEETING='جلسه برگزار شد و قرارداد بسته شد'; // بستن قرارداد در جلسه
const MEETING_SET='قرار جلسه با کارشناس';
const NO_SITE='سایت نداشتند';

function leadById(id){return db.leads.find(l=>l.id===id)}
function latestReports(){let m=new Map();db.reports.forEach(r=>m.set(r.leadId,r));return m}
function meetingFor(id){return db.meetings.find(m=>m.leadId===id)}
function reportLead(r){return leadById(r.leadId)||r.lead||{}}
// آخرین وضعیت هر لید؛ «قرار جلسه» تا پیش از گزارش جلسه فعال می‌ماند
function leadState(id){
  let r=latestReports().get(id);
  if(!r)return null;
  if(r.status===MEETING_SET){
    let m=meetingFor(id);
    if(m&&m.status===CONTRACT_MEETING)return{status:'قرارداد بسته شد (در جلسه)',report:r,meeting:m};
    if(m)return{status:'جلسه گزارش‌شده: '+m.status,report:r,meeting:m};
    return{status:MEETING_SET,report:r};
  }
  return{status:r.status,report:r};
}
function isDone(id){let s=leadState(id);return s&&(TERMINAL.includes(s.status)||s.status==='قرارداد بسته شد (در جلسه)')}
// قرارهای جلسهٔ فعال: آخرین گزارش «قرار جلسه» است و هنوز قرارداد بسته نشده
function appointments(){
  return db.leads.filter(l=>{
    let s=leadState(l.id);
    return s&&(s.status===MEETING_SET||s.status.startsWith('جلسه گزارش‌شده'));
  }).map(l=>({lead:l,state:leadState(l.id),followUp:leadState(l.id).report.followUp}))
    .filter(a=>a.followUp&&!Number.isNaN(new Date(a.followUp).getTime()))
    .sort((x,y)=>new Date(x.followUp)-new Date(y.followUp));
}
// قراردادهای بسته‌شده: در تماس اول یا در جلسه
function contracts(){
  return db.leads.filter(l=>{
    let s=leadState(l.id);
    return s&&(s.status===CONTRACT_CALL||s.status==='قرارداد بسته شد (در جلسه)');
  }).sort((x,y)=>{
    let da=new Date((leadState(y.id).meeting||leadState(y.id).report).createdAt||0);
    let db2=new Date((leadState(x.id).meeting||leadState(x.id).report).createdAt||0);
    return da-db2;
  });
}
// پیگیری‌های زمان‌بندی‌شدهٔ فعال
function scheduledFollowUps(){
  return db.leads.filter(l=>{
    let s=leadState(l.id);
    return s&&!isDone(l.id)&&s.report.scheduledFollowUp&&s.report.followUp&&!Number.isNaN(new Date(s.report.followUp).getTime());
  }).map(l=>({lead:l,report:leadState(l.id).report}))
    .sort((x,y)=>new Date(x.report.followUp)-new Date(y.report.followUp));
}

/* ===== صفحه اصلی و آمار ===== */
function refresh(){
  let pending=db.leads.filter(l=>!isDone(l.id)&&!leadState(l.id)?.report?.scheduledFollowUp).length;
  let appts=appointments();
  let now=Date.now();
  let soon=appts.filter(a=>{let x=new Date(a.followUp)-now;return x>=0&&x<=86400000});
  let over=appts.filter(a=>new Date(a.followUp)<now);
  $('#pendingCount').textContent=fa(pending);
  $('#apptCount').textContent=fa(appts.length);
  $('#apptBadge').textContent=fa(appts.length);
  $('#contractStat').textContent=fa(contracts().length);
  $('#reportStat').textContent=fa(db.reports.length);
  $('#contractCount').textContent=fa(contracts().length);
  let due=scheduledFollowUps().filter(f=>new Date(f.report.followUp)<=now).length;
  $('#calBadge').textContent=due?fa(due)+' سررسیدشده':'';
  let al=$('#alertBox');
  let msgs=[];
  if(soon.length)msgs.push(`${fa(soon.length)} قرار جلسه تا ۲۴ ساعت آینده`);
  if(over.length)msgs.push(`${fa(over.length)} قرار جلسه گذشته`);
  if(due)msgs.push(`${fa(due)} تماس پیگیری سررسیدشده`);
  if(msgs.length){al.className=over.length||due?'alert urgent':'alert';al.textContent='هشدار: '+msgs.join('؛ ')}
  else{al.className='alert hidden'}
}

/* ===== ورود لید =====
   لیدها مستقیماً به پنل کارشناس می‌آیند — از فایل JSON یا فید خودکار خط لوله.
   داده‌های کامل هر لید (افزونه‌ها، سرعت، مشکلات، شواهد وردپرس) دست‌نخورده باقی می‌ماند. */
function importLeads(arr,fname){
  if(!Array.isArray(arr))throw Error('فرمت آرایه‌ای یا کلید leads/data/items لازم است');
  let old=new Set(db.leads.flatMap(fingerprints)),added=0,dup=0,rejected=0;
  arr.forEach(x=>{
    if(!x||typeof x!=='object')return;
    if(!pick(x,['ownerName','owner'])||!pick(x,['name','title'])||!pick(x,['url','website','domain','link'])||!pick(x,['phone','mobile','tel'])){rejected++;return}
    let keys=fingerprints(x),duplicate=!keys.length||keys.some(k=>old.has(k));
    if(duplicate){dup++;return}
    keys.forEach(k=>old.add(k));
    db.leads.push({...x,id:crypto.randomUUID(),sourceFile:fname,importedAt:new Date().toISOString()});
    added++
  });
  db.duplicates+=dup;
  save();
  return{added,dup,rejected}
}
function showImportResult(out,res){out.style.background='#e9f7ed';out.textContent=`${fa(res.added)} لید اضافه شد؛ ${fa(res.dup)} مورد تکراری مهار شد؛ ${fa(res.rejected)} لید ناقص رد شد؛ داده‌های قبلی حفظ شدند.`}
$('#jsonFile').addEventListener('change',async e=>{
  let f=e.target.files[0];if(!f)return;let out=$('#importResult');
  try{
    let raw=JSON.parse(await f.text()),arr=Array.isArray(raw)?raw:(raw.leads||raw.data||raw.items||[]);
    showImportResult(out,importLeads(arr,f.name))
  }catch(err){out.style.background='#ffe7e7';out.textContent='خطا: '+err.message}
});
// مسیر فید خروجی خط لوله (نسبی به ریشهٔ پروژه که با http.server سرو می‌شود)
const FEED_URLS=['../RAVAND/PIPELINE/OUTPUT/secretary_feed.json','./secretary_feed.json'];
// بارگذاری خودکار جدیدترین فید تولیدشده توسط خط لوله — بدون انتخاب دستی فایل
$('#loadFeed').onclick=async()=>{
  let out=$('#importResult');
  let btn=$('#loadFeed'),oldText=btn.textContent;
  btn.disabled=true;btn.textContent='در حال دریافت فید تازه …';
  try{
    let raw=null,errs=[];
    for(let u of FEED_URLS){
      try{let r=await fetch(u,{cache:'no-store'});if(r.ok){raw=await r.json();break}}catch(err){errs.push(err.message)}
    }
    if(raw===null)throw Error('فید پیدا نشد. خط لوله را اجرا کنید یا فایل را دستی انتخاب کنید. '+errs.join(' | '));
    let arr=Array.isArray(raw)?raw:(raw.leads||raw.data||raw.items||[]);
    showImportResult(out,importLeads(arr,'خط‌لوله/secretary_feed.json'));
  }catch(err){out.style.background='#ffe7e7';out.textContent='خطا: '+err.message}
  finally{btn.disabled=false;btn.textContent=oldText}
};
$('#loadSample').onclick=()=>$('#jsonPreview').textContent=JSON.stringify([{ownerName:'نام صاحب سایت',name:'نام کسب‌وکار',url:'https://example.com',phone:'09120000000'}],null,2);
// پاک‌کردن فقط لیدهای ورودی — گزارش‌ها، قرارها و قراردادها حفظ می‌شوند
$('#clearLeads').onclick=()=>{
  if(!confirm('لیدهای ورودی پاک شوند؟ گزارش‌ها، قرارها و قراردادها حفظ می‌شوند.'))return;
  if(!confirm('تأیید نهایی: همه لیدهای ورودی برای همیشه حذف می‌شوند. مطمئن هستید؟'))return;
  db.leads=[];db.cursor=0;db.draft=null;db.duplicates=0;save();
  let out=$('#importResult');out.style.background='#e9f7ed';out.textContent='لیدهای ورودی پاک شد؛ گزارش‌ها و قراردادها حفظ شدند.'
};

/* ===== صفحه تماس ===== */
// لید بعدی برای تماس: ابتدا پیش‌نویس نیمه‌تمام، بعد پیگیری‌های سررسیدشده، بعد لیدهای تازه
function next(){
  if(db.draft){let i=db.leads.findIndex(l=>l.id===db.draft.leadId);if(i>=0)return i}
  let due=scheduledFollowUps().filter(f=>new Date(f.report.followUp)<=Date.now());
  if(due.length){let i=db.leads.findIndex(l=>l.id===due[0].lead.id);if(i>=0)return i}
  for(let o=0;o<db.leads.length;o++){
    let i=(db.cursor+o)%db.leads.length,l=db.leads[i];
    if(!isDone(l.id)&&!latestReports().get(l.id)?.scheduledFollowUp)return i;
  }
  return -1
}
function renderWork(){
  let i=next(),card=$('#leadCard'),form=$('#reportForm');
  if(i<0){card.innerHTML='<div class="notice">تماس آماده‌ای ندارید؛ تقویم پیگیری‌ها را بررسی کنید یا لید جدید وارد کنید.</div>';form.classList.add('hidden');return}
  db.cursor=i;let x=db.leads[i];form.reset();
  $('#resumeHint').classList.add('hidden');
  if(!db.draft){db.draft={leadId:x.id};localStorage.setItem(KEY,JSON.stringify(db))}
  card.innerHTML=`<div class="lead"><strong>لید ${fa(i+1)} از ${fa(db.leads.length)}</strong>
    <div class="row"><b>نام صاحب سایت:</b> ${esc(x.ownerName||x.owner||'ثبت نشده')}</div>
    <div class="row"><b>نام کسب‌وکار:</b> ${esc(x.name||x.title||'ثبت نشده')}</div>
    <div class="row"><b>سایت:</b> ${siteLink(x)}</div>
    <div class="row"><b>تلفن:</b> ${esc(x.phone||x.mobile||x.tel||'ثبت نشده')}</div>
    ${siteIntel(x)}
    <a class="primary" style="display:block;text-align:center;margin-top:12px;text-decoration:none;border-radius:10px;padding:10px" href="tel:${encodeURIComponent(x.phone||x.mobile||x.tel||'')}">تماس با لید</a></div>`;
  form.classList.remove('hidden');
  if(db.draft&&db.draft.leadId===x.id){
    $('#status').value=db.draft.status||'';
    $('#notes').value=db.draft.notes||'';
    $('#followUp').value=db.draft.followUp||'';
    $('#contactName').value=db.draft.contactName||'';
    $('#resumeHint').textContent='گزارش نیمه‌تمام این لید بازیابی شد.';
    $('#resumeHint').classList.remove('hidden');
  }
  updateFollowUpLabel();syncFollowUpText();
}
function needsDate(){let s=$('#status').value;return s===CONTRACT_CALL||s===MEETING_SET}
function updateFollowUpLabel(){
  let s=$('#status').value;
  $('#followUpText').required=needsDate();
  $('#followUpLabel').textContent=s===MEETING_SET?'تاریخ و ساعت جلسه (اجباری)':s===CONTRACT_CALL?'تاریخ قرارداد (اجباری)':'زمان پیگیری/جلسه (در صورت وجود)';
}
function persistDraft(){
  let i=next();if(i<0)return;
  db.draft={leadId:db.leads[i].id,status:$('#status').value,notes:$('#notes').value,followUp:$('#followUp').value,contactName:$('#contactName').value};
  localStorage.setItem(KEY,JSON.stringify(db));
}
$('#status').addEventListener('change',updateFollowUpLabel);
$('#reportForm').addEventListener('input',persistDraft);
$('#reportForm').addEventListener('change',persistDraft);
$('#reportForm').addEventListener('submit',e=>{
  e.preventDefault();
  let i=next();if(i<0)return;
  let lead=db.leads[i],status=$('#status').value,notes=$('#notes').value.trim(),
      followUp=$('#followUp').value,contactName=$('#contactName').value.trim(),
      stamp=new Date(followUp).getTime();
  if(!status||notes.length<3||!contactName){alert('نتیجه تماس، توضیحات (حداقل ۳ حرف) و نام پاسخ‌دهنده اجباری است.');return}
  if(needsDate()&&(!followUp||!Number.isFinite(stamp))){$('#followUpText').classList.add('invalid');alert('تاریخ و ساعت را صریحاً وارد کنید.');return}
  // پیگیری اختیاری برای وضعیت‌های غیرپایانی: اگر تاریخ داده شده باید معتبر و در آینده باشد
  let isFinal=TERMINAL.includes(status);
  let scheduled=!isFinal&&followUp&&Number.isFinite(stamp);
  if(scheduled&&stamp<=Date.now()){alert('زمان تماس مجدد باید در آینده باشد.');return}
  db.reports.push({id:crypto.randomUUID(),leadId:lead.id,lead,status,notes,followUp,contactName,scheduledFollowUp:!!scheduled,createdAt:new Date().toISOString()});
  db.draft=null;db.cursor=i+1;save();
  e.target.reset();updateFollowUpLabel();
  go('home');
});

/* ===== قرارهای جلسه ===== */
let apptFilter='all';
document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');apptFilter=b.dataset.filter;renderAppointments();
});
function apptType(a){let x=new Date(a.followUp)-Date.now();return x<0?'overdue':x<=86400000?'soon':'future'}
function ago(v){let d=new Date(v),x=d-Date.now(),m=Math.floor(Math.abs(x)/60000),h=Math.floor(m/60);return x>=0?`${fa(h)} ساعت و ${fa(m%60)} دقیقه مانده`:`${fa(h)} ساعت و ${fa(m%60)} دقیقه گذشته`}
function renderAppointments(){
  let list=appointments(),now=Date.now();
  $('#soonCount').textContent=fa(list.filter(a=>apptType(a)==='soon').length);
  $('#overdueCount').textContent=fa(list.filter(a=>apptType(a)==='overdue').length);
  let show=apptFilter==='soon'?list.filter(a=>apptType(a)==='soon')
    :apptFilter==='overdue'?list.filter(a=>apptType(a)==='overdue')
    :apptFilter==='met'?list.filter(a=>a.state.meeting)
    :apptFilter==='unmet'?list.filter(a=>!a.state.meeting)
    :list;
  $('#appointmentList').innerHTML=show.length?
    show.map(a=>{
      let t=apptType(a),l=a.lead,m=a.state.meeting;
      return `<article class="appointment ${t}" data-lid="${esc(l.id)}">
        <h3>${esc(l.ownerName||l.owner||'نام صاحب سایت ثبت نشده')}</h3>
        <span class="badge">${t==='soon'?'تا ۲۴ ساعت آینده':t==='overdue'?'گذشته':'آینده'}</span>
        ${siteIntel(l)}
        <div class="line time-line" data-followup="${esc(a.followUp)}"><b>زمان قرار:</b> ${fmt(a.followUp)} — ${ago(a.followUp)}</div>
        <div class="line"><b>سایت:</b> ${siteLink(l)}</div>
        <div class="line"><b>تلفن:</b> ${esc(l.phone||l.mobile||l.tel||'ثبت نشده')}</div>
        <div class="line"><b>توضیحات تماس:</b> ${esc(a.state.report.notes||'')}</div>
        <div class="line"><b>نام پاسخ‌دهنده:</b> ${esc(a.state.report.contactName||'ثبت نشده')}</div>
        ${m?`<div class="report-box"><b>گزارش جلسه:</b><br>${esc(m.status)}<br>${esc(m.notes||'')}<br><small>${fmt(m.at)}</small></div>`:''}
        <button type="button" class="reportBtn" data-meeting="${esc(l.id)}">${m?'ویرایش گزارش جلسه':'ثبت گزارش جلسه'}</button>
      </article>`;
    }).join('')
    :'<div class="result">برای این فیلتر قراری وجود ندارد.</div>';
}
// به‌روزرسانی درجای «مانده/گذشته» بدون بازنویسی کل لیست (اسکرول و فیلتر حفظ می‌شود)
function refreshApptTimes(){
  document.querySelectorAll('#appointmentList .time-line[data-followup]').forEach(el=>{
    el.innerHTML=`<b>زمان قرار:</b> ${fmt(el.dataset.followup)} — ${ago(el.dataset.followup)}`;
  });
}

/* ===== ثبت/ویرایش گزارش جلسه ===== */
let meetingLeadId=null;
document.addEventListener('click',e=>{
  let b=e.target.closest('[data-meeting]');
  if(!b)return;
  meetingLeadId=b.dataset.meeting;
  let l=leadById(meetingLeadId);if(!l)return;
  let s=leadState(meetingLeadId);
  $('#meetingCard').innerHTML=`<h3>${esc(l.ownerName||l.owner||'نام صاحب سایت ثبت نشده')}</h3>${siteIntel(l)}
    <div class="line"><b>زمان قرار:</b> ${fmt(s?.report?.followUp)}</div>
    <div class="line"><b>سایت:</b> ${siteLink(l)}</div>
    <div class="line"><b>تلفن:</b> ${esc(l.phone||l.mobile||l.tel||'ثبت نشده')}</div>`;
  let old=meetingFor(meetingLeadId);
  $('#meetingStatus').value=old?old.status:'';
  $('#meetingNotes').value=old?old.notes:'';
  let d=old&&old.at?new Date(old.at):new Date();
  let p=n=>String(n).padStart(2,'0');
  $('#meetingAt').value=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  $('#meetingSaved').textContent='';
  go('meetingView');
});
$('#meetingForm').addEventListener('submit',e=>{
  e.preventDefault();
  if(!meetingLeadId)return;
  let status=$('#meetingStatus').value,notes=$('#meetingNotes').value.trim(),at=$('#meetingAt').value;
  if(!status||notes.length<3){alert('نتیجه جلسه و توضیحات (حداقل ۳ حرف) اجباری است.');return}
  let rec={leadId:meetingLeadId,status,notes,at:new Date(at).toISOString(),updatedAt:new Date().toISOString()};
  let i=db.meetings.findIndex(m=>m.leadId===meetingLeadId);
  if(i>=0)db.meetings[i]=rec;else db.meetings.push(rec);
  save();
  $('#meetingForm').reset();
  $('#meetingSaved').textContent='گزارش جلسه ذخیره شد و روی دستگاه نگه داشته شد.';
  go('appointmentsView');
});

/* ===== قراردادها ===== */
function renderContracts(){
  let list=contracts();
  $('#contractList').innerHTML=list.length?
    list.map(l=>{
      let s=leadState(l.id),m=s.meeting,r=s.report;
      let src=m?m:r;
      return `<article class="appointment reported">
        <h3>${esc(l.ownerName||l.owner||'نام صاحب سایت ثبت نشده')}</h3>
        ${siteIntel(l)}
        <div class="line"><b>نحوهٔ بستن:</b> ${m?'در جلسه':'در همان تماس اول'}</div>
        <div class="line"><b>زمان:</b> ${fmt(src.at||src.createdAt)}</div>
        <div class="line"><b>سایت:</b> ${siteLink(l)}</div>
        <div class="line"><b>تلفن:</b> ${esc(l.phone||l.mobile||l.tel||'ثبت نشده')}</div>
        <div class="report-box"><b>قرارداد بسته شد</b><br>${esc(src.notes||'')}<br><small>${fmt(src.at||src.createdAt)}</small></div>
      </article>`;
    }).join('')
    :'<div class="result">هنوز قراردادی بسته نشده است.</div>';
}

/* ===== تقویم پیگیری تماس‌ها (شمسی) ===== */
let calView={jy:null,jm:null,day:null};
function moveMonth(step){if(calView.jy==null)return;let y=calView.jy,m=calView.jm+step;if(m<1){m=12;y--}if(m>12){m=1;y++}if(!Jalali.isValid(y,m,1))return;calView.jy=y;calView.jm=m;calView.day=null;renderCalendar()}
function goToday(){let t=Jalali.fromDate(new Date());calView.jy=t.jy;calView.jm=t.jm;calView.day=null;renderCalendar()}
$('#calPrev').onclick=()=>moveMonth(-1);$('#calNext').onclick=()=>moveMonth(1);$('#calToday').onclick=goToday;$('#calAll').onclick=()=>{calView.day=null;renderCalendar()};
document.addEventListener('click',e=>{let c=e.target.closest('.cal-day');if(!c||!c.dataset.day)return;calView.day=calView.day===c.dataset.day?null:c.dataset.day;renderCalendar()});
function renderCalendar(){
  let items=scheduledFollowUps(),now=Date.now();
  let today=Jalali.fromDate(new Date());
  if(calView.jy==null){calView.jy=today.jy;calView.jm=today.jm}
  let g=Jalali.toGregorian(calView.jy,calView.jm,1),first=new Date(g.gy,g.gm-1,g.gd),
      offset=Jalali.weekdayIndex(first),len=Jalali.monthLength(calView.jy,calView.jm),todayKey=Jalali.dateKey(new Date());
  $('#calTitle').textContent=Jalali.MONTHS[calView.jm-1]+' '+Jalali.fa(calView.jy);
  $('#calWeek').innerHTML=Jalali.WEEK_SHORT.map(d=>'<span>'+d+'</span>').join('');
  let byDay=new Map();
  items.forEach(f=>{let d=new Date(f.report.followUp);if(Number.isNaN(d))return;let k=Jalali.dateKey(d);if(!byDay.has(k))byDay.set(k,[]);byDay.get(k).push(f)});
  let cells='';
  for(let i=0;i<offset;i++)cells+='<div class="cal-blank"></div>';
  for(let day=1;day<=len;day++){
    let key=Jalali.dateKey(new Date(first.getFullYear(),first.getMonth(),first.getDate()+day-1)),lst=byDay.get(key)||[],
        overdue=lst.some(f=>new Date(f.report.followUp)<=now),soon=!overdue&&lst.some(f=>new Date(f.report.followUp)-now<=86400000);
    cells+='<div class="cal-day'+(lst.length?' has':'')+(overdue?' overdue':'')+(soon?' soon':'')+(key===todayKey?' today':'')+(calView.day===key?' sel':'')+'"'+(lst.length?' data-day="'+key+'"':'')+'><span class="n">'+Jalali.fa(day)+'</span>'+(lst.length?'<i>'+Jalali.fa(lst.length)+'</i>':'')+'</div>';
  }
  $('#calGrid').innerHTML=cells;
  $('#calAll').classList.toggle('hidden',!calView.day);
  let shown=calView.day?items.filter(f=>{let d=new Date(f.report.followUp);return Jalali.dateKey(d)===calView.day}):items;
  let dayDate=calView.day?new Date(calView.day+'T00:00:00'):null;
  // calView.day به‌صورت کلید ISO است؛ برای عنوان از Jalali استفاده می‌کنیم
  let head='<div class="cal-head">'+(calView.day?('پیگیری‌های انتخاب‌شده'):'همه پیگیری‌ها (به ترتیب سررسید)')+'</div>';
  $('#calendarList').innerHTML=head+(shown.length?shown.map(f=>{
    let remaining=new Date(f.report.followUp).getTime()-now,
        state=remaining<=0?'عقب‌افتاده / سررسیدشده':remaining<=86400000?'کمتر از ۲۴ ساعت تا تماس':'پیگیری آینده',
        l=f.lead;
    return '<div class="report '+(remaining<=0?'followup-overdue':remaining<=86400000?'followup-soon':'')+'"><b>'+esc(l.ownerName||l.owner||'')+'</b><br>'+siteLink(l)+'<br>'+esc(l.phone||l.mobile||l.tel||'')+'<br>'+fmt(f.report.followUp)+'<br>'+state+'<br>'+esc(f.report.status)+' — '+esc(f.report.notes)+(remaining<=0?'<br><button type="button" data-followup="'+esc(l.id)+'">شروع پیگیری</button>':'')+'</div>';
  }).join(''):'<div class="notice">'+(calView.day?'در این روز پیگیری‌ای ثبت نشده است.':'پیگیری زمان‌بندی‌شده‌ای ندارید.')+'</div>');
}
document.addEventListener('click',e=>{
  let b=e.target.closest('[data-followup]');if(!b)return;
  if(db.draft&&db.draft.leadId!==b.dataset.followup){alert('ابتدا تماس نیمه‌تمام فعلی را تکمیل کنید.');go('work');return}
  db.draft={leadId:b.dataset.followup};localStorage.setItem(KEY,JSON.stringify(db));go('work');
});

/* ===== گزارش‌ها و خروجی ===== */
function renderReports(){
  let b=$('#reportList');
  b.innerHTML=db.reports.length?db.reports.slice().reverse().map(r=>{
    let l=reportLead(r),m=meetingFor(r.leadId);
    return `<div class="report"><b>نام صاحب سایت:</b> ${esc(l.ownerName||l.owner||'بدون نام')}<br>
      <b>سایت:</b> ${siteLink(l)}<br>
      <b>نتیجه تماس:</b> ${esc(r.status)}<br>
      <b>توضیحات:</b> ${esc(r.notes)}<br>
      <b>زمان جلسه/پیگیری:</b> ${esc(fmt(r.followUp))}<br>
      <b>زمان ثبت گزارش:</b> ${esc(fmt(r.createdAt))}<br>
      <b>نام پاسخ‌دهنده:</b> ${esc(r.contactName||'ثبت نشده')}
      ${m?`<br><b>گزارش جلسه:</b> ${esc(m.status)} — ${esc(m.notes||'')}`:''}</div>`;
  }).join(''):'<div class="notice">هنوز گزارشی ثبت نشده است.</div>';
}
$('#exportReports').onclick=()=>{
  if(!db.reports.length){alert('هنوز گزارشی ثبت نشده است.');return}
  // خروجی خود-حاوی: هر ردیف یک گزارش تماس + لید کامل (سرعت/افزونه‌ها/مشکلات) + گزارش جلسه در صورت وجود
  let rows=db.reports.map(r=>{
    let l=reportLead(r),m=meetingFor(r.leadId);
    return {...r,lead:l,meeting:m||null};
  });
  download('گزارش‌های-کارشناس-'+jdate()+'.json',rows);
};
$('#exportNoWebsite').onclick=()=>{
  // لیدهایی که آخرین گزارششان «سایت نداشتند» است، با مشخصات کامل
  let rows=db.leads.filter(l=>leadState(l.id)?.status===NO_SITE).map(l=>{
    let r=leadState(l.id).report;
    return{نام_صاحب_سایت:l.ownerName||l.owner||'',نام_کسب_و_کار:l.name||l.title||'',سایت:site(l),تلفن:l.phone||l.mobile||l.tel||'',توضیحات_تماس:r.notes||'',نام_پاسخ‌دهنده:r.contactName||'',زمان_ثبت_گزارش:fmt(r.createdAt)};
  });
  if(!rows.length){alert('هیچ لیدی با وضعیت «سایت نداشتند» ثبت نشده است.');return}
  download('لیدهای-بدون-سایت-'+jdate()+'.json',rows);
};
$('#exportAll').onclick=()=>download('پشتیبان-کامل-پنل-کارشناس-'+jdate()+'.json',db);
$('#clearReports').onclick=()=>{
  if(!confirm('گزارش‌های تماس پاک شوند؟ لیدها حفظ می‌شوند ولی قرارها و قراردادها از بین می‌روند.'))return;
  if(!confirm('تأیید نهایی: همه گزارش‌ها برای همیشه حذف می‌شوند. مطمئن هستید؟'))return;
  db.reports=[];db.meetings=[];db.cursor=0;db.draft=null;db.notified={};db.dismissed=[];save();renderReports();
};
$('#clearData').onclick=()=>{
  if(!confirm('همه اطلاعات پنل کارشناس پاک شود؟'))return;
  if(!confirm('تأیید نهایی: همه لیدها، گزارش‌ها، قرارها و قراردادها برای همیشه حذف می‌شوند. مطمئن هستید؟'))return;
  db={leads:[],reports:[],meetings:[],draft:null,cursor:0,duplicates:0,notified:{},dismissed:[]};
  save();
};

/* ===== انتخاب‌گر تاریخ و ساعت شمسی ===== */
function syncFollowUpText(){let v=$('#followUp').value,d=Jalali.parse(v);$('#followUpText').value=d?Jalali.dayText(d)+' — '+Jalali.fa(Jalali.pad(d.getHours())+':'+Jalali.pad(d.getMinutes())):'';$('#followUpText').classList.remove('invalid')}
function setFollowUp(iso){$('#followUp').value=iso||'';syncFollowUpText();$('#followUp').dispatchEvent(new Event('input',{bubbles:true}));$('#followUp').dispatchEvent(new Event('change',{bubbles:true}))}
const picker=document.createElement('div');picker.className='dt-picker hidden';picker.setAttribute('role','dialog');picker.setAttribute('aria-label','انتخاب تاریخ و ساعت شمسی');picker.innerHTML='<div class="dt-head"><button type="button" class="dt-nav" data-step="-1">ماه قبل</button><div class="dt-title"></div><button type="button" class="dt-nav" data-step="1">ماه بعد</button></div><div class="dt-week"></div><div class="dt-grid"></div><div class="dt-time"><label>ساعت<select id="dtHour"></select></label><label>دقیقه<select id="dtMinute"></select></label><button type="button" id="dtNow">الان</button></div><div class="dt-actions"><button type="button" id="dtClear" class="danger">پاک کردن</button><button type="button" id="dtOk" class="primary">تأیید</button></div>';document.body.appendChild(picker);
const pickerScrim=document.createElement('div');pickerScrim.className='dt-scrim hidden';document.body.appendChild(pickerScrim);
(function(){let h='',m='';for(let i=0;i<24;i++)h+='<option value="'+i+'">'+Jalali.fa(Jalali.pad(i))+'</option>';for(let i=0;i<60;i++)m+='<option value="'+i+'">'+Jalali.fa(Jalali.pad(i))+'</option>';$('#dtHour').innerHTML=h;$('#dtMinute').innerHTML=m})();
let pk={jy:0,jm:0,day:0,hh:9,mm:0};
function renderPicker(){if(!Jalali.isValid(pk.jy,pk.jm,1)){let t=Jalali.fromDate(new Date());pk.jy=t.jy;pk.jm=t.jm}let g=Jalali.toGregorian(pk.jy,pk.jm,1),first=new Date(g.gy,g.gm-1,g.gd),offset=Jalali.weekdayIndex(first),len=Jalali.monthLength(pk.jy,pk.jm),todayKey=Jalali.dateKey(new Date());picker.querySelector('.dt-title').textContent=Jalali.MONTHS[pk.jm-1]+' '+Jalali.fa(pk.jy);picker.querySelector('.dt-week').innerHTML=Jalali.WEEK_SHORT.map(d=>'<span>'+d+'</span>').join('');let cells='';for(let i=0;i<offset;i++)cells+='<div class="dt-blank"></div>';for(let day=1;day<=len;day++){let key=Jalali.dateKey(new Date(first.getFullYear(),first.getMonth(),first.getDate()+day-1));cells+='<button type="button" class="dt-day'+(key===todayKey?' today':'')+(day===pk.day?' sel':'')+'" data-day="'+day+'">'+Jalali.fa(day)+'</button>'}picker.querySelector('.dt-grid').innerHTML=cells;$('#dtHour').value=String(pk.hh);$('#dtMinute').value=String(pk.mm)}
function openPicker(){let d=Jalali.parse($('#followUp').value);if(!d){d=new Date(Date.now()+3600e3);d.setSeconds(0,0)}let j=Jalali.fromDate(d);pk={jy:j.jy,jm:j.jm,day:j.jd,hh:d.getHours(),mm:d.getMinutes()};renderPicker();picker.classList.remove('hidden');pickerScrim.classList.remove('hidden')}
function closePicker(){picker.classList.add('hidden');pickerScrim.classList.add('hidden')}
$('#openPicker').onclick=openPicker;$('#followUpText').onclick=openPicker;pickerScrim.onclick=closePicker;
picker.addEventListener('click',e=>{let day=e.target.closest('.dt-day');if(day){pk.day=+day.dataset.day;renderPicker();return}let nav=e.target.closest('.dt-nav');if(nav){let step=+nav.dataset.step,m=pk.jm+step,y=pk.jy;if(m<1){m=12;y--}if(m>12){m=1;y++}if(Jalali.isValid(y,m,1)){pk.jy=y;pk.jm=m}renderPicker();return}if(e.target.id==='dtNow'){let n=new Date();n.setSeconds(0,0);let j=Jalali.fromDate(n);pk={jy:j.jy,jm:j.jm,day:j.jd,hh:n.getHours(),mm:n.getMinutes()};renderPicker();return}if(e.target.id==='dtClear'){setFollowUp('');closePicker();return}if(e.target.id==='dtOk'){if(!pk.day){alert('برای انتخاب، ابتدا یک روز را مشخص کنید.');return}setFollowUp(Jalali.toStorageFromJ(pk.jy,pk.jm,pk.day,pk.hh,pk.mm));closePicker()}});
$('#dtHour').addEventListener('change',()=>{pk.hh=+$('#dtHour').value});$('#dtMinute').addEventListener('change',()=>{pk.mm=+$('#dtMinute').value});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePicker()});

/* ===== یادآوری‌ها (نوتیفیکیشن + آلارم صوتی) ===== */
function remindersOn(){return 'Notification' in window&&Notification.permission==='granted'}
function dismissed(k){return db.dismissed.includes(k)}
let actx=null;
// آلارم صوتی بدون فایل خارجی — با نوسان‌ساز Web Audio API تولید می‌شود
function alarm(){
  try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended')actx.resume();
    let t=actx.currentTime,beeps=[0,.35,.7,1.05,1.4];
    beeps.forEach((o,i)=>{
      let g=actx.createGain(),osc=actx.createOscillator();
      osc.type='sine';osc.frequency.value=i%2?660:880;
      g.gain.setValueAtTime(0,t+o);
      g.gain.linearRampToValueAtTime(.3,t+o+.04);
      g.gain.setValueAtTime(.3,t+o+.22);
      g.gain.linearRampToValueAtTime(0,t+o+.32);
      osc.connect(g);g.connect(actx.destination);
      osc.start(t+o);osc.stop(t+o+.34);
    });
  }catch(err){}
}
// مرورگر صدا را فقط پس از تعامل کاربر پخش می‌کند؛ اولین کلیک AudioContext را فعال می‌کند
document.addEventListener('click',()=>{try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume()}catch(err){}},{once:true});
function notify(title,body,tag,k){
  navigator.serviceWorker.ready.then(reg=>reg.showNotification(title,{body,tag,requireInteraction:true,data:{k}})).catch(()=>{});
}
function checkReminders(){
  if(!remindersOn())return;
  let now=Date.now();
  // یادآوری پیگیری‌های تماس (۱۵ دقیقه قبل)
  scheduledFollowUps().forEach(f=>{
    let t=new Date(f.report.followUp).getTime();if(!Number.isFinite(t))return;
    let k=f.lead.id,tag='followup-'+k,x=t-now;
    if(dismissed(tag))return;
    if(x<=900000&&!db.notified[tag]){
      db.notified[tag]=1;save();alarm();
      let body=x<=0?'اکنون زمان تماس است':x<=60000?'کمتر از یک دقیقه تا تماس':'۱۵ دقیقه تا زمان تماس';
      notify('یادآوری تماس — '+(f.lead.ownerName||f.lead.owner||''),body,tag,tag);
    }
  });
  // یادآوری قرارهای جلسه (۲۴ ساعت قبل) + آلارم ۱۵ دقیقه قبل
  appointments().forEach(a=>{
    let t=new Date(a.followUp).getTime();if(!Number.isFinite(t))return;
    let k=a.lead.id,tag='gharar-'+k,x=t-now;
    if(dismissed(tag))return;
    if(x<=900000&&!db.notified[tag+'-alarm']){db.notified[tag+'-alarm']=1;save();alarm()}
    if(x<=86400000&&!db.notified[tag]){
      db.notified[tag]=1;save();
      let body=x<=0?'اکنون زمان قرار است':x<=3600000?'کمتر از یک ساعت تا قرار مانده':'۲۴ ساعت تا قرار دارید';
      notify('یادآوری قرار — '+(a.lead.ownerName||a.lead.owner||''),body,tag,tag);
    }
  });
}
if('Notification' in window){
  if(remindersOn()){$('#notifyBtn').classList.add('hidden');checkReminders();setInterval(checkReminders,30000)}
  else $('#notifyBtn').classList.remove('hidden');
}
$('#notifyBtn').onclick=()=>{Notification.requestPermission().then(p=>{if(p==='granted'){$('#notifyBtn').classList.add('hidden');checkReminders();setInterval(checkReminders,30000)}else alert('دسترسی نوتیفیکیشن داده نشد.')})};

/* ===== نصب PWA و سرویس‌ورکر ===== */
let deferred;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e});
function installApp(){if(deferred){deferred.prompt();deferred=null;return}let ios=/iPhone|iPad|iPod/.test(navigator.userAgent)&&!window.MSStream;alert(ios?'روی آیفون/آیپد: دکمهٔ اشتراک (آیکون مستطیل با فلش بالا) را بزنید و «Add to Home Screen / افزودن به صفحه اصلی» را انتخاب کنید.':'از منوی مرورگر (⋮ یا ⌘) گزینهٔ «Install app / نصب برنامه» یا «Add to Home Screen» را انتخاب کنید.')}
$('#installBtn').onclick=installApp;
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
navigator.serviceWorker.addEventListener('message',e=>{
  if(e.data&&e.data.dismiss){let k=e.data.dismiss;if(!db.dismissed.includes(k)){db.dismissed.push(k);save()}}
  if(e.data&&e.data.openWork)go('work');
});

/* ===== شروع ===== */
refresh();
// هر ۶۰ ثانیه: زمان‌های «مانده/گذشته» در‌جا به‌روز می‌شوند
setInterval(()=>{refresh();refreshApptTimes()},60000);
// بازیابی تماس نیمه‌تمام یا هدایت به تماس سررسیدشده
if(db.draft){setTimeout(()=>{go('work');alert('یک تماس نیمه‌تمام دارید. باید ادامه همان لید را تکمیل کنید.')},150)}
else{
  let due=scheduledFollowUps().filter(f=>new Date(f.report.followUp)<=Date.now());
  if(due.length)setTimeout(()=>{db.draft={leadId:due[0].lead.id};localStorage.setItem(KEY,JSON.stringify(db));go('work');alert('تماس سررسیدشده دارید: '+(due[0].lead.ownerName||due[0].lead.owner||'')+'. مستقیماً به همان لید می‌رویم.')},150);
}
