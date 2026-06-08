let appState = { groups: [], activeGroupId: null, activeCaseId: null };
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

document.addEventListener('DOMContentLoaded', async () => {
    enableTabIndent('headers'); enableTabIndent('payload'); enableTabIndent('payloadNew');
    await loadWorkspace();
});

async function loadWorkspace() {
    try {
        const res = await fetch('/api/workspace');
        const data = await res.json();
        if (!data.groups) {
            appState.groups = [{ id: 'g_default', name: '默认测试组', config: { oldPrefix: data.oldPrefix || "", newPrefix: data.newPrefix || "", ignorePaths: data.ignorePaths || "" }, cases: data.cases || [] }];
            appState.activeGroupId = 'g_default';
        } else {
            appState.groups = data.groups; appState.activeGroupId = data.activeGroupId || data.groups[0].id;
        }
        renderGroupSelect(); applyActiveGroup();
    } catch (e) {
        appState.groups = [{ id: 'g_init', name: '我的测试组', config: { oldPrefix: "", newPrefix: "", ignorePaths: "" }, cases: [] }];
        appState.activeGroupId = 'g_init'; renderGroupSelect(); applyActiveGroup();
    }
}

function renderGroupSelect() { const sel = document.getElementById('groupSelect'); sel.innerHTML = ''; appState.groups.forEach(g => { const opt = document.createElement('option'); opt.value = g.id; opt.innerText = g.name; if (g.id === appState.activeGroupId) opt.selected = true; sel.appendChild(opt); }); }
function openGroupModal() { document.getElementById('newGroupName').value = ''; document.getElementById('groupModal').style.display = 'flex'; document.getElementById('newGroupName').focus(); }
function closeGroupModal() { document.getElementById('groupModal').style.display = 'none'; }
function confirmCreateGroup() { const name = document.getElementById('newGroupName').value.trim(); if (!name) return; saveCurrentCase(); saveCurrentGroupConfig(); const newGroup = { id: 'g_' + Date.now(), name: name, config: { oldPrefix: "", newPrefix: "", ignorePaths: "" }, cases: [] }; appState.groups.push(newGroup); appState.activeGroupId = newGroup.id; appState.activeCaseId = null; renderGroupSelect(); applyActiveGroup(); closeGroupModal(); }
function switchGroup() { saveCurrentCase(); saveCurrentGroupConfig(); appState.activeGroupId = document.getElementById('groupSelect').value; appState.activeCaseId = null; applyActiveGroup(); }
function getActiveGroup() { return appState.groups.find(g => g.id === appState.activeGroupId); }

function applyActiveGroup() {
    const group = getActiveGroup();
    document.getElementById('oldPrefix').value = group.config.oldPrefix; document.getElementById('newPrefix').value = group.config.newPrefix; document.getElementById('ignorePaths').value = group.config.ignorePaths;
    document.getElementById('emptyState').style.display = 'flex'; document.getElementById('caseEditor').style.display = 'none'; document.getElementById('selectAll').checked = false; renderCaseList();
}

function saveCurrentGroupConfig() { const group = getActiveGroup(); if (group) { group.config.oldPrefix = document.getElementById('oldPrefix').value; group.config.newPrefix = document.getElementById('newPrefix').value; group.config.ignorePaths = document.getElementById('ignorePaths').value; } }

document.getElementById('saveWorkspaceBtn').addEventListener('click', async () => {
    saveCurrentCase(); saveCurrentGroupConfig(); const btn = document.getElementById('saveWorkspaceBtn'); btn.innerHTML = "⏳ 保存中...";
    try { await fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groups: appState.groups, activeGroupId: appState.activeGroupId }) }); btn.innerHTML = "✅ 保存成功"; setTimeout(() => btn.innerHTML = "💾 保存所有配置到本地", 2000); } catch (e) { alert("保存失败"); btn.innerHTML = "💾 保存所有配置到本地"; }
});

function renderCaseList() {
    const group = getActiveGroup(); const list = document.getElementById('caseList'); list.innerHTML = '';
    group.cases.forEach(c => {
        const div = document.createElement('div'); div.className = `case-item ${c.id === appState.activeCaseId ? 'active' : ''}`;
        let statusIcon = c.lastStatus === 'success' ? '✅' : (c.lastStatus === 'error' ? '❌' : '📝');
        div.innerHTML = `<input type="checkbox" class="case-select" data-id="${c.id}" ${c.selected ? 'checked' : ''} onclick="event.stopPropagation(); updateSelectAllStatus();"><div class="flex-1" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 10px;" onclick="selectCase('${c.id}')"><span class="method-badge">${c.method}</span> ${c.name}</div><div id="status-icon-${c.id}" style="margin-left:auto;">${statusIcon}</div>`;
        list.appendChild(div);
    });
    updateSelectAllStatus();
}

function addCase() {
    saveCurrentCase(); const group = getActiveGroup();
    const newCase = {
        id: 'c_' + Date.now(), name: `新测试场景 ${group.cases.length + 1}`, uri: '/api/test', method: 'POST',
        headers: '{\n    "Content-Type": "application/json"\n}', payload: '{\n    \n}',
        isDiffPayload: false, payloadNew: '{\n    \n}', isCaseIgnore: false, caseIgnorePaths: '', lastStatus: null, selected: true
    };
    group.cases.push(newCase); selectCase(newCase.id); renderCaseList();
}

function selectCase(id) {
    saveCurrentCase(); appState.activeCaseId = id; const group = getActiveGroup(); const currentCase = group.cases.find(c => c.id === id); if (!currentCase) return;
    document.getElementById('emptyState').style.display = 'none'; document.getElementById('caseEditor').style.display = 'flex';
    document.getElementById('caseName').value = currentCase.name; document.getElementById('uri').value = currentCase.uri; document.getElementById('method').value = currentCase.method; document.getElementById('headers').value = currentCase.headers; document.getElementById('payload').value = currentCase.payload;
    document.getElementById('isDiffPayload').checked = currentCase.isDiffPayload || false; document.getElementById('payloadNew').value = currentCase.payloadNew || currentCase.payload; toggleDiffPayload();
    document.getElementById('isCaseIgnore').checked = currentCase.isCaseIgnore || false; document.getElementById('caseIgnorePaths').value = currentCase.caseIgnorePaths || ''; toggleCaseIgnore();
    resetResultUI(); renderCaseList();
}

function saveCurrentCase() {
    if (!appState.activeCaseId) return; const group = getActiveGroup(); const c = group.cases.find(c => c.id === appState.activeCaseId);
    if (c) {
        c.name = document.getElementById('caseName').value; c.uri = document.getElementById('uri').value; c.method = document.getElementById('method').value; c.headers = document.getElementById('headers').value; c.payload = document.getElementById('payload').value;
        c.isDiffPayload = document.getElementById('isDiffPayload').checked; c.payloadNew = document.getElementById('payloadNew').value;
        c.isCaseIgnore = document.getElementById('isCaseIgnore').checked; c.caseIgnorePaths = document.getElementById('caseIgnorePaths').value;
    }
}

function toggleDiffPayload() {
    const isDiff = document.getElementById('isDiffPayload').checked; const newPayloadContainer = document.getElementById('newPayloadContainer'); const oldPayloadLabel = document.getElementById('oldPayloadLabel'); const oldPayloadInput = document.getElementById('payload');
    if (isDiff) { newPayloadContainer.style.display = 'flex'; oldPayloadLabel.style.display = 'block'; oldPayloadInput.style.borderLeft = "3px solid #3b82f6"; } else { newPayloadContainer.style.display = 'none'; oldPayloadLabel.style.display = 'none'; oldPayloadInput.style.borderLeft = "1px solid #cbd5e1"; }
}

function toggleCaseIgnore() { const isIgnore = document.getElementById('isCaseIgnore').checked; document.getElementById('caseIgnorePaths').style.display = isIgnore ? 'block' : 'none'; }
function formatAllPayloads() { formatInput('payload'); if (document.getElementById('isDiffPayload').checked) { formatInput('payloadNew'); } }
function toggleSelectAll() { const isChecked = document.getElementById('selectAll').checked; const group = getActiveGroup(); group.cases.forEach(c => c.selected = isChecked); document.querySelectorAll('.case-select').forEach(cb => cb.checked = isChecked); }
function updateSelectAllStatus() { const group = getActiveGroup(); document.querySelectorAll('.case-select').forEach(cb => { const id = cb.getAttribute('data-id'); const c = group.cases.find(x => x.id === id); if(c) c.selected = cb.checked; }); const allChecked = group.cases.length > 0 && group.cases.every(c => c.selected); document.getElementById('selectAll').checked = allChecked; }
function openBatchModal() { updateSelectAllStatus(); const group = getActiveGroup(); const selectedCases = group.cases.filter(c => c.selected); if (selectedCases.length === 0) { alert("👈 请至少在左侧勾选一个测试案例！"); return; } document.getElementById('selectedCount').value = selectedCases.length + " 个用例"; document.getElementById('batchModal').style.display = 'flex'; }
function closeBatchModal() { document.getElementById('batchModal').style.display = 'none'; }

async function runCompare(caseObj) {
    const payload = {
        old_prefix: document.getElementById('oldPrefix').value, new_prefix: document.getElementById('newPrefix').value, uri: caseObj.uri, method: caseObj.method, headers: caseObj.headers,
        payload: caseObj.payload, payload_new: caseObj.payloadNew || "", is_diff_payload: caseObj.isDiffPayload || false,
        ignore_paths: document.getElementById('ignorePaths').value, case_ignore_paths: caseObj.isCaseIgnore ? caseObj.caseIgnorePaths : ""
    };
    try { const res = await fetch('/api/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); return await res.json(); } catch (e) { return { status: 'error', message: e.message }; }
}

document.getElementById('runSingleBtn').addEventListener('click', async () => {
    saveCurrentCase(); const group = getActiveGroup(); const c = group.cases.find(c => c.id === appState.activeCaseId); if(!c) return;
    document.getElementById('runSingleBtn').innerHTML = "⏳ 执行中..."; resetResultUI("请求中...");
    const result = await runCompare(c); renderResult(result);
    c.lastStatus = (result.status === 'error' || typeof result.diff_result !== 'string') ? 'error' : 'success'; document.getElementById('runSingleBtn').innerHTML = "▶️ 执行当前案例"; renderCaseList();
});

async function runBatch() {
    saveCurrentCase(); const group = getActiveGroup(); const selectedCases = group.cases.filter(c => c.selected);
    const delayMs = parseInt(document.getElementById('batchDelay').value) || 0; const stopOnError = document.getElementById('stopOnError').checked;
    closeBatchModal(); const btn = document.querySelector('.batch-controls .btn-success'); btn.disabled = true;
    for (let i = 0; i < selectedCases.length; i++) {
        const c = selectedCases[i]; btn.innerHTML = `⏳ (${i+1}/${selectedCases.length}) 跑批中`; document.getElementById(`status-icon-${c.id}`).innerText = "⏳";
        selectCase(c.id); const result = await runCompare(c); renderResult(result);
        c.lastStatus = (result.status === 'error' || typeof result.diff_result !== 'string') ? 'error' : 'success'; document.getElementById(`status-icon-${c.id}`).innerText = c.lastStatus === 'success' ? '✅' : '❌';
        if (stopOnError && c.lastStatus === 'error') { alert(`🚫 跑批已熔断！`); break; }
        if (delayMs > 0 && i < selectedCases.length - 1) { document.getElementById('diffResult').innerHTML += `\n<div style="color:#94a3b8; padding:10px;">⏳ 睡眠 ${delayMs}ms...</div>`; await sleep(delayMs); }
    }
    btn.innerHTML = "⚙️ 批量执行"; btn.disabled = false;
}

function renderResult(data) {
    const badge = document.getElementById('statusBadge');
    if (data.status === "error") {
        document.getElementById('diffResult').innerHTML = `<div style="color:#f87171; padding:10px;">❌ 请求异常: ${data.message}</div>`;
        badge.className = "badge badge-error"; badge.innerText = "执行失败"; return;
    }

    document.getElementById('diffResult').innerHTML = renderStructuredDiffBoard(data.diff_result);

    // 🌟 统一渲染合并后的 Git 视图
    document.getElementById('unifiedGitDiff').innerHTML = renderUnifiedGitDiff(data.text_diff || []);

    if (typeof data.diff_result === 'string') { badge.className = "badge badge-success"; badge.innerText = "完全一致"; }
    else { badge.className = "badge badge-error"; badge.innerText = "存在差异"; }
}

function resetResultUI(text = "等待执行...") { document.getElementById('diffResult').innerHTML = `<div style="padding:10px; color:#94a3b8;">${text}</div>`; document.getElementById('unifiedGitDiff').innerHTML = ""; document.getElementById('statusBadge').innerText = ""; document.getElementById('statusBadge').className = "badge"; }
function enableTabIndent(elementId) { const el = document.getElementById(elementId); el.addEventListener('keydown', function(e) { if (e.key === 'Tab') { e.preventDefault(); const start = this.selectionStart, end = this.selectionEnd; this.value = this.value.substring(0, start) + "    " + this.value.substring(end); this.selectionStart = this.selectionEnd = start + 4; } }); }
function formatInput(id) { try { const el = document.getElementById(id); const obj = JSON.parse(el.value); el.value = JSON.stringify(obj, null, 4); } catch (e) { alert("JSON 格式有误，请检查！"); } }

// 🌟 新增：全局方法，一键添加忽略并立刻重跑单测！
window.quickIgnoreField = function(path) {
    document.getElementById('isCaseIgnore').checked = true;
    toggleCaseIgnore();

    let input = document.getElementById('caseIgnorePaths');
    let current = input.value.split(',').map(s => s.trim()).filter(s => s);
    if (!current.includes(path)) {
        current.push(path);
        input.value = current.join(', ');
    }

    saveCurrentCase();
    document.getElementById('runSingleBtn').click(); // 自动触发重跑，体验拉满
};

function renderStructuredDiffBoard(diffObj) {
    if (typeof diffObj === 'string') return `<div class="diff-success-box"><div>🎉</div><div>${diffObj}</div></div>`;
    let html = '';
    const fmt = val => { if (typeof val === 'object') return JSON.stringify(val); if (typeof val === 'string') return `"${val}"`; return String(val); };

    // 生成带有一键忽略按钮的字段标题
    const genTitle = path => `<div class="diff-field-name">📌 字段: ${path} <button class="btn-quick-ignore" onclick="quickIgnoreField('${path.replace(/'/g, "\\'")}')">🚫 忽略此字段</button></div>`;

    if (diffObj.values_changed) {
        html += `<div class="diff-section-title">✏️ 值不一致 (Values Mismatch)</div>`;
        for (let path in diffObj.values_changed) {
            let change = diffObj.values_changed[path];
            html += `<div class="diff-detail-item">${genTitle(path)}
                <div class="diff-compare-row"><span class="old-tag">老系统</span> <span class="val-text">${fmt(change.old_value)}</span></div>
                <div class="diff-compare-row"><span class="new-tag">新系统</span> <span class="val-text">${fmt(change.new_value)}</span></div></div>`;
        }
    }

    if (diffObj.type_changes) {
        html += `<div class="diff-section-title">🔄 类型不一致 (Type Mismatch)</div>`;
        for (let path in diffObj.type_changes) {
            let change = diffObj.type_changes[path];
            html += `<div class="diff-detail-item">${genTitle(path)}
                <div class="diff-compare-row"><span class="old-tag">老系统</span> <span class="val-text">${fmt(change.old_value)} <span style="color:#64748b">(${change.old_type})</span></span></div>
                <div class="diff-compare-row"><span class="new-tag">新系统</span> <span class="val-text">${fmt(change.new_value)} <span style="color:#64748b">(${change.new_type})</span></span></div></div>`;
        }
    }

    if (diffObj.dictionary_item_added || diffObj.iterable_item_added) {
        html += `<div class="diff-section-title">🟢 新系统多出字段 (Added in New)</div>`;
        if(diffObj.dictionary_item_added) diffObj.dictionary_item_added.forEach(path => { html += `<div class="diff-detail-item">${genTitle(path)}</div>`; });
        if(diffObj.iterable_item_added) { for (let path in diffObj.iterable_item_added) { html += `<div class="diff-detail-item">${genTitle(path)}<div class="diff-compare-row"><span class="new-tag">多出内容</span> <span class="val-text">${fmt(diffObj.iterable_item_added[path])}</span></div></div>`; } }
    }

    if (diffObj.dictionary_item_removed || diffObj.iterable_item_removed) {
        html += `<div class="diff-section-title">🔴 新系统缺失字段 (Missing in New)</div>`;
        if(diffObj.dictionary_item_removed) diffObj.dictionary_item_removed.forEach(path => { html += `<div class="diff-detail-item">${genTitle(path)}</div>`; });
        if(diffObj.iterable_item_removed) { for (let path in diffObj.iterable_item_removed) { html += `<div class="diff-detail-item">${genTitle(path)}<div class="diff-compare-row"><span class="old-tag">缺失内容</span> <span class="val-text">${fmt(diffObj.iterable_item_removed[path])}</span></div></div>`; } }
    }
    return html;
}

// 🌟 全新的统一 Git 行渲染引擎 (绝对对齐)
function renderUnifiedGitDiff(ndiffLines) {
    if (!ndiffLines || ndiffLines.length === 0) return '';
    let html = '';

    for (let i = 0; i < ndiffLines.length; i++) {
        let line = ndiffLines[i];
        if (line.startsWith('? ')) continue;

        let type = line.charAt(0); // ' ', '-', '+'
        let content = line.substring(2).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || ' ';

        if (type === ' ') {
            html += `<div class="diff-table-row"><div class="diff-table-cell">${content}</div><div class="diff-table-cell">${content}</div></div>`;
        } else if (type === '-') {
            // 预测下一行是不是被修改的（+）
            let hasPlus = false;
            let plusContent = '';
            let skipCount = 0;
            if (i + 1 < ndiffLines.length && ndiffLines[i+1].startsWith('? ')) skipCount++;
            if (i + 1 + skipCount < ndiffLines.length && ndiffLines[i+1+skipCount].startsWith('+ ')) {
                hasPlus = true;
                plusContent = ndiffLines[i+1+skipCount].substring(2).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || ' ';
                skipCount++;
            }

            if (hasPlus) {
                // 如果是同一行的修改，放在同一个 Flex 容器的左右两边
                html += `<div class="diff-table-row"><div class="diff-table-cell del">${content}</div><div class="diff-table-cell add">${plusContent}</div></div>`;
                i += skipCount;
            } else {
                html += `<div class="diff-table-row"><div class="diff-table-cell del">${content}</div><div class="diff-table-cell empty"></div></div>`;
            }
        } else if (type === '+') {
            html += `<div class="diff-table-row"><div class="diff-table-cell empty"></div><div class="diff-table-cell add">${content}</div></div>`;
        }
    }
    return html;
}