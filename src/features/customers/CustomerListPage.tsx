import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Search,
  Plus,
  Mail,
  Building2,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { StatusBadge } from '../../components/common/Badge';
import { Customer } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { CustomerFormModal } from './CustomerFormModal';
import { formatDate } from '../../lib/date';

export const CustomerListPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadCustomers = () => {
    setCustomers(SubflowStore.getCustomers());
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const filtered = customers.filter(c => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase())) ||
      (c.tax_id && c.tax_id.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Customer Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage enterprise accounts, billing addresses, and subscription portfolios
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setIsModalOpen(true)}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Add Customer
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full relative">
            <Input
              placeholder="Search by name, email, company or GSTIN..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Accounts</option>
              <option value="inactive">Inactive Accounts</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Customers Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Customer Name</th>
                <th className="px-4 py-3.5">Company & Tax ID</th>
                <th className="px-4 py-3.5">Contact Email</th>
                <th className="px-4 py-3.5">Country</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5">Joined Date</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(cust => (
                <tr
                  key={cust.id}
                  className="hover:bg-slate-50/60 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <Link
                      to={`/customers/${cust.id}`}
                      className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5"
                    >
                      <span>{cust.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <span className="font-medium block">{cust.company || '—'}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {cust.tax_id || 'No GSTIN'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{cust.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {cust.city ? `${cust.city}, ${cust.country}` : cust.country}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <StatusBadge status={cust.status} />
                  </td>
                  <td className="px-4 py-4 text-slate-500">
                    {formatDate(cust.created_at)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/customers/${cust.id}`}>
                      <Button size="sm" variant="ghost">
                        View Details
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    No customers found matching the search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      <CustomerFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={loadCustomers}
      />
    </div>
  );
};
