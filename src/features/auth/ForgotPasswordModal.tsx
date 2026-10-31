import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { useAuth } from './AuthContext';
import { Mail, CheckCircle2 } from 'lucide-react';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please provide your account email address');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await resetPasswordForEmail(email);
      if (res.success) {
        setSent(true);
      } else {
        setError(res.error || 'Failed to dispatch reset email');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reset Account Password"
      description="We'll send a secure password recovery link to your registered email"
      maxWidth="md"
    >
      {sent ? (
        <div className="text-center py-6 space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">Recovery Link Dispatched</h4>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            If an account exists for <span className="font-semibold text-slate-800">{email}</span>, you will receive password reset instructions.
          </p>
          <Button variant="secondary" onClick={onClose} className="mt-2">
            Return to Login
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          <Input
            label="Corporate Email Address"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
            required
          />
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={loading}>
              Send Recovery Link
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
