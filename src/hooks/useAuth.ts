import { useState, useEffect } from 'react';
import { UserProfile, Company } from '../types';

// Mock User type to replace Firebase User
export interface MockUser {
  uid: string;
  email: string;
  displayName: string;
}

export const useAuth = () => {
  const [user, setUser] = useState<MockUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for local session
    const customUserJson = localStorage.getItem('makhzanak_session');
    if (customUserJson) {
      const session = JSON.parse(customUserJson);
      setUser(session.user);
      setProfile(session.profile);
    }
    setLoading(false);
  }, []);

  const signUp = async (email: string, pass: string, name: string, phone: string) => {
    const uid = Math.random().toString(36).substring(7);
    const companyId = 'company_' + Math.random().toString(36).substring(7);
    
    const newProfile: UserProfile = {
      uid,
      email,
      displayName: name,
      phoneNumber: phone,
      role: 'admin',
      companyId: companyId,
      permissions: ['all'],
      createdAt: new Date().toISOString()
    };

    const simulatedUser: MockUser = {
      uid,
      email,
      displayName: name,
    };

    const session = {
      user: simulatedUser,
      profile: newProfile
    };

    localStorage.setItem('makhzanak_session', JSON.stringify(session));
    setUser(simulatedUser);
    setProfile(newProfile);
    return simulatedUser;
  };

  const signIn = async (email: string, pass: string) => {
    // Allow immediate entry without verification as requested
    const uid = 'user_' + Math.random().toString(36).substring(7);
    const companyId = 'company_default';
    
    const userData: UserProfile = {
      uid,
      email,
      displayName: email.split('@')[0],
      role: 'admin',
      companyId: companyId,
      permissions: ['all'],
      createdAt: new Date().toISOString()
    };

    const simulatedUser: MockUser = {
      uid,
      email,
      displayName: userData.displayName,
    };

    const session = {
      user: simulatedUser,
      profile: userData
    };

    localStorage.setItem('makhzanak_session', JSON.stringify(session));
    setUser(simulatedUser);
    setProfile(userData);
    setLoading(false);
    return simulatedUser;
  };

  const signOut = async () => {
    localStorage.removeItem('makhzanak_session');
    setUser(null);
    setProfile(null);
  };

  return { user, profile, loading, signUp, signIn, signOut };
};
