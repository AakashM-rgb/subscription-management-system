import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthContextType, UserSession } from '../../types/auth';
import { Profile, UserRole } from '../../types/database';
import { supabase, isSupabaseConfigured } from '../../services/supabase';

const DEMO_PROFILES: Record<UserRole, Profile> = {
  admin: {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'admin@brightloop.io',
    full_name: 'Vikram Mehta (Lead Architect & Admin)',
    role: 'admin',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  staff: {
    id: 'a0000000-0000-0000-0000-000000000002',
    email: 'billing.ops@brightloop.io',
    full_name: 'Ananya Rao (Billing & Operations)',
    role: 'staff',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  customer: {
    id: 'a0000000-0000-0000-0000-000000000003',
    email: 'alex.mercer@apextech.io',
    full_name: 'Alex Mercer (Apex Dynamics Ltd)',
    role: 'customer',
    customer_id: 'c0000000-0000-0000-0000-000000000001',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    return (localStorage.getItem('subflow_demo_role') as UserRole) || 'admin';
  });

  const [session, setSession] = useState<UserSession>({
    user: null,
    profile: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    const initAuth = async () => {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data: { session: sbSession } } = await supabase.auth.getSession();
          if (sbSession?.user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', sbSession.user.id)
              .single();

            if (profile) {
              setSession({
                user: {
                  id: profile.id,
                  email: profile.email,
                  role: profile.role,
                  full_name: profile.full_name,
                  customer_id: profile.customer_id,
                  avatar_url: profile.avatar_url,
                },
                profile,
                token: sbSession.access_token,
                isLoading: false,
                isAuthenticated: true,
              });
              return;
            }
          }
        } catch (e) {
          console.warn('Supabase session load error, falling back to demo mode:', e);
        }
      }

      // Default demo session
      const profile = DEMO_PROFILES[currentRole];
      setSession({
        user: {
          id: profile.id,
          email: profile.email,
          role: profile.role,
          full_name: profile.full_name,
          customer_id: profile.customer_id,
          avatar_url: profile.avatar_url,
        },
        profile,
        token: 'demo-jwt-token-brightloop',
        isLoading: false,
        isAuthenticated: true,
      });
    };

    initAuth();
  }, [currentRole]);

  const switchDemoRole = (role: UserRole) => {
    setCurrentRole(role);
    localStorage.setItem('subflow_demo_role', role);
    const profile = DEMO_PROFILES[role];
    setSession(prev => ({
      ...prev,
      user: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        full_name: profile.full_name,
        customer_id: profile.customer_id,
        avatar_url: profile.avatar_url,
      },
      profile,
      isAuthenticated: true,
    }));
  };

  const login = async (email: string, password: string) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { success: false, error: error.message };

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profile) {
        setSession({
          user: profile,
          profile,
          token: data.session.access_token,
          isLoading: false,
          isAuthenticated: true,
        });
      }
      return { success: true };
    }

    // Demo mode login
    if (email.includes('staff')) switchDemoRole('staff');
    else if (email.includes('alex') || email.includes('customer')) switchDemoRole('customer');
    else switchDemoRole('admin');
    return { success: true };
  };

  const signup = async (
    email: string,
    password: string,
    fullName: string,
    role: UserRole = 'customer'
  ) => {
    // Password strength check according to requirements:
    // > 8 characters, uppercase, lowercase, special characters
    if (password.length <= 8) {
      return { success: false, error: 'Password must be longer than 8 characters' };
    }
    if (!/[A-Z]/.test(password)) {
      return { success: false, error: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
      return { success: false, error: 'Password must contain at least one lowercase letter' };
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return { success: false, error: 'Password must contain at least one special character' };
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
        },
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    }

    // Demo signup
    switchDemoRole(role);
    return { success: true };
  };

  const logout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setSession({
      user: null,
      profile: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
    });
  };

  const resetPasswordForEmail = async (email: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) return { success: false, error: error.message };
    }
    return { success: true };
  };

  const updatePassword = async (newPassword: string) => {
    if (newPassword.length <= 8) {
      return { success: false, error: 'Password must be longer than 8 characters' };
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      return { success: false, error: 'Password must contain uppercase, lowercase and special character' };
    }
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { success: false, error: error.message };
    }
    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{
        ...session,
        login,
        signup,
        logout,
        resetPasswordForEmail,
        updatePassword,
        switchDemoRole,
        isDemoMode: !isSupabaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
