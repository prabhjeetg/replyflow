/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Layout, type PageId } from './components/Layout';
import { apiFetch } from './lib/api';
import {
  getFirebaseDb,
  handleFirestoreError,
  initFirebaseClient,
  logoutUser,
  OperationType,
} from './lib/firebase';
import { AccountsPage } from './pages/AccountsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ContactsPage } from './pages/ContactsPage';
import { HelpPage } from './pages/HelpPage';
import { LeadsPage } from './pages/LeadsPage';
import { LoginPage } from './pages/LoginPage';
import { LogsPage } from './pages/LogsPage';
import { RulesPage } from './pages/RulesPage';
import { SettingsPage } from './pages/SettingsPage';
import { TestModePage } from './pages/TestModePage';
import type {
  AppNotification,
  AutomationLog,
  AutomationRule,
  Contact,
  DailyStat,
  Language,
  Lead,
  SocialAccount,
  ThemeMode,
  UserProfile,
} from './types';

interface LocalStateResponse {
  profile: UserProfile;
  accounts: SocialAccount[];
  rules: AutomationRule[];
  logs: AutomationLog[];
  leads: Lead[];
  contacts: Contact[];
  stats: DailyStat[];
  notifications: AppNotification[];
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [firebaseConfigured, setFirebaseConfigured] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activePage, setActivePage] = useState<PageId>('analytics');

  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('replyflow_lang');
    return saved === 'hi' ? 'hi' : 'en';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('replyflow_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [pausedAll, setPausedAll] = useState(false);

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const isLocalWorkspace = !firebaseConfigured;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('replyflow_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('replyflow_lang', language);
  }, [language]);

  const loadLocalWorkspace = useCallback(async () => {
    try {
      const data = await apiFetch<LocalStateResponse>('/api/local/state');
      setAccounts(data.accounts || []);
      setRules(data.rules || []);
      setLogs(data.logs || []);
      setLeads(data.leads || []);
      setContacts(data.contacts || []);
      setStats(data.stats || []);
      setNotifications(data.notifications || []);
      if (data.profile) {
        setLanguage(data.profile.language || 'en');
        if (data.profile.theme) setTheme(data.profile.theme);
        setPausedAll(Boolean(data.profile.pauseAllAutomations));
      }
    } catch {
      // Ignore transient load error
    }
  }, []);

  // Initialize Firebase Client & Auth Listener
  useEffect(() => {
    let unsubAuth: (() => void) | undefined;

    initFirebaseClient()
      .then(({ configured, auth }) => {
        setFirebaseConfigured(configured);
        if (!configured || !auth) {
          void loadLocalWorkspace().finally(() => setBooting(false));
          return;
        }
        unsubAuth = onAuthStateChanged(auth, (u) => {
          setUser(u);
          setBooting(false);
        });
      })
      .catch(() => {
        void loadLocalWorkspace().finally(() => setBooting(false));
      });

    return () => {
      if (unsubAuth) unsubAuth();
    };
  }, [loadLocalWorkspace]);

  // Attach scoped Firestore listeners when Firebase Auth is active
  useEffect(() => {
    const db = getFirebaseDb();
    if (!firebaseConfigured || !user || !db) {
      return;
    }

    const uid = user.uid;
    const userRef = doc(db, 'users', uid);

    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) {
          const now = new Date().toISOString();
          const newProfile: UserProfile = {
            uid,
            email: user.email || '',
            displayName: user.displayName || '',
            language,
            theme,
            pauseAllAutomations: false,
            createdAt: now,
            updatedAt: now,
          };
          setDoc(userRef, newProfile).catch((err) =>
            handleFirestoreError(err, OperationType.CREATE, `users/${uid}`)
          );
        } else {
          const data = snap.data() as UserProfile;
          if (data.language) setLanguage(data.language);
          if (data.theme) setTheme(data.theme);
          setPausedAll(Boolean(data.pauseAllAutomations));
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    const unsubAccounts = onSnapshot(
      query(collection(db, 'accounts'), where('userId', '==', uid)),
      (snap) => {
        setAccounts(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SocialAccount, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'accounts')
    );

    const unsubRules = onSnapshot(
      query(
        collection(db, 'rules'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(100)
      ),
      (snap) => {
        setRules(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AutomationRule, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'rules')
    );

    const unsubLogs = onSnapshot(
      query(
        collection(db, 'logs'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(200)
      ),
      (snap) => {
        setLogs(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AutomationLog, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'logs')
    );

    const unsubLeads = onSnapshot(
      query(
        collection(db, 'leads'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(200)
      ),
      (snap) => {
        setLeads(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'leads')
    );

    const unsubContacts = onSnapshot(
      query(
        collection(db, 'contacts'),
        where('userId', '==', uid),
        orderBy('lastInteractedAt', 'desc'),
        limit(200)
      ),
      (snap) => {
        setContacts(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contact, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'contacts')
    );

    const unsubStats = onSnapshot(
      query(
        collection(db, 'stats'),
        where('userId', '==', uid),
        orderBy('date', 'asc'),
        limit(30)
      ),
      (snap) => {
        setStats(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DailyStat, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'stats')
    );

    const unsubNotifications = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(30)
      ),
      (snap) => {
        setNotifications(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubUser();
      unsubAccounts();
      unsubRules();
      unsubLogs();
      unsubLeads();
      unsubContacts();
      unsubStats();
      unsubNotifications();
    };
  }, [firebaseConfigured, user]);

  const updateUserPref = async (patch: Partial<UserProfile>) => {
    if (isLocalWorkspace) {
      await apiFetch('/api/local/prefs', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return;
    }
    const db = getFirebaseDb();
    if (!db || !user) return;
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleToggleLanguage = () => {
    const next: Language = language === 'en' ? 'hi' : 'en';
    setLanguage(next);
    void updateUserPref({ language: next });
  };

  const handleLanguageChange = (next: Language) => {
    setLanguage(next);
    void updateUserPref({ language: next });
  };

  const handleToggleTheme = () => {
    const next: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    void updateUserPref({ theme: next });
  };

  const handleTogglePauseAll = () => {
    const next = !pausedAll;
    setPausedAll(next);
    void updateUserPref({ pauseAllAutomations: next });
  };

  const handleCreateRule = async (
    payload: Omit<AutomationRule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (isLocalWorkspace) {
      await apiFetch('/api/local/rules', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadLocalWorkspace();
      return;
    }
    const db = getFirebaseDb();
    if (!db || !user) return;
    const now = new Date().toISOString();
    try {
      await addDoc(collection(db, 'rules'), {
        ...payload,
        userId: user.uid,
        triggerCount: 0,
        dmSentCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'rules');
    }
  };

  const handleUpdateRule = async (id: string, payload: Partial<AutomationRule>) => {
    if (isLocalWorkspace) {
      await apiFetch(`/api/local/rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await loadLocalWorkspace();
      return;
    }
    const db = getFirebaseDb();
    if (!db) return;
    try {
      await updateDoc(doc(db, 'rules', id), {
        ...payload,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rules/${id}`);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (isLocalWorkspace) {
      await apiFetch(`/api/local/rules/${id}`, { method: 'DELETE' });
      await loadLocalWorkspace();
      return;
    }
    const db = getFirebaseDb();
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'rules', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `rules/${id}`);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (isLocalWorkspace) {
      await apiFetch(`/api/local/leads/${id}`, { method: 'DELETE' });
      await loadLocalWorkspace();
      return;
    }
    const db = getFirebaseDb();
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'leads', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `leads/${id}`);
    }
  };

  const handleToggleBlockContact = async (contact: Contact) => {
    if (isLocalWorkspace) {
      await apiFetch(`/api/local/contacts/${contact.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ blocked: !contact.blocked }),
      });
      await loadLocalWorkspace();
      return;
    }
    const db = getFirebaseDb();
    if (!db) return;
    try {
      await updateDoc(doc(db, 'contacts', contact.id), {
        blocked: !contact.blocked,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `contacts/${contact.id}`);
    }
  };

  const handleDisconnectAccount = async (accountId: string) => {
    if (isLocalWorkspace) {
      await apiFetch(`/api/local/accounts/${accountId}`, { method: 'DELETE' });
      await loadLocalWorkspace();
      return;
    }
    const db = getFirebaseDb();
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'accounts', accountId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `accounts/${accountId}`);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    if (isLocalWorkspace) {
      await apiFetch(`/api/local/notifications/${id}`, { method: 'PATCH' });
      await loadLocalWorkspace();
      return;
    }
    const db = getFirebaseDb();
    if (!db) return;
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        Loading ReplyFlow...
      </div>
    );
  }

  // Only show Google Login gate once Firebase is configured
  if (firebaseConfigured && !user) {
    return (
      <LoginPage
        language={language}
        onToggleLanguage={handleToggleLanguage}
        firebaseConfigured={firebaseConfigured}
      />
    );
  }

  return (
    <Layout
      activePage={activePage}
      onNavigate={setActivePage}
      language={language}
      onToggleLanguage={handleToggleLanguage}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      pausedAll={pausedAll}
      onTogglePauseAll={handleTogglePauseAll}
      notifications={notifications}
      onMarkNotificationRead={handleMarkNotificationRead}
      userEmail={user?.email || (isLocalWorkspace ? 'Local Workspace' : undefined)}
      onSignOut={() => {
        if (firebaseConfigured) {
          void logoutUser();
        } else {
          setActivePage('settings');
        }
      }}
    >
      {activePage === 'analytics' && (
        <AnalyticsPage
          language={language}
          stats={stats}
          rules={rules}
          accounts={accounts}
          onGoToRules={() => setActivePage('rules')}
        />
      )}
      {activePage === 'rules' && (
        <RulesPage
          language={language}
          rules={rules}
          accounts={accounts}
          onCreateRule={handleCreateRule}
          onUpdateRule={handleUpdateRule}
          onDeleteRule={handleDeleteRule}
        />
      )}
      {activePage === 'testMode' && <TestModePage language={language} rules={rules} />}
      {activePage === 'logs' && <LogsPage language={language} logs={logs} />}
      {activePage === 'leads' && (
        <LeadsPage language={language} leads={leads} onDeleteLead={handleDeleteLead} />
      )}
      {activePage === 'contacts' && (
        <ContactsPage
          language={language}
          contacts={contacts}
          onToggleBlock={handleToggleBlockContact}
        />
      )}
      {activePage === 'accounts' && (
        <AccountsPage
          language={language}
          accounts={accounts}
          onDisconnect={handleDisconnectAccount}
        />
      )}
      {activePage === 'settings' && (
        <SettingsPage language={language} onLanguageChange={handleLanguageChange} />
      )}
      {activePage === 'help' && <HelpPage language={language} />}
    </Layout>
  );
}
