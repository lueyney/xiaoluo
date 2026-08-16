const state={current:'dashboard',admin:{name:'超级管理员',role:'super_admin'},dateRange:{start:'2026-04-05',end:'2026-04-11'}};
const base={users:510000,dau:11200,revenue:90000,docs:18600,pay:17.8};
const meta={profiles:[['论文写作用户','12,480','近7天完成 1 次以上论文生成'],['降重付费用户','3,160','累计购买降重或润色服务'],['沉默用户','28,940','近30天未再次进入站内'],['邀请裂变用户','6,920','来自邀请海报或口令分享']],notes:Array.from({length:7},(_,i)=>({title:['系统升级提醒','积分到账提醒','订单状态更新'][i%3],user:`用户${i+1}`,category:['系统','营销','订单'][i%3],status:i%2?'已读':'未读'})),sys:{node:'v22.x',env:'frontend-review',port:3001,uptime:'6h 28m',db:'connected(mock)'},admins:[['admin','超级管理员','super_admin'],['ops_lead','运营主管','ops']]};
const names=['小珞学员A','论文冲刺B','答辩同学C','研一用户D','毕设助手E','文献用户F','开题同学G','降重用户H'],products=['论文写作','论文降重','开题报告','文献综述','任务书生成','答辩稿生成','AI润色','参考文献整理'],docTypes=['开题报告','文献综述','论文初稿','任务书','答辩稿','研究方案'],colors={b:'#155eef',s:'#475569',g:'#12b886',o:'#f08c00',p:'#7c3aed'};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],badge=(t,y)=>`<span class="badge ${y}">${t}</span>`,tone=t=>/完成|支付|启用|已读/.test(t)?'good':/处理|待/.test(t)?'warn':/取消|关闭|禁用|未读/.test(t)?'bad':'neutral';
const days=()=>{const s=new Date(`${state.dateRange.start}T00:00:00`),e=new Date(`${state.dateRange.end}T00:00:00`);const d=Math.max(1,Math.round((e-s)/864e5)+1);return Number.isNaN(d)?7:d},seed=()=>{const s=+new Date(`${state.dateRange.start}T00:00:00`),e=+new Date(`${state.dateRange.end}T00:00:00`);return Math.abs(Math.round(((isNaN(s)?0:s)+(isNaN(e)?0:e))/864e5))},curve=n=>[1.03,1.09,1.12,.98,.95,1.16,.9].map((v,i)=>v+(((n+i)%3)-1)*.01),fdate=v=>{const d=new Date(`${v}T00:00:00`);return`${d.getMonth()+1}/${d.getDate()}`},series=()=>{const s=new Date(`${state.dateRange.start}T00:00:00`);const len=Math.min(7,Math.max(1,days()));return Array.from({length:len},(_,i)=>{const d=new Date(s);d.setDate(s.getDate()+i);const iso=d.toISOString().slice(0,10);return{iso,label:fdate(iso)}})};
function tip(){let t=$('#chartTooltip');if(!t){t=document.createElement('div');t.id='chartTooltip';t.className='chart-tooltip';document.body.appendChild(t)}return t}
function show(e,title,rows,c){const t=tip();t.innerHTML=`<div class="chart-tooltip-title">${title}</div>${rows.map(x=>`<div class="chart-tooltip-row"><span class="chart-tooltip-dot" style="background:${c}"></span><span>${x}</span></div>`).join('')}`;t.classList.add('show');t.style.left=`${e.clientX+16}px`;t.style.top=`${e.clientY+16}px`}
function hide(){tip().classList.remove('show')}
function dash(){const d=days(),s=seed(),c=curve(s),f=Math.max(.88,Math.min(1.18,d/7)),u=Math.round(base.users+(d-7)*380+(s%5)*26),a=Math.round(base.dau*f+d*42+((s%7)-3)*85),r=Math.round(base.revenue*f+d*620+((s%9)-4)*460),o=Math.round(base.docs*f+d*84+((s%6)-2)*120),p=(base.pay+(d-7)*.08+((s%5)-2)*.12).toFixed(1),x=series();return{x,summary:[['用户总数',u.toLocaleString(),'站内累计注册用户'],['日活用户',a.toLocaleString(),'当前周期平均 DAU'],['累计收入',`¥${r.toLocaleString()}`,'站内累计成交收入'],['付费转化',`${p}%`,'当前时间段转化'],['文档总量',o.toLocaleString(),'站内累计生成内容'],['运行状态','稳定',`${d} 天视图已更新`]],trend:c.map((k,i)=>Math.round((820+d*18+i*26+(s%11)*9)*k)),active:c.map((k,i)=>Math.round(a*(k+(i%2?.015:-.01)))),rev:c.map((k,i)=>Math.round((r/7)*(k+(i===5?.18:0)+(i===6?-.08:0)))),channels:[{name:'自然搜索',value:Math.round(42-d*.15+(s%3)),color:colors.b},{name:'活动投放',value:Math.round(23+d*.22+(s%4)),color:colors.g},{name:'老客召回',value:Math.round(19+(s%2)),color:'#f59f00'},{name:'邀请分享',value:Math.round(16-d*.04+(s%2)),color:colors.p}],activity:[{label:'登录',value:Math.round(a/118)},{label:'论文生成',value:Math.round(o/228)},{label:'降重支付',value:Math.round(r/1650)},{label:'导出下载',value:Math.round(o/348)},{label:'邀请裂变',value:Math.round(u/13200)}],outputs:[['生成文档总量',`${o.toLocaleString()} 份`,'区间内论文、开题与范文生成'],['平均支付金额',`¥${Math.round(r/Math.max(d*195,1))}`,'按有效支付订单估算'],['新增用户',`${Math.round(d*286+f*410+(s%8)*23).toLocaleString()} 人`,'来自当前筛选时间段'],['订单转化率',`${p}%`,'与支付成功订单相关']]}}
function data(){const d=days(),s=seed(),c=curve(s),x=series(),users=Array.from({length:8},(_,i)=>({id:i+1,name:names[(s+i)%names.length],phone:`13${(s+58+i)%9}${String(1e7+((s*37+i*913)%9e7)).padStart(8,'0')}`,credits:260+d*38+i*160+((s+i)%3)*35,spend:49+d*22+i*54+((s+i)%4)*11,status:(s+i)%6===0?'禁用':'启用'})),b=1180+d*42+(s%9)*18,ok=69+(d%5)+(s%3),wait=18-((d+s)%3),close=100-ok-wait;return{x,users,orders:c.map((k,i)=>Math.round(b*k+(i===5?140:0)+(i===6?-60:0))),orderRows:Array.from({length:7},(_,i)=>({no:`ORD${state.dateRange.end.replace(/-/g,'')}${1000+i}`,user:users[i%users.length].name,amount:`¥${(59+d*4+i*18+((s+i)%3)*6).toFixed(2)}`,type:products[(s+i)%products.length],status:i===1||i===4?'处理中':i===6&&s%2===0?'已取消':'已完成'})),paymentStatus:[{name:'已支付',value:ok,color:colors.b},{name:'待支付',value:wait,color:'#f59f00'},{name:'已关闭',value:close,color:'#cbd5e1'}],paymentRows:Array.from({length:7},(_,i)=>({no:`PAY${state.dateRange.end.replace(/-/g,'')}${2000+i}`,user:users[(i+2)%users.length].name,amount:`¥${(69+d*5+i*16+((s+i)%2)*9).toFixed(2)}`,credits:180+d*26+i*86,status:i<4?'已支付':i<6?'待支付':'已关闭'})),docBars:docTypes.slice(0,4).map((label,i)=>({label,value:Math.round((860+d*28+i*160+(s%5)*22)*(c[i+1]||1)),color:[colors.b,colors.g,colors.o,colors.p][i]})),docRows:Array.from({length:7},(_,i)=>({title:`${docTypes[(s+i)%docTypes.length]}示例 ${i+1}`,type:docTypes[(s+i)%docTypes.length],owner:users[(i+1)%users.length].name,words:3600+d*110+i*480+((s+i)%3)*160}))}}
function metaData(){const d=days(),s=seed(),x=series(),last=x[x.length-1]?.label||state.dateRange.end;return{profiles:[['论文写作用户',`${(10800+d*156+s%300).toLocaleString()}`,'当前区间内至少完成 1 次论文生成'],['降重付费用户',`${(2800+d*48+s%120).toLocaleString()}`,'当前区间内完成降重付费'],['沉默用户',`${(25000+d*210+s%500).toLocaleString()}`,'近30天未再次进入站内'],['邀请裂变用户',`${(6200+d*66+s%160).toLocaleString()}`,'来自邀请码或分享海报']],notes:Array.from({length:7},(_,i)=>({title:['系统升级提醒','积分到账提醒','订单状态更新','区间统计推送'][i%4],user:`用户${(s+i)%8+1}`,category:['系统','营销','订单','报表'][i%4],status:(s+i)%3===0?'未读':'已读',time:x[i%x.length]?.label||last})),sys:{...meta.sys,uptime:`${d*3+(s%5)}h ${18+(s%37)}m`,window:`${state.dateRange.start} ~ ${state.dateRange.end}`}}}
function render(){({dashboard:rd,users:ru,orders:ro,payments:rp,documents:rf,notifications:rn,system:rs}[state.current]||rd)()}
function rd(){const d=dash();$('#summaryGrid').innerHTML=d.summary.map(([l,v,m])=>`<div class="summary-card"><div class="label">${l}</div><div class="value">${v}</div><div class="meta">${m}</div></div>`).join('');line('#userTrendChart',d.x,d.trend,{c:colors.b,f:'rgba(21,94,239,.16)',n:'新增用户'});line('#activeTrendChart',d.x,d.active,{c:colors.s,f:'rgba(71,85,105,.14)',n:'DAU'});donut('#channelDonut','#channelLegend',d.channels);hbars('#activityChart',d.activity,{c:colors.b,n:'行为数'});hbars('#revenueChart',d.x.map((v,i)=>({label:v.label,value:d.rev[i],color:colors.g})),{c:colors.g,n:'收入'});$('#outputStats').innerHTML=d.outputs.map(i=>`<div class="metric-item"><div><strong>${i[0]}</strong><span>${i[2]}</span></div><div class="item-value">${i[1]}</div></div>`).join('')}
function ru(){const g=data(),m=metaData();$('#usersTable').innerHTML=table(['ID','用户','手机号','累计消费','状态','操作'],g.users.map(x=>`<tr><td><strong>#${x.id}</strong></td><td><strong>${x.name}</strong><br>${x.phone}</td><td>${x.credits}</td><td>¥${x.spend}</td><td>${badge(x.status,tone(x.status))}</td><td><div class="table-actions"><button class="table-btn">查看</button><button class="table-btn">积分</button></div></td></tr>`).join(''));$('#userProfiles').innerHTML=m.profiles.map(x=>`<div class="mini-item"><div class="item-main"><strong>${x[0]}</strong><span>${x[2]}</span></div><div class="item-value">${x[1]}</div></div>`).join('')}
function ro(){const g=data();hbars('#orderTrendChart',g.x.map((v,i)=>({label:v.label,value:g.orders[i],color:colors.b})),{c:colors.b,n:'订单量'});$('#ordersTable').innerHTML=table(['订单号','用户','金额','类型','状态'],g.orderRows.map(x=>`<tr><td><strong>${x.no}</strong></td><td>${x.user}</td><td>${x.amount}</td><td>${x.type}</td><td>${badge(x.status,tone(x.status))}</td></tr>`).join(''))}
function rp(){const g=data();donut('#paymentDonut','#paymentLegend',g.paymentStatus);$('#paymentsTable').innerHTML=table(['支付单号','用户','金额','积分','状态'],g.paymentRows.map(x=>`<tr><td><strong>${x.no}</strong></td><td>${x.user}</td><td>${x.amount}</td><td>${x.credits}</td><td>${badge(x.status,tone(x.status))}</td></tr>`).join(''))}
function rf(){const g=data();hbars('#documentChart',g.docBars,{c:colors.o,n:'文档量'});$('#documentsTable').innerHTML=table(['标题','类型','作者','字数'],g.docRows.map(x=>`<tr><td><strong>${x.title}</strong></td><td>${x.type}</td><td>${x.owner}</td><td>${x.words}</td></tr>`).join(''))}
function rn(){$('#notificationsTable').innerHTML=table(['标题','用户','分类','状态'],meta.notes.map(x=>`<tr><td><strong>${x.title}</strong></td><td>${x.user}</td><td>${badge(x.category,'neutral')}</td><td>${badge(x.status,tone(x.status))}</td></tr>`).join(''))}
function rn(){const m=metaData();$('#notificationsTable').innerHTML=table(['标题','用户','分类','状态'],m.notes.map(x=>`<tr><td><strong>${x.title}</strong><br><span style="color:#94a3b8;font-size:12px;">${x.time}</span></td><td>${x.user}</td><td>${badge(x.category,'neutral')}</td><td>${badge(x.status,tone(x.status))}</td></tr>`).join(''))}
function rs(){const m=metaData();$('#systemInfo').textContent=JSON.stringify(m.sys,null,2);$('#adminList').innerHTML=meta.admins.map(x=>`<div class="admin-item"><div class="item-main"><strong>${x[1]}</strong><span>${x[0]}</span></div><div class="item-value">${x[2]}</div></div>`).join('')}
function line(t,ds,vs,o){const el=$(t),w=760,h=300,p={t:18,r:20,b:40,l:20},mx=Math.max(...vs,1),mn=Math.min(...vs),rg=Math.max(mx-mn,1),st=(w-p.l-p.r)/Math.max(vs.length-1,1),ps=vs.map((v,i)=>({x:p.l+i*st,y:p.t+(h-p.t-p.b)*(1-((v-mn)/rg)*.88-.04),v,l:ds[i].label})),d=ps.map((q,i)=>`${i?'L':'M'} ${q.x} ${q.y}`).join(' '),a=`M ${ps[0].x} ${h-p.b} `+ps.map((q,i)=>`${i?'L':'M'} ${q.x} ${q.y}`).join(' ')+` L ${ps.at(-1).x} ${h-p.b} Z`;el.innerHTML=`<svg class="chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="g${t[1]}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${o.f}"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></linearGradient></defs>${[0,1,2,3].map(i=>`<line x1="${p.l}" y1="${p.t+((h-p.t-p.b)/4)*i}" x2="${w-p.r}" y2="${p.t+((h-p.t-p.b)/4)*i}" class="chart-grid"/>`).join('')}<path d="${a}" fill="url(#g${t[1]})"/><path d="${d}" class="chart-line" style="--stroke:${o.c}"/>${ps.map(q=>`<circle cx="${q.x}" cy="${q.y}" r="5" class="chart-node" style="--stroke:${o.c};--fill:${o.c}"/>`).join('')}${ps.map(q=>`<rect x="${q.x-18}" y="${p.t}" width="36" height="${h-p.t-p.b}" fill="transparent" data-l="${q.l}" data-v="${q.v}"/>`).join('')}${ps.map(q=>`<text x="${q.x}" y="${h-12}" text-anchor="middle" class="chart-axis-label">${q.l}</text>`).join('')}</svg>`;el.querySelectorAll('rect[data-l]').forEach(n=>{n.onmousemove=e=>show(e,n.dataset.l,[`${o.n}：${(+n.dataset.v).toLocaleString()}`],o.c);n.onmouseleave=hide})}
function bars(t,list,o){const el=$(t),mx=Math.max(...list.map(i=>i.value),1);el.innerHTML=`<div class="chart-bars">${list.map(i=>`<div class="chart-bar-item"><div class="chart-bar-top">${i.value.toLocaleString()}</div><div class="chart-bar-track"><div class="chart-bar-fill" style="height:${Math.max(14,i.value/mx*100)}%;--bar:${i.color||o.c}"></div></div><div class="chart-bar-label">${i.label}</div></div>`).join('')}</div>`;el.querySelectorAll('.chart-bar-fill').forEach((n,i)=>{n.onmousemove=e=>show(e,list[i].label,[`${o.n}：${list[i].value.toLocaleString()}`],list[i].color||o.c);n.onmouseleave=hide})}
function hbars(t,list,o){const el=$(t),mx=Math.max(...list.map(i=>i.value),1);el.innerHTML=`<div class="chart-hbars">${list.map(i=>`<div class="chart-hbar-item"><div class="chart-hbar-head"><span>${i.label}</span><strong>${i.value.toLocaleString()}</strong></div><div class="chart-hbar-track"><div class="chart-hbar-fill" style="width:${Math.max(12,i.value/mx*100)}%;--bar:${i.color||o.c}" data-label="${i.label}" data-value="${i.value}"></div></div></div>`).join('')}</div>`;el.querySelectorAll('.chart-hbar-fill').forEach(n=>{n.onmousemove=e=>show(e,n.dataset.label,[`${o.n}：${Number(n.dataset.value).toLocaleString()}`],n.style.getPropertyValue('--bar')||o.c);n.onmouseleave=hide})}
function donut(t,l,items){let c=0;const total=items.reduce((s,i)=>s+i.value,0),g=items.map(i=>{const a=c;c+=i.value/total*100;return`${i.color} ${a}% ${c}%`}).join(', ');$(t).style.background=`conic-gradient(${g})`;$(l).innerHTML=items.map(i=>`<div class="legend-row"><span class="legend-swatch" style="background:${i.color}"></span><span>${i.name}</span><strong>${i.value}%</strong></div>`).join('')}
const table=(h,r)=>`<div class="table-shell"><table><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${r}</tbody></table></div>`;
function toast(m){const e=$('#toast');e.textContent=m;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2200)}
function renderAll(){rd();ru();ro();rp();rf();rn();rs()}
document.addEventListener('DOMContentLoaded',()=>{$('#loginForm').addEventListener('submit',login);$('#logoutBtn').addEventListener('click',logout);$('#refreshBtn').addEventListener('click',()=>{render();toast('页面已刷新')});$('#homeQuickBtn')?.addEventListener('click',()=>{state.current='dashboard';$$('#menu .nav-item').forEach(x=>x.classList.toggle('active',x.dataset.section==='dashboard'));$$('.panel-page').forEach(x=>x.classList.toggle('active',x.id==='section-dashboard'));$('#sectionTitle').textContent='经营总览';render();toast('已返回总览')});$('#settingsQuickBtn')?.addEventListener('click',()=>{state.current='system';$$('#menu .nav-item').forEach(x=>x.classList.toggle('active',x.dataset.section==='system'));$$('.panel-page').forEach(x=>x.classList.toggle('active',x.id==='section-system'));$('#sectionTitle').textContent='系统管理';render();toast('已打开系统管理')});$('#layoutQuickBtn')?.addEventListener('click',()=>toast('布局模式已切换'));$('#notificationForm').addEventListener('submit',e=>{e.preventDefault();toast('通知已模拟发送');e.target.reset()});$('#userSearchBtn').addEventListener('click',()=>{ru();toast('用户列表已刷新')});$('#applyDateBtn').addEventListener('click',()=>{state.dateRange.start=$('#startDate').value;state.dateRange.end=$('#endDate').value;renderAll();toast(`已切换到 ${state.dateRange.start} 至 ${state.dateRange.end}`)});$('#menu').addEventListener('click',e=>{const g=e.target.closest('[data-role="group-toggle"]');if(g){g.parentElement.classList.toggle('collapsed');return}const b=e.target.closest('.nav-item');if(!b)return;state.current=b.dataset.section;$$('#menu .nav-item').forEach(x=>x.classList.toggle('active',x===b));$$('.panel-page').forEach(x=>x.classList.toggle('active',x.id===`section-${b.dataset.section}`));$('#sectionTitle').textContent=b.textContent.replace(/^[A-Z]{2}\s*/, '').trim();render()});const tabs=$('#consoleTabs');tabs.querySelectorAll('.console-tab').forEach((t,i)=>{if(i&&!t.querySelector('.tab-close'))t.insertAdjacentHTML('beforeend','<span class="tab-close" data-role="tab-close">×</span>')});tabs.addEventListener('click',e=>{const close=e.target.closest('[data-role="tab-close"]');const tab=e.target.closest('.console-tab');if(close&&tab){const active=tab.classList.contains('active');tab.remove();if(active){const next=tabs.querySelector('.console-tab');if(next)next.classList.add('active')}return}if(tab){tabs.querySelectorAll('.console-tab').forEach(x=>x.classList.toggle('active',x===tab))}});renderAll()});
function login(e){e.preventDefault();$('#loginScreen').classList.add('hidden');$('#adminLayout').classList.remove('hidden');$('#adminMeta').innerHTML=`已登录<br>${state.admin.name}<br>${state.admin.role}`;toast('登录成功')}
function logout(){$('#adminLayout').classList.add('hidden');$('#loginScreen').classList.remove('hidden');toast('已退出登录')}

// 顶部全功能交互增强
document.addEventListener('DOMContentLoaded',()=>{
  const layout=$('#adminLayout');
  const menu=$('#menu');
  const sectionTitle=$('#sectionTitle');
  const tabs=$('#consoleTabs');
  const topSearch=document.querySelector('.top-search input');

  const gotoSection=(section,title)=>{
    state.current=section;
    $$('#menu .nav-item').forEach(x=>x.classList.toggle('active',x.dataset.section===section));
    $$('.panel-page').forEach(x=>x.classList.toggle('active',x.id===`section-${section}`));
    if(title)sectionTitle.textContent=title;
    render();
  };

  const toggleSidebar=()=>{
    layout.classList.toggle('sidebar-collapsed');
    toast(layout.classList.contains('sidebar-collapsed')?'侧栏已收起':'侧栏已展开');
  };

  const toggleCompact=()=>{
    document.body.classList.toggle('layout-compact');
    toast(document.body.classList.contains('layout-compact')?'已切换紧凑布局':'已切换标准布局');
  };

  const toggleWatermark=()=>{
    document.body.classList.toggle('watermark-on');
    toast(document.body.classList.contains('watermark-on')?'已开启水印':'已关闭水印');
  };

  const copyCurrent=async()=>{
    const text=`当前页面：${sectionTitle.textContent.trim()}`;
    try{await navigator.clipboard.writeText(text);toast('已复制当前页面信息')}catch{toast('复制失败，请检查权限')}
  };

  const runCommand=(raw)=>{
    const cmd=(raw||'').trim().toLowerCase();
    if(!cmd)return;
    if(['home','dashboard','总览','首页'].includes(cmd))return gotoSection('dashboard','经营总览');
    if(['users','用户','用户分析'].includes(cmd))return gotoSection('users','用户分析');
    if(['orders','订单','订单分析'].includes(cmd))return gotoSection('orders','订单分析');
    if(['payments','支付','支付分析'].includes(cmd))return gotoSection('payments','支付分析');
    if(['documents','文档','文档分析'].includes(cmd))return gotoSection('documents','文档分析');
    if(['notice','通知','通知中心'].includes(cmd))return gotoSection('notifications','通知中心');
    if(['system','设置','系统管理'].includes(cmd))return gotoSection('system','系统管理');
    if(['layout','lay','布局'].includes(cmd))return toggleCompact();
    if(['watermark','水印'].includes(cmd))return toggleWatermark();
    toast(`未识别指令：${raw}`);
  };

  // 覆盖原先静态/弱交互按钮
  const bindOverride=(selector,handler)=>{
    const el=$(selector);
    if(!el)return;
    el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();handler();},{capture:true});
  };

  bindOverride('.console-toggle',toggleSidebar);
  bindOverride('#homeQuickBtn',()=>gotoSection('dashboard','经营总览'));
  bindOverride('#layoutQuickBtn',toggleCompact);
  bindOverride('#settingsQuickBtn',()=>gotoSection('system','系统管理'));

  if(topSearch){
    topSearch.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        runCommand(topSearch.value);
      }
    });
  }

  // 面包屑改为可点击导航
  $$('.breadcrumb-row span').forEach(el=>{
    const t=el.textContent.trim();
    if(!t||t==='/')return;
    el.style.cursor='pointer';
    el.addEventListener('click',()=>{
      if(t==='首页'||t==='经营总览')return gotoSection('dashboard','经营总览');
      if(t==='权限管理')return gotoSection('users','用户分析');
    });
  });

  // 顶部 tabs 功能化
  if(tabs){
    tabs.addEventListener('click',e=>{
      const tab=e.target.closest('.console-tab');
      if(!tab||e.target.closest('[data-role="tab-close"]'))return;
      const label=tab.textContent.replace('×','').trim();
      if(label==='按钮级别')gotoSection('dashboard','经营总览');
      else if(label==='菜单级别')toggleSidebar();
      else if(label==='数据效果'){renderAll();toast('数据面板已刷新')}
      else if(label==='Dashboard')gotoSection('dashboard','经营总览');
      else if(label==='复制')copyCurrent();
      else if(label==='水印')toggleWatermark();
      else if(label==='防抖'){window.__debounceMode=!window.__debounceMode;toast(window.__debounceMode?'防抖已开启':'防抖已关闭')}
      else if(label==='节流'){window.__throttleMode=!window.__throttleMode;toast(window.__throttleMode?'节流已开启':'节流已关闭')}
    });
  }

  const userPill=document.querySelector('.user-pill');
  if(userPill){
    userPill.style.cursor='pointer';
    userPill.addEventListener('click',()=>gotoSection('system','系统管理'));
  }
});
