const initialRecords = [
  { id:'LR-0128', url:'https://verify.partner-site.com/session/8f2a9d', note:'首次提交，等待平台审核结果', status:'处理中', assignee:'james', attachments:2, updated:'2 分钟前', batch:'nov' },
  { id:'LR-0127', url:'https://app.example.com/verify/user/92841', note:'资料已补充，截图在附件中', status:'待确认', assignee:'lin', attachments:3, updated:'18 分钟前', batch:'nov' },
  { id:'LR-0126', url:'https://portal.sample.io/kyc/flow/7c81e4', note:'确认通过页面是否为最终状态', status:'已通过', assignee:'james', attachments:1, updated:'36 分钟前', batch:'nov' },
  { id:'LR-0125', url:'https://verify.partner-site.com/session/1a5e33', note:'页面提示需要重新提交材料', status:'未通过', assignee:'lin', attachments:2, updated:'1 小时前', batch:'oct' },
  { id:'LR-0124', url:'https://accounts.example.net/check/639183', note:'等待对方确认状态截图', status:'待处理', assignee:'james', attachments:0, updated:'2 小时前', batch:'oct' },
  { id:'LR-0123', url:'https://id.sample.org/review/acc-1948', note:'账号暂时无法访问，已留存页面截图', status:'账号受限', assignee:'lin', attachments:1, updated:'3 小时前', batch:'oct' },
  { id:'LR-0122', url:'https://portal.sample.io/kyc/flow/3d010a', note:'资料已提交，等待平台审核', status:'处理中', assignee:'lin', attachments:0, updated:'4 小时前', batch:'nov' },
  { id:'LR-0121', url:'https://verify.partner-site.com/session/b2aa71', note:'需要对接人复核结果', status:'待确认', assignee:'james', attachments:2, updated:'昨天', batch:'oct' }
];
const members = { lin:{name:'Lin Chen',short:'林',className:'avatar-purple'}, james:{name:'James Miller',short:'J',className:'avatar-peach'} };
const savedState=(()=>{try{return JSON.parse(localStorage.getItem('linkroom-state')||'null')}catch{return null}})();
const cloudConfigAvailable=!!(window.LINKROOM_CONFIG?.supabaseUrl&&window.LINKROOM_CONFIG?.supabaseAnonKey&&window.supabase?.createClient);
let records = cloudConfigAvailable ? [] : (savedState?.records || [...initialRecords]);
let batches = cloudConfigAvailable ? [] : (savedState?.batches || [{id:'oct',name:'10 月 · 第一批',note:'更新于 2 小时前'},{id:'nov',name:'11 月 · 第二批',note:'更新于 28 分钟前'},{id:'dec',name:'待分配',note:'刚刚创建'}]);
let localSettings=savedState?.settings||{workspaceName:'Linkroom 工作区',retention:'90',statuses:['待处理','处理中','待确认','已通过','未通过','账号受限']};
let activeBatch = 'all';
let activeStatus = 'all';
let activeAssignee = 'all';
let currentPage = 1;
let pageSize = 8;
let editingBatchId = null;
let pendingRecordId = null;
let toastTimer;
let cloudClient=null, cloudWorkspaceId=null, cloudUserId=null, cloudSyncTimer=null, cloudMode=cloudConfigAvailable, applyingCloudState=false;
let cloudRole=null, cloudMembers=[], cloudChannel=null;
const cloudSaveTimers=new Map(), cloudPendingWrites=new Set();
function persist(){if(cloudMode||applyingCloudState)return;try{localStorage.setItem('linkroom-state',JSON.stringify({records,batches,settings:localSettings}))}catch{toast('本地存储空间不足，图片附件请待云端版本保存')}}
const rows = document.querySelector('#recordRows');
const searchInput = document.querySelector('#searchInput');
const statusMenu = document.querySelector('#statusMenu');
const recordDialog = document.querySelector('#recordDialog');
document.addEventListener('click',event=>{const button=event.target.closest('.close-modal, [data-close-dialog]');if(button)button.closest('dialog')?.close()});
const activity = [
  {who:'James Miller',verb:'更新了状态为「处理中」',record:'LR-0128',when:'2 分钟前',member:'james'},
  {who:'Lin Chen',verb:'添加了 2 个附件',record:'LR-0127',when:'18 分钟前',member:'lin'},
  {who:'James Miller',verb:'确认记录已通过',record:'LR-0126',when:'36 分钟前',member:'james'},
  {who:'Lin Chen',verb:'创建了批次「11 月 · 第二批」',record:'',when:'昨天 16:42',member:'lin'}
];
function statusClass(status){return {'已通过':'passed','待处理':'pending','处理中':'processing','待确认':'review','未通过':'failed','账号受限':'restricted'}[status]||'pending'}
function render(){
  persist();
  const visibleMembers=cloudMode?cloudMembers:Object.values(members);
  document.querySelector('#memberCount').textContent=`${visibleMembers.length} 位成员`;
  document.querySelector('#memberAvatars').innerHTML=visibleMembers.slice(0,4).map(m=>`<span class="avatar ${m.className}" title="${escapeAttr(m.name)}">${escapeHTML(m.short)}</span>`).join('');
  document.querySelector('#collabDetail').textContent=cloudMode?'工作区记录由成员共同维护。':'本机演示数据只保存在当前浏览器。';
  renderBatches();
  const term=searchInput.value.trim().toLowerCase();
  const filtered=records.filter(r=>{
    const person=(members[r.assignee]?.name||'').toLowerCase();
    const matchesText=!term||`${r.id} ${r.url} ${r.note} ${person}`.toLowerCase().includes(term);
    return matchesText&&(activeBatch==='all'||r.batch===activeBatch)&&(activeStatus==='all'||r.status===activeStatus)&&(activeAssignee==='all'||r.assignee===activeAssignee);
  });
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  currentPage=Math.min(currentPage,pageCount);
  const pageStart=(currentPage-1)*pageSize;
  rows.innerHTML=filtered.slice(pageStart,pageStart+pageSize).map(r=>{
    const person=members[r.assignee]||{name:'未分配',short:'—',className:'avatar-purple'};
    const statuses=localSettings.statuses;
    const isReadonly=cloudMode&&!['admin','editor'].includes(cloudRole);
    const assigneeOptions=`<option value="">未分配</option>`+Object.entries(members).map(([key,m])=>`<option value="${key}" ${key===r.assignee?'selected':''}>${escapeHTML(m.name)}</option>`).join('');
    return `<tr data-id="${r.id}"><td class="check-col"><input class="row-check" type="checkbox" aria-label="选择 ${r.id}" /></td><td><span class="record-id">${r.id}</span></td><td><div class="link-cell">${safeLink(r.url)?`<a class="record-url" href="${escapeAttr(safeLink(r.url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(r.url)}</a>`:`<span class="record-url">${escapeHTML(r.url)}</span>`}<input class="note-edit" data-id="${r.id}" value="${escapeAttr(r.note||'')}" aria-label="编辑 ${r.id} 备注" title="点击编辑备注" ${isReadonly?'disabled':''} /></div></td><td><label class="status-select-wrap"><span class="status-badge status-${statusClass(r.status)}">${escapeHTML(r.status)}</span><select class="status-select" data-id="${r.id}" aria-label="更改 ${r.id} 状态" ${isReadonly?'disabled':''}>${statuses.map(s=>`<option value="${escapeAttr(s)}" ${s===r.status?'selected':''}>${escapeHTML(s)}</option>`).join('')}</select><span class="select-caret">⌄</span></label></td><td><label class="assignee"><span class="avatar ${person.className}">${escapeHTML(person.short)}</span><select class="assignee-select" data-id="${r.id}" aria-label="更改 ${r.id} 负责人" ${isReadonly?'disabled':''}>${assigneeOptions}</select></label></td><td class="attachment-cell"><button class="attachment-action" data-id="${r.id}" type="button" title="附件">${r.attachments?`<span>▧</span> ${r.attachments}`:'<span>＋</span> 添加'}</button></td><td class="updated-cell">${escapeHTML(r.updated)}</td><td><button class="row-menu" type="button" aria-label="记录操作">···</button></td></tr>`;
  }).join('');
  document.querySelector('#emptyState').hidden=filtered.length>0;
  document.querySelector('#showingCount').textContent=`显示 ${filtered.length?pageStart+1:0}–${Math.min(pageStart+pageSize,filtered.length)} 条，共 ${filtered.length} 条记录`;
  document.querySelector('#paginationControls').innerHTML=`<button type="button" data-page="${currentPage-1}" aria-label="上一页" ${currentPage===1?'disabled':''}>‹</button><span>${currentPage} / ${pageCount}</span><button type="button" data-page="${currentPage+1}" aria-label="下一页" ${currentPage===pageCount?'disabled':''}>›</button><select id="pageSizeSelect" aria-label="每页行数"><option value="8" ${pageSize===8?'selected':''}>每页 8 条</option><option value="12" ${pageSize===12?'selected':''}>每页 12 条</option><option value="24" ${pageSize===24?'selected':''}>每页 24 条</option></select>`;
  updateStats();
  document.querySelectorAll('.status-select').forEach(select=>select.addEventListener('change',()=>setStatus(select.dataset.id,select.value)));
  document.querySelectorAll('.assignee-select').forEach(select=>select.addEventListener('change',()=>setAssignee(select.dataset.id,select.value)));
  document.querySelectorAll('.note-edit').forEach(input=>input.addEventListener('change',()=>setNote(input.dataset.id,input.value)));
  document.querySelectorAll('.attachment-action').forEach(b=>b.addEventListener('click',()=>{pendingRecordId=b.dataset.id;if(cloudMode){toast('云端附件功能尚未启用');return}document.querySelector('#imageInput').click()}));
  document.querySelectorAll('.row-menu').forEach(b=>b.addEventListener('click',()=>{const id=b.closest('tr').dataset.id;const record=records.find(r=>r.id===id);if(!record)return;const action=prompt(`记录 ${id}\n输入 rename 编辑批次，delete 删除此记录，或留空取消。`);if(action==='delete')deleteRecord(id);else if(action==='rename')openBatchDialog(record.batch)}));
}
async function cloudLoad(){if(!cloudClient||!cloudWorkspaceId)return;const [{data:batchRows,error:batchError},{data:recordRows,error:recordError}]=await Promise.all([cloudClient.from('batches').select('id,name').eq('workspace_id',cloudWorkspaceId).order('created_at'),cloudClient.from('records').select('id,display_id,batch_id,url,note,status,assignee,updated_at').eq('workspace_id',cloudWorkspaceId).order('created_at',{ascending:false})]);if(batchError||recordError){console.error(batchError||recordError);toast('读取共享数据失败，请检查数据库策略');return}applyingCloudState=true;batches=batchRows.map(b=>({id:b.id,name:b.name,note:'共享批次'}));records=recordRows.map(r=>{const old=records.find(x=>x.dbId===r.id);const owner=cloudMembers.find(m=>m.id===r.assignee);return {id:`LR-${String(r.display_id).padStart(4,'0')}`,dbId:r.id,url:r.url,note:old&&cloudPendingWrites.has(`${r.id}:note`)?old.note:r.note,status:old&&cloudPendingWrites.has(`${r.id}:status`)?old.status:r.status,assignee:owner?.key||'',assigneeUserId:r.assignee,attachments:old?.attachments||0,updated:r.updated_at?new Date(r.updated_at).toLocaleString():'',updatedAt:r.updated_at,batch:r.batch_id}});render();syncCloudSelects();applyingCloudState=false;document.querySelector('#cloudModePill').textContent='云端已连接';document.querySelector('#cloudModePill').classList.add('cloud-online')}
function syncCloudSelects(){if(!cloudMode||!cloudMembers.length)return;const options=cloudMembers.map(m=>`<option value="${escapeAttr(m.id)}">${escapeHTML(m.name)}</option>`).join('');const select=document.querySelector('#recordForm select[name="assignee"]');if(select){const old=select.value;select.innerHTML='<option value="">未分配</option>'+options;if([...select.options].some(o=>o.value===old))select.value=old}const menu=document.querySelector('#assigneeMenu');menu.innerHTML='<button data-assignee="all">所有成员</button>'+cloudMembers.map(m=>`<button data-assignee="${escapeAttr(m.id)}">${escapeHTML(m.name)}</button>`).join('')}
async function cloudUpdateRecord(id,patch){const r=records.find(x=>x.id===id);if(!cloudMode||!r?.dbId||!['admin','editor'].includes(cloudRole))return;const key=Object.keys(patch).map(field=>`${r.dbId}:${field}`);key.forEach(k=>cloudPendingWrites.add(k));let reload=false;try{const user=(await cloudClient.auth.getUser()).data.user;let query=cloudClient.from('records').update({...patch,updated_by:user.id}).eq('id',r.dbId).eq('workspace_id',cloudWorkspaceId);if(r.updatedAt)query=query.eq('updated_at',r.updatedAt);const {data,error}=await query.select('id,updated_at').maybeSingle();if(error)throw error;if(!data){toast(`${r.id} 已被其他成员修改，本次未覆盖；已同步服务器版本`);reload=true;return}r.updatedAt=data.updated_at;r.updated=new Date(data.updated_at).toLocaleString()}catch(error){console.error(error);toast(`云端保存失败：${error.message||'请检查权限'}`);reload=true}finally{key.forEach(k=>cloudPendingWrites.delete(k));if(reload)await cloudLoad()}}
function showCloudNotice(title,detail){const notice=document.querySelector('#cloudLoginNotice');notice.hidden=false;document.querySelector('#cloudNoticeTitle').textContent=title;document.querySelector('#cloudNoticeDetail').textContent=detail;document.querySelector('#noticeLoginButton').textContent=cloudUserId?'重新检查工作区':'邮箱登录'}
function clearCloudWorkspace(){cloudWorkspaceId=null;cloudRole=null;cloudMembers=[];Object.keys(members).forEach(k=>delete members[k]);records=[];batches=[];document.querySelector('#cloudModePill').classList.remove('cloud-online');document.querySelector('#assigneeFilterButton').disabled=true;document.querySelector('#newRecordButton').hidden=true;document.querySelector('#newBatchButton').hidden=true;document.querySelector('#inviteButton').hidden=true;document.querySelector('#importButton').hidden=true;render()}
async function initCloud(){const cfg=window.LINKROOM_CONFIG||{};if(!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase?.createClient)return;cloudClient=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,detectSessionInUrl:true}});cloudMode=true;document.querySelector('#cloudModePill').textContent='云端未登录';document.querySelector('#authButton').hidden=false;const callbackParams=new URLSearchParams(location.hash.slice(1));const queryParams=new URLSearchParams(location.search);const callbackError=callbackParams.get('error_description')||queryParams.get('error_description');const {data:{session},error:sessionError}=await cloudClient.auth.getSession();if(session)await onCloudLogin(session);else showCloudNotice(callbackError?'登录链接未生效':sessionError?'登录状态读取失败':'请登录后查看工作区',callbackError||sessionError?.message||'共享记录只对已加入工作区的成员开放。');cloudClient.auth.onAuthStateChange((_event,session)=>{if(session){onCloudLogin(session);return}cloudUserId=null;document.querySelector('#authButton').textContent='邮箱登录';document.querySelector('#cloudModePill').textContent='云端未登录';if(cloudChannel){cloudClient.removeChannel(cloudChannel);cloudChannel=null}clearCloudWorkspace();showCloudNotice('请登录后查看工作区','共享记录只对已加入工作区的成员开放。')})}
async function onCloudLogin(session){
  cloudUserId=session.user.id;
  document.querySelector('#authButton').textContent='退出';
  const {data:membership,error}=await cloudClient.from('workspace_members').select('workspace_id,role').eq('user_id',session.user.id).limit(1).maybeSingle();
  if(error||!membership){
    clearCloudWorkspace();
    document.querySelector('#cloudModePill').textContent=error?'工作区读取失败':'尚未加入工作区';
    showCloudNotice(error?'暂时无法读取工作区':'账号尚未加入工作区',error?'请稍后点击“重新检查工作区”。':'请管理员把此邮箱加入工作区，然后点击“重新检查工作区”。');
    return;
  }
  cloudWorkspaceId=membership.workspace_id;
  cloudRole=membership.role;
  cloudMembers=[];
  const {data:memberRows,error:memberError}=await cloudClient.rpc('list_workspace_members',{target_workspace:cloudWorkspaceId});
  if(!memberError&&memberRows){
    cloudMembers=memberRows.map((m,i)=>({id:m.user_id,email:m.email,role:m.role,key:m.user_id,name:m.email||`成员 ${i+1}`,short:(m.email||'?').slice(0,1).toUpperCase(),className:i%2?'avatar-peach':'avatar-purple'}));
    Object.keys(members).forEach(k=>delete members[k]);
    cloudMembers.forEach(m=>members[m.key]=m);
  }else{
    console.error(memberError);
    toast('成员列表暂不可用');
  }
  document.querySelector('#cloudLoginNotice').hidden=true;
  await cloudLoad();
  if(cloudChannel)await cloudClient.removeChannel(cloudChannel);
  cloudChannel=cloudClient.channel(`workspace-${cloudWorkspaceId}`).on('postgres_changes',{event:'*',schema:'public',table:'records',filter:`workspace_id=eq.${cloudWorkspaceId}`},()=>cloudLoad()).on('postgres_changes',{event:'*',schema:'public',table:'batches',filter:`workspace_id=eq.${cloudWorkspaceId}`},()=>cloudLoad()).subscribe();
  document.querySelector('#assigneeFilterButton').disabled=false;
  const canEdit=['admin','editor'].includes(cloudRole);
  document.querySelector('#newRecordButton').hidden=!canEdit;
  document.querySelector('#newBatchButton').hidden=!canEdit;
  document.querySelector('#inviteButton').hidden=cloudRole!=='admin';
  document.querySelector('#importButton').hidden=!canEdit;
}
function scheduleCloudSave(id,patch){if(!cloudMode)return;const key=`${id}:${Object.keys(patch).join(',')}`;clearTimeout(cloudSaveTimers.get(key));cloudSaveTimers.set(key,setTimeout(()=>{cloudSaveTimers.delete(key);cloudUpdateRecord(id,patch)},250))}
function renderBatches(){
  const grid=document.querySelector('#batchGrid');
  const icons=['01','02','03','04','05','06'];
  const classes=['blue-color','violet-color','amber-color'];
  const canEdit=!cloudMode||['admin','editor'].includes(cloudRole);
  grid.innerHTML=`<button class="batch-card ${activeBatch==='all'?'selected':''}" data-batch="all" type="button"><span class="batch-color all-color">▦</span><span class="batch-copy"><strong>全部记录</strong><small>所有批次汇总</small></span><span class="batch-count">${records.length}</span></button>`+batches.map((b,i)=>`<div class="batch-card ${activeBatch===b.id?'selected':''}" data-batch="${escapeAttr(b.id)}" role="button" tabindex="0"><span class="batch-color ${classes[i%classes.length]}">${icons[i%icons.length]}</span><span class="batch-copy"><strong>${escapeHTML(b.name)}</strong><small>${escapeHTML(b.note)}</small></span><span class="batch-count">${records.filter(r=>r.batch===b.id).length}</span>${canEdit?`<span class="batch-tools"><button type="button" data-edit-batch="${escapeAttr(b.id)}" aria-label="编辑批次">✎</button><button type="button" data-delete-batch="${escapeAttr(b.id)}" aria-label="删除批次">×</button></span>`:''}</div>`).join('');
  document.querySelector('.section-count').textContent=`${batches.length} 个批次`;
  document.querySelectorAll('#importBatch, #recordForm select[name="batch"]').forEach(select=>{const value=select.value;select.innerHTML=batches.map(b=>`<option value="${escapeAttr(b.id)}">${escapeHTML(b.name)}</option>`).join('');if(batches.some(b=>b.id===value))select.value=value});
}
function updateStats(){
  const scoped=records.filter(r=>activeBatch==='all'||r.batch===activeBatch);
  document.querySelector('#statTotal').textContent=scoped.length;
  document.querySelector('#statPassed').textContent=scoped.filter(r=>r.status==='已通过').length;
  document.querySelector('#statPending').textContent=scoped.filter(r=>['待处理','处理中'].includes(r.status)).length;
  document.querySelector('#statReview').textContent=scoped.filter(r=>r.status==='待确认').length;
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function escapeAttr(s){return escapeHTML(s)}
function safeLink(value){try{const url=new URL(String(value).trim());return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}}
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500)}
function setStatus(id,status){const r=records.find(x=>x.id===id);if(!r||r.status===status)return;r.status=status;r.updated='刚刚';activity.unshift({who:'Lin Chen',verb:`更新了状态为「${r.status}」`,record:r.id,when:'刚刚',member:'lin'});render();scheduleCloudSave(id,{status});toast(`${r.id} 已更新为「${r.status}」`)}
function setAssignee(id,assignee){const r=records.find(x=>x.id===id);if(!r||r.assignee===assignee)return;if(cloudMode&&!['admin','editor'].includes(cloudRole)){toast('当前账号只有查看权限');render();return}r.assignee=assignee;r.updated='刚刚';render();scheduleCloudSave(id,{assignee:assignee||null});toast(`${r.id} 负责人已更新`)}
function setNote(id,note){const r=records.find(x=>x.id===id);if(!r||r.note===note)return;r.note=note.trim();r.updated='刚刚';render();scheduleCloudSave(id,{note:r.note});toast(`${r.id} 备注已保存`)}
document.querySelector('#batchGrid').addEventListener('click',e=>{const edit=e.target.closest('[data-edit-batch]');if(edit){e.stopPropagation();openBatchDialog(edit.dataset.editBatch);return}const del=e.target.closest('[data-delete-batch]');if(del){e.stopPropagation();deleteBatch(del.dataset.deleteBatch);return}const card=e.target.closest('.batch-card');if(!card)return;activeBatch=card.dataset.batch;document.querySelector('.records-title h2').textContent=activeBatch==='all'?'全部记录':batches.find(b=>b.id===activeBatch)?.name||'全部记录';render()});
document.querySelector('#batchGrid').addEventListener('keydown',e=>{if(e.target.matches('[role="button"].batch-card')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click()}});
searchInput.addEventListener('input',()=>{currentPage=1;render()});
document.querySelector('#sidebarSearch').addEventListener('click',()=>searchInput.focus());
document.querySelector('#paginationControls').addEventListener('click',e=>{const button=e.target.closest('[data-page]');if(!button||button.disabled)return;currentPage=Number(button.dataset.page);render()});
document.querySelector('#paginationControls').addEventListener('change',e=>{if(e.target.id!=='pageSizeSelect')return;pageSize=Number(e.target.value);currentPage=1;render()});
document.querySelector('#statusFilterButton').addEventListener('click',e=>{e.stopPropagation();statusMenu.classList.toggle('open')});
statusMenu.addEventListener('click',e=>{const b=e.target.closest('[data-status]');if(!b)return;activeStatus=b.dataset.status;statusMenu.classList.remove('open');document.querySelector('#statusFilterButton').innerHTML=`<span>☷</span> ${activeStatus==='all'?'状态':activeStatus} <span class="toolbar-chevron">⌄</span>`;render()});
document.addEventListener('click',e=>{if(!e.target.closest('.filter-wrap'))statusMenu.classList.remove('open')});
document.querySelector('#resetFiltersButton').addEventListener('click',()=>{searchInput.value='';activeStatus='all';activeAssignee='all';document.querySelector('#statusFilterButton').innerHTML='<span>☷</span> 状态 <span class="toolbar-chevron">⌄</span>';document.querySelector('#assigneeFilterButton').innerHTML='<span>♙</span> 负责人 <span class="toolbar-chevron">⌄</span>';render()});
document.querySelector('#assigneeFilterButton').addEventListener('click',e=>{e.stopPropagation();document.querySelector('#assigneeMenu').classList.toggle('open')});
document.querySelector('#assigneeMenu').addEventListener('click',e=>{const b=e.target.closest('[data-assignee]');if(!b)return;activeAssignee=b.dataset.assignee;document.querySelector('#assigneeMenu').classList.remove('open');document.querySelector('#assigneeFilterButton').innerHTML=`<span>♙</span> ${activeAssignee==='all'?'负责人':members[activeAssignee].name}<span class="toolbar-chevron">⌄</span>`;render()});
document.querySelector('#newRecordButton').addEventListener('click',()=>recordDialog.showModal());
document.querySelector('#quickLinkForm').addEventListener('submit',async e=>{e.preventDefault();const input=document.querySelector('#quickLinkInput');const url=input.value.trim();if(!url){toast('请输入内容');return}if(records.some(r=>r.url===url)){toast('该链接已经存在');return}if(cloudMode){if(!cloudWorkspaceId||!['admin','editor'].includes(cloudRole)){toast('请先登录有编辑权限的工作区');return}const {data:{user},error:authError}=await cloudClient.auth.getUser();if(authError||!user){toast('登录状态已失效，请重新登录');return}const {error}=await cloudClient.from('records').insert({workspace_id:cloudWorkspaceId,batch_id:batches[0]?.id||null,url,note:'',status:'待处理',created_by:user.id,updated_by:user.id});if(error){toast(`创建失败：${error.message}`);return}await cloudLoad()}else{records.unshift({id:nextId(),url,note:'',status:'待处理',assignee:'',attachments:0,updated:'刚刚',batch:batches[0]?.id||''});render()}input.value='';toast('验证链接已创建')});
document.querySelector('#recordForm').addEventListener('submit',async e=>{e.preventDefault();const form=new FormData(e.currentTarget);const url=form.get('url').trim();const note=form.get('note').trim()||'新建记录，等待补充信息';const batch=form.get('batch');if(cloudMode){if(!cloudWorkspaceId){toast('请先登录并加入工作区');return}const user=(await cloudClient.auth.getUser()).data.user;const dbBatch=batches.find(b=>b.id===batch);const {error}=await cloudClient.from('records').insert({workspace_id:cloudWorkspaceId,batch_id:dbBatch?.id||null,url,note,status:'待处理',assignee:form.get('assignee')||null,created_by:user.id,updated_by:user.id});if(error){toast(`云端创建失败：${error.message}`);return}e.currentTarget.reset();recordDialog.close();await cloudLoad();toast('记录已加入共享台账');return}const id=nextId();records.unshift({id,url,note,status:'待处理',assignee:form.get('assignee'),attachments:0,updated:'刚刚',batch});activity.unshift({who:'Lin Chen',verb:'创建了新记录',record:id,when:'刚刚',member:'lin'});e.currentTarget.reset();recordDialog.close();render();toast(`${id} 已添加到共享台账`) });
document.querySelector('#inviteButton').addEventListener('click',()=>document.querySelector('#inviteDialog').showModal());
document.querySelector('#sendInviteButton').addEventListener('click',async e=>{e.preventDefault();const email=document.querySelector('#inviteEmail').value.trim();const role=document.querySelector('#inviteRole').value;if(!email){toast('请先填写成员邮箱');return}if(!cloudClient||!cloudWorkspaceId||cloudRole!=='admin'){toast('请使用已登录的工作区管理员账号操作');return}const {error}=await cloudClient.rpc('add_workspace_member_by_email',{target_workspace:cloudWorkspaceId,target_email:email,target_role:role});if(error){toast(error.message.includes('has not signed in')?'请先让对方使用此邮箱登录一次，再添加成员':`添加失败：${error.message}`);return}document.querySelector('#inviteDialog').close();document.querySelector('#inviteEmail').value='';toast(`已将 ${email} 添加为${role==='editor'?'编辑者':'查看者'}`);const {data}=await cloudClient.rpc('list_workspace_members',{target_workspace:cloudWorkspaceId});if(data){cloudMembers=data.map((m,i)=>({id:m.user_id,email:m.email,role:m.role,key:m.user_id,name:m.email||`成员 ${i+1}`,short:(m.email||'?').slice(0,1).toUpperCase(),className:i%2?'avatar-peach':'avatar-purple'}));Object.keys(members).forEach(k=>delete members[k]);cloudMembers.forEach(m=>members[m.key]=m);render();syncCloudSelects()}});
document.querySelector('#activityButton').addEventListener('click',async()=>{
  const list=document.querySelector('#activityList');
  if(cloudMode){
    if(!cloudWorkspaceId){toast('请先登录并加入工作区');return}
    const {data,error}=await cloudClient.from('record_activity').select('actor,action,created_at').eq('workspace_id',cloudWorkspaceId).order('created_at',{ascending:false}).limit(20);
    if(error){toast(`读取活动记录失败：${error.message}`);return}
    list.innerHTML=data.length?data.map(item=>`<div class="activity-item"><div class="activity-copy"><div><strong>${escapeHTML(members[item.actor]?.name||'成员')}</strong> ${escapeHTML(item.action)}</div><small>${new Date(item.created_at).toLocaleString()}</small></div></div>`).join(''):'<p>暂无活动记录</p>';
  }else{
    list.innerHTML=activity.slice(0,12).map(item=>`<div class="activity-item"><span class="avatar ${members[item.member]?.className||'avatar-purple'}">${members[item.member]?.short||'?'}</span><div class="activity-copy"><div><strong>${escapeHTML(item.who)}</strong> ${escapeHTML(item.verb)}${item.record?` · <b>${escapeHTML(item.record)}</b>`:''}</div><small>${escapeHTML(item.when)}</small></div></div>`).join('');
  }
  document.querySelector('#activityDialog').showModal();
});
document.querySelector('#newBatchButton').addEventListener('click',()=>openBatchDialog());
function openBatchDialog(id=null){editingBatchId=id;const batch=batches.find(b=>b.id===id);document.querySelector('#batchDialogTitle').textContent=batch?'编辑批次':'新建批次';document.querySelector('#batchNameInput').value=batch?.name||'';document.querySelector('#saveBatchButton').textContent=batch?'保存修改':'创建批次';document.querySelector('#batchDialog').showModal()}
document.querySelector('#batchForm').addEventListener('submit',async e=>{e.preventDefault();const name=document.querySelector('#batchNameInput').value.trim();if(!name)return;if(editingBatchId){const b=batches.find(x=>x.id===editingBatchId);if(cloudMode){const {error}=await cloudClient.from('batches').update({name,updated_at:new Date().toISOString()}).eq('id',editingBatchId);if(error){toast('批次更新失败');return}}b.name=name}else if(cloudMode){if(!cloudWorkspaceId){toast('请先登录并加入工作区');return}const user=(await cloudClient.auth.getUser()).data.user;const {error}=await cloudClient.from('batches').insert({workspace_id:cloudWorkspaceId,name,created_by:user.id});if(error){toast(`创建批次失败：${error.message}`);return}}else batches.push({id:`batch-${Date.now()}`,name,note:'刚刚创建'});document.querySelector('#batchDialog').close();if(cloudMode)await cloudLoad();else render();toast(editingBatchId?'批次已更新':'批次已创建');editingBatchId=null});
async function deleteBatch(id){const b=batches.find(x=>x.id===id);if(!b||!confirm(`删除批次「${b.name}」？其中记录会移到未分配。`))return;if(cloudMode){const {error}=await cloudClient.from('batches').delete().eq('id',id);if(error){toast('删除批次失败');return}await cloudLoad()}else{records.forEach(r=>{if(r.batch===id)r.batch='dec'});batches=batches.filter(x=>x.id!==id);if(activeBatch===id)activeBatch='all';render()}toast('批次已删除')}
async function deleteRecord(id){const r=records.find(x=>x.id===id);if(!r||!confirm(`删除记录 ${id}？`))return;if(cloudMode){const {error}=await cloudClient.from('records').delete().eq('id',r.dbId);if(error){toast('删除记录失败');return}await cloudLoad()}else{records=records.filter(x=>x.id!==id);render()}toast('记录已删除')}
document.querySelector('#importButton').addEventListener('click',()=>document.querySelector('#importDialog').showModal());
const pasteLinks=document.querySelector('#pasteLinks');
function extractUrls(text){const matches=text.match(/https?:\/\/[^\s<>"'，。；、）)\]]+/gi)||[];return [...new Set(matches.map(s=>s.replace(/[.,!?;:]+$/,'')).filter(Boolean))]}
function updateImportPreview(){const urls=extractUrls(pasteLinks.value);const existing=new Set(records.map(r=>r.url.replace(/[.,!?;:]+$/,'')));const fresh=urls.filter(url=>!existing.has(url));const duplicate=urls.length-fresh.length;document.querySelector('#importPreview').textContent=urls.length?`识别到 ${urls.length} 条链接 · ${fresh.length} 条可导入${duplicate?` · ${duplicate} 条重复将跳过`:''}`:'粘贴内容后预览识别结果';document.querySelector('#confirmImportButton').disabled=fresh.length===0;document.querySelector('#confirmImportButton').dataset.urls=JSON.stringify(fresh)}
pasteLinks.addEventListener('input',updateImportPreview);
document.querySelector('#chooseCsvButton').addEventListener('click',()=>document.querySelector('#csvInput').click());
document.querySelector('#csvInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;pasteLinks.value=await file.text();updateImportPreview();e.target.value=''});
document.querySelector('#confirmImportButton').addEventListener('click',async()=>{const urls=JSON.parse(document.querySelector('#confirmImportButton').dataset.urls||'[]');const batch=document.querySelector('#importBatch').value;if(cloudMode){if(!cloudWorkspaceId){toast('请先登录并加入工作区');return}const user=(await cloudClient.auth.getUser()).data.user;const payload=urls.map(url=>({workspace_id:cloudWorkspaceId,batch_id:batch,url,note:'从微信或文本导入',status:'待处理',created_by:user.id,updated_by:user.id}));const {error}=await cloudClient.from('records').insert(payload);if(error){toast(`导入失败：${error.message}`);return}await cloudLoad()}else urls.forEach(url=>records.unshift({id:nextId(),url,note:'从微信或文本导入',status:'待处理',assignee:'lin',attachments:0,updated:'刚刚',batch}));document.querySelector('#importDialog').close();pasteLinks.value='';updateImportPreview();render();toast(`已导入 ${urls.length} 条链接到「${batches.find(b=>b.id===batch)?.name||'批次'}」`)});
document.querySelector('#exportButton').addEventListener('click',()=>{const header=['编号','链接','备注','状态','负责人','附件数量','批次'];const lines=records.map(r=>[r.id,r.url,r.note,r.status,members[r.assignee]?.name||'未分配',r.attachments,r.batch].map(x=>`"${String(x).replaceAll('"','""')}"`).join(','));const blob=new Blob(['\ufeff'+[header.join(','),...lines].join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='linkroom-records.csv';a.click();URL.revokeObjectURL(a.href);toast('记录已导出为 CSV')});
document.querySelector('#imageInput').addEventListener('change',e=>{const files=[...e.target.files];if(!pendingRecordId||!files.length)return;const r=records.find(x=>x.id===pendingRecordId);r.attachments+=files.length;r.updated='刚刚';activity.unshift({who:'Lin Chen',verb:`添加了 ${files.length} 个附件`,record:r.id,when:'刚刚',member:'lin'});render();toast(`已添加 ${files.length} 个图片附件（演示模式）`);e.target.value=''});
document.querySelector('#selectAll').addEventListener('change',e=>document.querySelectorAll('.row-check').forEach(c=>c.checked=e.target.checked));
document.querySelector('#authButton').addEventListener('click',async()=>{if(!cloudMode){document.querySelector('#authDialog').showModal();return}const {data:{session}}=await cloudClient.auth.getSession();if(session){await cloudClient.auth.signOut();toast('已退出共享工作区')}else document.querySelector('#authDialog').showModal()});
document.querySelector('#noticeLoginButton').addEventListener('click',async()=>{if(!cloudUserId){document.querySelector('#authButton').click();return}const {data:{session}}=await cloudClient.auth.getSession();if(session)await onCloudLogin(session)});
document.querySelector('#settingsButton').addEventListener('click',openSettings);
document.querySelector('#settingsInviteButton').addEventListener('click',()=>{document.querySelector('#settingsDialog').close();document.querySelector('#inviteDialog').showModal()});
document.querySelector('#settingsAuthButton').addEventListener('click',()=>{document.querySelector('#settingsDialog').close();document.querySelector('#authButton').click()});
document.querySelector('#settingsForm').addEventListener('submit',e=>{e.preventDefault();localSettings.workspaceName=document.querySelector('#workspaceNameInput').value.trim()||'Linkroom 工作区';localSettings.retention=document.querySelector('#retentionSelect').value;const nextStatuses=[...document.querySelectorAll('.status-settings input')].map(i=>i.value.trim()).filter(Boolean);if(nextStatuses.length)localSettings.statuses=nextStatuses;document.querySelector('.workspace-name strong').textContent=localSettings.workspaceName;document.querySelector('#statusMenu').innerHTML='<button data-status="all">所有状态</button>'+localSettings.statuses.map(s=>`<button data-status="${escapeAttr(s)}">${escapeHTML(s)}</button>`).join('');document.querySelector('#settingsDialog').close();persist();render();toast('工作区设置已保存到当前浏览器')});
function openSettings(){document.querySelector('#workspaceNameInput').value=localSettings.workspaceName;document.querySelector('#retentionSelect').value=localSettings.retention;document.querySelector('.status-settings').innerHTML=localSettings.statuses.map(s=>`<label class="status-setting-item"><input value="${escapeAttr(s)}" maxlength="20" aria-label="状态名称" /><button type="button" aria-label="删除状态">×</button></label>`).join('')+'<button type="button" class="add-status-button">＋ 添加状态</button>';document.querySelectorAll('.status-setting-item button').forEach(b=>b.addEventListener('click',()=>b.closest('.status-setting-item').remove()));document.querySelector('.add-status-button').addEventListener('click',()=>{const item=document.createElement('label');item.className='status-setting-item';item.innerHTML='<input maxlength="20" placeholder="新状态" aria-label="状态名称" /><button type="button" aria-label="删除状态">×</button>';item.querySelector('button').addEventListener('click',()=>item.remove());document.querySelector('.add-status-button').before(item);item.querySelector('input').focus()});const online=!!cloudWorkspaceId;document.querySelector('#settingsConnectionState').textContent=online?'Supabase 云端已连接':cloudMode?'Supabase 已配置，尚未登录':'本机演示模式';document.querySelector('#settingsConnectionDetail').textContent=online?'记录变更会同步到当前成员工作区。':cloudMode?'登录并加入工作区后可读取共享记录。':'尚未连接 Supabase，数据只在本浏览器保存。';document.querySelector('.connection-light').style.background=online?'#35ad7b':'#d9a148';document.querySelector('#settingsDialog').showModal()}
const originalOpenSettings=openSettings;
openSettings=function(){
  const list=document.querySelector('#settingsMemberList');
  const people=cloudMode?cloudMembers:Object.values(members);
  list.innerHTML=people.length?people.map(m=>`<div class="member-setting"><span class="avatar ${m.className}">${escapeHTML(m.short)}</span><span><strong>${escapeHTML(m.name)}</strong><small>${m.id===cloudUserId?'当前用户':'工作区成员'}</small></span><span class="role-pill">${m.role==='admin'?'管理员':m.role==='editor'?'编辑者':m.role==='viewer'?'查看者':'演示成员'}</span></div>`).join(''):'<p class="settings-hint">登录并加入工作区后显示成员。</p>';
  document.querySelector('#settingsInviteButton').hidden=cloudMode&&cloudRole!=='admin';
  document.querySelector('#settingsAuthButton').textContent=cloudUserId?'退出登录':'邮箱登录';document.querySelector('#settingsPasswordButton').hidden=!cloudUserId;
  originalOpenSettings();
};
async function sendEmailLogin(){if(!cloudClient){toast('云端登录尚未配置');return}const email=document.querySelector('#authEmail').value.trim();if(!document.querySelector('#authEmail').reportValidity())return;const {error}=await cloudClient.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:false}});if(error){toast(`登录链接发送失败：${error.message}`);return}document.querySelector('#authDialog').close();toast('登录链接已发送，请检查邮箱')}
document.querySelector('#emailLoginButton').addEventListener('click',sendEmailLogin);
document.querySelector('#authForm').addEventListener('submit',async e=>{e.preventDefault();if(!cloudClient){toast('云端登录尚未配置');return}const email=document.querySelector('#authEmail').value.trim();const password=document.querySelector('#authPassword').value;if(!password){toast('请输入密码，或点击“发送邮件链接”');return}const {error}=await cloudClient.auth.signInWithPassword({email,password});if(error){toast(`密码登录失败：${error.message}`);return}document.querySelector('#authDialog').close();document.querySelector('#authPassword').value='';toast('已登录')});
document.querySelector('#settingsPasswordButton').addEventListener('click',()=>{document.querySelector('#settingsDialog').close();document.querySelector('#passwordDialog').showModal()});
document.querySelector('#passwordForm').addEventListener('submit',async e=>{e.preventDefault();const password=document.querySelector('#newPassword').value;const confirmation=document.querySelector('#confirmPassword').value;if(password!==confirmation){toast('两次输入的密码不一致');return}if(password.length<12){toast('密码至少需要 12 个字符');return}const {data:{user},error:authError}=await cloudClient.auth.getUser();if(authError||!user){toast('请先通过邮件登录');return}const {error}=await cloudClient.auth.updateUser({password});if(error){toast(`设置密码失败：${error.message}`);return}e.currentTarget.reset();document.querySelector('#passwordDialog').close();toast('密码已设置，下次可直接使用密码登录')});function nextId(){const max=records.reduce((n,r)=>Math.max(n,Number(r.id.replace('LR-',''))||0),128);return `LR-${String(max+1).padStart(4,'0')}`}
render();
if(cloudMode)clearCloudWorkspace();
initCloud();
