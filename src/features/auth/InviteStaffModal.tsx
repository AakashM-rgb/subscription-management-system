import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { UserCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext';

interface InviteStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const InviteStaffModal: React.FC<InviteStaffModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Billing Operations');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName) {
      setError('Please provide both full name and staff email address');
      return;
    }

    if (user?.role !== 'admin') {
      setError('Permission denied: Only Admins can invite staff members');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Simulate invite API / Edge function call
      await new Promise(r => setTimeout(r, 600));

      setSuccessMsg(`Invitation securely generated and dispatched to ${email}`);
      setTimeout(() => {
        setSuccessMsg(null);
        setFullName('');
        setEmail('');
        onClose();
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch staff invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite Staff Member"
      description="Add a new billing operator or account representative"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            {successMsg}
          </div>
        )}

        <Input
          label="Full Name"
          placeholder="e.g. Rahul Sen"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          required
        />

        <Input
          label="Staff Email"
          type="email"
          placeholder="rahul.sen@brightloop.io"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Assigned Role
          </label>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Staff Account</p>
              <p className="text-slate-500 text-[11px]">
                Customer management, quotations, subscriptions & invoice payment processing.
              </p>
            </div>
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">
              STAFF
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
            leftIcon={<UserCheck className="w-4 h-4" />}
          >
            Send Invitation
          </Button>
        </div>
      </form>
    </Modal>
  );
};
