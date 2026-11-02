// ══════════════ Caixa de Entrada (DP, 02/11/2026) ══════════════
// Substitui o antigo "Quadro de Anotações" no menu principal. Ideia: tudo que
// chega por WhatsApp ou e-mail entra aqui primeiro, rápido (Empresa + Origem +
// texto livre), sem precisar decidir na hora se é Tarefa, Desligamento ou
// Pendência. Depois, com calma, o item é "promovido" pra aba certa (abrindo o
// modal correspondente já pré-preenchido) ou marcado "Aguardando terceiro"
// quando não depende do DP. Mesmo padrão de arquivo separado + objeto de
// contexto já usado por fechamento.js/admissoes.js/dadosacessos.js.
//
// Coleção nova no Firestore: "caixa_entrada_dp" (precisa de regra nova — ver
// firestore-regras-atuais.rules). Campos por documento:
//   emp, origem ("whatsapp"|"email"|"outro"), subOrigem ("individual"|"grupo"|""),
//   texto, status ("novo"|"aguardando"|"arquivado"), aguardandoQuem,
//   promovidoTipo ("tarefa"|"pendencia"|"deslig"|"resolvido"|""),
//   createdBy, createdByName, createdAt.
//
// ctx esperado (injetado por dp.html, mesmo molde dos outros módulos), com 3
// funções extras de "ponte" pra abrir os modais já existentes pré-preenchidos:
//   openTaskPrefill({tit,det,empIds}), openPendPrefill({empId,observacao}),
//   openDegPrefill({empId})

const COLLECTION = "caixa_entrada_dp";
const MOUNT_ID = "caixaEntradaRoot";
const PROMO_LABEL = {tarefa:"Tarefa", pendencia:"Pendência", deslig:"Desligamento", resolvido:"Resolvido"};

let ctx = null;
let mountEl = null;
let stylesInjected = false;
let boundOnce = false;
let unsubItems = null;

let itemsRaw = [];
let origemSelecionada = "whatsapp";
let subOrigemSelecionada = "";
let mostrarArquivados = false;
let aguardandoEditId = null;
let confirmDeleteId = null;

function esc(s){return(s||"").toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function normalizeStr(s){return(s||"").toString().normalize("NFD").replace(/[̀-ͯ]/g,"").trim().toUpperCase().replace(/\s+/g," ");}
function fmtDT(ts){
  if(!ts)return"";
  const d=ts.toDate?ts.toDate():new Date(ts);
  if(isNaN(d.getTime()))return"";
  return`${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")} ${d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`;
}
function showToast(msg){
  const el=document.createElement("div");
  el.style.cssText="position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--s2);border:1px solid var(--border2);color:var(--text);padding:9px 16px;border-radius:9px;font-size:.78rem;z-index:999;box-shadow:0 6px 24px rgba(0,0,0,.4)";
  el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),2600);
}

function visEmpresas(){
  const all=ctx.getEmpresas?ctx.getEmpresas():[];
  const isAdmin=ctx.getIsAdmin?ctx.getIsAdmin():false;
  return isAdmin?all:all.filter(e=>!e.adminOnly);
}
function getEmpresa(id){
  const all=ctx.getEmpresas?ctx.getEmpresas():[];
  return all.find(e=>e.id===id) || {id,label:"— empresa removida —",color:"#606078"};
}

// ══════════════ estilos (escopados em #caixaEntradaRoot) ══════════════
function ensureStyles(){
  if(stylesInjected)return;
  stylesInjected=true;
  const style=document.createElement("style");
  style.textContent=`
#${MOUNT_ID} .cx-hint{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);padding:10px 14px;font-size:.72rem;color:var(--text2);margin-bottom:14px;line-height:1.55;}
#${MOUNT_ID} .cx-hint b{color:var(--text);}
#${MOUNT_ID} .cx-quick{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);padding:13px;margin-bottom:18px;}
#${MOUNT_ID} .cx-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:9px;}
#${MOUNT_ID} .cx-field{flex:1;min-width:150px;display:flex;flex-direction:column;gap:4px;}
#${MOUNT_ID} .cx-field label{font-size:.63rem;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;}
#${MOUNT_ID} select,#${MOUNT_ID} textarea,#${MOUNT_ID} input[type=text]{background:var(--s3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:.8rem;padding:7px 10px;outline:none;}
#${MOUNT_ID} textarea{resize:vertical;min-height:42px;width:100%;}
#${MOUNT_ID} .cx-chips{display:flex;gap:6px;}
#${MOUNT_ID} .cx-chip{padding:6px 11px;border-radius:8px;font-size:.73rem;border:1px solid var(--border);background:var(--s3);color:var(--text2);cursor:pointer;font-family:inherit;}
#${MOUNT_ID} .cx-chip.sel{font-weight:700;}
#${MOUNT_ID} .cx-chip.wa.sel{background:#25d366;border-color:#25d366;color:#06220f;}
#${MOUNT_ID} .cx-chip.mail.sel{background:var(--low);border-color:var(--low);color:#07131f;}
#${MOUNT_ID} .cx-chip.outro.sel{background:var(--accent2);border-color:var(--accent2);color:#120f1f;}
#${MOUNT_ID} .cx-subchips{display:flex;gap:5px;margin-top:5px;}
#${MOUNT_ID} .cx-subchip{padding:3px 9px;border-radius:7px;font-size:.66rem;border:1px solid var(--border);background:transparent;color:var(--text3);cursor:pointer;font-family:inherit;}
#${MOUNT_ID} .cx-subchip.sel{border-color:var(--text2);color:var(--text);}
#${MOUNT_ID} .cx-quickfoot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:4px;flex-wrap:wrap;}
#${MOUNT_ID} .cx-tip{font-size:.65rem;color:var(--text3);max-width:520px;line-height:1.5;}
#${MOUNT_ID} .cx-grouphd{display:flex;align-items:center;gap:8px;font-size:.71rem;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px 2px;}
#${MOUNT_ID} .cx-count{background:var(--s3);border-radius:9px;padding:1px 8px;font-size:.68rem;color:var(--text);}
#${MOUNT_ID} .cx-card{background:var(--s1);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:10px;padding:11px 13px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;}
#${MOUNT_ID} .cx-body{flex:1;min-width:200px;}
#${MOUNT_ID} .cx-top{display:flex;gap:7px;align-items:center;margin-bottom:4px;flex-wrap:wrap;}
#${MOUNT_ID} .cx-emp{font-size:.72rem;font-weight:700;}
#${MOUNT_ID} .cx-origem{font-size:.62rem;padding:2px 7px;border-radius:7px;border:1px solid;white-space:nowrap;}
#${MOUNT_ID} .cx-origem.wa{color:#25d366;border-color:#25d366;}
#${MOUNT_ID} .cx-origem.mail{color:var(--low);border-color:var(--low);}
#${MOUNT_ID} .cx-origem.outro{color:var(--accent2);border-color:var(--accent2);}
#${MOUNT_ID} .cx-when{font-size:.62rem;color:var(--text3);margin-left:auto;white-space:nowrap;}
#${MOUNT_ID} .cx-txt{font-size:.8rem;line-height:1.45;color:var(--text);white-space:pre-wrap;}
#${MOUNT_ID} .cx-sub{font-size:.65rem;padding:2px 8px;border-radius:7px;margin-top:6px;display:inline-block;}
#${MOUNT_ID} .cx-sub.aguard{background:rgba(224,140,58,.14);color:var(--imp);}
#${MOUNT_ID} .cx-sub.ok{background:rgba(76,175,125,.14);color:var(--nor);}
#${MOUNT_ID} .cx-actions{display:flex;flex-direction:column;gap:5px;min-width:150px;}
#${MOUNT_ID} .cx-act{font-size:.68rem;background:var(--s3);border:1px solid var(--border);border-radius:7px;padding:5px 9px;color:var(--text);text-align:center;cursor:pointer;font-family:inherit;}
#${MOUNT_ID} .cx-act:hover{border-color:var(--text3);}
#${MOUNT_ID} .cx-act.primary{background:linear-gradient(135deg,#c8a96e,#e8c88e);border-color:transparent;color:#0f0f13;font-weight:700;}
#${MOUNT_ID} .cx-act.danger{color:var(--urg);border-color:rgba(224,92,92,.35);}
#${MOUNT_ID} .cx-inlineform{display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap;}
#${MOUNT_ID} .cx-inlineform input{flex:1;min-width:140px;}
#${MOUNT_ID} .cx-empty{font-size:.76rem;color:var(--text3);padding:10px 2px;}
#${MOUNT_ID} .cx-archtoggle{font-size:.68rem;color:var(--text2);cursor:pointer;text-decoration:underline;margin:6px 0 14px;display:inline-block;background:none;border:none;font-family:inherit;padding:0;}
`;
  document.head.appendChild(style);
}

// ══════════════ render ══════════════
function groupBuckets(){
  const visIds=visEmpresas().map(e=>e.id);
  const items=itemsRaw.filter(it=>!it.emp||visIds.includes(it.emp));
  const novos=items.filter(it=>it.status==="novo").sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  const aguardando=items.filter(it=>it.status==="aguardando").sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  const arquivados=items.filter(it=>it.status==="arquivado").sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  return{novos,aguardando,arquivados};
}

function cardHtml(it){
  const emp=getEmpresa(it.emp);
  const origemLabel=it.origem==="whatsapp"?`💬 WhatsApp${it.subOrigem==="grupo"?" (grupo)":it.subOrigem==="individual"?" (1:1)":""}`:it.origem==="email"?"✉️ E-mail":"Outro";
  const origemClass=it.origem==="whatsapp"?"wa":it.origem==="email"?"mail":"outro";
  const isNovo=it.status==="novo", isAguard=it.status==="aguardando", isArq=it.status==="arquivado";
  const showAguardForm=aguardandoEditId===it.id;
  const showDelConfirm=confirmDeleteId===it.id;

  let actionsHtml="";
  if(showDelConfirm){
    actionsHtml=`<button class="cx-act danger" data-action="excluir-confirm" data-id="${it.id}">Confirmar exclusão</button>
      <button class="cx-act" data-action="excluir-cancel">Cancelar</button>`;
  }else if(isNovo){
    actionsHtml=`
      <button class="cx-act primary" data-action="promo-tarefa" data-id="${it.id}">➜ Virar Tarefa</button>
      <button class="cx-act" data-action="promo-pendencia" data-id="${it.id}">➜ Virar Pendência</button>
      <button class="cx-act" data-action="promo-deslig" data-id="${it.id}">➜ Virar Desligamento</button>
      <button class="cx-act" data-action="marcar-aguard" data-id="${it.id}">⏳ Aguardando terceiro</button>
      <button class="cx-act danger" data-action="excluir" data-id="${it.id}">🗑 Excluir</button>`;
  }else if(isAguard){
    actionsHtml=`
      <button class="cx-act primary" data-action="resolver" data-id="${it.id}">✓ Resolvido, arquivar</button>
      <button class="cx-act" data-action="voltar-novo" data-id="${it.id}">↩️ Voltar p/ Novos</button>
      <button class="cx-act danger" data-action="excluir" data-id="${it.id}">🗑 Excluir</button>`;
  }else if(isArq){
    actionsHtml=`
      <button class="cx-act" data-action="voltar-novo" data-id="${it.id}">↩️ Reabrir</button>
      <button class="cx-act danger" data-action="excluir" data-id="${it.id}">🗑 Excluir</button>`;
  }

  return`<div class="cx-card" style="border-left-color:${emp.color}">
    <div class="cx-body">
      <div class="cx-top">
        <span class="cx-emp" style="color:${emp.color}">${esc(emp.label)}</span>
        <span class="cx-origem ${origemClass}">${origemLabel}</span>
        <span class="cx-when">${fmtDT(it.createdAt)}</span>
      </div>
      <div class="cx-txt">${esc(it.texto)}</div>
      ${isAguard&&it.aguardandoQuem?`<span class="cx-sub aguard">⏳ Aguardando: ${esc(it.aguardandoQuem)}</span>`:""}
      ${isArq&&it.promovidoTipo?`<span class="cx-sub ok">✓ ${it.promovidoTipo==="resolvido"?"Resolvido":`Virou ${PROMO_LABEL[it.promovidoTipo]||it.promovidoTipo}`}</span>`:""}
      ${showAguardForm?`<div class="cx-inlineform">
        <input type="text" id="cxAguardInp" placeholder="Aguardando quem? (ex: Dexion, Dra. Vitória...)">
        <button class="cx-act primary" data-action="aguard-save" data-id="${it.id}">Salvar</button>
        <button class="cx-act" data-action="aguard-cancel">Cancelar</button>
      </div>`:""}
    </div>
    <div class="cx-actions">${actionsHtml}</div>
  </div>`;
}

function render(){
  if(!mountEl)return;
  ensureStyles();
  const {novos,aguardando,arquivados}=groupBuckets();
  const emps=visEmpresas();
  mountEl.innerHTML=`
    <div class="cx-hint">Tudo que chega por WhatsApp ou e-mail entra <b>aqui primeiro</b> — rápido, sem precisar decidir na hora se é Tarefa, Desligamento ou Pendência. Depois, com calma, você promove cada item pra aba certa. Esse espaço substitui o antigo Quadro de Anotações.</div>

    <div class="cx-quick">
      <div class="cx-row">
        <div class="cx-field" style="max-width:230px">
          <label>Empresa</label>
          <select id="cxEmp">${emps.map(e=>`<option value="${e.id}">${esc(e.label)}</option>`).join("")}</select>
        </div>
        <div class="cx-field" style="max-width:260px">
          <label>Origem</label>
          <div class="cx-chips">
            <span class="cx-chip wa${origemSelecionada==="whatsapp"?" sel":""}" data-origem="whatsapp">💬 WhatsApp</span>
            <span class="cx-chip mail${origemSelecionada==="email"?" sel":""}" data-origem="email">✉️ E-mail</span>
            <span class="cx-chip outro${origemSelecionada==="outro"?" sel":""}" data-origem="outro">Outro</span>
          </div>
          ${origemSelecionada==="whatsapp"?`<div class="cx-subchips">
            <span class="cx-subchip${subOrigemSelecionada==="individual"?" sel":""}" data-subo="individual">1:1</span>
            <span class="cx-subchip${subOrigemSelecionada==="grupo"?" sel":""}" data-subo="grupo">Grupo</span>
          </div>`:""}
        </div>
      </div>
      <div class="cx-row">
        <div class="cx-field">
          <label>O que foi pedido</label>
          <textarea id="cxTexto" placeholder="Cole ou digite rápido..."></textarea>
        </div>
      </div>
      <div class="cx-quickfoot">
        <span class="cx-tip">💡 Dá pra colar várias linhas de uma vez (Empresa [Tab] Origem [Tab] Texto, uma por linha) direto nesta tela — útil pra colar a lista que vier de um print do WhatsApp já organizado.</span>
        <button class="cx-act primary" id="cxAdd" style="min-width:180px">＋ Adicionar à Caixa</button>
      </div>
    </div>

    <div class="cx-grouphd">🆕 Novos, ainda não triados <span class="cx-count">${novos.length}</span></div>
    <div id="cxNovos">${novos.length?novos.map(cardHtml).join(""):'<div class="cx-empty">Nada por aqui. 🎉</div>'}</div>

    <div class="cx-grouphd" style="margin-top:18px">⏳ Aguardando terceiro <span class="cx-count">${aguardando.length}</span></div>
    <div id="cxAguardando">${aguardando.length?aguardando.map(cardHtml).join(""):'<div class="cx-empty">Nada aguardando no momento.</div>'}</div>

    <button class="cx-archtoggle" id="cxToggleArq">${mostrarArquivados?"▾":"▸"} Arquivados (${arquivados.length})</button>
    ${mostrarArquivados?`<div id="cxArquivados">${arquivados.length?arquivados.map(cardHtml).join(""):'<div class="cx-empty">Nenhum item arquivado ainda.</div>'}</div>`:""}
  `;
  wireRenderEvents();
}

// elementos recriados a cada render() precisam de listener de novo; o clique
// delegado (data-action) fica num único listener preso ao mountEl, vinculado
// uma única vez em bindOnce() — não aqui, pra não empilhar handlers.
function wireRenderEvents(){
  mountEl.querySelectorAll("[data-origem]").forEach(ch=>{
    ch.addEventListener("click",()=>{origemSelecionada=ch.dataset.origem;subOrigemSelecionada="";render();mountEl.querySelector("#cxTexto")?.focus();});
  });
  mountEl.querySelectorAll("[data-subo]").forEach(ch=>{
    ch.addEventListener("click",()=>{subOrigemSelecionada=subOrigemSelecionada===ch.dataset.subo?"":ch.dataset.subo;render();});
  });
  mountEl.querySelector("#cxAdd")?.addEventListener("click",addItem);
  mountEl.querySelector("#cxToggleArq")?.addEventListener("click",()=>{mostrarArquivados=!mostrarArquivados;render();});
}

// ══════════════ ações ══════════════
async function addItem(){
  const empSel=mountEl.querySelector("#cxEmp");
  const texto=(mountEl.querySelector("#cxTexto")?.value||"").trim();
  if(!texto){alert("Escreva o que foi pedido.");return;}
  if(!empSel?.value){alert("Selecione uma empresa.");return;}
  const user=ctx.getUser?ctx.getUser():null;
  try{
    await ctx.addDoc(ctx.collection(ctx.db,COLLECTION),{
      emp:empSel.value,
      origem:origemSelecionada,
      subOrigem:origemSelecionada==="whatsapp"?subOrigemSelecionada:"",
      texto,
      status:"novo",
      aguardandoQuem:"",
      promovidoTipo:"",
      createdBy:user?.uid||"",
      createdByName:user?.displayName||user?.email||"",
      createdAt:ctx.serverTimestamp()
    });
    showToast("Adicionado à Caixa de Entrada.");
  }catch(e){alert("Erro ao salvar: "+(e?.message||e));}
}

async function arquivarComTipo(id,tipo){
  try{await ctx.updateDoc(ctx.doc(ctx.db,COLLECTION,id),{status:"arquivado",promovidoTipo:tipo});}catch(e){/* segue mesmo se falhar, não trava a promoção */}
}
async function promoverTarefa(id){
  const it=itemsRaw.find(x=>x.id===id);if(!it)return;
  await arquivarComTipo(id,"tarefa");
  const origemTxt=it.origem==="whatsapp"?`WhatsApp${it.subOrigem==="grupo"?" (grupo)":it.subOrigem==="individual"?" (1:1)":""}`:it.origem==="email"?"E-mail":"Outro";
  ctx.openTaskPrefill?.({
    tit: it.texto.length>70 ? it.texto.slice(0,70)+"…" : it.texto,
    det: `${it.texto}\n\n(Origem: ${origemTxt} — capturado via Caixa de Entrada)`,
    empIds: [it.emp]
  });
}
async function promoverPendencia(id){
  const it=itemsRaw.find(x=>x.id===id);if(!it)return;
  await arquivarComTipo(id,"pendencia");
  ctx.openPendPrefill?.({empId:it.emp, observacao:it.texto});
}
async function promoverDeslig(id){
  const it=itemsRaw.find(x=>x.id===id);if(!it)return;
  await arquivarComTipo(id,"deslig");
  try{await navigator.clipboard.writeText(it.texto);}catch(e){}
  showToast("Texto original copiado — cole no campo que fizer sentido no Novo Desligamento.");
  ctx.openDegPrefill?.({empId:it.emp});
}
async function resolver(id){
  try{await ctx.updateDoc(ctx.doc(ctx.db,COLLECTION,id),{status:"arquivado",promovidoTipo:"resolvido"});}catch(e){}
}
async function voltarNovo(id){
  try{await ctx.updateDoc(ctx.doc(ctx.db,COLLECTION,id),{status:"novo",promovidoTipo:"",aguardandoQuem:""});}catch(e){}
}
async function salvarAguardando(id){
  const val=(mountEl.querySelector("#cxAguardInp")?.value||"").trim();
  // limpa o estado local ANTES do await: a escrita pode disparar o onSnapshot (e um
  // re-render) antes desta função retomar depois do await, e nesse caso o form inline
  // não pode continuar aparecendo com o id antigo.
  aguardandoEditId=null;
  try{await ctx.updateDoc(ctx.doc(ctx.db,COLLECTION,id),{status:"aguardando",aguardandoQuem:val});}catch(e){}
  render();
}
async function excluirConfirmado(id){
  confirmDeleteId=null;
  try{await ctx.deleteDoc(ctx.doc(ctx.db,COLLECTION,id));}catch(e){}
  render();
}

function delegatedClick(e){
  const btn=e.target.closest("[data-action]");
  if(!btn||!mountEl.contains(btn))return;
  const id=btn.dataset.id;
  const action=btn.dataset.action;
  if(action==="promo-tarefa")promoverTarefa(id);
  else if(action==="promo-pendencia")promoverPendencia(id);
  else if(action==="promo-deslig")promoverDeslig(id);
  else if(action==="marcar-aguard"){aguardandoEditId=id;confirmDeleteId=null;render();setTimeout(()=>mountEl.querySelector("#cxAguardInp")?.focus(),50);}
  else if(action==="aguard-save")salvarAguardando(id);
  else if(action==="aguard-cancel"){aguardandoEditId=null;render();}
  else if(action==="resolver")resolver(id);
  else if(action==="voltar-novo")voltarNovo(id);
  else if(action==="excluir"){confirmDeleteId=id;aguardandoEditId=null;render();}
  else if(action==="excluir-confirm")excluirConfirmado(id);
  else if(action==="excluir-cancel"){confirmDeleteId=null;render();}
}

// ══════════════ colar várias linhas de uma vez (Ctrl+V) ══════════════
function parseTSVToRows(text){
  return text.split(/\r?\n/).filter(l=>l.trim()!=="").map(l=>l.split("\t"));
}
function looksLikeHeaderCells(cells){
  const joined=cells.map(normalizeStr).join("|");
  return joined.includes("EMPRESA")&&(joined.includes("TEXTO")||joined.includes("PEDIDO")||joined.includes("SOLICIT"));
}
function matchEmpresa(raw){
  const n=normalizeStr(raw);
  const all=ctx.getEmpresas?ctx.getEmpresas():[];
  let hit=all.find(e=>normalizeStr(e.label)===n);
  if(hit)return hit;
  const cand=all.filter(e=>n&&(n.includes(normalizeStr(e.label))||normalizeStr(e.label).includes(n)));
  return cand.length===1?cand[0]:null;
}
function matchOrigem(raw){
  const n=normalizeStr(raw);
  if(n.includes("WHATS"))return"whatsapp";
  if(n.includes("MAIL"))return"email";
  return"outro";
}
async function handlePasteBulk(text){
  const rows=parseTSVToRows(text);
  if(!rows.length)return;
  let startIdx=looksLikeHeaderCells(rows[0])?1:0;
  const user=ctx.getUser?ctx.getUser():null;
  const toCreate=[];
  const semEmpresa=[];
  for(let i=startIdx;i<rows.length;i++){
    const cells=rows[i];
    if(cells.length<2)continue;
    const empRaw=cells[0], origemRaw=cells[1]||"", textoRaw=cells.length>=3?cells[2]:cells[1];
    const texto=(textoRaw||"").trim();
    if(!texto)continue;
    const emp=matchEmpresa(empRaw);
    if(!emp){semEmpresa.push(empRaw||"(vazio)");continue;}
    toCreate.push({
      emp:emp.id, origem:matchOrigem(origemRaw), subOrigem:"",
      texto, status:"novo", aguardandoQuem:"", promovidoTipo:"",
      createdBy:user?.uid||"", createdByName:user?.displayName||user?.email||"",
      createdAt:ctx.serverTimestamp()
    });
  }
  if(!toCreate.length){alert("Não consegui reconhecer nenhuma linha colada. Formato esperado: Empresa [Tab] Origem [Tab] Texto, uma linha por item.");return;}
  const avisoSemEmp=semEmpresa.length?` (${semEmpresa.length} linha(s) ignorada(s) por empresa não reconhecida: ${semEmpresa.slice(0,5).join(", ")})`:"";
  if(!confirm(`Foram reconhecidas ${toCreate.length} linha(s)${avisoSemEmp}. Adicionar à Caixa de Entrada?`))return;
  try{
    const batch=ctx.writeBatch(ctx.db);
    toCreate.forEach(data=>batch.set(ctx.doc(ctx.collection(ctx.db,COLLECTION)),data));
    await batch.commit();
    showToast(`${toCreate.length} item(ns) adicionado(s).`);
  }catch(e){alert("Erro ao importar: "+(e?.message||e));}
}

function updateBadge(){
  const badge=document.getElementById("caixaTabBadge");
  if(!badge)return;
  const visIds=visEmpresas().map(e=>e.id);
  const n=itemsRaw.filter(it=>it.status==="novo"&&(!it.emp||visIds.includes(it.emp))).length;
  if(n>0){badge.textContent=n;badge.style.display="inline-block";}else badge.style.display="none";
}

function bindOnce(){
  if(boundOnce)return;
  boundOnce=true;
  mountEl.addEventListener("click",delegatedClick);
  document.addEventListener("paste",e=>{
    const activeView=document.querySelector(".view.active");
    if(!activeView||activeView.id!=="view-caixa")return;
    if(["INPUT","TEXTAREA"].includes(e.target.tagName)||e.target.isContentEditable)return;
    const text=e.clipboardData?.getData("text/plain")||"";
    if(!text||!text.includes("\t"))return;
    e.preventDefault();
    handlePasteBulk(text);
  });
}

export function initCaixaEntrada(c){
  ctx=c;
  mountEl=document.getElementById(MOUNT_ID);
  if(!mountEl)return null;
  bindOnce();
  if(unsubItems)unsubItems();
  unsubItems=ctx.onSnapshot(ctx.collection(ctx.db,COLLECTION),snap=>{
    itemsRaw=snap.docs.map(d=>({id:d.id,...d.data()}));
    updateBadge();
    render();
  });
  return ()=>{if(unsubItems)unsubItems();};
}
export function renderCaixaEntrada(){render();}
