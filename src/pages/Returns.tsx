import React, { useState, useEffect } from 'react';
import { translations } from '../translations';
import { useAuth } from '../hooks/useAuth';
import { Invoice, Product, Customer, Supplier, Return, ReturnItem } from '../types';
import { 
  RotateCcw, 
  Search, 
  Plus, 
  ArrowLeftRight, 
  Calendar, 
  User, 
  Hash, 
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ShoppingCart,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logAction } from '../services/actionTrackingService';
import { getCollection, addToCollection, updateInCollection } from '../services/accountingService';
import toast from 'react-hot-toast';

interface Props {
  lang: 'ar' | 'en';
}

const Returns: React.FC<Props> = ({ lang }) => {
  const { profile } = useAuth();
  const t = translations[lang];
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [returnItems, setReturnItems] = useState<{ productId: string; quantity: number; reason: string }[]>([]);

  const [returns, setReturns] = useState<Return[]>([]);

  useEffect(() => {
    const loadData = () => {
      setInvoices(getCollection<Invoice>('invoices'));
      setProducts(getCollection<Product>('products'));
      setReturns(getCollection<Return>('returns').sort((a: Return, b: Return) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setLoading(false);
    };
    loadData();
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, []);

  const handleCreateReturn = async () => {
    if (!selectedInvoice || returnItems.length === 0 || !profile?.companyId) return;

    try {
      const returnAmount = returnItems.reduce((acc, item) => {
        const invItem = selectedInvoice.items.find(i => i.productId === item.productId);
        return acc + (invItem ? invItem.price * item.quantity : 0);
      }, 0);

      const returnDoc: Omit<Return, 'id'> = {
        companyId: profile.companyId,
        invoiceId: selectedInvoice.id!,
        invoiceNumber: selectedInvoice.number,
        type: selectedInvoice.type === 'sales' ? 'sales_return' : 'purchase_return',
        items: returnItems,
        totalAmount: returnAmount,
        createdAt: new Date().toISOString(),
        status: 'completed'
      };

      // 1. Save Return
      addToCollection<Return>('returns', returnDoc as any);

      // 2. Update Product Stock
      for (const item of returnItems) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const newQty = selectedInvoice.type === 'sales' 
            ? product.quantity + item.quantity 
            : product.quantity - item.quantity;
          updateInCollection<Product>('products', item.productId, { ...product, quantity: newQty } as any);
        }
      }

      // 3. Update customer/supplier balance
      const entityType = selectedInvoice.type === 'sales' ? 'customers' : 'suppliers';
      const entityId = selectedInvoice.customerId || selectedInvoice.supplierId;
      if (entityId) {
        if (entityType === 'customers') {
          const entities = getCollection<Customer>('customers');
          const entity = entities.find(e => e.id === entityId);
          if (entity) {
            const newBalance = (entity.balance || 0) - returnAmount;
            updateInCollection<Customer>('customers', entityId, { ...entity, balance: newBalance } as any);
          }
        } else {
          const entities = getCollection<Supplier>('suppliers');
          const entity = entities.find(e => e.id === entityId);
          if (entity) {
            const newBalance = (entity.balance || 0) + returnAmount;
            updateInCollection<Supplier>('suppliers', entityId, { ...entity, balance: newBalance } as any);
          }
        }
      }

      // 4. Log Action
      await logAction({
        userId: profile.uid,
        companyId: profile.companyId,
        userName: profile.displayName || profile.email || 'Unknown',
        action: selectedInvoice.type === 'sales' ? 'SALES_RETURN' : 'PURCHASE_RETURN',
        module: 'Returns',
        details: `Created return for invoice ${selectedInvoice.number}. Total return value: ${returnAmount}`
      });

      toast.success(lang === 'ar' ? 'تم تسجيل المرتجع بنجاح' : 'Return recorded successfully');
      setIsModalOpen(false);
      setSelectedInvoice(null);
      setReturnItems([]);
      
      // Refresh local state
      setReturns(getCollection<Return>('returns').sort((a: Return, b: Return) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

    } catch (error) {
      console.error("Error creating return:", error);
      toast.error(lang === 'ar' ? 'خطأ في تسجيل المرتجع' : 'Error recording return');
    }
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {lang === 'ar' ? 'إدارة المرتجعات' : 'Returns Management'}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            {lang === 'ar' ? 'معالجة مرتجعات المبيعات والمشتريات' : 'Process sales and purchase returns'}
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all font-bold"
        >
          <RotateCcw className="w-5 h-5" />
          {lang === 'ar' ? 'إنشاء مرتجع' : 'Create Return'}
        </button>
      </div>

      {/* Recent Returns List (Placeholder for now) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900 dark:text-white">
            {lang === 'ar' ? 'آخر المرتجعات' : 'Recent Returns'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-800/50">
              <tr>
                <th className="px-6 py-4">{lang === 'ar' ? 'رقم الفاتورة' : 'Invoice #'}</th>
                <th className="px-6 py-4">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="px-6 py-4">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th className="px-6 py-4">{lang === 'ar' ? 'القيمة' : 'Amount'}</th>
                <th className="px-6 py-4">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {returns.map((ret) => (
                <tr key={ret.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white">{ret.invoiceNumber}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      ret.type === 'sales_return' ? 'bg-primary/10 text-primary' : 'bg-rose-100 text-rose-600'
                    }`}>
                      {ret.type === 'sales_return' ? (lang === 'ar' ? 'مرتجع مبيعات' : 'Sales Return') : (lang === 'ar' ? 'مرتجع مشتريات' : 'Purchase Return')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">{new Date(ret.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white">{ret.totalAmount.toLocaleString()} EGP</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                      {ret.status}
                    </span>
                  </td>
                </tr>
              ))}
              {returns.length === 0 && (
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-500 italic">
                    {lang === 'ar' ? 'لا توجد مرتجعات مسجلة حالياً' : 'No returns recorded yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Return Modal */}
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative m-modal !max-w-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-8 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                  {lang === 'ar' ? 'إنشاء مرتجع جديد' : 'Create New Return'}
                </h2>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-2xl hover:bg-zinc-200 transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                {!selectedInvoice ? (
                  <div className="space-y-6">
                    <div className="relative">
                      <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 w-5 h-5" />
                      <input
                        type="text"
                        placeholder={lang === 'ar' ? 'ابحث برقم الفاتورة...' : 'Search by invoice number...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pr-12 pl-4 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                      />
                    </div>

                    <div className="space-y-3">
                      {invoices.filter(inv => inv.number.toLowerCase().includes(searchTerm.toLowerCase())).map(inv => (
                        <button
                          key={inv.id}
                          onClick={() => setSelectedInvoice(inv)}
                          className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                              <Hash className="w-6 h-6" />
                            </div>
                            <div className="text-right rtl:text-left">
                              <p className="font-bold text-zinc-900 dark:text-white">{inv.number}</p>
                              <p className="text-xs text-zinc-500">{inv.type === 'sales' ? (lang === 'ar' ? 'مبيعات' : 'Sales') : (lang === 'ar' ? 'مشتريات' : 'Purchases')}</p>
                            </div>
                          </div>
                          <div className="text-right rtl:text-left">
                            <p className="font-bold text-zinc-900 dark:text-white">{inv.total.toLocaleString()} EGP</p>
                            <p className="text-xs text-zinc-500">{inv.date}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700">
                      <div>
                        <p className="text-xs text-zinc-500">{lang === 'ar' ? 'الفاتورة المختارة' : 'Selected Invoice'}</p>
                        <p className="font-bold text-zinc-900 dark:text-white">{selectedInvoice.number}</p>
                      </div>
                      <button 
                        onClick={() => setSelectedInvoice(null)}
                        className="text-sm text-primary font-bold hover:underline"
                      >
                        {lang === 'ar' ? 'تغيير' : 'Change'}
                      </button>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-bold text-zinc-900 dark:text-white">{lang === 'ar' ? 'اختر الأصناف المرتجعة' : 'Select Returned Items'}</h3>
                      <div className="space-y-3">
                        {selectedInvoice.items.map(item => {
                          const product = products.find(p => p.id === item.productId);
                          const returnItem = returnItems.find(ri => ri.productId === item.productId);
                          
                          return (
                            <div key={item.productId} className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                              <div className="flex-1">
                                <p className="font-bold text-zinc-900 dark:text-white">{product?.name || 'Unknown'}</p>
                                <p className="text-xs text-zinc-500">{lang === 'ar' ? 'الكمية الأصلية:' : 'Original Qty:'} {item.quantity}</p>
                              </div>
                              <div className="flex items-center gap-4">
                                <input
                                  type="number"
                                  min="0"
                                  max={item.quantity}
                                  placeholder="0"
                                  value={returnItem?.quantity || ''}
                                  onChange={(e) => {
                                    const qty = Math.min(Number(e.target.value), item.quantity);
                                    if (qty > 0) {
                                      setReturnItems(prev => {
                                        const existing = prev.find(p => p.productId === item.productId);
                                        if (existing) {
                                          return prev.map(p => p.productId === item.productId ? { ...p, quantity: qty } : p);
                                        }
                                        return [...prev, { productId: item.productId, quantity: qty, reason: '' }];
                                      });
                                    } else {
                                      setReturnItems(prev => prev.filter(p => p.productId !== item.productId));
                                    }
                                  }}
                                  className="w-20 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => setIsModalOpen(false)}
                        className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 transition-all"
                      >
                        {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                      </button>
                      <button
                        onClick={handleCreateReturn}
                        disabled={returnItems.length === 0}
                        className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                      >
                        {lang === 'ar' ? 'تأكيد المرتجع' : 'Confirm Return'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Returns;
