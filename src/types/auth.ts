import { Profile, UserRole } from './database';

export interface UserSession {
  user: {
    id: string;
    email: string;
    role: UserRole;
    full_name: string;
    customer_id?: string | null;
    avatar_url?: string | null;
  } | null;
  profile: Profile | null;
  token?: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextType extends UserSession {
  login: (email: string, password: string, requiredRole?: UserRole) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  signup: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  switchDemoRole: (role: UserRole) => void;
  isDemoMode: boolean;
}
