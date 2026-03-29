import React, { useState, useEffect } from 'react';
import { getCollection, addToCollection, updateInCollection, recordCheque, clearCheque } from '../services/accountingService';
import { translations } from '../translations';
import { Cheque, Customer, Supplier, Account, TreasuryTransaction, Company } from '../types';
import { toast } from 'react-hot-toast';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  CreditCard,
  Building2,
  Calendar,
  User,
  ArrowUpRight,
  ArrowDownLeft,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  lang: 'ar' | 'en';
}

const Cheques: React.FC<Props> = ({ lang }) => {
  const t = translations[lang];
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'cleared' | 'rejected'>('all');
  const [filterType, setFilterType] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCheque, setEditingCheque] = useState<Cheque | null>(null);

  const [formData, setFormData] = useState({
    number: '',
    bank: '',
    amount: 0,
    dueDate: new Date().toISOString().split('T')[0],
    type: 'incoming' as 'incoming' | 'outgoing',
    status: 'pending' as 'pending' | 'cleared' | 'rejected',
    entityId: '',
    entityName: '',
    accountId: '', // Treasury/Bank account
    notes: ''
  });

  const loadData = () => {
    setCheques(getCollection<Cheque>('cheques'));
    setCustomers(getCollection<Customer>('customers'));
    setSuppliers(getCollection<Supplier>('suppliers'));
    setAccounts(getCollection<Account>('accounts'));
    setCompany(getCollection<Company>('companies')[0] || null);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    
    const entity = formData.type === 'incoming' 
      ? customers.find(c => c.id === formData.entityId)
      : suppliers.find(s => s.id === formData.entityId);

    const data = {
      ...formData,
      entityName: entity ? entity.name : '',
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingCheque) {
        updateInCollection<Cheque>('cheques', editingCheque.id, data as any);
      } else {
        const newCheque = {
          ...data,
          id: Math.random().toString(36).substr(2, 9),
          createdAt: new Date().toISOString()
        };
        addToCollection<Cheque>('cheques', newCheque as any);
        
        // Record in accounting
        await recordCheque(company.id, newCheque);
      }
      setIsModalOpen(false);
      setEditingCheque(null);
      setFormData({
        number: '',
        bank: '',
        amount: 0,
        dueDate: new Date().toISOString().split('T')[0],
        type: 'incoming',
        status: 'pending',
        entityId: '',
        entityName: '',
        accountId: '',
        notes: ''
      });
      loadData();
      toast.success(lang === 'ar' ? 'تم حفظ الشيك' : 'Cheque saved');
    } catch (error) {
      console.error("Error saving cheque:", error);
      toast.error(lang === 'ar' ? 'خطأ في حفظ الشيك' : 'Error saving cheque');
    }
  };

  const updateStatus = async (id: string, newStatus: 'cleared' | 'rejected') => {
    if (!company) return;
    try {
      if (newStatus === 'cleared') {
        await clearCheque(company.id, id);
      } else {
        updateInCollection<Cheque>('cheques', id, { 
          status: newStatus,
          updatedAt: new Date().toISOString()
        } as any);
      }
      
      loadData();
      toast.success(lang === 'ar' ? 'تم تحديث حالة الشيك' : 'Cheque status updated');
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error(lang === 'ar' ? 'خطأ في تحديث الحالة' : 'Error updating status');
    }
  };

  const filteredCheques = cheques.filter(cheque => {
    const matchesSearch = cheque.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cheque.bank.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cheque.entityName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || cheque.status === filterStatus;
    const matchesType = filterType === 'all' || cheque.type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'cleared': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'rejected': return <XCircle className="w-4 h-4 text-rose-500" />;
      default: return <Clock className="w-4 h-4 text-amber-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'cleared': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'rejected': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
      default: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    }
  };

  return (
    <div className="p-6 space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {lang === 'ar' ? 'إدارة الشيكات' : 'Cheque Management'}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            {lang === 'ar' ? 'تتبع وتحصيل الشيكات الصادرة والواردة' : 'Track and collect incoming and outgoing cheques'}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingCheque(null);
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl hover:opacity-90 transition-all font-bold"
        >
          <Plus className="w-5 h-5" />
          {lang === 'ar' ? 'إضافة شيك' : 'Add Cheque'}
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            type="text"
            placeholder={lang === 'ar' ? 'بحث برقم الشيك أو البنك...' : 'Search by cheque number or bank...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-500 outline-none transition-all"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-500 outline-none transition-all"
        >
          <option value="all">{lang === 'ar' ? 'كل الحالات' : 'All Statuses'}</option>
          <option value="pending">{lang === 'ar' ? 'قيد الانتظار' : 'Pending'}</option>
          <option value="cleared">{lang === 'ar' ? 'تم التحصيل' : 'Cleared'}</option>
          <option value="rejected">{lang === 'ar' ? 'مرفوض' : 'Rejected'}</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-500 outline-none transition-all"
        >
          <option value="all">{lang === 'ar' ? 'كل الأنواع' : 'All Types'}</option>
          <option value="incoming">{lang === 'ar' ? 'وارد' : 'Incoming'}</option>
          <option value="outgoing">{lang === 'ar' ? 'صادر' : 'Outgoing'}</option>
        </select>
      </div>

      {/* Cheques List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode='popLayout'>
          {filteredCheques.map((cheque) => (
            <motion.div
              key={cheque.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 hover:shadow-lg transition-all group relative overflow-hidden"
            >
              {/* Type Indicator */}
              <div className={`absolute top-0 right-0 w-1 h-full ${cheque.type === 'incoming' ? 'bg-emerald-500' : 'bg-rose-500'}`} />

              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${cheque.type === 'incoming' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'} dark:bg-opacity-10`}>
                    {cheque.type === 'incoming' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 dark:text-white">#{cheque.number}</h3>
                    <p className="text-xs text-zinc-500">{cheque.bank}</p>
                  </div>
                </div>
                <div className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${getStatusColor(cheque.status)}`}>
                  {getStatusIcon(cheque.status)}
                  {lang === 'ar' ? (cheque.status === 'pending' ? 'انتظار' : cheque.status === 'cleared' ? 'تم' : 'مرفوض') : cheque.status}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500 flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {cheque.entityName}
                  </span>
                  <span className="text-lg font-black text-zinc-900 dark:text-white">
                    {cheque.amount.toLocaleString()} <span className="text-xs font-normal opacity-50">EGP</span>
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {cheque.dueDate}
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {accounts.find(a => a.id === cheque.accountId)?.name || 'N/A'}
                  </span>
                </div>
              </div>

              {cheque.status === 'pending' && (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => updateStatus(cheque.id, 'cleared')}
                    className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all"
                  >
                    {lang === 'ar' ? 'تحصيل' : 'Clear'}
                  </button>
                  <button
                    onClick={() => updateStatus(cheque.id, 'rejected')}
                    className="flex-1 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-all"
                  >
                    {lang === 'ar' ? 'رفض' : 'Reject'}
                  </button>
                </div>
              )}

              <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-all">
                <button 
                  onClick={() => {
                    setEditingCheque(cheque);
                    setFormData({
                      number: cheque.number,
                      bank: cheque.bank,
                      amount: cheque.amount,
                      dueDate: cheque.dueDate,
                      type: cheque.type,
                      status: cheque.status,
                      entityId: cheque.entityId,
                      entityName: cheque.entityName,
                      accountId: cheque.accountId,
                      notes: cheque.notes || ''
                    });
                    setIsModalOpen(true);
                  }}
                  className="p-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                >
                  <MoreVertical className="w-4 h-4 text-zinc-500" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsModalOpen(false);
                setEditingCheque(null);
              }}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative m-modal !max-w-lg flex flex-col"
            >
              <div className="flex items-center justify-between p-8 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                  {editingCheque ? (lang === 'ar' ? 'تعديل شيك' : 'Edit Cheque') : (lang === 'ar' ? 'إضافة شيك جديد' : 'Add New Cheque')}
                </h2>
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingCheque(null);
                  }}
                  className="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-2xl hover:bg-zinc-200 transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{lang === 'ar' ? 'رقم الشيك' : 'Cheque Number'}</label>
                    <input
                      required
                      type="text"
                      value={formData.number}
                      onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{lang === 'ar' ? 'البنك' : 'Bank'}</label>
                    <input
                      required
                      type="text"
                      value={formData.bank}
                      onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{lang === 'ar' ? 'المبلغ' : 'Amount'}</label>
                    <input
                      required
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                      className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-4 focus:ring-primary/10 transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
                    <input
                      required
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{lang === 'ar' ? 'النوع' : 'Type'}</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any, entityId: '' })}
                      className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                    >
                      <option value="incoming">{lang === 'ar' ? 'وارد (من عميل)' : 'Incoming (from Customer)'}</option>
                      <option value="outgoing">{lang === 'ar' ? 'صادر (إلى مورد)' : 'Outgoing (to Supplier)'}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
                      {formData.type === 'incoming' ? (lang === 'ar' ? 'العميل' : 'Customer') : (lang === 'ar' ? 'المورد' : 'Supplier')}
                    </label>
                    <select
                      required
                      value={formData.entityId}
                      onChange={(e) => setFormData({ ...formData, entityId: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                    >
                      <option value="">{lang === 'ar' ? 'اختر...' : 'Select...'}</option>
                      {formData.type === 'incoming' 
                        ? customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                        : suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                      }
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{lang === 'ar' ? 'الحساب (خزينة/بنك)' : 'Account (Treasury/Bank)'}</label>
                  <select
                    required
                    value={formData.accountId}
                    onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                  >
                    <option value="">{lang === 'ar' ? 'اختر الحساب...' : 'Select Account...'}</option>
                    {accounts.filter(a => a.type === 'Asset').map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingCheque(null);
                    }}
                    className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 transition-all"
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all"
                  >
                    {editingCheque ? (lang === 'ar' ? 'حفظ التعديلات' : 'Save Changes') : (lang === 'ar' ? 'إضافة الشيك' : 'Add Cheque')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Cheques;
