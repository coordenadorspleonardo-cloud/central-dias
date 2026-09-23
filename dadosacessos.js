// ============================================================================
// Dados & Acessos — módulo separado (não mexe no restante do index.html)
// Criado em 24/09/2026 a pedido do Leonardo: um lugar prático dentro da aba
// "Informações" pra reunir CNPJ, endereço, telefone, responsável de cada
// empresa/unidade/instituição/filial, além de outros acessos da equipe (ex.:
// senha do empregador web, acesso da consultoria jurídica etc.).
//
// Mesmo padrão de fechamento.js/admissoes.js: dp.html chama initDadosAcessos(ctx)
// uma vez, depois do login, passando as funções do Firestore já importadas lá.
// Este arquivo injeta seu próprio <style>, desenha dentro de #infoDadosRoot,
// escuta o Firestore em tempo real e trata os cliques.
//
// Atenção (importante pro Leonardo saber): os campos de acesso/senha ficam
// salvos como texto no Firestore, protegidos pelas mesmas regras de segurança
// do resto do app (só quem é do DP consegue ler) — não existe criptografia
// extra aqui, é o mesmo nível de proteção que o resto da Central Dias já tem.
// ============================================================================

const COLLECTION = "dados_acessos_dp";
const CATEGORIAS = ["Empresa/Instituição", "Unidade/Filial", "Acesso externo", "Outro"];

// ---- estado do módulo ----
let ctx = null;
let mountEl = null;
let stylesInjected = false;
let unsubItems = null;
let itemsRaw = [];
let filterCategoria = "all";
let searchTerm = "";
let editingId = null; // "__new__" pra criar, ou o id do doc sendo editado
let confirmingDeleteId = null;
let draft = {}; // campos do formulário aberto (novo ou edição)

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function nl2br(s) {
  return esc(s).replace(/\n/g, "<br>");
}
function getCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem("cdDadosColapsados") || "[]")); } catch (e) { return new Set(); }
}
function setCollapsed(set) {
  try { localStorage.setItem("cdDadosColapsados", JSON.stringify([...set])); } catch (e) {}
}

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
#dadosRoot{display:flex;flex-direction:column;gap:14px;}
#dadosRoot .dados-orient{background:var(--s2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:12px 14px;font-size:.76rem;color:var(--text2);line-height:1.55;}
#dadosRoot .dados-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
#dadosRoot .dados-search{flex:1;min-width:160px;background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.8rem;padding:7px 10px;}
#dadosRoot .dados-btn{background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.76rem;padding:7px 11px;cursor:pointer;}
#dadosRoot .dados-btn:hover{background:var(--s2);}
#dadosRoot .dados-btn.on{background:var(--accent2);color:#fff;border-color:var(--accent2);}
#dadosRoot .dados-btn.primary{background:var(--accent);color:#fff;border-color:var(--accent);}
#dadosRoot .dados-empty{font-size:.8rem;color:var(--text2);padding:14px;text-align:center;border:1px dashed var(--border);border-radius:10px;}
#dadosRoot .dados-card{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;}
#dadosRoot .dados-card-head{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none;}
#dadosRoot .dados-card-head:hover{background:var(--s2);}
#dadosRoot .dados-card-head .car{transition:transform .15s;color:var(--text3);font-size:.7rem;}
#dadosRoot .dados-card.collapsed .car{transform:rotate(-90deg);}
#dadosRoot .dados-card-head .tit{font-weight:600;font-size:.84rem;color:var(--text);flex:1;}
#dadosRoot .dados-cat{font-size:.62rem;color:var(--text2);background:var(--s3);border:1px solid var(--border);border-radius:20px;padding:2px 9px;flex:none;}
#dadosRoot .dados-card.collapsed .dados-card-body{display:none;}
#dadosRoot .dados-card-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:8px;}
#dadosRoot .dados-row{display:flex;gap:8px;font-size:.78rem;color:var(--text);line-height:1.5;}
#dadosRoot .dados-row .lbl{flex:0 0 110px;color:var(--text3);font-size:.7rem;padding-top:2px;}
#dadosRoot .dados-row .val{flex:1;word-break:break-word;white-space:pre-wrap;}
#dadosRoot .dados-row .val.mono{font-family:ui-monospace,Menlo,Consolas,monospace;}
#dadosRoot .dados-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;}
#dadosRoot .dados-form{display:flex;flex-direction:column;gap:8px;padding:12px 14px;}
#dadosRoot .dados-form label{font-size:.68rem;color:var(--text3);margin-bottom:2px;display:block;}
#dadosRoot .dados-form input[type=text],#dadosRoot .dados-form select,#dadosRoot .dados-form textarea{width:100%;background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.8rem;padding:7px 9px;box-sizing:border-box;}
#dadosRoot .dados-form textarea{resize:vertical;min-height:52px;font-family:ui-monospace,Menlo,Consolas,monospace;}
#dadosRoot .dados-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
#dadosRoot .dados-confirm{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--s2);font-size:.78rem;color:var(--text2);}
@media (max-width:640px){#dadosRoot .dados-grid2{grid-template-columns:1fr;}}
`;
  document.head.appendChild(style);
}

function subscribeItems() {
  if (unsubItems) { unsubItems(); unsubItems = null; }
  const { db, collection, onSnapshot } = ctx;
  unsubItems = onSnapshot(
    collection(db, COLLECTION),
    snap => { itemsRaw = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); },
    () => { itemsRaw = []; render(); }
  );
}

function emptyDraft() {
  return { titulo: "", categoria: CATEGORIAS[0], cnpj: "", responsavel: "", telefone: "", email: "", endereco: "", acessos: "", obs: "" };
}

async function saveDraft() {
  const titulo = (draft.titulo || "").trim();
  if (!titulo) { alert("Preencha ao menos o título/nome antes de salvar."); return; }
  const { db, doc, collection, addDoc, updateDoc, serverTimestamp } = ctx;
  const user = ctx.getUser();
  const nome = ctx.getMembers().find(m => m.id === user?.uid)?.name || user?.displayName || user?.email || null;
  const payload = {
    titulo,
    categoria: draft.categoria || CATEGORIAS[0],
    cnpj: (draft.cnpj || "").trim(),
    responsavel: (draft.responsavel || "").trim(),
    telefone: (draft.telefone || "").trim(),
    email: (draft.email || "").trim(),
    endereco: (draft.endereco || "").trim(),
    acessos: (draft.acessos || "").trim(),
    obs: (draft.obs || "").trim(),
    updatedAt: serverTimestamp(),
    updatedBy: nome
  };
  try {
    if (editingId === "__new__") {
      await addDoc(collection(db, COLLECTION), { ...payload, createdAt: serverTimestamp(), createdBy: nome });
    } else {
      await updateDoc(doc(db, COLLECTION, editingId), payload);
    }
    editingId = null; draft = {};
  } catch (e) { alert("Não foi possível salvar. Tente novamente."); }
}

async function deleteItem(id) {
  const { db, doc, deleteDoc } = ctx;
  try { await deleteDoc(doc(db, COLLECTION, id)); } catch (e) {}
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text || ""); } catch (e) { /* sem permissão de clipboard — silencioso */ }
}

// ---- render ----
function render() {
  if (!mountEl) return;
  ensureStyles();
  const termo = searchTerm.trim().toLowerCase();
  let lista = itemsRaw.filter(it => {
    if (filterCategoria !== "all" && it.categoria !== filterCategoria) return false;
    if (termo && !(it.titulo || "").toLowerCase().includes(termo) && !(it.responsavel || "").toLowerCase().includes(termo)) return false;
    return true;
  });
  lista.sort((a, b) => (a.categoria || "").localeCompare(b.categoria || "") || (a.titulo || "").localeCompare(b.titulo || ""));

  let html = "";
  html += `<div class="dados-orient"><b>Orientação.</b> Guarde aqui CNPJ, endereço, telefone, responsável e acessos (senha do empregador web, e-mail, consultoria jurídica etc.) de cada empresa, unidade, instituição ou filial. Essas informações ficam protegidas pelas mesmas regras de acesso do resto da Central Dias — só quem é do DP consegue ver.</div>`;

  html += `<div class="dados-toolbar">
    <input type="text" class="dados-search" placeholder="Buscar por título ou responsável..." value="${esc(searchTerm)}" data-action="search">
    <button class="dados-btn ${filterCategoria === "all" ? "on" : ""}" data-action="filter-cat" data-val="all">Todos</button>
    ${CATEGORIAS.map(c => `<button class="dados-btn ${filterCategoria === c ? "on" : ""}" data-action="filter-cat" data-val="${esc(c)}">${esc(c)}</button>`).join("")}
    <button class="dados-btn primary" data-action="add-start" style="margin-left:auto">+ Novo card</button>
  </div>`;

  if (editingId === "__new__") html += renderForm();

  if (!lista.length && editingId !== "__new__") {
    html += `<div class="dados-empty">Nenhuma informação cadastrada ainda${termo || filterCategoria !== "all" ? " com esse filtro" : ""}. Clique em "+ Novo card" pra começar.</div>`;
  }

  const collapsed = getCollapsed();
  lista.forEach(it => {
    if (editingId === it.id) { html += renderForm(it.id); return; }
    if (confirmingDeleteId === it.id) { html += renderConfirmDelete(it); return; }
    html += renderCard(it, collapsed.has(it.id));
  });

  mountEl.innerHTML = html;
}

function renderCard(it, isCollapsed) {
  let html = `<div class="dados-card ${isCollapsed ? "collapsed" : ""}" data-id="${esc(it.id)}">
    <div class="dados-card-head" data-action="toggle-collapse" data-val="${esc(it.id)}">
      <span class="car">▾</span>
      <span class="tit">${esc(it.titulo)}</span>
      <span class="dados-cat">${esc(it.categoria || "Outro")}</span>
    </div>
    <div class="dados-card-body">`;
  const campos = [
    ["CNPJ", it.cnpj, "mono"], ["Responsável", it.responsavel, ""], ["Telefone", it.telefone, "mono"],
    ["E-mail", it.email, "mono"], ["Endereço", it.endereco, ""]
  ];
  campos.forEach(([lbl, val, cls]) => {
    if (!val) return;
    html += `<div class="dados-row"><span class="lbl">${esc(lbl)}</span><span class="val ${cls}">${esc(val)}</span></div>`;
  });
  if (it.acessos) {
    html += `<div class="dados-row"><span class="lbl">Acessos/senhas</span><span class="val mono">${nl2br(it.acessos)}</span></div>`;
  }
  if (it.obs) {
    html += `<div class="dados-row"><span class="lbl">Observações</span><span class="val">${nl2br(it.obs)}</span></div>`;
  }
  html += `<div class="dados-actions">
    ${it.acessos ? `<button class="dados-btn" data-action="copy-acessos" data-val="${esc(it.id)}">📋 Copiar acessos</button>` : ""}
    <button class="dados-btn" data-action="edit-start" data-val="${esc(it.id)}">✏️ Editar</button>
    <button class="dados-btn" data-action="delete-start" data-val="${esc(it.id)}">🗑️ Excluir</button>
  </div>`;
  html += `</div></div>`;
  return html;
}

function renderConfirmDelete(it) {
  return `<div class="dados-card"><div class="dados-confirm">
    <span>Excluir "${esc(it.titulo)}"? Essa ação não pode ser desfeita.</span>
    <button class="dados-btn primary" data-action="delete-confirm" data-val="${esc(it.id)}" style="margin-left:auto">Excluir</button>
    <button class="dados-btn" data-action="delete-cancel">Cancelar</button>
  </div></div>`;
}

function renderForm(id) {
  const d = id ? { ...(itemsRaw.find(x => x.id === id) || {}), ...draft } : (Object.keys(draft).length ? draft : emptyDraft());
  return `<div class="dados-card"><div class="dados-form">
    <div><label>Título/Nome *</label><input type="text" data-f="titulo" value="${esc(d.titulo)}" placeholder="Ex.: AMASP, Consultoria Jurídica..."></div>
    <div><label>Categoria</label><select data-f="categoria">${CATEGORIAS.map(c => `<option value="${esc(c)}" ${d.categoria === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
    <div class="dados-grid2">
      <div><label>CNPJ</label><input type="text" data-f="cnpj" value="${esc(d.cnpj)}"></div>
      <div><label>Responsável</label><input type="text" data-f="responsavel" value="${esc(d.responsavel)}"></div>
      <div><label>Telefone</label><input type="text" data-f="telefone" value="${esc(d.telefone)}"></div>
      <div><label>E-mail</label><input type="text" data-f="email" value="${esc(d.email)}"></div>
    </div>
    <div><label>Endereço</label><input type="text" data-f="endereco" value="${esc(d.endereco)}"></div>
    <div><label>Acessos/senhas (ex.: senha do empregador web, login...)</label><textarea data-f="acessos">${esc(d.acessos)}</textarea></div>
    <div><label>Observações</label><textarea data-f="obs">${esc(d.obs)}</textarea></div>
    <div class="dados-actions">
      <button class="dados-btn primary" data-action="edit-save" data-val="${esc(id || "__new__")}">💾 Salvar</button>
      <button class="dados-btn" data-action="edit-cancel">Cancelar</button>
    </div>
  </div></div>`;
}

function readFormInto(container) {
  container.querySelectorAll("[data-f]").forEach(el => { draft[el.dataset.f] = el.value; });
}

// ---- eventos ----
function wireEvents() {
  mountEl.addEventListener("click", async e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const val = btn.dataset.val;

    if (action === "toggle-collapse") {
      const set = getCollapsed();
      if (set.has(val)) set.delete(val); else set.add(val);
      setCollapsed(set); render(); return;
    }
    if (action === "filter-cat") { filterCategoria = val; render(); return; }
    if (action === "add-start") { editingId = "__new__"; draft = emptyDraft(); confirmingDeleteId = null; render(); return; }
    if (action === "edit-start") { editingId = val; draft = {}; confirmingDeleteId = null; render(); return; }
    if (action === "edit-cancel") { editingId = null; draft = {}; render(); return; }
    if (action === "edit-save") {
      const form = btn.closest(".dados-form");
      if (form) readFormInto(form);
      await saveDraft(); render(); return;
    }
    if (action === "delete-start") { confirmingDeleteId = val; editingId = null; render(); return; }
    if (action === "delete-cancel") { confirmingDeleteId = null; render(); return; }
    if (action === "delete-confirm") { confirmingDeleteId = null; await deleteItem(val); return; }
    if (action === "copy-acessos") {
      const it = itemsRaw.find(x => x.id === val);
      if (it) await copyToClipboard(it.acessos);
      return;
    }
  });

  mountEl.addEventListener("input", e => {
    if (e.target.matches('[data-action="search"]')) { searchTerm = e.target.value; render();
      const inp = mountEl.querySelector('[data-action="search"]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      return;
    }
  });
}

// ---- API pública ----
export function initDadosAcessos(c) {
  ctx = c;
  mountEl = document.getElementById("infoDadosRoot");
  if (!mountEl) return () => {};
  wireEvents();
  subscribeItems();
  return function stopDadosAcessos() {
    if (unsubItems) { unsubItems(); unsubItems = null; }
  };
}

export function renderInfoDados() {
  render();
}
