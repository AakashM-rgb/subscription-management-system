import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Zap, ArrowRight, ShieldCheck, User } from 'lucide-react';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { useAuth } from './AuthContext';
import { ForgotPasswordModal } from './ForgotPasswordModal';

export const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const { login, switchDemoRole } = useAuth();

  const [email, setEmail] = useState('admin@brightloop.io');
  const [password, setPassword] = useState('Brightloop#2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await login(email, password);
      if (res.success) {
        if (email.includes('alex') || email.includes('customer')) {
          navigate('/portal');
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(res.error || 'Invalid credentials');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoPreset = (type: 'admin' | 'staff' | 'customer') => {
    switchDemoRole(type);
    if (type === 'admin') {
      setEmail('admin@brightloop.io');
      setPassword('Admin@Secure2026!');
    } else if (type === 'staff') {
      setEmail('billing.ops@brightloop.io');
      setPassword('Staff@Ops2026!');
    } else {
      setEmail('alex.mercer@apextech.io');
      setPassword('Customer@Apex2026!');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center space-y-2">
        <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-navy-800 border border-navy-700 shadow-lg">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <span className="font-extrabold text-white tracking-wider text-base">
            SUBFLOW
          </span>
          <span className="text-[10px] bg-blue-500/20 text-cyan-300 font-semibold px-2 py-0.5 rounded">
            Brightloop Software
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white mt-4">
          Enterprise Subscription Management
        </h2>
        <p className="text-xs text-slate-400">
          Sign in to manage recurring billing, contracts and quotations
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          {/* Quick Demo Fill Buttons */}
          <div className="mb-6 pb-5 border-b border-slate-100">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2 text-center">
              Quick Role Login (One-Click)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleDemoPreset('admin')}
                className="py-1.5 px-2 text-xs font-semibold rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => handleDemoPreset('staff')}
                className="py-1.5 px-2 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
              >
                Staff
              </button>
              <button
                type="button"
                onClick={() => handleDemoPreset('customer')}
                className="py-1.5 px-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 transition-colors"
              >
                Customer
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              leftIcon={<Mail className="w-4 h-4" />}
              required
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setForgotModalOpen(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              isLoading={loading}
              className="w-full mt-2"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to Subflow
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-blue-600 hover:underline">
              Create customer account
            </Link>
          </div>
        </div>
      </div>

      <ForgotPasswordModal
        isOpen={forgotModalOpen}
        onClose={() => setForgotModalOpen(false)}
      />
    </div>
  );
};
