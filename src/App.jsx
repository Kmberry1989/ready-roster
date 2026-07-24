import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  GoogleAuthProvider, signInWithPopup 
} from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, getDoc, query, where } from 'firebase/firestore';
import { 
  ClipboardList, Users, ShieldCheck, Calendar, FileSignature, 
  CheckCircle2, AlertCircle, ArrowRight, Home, Plus, FileText, Wand2, Trash2,
  Building2, Briefcase, Lock, UserPlus, LogOut, ChevronRight, ClipboardCheck
} from 'lucide-react';
import { EmployeePortal, POLICY_LIBRARY, WorkforceAdminPanels } from './workforce';
import { EmployeeExpansionPanel, WorkforceExpansionPanels } from './workforceExpansion';
import { ApplicantPortal, HiringPanel } from './hiring';

// --- FIREBASE INITIALIZATION ---
const getEnvVar = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  return undefined;
};

const firebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY'),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID') || "demo-project",
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnvVar('VITE_FIREBASE_APP_ID')
};

if (typeof window !== 'undefined' && window.__firebase_config && !firebaseConfig.apiKey) {
  Object.assign(firebaseConfig, JSON.parse(window.__firebase_config));
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const appId = getEnvVar('VITE_APP_ID') || (typeof window !== 'undefined' && window.__app_id ? window.__app_id : 'org-onboarding');

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const timeEntryHours = (entry) => {
  const clockIn = Date.parse(entry.clockInAt);
  const clockOut = Date.parse(entry.clockOutAt);
  if (!Number.isFinite(clockIn) || !Number.isFinite(clockOut) || clockOut < clockIn) return 0;
  const breakMinutes = (Date.parse(entry.breakEndedAt) - Date.parse(entry.breakStartedAt)) / 60000;
  const lunchMinutes = (Date.parse(entry.lunchEndedAt) - Date.parse(entry.lunchStartedAt)) / 60000;
  const unpaidMinutes = [breakMinutes, lunchMinutes].filter(Number.isFinite).reduce((sum, minutes) => sum + Math.max(0, minutes), 0);
  return Math.max(0, ((clockOut - clockIn) / 3600000) - (unpaidMinutes / 60));
};

const DEFAULT_TEMPLATES = [
  { title: 'General Liability Waiver', content: 'I hereby release and discharge the organization from any and all liability, claims, or causes of action for injuries or damages arising out of my participation in volunteer activities. I voluntarily assume full responsibility for any risks of loss or personal injury.', requiresAck: false },
  { title: 'Non-Disclosure Agreement (NDA)', content: 'You agree to maintain the confidentiality of all proprietary information, trade secrets, and internal communications encountered during your engagement with the organization. This information may not be shared, published, or discussed with unauthorized third parties.', requiresAck: true },
  { title: 'Site Safety & Hazard Protocol', content: 'I acknowledge that I will be entering an active operational/construction zone. I agree to wear required Personal Protective Equipment (PPE) at all times, follow the instructions of the site foreman, and immediately report any safety hazards.', requiresAck: true },
  { title: 'HIPAA Volunteer Acknowledgment', content: 'I understand that I may encounter Protected Health Information (PHI). I agree to strictly adhere to all HIPAA privacy and security rules, and I will not access, use, or disclose any patient information outside the scope of my direct assigned duties.', requiresAck: true },
  { title: 'Universal Code of Conduct', content: 'We are committed to providing a safe, inclusive, and harassment-free environment. All participants are expected to treat others with respect. Discrimination, harassment, or abusive behavior of any kind will result in immediate dismissal.', requiresAck: true },
  ...POLICY_LIBRARY
];

const INDUSTRY_LABELS = {
  not_specified: 'Not Specified',
  nonprofit: 'Non-Profit & Community',
  corporate: 'Corporate & Enterprise',
  healthcare: 'Healthcare & Medical',
  construction: 'Construction & Trades',
  events: 'Events & Hospitality',
  education: 'Education & Academia',
  government: 'Government & Public Sector',
  technology: 'Technology & IT',
  retail: 'Retail & Consumer Goods',
  manufacturing: 'Manufacturing & Logistics',
  finance: 'Finance & Insurance',
  entertainment: 'Arts, Entertainment & Recreation',
  other: 'Other'
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null); 
  
  const [organizations, setOrganizations] = useState([]);
  const [events, setEvents] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [trainingTemplates, setTrainingTemplates] = useState([]);
  const [trainingAssignments, setTrainingAssignments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [employeeInvitations, setEmployeeInvitations] = useState([]);
  const [orgRoles, setOrgRoles] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [shiftTrades, setShiftTrades] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [jobPostings, setJobPostings] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');

  useEffect(() => {
    const initAuth = async () => {
      try {
        const apiKey = getEnvVar('VITE_FIREBASE_API_KEY');
        if (typeof window !== 'undefined' && window.__initial_auth_token && !apiKey) {
          await signInWithCustomToken(auth, window.__initial_auth_token);
        } else if (!apiKey) {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setDataError('');
      if (!u) {
        setUserProfile(null);
        setLoading(false);
      } else {
        setLoading(true);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    const unsubscribeProfile = onSnapshot(profileRef, (snapshot) => {
      setUserProfile(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
      setLoading(false);
    }, (error) => {
      console.error('Unable to load the signed-in user profile:', error);
      setDataError('ReadyRoster could not read your profile. Please check the Firestore security rules and try again.');
      setLoading(false);
    });

    return unsubscribeProfile;
  }, [user]);

  useEffect(() => {
    if (!userProfile) return;

    const orgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'organizations');
    const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');
    const templatesRef = collection(db, 'artifacts', appId, 'public', 'data', 'documentTemplates');
    const jobsRef = collection(db, 'artifacts', appId, 'public', 'data', 'jobPostings');
    const reportListenerError = (error) => {
      console.error('Unable to load ReadyRoster data:', error);
      setDataError('ReadyRoster could not load its shared data. Please check the Firestore security rules and try again.');
    };

    const unsubOrgs = onSnapshot(orgsRef, (snapshot) => {
      setOrganizations(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, reportListenerError);

    const unsubEvents = onSnapshot(eventsRef, (snapshot) => {
      setEvents(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, reportListenerError);

    const unsubTemplates = onSnapshot(templatesRef, (snapshot) => {
      setTemplates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, reportListenerError);
    const unsubJobs = onSnapshot(jobsRef, (snapshot) => setJobPostings(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))), reportListenerError);

    const workforceUnsubs = [];
    const subscribe = (target, setter) => workforceUnsubs.push(onSnapshot(target, (snapshot) => {
      setter(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, reportListenerError));

    if (userProfile.role === 'employee' && userProfile.orgId) {
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'trainingAssignments'), where('employeeUid', '==', user.uid)), setTrainingAssignments);
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), where('recipientUid', '==', user.uid)), setNotifications);
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), where('participantUids', 'array-contains', user.uid)), setMessages);
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), where('employeeUid', '==', user.uid)), setShifts);
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'availability'), where('employeeUid', '==', user.uid)), setAvailability);
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'leaveRequests'), where('employeeUid', '==', user.uid)), setLeaveRequests);
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'timeEntries'), where('employeeUid', '==', user.uid)), setTimeEntries);
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'orgRoles'), where('orgId', '==', userProfile.orgId)), setOrgRoles);
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'shiftTrades'), where('participantUids', 'array-contains', user.uid)), setShiftTrades);
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'holidays'), where('orgId', '==', userProfile.orgId)), setHolidays);
      setVolunteers([]);
      return () => {
        unsubOrgs(); unsubEvents(); unsubTemplates(); unsubJobs(); workforceUnsubs.forEach(unsubscribe => unsubscribe());
      };
    }

    if (userProfile.role === 'applicant') {
      subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'applications'), where('applicantUid', '==', user.uid)), setApplications);
      return () => { unsubOrgs(); unsubEvents(); unsubTemplates(); unsubJobs(); workforceUnsubs.forEach(unsubscribe => unsubscribe()); };
    }

    if (userProfile.role !== 'admin' || !userProfile.orgId) {
      setVolunteers([]);
      return () => { unsubOrgs(); unsubEvents(); unsubTemplates(); unsubJobs(); };
    }

    const volunteersRef = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'volunteers'),
      where('orgId', '==', userProfile.orgId)
    );
    const unsubVolunteers = onSnapshot(volunteersRef, (snapshot) => {
      setVolunteers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, reportListenerError);

    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'users'), where('orgId', '==', userProfile.orgId)), (profiles) => setEmployees(profiles.filter(profile => profile.role === 'employee')));
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'trainingTemplates'), where('orgId', '==', userProfile.orgId)), setTrainingTemplates);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'trainingAssignments'), where('orgId', '==', userProfile.orgId)), setTrainingAssignments);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'employeeInvitations'), where('orgId', '==', userProfile.orgId)), setEmployeeInvitations);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), where('orgId', '==', userProfile.orgId)), setMessages);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), where('orgId', '==', userProfile.orgId)), setShifts);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'timeEntries'), where('orgId', '==', userProfile.orgId)), setTimeEntries);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'leaveRequests'), where('orgId', '==', userProfile.orgId)), setLeaveRequests);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'orgRoles'), where('orgId', '==', userProfile.orgId)), setOrgRoles);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'promotions'), where('orgId', '==', userProfile.orgId)), setPromotions);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'shiftTrades'), where('orgId', '==', userProfile.orgId)), setShiftTrades);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'holidays'), where('orgId', '==', userProfile.orgId)), setHolidays);
    subscribe(query(collection(db, 'artifacts', appId, 'public', 'data', 'applications'), where('orgId', '==', userProfile.orgId)), setApplications);

    return () => {
      unsubOrgs();
      unsubEvents();
      unsubTemplates();
      unsubJobs();
      unsubVolunteers();
      workforceUnsubs.forEach(unsubscribe => unsubscribe());
    };
  }, [user, userProfile]);

  const handleLogout = async () => {
    await signOut(auth);
    setUserProfile(null);
    setDataError('');
  };

  const callWorkforce = async (name, data) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Please sign in again before continuing.');

    // Use Firebase's callable HTTPS protocol directly. This keeps sign-in
    // independent of the optional Functions SDK on static deployments.
    const token = await currentUser.getIdToken();
    const response = await fetch(
      `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/${name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data: { appId, ...data } }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message || 'That action could not be completed.');
    }
    return payload.data ?? payload.result;
  };

  const handleInviteEmployee = async (email) => {
    return callWorkforce('createEmployeeInvitation', { email });
  };

  const handleAcceptInvitation = async () => {
    const invitationId = new URLSearchParams(window.location.search).get('employeeInvite');
    await callWorkforce('acceptEmployeeInvitation', { invitationId });
  };

  const handleCreateJob = async (job) => addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'jobPostings'), { ...job, orgId: userProfile.orgId, status: 'open', createdByUid: user.uid, createdAt: new Date().toISOString() });
  const handleUpdateApplication = async (applicationId, changes) => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'applications', applicationId), { ...changes, updatedAt: new Date().toISOString(), updatedByUid: user.uid }, { merge: true });
  const handleSubmitApplication = async (form) => {
    const job = jobPostings.find(item => item.id === form.jobId);
    if (!job || job.status !== 'open') throw new Error('This application is no longer accepting submissions.');
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'applications'), { ...form, orgId: job.orgId, applicantUid: user.uid, name: `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim(), email: userProfile.email || user.email || '', stage: 'new', submittedAt: new Date().toISOString() });
  };

  const handleAddTrainingTemplate = async (template) => {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'trainingTemplates'), {
      ...template,
      orgId: userProfile.orgId,
      createdByUid: user.uid,
      createdAt: new Date().toISOString()
    });
  };

  const handleAssignTraining = async ({ employeeUid, templateId, dueMode, dueAt, dueOffsetDays }) => {
    await callWorkforce('assignTraining', {
      employeeUid,
      templateId,
      dueAt: dueMode === 'specific_date' ? dueAt : null,
      dueOffsetDays: dueMode === 'start_date_offset' ? Number(dueOffsetDays) : null,
    });
  };

  const handleSubmitQuiz = async (assignment, answers) => {
    await callWorkforce('submitTrainingQuiz', { assignmentId: assignment.id, answers });
  };

  const handleMessage = async ({ recipientUid, body }) => {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
      orgId: userProfile.orgId,
      senderUid: user.uid,
      recipientUid,
      participantUids: [user.uid, recipientUid],
      body,
      createdAt: new Date().toISOString()
    });
  };

  const handleEmployeeMessage = async (body) => {
    const adminUid = organizationForUser?.adminUid;
    if (!adminUid) throw new Error('Your organization administrator is not available.');
    return handleMessage({ recipientUid: adminUid, body });
  };

  const handleMarkNotificationRead = async (notificationId) => {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notifications', notificationId), { readAt: new Date().toISOString() }, { merge: true });
  };

  const handleCreateShift = async (shift) => {
    await callWorkforce('publishShift', { shift });
  };

  const handleAvailability = async (entry) => {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'availability'), { ...entry, orgId: userProfile.orgId, employeeUid: user.uid, createdAt: new Date().toISOString() });
  };

  const handleLeaveRequest = async (request) => {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'leaveRequests'), { ...request, orgId: userProfile.orgId, employeeUid: user.uid, status: 'pending', createdAt: new Date().toISOString() });
  };

  const handleClock = async (action) => {
    await callWorkforce('clockAction', { action });
  };

  const handleReviewTime = async (timeEntryId, status) => {
    await callWorkforce('reviewTimeEntry', { timeEntryId, status });
  };

  const handleReviewLeave = async (leaveRequestId, status, managerNote = '') => {
    await callWorkforce('reviewLeaveRequest', { leaveRequestId, status, managerNote });
  };

  const handleSaveRole = async (role) => {
    await callWorkforce('saveOrgRole', { role });
  };

  const handlePromote = async (promotion) => {
    await callWorkforce('promoteEmployee', promotion);
  };

  const handleSaveProfile = async (profileChanges) => {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid), profileChanges, { merge: true });
  };

  const handleSaveBranding = async (branding) => {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'organizations', userProfile.orgId), branding, { merge: true });
  };

  const handleCreateHoliday = async (holiday) => {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'holidays'), { ...holiday, orgId: userProfile.orgId, createdAt: new Date().toISOString() });
  };

  const handleSaveTemplateFields = async ({ templateId, label, type, options }) => {
    const template = templates.find(item => item.id === templateId);
    if (!template) return;
    const fields = [...(template.fields || []), { id: `field_${Date.now()}`, label, type, options: type === 'multiple_choice' ? options.split(',').map(item => item.trim()).filter(Boolean) : [], required: true }];
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'documentTemplates', templateId), { fields }, { merge: true });
  };

  const handleTradeRequest = async ({ shiftId, toEmployeeEmail }) => {
    await callWorkforce('requestShiftTrade', { shiftId, toEmployeeEmail });
  };

  const handleReviewTrade = async (tradeId, status) => {
    await callWorkforce('reviewShiftTrade', { tradeId, status });
  };

  const handleExportTimesheets = ({ format, employeeUid, from, to }) => {
    const employeeMap = new Map(employees.map(person => [person.id, person]));
    const rows = timeEntries
      .filter(entry => !employeeUid || entry.employeeUid === employeeUid)
      .filter(entry => !from || String(entry.clockInAt || '').slice(0, 10) >= from)
      .filter(entry => !to || String(entry.clockInAt || '').slice(0, 10) <= to)
      .map(entry => ({
        employeeUid: entry.employeeUid,
        employee: `${employeeMap.get(entry.employeeUid)?.preferredName || employeeMap.get(entry.employeeUid)?.firstName || 'Employee'} ${employeeMap.get(entry.employeeUid)?.lastName || ''}`.trim(),
        clockInAt: entry.clockInAt || '', clockOutAt: entry.clockOutAt || '', status: entry.status || '',
        netHours: Number(timeEntryHours(entry).toFixed(2)), breakEndedAt: entry.breakEndedAt || '', lunchEndedAt: entry.lunchEndedAt || ''
      }));
    const filename = `readyroster-timesheets-${from || 'all'}-to-${to || 'all'}.${format === 'csv' ? 'csv' : 'json'}`;
    const content = format === 'csv'
      ? [Object.keys(rows[0] || { employeeUid: '', employee: '', clockInAt: '', clockOutAt: '', status: '', netHours: '', breakEndedAt: '', lunchEndedAt: '' }).join(','), ...rows.map(row => Object.values(row).map(csvCell).join(','))].join('\n')
      : JSON.stringify({ generatedAt: new Date().toISOString(), filters: { employeeUid: employeeUid || null, from: from || null, to: to || null }, entries: rows, totalNetHours: Number(rows.reduce((sum, row) => sum + row.netHours, 0).toFixed(2)) }, null, 2);
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadPolicies = async () => {
    await Promise.all(POLICY_LIBRARY.map(template => addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'documentTemplates'), {
      ...template, orgId: userProfile.orgId, createdAt: new Date().toISOString()
    })));
  };

  const organizationForUser = organizations.find(organization => organization.id === userProfile?.orgId);

  const AuthScreen = () => {
    const employeeInviteId = new URLSearchParams(window.location.search).get('employeeInvite');
    const applicationJobId = new URLSearchParams(window.location.search).get('apply');
    const forcedRole = employeeInviteId ? 'employee' : applicationJobId ? 'applicant' : null;
    const [isLogin, setIsLogin] = useState(Boolean(!forcedRole));
    const [roleTab, setRoleTab] = useState(forcedRole || 'volunteer');
    const [formData, setFormData] = useState({ email: '', password: '', firstName: '', lastName: '', orgName: '', industry: 'not_specified' });
    const [error, setError] = useState('');

    const handleAuth = async (e) => {
      e.preventDefault();
      setError('');
      try {
        if (isLogin) {
          await signInWithEmailAndPassword(auth, formData.email, formData.password);
        } else {
          const cred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
          
          let orgId = null;
          if (roleTab === 'admin') {
            orgId = 'org_' + Math.random().toString(36).substr(2, 9);
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'organizations', orgId), {
              name: formData.orgName,
              industry: formData.industry,
              adminUid: cred.user.uid,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
              dueSoonDays: 7,
              defaultPassThreshold: 80,
              features: { training: true, messaging: true, scheduling: true, timeClock: true },
              createdAt: new Date().toISOString()
            });

            await Promise.all(DEFAULT_TEMPLATES.map(async (t) => {
              const tmplId = 'doc_' + Math.random().toString(36).substr(2, 9);
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'documentTemplates', tmplId), { ...t, orgId });
            }));
          }

          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', cred.user.uid), {
            role: roleTab,
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            orgId: orgId,
            applicationTargetJobId: roleTab === 'applicant' ? applicationJobId : null
          });
          if (roleTab === 'employee' && employeeInviteId) await callWorkforce('acceptEmployeeInvitation', { invitationId: employeeInviteId });
        }
      } catch (err) {
        setError(err.message.replace('Firebase: ', ''));
      }
    };

    const handleGoogleAuth = async () => {
      setError('');
      try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const userUid = result.user.uid;

        // Check if user profile already exists
        const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userUid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          // New User Registration
          let orgId = null;

          // If they chose the Admin role on the sign-up screen, create an organization
          if (!isLogin && roleTab === 'admin') {
            if (!formData.orgName || !formData.orgName.trim()) {
              throw new Error("Organization Name is required to register as an administrator.");
            }

            orgId = 'org_' + Math.random().toString(36).substr(2, 9);
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'organizations', orgId), {
              name: formData.orgName,
              industry: formData.industry,
              adminUid: userUid,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
              dueSoonDays: 7,
              defaultPassThreshold: 80,
              features: { training: true, messaging: true, scheduling: true, timeClock: true },
              createdAt: new Date().toISOString()
            });

            await Promise.all(DEFAULT_TEMPLATES.map(async (t) => {
              const tmplId = 'doc_' + Math.random().toString(36).substr(2, 9);
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'documentTemplates', tmplId), { ...t, orgId });
            }));
          }

          // Extract first and last names from Google display name
          const displayName = result.user.displayName || "";
          const nameParts = displayName.split(" ");
          const firstName = nameParts[0] || "User";
          const lastName = nameParts.slice(1).join(" ") || "";

          await setDoc(userDocRef, {
            role: !isLogin ? roleTab : 'volunteer',
            firstName: firstName,
            lastName: lastName,
            email: result.user.email || "",
            orgId: orgId,
            applicationTargetJobId: !isLogin && roleTab === 'applicant' ? applicationJobId : null
          });
          if (!isLogin && roleTab === 'employee' && employeeInviteId) await callWorkforce('acceptEmployeeInvitation', { invitationId: employeeInviteId });
        }
      } catch (err) {
        setError(err.message.replace('Firebase: ', ''));
      }
    };

    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-3xl"></div>
        
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-slate-50 p-6 border-b border-slate-100 flex flex-col items-center">
             <div className="flex items-center gap-2 mb-2 text-indigo-600">
               <ClipboardCheck size={28} strokeWidth={2.5} />
               <h1 className="text-3xl font-black text-slate-800 tracking-tight">ReadyRoster</h1>
             </div>
            <p className="text-sm text-slate-500 text-center mt-1">Unified Onboarding & Compliance</p>
          </div>

          {!isLogin && (
            <div className="flex border-b border-slate-200 bg-slate-50">
              {!forcedRole && <><button onClick={() => setRoleTab('volunteer')} className={`flex-1 py-3 text-xs font-bold transition-colors ${roleTab === 'volunteer' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>Volunteer</button><button onClick={() => setRoleTab('employee')} className={`flex-1 py-3 text-xs font-bold transition-colors ${roleTab === 'employee' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>Employee</button><button onClick={() => setRoleTab('admin')} className={`flex-1 py-3 text-xs font-bold transition-colors ${roleTab === 'admin' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>Admin</button></>}
            </div>
          )}

          <div className="p-6">
            {employeeInviteId && <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900"><strong>You were invited as an employee.</strong> Create your account with the invited email and ReadyRoster will connect you to the organization automatically.</div>}
            {applicationJobId && <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900"><strong>Start your application.</strong> Create an applicant account to complete the organization’s application form.</div>}
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-200">{error}</div>}
            
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLogin && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">First Name</label>
                    <input type="text" required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Last Name</label>
                    <input type="text" required value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
              )}
              
              {!isLogin && roleTab === 'admin' && (
                <div className="space-y-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 mb-1 uppercase">Organization Name</label>
                    <input type="text" required value={formData.orgName} onChange={e => setFormData({...formData, orgName: e.target.value})} className="w-full p-2.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 mb-1 uppercase">Industry</label>
                    <select value={formData.industry} onChange={e => setFormData({...formData, industry: e.target.value})} className="w-full p-2.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                      <option value="not_specified">Not Specified</option>
                      <option value="nonprofit">Non-Profit & Community</option>
                      <option value="corporate">Corporate & Enterprise</option>
                      <option value="healthcare">Healthcare & Medical</option>
                      <option value="construction">Construction & Trades</option>
                      <option value="events">Events & Hospitality</option>
                      <option value="education">Education & Academia</option>
                      <option value="government">Government & Public Sector</option>
                      <option value="technology">Technology & IT</option>
                      <option value="retail">Retail & Consumer Goods</option>
                      <option value="manufacturing">Manufacturing & Logistics</option>
                      <option value="finance">Finance & Insurance</option>
                      <option value="entertainment">Arts, Entertainment & Recreation</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 uppercase flex items-center gap-2"><Lock size={14}/> Email Account</label>
                <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Password</label>
                <input type="password" required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg transition-colors mt-2">
                {isLogin ? 'Sign In to ReadyRoster' : 'Create Account'}
              </button>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-slate-400 text-xs font-bold uppercase tracking-wider">or</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <button type="button" onClick={handleGoogleAuth} className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 border border-slate-200 rounded-lg shadow-sm transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-slate-500">
              {isLogin ? "Don't have an account? " : "Already registered? "}
              <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-indigo-600 font-bold hover:underline">
                {isLogin ? 'Sign Up' : 'Login'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AdminDashboard = () => {
    const [adminTab, setAdminTab] = useState('dashboard');
    const [newEventName, setNewEventName] = useState('');
    const [newEventType, setNewEventType] = useState('general');
    const [newTemplate, setNewTemplate] = useState({ title: '', content: '', requiresAck: false });

    const myOrg = organizations.find(o => o.id === userProfile?.orgId);
    const myEvents = events.filter(e => e.orgId === userProfile?.orgId);
    const myTemplates = templates.filter(t => t.orgId === userProfile?.orgId);
    const myVolunteers = volunteers.filter(v => v.orgId === userProfile?.orgId);

    const handleCreateEvent = async (e) => {
      e.preventDefault();
      if (!newEventName) return;

      const requiredDocs = myTemplates.map(t => t.id);

      const newEvent = {
        orgId: userProfile.orgId,
        name: newEventName,
        type: newEventType,
        date: new Date().toISOString().split('T')[0],
        requiredDocs,
        createdAt: new Date().toISOString()
      };

      try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'events'), newEvent);
        setNewEventName('');
      } catch (err) { /* Handle err */ }
    };

    const handleCreateTemplate = async (e) => {
      e.preventDefault();
      if (!newTemplate.title || !newTemplate.content) return;
      try {
        const id = 'doc_' + Math.random().toString(36).substr(2, 6);
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'documentTemplates'), id), { 
          ...newTemplate, id, orgId: userProfile.orgId 
        });
        setNewTemplate({ title: '', content: '', requiresAck: false });
      } catch (err) { /* Handle err */ }
    };

    const handleDeleteTemplate = async (id) => {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'documentTemplates', id));
      } catch (err) { /* Handle err */ }
    };

    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-slate-900 text-white p-6 shadow-md" style={{ backgroundColor: myOrg?.accentColor || '#0f172a' }}>
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 pr-6 border-r border-slate-700">
                 {myOrg?.logoUrl ? <img src={myOrg.logoUrl} alt="Organization logo" className="h-8 max-w-28 object-contain" /> : <ClipboardCheck size={24} className="text-indigo-400" />}
                 <span className="text-xl font-black tracking-tight">ReadyRoster</span>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="text-indigo-400" size={24}/>
                <div>
                  <h1 className="text-lg font-bold tracking-tight leading-tight">{myOrg?.name || 'Organization'}</h1>
                  <p className="text-xs text-indigo-300 uppercase tracking-widest">{INDUSTRY_LABELS[myOrg?.industry] || myOrg?.industry || 'Not Specified'}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-slate-300">Admin: {userProfile.firstName}</span>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors" title="Logout"><LogOut size={18}/></button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6 animate-in fade-in zoom-in-95 duration-300 mt-4">
          <div className="flex gap-3 mb-8 border-b border-slate-200 pb-4">
            <button onClick={() => setAdminTab('dashboard')} className={`px-4 py-2 rounded-lg font-bold transition-colors ${adminTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>Dashboard & Rosters</button>
            <button onClick={() => setAdminTab('workforce')} className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors ${adminTab === 'workforce' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}><Users size={16} /> Workforce</button>
            <button onClick={() => setAdminTab('wizard')} className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors ${adminTab === 'wizard' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}><Wand2 size={16} /> Template Wizard</button>
          </div>

          {adminTab === 'dashboard' ? (
            <>
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 text-indigo-600 mb-2"><Users size={24} /><h3 className="font-semibold text-slate-700">Total Applications</h3></div>
                  <p className="text-4xl font-black text-slate-900">{myVolunteers.length}</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 text-emerald-600 mb-2"><ShieldCheck size={24} /><h3 className="font-semibold text-slate-700">Fully Cleared</h3></div>
                  <p className="text-4xl font-black text-slate-900">{myVolunteers.filter(v => v.status === 'cleared').length}</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 text-amber-500 mb-2"><FileText size={24} /><h3 className="font-semibold text-slate-700">Active Events</h3></div>
                  <p className="text-4xl font-black text-slate-900">{myEvents.length}</p>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50"><h2 className="text-lg font-bold text-slate-800">Registration Roster</h2></div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 bg-white">
                          <th className="p-4 font-bold">Participant</th>
                          <th className="p-4 font-bold">Event/Project</th>
                          <th className="p-4 font-bold">Clearance</th>
                          <th className="p-4 font-bold">Signed Docs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {myVolunteers.length === 0 ? (
                          <tr><td colSpan="4" className="p-8 text-center text-slate-400 font-medium">No registrations yet.</td></tr>
                        ) : (
                          myVolunteers.map(vol => {
                            const event = myEvents.find(e => e.id === vol.eventId);
                            return (
                              <tr key={vol.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4">
                                  <div className="font-bold text-slate-900">{vol.firstName} {vol.lastName}</div>
                                  <div className="text-xs text-slate-500">{vol.email}</div>
                                </td>
                                <td className="p-4 text-sm font-medium text-slate-700">{event?.name || 'Unknown'}</td>
                                <td className="p-4">
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800"><CheckCircle2 size={14}/> Cleared</span>
                                </td>
                                <td className="p-4 text-sm font-mono text-slate-500">{vol.completedDocs?.length || 0} files</td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 self-start">
                  <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Calendar className="text-indigo-600" size={20}/> Launch Initiative</h2>
                  <form onSubmit={handleCreateEvent} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Event / Project Name</label>
                      <input type="text" required value={newEventName} onChange={(e) => setNewEventName(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Q3 Volunteer Drive" />
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <div className="text-xs text-slate-800 font-bold mb-2">Automated Compliance Generation:</div>
                      <div className="text-xs text-slate-600">The system will automatically generate a signable packet utilizing all {myTemplates.length} documents from your Template Library for this initiative.</div>
                    </div>
                    <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2">
                      <Plus size={18} /> Launch Initiative
                    </button>
                  </form>
                </div>
              </div>
            </>
          ) : adminTab === 'workforce' ? (
            <>
            <WorkforceAdminPanels
              organization={myOrg}
              employees={employees}
              roles={orgRoles}
              trainingTemplates={trainingTemplates}
              assignments={trainingAssignments}
              invitations={employeeInvitations}
              shifts={shifts}
              timeEntries={timeEntries}
              leaveRequests={leaveRequests}
              messages={messages}
              onInvite={handleInviteEmployee}
              onAddTemplate={handleAddTrainingTemplate}
              onAssign={handleAssignTraining}
              onMessage={handleMessage}
              onShift={handleCreateShift}
              onReviewTime={handleReviewTime}
              onReviewLeave={handleReviewLeave}
              onLoadPolicies={handleLoadPolicies}
            />
            <WorkforceExpansionPanels
              organization={myOrg}
              employees={employees}
              roles={orgRoles}
              promotions={promotions}
              shifts={shifts}
              shiftTrades={shiftTrades}
              holidays={holidays}
              templates={myTemplates}
              timeEntries={timeEntries}
              onSaveRole={handleSaveRole}
              onPromote={handlePromote}
              onSaveBranding={handleSaveBranding}
              onReviewTrade={handleReviewTrade}
              onCreateHoliday={handleCreateHoliday}
              onSaveTemplateFields={handleSaveTemplateFields}
              onExportTimesheets={handleExportTimesheets}
            />
            <HiringPanel organization={myOrg} jobs={jobPostings.filter(job => job.orgId === userProfile.orgId)} applications={applications} onCreateJob={handleCreateJob} onUpdateApplication={handleUpdateApplication} onInviteApplicant={handleInviteEmployee} />
            </>
          ) : (
            <div className="grid lg:grid-cols-2 gap-8 animate-in slide-in-from-right-8 duration-300">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2"><Wand2 className="text-indigo-600" size={24}/> Document Wizard</h2>
                <p className="text-sm text-slate-500 mb-6">Create modular agreements, waivers, NDAs, and policies tailored to your industry.</p>
                
                <form onSubmit={handleCreateTemplate} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Document Title</label>
                    <input type="text" required value={newTemplate.title} onChange={(e) => setNewTemplate({...newTemplate, title: e.target.value})} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Confidentiality Agreement" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Legal Content / Policy Text</label>
                    <textarea required value={newTemplate.content} onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-40 font-serif text-sm resize-none" placeholder="Enter the full text of the agreement here..." />
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={newTemplate.requiresAck} onChange={e => setNewTemplate({...newTemplate, requiresAck: e.target.checked})} className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                      <div>
                        <span className="text-sm font-bold text-slate-800 block">Require Explicit Checkbox</span>
                        <span className="text-xs text-slate-500">Volunteers must specifically tick a box for this document before signing the master agreement.</span>
                      </div>
                    </label>
                  </div>
                  <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2">
                    <Plus size={18} /> Save Template to Library
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 overflow-y-auto max-h-[700px]">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><FileText className="text-slate-600" size={20}/> Template Library</h2>
                <div className="space-y-4">
                  {myTemplates.length === 0 && <p className="text-sm text-slate-500 italic">No templates created yet.</p>}
                  {myTemplates.map(tmpl => (
                    <div key={tmpl.id} className="border border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-colors group relative">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-slate-800">{tmpl.title}</h3>
                        <button onClick={() => handleDeleteTemplate(tmpl.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" title="Delete Template"><Trash2 size={16} /></button>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-3 mb-3 bg-slate-50 p-2 rounded">{tmpl.content}</p>
                      <div className="flex items-center justify-between">
                        {tmpl.requiresAck ? <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded">Requires Checkbox</span> : <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">Master Signature</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const VolunteerPortal = () => {
    const [step, setStep] = useState(0); 
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [formData, setFormData] = useState({ emergencyName: '', emergencyPhone: '' });
    const [signature, setSignature] = useState('');
    const [documentAcks, setDocumentAcks] = useState({});
    const [documentResponses, setDocumentResponses] = useState({});

    const orgEvents = events.filter(e => e.orgId === selectedOrg?.id);
    const orgTemplates = templates.filter(t => t.orgId === selectedOrg?.id);

    const canSubmitDocuments = () => {
      if (!signature) return false;
      const requiredDocsForEvent = selectedEvent?.requiredDocs || [];
      const requiredAcks = requiredDocsForEvent.filter(docId => {
        const tmpl = orgTemplates.find(t => t.id === docId);
        return tmpl?.requiresAck;
      });
      const requiredFields = requiredDocsForEvent.flatMap(docId => (orgTemplates.find(t => t.id === docId)?.fields || []).filter(field => field.required).map(field => `${docId}:${field.id}`));
      return requiredAcks.every(id => documentAcks[id]) && requiredFields.every(id => String(documentResponses[id] || '').trim());
    };

    const handleSubmit = async () => {
      const completedDocs = selectedEvent?.requiredDocs || [];
      const volunteerDoc = {
        eventId: selectedEvent.id,
        orgId: selectedOrg.id,
        volunteerUid: user.uid,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        email: userProfile.email,
        emergencyName: formData.emergencyName,
        emergencyPhone: formData.emergencyPhone,
        status: 'cleared',
        completedDocs,
        signedAt: new Date().toISOString(),
        signature,
        responses: documentResponses
      };

      try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'volunteers'), volunteerDoc);
        setStep(4);
      } catch (err) { console.error("Error saving volunteer", err); }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-white border-b border-slate-200 p-4 flex justify-between items-center shadow-sm">
          <div className="font-bold text-slate-800 flex items-center gap-2"><UserPlus size={20} className="text-indigo-600"/> User Portal</div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-600">{userProfile?.firstName} {userProfile?.lastName}</span>
            <button onClick={handleLogout} className="text-sm text-red-600 font-bold hover:underline">Logout</button>
          </div>
        </div>

        <div className="flex-grow flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
            
            <div className="bg-slate-900 p-8 text-center relative overflow-hidden">
               <div className="absolute top-4 left-4 flex items-center gap-1 opacity-20">
                 <ClipboardCheck size={16} className="text-white" />
                 <span className="text-xs font-black tracking-widest text-white uppercase">ReadyRoster</span>
               </div>
              <h1 className="text-3xl font-black text-white relative z-10 tracking-tight">
                {step === 0 ? "Find Organizations" : selectedOrg?.name}
              </h1>
              <p className="text-slate-300 relative z-10 mt-1">Digital Registration & Compliance</p>
            </div>

            <div className="p-8">
              {step === 0 && (
                <div className="space-y-4 animate-in fade-in">
                  <h2 className="text-lg font-bold text-slate-800 mb-4">Select an Organization to Join</h2>
                  <div className="grid gap-3">
                    {organizations.map(org => (
                      <button key={org.id} onClick={() => { setSelectedOrg(org); setStep(1); }} className="flex items-center justify-between p-4 border-2 border-slate-100 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left group">
                        <div>
                          <div className="font-bold text-slate-800 flex items-center gap-2"><Building2 size={16}/> {org.name}</div>
                          <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mt-1">{INDUSTRY_LABELS[org.industry] || org.industry || 'Not Specified'}</div>
                        </div>
                        <ChevronRight className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                      </button>
                    ))}
                    {organizations.length === 0 && <p className="text-slate-500 text-center py-8">No organizations found.</p>}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4 animate-in slide-in-from-right-8">
                  <button onClick={() => setStep(0)} className="text-sm text-indigo-600 font-bold hover:underline mb-2">&larr; Back to Organizations</button>
                  <h2 className="text-xl font-bold text-slate-800 mb-4">Available Initiatives</h2>
                  <div className="grid gap-3">
                    {orgEvents.map(evt => (
                      <button key={evt.id} onClick={() => { setSelectedEvent(evt); setStep(2); }} className="flex items-center justify-between p-4 border-2 border-slate-100 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left group">
                        <div className="font-bold text-slate-800">{evt.name}</div>
                        <ArrowRight className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                      </button>
                    ))}
                    {orgEvents.length === 0 && <p className="text-slate-500 text-center py-8">No active initiatives found.</p>}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6 animate-in slide-in-from-right-8">
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center font-bold">{userProfile.firstName.charAt(0)}{userProfile.lastName.charAt(0)}</div>
                    <div>
                      <p className="text-xs font-bold text-blue-800 uppercase">Logged in as</p>
                      <p className="font-bold text-blue-900">{userProfile.firstName} {userProfile.lastName}</p>
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ClipboardList size={18}/> Emergency Contact</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Contact Name</label>
                      <input type="text" value={formData.emergencyName} onChange={e => setFormData({...formData, emergencyName: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Phone Number</label>
                      <input type="tel" value={formData.emergencyPhone} onChange={e => setFormData({...formData, emergencyPhone: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  
                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setStep(1)} className="flex-1 py-3 text-slate-600 font-bold bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Back</button>
                    <button disabled={!formData.emergencyName} onClick={() => setStep(3)} className="flex-[2] py-3 text-white font-bold bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50">Continue to Documents</button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6 animate-in slide-in-from-right-8">
                  <h2 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-200 pb-2">Compliance & Waivers</h2>

                  <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-4">
                    {selectedEvent?.requiredDocs.map(docId => {
                      const template = orgTemplates.find(t => t.id === docId);
                      if (!template) return null;

                      return (
                        <div key={template.id} className={`border rounded-xl p-5 shadow-sm ${template.requiresAck ? 'bg-amber-50/50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                          <h4 className={`font-bold mb-3 flex items-center gap-2 ${template.requiresAck ? 'text-amber-900' : 'text-slate-800'}`}>
                            {template.requiresAck ? <AlertCircle size={18}/> : <FileText size={18}/>}
                            {template.title}
                          </h4>
                          <div className={`text-sm mb-4 whitespace-pre-wrap ${template.requiresAck ? 'text-amber-800' : 'text-slate-600'}`}>
                            {template.content.replace(/\[Name\]/g, userProfile.firstName || '[Name]')}
                          </div>
                          {(template.fields || []).map(field => <label key={field.id} className="mt-3 block text-sm font-bold text-slate-700">{field.label}{field.type === 'multiple_choice' ? <select required={field.required} value={documentResponses[`${template.id}:${field.id}`] || ''} onChange={e => setDocumentResponses({ ...documentResponses, [`${template.id}:${field.id}`]: e.target.value })} className="mt-1 w-full rounded-lg border p-3"><option value="">Select an option</option>{field.options.map(option => <option key={option}>{option}</option>)}</select> : <input required={field.required} value={documentResponses[`${template.id}:${field.id}`] || ''} onChange={e => setDocumentResponses({ ...documentResponses, [`${template.id}:${field.id}`]: e.target.value })} className="mt-1 w-full rounded-lg border p-3"/>}</label>)}
                          {template.requiresAck && (
                            <label className="flex items-start gap-3 cursor-pointer mt-4 pt-4 border-t border-amber-200/50">
                              <input type="checkbox" checked={documentAcks[template.id] || false} onChange={e => setDocumentAcks({...documentAcks, [template.id]: e.target.checked})} className="mt-1 w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500" />
                              <span className="text-sm font-bold text-amber-900">I have read and explicitly agree to the {template.title}.</span>
                            </label>
                          )}
                        </div>
                      );
                    })}
                    {(!selectedEvent?.requiredDocs || selectedEvent.requiredDocs.length === 0) && (
                      <p className="text-sm text-slate-500 italic">No documents required for this initiative.</p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-200 mt-6">
                    <label className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2 uppercase"><FileSignature size={16}/> Master Digital Signature</label>
                    <input type="text" value={signature} onChange={e => setSignature(e.target.value)} placeholder="Type your full legal name to sign all documents" className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none font-bold font-serif text-lg bg-white shadow-inner" />
                  </div>

                  <div className="flex gap-4 pt-2">
                    <button onClick={() => setStep(2)} className="flex-1 py-3 text-slate-600 font-bold bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Back</button>
                    <button disabled={!canSubmitDocuments()} onClick={handleSubmit} className="flex-[2] py-3 text-white font-bold bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2"><CheckCircle2 size={18}/> Sign & Submit</button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="text-center py-12 animate-in zoom-in-95">
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 size={40} /></div>
                  <h2 className="text-2xl font-black text-slate-800 mb-2">Registration Complete!</h2>
                  <p className="text-slate-500 mb-8 max-w-md mx-auto">Thank you, {userProfile.firstName}. Your documents have been securely filed and you are cleared for <strong>{selectedEvent?.name}</strong> at {selectedOrg?.name}.</p>
                  <button onClick={() => { setStep(0); setSignature(''); setDocumentAcks({}); }} className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors">Return to Dashboard</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400 tracking-wider">LOADING SYSTEM...</div>;

  if (dataError) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <AlertCircle className="mx-auto mb-4 text-red-500" size={36} />
        <h1 className="text-xl font-black text-slate-800">Unable to load ReadyRoster</h1>
        <p className="mt-3 text-sm text-slate-600">{dataError}</p>
        <button onClick={handleLogout} className="mt-6 rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800">Sign out and try again</button>
      </div>
    </div>
  );

  if (!user || !userProfile) return <AuthScreen />;

  return (
    <div className="font-sans antialiased text-slate-900 selection:bg-indigo-200">
      {userProfile.role === 'admin' ? <AdminDashboard /> : userProfile.role === 'applicant' ? <ApplicantPortal profile={userProfile} jobs={jobPostings} onSubmit={handleSubmitApplication} /> : userProfile.role === 'employee' ? <>
        <EmployeePortal
        profile={userProfile}
        user={user}
        organization={organizationForUser}
        assignments={trainingAssignments}
        notifications={notifications}
        messages={messages}
        shifts={shifts}
        timeEntries={timeEntries}
        leaveRequests={leaveRequests}
        availability={availability}
        onMessage={handleEmployeeMessage}
        onReadNotification={handleMarkNotificationRead}
        onLeaveRequest={handleLeaveRequest}
        onAvailability={handleAvailability}
        onClock={handleClock}
        onQuiz={handleSubmitQuiz}
        onAcceptInvite={handleAcceptInvitation}
      />
      <EmployeeExpansionPanel profile={userProfile} organization={organizationForUser} roles={orgRoles} shifts={shifts} timeEntries={timeEntries} onSaveProfile={handleSaveProfile} onClock={handleClock} onTradeRequest={handleTradeRequest} />
      </> : <VolunteerPortal />}
    </div>
  );
}
