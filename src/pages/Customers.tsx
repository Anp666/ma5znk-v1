import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Mail, Phone, MapPin, Edit2, Trash2, CreditCard, History, TrendingUp, Wallet, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translations } from '../translations';
import { toast } from 'react-hot-toast';
import { recordCustomerPayment, getCollection, addToCollection, updateInCollection, deleteFromCollection } from '../services/accountingService';
import { Account, Customer, Payment } from '../types';
import { useAuth } from '../hooks/useAuth';
import { getCurrencySymbol } from '../utils/currency';

import Pagination from '../components/Pagination';

interface Props {
  lang: 'ar' | 'en';
  profile: any;
}

export default function Customers({ lang, profile }: Props) {
  const { user } = useAuth();
  const t = translations[lang];
  const currencySymbol = getCurrencySymbol(profile?.currency, lang);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
  
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    method: 'cash' as const,
    notes: '',
    accountId: ''
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9;
  const [formData, setFormData] = useState<Customer>({
    name: '',
    email: '',
    phone: '',
    address: '',
    balance: 0,
    totalPurchases: 0,
    totalPaid: 0,
    companyId: profile?.companyId || ''
  });

  useEffect(() => {
    const loadData = () => {
      setCustomers(getCollection<Customer>('customers'));
      setAccounts(getCollection<Account>('accounts').filter((a: any) => a.type === 'Asset'));
    };
    loadData();
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, []);

  const fetchPaymentHistory = (customerId: string) => {
    const payments = getCollection<Payment>('payments').filter((p: any) => p.customerId === customerId);
    setPaymentHistory(payments.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedCustomer.id || !paymentData.accountId || !user) return;

    try {
      await recordCustomerPayment(
        profile.companyId,
        selectedCustomer.id,
        paymentData.amount,
        paymentData.method,
        paymentData.notes,
        paymentData.accountId,
        user.uid
      );
      setCustomers(getCollection<Customer>('customers'));
      toast.success(lang === 'ar' ? 'تم تسجيل الدفعة بنجاح' : 'Payment recorded successfully');
      setIsPaymentModalOpen(false);
      setPaymentData({ amount: 0, method: 'cash', notes: '', accountId: '' });
    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error(lang === 'ar' ? 'خطأ في تسجيل الدفعة' : 'Error recording payment');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (formData.id) {
        const updated = updateInCollection<Customer>('customers', formData.id, formData as any);
        if (updated) {
          setCustomers(prev => prev.map(c => c.id === formData.id ? updated : c));
          toast.success(lang === 'ar' ? 'تم تحديث بيانات العميل بنجاح' : 'Customer updated successfully');
        }
      } else {
        const added = addToCollection<Customer>('customers', {
          ...formData,
          balance: 0,
          totalPurchases: 0,
          totalPaid: 0,
          companyId: profile.companyId
        } as any);
        setCustomers(prev => [...prev, added]);
        toast.success(lang === 'ar' ? 'تم إضافة العميل بنجاح' : 'Customer added successfully');
      }
      setIsModalOpen(false);
      setFormData({ name: '', email: '', phone: '', address: '', balance: 0, totalPurchases: 0, totalPaid: 0, companyId: profile?.companyId || '' });
    } catch (error) {
      console.error('Error saving customer:', error);
      toast.error(lang === 'ar' ? 'خطأ في حفظ بيانات العميل' : 'Error saving customer');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذا العميل؟' : 'Are you sure you want to delete this customer?')) {
      deleteFromCollection<Customer>('customers', id);
      setCustomers(prev => prev.filter(c => c.id !== id));
      toast.success(lang === 'ar' ? 'تم حذف العميل' : 'Customer deleted');
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const totalPages = Math.ceil(filteredCustomers.length / pageSize);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totalOutstanding = customers.reduce((acc, curr) => acc + (curr.balance || 0), 0);
  const totalPurchases = customers.reduce((acc, curr) => acc + (curr.totalPurchases || 0), 0);
  const totalPaid = customers.reduce((acc, curr) => acc + (curr.totalPaid || 0), 0);

  return (
    <div className="p-8 space-y-8">
      {/* ... existing header and summary cards ... */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-2xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{t.customers}</h2>
            <p className="text-sm text-zinc-500">{lang === 'ar' ? 'إدارة قاعدة بيانات العملاء والعلاقات' : 'Manage your customer database and relationships'}</p>
          </div>
        </div>
        <button 
          onClick={() => {
            setFormData({ name: '', email: '', phone: '', address: '', balance: 0, totalPurchases: 0, totalPaid: 0, companyId: profile?.companyId || '' });
            setIsModalOpen(true);
          }}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
        >
          <Plus className="w-5 h-5" />
          {lang === 'ar' ? 'إضافة عميل' : 'Add Customer'}
        </button>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-5">
          <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center text-emerald-600">
            <TrendingUp className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</p>
            <p className="text-2xl font-black tracking-tight">{currencySymbol} {(totalPurchases || 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-5">
          <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center text-emerald-600">
            <Wallet className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{lang === 'ar' ? 'إجمالي المحصل' : 'Total Collected'}</p>
            <p className="text-2xl font-black tracking-tight">{currencySymbol} {(totalPaid || 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-5">
          <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center text-red-600">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{lang === 'ar' ? 'إجمالي المستحق' : 'Total Outstanding'}</p>
            <p className="text-2xl font-black tracking-tight text-red-600">{currencySymbol} {(totalOutstanding || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
        <input 
          type="text" 
          placeholder={lang === 'ar' ? 'البحث عن عميل...' : 'Search customers...'}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl outline-none focus:ring-2 ring-emerald-500/20 transition-all"
        />
      </div>

      {/* Customers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {paginatedCustomers.map((customer) => (
          <div key={customer.id} className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
            {customer.balance > 0 && (
              <div className="absolute top-0 right-0 px-4 py-1 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded-bl-2xl">
                {lang === 'ar' ? 'مدين' : 'Owes'}
              </div>
            )}
            <div className="flex justify-between items-start mb-6">
              <div className="w-16 h-16 rounded-2xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-2xl font-bold text-emerald-600 group-hover:scale-110 transition-transform">
                {customer.name[0]}
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => { setFormData(customer); setIsModalOpen(true); }}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-emerald-600"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete(customer.id!)}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <h3 className="text-xl font-bold mb-4">{customer.name}</h3>
            <div className="space-y-3 text-sm text-zinc-500 font-medium">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4" />
                {customer.email}
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4" />
                {customer.phone}
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4" />
                {customer.address}
              </div>
            </div>
            
            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{lang === 'ar' ? 'المشتريات' : 'Purchases'}</p>
                <p className="font-black text-zinc-900 dark:text-white">{currencySymbol} {(customer.totalPurchases || 0).toLocaleString()}</p>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{lang === 'ar' ? 'الرصيد' : 'Balance'}</p>
                <p className={`font-black ${(customer.balance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{currencySymbol} {(customer.balance || 0).toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => {
                  setSelectedCustomer(customer);
                  setPaymentData({ ...paymentData, amount: customer.balance });
                  setIsPaymentModalOpen(true);
                }}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all"
              >
                <CreditCard className="w-4 h-4" />
                {lang === 'ar' ? 'تحصيل دفعة' : 'Receive Payment'}
              </button>
              <button 
                onClick={() => {
                  setSelectedCustomer(customer);
                  fetchPaymentHistory(customer.id!);
                  setIsHistoryModalOpen(true);
                }}
                className="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl hover:bg-zinc-200 transition-all"
              >
                <History className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Pagination 
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalRecords={filteredCustomers.length}
        pageSize={pageSize}
        lang={lang}
      />

      {/* Customer Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="relative m-modal"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black tracking-tighter">
                    {formData.id ? (lang === 'ar' ? 'تعديل عميل' : 'Edit Customer') : (lang === 'ar' ? 'إضافة عميل جديد' : 'Add New Customer')}
                  </h3>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-2">{t.customerName}</label>
                    <input 
                      required
                      type="text" 
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="m-input"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-2">Email</label>
                      <input 
                        type="email" 
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        className="m-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-2">Phone</label>
                      <input 
                        required
                        type="tel" 
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        className="m-input"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-2">Address</label>
                    <textarea 
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                      className="m-input h-24 resize-none"
                    />
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                    >
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all"
                    >
                      {lang === 'ar' ? 'حفظ' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPaymentModalOpen(false)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="relative m-modal"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black tracking-tighter">{lang === 'ar' ? 'تحصيل دفعة' : 'Receive Payment'}</h3>
                    <p className="text-zinc-500 text-sm font-bold mt-1">{selectedCustomer.name}</p>
                  </div>
                  <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handlePayment} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-2">{lang === 'ar' ? 'المبلغ' : 'Amount'}</label>
                    <input 
                      required
                      type="number" 
                      value={paymentData.amount}
                      onChange={e => setPaymentData({ ...paymentData, amount: Number(e.target.value) })}
                      className="m-input text-xl font-black"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-2">{lang === 'ar' ? 'طريقة الدفع' : 'Method'}</label>
                      <select 
                        value={paymentData.method}
                        onChange={e => setPaymentData({ ...paymentData, method: e.target.value as any })}
                        className="m-input"
                      >
                        <option value="cash">{lang === 'ar' ? 'نقدي' : 'Cash'}</option>
                        <option value="bank_transfer">{lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                        <option value="other">{lang === 'ar' ? 'أخرى' : 'Other'}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-2">{lang === 'ar' ? 'حساب الإيداع' : 'Deposit Account'}</label>
                      <select 
                        required
                        value={paymentData.accountId}
                        onChange={e => setPaymentData({ ...paymentData, accountId: e.target.value })}
                        className="m-input"
                      >
                        <option value="">{lang === 'ar' ? 'اختر الحساب' : 'Select Account'}</option>
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name} ({currencySymbol} {acc.balance.toLocaleString()})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-zinc-400 uppercase tracking-widest ml-2">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
                    <textarea 
                      value={paymentData.notes}
                      onChange={e => setPaymentData({ ...paymentData, notes: e.target.value })}
                      className="m-input h-24 resize-none"
                    />
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsPaymentModalOpen(false)}
                      className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                    >
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all"
                    >
                      {lang === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryModalOpen(false)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="relative m-modal !max-w-2xl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black tracking-tighter">{lang === 'ar' ? 'سجل المدفوعات' : 'Payment History'}</h3>
                    <p className="text-zinc-500 text-sm font-bold mt-1">{selectedCustomer.name}</p>
                  </div>
                  <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800">
                        <th className="pb-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                        <th className="pb-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                        <th className="pb-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">{lang === 'ar' ? 'الطريقة' : 'Method'}</th>
                        <th className="pb-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                      {paymentHistory.map((payment) => (
                        <tr key={payment.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="py-4 text-xs font-bold text-zinc-500">{new Date(payment.date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</td>
                          <td className="py-4 text-xs font-black text-emerald-600">{currencySymbol} {(payment.amount || 0).toLocaleString()}</td>
                          <td className="py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">{payment.method}</td>
                          <td className="py-4 text-xs font-medium text-zinc-400 italic">{payment.notes || '-'}</td>
                        </tr>
                      ))}
                      {paymentHistory.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-10 text-center text-zinc-400 italic">
                            {lang === 'ar' ? 'لا يوجد سجل مدفوعات' : 'No payment history found'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <button 
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="mt-8 w-full py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl font-bold hover:bg-zinc-200 transition-all"
                >
                  {lang === 'ar' ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
