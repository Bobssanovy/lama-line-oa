/**
 * LAMA Google Apps Script backend — Revision 3.8
 * Rename this file to Code.gs when pasting into script.google.com.
 * Required Script Properties:
 *   LINE_LOGIN_CHANNEL_ID, LIFF_ID
 * Optional: SPREADSHEET_ID, DEFAULT_TENANT_CODE, APP_NAME
 */

const LAMA = Object.freeze({
  sheets: {
    TENANTS: ['id', 'code', 'inviteCode', 'name', 'active', 'createdAt'],
    USERS: ['id', 'tenantId', 'lineUserId', 'displayName', 'firstName', 'lastName', 'employeeCode', 'department', 'division', 'position', 'email', 'role', 'active', 'createdAt'],
    LEAVE_TYPES: ['id', 'tenantId', 'code', 'name', 'quota', 'icon', 'active', 'sortOrder'],
    LEAVES: ['id', 'tenantId', 'employeeId', 'typeCode', 'duration', 'startDate', 'endDate', 'days', 'reason', 'status', 'approverId', 'approverNote', 'createdAt', 'decidedAt'],
    ATTENDANCE: ['id', 'tenantId', 'employeeId', 'kind', 'occurredAt', 'source'],
    SUBSCRIPTIONS: ['id', 'tenantId', 'plan', 'startsOn', 'endsOn', 'status', 'billingEmail', 'reminded30At'],
    AUDIT: ['id', 'tenantId', 'actorId', 'action', 'entityType', 'entityId', 'details', 'createdAt']
  },
  roles: { EMPLOYEE: 1, MANAGER: 2, HR: 3, OWNER: 4, SUPER_ADMIN: 5 },
  leaveTypes: [
    ['SICK', 'ลาป่วย', 30, '🤒'], ['VACATION', 'ลาพักผ่อน', 10, '🏖️'],
    ['PERSONAL', 'ลากิจ', 5, '💼'], ['OFFSITE', 'ลาไปปฏิบัติงาน', null, '📍'],
    ['MATERNITY', 'ลาคลอดบุตร', 98, '👶'], ['PATERNITY', 'ลาไปช่วยภริยาคลอดบุตร', 15, '🍼'],
    ['ORDINATION', 'ลาอุปสมบท', 15, '🙏'], ['MILITARY', 'ลาเข้ารับการตรวจเลือกทหาร', 60, '🪖'],
    ['STERILIZATION', 'ลาทำหมัน', null, '🏥'], ['TRAINING', 'ลาฝึกอบรม', null, '🎓'],
    ['OTHER', 'ลาอื่น ๆ', null, '📝']
  ]
});

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  template.liffId = prop_('LIFF_ID');
  template.initialView = String((e && e.parameter && e.parameter.view) || 'main');
  template.appName = prop_('APP_NAME') || 'ลามะ • LAMA';
  return template.evaluate()
    .setTitle(template.appName)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

/** Run once as the script owner before deployment. */
function setupLama() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SPREADSHEET_ID');
  let ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = SpreadsheetApp.create('LAMA Database');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  Object.keys(LAMA.sheets).forEach(name => ensureSheet_(ss, name, LAMA.sheets[name]));
  const tenantCode = props.getProperty('DEFAULT_TENANT_CODE') || 'lama-demo';
  let tenant = findOne_('TENANTS', r => r.code === tenantCode);
  if (!tenant) {
    tenant = { id: uuid_(), code: tenantCode, inviteCode: inviteCode_(), name: 'องค์กรทดลอง LAMA', active: true, createdAt: now_() };
    append_('TENANTS', tenant);
  } else if (!tenant.inviteCode) {
    const found = findRow_('TENANTS', r => r.id === tenant.id);
    tenant.inviteCode = inviteCode_();
    updateRow_('TENANTS', found.row, { inviteCode: tenant.inviteCode });
  }
  if (!rows_('LEAVE_TYPES').some(r => r.tenantId === tenant.id)) {
    LAMA.leaveTypes.forEach((x, i) => append_('LEAVE_TYPES', {
      id: uuid_(), tenantId: tenant.id, code: x[0], name: x[1], quota: x[2], icon: x[3], active: true, sortOrder: i + 1
    }));
  }
  if (!rows_('SUBSCRIPTIONS').some(r => r.tenantId === tenant.id)) {
    const today = new Date();
    const end = new Date(today); end.setFullYear(end.getFullYear() + 1);
    append_('SUBSCRIPTIONS', {
      id: uuid_(), tenantId: tenant.id, plan: 'TRIAL', startsOn: isoDate_(today), endsOn: isoDate_(end),
      status: 'ACTIVE', billingEmail: Session.getEffectiveUser().getEmail(), reminded30At: ''
    });
  }
  installDailyReminderTrigger_();
  return { ok: true, spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl(), tenantCode, inviteCode: tenant.inviteCode };
}

function getBootstrap(idToken, requestedView) {
  const identity = verifyLine_(idToken);
  const user = findOne_('USERS', r => r.lineUserId === identity.sub && bool_(r.active));
  if (!user) return { registered: false, profile: { displayName: identity.name || '' }, requestedView: safeView_(requestedView), leaveTypes: [] };
  return { registered: true, requestedView: safeView_(requestedView), data: appData_(user) };
}

function registerEmployee(idToken, input) {
  return locked_(() => {
    const identity = verifyLine_(idToken);
    const existing = findOne_('USERS', r => r.lineUserId === identity.sub);
    if (existing) return { registered: true, data: appData_(existing) };
    const required = ['firstName', 'lastName', 'employeeCode', 'department'];
    required.forEach(k => { if (!clean_(input && input[k], 120)) throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบ'); });
    const tenantCode = clean_(input.tenantCode || prop_('DEFAULT_TENANT_CODE') || 'lama-demo', 64);
    const inviteCode = clean_(input.inviteCode, 64);
    const tenant = findOne_('TENANTS', r => r.code === tenantCode && r.inviteCode === inviteCode && bool_(r.active));
    if (!tenant) throw new Error('รหัสองค์กรหรือรหัสเชิญไม่ถูกต้อง หรือองค์กรถูกระงับ');
    if (findOne_('USERS', r => r.tenantId === tenant.id && String(r.employeeCode).toLowerCase() === clean_(input.employeeCode, 40).toLowerCase())) throw new Error('รหัสพนักงานนี้ลงทะเบียนแล้ว');
    const user = {
      id: uuid_(), tenantId: tenant.id, lineUserId: identity.sub, displayName: identity.name || '',
      firstName: clean_(input.firstName, 80), lastName: clean_(input.lastName, 80),
      employeeCode: clean_(input.employeeCode, 40), department: clean_(input.department, 100),
      division: clean_(input.division, 100), position: clean_(input.position, 100), email: clean_(input.email, 160),
      role: 'EMPLOYEE', active: true, createdAt: now_()
    };
    append_('USERS', user); audit_(user, 'USER_REGISTERED', 'USER', user.id, { employeeCode: user.employeeCode });
    return { registered: true, data: appData_(user) };
  });
}

function refreshData(idToken) { return appData_(currentUser_(idToken)); }

function createLeave(idToken, input) {
  return locked_(() => {
    const user = currentUser_(idToken);
    const type = findOne_('LEAVE_TYPES', r => r.tenantId === user.tenantId && r.code === clean_(input.typeCode, 30) && bool_(r.active));
    if (!type) throw new Error('ไม่พบประเภทการลา');
    const start = parseDate_(input.startDate), end = parseDate_(input.endDate);
    if (end < start) throw new Error('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม');
    const duration = input.duration === 'HALF' ? 'HALF' : 'FULL';
    if (duration === 'HALF' && isoDate_(start) !== isoDate_(end)) throw new Error('ครึ่งวันเลือกได้เพียงวันเดียว');
    const days = duration === 'HALF' ? 0.5 : inclusiveDays_(start, end);
    const leave = {
      id: uuid_(), tenantId: user.tenantId, employeeId: user.id, typeCode: type.code, duration,
      startDate: isoDate_(start), endDate: isoDate_(end), days, reason: clean_(input.reason, 500),
      status: 'PENDING', approverId: '', approverNote: '', createdAt: now_(), decidedAt: ''
    };
    if (!leave.reason) throw new Error('กรุณาระบุเหตุผล');
    append_('LEAVES', leave); audit_(user, 'LEAVE_CREATED', 'LEAVE', leave.id, { typeCode: leave.typeCode, days });
    return { leave, data: appData_(user) };
  });
}

function decideLeave(idToken, leaveId, decision, note) {
  return locked_(() => {
    const actor = currentUser_(idToken); requireRole_(actor, 'MANAGER');
    const status = decision === 'APPROVED' ? 'APPROVED' : decision === 'REJECTED' ? 'REJECTED' : null;
    if (!status) throw new Error('ผลการอนุมัติไม่ถูกต้อง');
    const row = findRow_('LEAVES', r => r.id === leaveId && r.tenantId === actor.tenantId);
    if (!row) throw new Error('ไม่พบคำขอลา');
    if (row.data.employeeId === actor.id) throw new Error('ไม่สามารถอนุมัติคำขอของตนเอง');
    if (row.data.status !== 'PENDING') throw new Error('คำขอนี้ดำเนินการแล้ว');
    updateRow_('LEAVES', row.row, { status, approverId: actor.id, approverNote: clean_(note, 300), decidedAt: now_() });
    audit_(actor, `LEAVE_${status}`, 'LEAVE', leaveId, { note: clean_(note, 300) });
    return appData_(actor);
  });
}

function clockAttendance(idToken, kind) {
  return locked_(() => {
    const user = currentUser_(idToken), normalized = kind === 'OUT' ? 'OUT' : 'IN';
    append_('ATTENDANCE', { id: uuid_(), tenantId: user.tenantId, employeeId: user.id, kind: normalized, occurredAt: now_(), source: 'LIFF' });
    audit_(user, `ATTENDANCE_${normalized}`, 'ATTENDANCE', '', {});
    return appData_(user);
  });
}

function sendExpiryReminders() {
  const today = new Date();
  rows_('SUBSCRIPTIONS').forEach(s => {
    if (s.status !== 'ACTIVE' || !s.billingEmail || s.reminded30At) return;
    const end = parseDate_(s.endsOn), diff = Math.round((stripTime_(end) - stripTime_(today)) / 86400000);
    if (diff !== 30) return;
    const tenant = findOne_('TENANTS', r => r.id === s.tenantId);
    MailApp.sendEmail({
      to: s.billingEmail,
      subject: `LAMA: บริการของ ${tenant ? tenant.name : 'องค์กร'} จะหมดอายุใน 30 วัน`,
      htmlBody: `<p>บริการ LAMA ของ <b>${escapeHtml_(tenant ? tenant.name : 'องค์กร')}</b> จะหมดอายุวันที่ <b>${escapeHtml_(s.endsOn)}</b></p><p>กรุณาติดต่อผู้ดูแลระบบเพื่อต่ออายุบริการ</p>`
    });
    const row = findRow_('SUBSCRIPTIONS', r => r.id === s.id);
    updateRow_('SUBSCRIPTIONS', row.row, { reminded30At: now_() });
  });
}

function appData_(user) {
  const tenant = findOne_('TENANTS', r => r.id === user.tenantId);
  const allUsers = rows_('USERS').filter(r => r.tenantId === user.tenantId && bool_(r.active));
  const allLeaves = rows_('LEAVES').filter(r => r.tenantId === user.tenantId);
  const leaveTypes = rows_('LEAVE_TYPES').filter(r => r.tenantId === user.tenantId && bool_(r.active)).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  const ownOnly = LAMA.roles[user.role] >= LAMA.roles.MANAGER ? allLeaves : allLeaves.filter(r => r.employeeId === user.id);
  const today = isoDate_(new Date());
  const todayAttendance = rows_('ATTENDANCE').filter(r => r.tenantId === user.tenantId && String(r.occurredAt).slice(0, 10) === today);
  const workingIds = [...new Set(todayAttendance.filter(r => r.kind === 'IN').map(r => r.employeeId))];
  const onLeaveIds = [...new Set(allLeaves.filter(r => r.status === 'APPROVED' && r.startDate <= today && r.endDate >= today).map(r => r.employeeId))];
  const pending = allLeaves.filter(r => r.status === 'PENDING');
  const subscription = findOne_('SUBSCRIPTIONS', r => r.tenantId === user.tenantId);
  return {
    user: publicUser_(user), tenant: tenant ? { id: tenant.id, code: tenant.code, name: tenant.name, inviteCode: LAMA.roles[user.role] >= LAMA.roles.MANAGER ? tenant.inviteCode : '' } : {}, leaveTypes,
    leaves: ownOnly.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    attendance: rows_('ATTENDANCE').filter(r => r.tenantId === user.tenantId && (LAMA.roles[user.role] >= LAMA.roles.MANAGER || r.employeeId === user.id)).slice(-100).reverse(),
    users: LAMA.roles[user.role] >= LAMA.roles.MANAGER ? allUsers.map(publicUser_) : [publicUser_(user)],
    subscription: LAMA.roles[user.role] >= LAMA.roles.HR ? subscription : null,
    metrics: {
      employees: allUsers.length, onLeaveToday: onLeaveIds.length,
      workingToday: workingIds.filter(id => !onLeaveIds.includes(id)).length,
      leaveRequests: allLeaves.length, pendingLeaves: pending.length,
      approvedLeaves: allLeaves.filter(r => r.status === 'APPROVED').length,
      notApprovedLeaves: allLeaves.filter(r => !['APPROVED', 'CANCELLED'].includes(r.status)).length
    }
  };
}

function verifyLine_(idToken) {
  if (!idToken) throw new Error('กรุณาเข้าสู่ระบบผ่าน LINE');
  const clientId = prop_('LINE_LOGIN_CHANNEL_ID');
  if (!clientId) throw new Error('ยังไม่ได้ตั้งค่า LINE_LOGIN_CHANNEL_ID');
  const response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post', payload: { id_token: idToken, client_id: clientId }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('LINE ID token ไม่ถูกต้องหรือหมดอายุ');
  const data = JSON.parse(response.getContentText());
  if (String(data.aud) !== String(clientId) || !data.sub) throw new Error('LINE Login channel ไม่ตรงกับระบบ');
  return data;
}

function currentUser_(idToken) {
  const identity = verifyLine_(idToken);
  const user = findOne_('USERS', r => r.lineUserId === identity.sub && bool_(r.active));
  if (!user) throw new Error('ยังไม่ได้ลงทะเบียนพนักงาน');
  const tenant = findOne_('TENANTS', r => r.id === user.tenantId && bool_(r.active));
  if (!tenant) throw new Error('องค์กรถูกระงับการใช้งาน');
  return user;
}

function requireRole_(user, minimum) { if ((LAMA.roles[user.role] || 0) < LAMA.roles[minimum]) throw new Error('ไม่มีสิทธิ์ดำเนินการ'); }
function publicUser_(u) { return { id: u.id, tenantId: u.tenantId, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.displayName, employeeCode: u.employeeCode, department: u.department, division: u.division, position: u.position, email: u.email, role: u.role }; }
function prop_(name) { return PropertiesService.getScriptProperties().getProperty(name) || ''; }
function db_() { const id = prop_('SPREADSHEET_ID'); if (!id) throw new Error('กรุณารัน setupLama() ก่อน'); return SpreadsheetApp.openById(id); }
function ensureSheet_(ss, name, headers) { const sh = ss.getSheetByName(name) || ss.insertSheet(name); const current = sh.getLastRow() ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headers.length)).getValues()[0] : []; headers.forEach((h, i) => { if (current[i] !== h) sh.getRange(1, i + 1).setValue(h); }); sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#17463b').setFontColor('#ffffff'); sh.setFrozenRows(1); return sh; }
function rows_(name) { const sh = db_().getSheetByName(name), h = LAMA.sheets[name], n = sh.getLastRow(); if (n < 2) return []; return sh.getRange(2, 1, n - 1, h.length).getValues().map(v => Object.fromEntries(h.map((k, i) => [k, normalizeCell_(v[i])]))); }
function append_(name, obj) { const h = LAMA.sheets[name]; db_().getSheetByName(name).appendRow(h.map(k => sheetSafe_(obj[k] == null ? '' : obj[k]))); }
function findOne_(name, fn) { return rows_(name).find(fn) || null; }
function findRow_(name, fn) { const all = rows_(name); for (let i = 0; i < all.length; i++) if (fn(all[i])) return { row: i + 2, data: all[i] }; return null; }
function updateRow_(name, row, patch) { const sh = db_().getSheetByName(name), h = LAMA.sheets[name]; Object.keys(patch).forEach(k => { const col = h.indexOf(k); if (col >= 0) sh.getRange(row, col + 1).setValue(sheetSafe_(patch[k])); }); }
function audit_(user, action, entityType, entityId, details) { append_('AUDIT', { id: uuid_(), tenantId: user.tenantId, actorId: user.id, action, entityType, entityId, details: JSON.stringify(details || {}), createdAt: now_() }); }
function locked_(fn) { const lock = LockService.getScriptLock(); lock.waitLock(20000); try { return fn(); } finally { lock.releaseLock(); } }
function installDailyReminderTrigger_() { if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'sendExpiryReminders')) ScriptApp.newTrigger('sendExpiryReminders').timeBased().everyDays(1).atHour(8).create(); }
function parseDate_(s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) throw new Error('รูปแบบวันที่ไม่ถูกต้อง'); const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); if (isoDate_(d) !== `${m[1]}-${m[2]}-${m[3]}`) throw new Error('วันที่ไม่ถูกต้อง'); return d; }
function inclusiveDays_(a, b) { return Math.round((stripTime_(b) - stripTime_(a)) / 86400000) + 1; }
function stripTime_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function isoDate_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function uuid_() { return Utilities.getUuid(); }
function inviteCode_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(); }
function clean_(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }
function sheetSafe_(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; }
function bool_(v) { return v === true || String(v).toLowerCase() === 'true' || String(v) === '1'; }
function normalizeCell_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ssXXX") : v; }
function safeView_(v) { return ['main', 'leave', 'invite', 'report', 'attendance', 'status', 'employees'].includes(String(v)) ? String(v) : 'main'; }
function escapeHtml_(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

