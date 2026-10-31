import React, { useState, useEffect } from 'react';
import { Building2, Mail, Phone, MapPin, ShieldCheck, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useAuth } from '../auth/AuthContext';
import { SubflowStore } from '../../services/mockData';
import { Customer } from '../../types/database';

export const CustomerPortalProfile: React.FC = () => {
  const { user } = useAuth();
  const customerId = user?.customer_id || 'c0000000-0000-0000-0000-000000000001';

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [phone, setPhone] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    const cust = SubflowStore.getCustomers().find(c => c.id === customerId);
    if (cust) {
      setCustomer(cust);
      setPhone(cust.phone || '');
      setBillingAddress(cust.billing_address || '');
      setCity(cust.city || '');
      setState(cust.state || '');
      setPostalCode(cust.postal_code || '');
    }
  }, [customerId]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;

    const updated: Customer = {
      ...customer,
      phone,
      billing_address: billingAddress,
      city,
      state,
      postal_code: postalCode,
      updated_at: new Date().toISOString(),
    };

    SubflowStore.saveCustomer(updated);
    setCustomer(updated);
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 4000);
  };

  if (!customer) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Billing Profile & Organization Details
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage corporate billing address, tax identifier, and notification preferences
        </p>
      </div>

      {savedMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 font-medium">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Profile changes updated successfully.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Company & Tax Registration
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Company Name</label>
              <input
                disabled
                value={customer.company || customer.name}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-600 font-semibold cursor-not-allowed"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Managed by administrator</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">GSTIN / Tax ID</label>
              <input
                disabled
                value={customer.tax_id || 'Not Registered'}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono text-slate-600 cursor-not-allowed"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Verified tax registration</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Billing & Contact Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Contact Phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
            <Input
              label="Billing Street Address"
              value={billingAddress}
              onChange={e => setBillingAddress(e.target.value)}
              placeholder="104 Tech Valley, Phase 2"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="City"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="Bengaluru"
            />
            <Input
              label="State"
              value={state}
              onChange={e => setState(e.target.value)}
              placeholder="Karnataka"
            />
            <Input
              label="Postal Code"
              value={postalCode}
              onChange={e => setPostalCode(e.target.value)}
              placeholder="560100"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <Button type="submit" variant="primary">
              Save Profile Changes
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
};
