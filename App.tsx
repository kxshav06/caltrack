/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, db, doc, collection, onSnapshot, setDoc, auth } from './lib/firebase';
import { UserProfile, FoodLog, ActivityLog, WeightLog } from './types';

// Subcomponents
import Auth from './components/Auth';
import Onboarding from './components/Onboarding';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import LogFood from './components/LogFood';
import LogActivity from './components/LogActivity';
import History from './components/History';
import Profile from './components/Profile';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // User States
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Collections States
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);

  // Navigation state
  const [activeTab, setActiveTab] = useState<string>('home');

  // 1. Subscribe to Auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      
      // Reset states on logout
      if (!user) {
        setProfile(null);
        setProfileLoading(true);
        setFoodLogs([]);
        setActivityLogs([]);
        setWeightLogs([]);
        setActiveTab('home');
      }
    });
    return () => unsubscribe();
  }, []);

  // Use primitive UID for collection subscriptions to prevent stale callbacks and infinite triggers
  const uid = currentUser?.uid;

  // 2. Subscribe to Profile changes once logged in
  useEffect(() => {
    if (!uid) {
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const profileRef = doc(db, `users/${uid}`);
    
    const unsubscribe = onSnapshot(profileRef, (snapshot: any) => {
      if (snapshot.exists()) {
        setProfile(snapshot.data());
      } else {
        setProfile(null);
      }
      setProfileLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  // 3. Subscribe to Food, Activity, and Weight logs reactively
  useEffect(() => {
    if (!uid || !profile?.onboarded) return;

    // Food logs
    const foodRef = collection(db, `users/${uid}/foodLogs`);
    const unsubFood = onSnapshot(foodRef, (snapshot: any) => {
      const logs: FoodLog[] = [];
      snapshot.forEach((docSnap: any) => {
        logs.push({ id: docSnap.id, ...docSnap.data() });
      });
      setFoodLogs(logs);
    });

    // Activity logs
    const actRef = collection(db, `users/${uid}/activityLogs`);
    const unsubAct = onSnapshot(actRef, (snapshot: any) => {
      const logs: ActivityLog[] = [];
      snapshot.forEach((docSnap: any) => {
        logs.push({ id: docSnap.id, ...docSnap.data() });
      });
      setActivityLogs(logs);
    });

    // Weight logs
    const weightRef = collection(db, `users/${uid}/weightLogs`);
    const unsubWeight = onSnapshot(weightRef, (snapshot: any) => {
      const logs: WeightLog[] = [];
      snapshot.forEach((docSnap: any) => {
        logs.push({ id: docSnap.id, ...docSnap.data() });
      });
      setWeightLogs(logs);
    });

    return () => {
      unsubFood();
      unsubAct();
      unsubWeight();
    };
  }, [uid, profile?.onboarded]);

  // Handle saving the completed Onboarding profile stats
  const handleSaveProfile = async (newProfile: UserProfile) => {
    if (!uid) return;
    try {
      const profileRef = doc(db, `users/${uid}`);
      await setDoc(profileRef, newProfile);
      setProfile(newProfile);
    } catch (err) {
      console.error('Error saving onboarding profile:', err);
    }
  };

  // Render core views based on current state
  if (authLoading || (uid && profileLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-emerald-500 animate-spin" />
          <div className="w-2 h-2 rounded-full bg-emerald-500 absolute inset-0 m-auto animate-ping" />
        </div>
        <span className="text-xs text-slate-400 mt-4 uppercase tracking-widest font-bold">
          CalTrack Loading
        </span>
      </div>
    );
  }

  // Not Logged In -> render login/signup
  if (!uid) {
    return <Auth />;
  }

  // Logged In, but hasn't completed biometric onboarding survey
  if (!profile || !profile.onboarded) {
    return <Onboarding uid={uid} onSave={handleSaveProfile} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-col-reverse justify-between pb-16 md:pb-0">
      {/* Scrollable content container */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'home' && (
          <Dashboard
            profile={profile}
            foodLogs={foodLogs}
            activityLogs={activityLogs}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'food' && (
          <LogFood
            uid={uid}
            onSuccess={() => setActiveTab('home')}
            profile={profile || undefined}
            foodLogs={foodLogs}
            activityLogs={activityLogs}
          />
        )}

        {activeTab === 'activity' && (
          <LogActivity
            uid={uid}
            profile={profile}
            activityLogs={activityLogs}
            onSuccess={() => setActiveTab('home')}
          />
        )}

        {activeTab === 'history' && (
          <History
            uid={uid}
            profile={profile}
            foodLogs={foodLogs}
            activityLogs={activityLogs}
            weightLogs={weightLogs}
            onSuccess={() => {}}
          />
        )}

        {activeTab === 'profile' && (
          <Profile
            profile={profile}
            onUpdate={handleSaveProfile}
          />
        )}
      </main>

      {/* Navigation footer (sticky/bottom) */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
