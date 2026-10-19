const KEY='wpjoo.v1',VERSION='۱۴۰۵/۰۷/۱۸';const $=s=>document.querySelector(s);let vt=$('#versionTag');if(vt)vt.textContent='• نسخه '+VERSION;const fa=n=>String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);let db=JSON.parse(localStorage.getItem(KEY)||'{"leads":[],"reports":[],"cursor":0,"draft":null,"duplicates":0}');
function save(){localStorage.setItem(KEY,JSON.stringify(db));refresh()}function norm(v=''){return v.toString().trim().toLowerCase().replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/^tel:/,'').replace(/\/$/,'').replace(/[\s().-]/g,'')}function fingerprints(x){let u=norm(x.url||x.website||x.domain||x.link),p=norm(x.phone||x.mobile||x.tel),n=norm(x.name||x.title);return [...new Set([u&&'url:'+u,p&&'phone:'+p,n&&p&&'namephone:'+n+'|'+p].filter(Boolean))]}function key(x){return fingerprints(x)[0]||''}function pick(x,keys){for(const k of keys){let v=String(x[k]??'').trim();if(v)return v}return ''}function site(x){return x.url||x.website||x.domain||x.link||'بدون لینک'}function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
// آدرس سایت به‌صورت لینک نمایش داده می‌شود تا با کلیک، در مرورگر باز شود
function siteLink(x){let s=site(x);if(!s||s==='بدون لینک')return esc(s);let u=/^https?:\/\//.test(s)?s:'https://'+s;return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(s)}</a>`}
function go(id){document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));$('#'+id).classList.add('active');if(id==='work')renderWork();if(id==='reports')renderReports();refresh()}document.addEventListener('click',e=>{let b=e.target.closest('[data-go]');if(b)go(b.dataset.go)});
const scheduleLabel=document.createElement('label');scheduleLabel.innerHTML='<input id="scheduleFollowUp" type="checkbox"> انتقال تماس غیرنهایی به تقویم پیگیری';$('#followUpLabel').closest('label').before(scheduleLabel);
const calendar=document.createElement('section');calendar.id='calendar';calendar.className='view';calendar.innerHTML='<button type="button" data-go="home">بازگشت</button><h2>تقویم پیگیری تماس‌ها</h2><div class="cal-bar"><button type="button" id="calPrev">ماه قبل</button><b id="calTitle"></b><button type="button" id="calNext">ماه بعد</button><button type="button" id="calToday">امروز</button><button type="button" id="calAll" class="hidden">همه روزها</button></div><div class="cal-week" id="calWeek"></div><div class="cal-grid" id="calGrid"></div><div id="calendarList"></div>';document.querySelector('main').appendChild(calendar);
const calendarButton=document.createElement('button');calendarButton.type='button';calendarButton.dataset.go='calendar';$('#home .actions').appendChild(calendarButton);
let calView={jy:null,jm:null,day:null};
function moveMonth(step){if(calView.jy==null)return;let y=calView.jy,m=calView.jm+step;if(m<1){m=12;y--}if(m>12){m=1;y++}if(!Jalali.isValid(y,m,1))return;calView.jy=y;calView.jm=m;calView.day=null;renderCalendar()}
function goToday(){let t=Jalali.fromDate(new Date());calView.jy=t.jy;calView.jm=t.jm;calView.day=null;renderCalendar()}
$('#calPrev').onclick=()=>moveMonth(-1);$('#calNext').onclick=()=>moveMonth(1);$('#calToday').onclick=goToday;$('#calAll').onclick=()=>{calView.day=null;renderCalendar()};
document.addEventListener('click',e=>{let c=e.target.closest('.cal-day');if(!c||!c.dataset.day)return;calView.day=calView.day===c.dataset.day?null:c.dataset.day;renderCalendar()});
function reportLead(report){return db.leads.find(lead=>lead.id===report.leadId)||report.lead||{}}
function scheduledFollowUps(){let done=new Set(db.reports.filter(report=>TERMINAL.includes(report.status)).map(report=>report.leadId));return [...latestReports().values()].filter(report=>report.scheduledFollowUp&&!done.has(report.leadId)).sort((first,second)=>new Date(first.followUp)-new Date(second.followUp))}
function renderCalendar(){let items=scheduledFollowUps(),now=Date.now(),due=items.filter(report=>new Date(report.followUp).getTime()<=now).length;calendarButton.textContent='تقویم پیگیری تماس‌ها — '+fa(due)+' تماس سررسیدشده';let today=Jalali.fromDate(new Date());if(calView.jy==null){calView.jy=today.jy;calView.jm=today.jm}let g=Jalali.toGregorian(calView.jy,calView.jm,1),first=new Date(g.gy,g.gm-1,g.gd),offset=Jalali.weekdayIndex(first),len=Jalali.monthLength(calView.jy,calView.jm),todayKey=Jalali.dateKey(new Date());$('#calTitle').textContent=Jalali.MONTHS[calView.jm-1]+' '+Jalali.fa(calView.jy);$('#calWeek').innerHTML=Jalali.WEEK_SHORT.map(d=>'<span>'+d+'</span>').join('');let byDay=new Map();items.forEach(report=>{let d=Jalali.parse(report.followUp);if(!d)return;let k=Jalali.dateKey(d);if(!byDay.has(k))byDay.set(k,[]);byDay.get(k).push(report)});let cells='';for(let i=0;i<offset;i++)cells+='<div class="cal-blank"></div>';for(let day=1;day<=len;day++){let key=Jalali.dateKey(new Date(first.getFullYear(),first.getMonth(),first.getDate()+day-1)),list=byDay.get(key)||[],overdue=list.some(r=>new Date(r.followUp).getTime()<=now),soon=!overdue&&list.some(r=>new Date(r.followUp).getTime()-now<=86400000);cells+='<div class="cal-day'+(list.length?' has':'')+(overdue?' overdue':'')+(soon?' soon':'')+(key===todayKey?' today':'')+(calView.day===key?' sel':'')+'"'+(list.length?' data-day="'+key+'"':'')+'><span class="n">'+Jalali.fa(day)+'</span>'+(list.length?'<i>'+Jalali.fa(list.length)+'</i>':'')+'</div>'}$('#calGrid').innerHTML=cells;$('#calAll').classList.toggle('hidden',!calView.day);let shown=calView.day?items.filter(r=>{let d=Jalali.parse(r.followUp);return d&&Jalali.dateKey(d)===calView.day}):items;let dayDate=calView.day?Jalali.parse(calView.day):null,head='<div class="cal-head">'+(dayDate?'پیگیری‌های '+Jalali.WEEKDAYS[Jalali.weekdayIndex(dayDate)]+' '+Jalali.dayText(dayDate):'همه پیگیری‌ها (به ترتیب سررسید)')+'</div>';$('#calendarList').innerHTML=head+(shown.length?shown.map(report=>{let remaining=new Date(report.followUp).getTime()-now,state=remaining<=0?'عقب‌افتاده / سررسیدشده':remaining<=86400000?'کمتر از ۲۴ ساعت تا تماس':'پیگیری آینده';return '<div class="report '+(remaining<=0?'followup-overdue':remaining<=86400000?'followup-soon':'')+'"><b>'+esc(reportLead(report).ownerName||'')+'</b><br>'+siteLink(reportLead(report))+'<br>'+esc(reportLead(report).phone||'')+'<br>'+Jalali.storageText(report.followUp,'ثبت نشده')+'<br>'+state+'<br>'+esc(report.status)+' — '+esc(report.notes)+(remaining<=0?'<br><button type="button" data-followup="'+esc(report.leadId)+'">شروع پیگیری</button>':'')+'</div>'}).join(''):'<div class="notice">'+(calView.day?'در این روز پیگیری‌ای ثبت نشده است.':'پیگیری زمان‌بندی‌شده‌ای ندارید.')+'</div>')}
document.addEventListener('click',event=>{let button=event.target.closest('[data-followup]');if(!button)return;if(db.draft&&db.draft.leadId!==button.dataset.followup){alert('ابتدا تماس نیمه‌تمام فعلی را تکمیل کنید.');go('work');return}db.draft={leadId:button.dataset.followup};localStorage.setItem(KEY,JSON.stringify(db));go('work')});
setInterval(()=>refresh(),30000);
function latestReports(){let latest=new Map();db.reports.forEach(report=>latest.set(report.leadId,report));return latest}
function refresh(){let done=new Set(db.reports.filter(report=>TERMINAL.includes(report.status)).map(report=>report.leadId));$('#pendingCount').textContent=fa(db.leads.filter(lead=>!done.has(lead.id)).length);$('#reportCount').textContent=fa(db.reports.length);$('#duplicateCount').textContent=fa(db.duplicates);renderCalendar()}
function next(){if(db.draft){let active=db.leads.findIndex(lead=>lead.id===db.draft.leadId);if(active>=0)return active}let latest=latestReports(),done=new Set(db.reports.filter(report=>TERMINAL.includes(report.status)).map(report=>report.leadId));let due=db.leads.map((lead,index)=>({lead,index,report:latest.get(lead.id)})).filter(item=>!done.has(item.lead.id)&&item.report?.scheduledFollowUp&&new Date(item.report.followUp).getTime()<=Date.now()).sort((first,second)=>new Date(first.report.followUp)-new Date(second.report.followUp));if(due.length)return due[0].index;for(let offset=0;offset<db.leads.length;offset++){let index=(db.cursor+offset)%db.leads.length,lead=db.leads[index];if(!done.has(lead.id)&&!latest.get(lead.id)?.scheduledFollowUp)return index}return -1}
function renderWork(){let i=next(),card=$('#leadCard'),form=$('#reportForm');if(i<0){card.innerHTML='<div class="notice">تماس آماده‌ای ندارید؛ تقویم پیگیری‌ها را بررسی کنید یا لید جدید وارد کنید.</div>';form.classList.add('hidden');return}db.cursor=i;let x=db.leads[i];form.reset();$('#resumeHint').classList.add('hidden');if(!db.draft){db.draft={leadId:x.id};localStorage.setItem(KEY,JSON.stringify(db))}card.innerHTML=`<div class="lead"><strong>لید ${fa(i+1)} از ${fa(db.leads.length)}</strong><div class="row"><b>نام صاحب سایت:</b> ${esc(x.ownerName||x.owner||'ثبت نشده')}</div><div class="row"><b>سایت:</b> ${siteLink(x)}</div><div class="row"><b>تلفن:</b> ${esc(x.phone||x.mobile||x.tel||'ثبت نشده')}</div><a class="primary" style="display:block;text-align:center;margin-top:12px;text-decoration:none;border-radius:10px;padding:10px" href="tel:${encodeURIComponent(x.phone||x.mobile||x.tel||'')}">تماس با لید</a></div>`;form.classList.remove('hidden');if(db.draft&&db.draft.leadId===x.id){$('#scheduleFollowUp').checked=!!db.draft.scheduledFollowUp;$('#status').value=db.draft.status||'';$('#notes').value=db.draft.notes||'';$('#followUp').value=db.draft.followUp||'';$('#contactName').value=db.draft.contactName||'';$('#resumeHint').textContent='گزارش نیمه‌تمام این لید بازیابی شد.';$('#resumeHint').classList.remove('hidden')}updateScheduleFields();syncFollowUpText()}
function updateScheduleFields(){let status=$('#status').value,needs=status==='قرار جلسه با کارشناس'||$('#scheduleFollowUp').checked;$('#followUpText').required=needs;$('#followUpLabel').textContent=status==='قرار جلسه با کارشناس'?'تاریخ و ساعت جلسه (اجباری)':needs?'تاریخ و ساعت تماس مجدد (اجباری)':'زمان پیگیری/جلسه (در صورت وجود)'}
function persistDraft(){let index=next();if(index<0)return;db.draft={leadId:db.leads[index].id,status:$('#status').value,notes:$('#notes').value,followUp:$('#followUp').value,contactName:$('#contactName').value,scheduledFollowUp:$('#scheduleFollowUp').checked};localStorage.setItem(KEY,JSON.stringify(db))}
$('#status').addEventListener('change',updateScheduleFields);$('#scheduleFollowUp').addEventListener('change',updateScheduleFields);$('#reportForm').addEventListener('input',persistDraft);$('#reportForm').addEventListener('change',persistDraft);
$('#reportForm').addEventListener('submit',event=>{event.preventDefault();let index=next();if(index<0)return;let lead=db.leads[index],status=$('#status').value,notes=$('#notes').value.trim(),followUp=$('#followUp').value,contactName=$('#contactName').value.trim(),isFinal=TERMINAL.includes(status),scheduledFollowUp=!isFinal&&$('#scheduleFollowUp').checked,stamp=new Date(followUp).getTime();if(!status||notes.length<3||!contactName){alert('همه فیلدهای ضروری باید تکمیل شوند.');return}if((status==='قرار جلسه با کارشناس'||scheduledFollowUp)&&(!followUp||!Number.isFinite(stamp))){$('#followUpText').classList.add('invalid');alert('تاریخ و ساعت را صریحاً وارد کنید.');return}if(scheduledFollowUp&&stamp<=Date.now()){alert('زمان تماس مجدد باید در آینده باشد.');return}if(!isFinal&&!scheduledFollowUp){persistDraft();$('#resumeHint').textContent='تماس نیمه‌تمام است؛ نتیجه نهایی یا پیگیری با تاریخ و ساعت معتبر ثبت کنید.';$('#resumeHint').classList.remove('hidden');return}db.reports.push({id:crypto.randomUUID(),leadId:lead.id,lead,status,notes,followUp,contactName,scheduledFollowUp,isFinal,createdAt:new Date().toISOString()});db.draft=null;db.cursor=index+1;save();event.target.reset();updateScheduleFields();go('home')});
// وارد کردن لیست لید به بانک — هم از فایل و هم از فید خودکار خط لوله
// داده‌های کامل هر لید (افزونه‌ها، سرعت، مشکلات) دست‌نخورده باقی می‌مانند
// تا در خروجی گزارش به کارشناس منتقل شوند.
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
};$('#loadSample').onclick=()=>$('#jsonPreview').textContent=JSON.stringify([{ownerName:'نام صاحب سایت',name:'نام کسب‌وکار',url:'https://example.com',phone:'09120000000'}],null,2);
function renderReports(){let b=$('#reportList');b.innerHTML=db.reports.length?db.reports.slice().reverse().map(r=>`<div class="report"><b>نام صاحب سایت:</b> ${esc(r.lead.ownerName||r.lead.owner||'بدون نام')}<br><b>سایت:</b> ${siteLink(r.lead)}<br><b>نتیجه تماس:</b> ${esc(r.status)}<br><b>توضیحات:</b> ${esc(r.notes)}<br><b>زمان جلسه/پیگیری:</b> ${esc(Jalali.storageText(r.followUp,'ثبت نشده'))}<br><b>زمان ثبت گزارش:</b> ${esc(Jalali.storageText(new Date(r.createdAt),'ثبت نشده'))}<br><b>نام پاسخ‌دهنده:</b> ${esc(r.contactName||'ثبت نشده')}</div>`).join(''):'<div class="notice">هنوز گزارشی ثبت نشده است.</div>'}
function download(name,data){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
// نام فایل‌ها شمسی و قابل‌فهم است تا کاربر راحت‌تر آن‌ها را پیدا کند
function jdate(){let j=Jalali.fromDate(new Date());return Jalali.fa(Jalali.pad(j.jy))+'-'+Jalali.fa(Jalali.pad(j.jm))+'-'+Jalali.fa(Jalali.pad(j.jd))}
function exportReportsFile(){download('گزارش‌های-تماس-'+jdate()+'.json',db.reports)}
function exportNoWebsiteFile(){
  // لیدهایی که آخرین گزارششان «سایت نداشتند» است، با مشخصات کامل
  let latest=latestReports();
  let rows=db.leads.filter(lead=>latest.get(lead.id)?.status==='سایت نداشتند').map(lead=>{let r=latest.get(lead.id);return{نام_صاحب_سایت:lead.ownerName||lead.owner||'',نام_کسب_و_کار:lead.name||lead.title||'',سایت:site(lead),تلفن:lead.phone||lead.mobile||lead.tel||'',توضیحات_تماس:r.notes||'',نام_پاسخ‌دهنده:r.contactName||'',زمان_ثبت_گزارش:Jalali.storageText(new Date(r.createdAt),'ثبت نشده')}});
  if(!rows.length){alert('هیچ لیدی با وضعیت «سایت نداشتند» ثبت نشده است.');return}
  download('لیدهای-بدون-سایت-'+jdate()+'.json',rows);
}
function exportAllFile(){download('پشتیبان-کامل-پنل-منشی-'+jdate()+'.json',db)}function clearReportsData(){if(!confirm('گزارش‌ها پاک شوند؟ لیدها پاک نمی‌شوند.'))return;if(!confirm('تأیید نهایی: همه گزارش‌ها برای همیشه حذف می‌شوند. مطمئن هستید؟'))return;db.reports=[];db.cursor=0;db.draft=null;db.notified={};db.dismissed=[];save();renderReports()}
// پاک‌کردن فقط داده‌های ورودی (لیدهای بارگذاری‌شده) — گزارش‌ها و تقویم پیگیری حفظ می‌شوند
function clearLeadsData(){if(!confirm('لیدهای ورودی پاک شوند؟ گزارش‌ها و تقویم پیگیری حفظ می‌شوند.'))return;if(!confirm('تأیید نهایی: همه لیدهای ورودی برای همیشه حذف می‌شوند. مطمئن هستید؟'))return;db.leads=[];db.cursor=0;db.draft=null;db.duplicates=0;save();let out=$('#importResult');out.style.background='#e9f7ed';out.textContent='لیدهای ورودی پاک شد؛ گزارش‌ها و تقویم پیگیری حفظ شدند.'}
const TERMINAL=['انصراف و عدم تمایل مشتری','قرار جلسه با کارشناس','اشتباه بودن شماره','سایت نداشتند'];const oldOpen=db.reports.filter(r=>!TERMINAL.includes(r.status)&&!r.scheduledFollowUp);if(oldOpen.length){let r=oldOpen[oldOpen.length-1];db.draft={leadId:r.leadId,status:r.status,notes:r.notes||'',followUp:r.followUp||'',contactName:r.contactName||''};localStorage.setItem(KEY,JSON.stringify(db))}let deferred;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e});function installApp(){if(deferred){deferred.prompt();deferred=null;return}let ios=/iPhone|iPad|iPod/.test(navigator.userAgent)&&!window.MSStream;alert(ios?'روی آیفون/آیپد: دکمهٔ اشتراک (آیکون مستطیل با فلش بالا) را بزنید و «Add to Home Screen / افزودن به صفحه اصلی» را انتخاب کنید.':'از منوی مرورگر (⋮ یا ⌘) گزینهٔ «Install app / نصب برنامه» یا «Add to Home Screen» را انتخاب کنید.')}$('#installBtn').onclick=installApp;if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');refresh();if(db.draft){setTimeout(()=>{go('work');alert('یک تماس نیمه‌تمام دارید. باید ادامه همان لید را تکمیل کنید.')},150)}else{let due=scheduledFollowUps().filter(r=>new Date(r.followUp).getTime()<=Date.now());if(due.length)setTimeout(()=>{go('work');alert('تماس سررسیدشده دارید: '+(reportLead(due[0]).ownerName||'')+'. مستقیماً به همان لید می‌رویم.')},150)}
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
/* ===== یادآوری سررسید تماس (نوتیفیکیشن) ===== */
if(!db.notified||typeof db.notified!=='object')db.notified={};
function remindersOn(){return 'Notification' in window&&Notification.permission==='granted'}
function dismissed(k){return Array.isArray(db.dismissed)&&db.dismissed.includes(k)}
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
function checkCallReminders(){
  if(!remindersOn())return;
  let now=Date.now();
  scheduledFollowUps().forEach(r=>{
    let t=new Date(r.followUp).getTime();if(!Number.isFinite(t))return;
    let k=r.leadId,tag='followup-'+k,x=t-now;
    if(dismissed(k))return;
    if(x<=900000&&!db.notified[tag]){
      db.notified[tag]=1;save();
      alarm();
      let body=x<=0?'اکنون زمان تماس است':x<=60000?'کمتر از یک دقیقه تا تماس':'۱۵ دقیقه تا زمان تماس';
      navigator.serviceWorker.ready.then(reg=>reg.showNotification('یادآوری تماس — '+(reportLead(r).ownerName||''),{body,tag,requireInteraction:true,data:{k}}));
    }
  });
}
if('Notification' in window){
  if(remindersOn()){$('#notifyBtn').classList.add('hidden');checkCallReminders();setInterval(checkCallReminders,30000)}
  else $('#notifyBtn').classList.remove('hidden');
}
$('#notifyBtn').onclick=()=>{Notification.requestPermission().then(p=>{if(p==='granted'){$('#notifyBtn').classList.add('hidden');checkCallReminders();setInterval(checkCallReminders,30000)}else alert('دسترسی نوتیفیکیشن داده نشد.')})};
navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.dismiss){let k=e.data.dismiss;if(!Array.isArray(db.dismissed))db.dismissed=[];if(!db.dismissed.includes(k))db.dismissed.push(k);save()}if(e.data&&e.data.openWork)go('work')});







