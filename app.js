let DATA = [];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ORD = Object.fromEntries(MONTHS.map((month, index) => [month, index + 1]));
const CURRENT_STATES = new Set(['open_now', 'rolling', 'upcoming']);
const RECOMMENDED_STATES = new Set(['open_now', 'rolling', 'upcoming', 'historically_recurring']);
const TRUST = {
  open_now: { label: 'Open now', dot: 'active', tone: 'current' },
  rolling: { label: 'Rolling', dot: 'active', tone: 'current' },
  upcoming: { label: 'Upcoming', dot: 'likely', tone: 'current' },
  historically_recurring: { label: 'Historically recurring', dot: 'likely', tone: 'pattern' },
  invitation_only: { label: 'Invitation-only', dot: 'verify', tone: 'limited' },
  closed: { label: 'Closed', dot: 'inactive', tone: 'closed' },
  historical_archive: { label: 'Historical archive', dot: 'check', tone: 'archive' },
  needs_verification: { label: 'Needs verification', dot: 'verify', tone: 'verify' },
};
const TYPE_COLORS = {
  Grant: '#D96F55', Fellowship: '#765F7E', 'Competition/Prize/Award': '#C99A21',
  'Accelerator/Incubator': '#438F88', 'Program/Cohort': '#34766F',
  'Grant (LOI Stage)': '#8F5E4D', RFP: '#9A536A',
};
const TYPE_CSS = {
  Grant: 'tag-type-grant', Fellowship: 'tag-type-fellowship',
  'Competition/Prize/Award': 'tag-type-competition', 'Accelerator/Incubator': 'tag-type-accelerator',
  'Program/Cohort': 'tag-type-program', 'Grant (LOI Stage)': 'tag-type-loi', RFP: 'tag-type-rfp',
};

let filtered = [];
let tableFiltered = [];
let currentPage = 1;
let tableSortCol = null;
let tableSortDir = 1;
let advOpen = false;
let typeSel = '';
let profileActive = 'open';
let profileMinAmt = 0;
let profileClosingDays = 0;
let debounceTimer = null;
let lastFocusedElement = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.querySelectorAll('.profile-pill').forEach(button => button.setAttribute('aria-pressed', 'false'));
  document.querySelectorAll('.type-pill').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('on'))));
  try {
    const response = await fetch('./data/grants.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    DATA = await response.json();
    filtered = [...DATA];
    tableFiltered = [...DATA];
    setCounts();
    buildDashboard();
    buildCalendar();
    applyFilters();
    applyTableFilter();
  } catch (error) {
    console.error('Unable to load grant data', error);
    document.getElementById('results-count').innerHTML = '<strong>Grant data could not load.</strong> Refresh the page or try again later.';
    document.getElementById('cards-grid').innerHTML = '<div class="data-error">The directory is temporarily unavailable. No personal data was sent or stored.</div>';
  }
}

function setCounts() {
  const open = DATA.filter(record => effectiveTrustState(record) === 'open_now');
  const patterns = DATA.filter(record => record.trust_state === 'historically_recurring');
  const global = DATA.filter(record => (record.geography || '').includes('Global'));
  const values = {
    'hs-total': DATA.length, 'hs-active': open.length, 'hs-recurring': patterns.length,
    'k-total': DATA.length, 'k-active': open.length, 'k-recurring': patterns.length, 'k-global': global.length,
    'tc-table': DATA.length,
  };
  Object.entries(values).forEach(([id, value]) => { document.getElementById(id).textContent = value; });
}

function getPageSize() {
  if (window.innerWidth < 720) return 12;
  if (window.innerWidth < 1100) return 24;
  return 36;
}

function gotoTab(name) {
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.classList.remove('active');
    button.setAttribute('aria-selected', 'false');
  });
  document.getElementById(`panel-${name}`).classList.add('active');
  const tab = document.getElementById(`tab-${name}`);
  tab.classList.add('active');
  tab.setAttribute('aria-selected', 'true');
}

function debouncedFilter() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(applyFilters, 180);
}

function getFilters() {
  return {
    q: (document.getElementById('s-search').value || '').toLowerCase().trim(),
    type: typeSel,
    geo: document.getElementById('f-geo').value,
    status: document.getElementById('f-status').value,
    sector: document.getElementById('f-sector').value,
    rec: document.getElementById('f-rec').value,
    month: document.getElementById('f-month').value,
    minAmt: profileMinAmt,
    closingDays: profileClosingDays,
  };
}

function matches(record, filters) {
  const trustState = effectiveTrustState(record);
  if (filters.q) {
    const text = [record.name, record.summary, record.historical_context, record.sector, record.geography].join(' ').toLowerCase();
    if (!filters.q.split(/\s+/).filter(Boolean).every(word => text.includes(word))) return false;
  }
  if (filters.type && record.opportunity_type !== filters.type) return false;
  if (filters.geo && !(record.geography || '').includes(filters.geo)) return false;
  if (filters.status === 'recommended' && !RECOMMENDED_STATES.has(trustState)) return false;
  if (filters.status && filters.status !== 'recommended' && trustState !== filters.status) return false;
  if (filters.sector && !(record.sector || '').includes(filters.sector)) return false;
  if (filters.rec && String(record.is_recurring) !== filters.rec) return false;
  if (filters.month && !(record.typical_cycle_months || []).includes(filters.month)) return false;
  if (filters.minAmt > 0 && amountValue(record.grant_amount) < filters.minAmt) return false;
  if (filters.closingDays > 0) {
    const closesOn = record.current_cycle?.closes_on;
    if (!closesOn) return false;
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`);
    const deadline = new Date(`${closesOn}T12:00:00Z`);
    const daysRemaining = Math.ceil((deadline - today) / 86400000);
    if (daysRemaining < 0 || daysRemaining > filters.closingDays) return false;
  }
  return true;
}

function effectiveTrustState(record, today = new Date().toISOString().slice(0, 10)) {
  const closesOn = record.current_cycle?.closes_on;
  const opensOn = record.current_cycle?.opens_on;
  if (closesOn && closesOn < today && ['open_now', 'upcoming'].includes(record.trust_state)) return 'closed';
  if (record.trust_state === 'upcoming' && (!opensOn || opensOn <= today)) return 'open_now';
  return record.trust_state;
}

function amountValue(value) {
  const numbers = (value || '').match(/[\d,]+/g) || [];
  return numbers.reduce((max, number) => Math.max(max, Number(number.replaceAll(',', '')) || 0), 0);
}

function sortData(records, by) {
  const result = [...records];
  if (by === 'relevance') {
    const rank = { open_now: 0, rolling: 1, upcoming: 2, historically_recurring: 3, invitation_only: 4, needs_verification: 5, closed: 6, historical_archive: 7 };
    result.sort((a, b) => (rank[effectiveTrustState(a)] ?? 9) - (rank[effectiveTrustState(b)] ?? 9) || deadlineOrder(a) - deadlineOrder(b) || a.name.localeCompare(b.name));
  }
  if (by === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
  if (by === 'year_desc') result.sort((a, b) => (b.last_observed_year || 0) - (a.last_observed_year || 0));
  if (by === 'deadline') result.sort((a, b) => deadlineOrder(a) - deadlineOrder(b));
  if (by === 'amount_desc') result.sort((a, b) => amountValue(b.grant_amount) - amountValue(a.grant_amount));
  return result;
}

function deadlineOrder(record) {
  if (record.current_cycle?.closes_on) return Number(record.current_cycle.closes_on.replaceAll('-', ''));
  return 99990000 + (MONTH_ORD[record.typical_cycle_months?.[0]] || 99);
}

function countActiveFilters() {
  const filters = getFilters();
  const fields = [filters.geo, filters.sector, filters.rec, filters.month];
  if (filters.status && filters.status !== 'open_now') fields.push(filters.status);
  return fields.filter(Boolean).length + (filters.q ? 1 : 0) + (typeSel ? 1 : 0) + (filters.closingDays ? 1 : 0);
}

function applyFilters() {
  const filters = getFilters();
  filtered = sortData(DATA.filter(record => matches(record, filters)), document.getElementById('sort-by').value);
  currentPage = 1;
  renderCards();
  const count = countActiveFilters();
  const badge = document.getElementById('filter-badge');
  badge.textContent = count;
  badge.classList.toggle('show', count > 0);
  document.getElementById('tc-browse').textContent = filtered.length;
  document.getElementById('historical-paths').hidden = filters.status !== 'open_now';
}

function resetAll() {
  document.getElementById('s-search').value = '';
  ['f-geo', 'f-sector', 'f-rec', 'f-month'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('f-status').value = 'open_now';
  typeSel = '';
  profileMinAmt = 0;
  profileClosingDays = 0;
  profileActive = 'open';
  document.querySelectorAll('.type-pill').forEach(button => button.classList.toggle('on', button.dataset.val === ''));
  document.querySelectorAll('.profile-pill').forEach(button => button.classList.toggle('on', button.dataset.profile === 'open'));
  syncPressedStates();
  applyFilters();
}

function showFullArchive() {
  resetAll();
  document.getElementById('f-status').value = '';
  profileActive = 'archive';
  document.querySelectorAll('.profile-pill').forEach(button => button.classList.remove('on'));
  syncPressedStates();
  applyFilters();
}

function showRecurringPatterns() {
  resetAll();
  document.getElementById('f-status').value = 'historically_recurring';
  profileActive = 'recurring-patterns';
  document.querySelectorAll('.profile-pill').forEach(button => button.classList.remove('on'));
  syncPressedStates();
  applyFilters();
}

function toggleAdvanced() {
  advOpen = !advOpen;
  document.getElementById('adv-filters').classList.toggle('open', advOpen);
  document.getElementById('filter-toggle').setAttribute('aria-expanded', String(advOpen));
}

function setType(button) {
  typeSel = button.dataset.val;
  document.querySelectorAll('.type-pill').forEach(item => item.classList.toggle('on', item === button));
  syncPressedStates();
  applyFilters();
}

const PROFILES = {
  open: {},
  global: { geo: 'Global' },
  big: { minAmt: 100000 },
  closing: { closingDays: 30 },
};

function applyProfile(key) {
  if (profileActive === key) { resetAll(); return; }
  resetAll();
  profileActive = key;
  const profile = PROFILES[key];
  if (profile.geo) document.getElementById('f-geo').value = profile.geo;
  if (profile.sector) document.getElementById('f-sector').value = profile.sector;
  if (profile.rec) document.getElementById('f-rec').value = profile.rec;
  if (profile.type) {
    typeSel = profile.type;
    document.querySelectorAll('.type-pill').forEach(button => button.classList.toggle('on', button.dataset.val === profile.type));
  }
  profileMinAmt = profile.minAmt || 0;
  profileClosingDays = profile.closingDays || 0;
  document.querySelectorAll('.profile-pill').forEach(button => button.classList.toggle('on', button.dataset.profile === key));
  syncPressedStates();
  applyFilters();
}

function syncPressedStates() {
  document.querySelectorAll('.profile-pill, .type-pill').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('on'))));
}

function renderCards() {
  const grid = document.getElementById('cards-grid');
  const noResults = document.getElementById('no-results');
  const pagination = document.getElementById('pagination');
  const resultCount = document.getElementById('results-count');
  if (!filtered.length) {
    grid.innerHTML = '';
    pagination.innerHTML = '';
    noResults.style.display = '';
    resultCount.innerHTML = '<strong>0</strong> programs match';
    return;
  }
  noResults.style.display = 'none';
  const pageSize = getPageSize();
  const pages = Math.ceil(filtered.length / pageSize);
  currentPage = Math.min(currentPage, pages);
  const page = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  resultCount.innerHTML = `<strong>${filtered.length}</strong> program${filtered.length === 1 ? '' : 's'} found`;
  grid.innerHTML = page.map(cardMarkup).join('');
  renderPagination(pages);
}

function cardMarkup(record) {
  const index = DATA.indexOf(record);
  const trust = TRUST[effectiveTrustState(record)] || TRUST.needs_verification;
  const cycle = cycleLabel(record);
  return `<article class="card" data-type="${esc(record.opportunity_type)}" role="button" tabindex="0" aria-label="View details for ${esc(record.name)}" onclick="openModal(${index})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openModal(${index})}">
    <div class="card-header"><div class="card-name">${esc(record.name)}</div><div class="card-status" title="${esc(trust.label)}"><span class="status-dot ${trust.dot}" aria-hidden="true"></span><span>${esc(trust.label)}</span></div></div>
    <div class="card-amount${record.grant_amount ? '' : ' empty'}">${esc(record.grant_amount || 'Amount not specified')}</div>
    <div class="card-tags"><span class="tag ${TYPE_CSS[record.opportunity_type] || 'tag-type-default'}">${esc(record.opportunity_type)}</span>${record.is_recurring ? '<span class="tag tag-recurring">Recurring pattern</span>' : ''}${record.current_cycle ? '<span class="tag tag-verified">Officially checked</span>' : ''}</div>
    <p class="card-desc">${esc(record.summary || 'No summary available.')}</p>
    <div class="card-footer"><span class="card-geo">${esc((record.geography || 'Not specified').split(',')[0].trim())}</span>${cycle ? `<span class="card-deadline ${record.current_cycle ? 'is-current' : ''}">${esc(cycle)}</span>` : ''}</div>
  </article>`;
}

function cycleLabel(record) {
  const state = effectiveTrustState(record);
  if (record.current_cycle?.closes_on && state === 'closed') return `Closed ${formatDate(record.current_cycle.closes_on)}`;
  if (record.current_cycle?.closes_on && CURRENT_STATES.has(state)) return `Closes ${formatDate(record.current_cycle.closes_on)}`;
  const months = record.typical_cycle_months || [];
  return months.length ? `Typical: ${months.join(' / ')}` : '';
}

function renderPagination(pages) {
  const element = document.getElementById('pagination');
  if (pages <= 1) { element.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>`;
  for (let page = 1; page <= pages; page += 1) {
    if (page === 1 || page === pages || Math.abs(page - currentPage) <= 2) html += `<button class="page-btn ${page === currentPage ? 'active' : ''}" onclick="goPage(${page})">${page}</button>`;
    else if (Math.abs(page - currentPage) === 3) html += '<span class="page-info">…</span>';
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === pages ? 'disabled' : ''}>Next →</button><span class="page-info">Page ${currentPage} of ${pages}</span>`;
  element.innerHTML = html;
}

function goPage(page) {
  currentPage = page;
  renderCards();
  window.scrollTo({ top: 120, behavior: 'smooth' });
}

function applyTableFilter() {
  const query = (document.getElementById('t-search').value || '').toLowerCase();
  const type = document.getElementById('t-type').value;
  const state = document.getElementById('t-status').value;
  const geography = document.getElementById('t-geo').value;
  tableFiltered = DATA.filter(record => {
    if (query && !`${record.name} ${record.summary} ${record.historical_context}`.toLowerCase().includes(query)) return false;
    if (type && record.opportunity_type !== type) return false;
    if (state && effectiveTrustState(record) !== state) return false;
    return !(geography && !(record.geography || '').includes(geography));
  });
  if (tableSortCol) tableFiltered.sort((a, b) => tableValue(a, tableSortCol).localeCompare(tableValue(b, tableSortCol)) * tableSortDir);
  renderTable();
  document.getElementById('t-count').textContent = `${tableFiltered.length} of ${DATA.length}`;
  document.getElementById('tc-table').textContent = tableFiltered.length;
}

function tableValue(record, column) {
  if (column === 'current_deadline') return record.current_cycle?.closes_on || record.typical_cycle_months?.[0] || '';
  if (column === 'trust_state') return effectiveTrustState(record);
  return String(record[column] ?? '');
}

function sortTableCol(column) {
  if (tableSortCol === column) tableSortDir *= -1;
  else { tableSortCol = column; tableSortDir = 1; }
  document.querySelectorAll('.sort-arrow').forEach(arrow => { arrow.textContent = '↕'; });
  const arrow = document.getElementById(`sa-${column}`);
  if (arrow) arrow.textContent = tableSortDir === 1 ? '↑' : '↓';
  document.querySelectorAll('.sort-button').forEach(button => button.closest('th')?.setAttribute('aria-sort', 'none'));
  arrow?.closest('th')?.setAttribute('aria-sort', tableSortDir === 1 ? 'ascending' : 'descending');
  applyTableFilter();
}

function renderTable() {
  document.getElementById('table-body').innerHTML = tableFiltered.map(record => {
    const index = DATA.indexOf(record);
    const trust = TRUST[effectiveTrustState(record)] || TRUST.needs_verification;
    return `<tr role="button" tabindex="0" aria-label="View details for ${esc(record.name)}" onclick="openModal(${index})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openModal(${index})}"><td class="td-name">${esc(record.name)}</td><td class="td-amount">${esc(record.grant_amount || '—')}</td><td><span style="font-size:12px;font-weight:700;color:${TYPE_COLORS[record.opportunity_type] || '#897D73'}">${esc(record.opportunity_type)}</span></td><td style="font-size:12px">${esc(trust.label)}</td><td>${esc(cycleLabel(record) || '—')}</td><td style="font-size:12px;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc((record.geography || '—').split(',')[0].trim())}</td><td>${record.is_recurring ? '<span style="color:#8A6A12;font-weight:700">Yes</span>' : '—'}</td><td style="font-weight:600">${esc(record.last_observed_year || '—')}</td></tr>`;
  }).join('');
}

function buildDashboard() {
  const typeCounts = countBy(DATA, record => record.opportunity_type || 'Grant');
  const types = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const total = types.reduce((sum, [, count]) => sum + count, 0);
  const colors = ['#D96F55', '#765F7E', '#C99A21', '#438F88', '#34766F', '#8F5E4D', '#9A536A'];
  let angle = -90;
  let paths = '';
  let legend = '';
  types.forEach(([name, count], index) => {
    const percent = count / total;
    const start = angle * Math.PI / 180;
    const end = (angle + percent * 360) * Math.PI / 180;
    const radius = 55;
    const x1 = 70 + radius * Math.cos(start); const y1 = 70 + radius * Math.sin(start);
    const x2 = 70 + radius * Math.cos(end); const y2 = 70 + radius * Math.sin(end);
    paths += `<path d="M70,70 L${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${percent > .5 ? 1 : 0},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${colors[index % colors.length]}" opacity=".9" style="cursor:pointer" onclick="filterByType('${esc(name)}')"><title>${esc(name)}: ${count}</title></path>`;
    legend += `<button type="button" class="donut-item" onclick="filterByType('${esc(name)}')"><span class="donut-swatch" style="background:${colors[index % colors.length]}"></span><span class="donut-name">${esc(name)}</span><span class="donut-count">${count}</span></button>`;
    angle += percent * 360;
  });
  paths += `<circle cx="70" cy="70" r="32" fill="#FFFAF5"/><text x="70" y="66" text-anchor="middle" font-size="20" font-family="Georgia, serif" fill="#231F20">${total}</text><text x="70" y="80" text-anchor="middle" font-size="10" fill="#897D73">RECORDS</text>`;
  document.getElementById('donut-svg').innerHTML = paths;
  document.getElementById('donut-legend').innerHTML = legend;
  renderBars('sector-bars', countByParts(DATA, 'sector'), '#D96F55', 10);
  renderBars('geo-bars', countByParts(DATA, 'geography', new Set(['Not Specified'])), '#438F88', 8);

  const monthCounts = Object.fromEntries(MONTHS.map(month => [month, 0]));
  DATA.forEach(record => (record.typical_cycle_months || []).forEach(month => { if (monthCounts[month] !== undefined) monthCounts[month] += 1; }));
  const max = Math.max(...Object.values(monthCounts), 1);
  document.getElementById('heatmap-grid').innerHTML = MONTHS.map(month => {
    const count = monthCounts[month]; const intensity = count / max;
    const background = count ? `rgba(217,111,85,${(.15 + intensity * .85).toFixed(2)})` : '#EFE5D9';
    const text = intensity > .5 ? '#FFFAF5' : '#8F3E2D';
    return `<button type="button" class="hm-cell" style="background:${background}" onclick="jumpCal('${month}')"><span class="hm-month" style="color:${text}">${month}</span><span class="hm-count" style="color:${text}">${count}</span><span class="hm-label" style="color:${text}">patterns</span></button>`;
  }).join('');

  const verified = DATA.filter(record => CURRENT_STATES.has(effectiveTrustState(record))).sort((a, b) => deadlineOrder(a) - deadlineOrder(b));
  document.getElementById('verified-list').innerHTML = verified.map(record => `<div class="verified-item" role="button" tabindex="0" onclick="openModal(${DATA.indexOf(record)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openModal(${DATA.indexOf(record)})}"><span class="vi-check" aria-hidden="true">✓</span><div class="vi-info"><div class="vi-name">${esc(record.name)}</div><div class="vi-meta">${esc(cycleLabel(record))} · checked ${formatDate(record.current_cycle.verified_at)}</div></div><a href="${esc(record.official_url)}" target="_blank" rel="noopener noreferrer" class="vi-link" onclick="event.stopPropagation()" aria-label="Open official website for ${esc(record.name)}">↗</a></div>`).join('') || '<p>No current opportunities are verified yet.</p>';
}

function countBy(records, keyFn) {
  return records.reduce((counts, record) => { const key = keyFn(record); counts[key] = (counts[key] || 0) + 1; return counts; }, {});
}

function countByParts(records, field, ignored = new Set()) {
  const counts = {};
  records.forEach(record => String(record[field] || '').split(',').map(value => value.trim()).filter(value => value && !ignored.has(value)).forEach(value => { counts[value] = (counts[value] || 0) + 1; }));
  return counts;
}

function renderBars(id, counts, color, limit) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
  const max = entries[0]?.[1] || 1;
  document.getElementById(id).innerHTML = entries.map(([name, count]) => `<div class="sector-bar"><div class="sector-bar-label"><span>${esc(name)}</span><span>${count}</span></div><div class="sector-track"><div class="sector-fill" style="width:${(count / max * 100).toFixed(1)}%;background:${color}"></div></div></div>`).join('');
}

function filterByType(type) {
  typeSel = type;
  document.querySelectorAll('.type-pill').forEach(button => button.classList.toggle('on', button.dataset.val === type));
  syncPressedStates(); gotoTab('browse'); applyFilters();
}

function jumpCal(month) {
  gotoTab('calendar');
  setTimeout(() => document.getElementById(`cm-${month}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
}

function buildCalendar() {
  const byMonth = Object.fromEntries(MONTHS.map(month => [month, []]));
  DATA.forEach(record => (record.typical_cycle_months || []).forEach(month => { if (byMonth[month]) byMonth[month].push(record); }));
  document.getElementById('cal-grid').innerHTML = MONTHS.map((month, index) => {
    const items = byMonth[month].sort((a, b) => (b.last_observed_year || 0) - (a.last_observed_year || 0));
    const visible = items.slice(0, 8);
    return `<div class="cal-month-card" id="cm-${month}"><div class="cal-month-head"><span class="cal-month-name">${MONTH_FULL[index]}</span><span class="cal-month-badge">${items.length}</span></div><div class="cal-month-body">${visible.length ? visible.map(record => `<button type="button" class="cal-item" onclick="openModal(${DATA.indexOf(record)})"><span class="cal-item-dot" style="background:${TYPE_COLORS[record.opportunity_type] || '#D96F55'}"></span><span class="cal-item-info"><span class="cal-item-name">${esc(record.name.length > 42 ? `${record.name.slice(0, 40)}…` : record.name)}</span><span class="cal-item-meta">${esc(TRUST[effectiveTrustState(record)]?.label || 'Needs verification')}</span></span></button>`).join('') : '<div class="cal-empty">None tracked</div>'}${items.length > 8 ? `<button type="button" class="cal-show-more" onclick="jumpToCalFilter('${month}')">+${items.length - 8} more programs →</button>` : ''}</div></div>`;
  }).join('');
}

function jumpToCalFilter(month) {
  document.getElementById('f-month').value = month;
  gotoTab('browse'); applyFilters();
  if (!advOpen) toggleAdvanced();
}

function openModal(index) {
  const record = DATA[index];
  if (!record) return;
  lastFocusedElement = document.activeElement;
  const trust = TRUST[effectiveTrustState(record)] || TRUST.needs_verification;
  const color = TYPE_COLORS[record.opportunity_type] || '#D96F55';
  document.getElementById('modal-type-bar').innerHTML = `<span style="color:${color};display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color}"></span>${esc(record.opportunity_type)}</span>`;
  document.getElementById('modal-name').textContent = record.name;
  document.getElementById('modal-status-row').innerHTML = `<span class="trust-pill trust-${trust.tone}">${esc(trust.label)}</span>${record.current_cycle ? '<span class="trust-pill trust-checked">Official source checked</span>' : ''}${record.is_recurring ? '<span class="trust-pill trust-pattern">Recurring pattern</span>' : ''}`;
  const amount = document.getElementById('modal-amount');
  amount.textContent = record.grant_amount || 'Amount not specified';
  amount.className = `modal-amount${record.grant_amount ? '' : ' empty'}`;
  const currentDeadline = record.current_cycle?.closes_on ? formatDate(record.current_cycle.closes_on) : 'Not currently verified';
  const verified = record.current_cycle?.verified_at ? formatDate(record.current_cycle.verified_at) : 'Not yet verified';
  document.getElementById('modal-meta-grid').innerHTML = [
    ['Geography', record.geography || 'Not specified'],
    ['Cycle deadline', currentDeadline],
    ['Typical cycle', (record.typical_cycle_months || []).join(' / ') || 'Not specified'],
    ['Eligibility', record.eligibility_type || 'Not specified'],
    ['Sector', (record.sector || 'General').split(',')[0].trim()],
    ['Tech focus', (record.tech_focus || 'General Tech').split(',')[0].trim()],
    ['Last observed', record.last_observed_year || 'Unknown'],
    ['Last verified', verified],
  ].map(([label, value]) => `<div class="meta-chip"><div class="mc-label">${label}</div><div class="mc-val">${esc(value)}</div></div>`).join('');
  document.getElementById('modal-desc').textContent = record.summary || 'No summary available.';
  document.getElementById('modal-history').textContent = record.historical_context || 'No historical context available.';
  const notes = document.getElementById('modal-notes-wrap');
  notes.style.display = record.research_notes ? '' : 'none';
  if (record.research_notes) document.getElementById('modal-notes').textContent = record.research_notes;
  const official = document.getElementById('modal-cta');
  official.style.display = record.official_url ? '' : 'none';
  if (record.official_url) official.href = record.official_url;
  const title = encodeURIComponent(`[CORRECTION] ${record.id} — ${record.name}`);
  document.getElementById('modal-correct').href = `https://github.com/akshayedzola/ngotechgrants/issues/new?template=correct-grant.yml&title=${title}`;
  document.getElementById('modal-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.querySelector('.modal-close').focus();
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  document.body.style.overflow = '';
  if (lastFocusedElement && document.contains(lastFocusedElement)) lastFocusedElement.focus();
}

function closeModalIfBg(event) { if (event.target === document.getElementById('modal-backdrop')) closeModal(); }

document.addEventListener('keydown', event => {
  const backdrop = document.getElementById('modal-backdrop');
  if (event.key === 'Escape' && backdrop.classList.contains('open')) closeModal();
  if (event.key !== 'Tab' || !backdrop.classList.contains('open')) return;
  const focusable = [...document.getElementById('modal-box').querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(element => !element.hidden && element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0]; const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

function exportCSV() {
  const fields = ['name', 'grant_amount', 'opportunity_type', 'trust_state', 'geography', 'is_recurring', 'sector', 'tech_focus', 'last_observed_year', 'official_url'];
  const headers = ['Name', 'Amount', 'Type', 'Trust State', 'Geography', 'Recurring', 'Sector', 'Tech Focus', 'Last Observed', 'Official URL'];
  const csv = [headers.join(','), ...filtered.map(record => fields.map(field => {
    const value = field === 'trust_state' ? effectiveTrustState(record) : record[field];
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }).join(','))].join('\n');
  const anchor = document.createElement('a');
  anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  anchor.download = 'EdZola_Funding_Export.csv';
  anchor.click();
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

Object.assign(window, { gotoTab, debouncedFilter, applyFilters, resetAll, showFullArchive, showRecurringPatterns, toggleAdvanced, setType, applyProfile, goPage, applyTableFilter, sortTableCol, filterByType, jumpCal, jumpToCalFilter, openModal, closeModal, closeModalIfBg, exportCSV });
