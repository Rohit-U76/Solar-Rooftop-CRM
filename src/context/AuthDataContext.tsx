import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase.ts';
import { ensureWorkspaceSeeded } from '../lib/seedData.ts';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../shared/solarEngine.ts';
import type {
  AdminConfigRuleDoc,
  BillExtractionDoc,
  ElectricityBillDoc,
  LeadContactPiiDoc,
  LeadScoreDoc,
  NotificationDoc,
  SolarLeadDoc,
  SolarProjectDoc,
  SolarQuotationDoc,
  SupportedLanguage,
  UserProfileDoc,
  WorkspaceMode,
} from '../types/domain.ts';

const PREFERRED_MODE_STORAGE_PREFIX = 'suryasetu_pref_workspace_';
const THEME_STORAGE_KEY = 'suryasetu_theme';

export type ThemeMode = 'light' | 'dark';

interface AuthDataContextValue {
  firebaseUser: User | null;
  profile: UserProfileDoc | null;
  authReady: boolean;
  dataLoading: boolean;
  needsEmailVerification: boolean;
  isBootstrappedAdmin: boolean;
  workspaceMode: WorkspaceMode;
  language: SupportedLanguage;
  theme: ThemeMode;
  leads: SolarLeadDoc[];
  leadContacts: Record<string, LeadContactPiiDoc>;
  bills: Record<string, ElectricityBillDoc>;
  extractions: Record<string, BillExtractionDoc>;
  scores: Record<string, LeadScoreDoc>;
  adminRules: AdminConfigRuleDoc[];
  quotations: SolarQuotationDoc[];
  projects: SolarProjectDoc[];
  notifications: NotificationDoc[];
  unreadCount: number;
  signInWithGoogle: (preferredMode?: WorkspaceMode) => Promise<void>;
  signInWithEmail: (
    email: string,
    password: string,
    preferredMode?: WorkspaceMode
  ) => Promise<{ emailVerified: boolean }>;
  signUpWithEmail: (params: {
    fullName: string;
    email: string;
    password: string;
    preferredMode?: WorkspaceMode;
  }) => Promise<{ emailVerified: boolean }>;
  resendVerificationEmail: () => Promise<void>;
  refreshEmailVerificationStatus: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  switchWorkspaceMode: (mode: WorkspaceMode) => Promise<void>;
  switchLanguage: (lang: SupportedLanguage) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  reseedDemoData: () => Promise<boolean>;
  logSimulatedNotification: (params: {
    recipientUid: string;
    assignedStaffUids: string[];
    channel: NotificationDoc['channel'];
    eventType: NotificationDoc['eventType'];
    referenceCode: string;
    maskedRecipientPhone: string;
    title: string;
    message: string;
  }) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
}

const AuthDataContext = createContext<AuthDataContextValue | undefined>(undefined);

export function AuthDataProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [verificationTick, setVerificationTick] = useState<number>(0);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write errors in restricted iframes
    }
  }, [theme]);

  const setThemeMode = (mode: ThemeMode) => {
    setTheme(mode);
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const [leads, setLeads] = useState<SolarLeadDoc[]>([]);
  const [leadContacts, setLeadContacts] = useState<Record<string, LeadContactPiiDoc>>({});
  const [bills, setBills] = useState<Record<string, ElectricityBillDoc>>({});
  const [extractions, setExtractions] = useState<Record<string, BillExtractionDoc>>({});
  const [scores, setScores] = useState<Record<string, LeadScoreDoc>>({});
  const [adminRules, setAdminRules] = useState<AdminConfigRuleDoc[]>([]);
  const [quotations, setQuotations] = useState<SolarQuotationDoc[]>([]);
  const [projects, setProjects] = useState<SolarProjectDoc[]>([]);
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);

  const needsEmailVerification = Boolean(firebaseUser && !firebaseUser.emailVerified);

  const isBootstrappedAdmin = useMemo(() => {
    return (
      Boolean(firebaseUser?.emailVerified) &&
      firebaseUser?.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
    );
  }, [firebaseUser, verificationTick]);

  // 1. Auth & User Profile Bootstrap (Strict Zero-Trust Verified Email Gate)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setLeads([]);
        setLeadContacts({});
        setBills({});
        setExtractions({});
        setScores({});
        setAdminRules([]);
        setQuotations([]);
        setProjects([]);
        setNotifications([]);
        setAuthReady(true);
        setDataLoading(false);
        return;
      }

      // Gate Firestore operations until email_verified == true (required by security rules)
      if (!user.emailVerified) {
        setProfile(null);
        setAuthReady(true);
        setDataLoading(false);
        return;
      }

      setDataLoading(true);
      const userDocRef = doc(db, 'users', user.uid);
      const isGlobalAdmin =
        Boolean(user.emailVerified) &&
        user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

      let storedPreferredMode: WorkspaceMode | null = null;
      try {
        const rawPref = localStorage.getItem(`${PREFERRED_MODE_STORAGE_PREFIX}${user.uid}`);
        if (rawPref === 'HOMEOWNER' || rawPref === 'SALES') {
          storedPreferredMode = rawPref;
        }
      } catch {
        // Ignore storage read errors in restricted iframes
      }

      try {
        const snap = await getDoc(userDocRef);
        if (!snap.exists()) {
          const initialWorkspace: WorkspaceMode =
            storedPreferredMode ?? (isGlobalAdmin ? 'SALES' : 'HOMEOWNER');
          const initialProfile: UserProfileDoc = {
            uid: user.uid,
            displayName: (
              user.displayName ||
              user.email?.split('@')[0] ||
              'SuryaSetu User'
            ).slice(0, 120),
            role: isGlobalAdmin ? 'ADMIN' : 'HOMEOWNER',
            activeWorkspace: initialWorkspace,
            preferredLanguage: 'en',
          };
          await setDoc(userDocRef, {
            ...initialProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await setDoc(doc(db, 'user_private', user.uid), {
            uid: user.uid,
            email: (user.email || '').slice(0, 160),
            phone: '',
            dpdpConsentAccepted: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setProfile(initialProfile);
        } else {
          setProfile(snap.data() as UserProfileDoc);
        }

        try {
          localStorage.removeItem(`${PREFERRED_MODE_STORAGE_PREFIX}${user.uid}`);
        } catch {
          // Ignore storage cleanup errors
        }

        // Seed sample leads (LD-30881, LD-30902, LD-30915), rules, quotes & projects if empty
        await ensureWorkspaceSeeded(user.uid, user.email);
      } catch (error) {
        console.error('Profile / seed initialization warning:', error);
      } finally {
        setAuthReady(true);
        setDataLoading(false);
      }
    });

    return () => unsubscribe();
  }, [verificationTick]);

  // 2. Real-Time Firestore Listeners (Strictly aligned with Zero-Trust list rules)
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified || !profile) {
      return;
    }

    const uid = firebaseUser.uid;
    const mode = profile.activeWorkspace;
    const unsubs: Array<() => void> = [];

    const buildScopedQuery = (colName: string) => {
      if (mode === 'SALES') {
        if (isBootstrappedAdmin) {
          return query(collection(db, colName));
        }
        return query(collection(db, colName), where('assignedStaffUids', 'array-contains', uid));
      }
      return query(collection(db, colName), where('ownerUid', '==', uid));
    };

    // Leads
    unsubs.push(
      onSnapshot(
        buildScopedQuery('leads'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SolarLeadDoc, 'id'>) }));
          items.sort((a, b) => b.leadNumber.localeCompare(a.leadNumber));
          setLeads(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'leads')
      )
    );

    // Lead Contacts PII
    unsubs.push(
      onSnapshot(
        buildScopedQuery('lead_contacts'),
        (snap) => {
          const map: Record<string, LeadContactPiiDoc> = {};
          snap.docs.forEach((d) => {
            const data = { id: d.id, ...(d.data() as Omit<LeadContactPiiDoc, 'id'>) };
            map[data.leadId] = data;
          });
          setLeadContacts(map);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'lead_contacts')
      )
    );

    // Electricity Bills
    unsubs.push(
      onSnapshot(
        buildScopedQuery('electricity_bills'),
        (snap) => {
          const map: Record<string, ElectricityBillDoc> = {};
          snap.docs.forEach((d) => {
            const data = { id: d.id, ...(d.data() as Omit<ElectricityBillDoc, 'id'>) };
            map[data.leadId] = data;
          });
          setBills(map);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'electricity_bills')
      )
    );

    // Bill Extractions
    unsubs.push(
      onSnapshot(
        buildScopedQuery('bill_extractions'),
        (snap) => {
          const map: Record<string, BillExtractionDoc> = {};
          snap.docs.forEach((d) => {
            const data = { id: d.id, ...(d.data() as Omit<BillExtractionDoc, 'id'>) };
            map[data.leadId] = data;
          });
          setExtractions(map);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'bill_extractions')
      )
    );

    // Lead Scores
    unsubs.push(
      onSnapshot(
        buildScopedQuery('lead_scores'),
        (snap) => {
          const map: Record<string, LeadScoreDoc> = {};
          snap.docs.forEach((d) => {
            const data = { id: d.id, ...(d.data() as Omit<LeadScoreDoc, 'id'>) };
            map[data.leadId] = data;
          });
          setScores(map);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'lead_scores')
      )
    );

    // Admin Config Rules
    const rulesScope = isBootstrappedAdmin ? 'global' : uid;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'admin_rules'), where('workspaceScope', '==', rulesScope)),
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AdminConfigRuleDoc, 'id'>),
          }));
          list.sort((a, b) => b.versionNumber - a.versionNumber);
          setAdminRules(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'admin_rules')
      )
    );

    // Quotations
    unsubs.push(
      onSnapshot(
        buildScopedQuery('quotations'),
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SolarQuotationDoc, 'id'>),
          }));
          list.sort((a, b) => b.quotationDate.localeCompare(a.quotationDate));
          setQuotations(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'quotations')
      )
    );

    // Projects
    unsubs.push(
      onSnapshot(
        buildScopedQuery('projects'),
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SolarProjectDoc, 'id'>),
          }));
          list.sort((a, b) => b.projectNumber.localeCompare(a.projectNumber));
          setProjects(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'projects')
      )
    );

    // Notifications
    const notifQuery =
      mode === 'SALES' && isBootstrappedAdmin
        ? query(collection(db, 'notifications'))
        : query(collection(db, 'notifications'), where('recipientUid', '==', uid));
    unsubs.push(
      onSnapshot(
        notifQuery,
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<NotificationDoc, 'id'>),
          }));
          setNotifications(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
      )
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, firebaseUser, profile, isBootstrappedAdmin]);

  const savePreferredMode = (uid: string, preferredMode?: WorkspaceMode) => {
    if (!preferredMode) return;
    try {
      localStorage.setItem(`${PREFERRED_MODE_STORAGE_PREFIX}${uid}`, preferredMode);
    } catch {
      // Ignore storage write errors
    }
  };

  const applyPreferredModeToExistingUser = async (uid: string, preferredMode?: WorkspaceMode) => {
    if (!preferredMode) return;
    savePreferredMode(uid, preferredMode);
    const userDocRef = doc(db, 'users', uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      await updateDoc(userDocRef, {
        activeWorkspace: preferredMode,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) => (prev ? { ...prev, activeWorkspace: preferredMode } : prev));
    }
  };

  const signInWithGoogle = async (preferredMode?: WorkspaceMode) => {
    const cred = await signInWithPopup(auth, googleProvider);
    if (preferredMode && cred.user && cred.user.emailVerified) {
      await applyPreferredModeToExistingUser(cred.user.uid, preferredMode);
    }
  };

  const signInWithEmail = async (
    email: string,
    password: string,
    preferredMode?: WorkspaceMode
  ): Promise<{ emailVerified: boolean }> => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await cred.user.reload();
    if (preferredMode) {
      savePreferredMode(cred.user.uid, preferredMode);
    }
    if (cred.user.emailVerified) {
      await cred.user.getIdToken(true);
      await applyPreferredModeToExistingUser(cred.user.uid, preferredMode);
      setVerificationTick((t) => t + 1);
      return { emailVerified: true };
    }
    return { emailVerified: false };
  };

  const signUpWithEmail: AuthDataContextValue['signUpWithEmail'] = async ({
    fullName,
    email,
    password,
    preferredMode,
  }) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const cleanName = fullName.trim().slice(0, 120);
    if (cleanName) {
      await updateProfile(cred.user, { displayName: cleanName });
    }
    if (preferredMode) {
      savePreferredMode(cred.user.uid, preferredMode);
    }
    await sendEmailVerification(cred.user);
    return { emailVerified: Boolean(cred.user.emailVerified) };
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) {
      throw new Error('No active account session found. Please sign in again.');
    }
    await sendEmailVerification(auth.currentUser);
  };

  const refreshEmailVerificationStatus = async (): Promise<boolean> => {
    if (!auth.currentUser) {
      return false;
    }
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      // Force fresh ID token so request.auth.token.email_verified == true in Firestore rules
      await auth.currentUser.getIdToken(true);
      setFirebaseUser(auth.currentUser);
      setVerificationTick((t) => t + 1);
      return true;
    }
    return false;
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const signOutUser = async () => {
    await firebaseSignOut(auth);
  };

  const switchWorkspaceMode = async (mode: WorkspaceMode) => {
    if (!firebaseUser || !profile) return;
    const path = `users/${firebaseUser.uid}`;
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        activeWorkspace: mode,
        updatedAt: serverTimestamp(),
      });
      setProfile({ ...profile, activeWorkspace: mode });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const switchLanguage = async (lang: SupportedLanguage) => {
    if (!firebaseUser || !profile) return;
    const path = `users/${firebaseUser.uid}`;
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        preferredLanguage: lang,
        updatedAt: serverTimestamp(),
      });
      setProfile({ ...profile, preferredLanguage: lang });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const reseedDemoData = async () => {
    if (!firebaseUser || !firebaseUser.emailVerified) return false;
    return ensureWorkspaceSeeded(firebaseUser.uid, firebaseUser.email);
  };

  const logSimulatedNotification: AuthDataContextValue['logSimulatedNotification'] = async (
    params
  ) => {
    const id = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, 'notifications', id), {
        recipientUid: params.recipientUid,
        assignedStaffUids: params.assignedStaffUids.slice(0, 10),
        channel: params.channel,
        eventType: params.eventType,
        referenceCode: params.referenceCode.slice(0, 40),
        maskedRecipientPhone: params.maskedRecipientPhone.slice(0, 20),
        title: params.title.slice(0, 140),
        message: params.message.slice(0, 600),
        isRead: false,
        isSimulation: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `notifications/${id}`);
    }
  };

  const markNotificationRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        isRead: true,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
    }
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  return (
    <AuthDataContext.Provider
      value={{
        firebaseUser,
        profile,
        authReady,
        dataLoading,
        needsEmailVerification,
        isBootstrappedAdmin,
        workspaceMode: profile?.activeWorkspace ?? 'HOMEOWNER',
        language: profile?.preferredLanguage ?? 'en',
        theme,
        leads,
        leadContacts,
        bills,
        extractions,
        scores,
        adminRules,
        quotations,
        projects,
        notifications,
        unreadCount,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resendVerificationEmail,
        refreshEmailVerificationStatus,
        sendPasswordReset,
        signOutUser,
        switchWorkspaceMode,
        switchLanguage,
        setThemeMode,
        toggleTheme,
        reseedDemoData,
        logSimulatedNotification,
        markNotificationRead,
      }}
    >
      {children}
    </AuthDataContext.Provider>
  );
}

export function useAuthData(): AuthDataContextValue {
  const ctx = useContext(AuthDataContext);
  if (!ctx) {
    throw new Error('useAuthData must be used inside AuthDataProvider');
  }
  return ctx;
}
