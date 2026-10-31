import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Zap, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { useAuth } from './AuthContext';

export const SignupForm: React.FC = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation checks
  const hasMinLength = password.length > 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid) {
      setError('Please satisfy all password complexity requirements');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await signup(email, password, fullName, 'customer');
      if (res.success) {
        navigate('/portal');
      } else {
        setError(res.error || 'Failed to complete signup');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center space-y-2">
        <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-navy-800 border border-navy-700 shadow-lg">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <span className="font-extrabold text-white tracking-wider text-base">
            SUBFLOW
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white mt-4">
          Create Customer Account
        </h2>
        <p className="text-xs text-slate-400">
          Sign up to manage Brightloop software subscriptions and licenses
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full Name"
              placeholder="e.g. Alex Mercer"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              leftIcon={<User className="w-4 h-4" />}
              required
            />

            <Input
              label="Corporate Email Address"
              type="email"
              placeholder="alex.mercer@apextech.io"
              value={email}
              onChange={e => setEmail(e.target.value)}
              leftIcon={<Mail className="w-4 h-4" />}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              leftIcon={<Lock className="w-4 h-4" />}
              required
            />

            {/* Realtime Password Complexity Indicator */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <span className="font-semibold text-slate-700 block text-[11px] uppercase tracking-wider">
                Password Security Requirements:
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div
                  className={`flex items-center gap-1.5 ${
                    hasMinLength ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {hasMinLength ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-slate-300" />
                  )}
                  <span>&gt; 8 Characters</span>
                </div>

                <div
                  className={`flex items-center gap-1.5 ${
                    hasUppercase ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {hasUppercase ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-slate-300" />
                  )}
                  <span>Uppercase (A-Z)</span>
                </div>

                <div
                  className={`flex items-center gap-1.5 ${
                    hasLowercase ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {hasLowercase ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-slate-300" />
                  )}
                  <span>Lowercase (a-z)</span>
                </div>

                <div
                  className={`flex items-center gap-1.5 ${
                    hasSpecial ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {hasSpecial ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-slate-300" />
                  )}
                  <span>Special Char (!@#$)</span>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={!isPasswordValid || !fullName || !email}
              isLoading={loading}
              className="w-full mt-2"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Complete Registration
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-blue-600 hover:underline">
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
