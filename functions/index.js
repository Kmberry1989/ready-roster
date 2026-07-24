import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/https';
import { onSchedule } from 'firebase-functions/scheduler';

initializeApp();
const db = getFirestore();
const dataRoot = (appId) => `artifacts/${appId || 'org-onboarding'}/public/data`;
const collection = (appId, name) => db.collection(`${dataRoot(appId)}/${name}`);

async function requireUser(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  return request.auth;
}

async function requireAdmin(request, appId) {
  const auth = await requireUser(request);
  const profile = await collection(appId, 'users').doc(auth.uid).get();
  if (!profile.exists || profile.data().role !== 'admin' || !profile.data().orgId) {
    throw new HttpsError('permission-denied', 'Organization administrator access is required.');
  }
  return { auth, profile: { id: profile.id, ...profile.data() } };
}

const notification = (appId, { orgId, recipientUid, title, body, kind, sourceId }) => collection(appId, 'notifications').add({
  orgId, recipientUid, title, body, kind, sourceId: sourceId || null, readAt: null, createdAt: new Date().toISOString()
});

export const createEmployeeInvitation = onCall(async (request) => {
  const appId = request.data.appId;
  const email = String(request.data.email || '').trim().toLowerCase();
  const { profile } = await requireAdmin(request, appId);
  if (!email.includes('@')) throw new HttpsError('invalid-argument', 'A valid employee email is required.');
  const existing = await collection(appId, 'employeeInvitations').where('orgId', '==', profile.orgId).where('email', '==', email).where('status', '==', 'pending').limit(1).get();
  if (!existing.empty) return { invitationId: existing.docs[0].id, existing: true };
  const invitation = await collection(appId, 'employeeInvitations').add({
    orgId: profile.orgId, email, role: 'employee', status: 'pending', invitedByUid: request.auth.uid, createdAt: new Date().toISOString()
  });
  return { invitationId: invitation.id, existing: false };
});

export const acceptEmployeeInvitation = onCall(async (request) => {
  const appId = request.data.appId;
  const auth = await requireUser(request);
  const email = String(auth.token.email || '').toLowerCase();
  if (!email) throw new HttpsError('failed-precondition', 'Your account needs a verified email to accept an invitation.');
  const invitations = await collection(appId, 'employeeInvitations').where('email', '==', email).where('status', '==', 'pending').limit(1).get();
  if (invitations.empty) throw new HttpsError('not-found', 'No pending invitation was found for this account.');
  const invitation = invitations.docs[0];
  const data = invitation.data();
  await db.runTransaction(async (transaction) => {
    transaction.set(collection(appId, 'users').doc(auth.uid), { role: 'employee', orgId: data.orgId, email, joinedAt: new Date().toISOString() }, { merge: true });
    transaction.update(invitation.ref, { status: 'accepted', acceptedByUid: auth.uid, acceptedAt: new Date().toISOString() });
  });
  const org = await collection(appId, 'organizations').doc(data.orgId).get();
  await notification(appId, { orgId: data.orgId, recipientUid: auth.uid, title: 'Welcome to ReadyRoster', body: `Your access to ${org.data()?.name || 'the organization'} is ready.`, kind: 'invitation', sourceId: invitation.id });
  if (org.data()?.adminUid) await notification(appId, { orgId: data.orgId, recipientUid: org.data().adminUid, title: 'Employee joined', body: `${email} accepted their invitation.`, kind: 'invitation', sourceId: invitation.id });
  return { orgId: data.orgId };
});

export const assignTraining = onCall(async (request) => {
  const appId = request.data.appId;
  const { profile } = await requireAdmin(request, appId);
  const { employeeUid, templateId } = request.data;
  const [employee, template] = await Promise.all([collection(appId, 'users').doc(employeeUid).get(), collection(appId, 'trainingTemplates').doc(templateId).get()]);
  if (!employee.exists || employee.data().orgId !== profile.orgId || employee.data().role !== 'employee') throw new HttpsError('not-found', 'Employee was not found in this organization.');
  if (!template.exists || template.data().orgId !== profile.orgId) throw new HttpsError('not-found', 'Training template was not found.');
  let dueAt = String(request.data.dueAt || '');
  let dueSchedule = { type: 'specific_date' };
  if (!dueAt) {
    const offsetDays = Number(request.data.dueOffsetDays);
    const startDate = employee.data().startDate || employee.data().joinedAt;
    if (!Number.isInteger(offsetDays) || offsetDays < 0 || !startDate) {
      throw new HttpsError('invalid-argument', 'Set a due date or a valid offset from the employee start date.');
    }
    const start = new Date(startDate);
    start.setUTCDate(start.getUTCDate() + offsetDays);
    dueAt = start.toISOString().slice(0, 10);
    dueSchedule = { type: 'start_date_offset', offsetDays, startDate: String(startDate).slice(0, 10) };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) throw new HttpsError('invalid-argument', 'A valid training due date is required.');
  const templateSnapshot = template.data();
  const assignment = await collection(appId, 'trainingAssignments').add({
    appId, orgId: profile.orgId, employeeUid, templateId, templateVersion: templateSnapshot.version || 1,
    templateSnapshot: { title: templateSnapshot.title, lessons: templateSnapshot.lessons || [], questions: templateSnapshot.questions || [] },
    dueAt, dueSchedule, status: 'assigned', attempts: 0, attemptLimit: templateSnapshot.attemptLimit || 3,
    passThreshold: templateSnapshot.defaultPassThreshold || 80, assignedByUid: request.auth.uid, assignedAt: new Date().toISOString()
  });
  await notification(appId, { orgId: profile.orgId, recipientUid: employeeUid, title: 'Training assigned', body: `${templateSnapshot.title} is due ${dueAt}.`, kind: 'training_assigned', sourceId: assignment.id });
  return { assignmentId: assignment.id };
});

export const submitTrainingQuiz = onCall(async (request) => {
  const appId = request.data.appId;
  const auth = await requireUser(request);
  const assignment = await collection(appId, 'trainingAssignments').doc(request.data.assignmentId).get();
  if (!assignment.exists || assignment.data().employeeUid !== auth.uid) throw new HttpsError('permission-denied', 'This training assignment is not available to you.');
  const data = assignment.data();
  if (data.status === 'passed') throw new HttpsError('failed-precondition', 'This module is already complete.');
  if ((data.attempts || 0) >= (data.attemptLimit || 3)) throw new HttpsError('failed-precondition', 'No quiz attempts remain.');
  const questions = data.templateSnapshot?.questions || [];
  const answers = request.data.answers || {};
  if (!questions.length || Object.keys(answers).length !== questions.length) throw new HttpsError('invalid-argument', 'Answer every quiz question.');
  const correct = questions.reduce((count, question, index) => count + (Number(answers[index]) === question.correctAnswer ? 1 : 0), 0);
  const score = Math.round((correct / questions.length) * 100);
  const passed = score >= (data.passThreshold || 80);
  const attempt = (data.attempts || 0) + 1;
  await db.runTransaction(async (transaction) => {
    transaction.update(assignment.ref, { attempts: attempt, score, status: passed ? 'passed' : 'failed', completedAt: passed ? new Date().toISOString() : null, lastAttemptAt: new Date().toISOString() });
    transaction.create(collection(appId, 'quizAttempts').doc(), { appId, orgId: data.orgId, assignmentId: assignment.id, employeeUid: auth.uid, attempt, score, passed, submittedAt: new Date().toISOString() });
  });
  await notification(appId, { orgId: data.orgId, recipientUid: auth.uid, title: passed ? 'Training complete' : 'Quiz needs another attempt', body: `${data.templateSnapshot.title}: ${score}%${passed ? ' — passed.' : ` — pass at ${data.passThreshold}%.`}`, kind: 'quiz_result', sourceId: assignment.id });
  const org = await collection(appId, 'organizations').doc(data.orgId).get();
  if (org.data()?.adminUid && passed) await notification(appId, { orgId: data.orgId, recipientUid: org.data().adminUid, title: 'Training completed', body: `${auth.token.email || 'An employee'} completed ${data.templateSnapshot.title} with ${score}%.`, kind: 'training_complete', sourceId: assignment.id });
  return { score, passed, attemptsRemaining: Math.max(0, (data.attemptLimit || 3) - attempt) };
});

export const clockAction = onCall(async (request) => {
  const appId = request.data.appId;
  const auth = await requireUser(request);
  const profile = await collection(appId, 'users').doc(auth.uid).get();
  if (!profile.exists || profile.data().role !== 'employee' || !profile.data().orgId) throw new HttpsError('permission-denied', 'Employee access is required.');
  const entries = await collection(appId, 'timeEntries').where('employeeUid', '==', auth.uid).limit(20).get();
  const open = entries.docs.map(item => ({ id: item.id, ...item.data(), ref: item.ref })).find(item => item.status === 'open' || item.breakStartedAt);
  const now = new Date().toISOString();
  const action = request.data.action;
  if (action === 'clockIn') {
    if (open) throw new HttpsError('failed-precondition', 'You already have an open time entry.');
    const entry = await collection(appId, 'timeEntries').add({ appId, orgId: profile.data().orgId, employeeUid: auth.uid, status: 'open', clockInAt: now, audit: [{ action, at: now, byUid: auth.uid }] });
    return { timeEntryId: entry.id, status: 'open' };
  }
  if (!open) throw new HttpsError('failed-precondition', 'No open time entry was found.');
  if (action === 'startBreak') {
    if (open.breakStartedAt) throw new HttpsError('failed-precondition', 'A break is already active.');
    await open.ref.update({ breakStartedAt: now, audit: FieldValue.arrayUnion({ action, at: now, byUid: auth.uid }) });
    return { timeEntryId: open.id, status: 'break' };
  }
  if (action === 'endBreak') {
    if (!open.breakStartedAt) throw new HttpsError('failed-precondition', 'No active break was found.');
    await open.ref.update({ breakStartedAt: null, breakEndedAt: now, audit: FieldValue.arrayUnion({ action, at: now, byUid: auth.uid }) });
    return { timeEntryId: open.id, status: 'open' };
  }
  if (action === 'clockOut') {
    await open.ref.update({ clockOutAt: now, status: 'submitted', audit: FieldValue.arrayUnion({ action, at: now, byUid: auth.uid }) });
    const org = await collection(appId, 'organizations').doc(profile.data().orgId).get();
    if (org.data()?.adminUid) await notification(appId, { orgId: profile.data().orgId, recipientUid: org.data().adminUid, title: 'Time entry submitted', body: `${auth.token.email || 'An employee'} submitted a time entry for review.`, kind: 'time_entry', sourceId: open.id });
    return { timeEntryId: open.id, status: 'submitted' };
  }
  throw new HttpsError('invalid-argument', 'Unsupported time-clock action.');
});

export const reviewTimeEntry = onCall(async (request) => {
  const appId = request.data.appId;
  const { profile } = await requireAdmin(request, appId);
  const entry = await collection(appId, 'timeEntries').doc(request.data.timeEntryId).get();
  if (!entry.exists || entry.data().orgId !== profile.orgId) throw new HttpsError('not-found', 'Time entry was not found.');
  const status = request.data.status === 'approved' ? 'approved' : 'needs_correction';
  const at = new Date().toISOString();
  await entry.ref.update({ status, reviewedAt: at, reviewedByUid: request.auth.uid, audit: FieldValue.arrayUnion({ action: status, at, byUid: request.auth.uid }) });
  await notification(appId, { orgId: profile.orgId, recipientUid: entry.data().employeeUid, title: status === 'approved' ? 'Time entry approved' : 'Time entry needs correction', body: status === 'approved' ? 'Your submitted time entry was approved.' : 'Please review your time entry and contact your administrator.', kind: 'time_entry', sourceId: entry.id });
  return { status };
});

export const reviewLeaveRequest = onCall(async (request) => {
  const appId = request.data.appId;
  const { profile } = await requireAdmin(request, appId);
  const leaveRequest = await collection(appId, 'leaveRequests').doc(request.data.leaveRequestId).get();
  if (!leaveRequest.exists || leaveRequest.data().orgId !== profile.orgId) {
    throw new HttpsError('not-found', 'Personal-day request was not found.');
  }
  const status = request.data.status === 'approved' ? 'approved' : 'declined';
  const managerNote = String(request.data.managerNote || '').slice(0, 1000);
  const reviewedAt = new Date().toISOString();
  await leaveRequest.ref.update({ status, managerNote, reviewedAt, reviewedByUid: request.auth.uid });
  await notification(appId, {
    orgId: profile.orgId,
    recipientUid: leaveRequest.data().employeeUid,
    title: status === 'approved' ? 'Personal day approved' : 'Personal day declined',
    body: managerNote || `Your request for ${leaveRequest.data().startDate}–${leaveRequest.data().endDate} was ${status}.`,
    kind: 'leave_request',
    sourceId: leaveRequest.id,
  });
  return { status };
});

const localDate = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};

const localHour = (date, timeZone) => Number(new Intl.DateTimeFormat('en-US', {
  timeZone, hour: '2-digit', hourCycle: 'h23'
}).format(date));

export const sendTrainingReminders = onSchedule('every 60 minutes', async () => {
  const now = new Date();
  const organizations = new Map();
  const assignments = await db.collectionGroup('trainingAssignments').where('status', 'in', ['assigned', 'failed']).get();
  await Promise.all(assignments.docs.map(async (assignment) => {
    const data = assignment.data();
    if (!data.dueAt) return;
    if (!organizations.has(data.orgId)) organizations.set(data.orgId, collection(data.appId || 'org-onboarding', 'organizations').doc(data.orgId).get());
    const org = await organizations.get(data.orgId);
    const orgData = org.data() || {};
    const timeZone = orgData.timezone || 'America/New_York';
    if (localHour(now, timeZone) !== 9) return;
    const today = localDate(now, timeZone);
    const days = Math.round((Date.parse(`${data.dueAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    const warningDays = [...new Set([Number(orgData.dueSoonDays) || 7, ...(orgData.reminderDays || [3, 1]).map(Number)])];
    const warning = warningDays.includes(days);
    const overdue = days < 0;
    if (!warning && !overdue) return;
    const id = `due-${assignment.id}-${today}`;
    const target = collection(data.appId || 'org-onboarding', 'notifications').doc(id);
    if ((await target.get()).exists) return;
    await target.set({ orgId: data.orgId, recipientUid: data.employeeUid, title: overdue ? 'Training overdue' : 'Training due soon', body: `${data.templateSnapshot.title} is ${overdue ? 'overdue' : `due in ${days} day${days === 1 ? '' : 's'}`}.`, kind: 'training_due', sourceId: assignment.id, readAt: null, createdAt: new Date().toISOString() });
  }));
});
