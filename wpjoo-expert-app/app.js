const KEY='wpjoo.expert.v1',VERSION='۱۴۰۵/۰۷/۱۸', $=s=>document.querySelector(s), fa=n=>String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
let vt=$('#versionTag');if(vt)vt.textContent='• نسخه '+VERSION;
let db=JSON.parse(localStorage.getItem(KEY)||'{"appointments":[],"reports":[],"noWebsite":[],"lastImport":null}'),filter='all';
if(!Array.isArray(db.reports))db.reports=[];
if(!Array.isArray(db.noWebsite))db.noWebsite=[];

function go(id){document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));$('#'+id).classList.add('active');if(id==='main')render()}
let deferred;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e});function installApp(){if(deferred){deferred.prompt();deferred=null;return}let ios=/iPhone|iPad|iPod/.test(navigator.userAgent)&&!window.MSStream;alert(ios?'روی آیفون/آیپد: دکمهٔ اشتراک (آیکون مستطیل با فلش بالا) را بزنید و «Add to Home Screen / افزودن به صفحه اصلی» را انتخاب کنید.':'از منوی مرورگر (⋮ یا ⌘) گزینهٔ «Install app / نصب برنامه» یا «Add to Home Screen» را انتخاب کنید.')}
document.addEventListener('click',e=>{let b=e.target.closest('[data-go]');if(b)go(b.dataset.go)});

const save=()=>{localStorage.setItem(KEY,JSON.stringify(db));render()};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// آدرس سایت به‌صورت لینک نمایش داده می‌شود تا با کلیک، در مرورگر باز شود
const siteLink=u=>{let s=String(u??'').trim();if(!s||s==='ثبت نشده')return esc(s);let url=/^https?:\/\//.test(s)?s:'https://'+s;return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s)}</a>`};

// اطلاعات فنی سایت برای ارائهٔ خدمات افزایش سرعت:
// افزونه‌های نصب‌شده + معیارهای سرعت + مشکلات سایت به زبان ساده، زیر نام صاحب سایت.
// این داده‌ها از خروجی JSON پنل منشی می‌آید (در شیء lead هر گزارش).
const siteIntel=lead=>{
  if(!lead||typeof lead!=='object')return'';
  // خروجی جدید کارشناس leadSnapshot را هم دارد؛ ترکیب هر دو برای پایداری
  let src={...(lead.leadSnapshot||{}),...lead};
  let plugins=Array.isArray(src.plugins)?src.plugins.filter(Boolean):[];
  let issues=Array.isArray(src.issues)?src.issues.filter(Boolean):[];
  let s=src.speed;
  if(!plugins.length&&!issues.length&&!s)return'';
  let out='';
  if(s&&s.score!=null){
    // معیارهای اصلی در یک نگاه: نمره + LCP + FCP + TTFB
    let bits=[`نمره ${fa(s.score)} از ۱۰۰ (${esc(s.grade||'نامشخص')})`];
    // دقت تست: میانهٔ چند اجرا (مثل گوگل PageSpeed)
    let runs=Number(s.runs)||1;
    if(runs>1)bits.unshift(`میانهٔ ${fa(runs)} اجرا`);
    [['lcp','بارگذار اصلی'],['fcp','اولین محتوا'],['ttfb','پاسخ سرور']].forEach(([k,lbl])=>{
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
  return out;
};
const date=v=>{let d=new Date(v);return Number.isNaN(d.getTime())?null:d};
const key=r=>r.id||[r.leadId,r.followUp,r.createdAt,r.lead?.url].join('|');
const type=r=>{let d=date(r.followUp);if(!d)return'bad';let x=d-Date.now();return x<0?'overdue':x<=86400000?'soon':'future'};
const CONTRACT='جلسه برگزار شد و قرارداد بسته شد';
const fmt=v=>{let d=date(v);return d?Jalali.storageText(Jalali.toStorage(d),'ثبت نشده'):'ثبت نشده'};
const reportFor=r=>db.reports.find(x=>x.appointmentKey===key(r));
const ago=v=>{let d=date(v);if(!d)return'';let x=d-Date.now(),m=Math.floor(Math.abs(x)/60000),h=Math.floor(m/60);return x>=0?`${fa(h)} ساعت و ${fa(m%60)} دقیقه مانده`:`${fa(h)} ساعت و ${fa(m%60)} دقیقه گذشته`};

function render(){
  let a=db.appointments.map(r=>({...r,t:type(r)}))
    .filter(r=>r.t!=='bad');
  let contracted=a.filter(r=>reportFor(r)&&reportFor(r).status===CONTRACT)
    .sort((x,y)=>date(y.followUp)-date(x.followUp));
  a=a.filter(r=>!(reportFor(r)&&reportFor(r).status===CONTRACT))
    .sort((a,b)=>date(a.followUp)-date(b.followUp));
  $('#contractCount').textContent=fa(contracted.length);
  $('#contractList').innerHTML=contracted.length?
    contracted.map(r=>`
      <article class="appointment reported">
        <h3>${esc(r.lead?.ownerName||r.ownerName||'نام صاحب سایت ثبت نشده')}</h3>
        ${siteIntel(r.lead)}
        <div class="line"><b>زمان قرار:</b> ${fmt(r.followUp)}</div>
        <div class="line"><b>سایت:</b> ${siteLink(r.lead?.url||r.url)}</div>
        <div class="line"><b>تلفن:</b> ${esc(r.lead?.phone||r.phone||'ثبت نشده')}</div>
        <div class="report-box"><b>قرارداد بسته شد</b><br>${esc(reportFor(r).notes||'')}<br><small>${fmt(reportFor(r).at)}</small></div>
      </article>`).join('')
    :'<div class="result">هنوز قراردادی بسته نشده است.</div>';
  let soon=a.filter(r=>r.t==='soon');
  let over=a.filter(r=>r.t==='overdue');
  let rep=a.filter(r=>reportFor(r));
  let show=filter==='soon'?soon:filter==='overdue'?over:filter==='reported'?rep:filter==='unreported'?a.filter(r=>!reportFor(r)):a;
  $('#noWebsiteCount').textContent=fa(db.noWebsite.length);
  if(filter==='nowebsite'){
    let nw=db.noWebsite.slice().sort((x,y)=>new Date(y.createdAt||0)-new Date(x.createdAt||0));
    $('#appointments').innerHTML=nw.length?nw.map(r=>`<article class="appointment"><h3>${esc(r.lead?.ownerName||'نام صاحب سایت ثبت نشده')}</h3><span class="badge">سایت نداشتند</span>${siteIntel(r.lead)}<div class="line"><b>سایت:</b> ${siteLink(r.lead?.url||r.url)}</div><div class="line"><b>تلفن:</b> ${esc(r.lead?.phone||'ثبت نشده')}</div><div class="line"><b>توضیحات تماس:</b> ${esc(r.notes||'')}</div><div class="line"><b>نام پاسخ‌دهنده:</b> ${esc(r.contactName||'ثبت نشده')}</div><div class="line"><b>زمان ثبت گزارش:</b> ${fmt(r.createdAt)}</div></article>`).join(''):'<div class="result">هنوز لیدی با وضعیت «سایت نداشتند» ثبت نشده است.</div>';
  }
  else{

  $('#totalCount').textContent=fa(a.length);
  $('#soonCount').textContent=fa(soon.length);
  $('#overdueCount').textContent=fa(over.length);
  $('#reportedCount').textContent=fa(rep.length);

  let al=$('#alertBox');
  if(soon.length){al.className='alert urgent';al.innerHTML=`هشدار: ${fa(soon.length)} قرار تا ۲۴ ساعت آینده؛ نزدیک‌ترین قرار ${fmt(soon[0].followUp)}`}
  else if(over.length){al.className='alert';al.textContent=`توجه: ${fa(over.length)} قرار گذشته دارید.`}
  else{al.className='alert hidden'}

  $('#appointments').innerHTML=show.length?
    show.map(r=>`
      <article class="appointment ${r.t}" data-akey="${esc(key(r))}">
        <h3>${esc(r.lead?.ownerName||r.ownerName||'نام صاحب سایت ثبت نشده')}</h3>
        <span class="badge">${r.t==='soon'?'تا ۲۴ ساعت آینده':r.t==='overdue'?'گذشته':'آینده'}</span>
        ${siteIntel(r.lead)}
        <div class="line time-line"><b>زمان قرار:</b> ${fmt(r.followUp)} — ${ago(r.followUp)}</div>
        <div class="line"><b>سایت:</b> ${siteLink(r.lead?.url||r.url)}</div>
        <div class="line"><b>تلفن:</b> ${esc(r.lead?.phone||r.phone||'ثبت نشده')}</div>
        <div class="line"><b>توضیحات:</b> ${esc(r.notes||'')}</div>
        <div class="line"><b>نام پاسخ‌دهنده:</b> ${esc(r.contactName||'ثبت نشده')}</div>
        ${reportFor(r)?`<div class="report-box"><b>گزارش ثبت‌شده:</b><br>${esc(reportFor(r).status)}<br>${esc(reportFor(r).notes||'')}<br><small>${fmt(reportFor(r).at)}${reportFor(r).nextAction?' — اقدام بعدی: '+esc(reportFor(r).nextAction):''}</small></div>`:''}
        <button type="button" class="reportBtn" data-report="${esc(key(r))}">${reportFor(r)?'ویرایش گزارش':'ثبت گزارش قرار'}</button>
      </article>`).join('')
    :'<div class="result">برای این فیلتر قراری وجود ندارد.</div>';
  }

  $('#result').textContent=db.lastImport
    ?(db.lastImport.restored
      ?`بازگردانی از خروجی کارشناس: ${fa(db.lastImport.added)} قرار جدید؛ ${fa(db.lastImport.updated)} قرار به‌روزرسانی شد${db.lastImport.duplicates?`؛ ${fa(db.lastImport.duplicates)} گزارش بدون تغییر بود`:''}.`
      :`${fa(db.lastImport.added)} قرار اضافه شد${db.lastImport.updated?`؛ ${fa(db.lastImport.updated)} قرار به‌روزرسانی شد`:''}؛ ${fa(db.lastImport.duplicates)} تکراری نادیده گرفته شد${db.lastImport.pruned?`؛ ${fa(db.lastImport.pruned)} قرار لغو‌شده از فهرست حذف شد`:''}.`)
    :'';
  lastSig=signature();
}

// امضای داده‌ها برای اینکه رندر دوره‌ای فقط وقتی چیزی واقعاً تغییر کرد
// کل لیست را بازنویسی کند (در غیر این صورت فقط زمان‌ها در‌جا به‌روز می‌شوند
// تا اسکرول و فیلتر کاربر به هم نخورد)
let lastSig=null;
function signature(){return JSON.stringify([db.appointments.length,db.reports.length,db.noWebsite.length,db.appointments.map(r=>key(r)+(reportFor(r)?':1':':0')).sort(),filter])}
function refreshTimes(){
  document.querySelectorAll('#appointments .appointment[data-akey]').forEach(el=>{
    let r=db.appointments.find(x=>key(x)===el.dataset.akey);if(!r)return;
    let t=el.querySelector('.time-line');if(!t)return;
    t.innerHTML=`<b>زمان قرار:</b> ${fmt(r.followUp)} — ${ago(r.followUp)}`;
  });
}

// بازگردانی خروجی پنل کارشناس در دستگاه دیگر: هر ردیف یک قرار کامل با
// گزارش چسبیده است. قرارها به‌جای جایگزینی، ادغام می‌شوند تا سابقه حفظ شود.
function restoreExpertBackup(arr,fname){
  let added=0,updated=0,duplicates=0;
  arr.forEach(row=>{
    if(!row||!row.leadId)return;
    let appt={leadId:row.leadId,followUp:row.followUp,contactName:row.contactName||'',
      notes:row.notes||'',createdAt:row.createdAt||'',
      scheduledFollowUp:!!row.scheduledFollowUp,lead:row.lead||row.leadSnapshot||null,
      appointmentKey:row.appointmentKey||null};
    let ex=db.appointments.find(x=>x.leadId===row.leadId);
    let nk;
    if(ex){
      let ok=key(ex);
      Object.assign(ex,appt);
      nk=key(ex);
      if(ok!==nk){
        db.reports.forEach(x=>{if(x.appointmentKey===ok)x.appointmentKey=nk});
        if(Array.isArray(db.dismissed))db.dismissed=db.dismissed.map(x=>x===ok?nk:x);
        if(db.notified)Object.keys(db.notified).forEach(t=>{if(t==='gharar-'+ok){db.notified['gharar-'+nk]=db.notified[t];delete db.notified[t]}});
      }
      updated++;
    }else{
      if(!appt.appointmentKey)appt.appointmentKey=appt.leadId;
      nk=key(appt);
      db.appointments.push(appt);
      added++;
    }
    // گزارش کارشناس را به کلید قرارِ جدید می‌چسبانیم
    let rep=row.report;
    if(rep&&rep.status&&rep.notes){
      let rec={appointmentKey:nk,status:rep.status,notes:rep.notes,
        at:rep.at||new Date().toISOString(),updatedAt:rep.updatedAt||''};
      let i=db.reports.findIndex(x=>x.appointmentKey===nk);
      if(i>=0){if(rec.status!==db.reports[i].status||rec.notes!==db.reports[i].notes)db.reports[i]=rec;else duplicates++}
      else db.reports.push(rec);
    }
  });
  db.lastImport={added,updated,duplicates,pruned:0,file:fname,restored:true};
  save();
}

$('#jsonFile').addEventListener('change',async e=>{
  let f=e.target.files[0];
  if(!f)return;
  try{
    let raw=JSON.parse(await f.text());
    let arr=Array.isArray(raw)?raw:(raw.reports||raw.data||raw.items||[]);
    if(!Array.isArray(arr))throw Error('فرمت آرایه‌ای یا کلید reports/data/items لازم است');
    // مسیر ۲: خروجی پنل کارشناس (هر ردیف یک قرار با report چسبیده)
    if(arr.some(r=>r&&(r.report||r.appointmentKey&&!r.status))){restoreExpertBackup(arr,f.name);return}
    // مسیر ۱: خروجی پنل منشی
    // فقط آخرین گزارش هر لید ملاک است؛ اگر آخرین وضعیت «قرار جلسه با کارشناس» نبود، قرارداد وارد نمی‌شود
    let latest=new Map();
    arr.forEach(r=>{if(!r||!r.leadId)return;let cur=latest.get(r.leadId);if(!cur||new Date(r.createdAt||0).getTime()>=new Date(cur.createdAt||0).getTime())latest.set(r.leadId,r)});
    // لیدهایی که آخرین گزارش منشی «سایت نداشتند» است، در فهرست مجزایی نگه داشته می‌شوند
    // (با حفظ موارد قبلی، تا در صورت وارد کردن فایل ناقص داده‌ها از بین نروند)
    let nw=new Map();
    db.noWebsite.forEach(r=>{if(r&&r.leadId)nw.set(r.leadId,r)});
    latest.forEach(r=>{if(r.status==='سایت نداشتند')nw.set(r.leadId,r);else nw.delete(r.leadId)});
    db.noWebsite=[...nw.values()];
    let pruned=0;
    if($('#pruneOnImport').checked){
      // قرارهای قبلی که طبق آخرین گزارش منشی دیگر جلسه‌ای ندارند حذف می‌شوند؛
      // مگر اینکه کارشناس از قبل برایشان گزارشی ثبت کرده باشد
      db.appointments=db.appointments.filter(r=>{
        let l=latest.get(r.leadId);
        if(l&&l.status!=='قرار جلسه با کارشناس'&&!reportFor(r)){pruned++;return false}
        return true;
      });
    }
    // هر لید فقط یک قرار در فهرست کارشناس دارد
    let have=new Map();
    db.appointments.forEach(r=>{if(r.leadId&&!have.has(r.leadId))have.set(r.leadId,r)});
    let added=0,updated=0,duplicates=0;
    [...latest.values()].filter(r=>r.status==='قرار جلسه با کارشناس').forEach(r=>{
      let ex=have.get(r.leadId);
      if(ex){
        if(key(ex)===key(r)){duplicates++;return}
        // قرار قدیمی با جدیدترین گزارش منشی جایگزین می‌شود؛ گزارش‌های ثبت‌شده
        // کارشناس به کلید جدید منتقل می‌شوند تا سابقه کار از بین نرود
        let ok=key(ex);
        Object.assign(ex,r);
        let nk=key(ex);
        if(ok!==nk){
          db.reports.forEach(x=>{if(x.appointmentKey===ok)x.appointmentKey=nk});
          if(Array.isArray(db.dismissed))db.dismissed=db.dismissed.map(x=>x===ok?nk:x);
          if(db.notified)Object.keys(db.notified).forEach(t=>{if(t==='gharar-'+ok){db.notified['gharar-'+nk]=db.notified[t];delete db.notified[t]}});
        }
        updated++;return;
      }
      db.appointments.push(r);
      have.set(r.leadId,r);
      added++;
    });
    db.lastImport={added,updated,duplicates,pruned,file:f.name};
    save();
  }catch(err){
    $('#result').textContent='خطا در خواندن JSON: '+err.message;
  }
});

function download(n,d){
  let a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
  a.download=n;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
// نام فایل‌ها شمسی و قابل‌فهم است تا کاربر راحت‌تر آن‌ها را پیدا کند
function jdate(){let j=Jalali.fromDate(new Date());return Jalali.fa(Jalali.pad(j.jy))+'-'+Jalali.fa(Jalali.pad(j.jm))+'-'+Jalali.fa(Jalali.pad(j.jd))}

$('#exportData').onclick=()=>download('پشتیبان-کامل-پنل-کارشناس-'+jdate()+'.json',db);
// خروجی گزارش‌های کارشناس باید «خود-حاوی» باشد: هر ردیف یک قرار کامل است
// با اطلاعات فنی سایت (افزونه‌ها، سرعت، مشکلات) و گزارش ثبت‌شدهٔ کارشناس.
// این فایل در دستگاه دیگر قابل بازگردانی است (مسیر restoreExpertBackup).
$('#exportReports').onclick=()=>{
  if(!db.appointments.length){alert('هنوز قراری ثبت نشده است.');return}
  let rows=db.appointments.map(a=>{
    let rep=reportFor(a);
    // کلید قرار دوباره محاسبه می‌شود تا در دستگاه مقصد یکتا بماند
    let k=key(a);
    return{
      // --- فیلدهای قرار (برای بازگردانی در دستگاه دیگر) ---
      leadId:a.leadId,
      followUp:a.followUp,
      contactName:a.contactName||'',
      notes:a.notes||'',
      createdAt:a.createdAt||'',
      scheduledFollowUp:!!a.scheduledFollowUp,
      // --- lead کامل: سرعت/افزونه‌ها/مشکلات برای ارائه به مشتری ---
      lead:a.lead||null,
      leadSnapshot:a.lead?{ownerName:a.lead.ownerName,name:a.lead.name,url:a.lead.url,phone:a.lead.phone,plugins:a.lead.plugins,pluginsFa:a.lead.pluginsFa,issues:a.lead.issues,wordpressFacts:a.lead.wordpressFacts,speed:a.lead.speed}:null,
      // --- گزارش کارشناس (در صورت ثبت) ---
      appointmentKey:k,
      report:rep?{appointmentKey:k,status:rep.status,notes:rep.notes,at:rep.at,updatedAt:rep.updatedAt||''}:null
    };
  });
  download('گزارش‌های-کارشناس-'+jdate()+'.json',rows);
};
$('#clearData').onclick=()=>{
  if(!confirm('اطلاعات پنل کارشناس پاک شود؟'))return;
  if(!confirm('تأیید نهایی: همه قرارها و گزارش‌های ثبت‌شده برای همیشه حذف می‌شوند. مطمئن هستید؟'))return;
  db={appointments:[],reports:[],noWebsite:[],notified:{},alarmed:{},dismissed:[],lastImport:null};
  save();
};
// پاک‌کردن فقط داده‌های ورودی (قرارهای بارگذاری‌شده از JSON منشی) — گزارش‌های کارشناس حفظ می‌شوند
$('#clearInputs').onclick=()=>{
  if(!confirm('فقط ورودی‌ها پاک شوند؟ قرارهای بارگذاری‌شده حذف می‌شوند ولی گزارش‌های خودتان حفظ می‌شود.'))return;
  if(!confirm('تأیید نهایی: همه قرارهای ورودی برای همیشه حذف می‌شوند. مطمئن هستید؟'))return;
  db.appointments=[];db.noWebsite=[];db.notified={};db.alarmed={};db.dismissed=[];db.lastImport=null;
  save();
  $('#result').textContent='ورودی‌ها پاک شد؛ گزارش‌های کارشناس حفظ شدند.';
};

document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  filter=b.dataset.filter;
  render();
});

let editingKey=null;
document.addEventListener('click',e=>{
  let b=e.target.closest('[data-report]');
  if(!b)return;
  editingKey=b.dataset.report;
  let r=db.appointments.find(x=>key(x)===editingKey);
  if(!r)return;
  $('#reportCard').innerHTML=`<h3>${esc(r.lead?.ownerName||r.ownerName||'نام صاحب سایت ثبت نشده')}</h3>${siteIntel(r.lead)}<div class="line"><b>زمان قرار:</b> ${fmt(r.followUp)}</div><div class="line"><b>سایت:</b> ${siteLink(r.lead?.url||r.url)}</div><div class="line"><b>تلفن:</b> ${esc(r.lead?.phone||r.phone||'ثبت نشده')}</div>`;
  let old=reportFor(r);
  $('#reportStatus').value=old?old.status:'';
  $('#reportNotes').value=old?old.notes:'';
  let d=old&&old.at?new Date(old.at):new Date();
  let p=n=>String(n).padStart(2,'0');
  $('#reportAt').value=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  $('#reportSaved').textContent='';
  go('reportView');
});

$('#reportForm').addEventListener('submit',e=>{
  e.preventDefault();
  if(!editingKey)return;
  let status=$('#reportStatus').value,notes=$('#reportNotes').value.trim(),at=$('#reportAt').value;
  if(!status||notes.length<3){alert('نتیجه جلسه و توضیحات (حداقل ۳ حرف) اجباری است.');return}
  let i=db.reports.findIndex(x=>x.appointmentKey===editingKey);
  let rec={appointmentKey:editingKey,status,notes,at:new Date(at).toISOString(),updatedAt:new Date().toISOString()};
  if(i>=0)db.reports[i]=rec;else db.reports.push(rec);
  save();
  $('#reportForm').reset();
  $('#reportSaved').textContent='گزارش ذخیره شد و روی دستگاه نگه داشته شد.';
  go('main');
});

render();
// هر ۶۰ ثانیه: فقط اگر داده‌ها تغییر کرده باشند لیست بازنویسی می‌شود؛
// در غیر این صورت صرفاً متن «مانده/گذشته» در‌جا به‌روز می‌شود
setInterval(()=>{if(signature()!==lastSig)render();else refreshTimes()},60000);

/* ===== یادآوری قرارها (نوتیفیکیشن) ===== */
if(!db.notified||typeof db.notified!=='object')db.notified={};
function remindersOn(){return Notification.permission==='granted'}
function dismissed(k){return db.dismissed&&db.dismissed.includes(k)}
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
function checkReminders(){
  if(!remindersOn())return;
  let now=Date.now();
  db.appointments.forEach(r=>{
    let d=date(r.followUp);if(!d)return;
    let k=key(r),t=d.getTime(),x=t-now;
    if(dismissed(k))return;      if(x<=86400000){
        let tag='gharar-'+k;
        // ۱۵ دقیقه قبل از قرار آلارم صوتی پخش می‌شود (نوتیفیکیشن از قبل فعال است)
        if(x<=900000){if(!db.alarmed||typeof db.alarmed!=='object')db.alarmed={};if(!db.alarmed[tag]){db.alarmed[tag]=1;save();alarm()}}
        if(!db.notified[tag]){
          db.notified[tag]=1;save();
          let body=x<=0?'اکنون زمان قرار است':x<=3600000?'کمتر از یک ساعت تا قرار مانده':'۲۴ ساعت تا قراردانید';
          navigator.serviceWorker.ready.then(reg=>reg.showNotification('یادآوری قرار — '+(r.lead?.ownerName||r.ownerName||''),{body,body,tag,requireInteraction:true,data:{k}}));
        }
      }
  });
}
if('Notification' in window){
  if(remindersOn()){$('#notifyBtn').classList.add('hidden');checkReminders();setInterval(checkReminders,30000)}
  else $('#notifyBtn').classList.remove('hidden');
}
$('#notifyBtn').onclick=()=>{Notification.requestPermission().then(p=>{if(p==='granted'){$('#notifyBtn').classList.add('hidden');checkReminders();setInterval(checkReminders,30000)}else alert('دسترسی نوتیفیکیشن داده نشد.')})};
$('#installBtn').onclick=installApp;
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.dismiss){let k=e.data.dismiss;if(!db.dismissed)db.dismissed=[];if(!db.dismissed.includes(k))db.dismissed.push(k);save()}});
