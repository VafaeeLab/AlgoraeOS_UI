// ============================================================================
// ALGORAEOS - AI-Powered Drug Combination Analysis (static version)
// ----------------------------------------------------------------------------
// Reads pre-built JSON files (no server needed, works on GitHub Pages):
//   data/index.json      drugs [name, pubchem_cid, has_shard] + cell line names
//   data/b/<n>.json      { drug1_cid: { drug2_cid: { cell_index: row } } }, n = cid % 64
// A row is 12 numbers: prediction[bliss,loewe,hsa,zip], total uncertainty[...],
// ground truth[...] (null when there is no measured value).
// Rebuild the files with scripts/build_data.py.
// ============================================================================

const DATA_URL = 'data';
const METRICS = ['bliss', 'loewe', 'hsa', 'zip'];

const state = {
    drugs: [],              // [{name, cid, hasShard}]
    byCid: new Map(),       // cid -> drug
    byName: new Map(),      // lower-case name -> [drug]
    cellLines: [],          // index -> name
    cellByKey: new Map(),   // normalised name -> index
    buckets: new Map(),     // bucket number -> Promise<{cid: shard}>
    bucketCount: 64,
    drug1: null,            // selected drug objects
    drug2: null,
};
let radarChart = null;

// ============================================================================
// INITIALISATION
// ============================================================================

window.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    try {
        const res = await fetch(`${DATA_URL}/index.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const index = await res.json();

        state.drugs = index.drugs.map(([name, cid, hasShard]) => ({ name, cid, hasShard: !!hasShard }));
        state.drugs.forEach(d => {
            state.byCid.set(d.cid, d);
            const key = d.name.toLowerCase();
            if (!state.byName.has(key)) state.byName.set(key, []);
            state.byName.get(key).push(d);
        });
        state.cellLines = index.cell_lines;
        state.bucketCount = index.buckets || 64;
        state.cellLines.forEach((name, i) => state.cellByKey.set(cellKey(name), i));

        state.drug1Options = state.drugs.filter(d => d.hasShard);
        state.drug2Options = [];
        attachAutocomplete('drug1', () => state.drug1Options);
        attachAutocomplete('drug2', () => state.drug2Options);
        const drug1 = document.getElementById('drug1');
        drug1.disabled = false;
        drug1.placeholder = 'Start typing a drug name or CID...';
        drug1.addEventListener('change', onDrug1Change);
        document.getElementById('drug2').addEventListener('change', onDrug2Change);

        console.log(`✓ AlgoraeOS ready: ${state.drugs.length} drugs, ${state.cellLines.length} cell lines, ${index.combinations} combinations`);
    } catch (error) {
        console.error(error);
        showError('Could not load the synergy data files. Please refresh the page.');
    }
}

// ============================================================================
// LOOKUP HELPERS (drugs by name or PubChem CID)
// ============================================================================

function drugLabel(d) {
    return `${d.name} (CID ${d.cid})`;
}

function cellKey(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Returns every drug matching the text: "Name (CID 123)", "123", "CID 123" or "Name".
function resolveDrugs(text) {
    const t = String(text || '').trim();
    if (!t) return [];
    let m = t.match(/\(\s*CID\s*(\d+)\s*\)\s*$/i) || t.match(/^(?:CID\s*:?\s*)?(\d+)(?:\.0+)?$/i);
    if (m) {
        const d = state.byCid.get(Number(m[1]));
        if (d) return [d];
    }
    return state.byName.get(t.toLowerCase()) || [];
}

function resolveCell(text) {
    const i = state.cellByKey.get(cellKey(text));
    return i === undefined ? -1 : i;
}

// Drug 1 data is grouped into a few bucket files: data/b/<cid % buckets>.json
function getBucket(n) {
    if (!state.buckets.has(n)) {
        const p = fetch(`${DATA_URL}/b/${n}.json`)
            .then(r => (r.ok ? r.json() : {}))
            .catch(() => { state.buckets.delete(n); return {}; });
        state.buckets.set(n, p);
    }
    return state.buckets.get(n);
}

async function getShard(cid) {
    const bucket = await getBucket(cid % state.bucketCount);
    return bucket[cid] || {};
}

// Finds the prediction for drug lists a x b in a cell line. Tries the given
// order first, then the swapped order. Returns null if nothing matches.
async function findCombination(drugsA, drugsB, cellIdx) {
    for (const [first, second, swapped] of [[drugsA, drugsB, false], [drugsB, drugsA, true]]) {
        for (const d1 of first) {
            if (!d1.hasShard) continue;
            const shard = await getShard(d1.cid);
            for (const d2 of second) {
                const row = shard[d2.cid] && shard[d2.cid][cellIdx];
                if (row) return makeResult(d1, d2, cellIdx, row, swapped);
            }
        }
    }
    return null;
}

function makeResult(d1, d2, cellIdx, row, swapped = false) {
    const r = {
        drug_1: d1.name, drug_1_cid: d1.cid,
        drug_2: d2.name, drug_2_cid: d2.cid,
        cell_line: state.cellLines[cellIdx],
        swapped,
    };
    METRICS.forEach((m, i) => {
        r[m] = row[i];
        r[`${m}_uncertainty`] = row[i + 4];
        r[`${m}_gt`] = row[i + 8];
    });
    return r;
}

// ============================================================================
// SINGLE QUERY: cascading inputs
// ============================================================================

// ----------------------------------------------------------------------------
// Autocomplete: suggestions ranked by how the typed text matches
//   0  name starts with it, or CID starts with it
//   1  a word inside the name starts with it (e.g. "acid" -> "Folic acid")
//   2  name contains it anywhere
// ----------------------------------------------------------------------------
const MAX_SUGGESTIONS = 50;

function rankDrugs(options, query) {
    const q = query.trim().toLowerCase().replace(/^cid\s*:?\s*/, '');
    if (!q) return options.slice(0, MAX_SUGGESTIONS).map(d => ({ d, rank: 0, at: -1 }));
    const hits = [];
    for (const d of options) {
        const name = d.lower || (d.lower = d.name.toLowerCase());
        let rank = -1, at = -1;
        if (name.startsWith(q)) { rank = 0; at = 0; }
        else if (String(d.cid).startsWith(q)) { rank = 0; }
        else {
            at = name.indexOf(q);
            if (at > 0) rank = /[^a-z0-9]/.test(name[at - 1]) ? 1 : 2;
        }
        if (rank >= 0) hits.push({ d, rank, at });
    }
    hits.sort((a, b) => a.rank - b.rank || a.d.name.length - b.d.name.length || a.d.name.localeCompare(b.d.name));
    return hits.slice(0, MAX_SUGGESTIONS);
}

function attachAutocomplete(inputId, getOptions) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(`${inputId}-suggest`);
    let items = [];
    let active = -1;

    const close = () => {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        active = -1;
    };

    const highlight = i => {
        active = i;
        [...list.children].forEach((li, j) => li.classList.toggle('active', j === i));
        if (list.children[i]) list.children[i].scrollIntoView({ block: 'nearest' });
    };

    const pick = d => {
        input.value = drugLabel(d);
        close();
        input.dispatchEvent(new Event('change'));
    };

    const render = () => {
        const q = input.value;
        items = rankDrugs(getOptions(), q);
        const qLen = q.trim().replace(/^cid\s*:?\s*/i, '').length;
        list.replaceChildren(...items.map(({ d, at }, i) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            const name = document.createElement('span');
            if (at >= 0 && qLen) {
                const mark = document.createElement('mark');
                mark.textContent = d.name.slice(at, at + qLen);
                name.append(d.name.slice(0, at), mark, d.name.slice(at + qLen));
            } else {
                name.textContent = d.name;
            }
            const cid = document.createElement('span');
            cid.className = 'ac-cid';
            cid.textContent = `CID ${d.cid}`;
            li.append(name, cid);
            li.addEventListener('mousedown', e => { e.preventDefault(); pick(d); });
            li.addEventListener('mousemove', () => active !== i && highlight(i));
            return li;
        }));
        if (!items.length) {
            const li = document.createElement('li');
            li.className = 'ac-empty';
            li.textContent = 'No matching drugs';
            list.append(li);
        }
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        highlight(items.length && q.trim() ? 0 : -1);
    };

    input.addEventListener('input', render);
    input.addEventListener('focus', () => {
        if (input.disabled) return;
        setTimeout(() => input.select(), 0); // typing replaces the previous choice (survives mouseup)
        render();
    });
    input.addEventListener('blur', close);
    input.addEventListener('keydown', e => {
        if (list.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { render(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(active + 1, items.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(active - 1, 0)); }
        else if (e.key === 'Enter') {
            if (!list.hidden && items[active]) { e.preventDefault(); pick(items[active].d); }
        } else if (e.key === 'Escape') close();
    });
}

async function onDrug1Change() {
    const input = document.getElementById('drug1');
    const drug2 = document.getElementById('drug2');
    const cellSelect = document.getElementById('cellLine');

    state.drug1 = null;
    state.drug2 = null;
    drug2.value = '';
    drug2.disabled = true;
    drug2.placeholder = 'Choose Drug 1 first';
    state.drug2Options = [];
    cellSelect.innerHTML = '<option value="">Select cell line...</option>';
    cellSelect.disabled = true;
    hideResults();

    const matches = resolveDrugs(input.value).filter(d => d.hasShard);
    if (!input.value.trim()) return;
    if (matches.length === 0) {
        drug2.placeholder = 'Drug 1 not found';
        return;
    }
    const d1 = matches[0];
    state.drug1 = d1;
    input.value = drugLabel(d1);

    drug2.placeholder = 'Loading...';
    const shard = await getShard(d1.cid);
    if (state.drug1 !== d1) return; // selection changed while loading
    const partners = Object.keys(shard)
        .map(c => state.byCid.get(Number(c)))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
    state.drug2Options = partners;
    drug2.disabled = false;
    drug2.placeholder = `Type a name or CID (${partners.length} partners)...`;
}

async function onDrug2Change() {
    const input = document.getElementById('drug2');
    const cellSelect = document.getElementById('cellLine');
    state.drug2 = null;
    cellSelect.innerHTML = '<option value="">Select cell line...</option>';
    cellSelect.disabled = true;
    hideResults();
    if (!state.drug1 || !input.value.trim()) return;

    const shard = await getShard(state.drug1.cid);
    const d2 = resolveDrugs(input.value).find(d => shard[d.cid]);
    if (!d2) {
        cellSelect.innerHTML = '<option value="">No data for this pair</option>';
        return;
    }
    state.drug2 = d2;
    input.value = drugLabel(d2);

    const cells = Object.keys(shard[d2.cid]).map(Number)
        .sort((a, b) => state.cellLines[a].localeCompare(state.cellLines[b]));
    cells.forEach(i => {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = state.cellLines[i];
        cellSelect.appendChild(o);
    });
    cellSelect.disabled = false;
}

// ============================================================================
// MODE SWITCHING
// ============================================================================

function switchMode(mode) {
    document.getElementById('single-mode').style.display = mode === 'single' ? 'block' : 'none';
    document.getElementById('batch-mode').style.display = mode === 'single' ? 'none' : 'block';
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${mode}'`));
    });
}

// ============================================================================
// SINGLE QUERY: results
// ============================================================================

async function predictSynergy() {
    const cellValue = document.getElementById('cellLine').value;
    if (!state.drug1 || !state.drug2 || cellValue === '') {
        alert('Please choose Drug 1, Drug 2 and a Cell Line.');
        return;
    }
    const shard = await getShard(state.drug1.cid);
    const row = shard[state.drug2.cid] && shard[state.drug2.cid][cellValue];
    if (!row) {
        alert('No data found for this combination.');
        return;
    }
    const result = makeResult(state.drug1, state.drug2, Number(cellValue), row);
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = getResultsHTML(result);
    displayResults(result);
}

function getResultsHTML(r) {
    const card = (m, label, desc) => `
        <div class="metric-card metric-${m}">
            <div class="metric-header">
                <span class="metric-name">${label}</span>
                <div class="metric-value-group">
                    <span class="metric-value" id="${m}-value">-</span>
                    <span class="metric-uncertainty" id="${m}-uncertainty"></span>
                </div>
            </div>
            <p class="metric-desc">${desc}<span class="metric-gt" id="${m}-gt"></span></p>
        </div>`;
    return `
        <div class="results-header">
            <h4>Predicted Synergy Scores</h4>
            <p class="results-subtitle">${escapeHTML(drugLabel(state.byCid.get(r.drug_1_cid)))} +
               ${escapeHTML(drugLabel(state.byCid.get(r.drug_2_cid)))} in ${escapeHTML(r.cell_line)}</p>
        </div>
        <div class="results-grid">
            <div class="metrics-panel">
                ${card('bliss', 'Bliss', 'Independence model')}
                ${card('loewe', 'Loewe', 'Additivity reference')}
                ${card('hsa', 'HSA', 'Highest single agent')}
                ${card('zip', 'ZIP', 'Zero interaction potency')}
            </div>
            <div class="chart-panel">
                <canvas id="radarChart"></canvas>
            </div>
        </div>
        <div class="info-banner">
            <strong>Note:</strong> Values are model predictions ± total (epistemic + aleatoric) uncertainty.
            Scores depend on assay normalization; interpret within context.
        </div>`;
}

function fmt(v) {
    return v === null || v === undefined ? '-' : v.toFixed(3);
}

function displayResults(result) {
    METRICS.forEach(m => {
        document.getElementById(`${m}-value`).textContent = fmt(result[m]);
        const u = result[`${m}_uncertainty`];
        document.getElementById(`${m}-uncertainty`).textContent = u === null ? '' : `±${u.toFixed(3)}`;
        const gt = result[`${m}_gt`];
        document.getElementById(`${m}-gt`).textContent = gt === null ? '' : ` · measured ${gt.toFixed(3)}`;
    });
    const resultsDiv = document.getElementById('results');
    resultsDiv.style.display = 'block';
    setTimeout(() => resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    updateRadarChart(result);
}

function hideResults() {
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) resultsDiv.style.display = 'none';
}

// ============================================================================
// RADAR CHART
// ============================================================================

function updateRadarChart(result) {
    const canvas = document.getElementById('radarChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (radarChart) radarChart.destroy();

    const values = METRICS.map(m => result[m]);
    // Synergy scores can be negative, so use a symmetric scale around zero.
    const extent = Math.max(5, ...values.map(v => Math.abs(v || 0)));
    const step = extent > 50 ? 20 : extent > 20 ? 10 : 5;
    const limit = Math.ceil(extent / step) * step;

    radarChart = new Chart(canvas.getContext('2d'), {
        type: 'radar',
        data: {
            labels: ['Bliss', 'Loewe', 'HSA', 'ZIP'],
            datasets: [{
                label: 'Predicted synergy',
                data: values,
                backgroundColor: 'rgba(79, 123, 247, 0.2)',
                borderColor: '#4F7BF7',
                borderWidth: 3,
                pointBackgroundColor: '#4F7BF7',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    min: -limit,
                    max: limit,
                    ticks: { stepSize: step, font: { size: 11 } },
                    grid: { color: 'rgba(0, 0, 0, 0.1)' },
                    angleLines: { color: 'rgba(0, 0, 0, 0.1)' },
                    pointLabels: { font: { size: 13, weight: 'bold' } },
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const m = METRICS[ctx.dataIndex];
                            const u = result[`${m}_uncertainty`];
                            return `${ctx.label}: ${fmt(ctx.parsed.r)}${u === null ? '' : ` ±${u.toFixed(3)}`}`;
                        },
                    },
                },
            },
        },
    });
}

// ============================================================================
// BATCH QUERY
// ============================================================================

// Splits a line into [drug1, drug2, cell]. Tabs/semicolons are used as-is.
// With commas, drug names may themselves contain commas, so the cell line is
// the last field and the split between the two drugs is chosen so both resolve.
function parseBatchLine(line) {
    const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
    const parts = line.split(delim).map(p => p.trim());
    if (parts.length < 3) return null;
    if (parts.length === 3 || delim !== ',') {
        return parts.length === 3 ? parts : null;
    }
    const cell = parts[parts.length - 1];
    const drugParts = parts.slice(0, -1);
    for (let k = 1; k < drugParts.length; k++) {
        const a = drugParts.slice(0, k).join(', ');
        const b = drugParts.slice(k).join(', ');
        if (resolveDrugs(a).length && resolveDrugs(b).length) return [a, b, cell];
    }
    return [drugParts[0], drugParts.slice(1).join(', '), cell];
}

async function processBatchQuery() {
    const input = document.getElementById('batch-input').value.trim();
    if (!input) {
        alert('Please enter queries in the text area');
        return;
    }
    if (!state.drugs.length) {
        alert('Data is still loading, please try again in a moment.');
        return;
    }

    const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        .filter(l => !/^drug_?1\b/i.test(l)); // skip a header row
    const resultsDiv = document.getElementById('batch-results');
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><p>Processing batch query...</p></div>';

    const results = [];
    for (const line of lines) {
        const parsed = parseBatchLine(line);
        if (!parsed) {
            results.push({ drug_1: line, drug_2: '', cell_line: '', status: 'invalid', note: 'Use: drug_1, drug_2, cell_line' });
            continue;
        }
        const [q1, q2, qc] = parsed;
        const a = resolveDrugs(q1), b = resolveDrugs(q2), cellIdx = resolveCell(qc);
        const missing = [!a.length && `drug "${q1}"`, !b.length && `drug "${q2}"`, cellIdx < 0 && `cell line "${qc}"`].filter(Boolean);
        if (missing.length) {
            results.push({ drug_1: q1, drug_2: q2, cell_line: qc, status: 'not_found', note: `Unknown ${missing.join(', ')}` });
            continue;
        }
        const r = await findCombination(a, b, cellIdx);
        if (r) {
            r.status = 'found';
            r.note = r.swapped ? 'Only the reversed order (Drug 2 + Drug 1) is in the data' : '';
            results.push(r);
        } else {
            results.push({ drug_1: a[0].name, drug_1_cid: a[0].cid, drug_2: b[0].name, drug_2_cid: b[0].cid,
                cell_line: state.cellLines[cellIdx], status: 'not_found', note: 'Combination not in the data' });
        }
    }

    resultsDiv.innerHTML = getBatchResultsHTML();
    displayBatchResults(results);
}

function getBatchResultsHTML() {
    return `
        <div class="results-header">
            <h4>Results</h4>
            <button class="btn-secondary" onclick="exportBatchResults()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export CSV
            </button>
        </div>
        <div class="table-container">
            <table id="results-table">
                <thead>
                    <tr>
                        <th>Drug 1</th><th>Drug 2</th><th>CIDs</th><th>Cell Line</th>
                        <th>Bliss</th><th>Loewe</th><th>HSA</th><th>ZIP</th><th>Status</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>`;
}

function displayBatchResults(results) {
    const tbody = document.querySelector('#results-table tbody');
    tbody.innerHTML = '';
    results.forEach(row => {
        const cell = m => {
            if (row[m] === null || row[m] === undefined) return '-';
            const u = row[`${m}_uncertainty`];
            return u === null || u === undefined
                ? fmt(row[m])
                : `<span class="metric-with-uncertainty" title="Uncertainty: ±${u.toFixed(3)}">${fmt(row[m])}</span>`;
        };
        const cids = row.drug_1_cid ? `${row.drug_1_cid} + ${row.drug_2_cid}` : '-';
        const found = row.status === 'found';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHTML(row.drug_1)}</td>
            <td>${escapeHTML(row.drug_2)}</td>
            <td>${cids}</td>
            <td>${escapeHTML(row.cell_line)}</td>
            <td>${cell('bliss')}</td><td>${cell('loewe')}</td><td>${cell('hsa')}</td><td>${cell('zip')}</td>
            <td>
                <span class="status-badge ${found ? 'status-found' : 'status-not-found'}" title="${escapeHTML(row.note || '')}">
                    ${found ? (row.swapped ? '✓ Found (reversed)' : '✓ Found') : row.status === 'invalid' ? '✗ Invalid line' : '✗ Not found'}
                </span>
            </td>`;
        tbody.appendChild(tr);
    });
    window.batchResults = results;
}

// ============================================================================
// EXPORT
// ============================================================================

function csvField(v) {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportBatchResults() {
    if (!window.batchResults || window.batchResults.length === 0) {
        alert('No results to export');
        return;
    }
    const headers = ['drug_1', 'drug_1_cid', 'drug_2', 'drug_2_cid', 'cell_line',
        ...METRICS, ...METRICS.map(m => `${m}_uncertainty`), ...METRICS.map(m => `${m}_ground_truth`),
        'status', 'note'];
    const keys = headers.map(h => h.replace('_ground_truth', '_gt'));
    const csv = [headers.join(','), ...window.batchResults.map(r => keys.map(k => csvField(r[k])).join(','))].join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `synergy_results_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================================================
// UTILITIES & MODAL
// ============================================================================

function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showError(message) {
    alert(`Error: ${message}`);
    console.error(message);
}

function showAbout() {
    document.getElementById('about-modal').classList.add('active');
}

function hideAbout() {
    document.getElementById('about-modal').classList.remove('active');
}

window.addEventListener('click', event => {
    if (event.target === document.getElementById('about-modal')) hideAbout();
});
