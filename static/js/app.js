let appState = {
    groupsList: [],
    activeGroupId: localStorage.getItem('diff_active_group_id'),
    currentGroupData: null,
    activeCaseId: null,
    activeScenarioId: null,
    batchScope: 'global'
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

document.addEventListener('DOMContentLoaded', async () => {
    // 🌟 初始化更多的输入框
    enableTabIndent('headers'); enableTabIndent('payload'); enableTabIndent('payloadNew');
    enableTabIndent('oldAuth'); enableTabIndent('newAuth');
    initSyncScroll();
    await loadInitialData();
});

function initSyncScroll() {}

async function loadInitialData() {
    try {
        const res = await fetch('/api/groups');
        appState.groupsList = await res.json();
        if (appState.groupsList.length === 0) { await createGroupOnServer("默认测试组", 'g_default'); }
        else {
            if (!appState.groupsList.find(g => g.id === appState.activeGroupId)) { appState.activeGroupId = appState.groupsList[0].id; }
            await loadGroupData(appState.activeGroupId);
        }
    } catch (e) { console.error("加载失败", e); }
}

async function loadGroupData(groupId) {
    try {
        const res = await fetch(`/api/workspace/${groupId}`);
        let data = await res.json();

        // 🌟 兼容老数据，增加 auth 字段
        if (!data.config.oldAuth) data.config.oldAuth = "{\n\n}";
        if (!data.config.newAuth) data.config.newAuth = "{\n\n}";

        data.cases.forEach(c => {
            if (!c.scenarios) {
                c.scenarios = [{ id: 's_' + Date.now() + Math.floor(Math.random()*1000), name: '默认场景 1', payload: c.payload || '{\n    \n}', isDiffPayload: c.isDiffPayload || false, payloadNew: c.payloadNew || '{\n    \n}', lastStatus: c.lastStatus || null, lastResult: null, selected: true }];
                delete c.payload; delete c.isDiffPayload; delete c.payloadNew; delete c.lastStatus;
            } else {
                c.scenarios.forEach(s => { if(s.lastResult === undefined) s.lastResult = null; });
            }
        });

        appState.currentGroupData = data;
        appState.activeGroupId = groupId;
        localStorage.setItem('diff_active_group_id', groupId);
        appState.activeCaseId = null; appState.activeScenarioId = null;

        renderGroupSelect(); applyActiveGroup();
    } catch(e) { alert("加载组数据失败"); }
}

function renderGroupSelect() { const sel = document.getElementById('groupSelect'); sel.innerHTML = ''; appState.groupsList.forEach(g => { const opt = document.createElement('option'); opt.value = g.id; opt.innerText = g.name; if (g.id === appState.activeGroupId) opt.selected = true; sel.appendChild(opt); }); }
function openGroupModal() { document.getElementById('newGroupName').value = ''; document.getElementById('groupModal').style.display = 'flex'; document.getElementById('newGroupName').focus(); }
function closeGroupModal() { document.getElementById('groupModal').style.display = 'none'; }
async function confirmCreateGroup() { const name = document.getElementById('newGroupName').value.trim(); if (!name) return; if (appState.currentGroupData) { await saveWorkspaceToServer(false); } const newId = 'g_' + Date.now(); await createGroupOnServer(name, newId); closeGroupModal(); }
async function createGroupOnServer(name, id) { const newGroupData = { id: id, name: name, config: { oldPrefix: "", newPrefix: "", ignorePaths: "", oldAuth: "{}", newAuth: "{}" }, cases: [] }; await fetch(`/api/workspace/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newGroupData) }); appState.groupsList.push({id: id, name: name}); await loadGroupData(id); }
async function switchGroup() { await saveWorkspaceToServer(false); const newId = document.getElementById('groupSelect').value; document.getElementById('caseList').innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;">加载中...</div>'; await loadGroupData(newId); }

function applyActiveGroup() {
    const group = appState.currentGroupData;
    document.getElementById('oldPrefix').value = group.config.oldPrefix || '';
    document.getElementById('newPrefix').value = group.config.newPrefix || '';
    document.getElementById('ignorePaths').value = group.config.ignorePaths || '';
    // 🌟 绑定鉴权配置
    document.getElementById('oldAuth').value = group.config.oldAuth || '';
    document.getElementById('newAuth').value = group.config.newAuth || '';

    document.getElementById('emptyState').style.display = 'flex'; document.getElementById('caseEditor').style.display = 'none'; document.getElementById('selectAll').checked = false; renderCaseList();
}

function saveCurrentGroupConfig() {
    if (appState.currentGroupData) {
        appState.currentGroupData.config.oldPrefix = document.getElementById('oldPrefix').value;
        appState.currentGroupData.config.newPrefix = document.getElementById('newPrefix').value;
        appState.currentGroupData.config.ignorePaths = document.getElementById('ignorePaths').value;
        // 🌟 保存鉴权配置
        appState.currentGroupData.config.oldAuth = document.getElementById('oldAuth').value;
        appState.currentGroupData.config.newAuth = document.getElementById('newAuth').value;
    }
}

async function saveWorkspaceToServer(showAlert = true) {
    if (!appState.currentGroupData) return;
    saveCurrentInputs(); saveCurrentGroupConfig();
    const btn = document.getElementById('saveWorkspaceBtn');
    if(showAlert) btn.innerHTML = "⏳ 保存中...";
    try { await fetch(`/api/workspace/${appState.activeGroupId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(appState.currentGroupData) }); if(showAlert) { btn.innerHTML = "✅ 保存成功"; setTimeout(() => btn.innerHTML = "💾 保存配置到本地", 2000); } } catch (e) { if(showAlert) { alert("保存失败"); btn.innerHTML = "💾 保存配置到本地"; } }
}
document.getElementById('saveWorkspaceBtn').addEventListener('click', () => saveWorkspaceToServer(true));

function renderCaseList() {
    const list = document.getElementById('caseList'); list.innerHTML = '';
    appState.currentGroupData.cases.forEach(c => {
        const div = document.createElement('div'); div.className = `case-item ${c.id === appState.activeCaseId ? 'active' : ''}`;
        let allSuccess = c.scenarios.length > 0 && c.scenarios.every(s => s.lastStatus === 'success');
        let anyError = c.scenarios.some(s => s.lastStatus === 'error');
        let statusEmoji = anyError ? '❌' : (allSuccess ? '✅' : '⏺️');
        div.innerHTML = `<input type="checkbox" class="case-select" data-id="${c.id}" ${c.selected ? 'checked' : ''} onclick="event.stopPropagation(); updateSelectAllStatus();"><div class="flex-1" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" onclick="selectCase('${c.id}')"><span class="method-badge">${c.method}</span> ${c.name}</div><div id="status-icon-${c.id}" style="font-size: 0.8rem;">${statusEmoji}</div>`;
        list.appendChild(div);
    });
    updateSelectAllStatus();
}

function addCase() {
    saveCurrentInputs();
    const newCase = {
        id: 'c_' + Date.now(), name: `新交易接口`, uri: '/api/v1/new', method: 'POST',
        headers: '{\n    "Content-Type": "application/json"\n}', isCaseIgnore: false, caseIgnorePaths: '', selected: true,
        scenarios: [{ id: 's_' + Date.now(), name: '正常流转场景', payload: '{\n    \n}', isDiffPayload: false, payloadNew: '{\n    \n}', lastStatus: null, lastResult: null, selected: true }]
    };
    appState.currentGroupData.cases.push(newCase);
    selectCase(newCase.id); renderCaseList(); document.getElementById('caseName').focus();
}

function selectCase(id) {
    saveCurrentInputs();
    appState.activeCaseId = id;
    const currentCase = appState.currentGroupData.cases.find(c => c.id === id); if (!currentCase) return;
    document.getElementById('emptyState').style.display = 'none'; document.getElementById('caseEditor').style.display = 'flex';
    document.getElementById('caseName').value = currentCase.name; document.getElementById('uri').value = currentCase.uri; document.getElementById('method').value = currentCase.method; document.getElementById('headers').value = currentCase.headers;
    document.getElementById('isCaseIgnore').checked = currentCase.isCaseIgnore || false; document.getElementById('caseIgnorePaths').value = currentCase.caseIgnorePaths || ''; toggleCaseIgnore();

    if (currentCase.scenarios.length > 0) { selectScenario(currentCase.scenarios[0].id); }
    renderCaseList();
}

function renderScenarioTabs() {
    const currentCase = appState.currentGroupData.cases.find(c => c.id === appState.activeCaseId);
    const tabsContainer = document.getElementById('scenarioTabs');
    tabsContainer.innerHTML = '';
    currentCase.scenarios.forEach(s => {
        const tab = document.createElement('div');
        tab.className = `scenario-tab ${s.id === appState.activeScenarioId ? 'active' : ''}`;
        let emoji = s.lastStatus === 'success' ? '✅' : (s.lastStatus === 'error' ? '❌' : '⏺️');
        tab.innerHTML = `<input type="checkbox" title="参与跑批" ${s.selected ? 'checked' : ''} onclick="event.stopPropagation(); toggleScenarioSelection('${s.id}', this.checked)"><span onclick="selectScenario('${s.id}')">${s.name} <span id="s-icon-${s.id}">${emoji}</span></span>`;
        tabsContainer.appendChild(tab);
    });
}

function toggleScenarioSelection(scenId, isChecked) { const currentCase = appState.currentGroupData.cases.find(c => c.id === appState.activeCaseId); const scen = currentCase.scenarios.find(s => s.id === scenId); if(scen) scen.selected = isChecked; }

function addScenario() {
    saveCurrentInputs();
    const currentCase = appState.currentGroupData.cases.find(c => c.id === appState.activeCaseId);
    const newScen = { id: 's_' + Date.now(), name: `新场景 ${currentCase.scenarios.length + 1}`, payload: '{\n    \n}', isDiffPayload: false, payloadNew: '{\n    \n}', lastStatus: null, lastResult: null, selected: true };
    currentCase.scenarios.push(newScen);
    selectScenario(newScen.id);
}

function selectScenario(scenId) {
    saveCurrentInputs(); appState.activeScenarioId = scenId;
    const currentCase = appState.currentGroupData.cases.find(c => c.id === appState.activeCaseId);
    const scen = currentCase.scenarios.find(s => s.id === scenId); if(!scen) return;

    renderScenarioTabs();
    document.getElementById('scenarioName').value = scen.name; document.getElementById('payload').value = scen.payload; document.getElementById('isDiffPayload').checked = scen.isDiffPayload; document.getElementById('payloadNew').value = scen.payloadNew;
    toggleDiffPayload();

    if (scen.lastResult) { renderResult(scen.lastResult); }
    else { resetResultUI(scen.lastStatus === null ? "等待执行..." : "请重新执行以查看明细"); }
}

function saveCurrentInputs() {
    if (!appState.activeCaseId || !appState.currentGroupData) return;
    const c = appState.currentGroupData.cases.find(c => c.id === appState.activeCaseId);
    if (c) {
        c.name = document.getElementById('caseName').value; c.uri = document.getElementById('uri').value; c.method = document.getElementById('method').value; c.headers = document.getElementById('headers').value;
        c.isCaseIgnore = document.getElementById('isCaseIgnore').checked; c.caseIgnorePaths = document.getElementById('caseIgnorePaths').value;
        if (appState.activeScenarioId) {
            const scen = c.scenarios.find(s => s.id === appState.activeScenarioId);
            if (scen) { scen.name = document.getElementById('scenarioName').value; scen.payload = document.getElementById('payload').value; scen.isDiffPayload = document.getElementById('isDiffPayload').checked; scen.payloadNew = document.getElementById('payloadNew').value; }
        }
    }
}

function toggleDiffPayload() {
    const isDiff = document.getElementById('isDiffPayload').checked; const newPayloadContainer = document.getElementById('newPayloadContainer'); const oldPayloadLabel = document.getElementById('oldPayloadLabel'); const oldPayloadInput = document.getElementById('payload');
    if (isDiff) { newPayloadContainer.style.display = 'flex'; oldPayloadLabel.style.display = 'block'; oldPayloadInput.style.borderLeft = "3px solid #3b82f6"; } else { newPayloadContainer.style.display = 'none'; oldPayloadLabel.style.display = 'none'; oldPayloadInput.style.borderLeft = "1px solid #cbd5e1"; }
}

function toggleCaseIgnore() { const isIgnore = document.getElementById('isCaseIgnore').checked; document.getElementById('caseIgnorePaths').style.display = isIgnore ? 'block' : 'none'; }
function formatAllPayloads() { formatInput('payload'); if (document.getElementById('isDiffPayload').checked) { formatInput('payloadNew'); } }
function toggleSelectAll() { const isChecked = document.getElementById('selectAll').checked; appState.currentGroupData.cases.forEach(c => c.selected = isChecked); document.querySelectorAll('.case-select').forEach(cb => cb.checked = isChecked); }
function updateSelectAllStatus() { document.querySelectorAll('.case-select').forEach(cb => { const id = cb.getAttribute('data-id'); const c = appState.currentGroupData.cases.find(x => x.id === id); if(c) c.selected = cb.checked; }); const allChecked = appState.currentGroupData.cases.length > 0 && appState.currentGroupData.cases.every(c => c.selected); document.getElementById('selectAll').checked = allChecked; }

function openBatchModal(scope) {
    updateSelectAllStatus(); appState.batchScope = scope; let count = 0;
    if (scope === 'global') { appState.currentGroupData.cases.filter(c => c.selected).forEach(c => count += c.scenarios.filter(s => s.selected).length); if (count === 0) { alert("👈 请在左侧勾选接口，并确保其内部场景已被勾选！"); return; } }
    else if (scope === 'case') { const currentCase = appState.currentGroupData.cases.find(c => c.id === appState.activeCaseId); count = currentCase.scenarios.filter(s => s.selected).length; if (count === 0) { alert("此接口下没有勾选任何测试场景！"); return; } }
    document.getElementById('selectedCount').value = count + " 个场景"; document.getElementById('batchModal').style.display = 'flex';
}
function closeBatchModal() { document.getElementById('batchModal').style.display = 'none'; }

window.clearResultsCache = function() {
    if(!confirm("确定要清除当前组所有场景的响应报文缓存吗？\n(这可以有效减小本地配置文件体积，但之前执行的详细结果将被清空)")) return;
    appState.currentGroupData.cases.forEach(c => { c.scenarios.forEach(s => { s.lastResult = null; s.lastStatus = null; }); });
    saveWorkspaceToServer(false); renderCaseList(); if(appState.activeScenarioId) selectScenario(appState.activeScenarioId);
};

// 🌟 核心升级：合并全局鉴权与接口 Headers
async function sendCompareRequest(caseObj, scenarioObj) {
    // 解析基础业务 Headers
    let caseHeaders = {};
    try { caseHeaders = JSON.parse(caseObj.headers || "{}"); } catch(e){}

    // 解析新老系统的全局鉴权 Headers
    let oldAuth = {}; let newAuth = {};
    try { oldAuth = JSON.parse(document.getElementById('oldAuth').value || "{}"); } catch(e){}
    try { newAuth = JSON.parse(document.getElementById('newAuth').value || "{}"); } catch(e){}

    // 动态合并 (鉴权信息优先级最高，如果同名会覆盖基础 Header)
    const oldHeadersMerged = { ...caseHeaders, ...oldAuth };
    const newHeadersMerged = { ...caseHeaders, ...newAuth };

    const payload = {
        old_prefix: document.getElementById('oldPrefix').value,
        new_prefix: document.getElementById('newPrefix').value,
        uri: caseObj.uri,
        method: caseObj.method,
        // 分别发送两套 Headers
        old_headers: JSON.stringify(oldHeadersMerged),
        new_headers: JSON.stringify(newHeadersMerged),
        payload: scenarioObj.payload,
        payload_new: scenarioObj.payloadNew || "",
        is_diff_payload: scenarioObj.isDiffPayload || false,
        ignore_paths: document.getElementById('ignorePaths').value,
        case_ignore_paths: caseObj.isCaseIgnore ? caseObj.caseIgnorePaths : ""
    };
    try { const res = await fetch('/api/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); return await res.json(); } catch (e) { return { status: 'error', message: e.message }; }
}

async function runActiveScenario() {
    saveCurrentInputs();
    const c = appState.currentGroupData.cases.find(c => c.id === appState.activeCaseId); const scen = c.scenarios.find(s => s.id === appState.activeScenarioId); if(!scen) return;
    document.getElementById('runSingleScenarioBtn').innerHTML = "⏳ 执行中..."; resetResultUI("请求中...");

    const result = await sendCompareRequest(c, scen);
    processAndSaveResult(scen, result);

    document.getElementById('runSingleScenarioBtn').innerHTML = "▶️ 单独执行此场景"; renderScenarioTabs(); renderCaseList(); saveWorkspaceToServer(false);
}

async function runBatch() {
    saveCurrentInputs();
    let executionList = [];
    if (appState.batchScope === 'global') { appState.currentGroupData.cases.filter(c => c.selected).forEach(c => c.scenarios.filter(s => s.selected).forEach(s => executionList.push({c, s}))); }
    else { const currentCase = appState.currentGroupData.cases.find(c => c.id === appState.activeCaseId); currentCase.scenarios.filter(s => s.selected).forEach(s => executionList.push({c: currentCase, s})); }

    const delayMs = parseInt(document.getElementById('batchDelay').value) || 0; const maxRetries = parseInt(document.getElementById('batchRetries').value) || 0; const stopOnError = document.getElementById('stopOnError').checked;
    closeBatchModal(); document.getElementById('runCaseBtn').disabled = true;

    for (let i = 0; i < executionList.length; i++) {
        const target = executionList[i];
        if (appState.activeCaseId !== target.c.id) selectCase(target.c.id); else selectScenario(target.s.id);

        let attempt = 0; let result;
        while (attempt <= maxRetries) {
            document.getElementById(`s-icon-${target.s.id}`).innerText = "⏳";
            result = await sendCompareRequest(target.c, target.s);
            let isSuccess = result.status !== 'error' && typeof result.diff_result === 'string';
            if (isSuccess) break;
            attempt++;
            if (attempt <= maxRetries) { document.getElementById('diffResult').innerHTML = `<div style="color:#fbbf24; padding:10px;">⚠️ 失败，系统正在进行第 ${attempt}/${maxRetries} 次重试...</div>`; await sleep(1500); }
        }

        processAndSaveResult(target.s, result);

        if (stopOnError && target.s.lastStatus === 'error') { alert(`🚫 跑批熔断！接口[${target.c.name}] 场景[${target.s.name}] 失败。`); break; }
        if (delayMs > 0 && i < executionList.length - 1) { document.getElementById('diffResult').innerHTML += `<div style="color:#94a3b8; padding:10px;">⏳ 准备下一个，睡眠 ${delayMs}ms...</div>`; await sleep(delayMs); }
    }
    document.getElementById('runCaseBtn').disabled = false; renderCaseList(); saveWorkspaceToServer(false);
}

function processAndSaveResult(scen, resultData) {
    scen.lastResult = resultData;
    if (resultData.status === "error") { scen.lastStatus = 'error'; } else { scen.lastStatus = (typeof resultData.diff_result === 'string') ? 'success' : 'error'; }
    if (appState.activeScenarioId === scen.id) { renderResult(resultData); }
}

function renderResult(data) {
    const badge = document.getElementById('statusBadge');
    if (data.status === "error") {
        document.getElementById('diffResult').innerHTML = `<div style="color:#f87171; padding:10px;">❌ 请求异常: ${data.message}</div>`;
        document.getElementById('unifiedGitDiff').innerHTML = '';
        badge.className = "badge badge-error"; badge.innerText = "执行失败"; return;
    }
    document.getElementById('diffResult').innerHTML = renderStructuredDiffBoard(data.diff_result);
    document.getElementById('unifiedGitDiff').innerHTML = renderUnifiedGitDiff(data.text_diff || []);
    if (typeof data.diff_result === 'string') { badge.className = "badge badge-success"; badge.innerText = "完全一致"; }
    else { badge.className = "badge badge-error"; badge.innerText = "存在差异"; }
}

function resetResultUI(text = "等待执行...") { document.getElementById('diffResult').innerHTML = `<div style="padding:10px; color:#94a3b8;">${text}</div>`; document.getElementById('unifiedGitDiff').innerHTML = ""; document.getElementById('statusBadge').innerText = ""; document.getElementById('statusBadge').className = "badge"; }
function enableTabIndent(elementId) { const el = document.getElementById(elementId); el.addEventListener('keydown', function(e) { if (e.key === 'Tab') { e.preventDefault(); const start = this.selectionStart, end = this.selectionEnd; this.value = this.value.substring(0, start) + "    " + this.value.substring(end); this.selectionStart = this.selectionEnd = start + 4; } }); }
function formatInput(id) { try { const el = document.getElementById(id); const obj = JSON.parse(el.value); el.value = JSON.stringify(obj, null, 4); } catch (e) { alert("JSON 格式有误！"); } }

window.quickIgnoreField = function(path) {
    document.getElementById('isCaseIgnore').checked = true; toggleCaseIgnore();
    let input = document.getElementById('caseIgnorePaths');
    let current = input.value.split(',').map(s => s.trim()).filter(s => s);
    if (!current.includes(path)) { current.push(path); input.value = current.join(', '); }
    saveCurrentInputs(); runActiveScenario();
};

function renderStructuredDiffBoard(diffObj) {
    if (typeof diffObj === 'string') return `<div class="diff-success-box"><div>🎉</div><div>${diffObj}</div></div>`;
    let html = ''; const fmt = val => { if (typeof val === 'object') return JSON.stringify(val); if (typeof val === 'string') return `"${val}"`; return String(val); };
    const genTitle = path => `<div class="diff-field-name">📌 字段: ${path} <button class="btn-quick-ignore" onclick="quickIgnoreField('${path.replace(/'/g, "\\'")}')">🚫 忽略此字段</button></div>`;

    if (diffObj.values_changed) { html += `<div class="diff-section-title">✏️ 值不一致 (Values Mismatch)</div>`; for (let path in diffObj.values_changed) { let change = diffObj.values_changed[path]; html += `<div class="diff-detail-item">${genTitle(path)}<div class="diff-compare-row"><span class="old-tag">老系统</span> <span class="val-text">${fmt(change.old_value)}</span></div><div class="diff-compare-row"><span class="new-tag">新系统</span> <span class="val-text">${fmt(change.new_value)}</span></div></div>`; } }
    if (diffObj.type_changes) { html += `<div class="diff-section-title">🔄 类型不一致 (Type Mismatch)</div>`; for (let path in diffObj.type_changes) { let change = diffObj.type_changes[path]; html += `<div class="diff-detail-item">${genTitle(path)}<div class="diff-compare-row"><span class="old-tag">老系统</span> <span class="val-text">${fmt(change.old_value)} <span style="color:#64748b">(${change.old_type})</span></span></div><div class="diff-compare-row"><span class="new-tag">新系统</span> <span class="val-text">${fmt(change.new_value)} <span style="color:#64748b">(${change.new_type})</span></span></div></div>`; } }
    if (diffObj.dictionary_item_added || diffObj.iterable_item_added) { html += `<div class="diff-section-title">🟢 新系统多出字段 (Added in New)</div>`; if(diffObj.dictionary_item_added) diffObj.dictionary_item_added.forEach(path => { html += `<div class="diff-detail-item">${genTitle(path)}</div>`; }); if(diffObj.iterable_item_added) { for (let path in diffObj.iterable_item_added) { html += `<div class="diff-detail-item">${genTitle(path)}<div class="diff-compare-row"><span class="new-tag">多出内容</span> <span class="val-text">${fmt(diffObj.iterable_item_added[path])}</span></div></div>`; } } }
    if (diffObj.dictionary_item_removed || diffObj.iterable_item_removed) { html += `<div class="diff-section-title">🔴 新系统缺失字段 (Missing in New)</div>`; if(diffObj.dictionary_item_removed) diffObj.dictionary_item_removed.forEach(path => { html += `<div class="diff-detail-item">${genTitle(path)}</div>`; }); if(diffObj.iterable_item_removed) { for (let path in diffObj.iterable_item_removed) { html += `<div class="diff-detail-item">${genTitle(path)}<div class="diff-compare-row"><span class="old-tag">缺失内容</span> <span class="val-text">${fmt(diffObj.iterable_item_removed[path])}</span></div></div>`; } } }
    return html;
}

function renderUnifiedGitDiff(ndiffLines) {
    if (!ndiffLines || ndiffLines.length === 0) return '';
    let html = '';
    for (let i = 0; i < ndiffLines.length; i++) {
        let line = ndiffLines[i]; if (line.startsWith('? ')) continue;
        let type = line.charAt(0); let content = line.substring(2).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || ' ';
        if (type === ' ') { html += `<div class="diff-table-row"><div class="diff-table-cell">${content}</div><div class="diff-table-cell">${content}</div></div>`; }
        else if (type === '-') {
            let hasPlus = false; let plusContent = ''; let skipCount = 0;
            if (i + 1 < ndiffLines.length && ndiffLines[i+1].startsWith('? ')) skipCount++;
            if (i + 1 + skipCount < ndiffLines.length && ndiffLines[i+1+skipCount].startsWith('+ ')) { hasPlus = true; plusContent = ndiffLines[i+1+skipCount].substring(2).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || ' '; skipCount++; }
            if (hasPlus) { html += `<div class="diff-table-row"><div class="diff-table-cell del">${content}</div><div class="diff-table-cell add">${plusContent}</div></div>`; i += skipCount; }
            else { html += `<div class="diff-table-row"><div class="diff-table-cell del">${content}</div><div class="diff-table-cell empty"></div></div>`; }
        } else if (type === '+') { html += `<div class="diff-table-row"><div class="diff-table-cell empty"></div><div class="diff-table-cell add">${content}</div></div>`; }
    }
    return html;
}

// 🌟 鉴权配置折叠/展开逻辑
window.toggleGlobalAuth = function() {
    const section = document.getElementById('globalAuthSection');
    const btn = document.getElementById('authToggleBtn');
    if (section.style.display === 'none') {
        section.style.display = 'flex';
        btn.innerText = '🔑 收起鉴权配置';
    } else {
        section.style.display = 'none';
        btn.innerText = '🔑 展开鉴权配置';
    }
};