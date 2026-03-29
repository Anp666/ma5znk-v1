import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, FileText, Printer, Download, Trash2, ShoppingCart, User, Calendar, CreditCard, Package, X, Minus, Plus as PlusIcon, ScanBarcode, Percent, Banknote, Eye, FileDown, Mic, MicOff } from 'lucide-react';
import { Invoice, Product, Customer, Account, InvoiceItem } from '../types';
import { translations } from '../translations';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { fixArabic, initArabicPdf, generateInvoicePDF } from '../utils/pdfUtils';
import { useAuth } from '../hooks/useAuth';
import Pagination from '../components/Pagination';
import { Filter, RotateCcw } from 'lucide-react';
import { logAction } from '../services/actionTrackingService';
import { recordSalesInvoice, getCollection, addToCollection, updateInCollection, deleteFromCollection } from '../services/accountingService';
import { getCurrencySymbol, formatCurrency } from '../utils/currency';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface Props {
  lang: 'ar' | 'en';
  profile: any;
}

interface CartItem extends Product {
  cartQuantity: number;
  selectedPriceType: 'sellingPrice' | 'wholesalePrice' | 'vipPrice';
  selectedPrice: number;
}

export default function Invoices({ lang, profile }: Props) {
  const { user } = useAuth();
  const t = translations[lang];
  const currencySymbol = getCurrencySymbol(profile?.currency, lang);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [posSearchTerm, setPosSearchTerm] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isVatEnabled, setIsVatEnabled] = useState(profile?.currency === 'SAR');
  
  const { isListening, transcript, startListening, stopListening } = useVoiceInput(lang);

  useEffect(() => {
    if (transcript) {
      setPosSearchTerm(transcript);
    }
  }, [transcript]);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  // POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [taxRate, setTaxRate] = useState(15);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'credit'>('cash');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadData = () => {
      setInvoices(getCollection<Invoice>('invoices').sort((a: Invoice, b: Invoice) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setProducts(getCollection<Product>('products').sort((a: Product, b: Product) => a.name.localeCompare(b.name)));
      setCustomers(getCollection<Customer>('customers').sort((a: Customer, b: Customer) => a.name.localeCompare(b.name)));
      setAccounts(getCollection<Account>('accounts').filter((a: Account) => a.type === 'Asset' && (a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('bank'))));
    };
    loadData();
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, []);

  useEffect(() => {
    if (isModalOpen && barcodeRef.current) {
      barcodeRef.current.focus();
    }
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setViewingInvoice(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isModalOpen]);

  const addToCart = (product: Product, priceType: 'sellingPrice' | 'wholesalePrice' | 'vipPrice' = 'sellingPrice') => {
    if (product.quantity <= 0) {
      toast.error(lang === 'ar' ? 'هذا المنتج غير متوفر في المخزون' : 'This product is out of stock');
      return;
    }

    const price = product[priceType] || product.sellingPrice;

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id && item.selectedPriceType === priceType);
      if (existing) {
        if (existing.cartQuantity + 1 > product.quantity) {
          toast.error(lang === 'ar' ? 'الكمية المطلوبة أكبر من الكمية المتاحة في المخزون' : 'Requested quantity exceeds available stock');
          return prev;
        }
        return prev.map(item => 
          (item.id === product.id && item.selectedPriceType === priceType)
            ? { ...item, cartQuantity: item.cartQuantity + 1 } 
            : item
        );
      }
      return [...prev, { 
        ...product, 
        cartQuantity: 1, 
        selectedPriceType: priceType,
        selectedPrice: price
      }];
    });
  };

  const updateCartPriceType = (productId: string, priceType: 'sellingPrice' | 'wholesalePrice' | 'vipPrice') => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const price = product[priceType] || product.sellingPrice;

    setCart(prev => prev.map(item => 
      item.id === productId 
        ? { ...item, selectedPriceType: priceType, selectedPrice: price } 
        : item
    ));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.id !== productId));
      return;
    }

    if (quantity > product.quantity) {
      toast.error(lang === 'ar' ? 'الكمية المطلوبة أكبر من الكمية المتاحة في المخزون' : 'Requested quantity exceeds available stock');
    }

    setCart(prev => prev.map(item => 
      item.id === productId ? { ...item, cartQuantity: quantity } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find(p => p.barcode === barcodeInput || p.sku === barcodeInput);
    if (product) {
      addToCart(product);
      setBarcodeInput('');
      toast.success(lang === 'ar' ? `تم إضافة ${product.name}` : `Added ${product.name}`);
    } else {
      toast.error(t.productNotFound);
    }
  };

  const handleBarcodeScan = (decodedText: string) => {
    const product = products.find(p => p.barcode === decodedText || p.sku === decodedText);
    if (product) {
      addToCart(product);
      toast.success(lang === 'ar' ? `تم إضافة ${product.name}` : `Added ${product.name}`);
    } else {
      toast.error(t.productNotFound);
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.selectedPrice * item.cartQuantity), 0);
  const discountValue = discountType === 'percentage' ? (subtotal * discount / 100) : discount;
  const taxableAmount = subtotal - discountValue;
  
  const effectiveTaxRate = isVatEnabled ? 15 : 0;
  const taxValue = taxableAmount * (effectiveTaxRate / 100);
  const total = taxableAmount + taxValue;

  const handleCheckout = async () => {
    if (cart.length === 0 || !user) return;

    // Validate Stock
    const outOfStockItems = cart.filter(item => item.cartQuantity > item.quantity);
    if (outOfStockItems.length > 0) {
      toast.error(lang === 'ar' ? 'الكمية المطلوبة أكبر من الكمية المتاحة في المخزون' : 'Requested quantity exceeds available stock');
      return;
    }
    
    try {
      const invoiceNumber = `INV-${Date.now()}`;
      const customer = customers.find(c => c.id === selectedCustomerId);
      
      const invoiceData: Omit<Invoice, 'id'> = {
        number: invoiceNumber,
        date: new Date(invoiceDate).toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        notes,
        customerId: selectedCustomerId || null,
        customerName: customer?.name || (lang === 'ar' ? 'عميل نقدي' : 'Cash Customer'),
        items: cart.map(item => ({
          productId: item.id!,
          name: item.name,
          quantity: item.cartQuantity,
          price: item.selectedPrice,
          priceType: item.selectedPriceType === 'sellingPrice' ? 'retail' : 
                     item.selectedPriceType === 'wholesalePrice' ? 'wholesale' : 'vip',
          total: item.selectedPrice * item.cartQuantity
        })),
        subtotal,
        discount: discountValue,
        discountType,
        taxRate: effectiveTaxRate,
        tax: taxValue,
        total,
        paidAmount: paymentMethod === 'credit' ? 0 : total,
        paymentMethod,
        type: 'sales',
        status: paymentMethod === 'credit' ? 'unpaid' : 'paid',
        userId: user.uid,
        companyId: profile.companyId
      };

      // 1. Save Invoice
      const addedInvoice = addToCollection<Invoice>('invoices', invoiceData as any);

      // 2. Update Product Quantities
      cart.forEach(item => {
        if (item.id) {
          const product = products.find(p => p.id === item.id);
          if (product) {
            updateInCollection<Product>('products', item.id, {
              ...product,
              quantity: product.quantity - item.cartQuantity
            } as any);
          }
        }
      });

      // 3. Record Accounting Entry
      await recordSalesInvoice(profile.companyId, addedInvoice, selectedAccountId || undefined);
      
      // 4. Log Action
      await logAction({
        userId: user.uid,
        companyId: profile.companyId,
        userName: user.displayName || user.email || 'Unknown',
        action: 'CREATED_INVOICE',
        module: 'Sales',
        details: `Created invoice ${invoiceNumber} for ${invoiceData.customerName} - Total: ${currencySymbol} ${total}`
      });

      // Update local state
      setInvoices(getCollection<Invoice>('invoices'));
      setProducts(getCollection<Product>('products'));

      // Print after save
      setViewingInvoice(addedInvoice as any);
      
      setCart([]);
      setSelectedCustomerId('');
      setSelectedAccountId('');
      setDiscount(0);
      setIsModalOpen(false);
      
      setTimeout(() => {
        window.print();
      }, 500);

    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(lang === 'ar' ? 'خطأ في إتمام العملية' : 'Checkout error');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذه الفاتورة؟' : 'Are you sure you want to delete this invoice?')) {
      try {
        deleteFromCollection<Invoice>('invoices', id);
        setInvoices(prev => prev.filter(inv => inv.id !== id));
        toast.success(lang === 'ar' ? 'تم حذف الفاتورة' : 'Invoice deleted');
      } catch (error) {
        console.error('Delete error:', error);
        toast.error(lang === 'ar' ? 'خطأ في الحذف' : 'Delete error');
      }
    }
  };

  const exportToPDF = async (invoice: Invoice) => {
    const doc = await initArabicPdf();
    const isAr = lang === 'ar';
    const margin = 20;
    const pageWidth = doc.internal.pageSize.width;
    
    // Header Section
    doc.setFillColor(248, 250, 252); // Light gray background for header
    doc.rect(0, 0, pageWidth, 60, 'F');
    
    // Company Logo (Placeholder)
    doc.setFillColor(16, 185, 129); // Emerald-600
    doc.roundedRect(isAr ? pageWidth - 40 : margin, 15, 20, 20, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('Cairo', 'bold');
    doc.setFontSize(14);
    doc.text('M', isAr ? pageWidth - 30 : margin + 10, 29, { align: 'center' });
    
    // Company Name
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.setFontSize(18);
    doc.text(fixArabic(t.brand), isAr ? pageWidth - 45 : margin + 25, 28, { align: isAr ? 'right' : 'left' });
    doc.setFontSize(10);
    doc.setFont('Cairo', 'normal');
    doc.text(fixArabic(isAr ? 'نظام المحاسبة المتكامل' : 'Integrated Accounting System'), isAr ? pageWidth - 45 : margin + 25, 35, { align: isAr ? 'right' : 'left' });
    
    // Invoice Title & Details
    doc.setFontSize(22);
    doc.setFont('Cairo', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text(fixArabic(isAr ? 'فاتورة ضريبية' : 'Tax Invoice'), isAr ? margin : pageWidth - margin, 28, { align: isAr ? 'left' : 'right' });
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('Cairo', 'normal');
    doc.text(fixArabic(`${isAr ? 'رقم الفاتورة' : 'Invoice #'}: ${invoice.number}`), isAr ? margin : pageWidth - margin, 38, { align: isAr ? 'left' : 'right' });
    doc.text(fixArabic(`${isAr ? 'التاريخ' : 'Date'}: ${new Date(invoice.date).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}`), isAr ? margin : pageWidth - margin, 44, { align: isAr ? 'left' : 'right' });
    
    // Customer Section
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('Cairo', 'bold');
    doc.text(fixArabic(isAr ? 'معلومات العميل' : 'Customer Information'), isAr ? pageWidth - margin : margin, 80, { align: isAr ? 'right' : 'left' });
    
    doc.setFont('Cairo', 'normal');
    doc.setFontSize(10);
    doc.text(fixArabic(`${isAr ? 'الاسم' : 'Name'}: ${invoice.customerName}`), isAr ? pageWidth - margin : margin, 88, { align: isAr ? 'right' : 'left' });
    
    // Products Table
    const tableData = invoice.items.map(item => [
      fixArabic(item.name),
      item.quantity,
      `${currencySymbol} ${item.price.toLocaleString()}`,
      `${currencySymbol} ${item.total.toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: 100,
      head: [[
        fixArabic(isAr ? 'المنتج' : 'Product'), 
        fixArabic(isAr ? 'الكمية' : 'Qty'), 
        fixArabic(isAr ? 'السعر' : 'Price'), 
        fixArabic(isAr ? 'الإجمالي' : 'Total')
      ]],
      body: tableData,
      styles: { 
        font: 'Cairo', 
        fontSize: 9,
        cellPadding: 6,
        halign: isAr ? 'right' : 'left' 
      },
      headStyles: { 
        fillColor: [30, 41, 59], 
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: isAr ? 'right' : 'left' 
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: margin, right: margin },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 150;
    
    // Totals Section
    const totalsX = isAr ? margin : pageWidth - margin;
    const align = isAr ? 'left' : 'right';

    doc.setFontSize(10);
    doc.setFont('Cairo', 'normal');
    doc.setTextColor(100);
    doc.text(fixArabic(`${isAr ? 'المجموع الفرعي' : 'Subtotal'}: ${currencySymbol} ${invoice.subtotal.toLocaleString()}`), totalsX, finalY + 15, { align });
    doc.text(fixArabic(`${isAr ? 'الخصم' : 'Discount'}: ${currencySymbol} ${invoice.discount.toLocaleString()}`), totalsX, finalY + 22, { align });
    doc.text(fixArabic(`${isAr ? 'الضريبة' : 'Tax'}: ${currencySymbol} ${invoice.tax.toLocaleString()}`), totalsX, finalY + 29, { align });

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, finalY + 35, pageWidth - margin, finalY + 35);

    doc.setFontSize(14);
    doc.setFont('Cairo', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text(fixArabic(`${isAr ? 'الإجمالي النهائي' : 'Final Total'}: ${currencySymbol} ${invoice.total.toLocaleString()}`), totalsX, finalY + 45, { align });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(fixArabic(isAr ? 'شكراً لتعاملكم معنا! تم إنشاء هذه الفاتورة إلكترونياً.' : 'Thank you for your business! This is an electronically generated invoice.'), pageWidth / 2, 285, { align: 'center' });

    doc.save(`Invoice-${invoice.number}.pdf`);
  };

  const exportReceiptPDF = async (invoice: Invoice) => {
    // 80mm width for thermal printers
    const doc = await initArabicPdf();
    const isAr = lang === 'ar';
    const width = 80;
    const margin = 5;
    
    // Set custom page size
    (doc as any).internal.pageSize.width = width;
    (doc as any).internal.pageSize.height = 150; 

    const centerX = width / 2;
    
    // Company Header
    doc.setFont('Cairo', 'bold');
    doc.setFontSize(14);
    doc.text(fixArabic(t.brand), centerX, 10, { align: 'center' });
    
    doc.setFont('Cairo', 'normal');
    doc.setFontSize(8);
    doc.text(fixArabic(isAr ? 'فاتورة مبسطة' : 'Simplified Invoice'), centerX, 15, { align: 'center' });
    
    doc.setDrawColor(200);
    doc.line(margin, 18, width - margin, 18);
    
    // Invoice Info
    doc.setFontSize(7);
    doc.text(fixArabic(`${isAr ? 'رقم الفاتورة' : 'Invoice #'}: ${invoice.number}`), isAr ? width - margin : margin, 25, { align: isAr ? 'right' : 'left' });
    doc.text(fixArabic(`${isAr ? 'التاريخ' : 'Date'}: ${new Date(invoice.date).toLocaleString(isAr ? 'ar-SA' : 'en-US')}`), isAr ? width - margin : margin, 29, { align: isAr ? 'right' : 'left' });
    doc.text(fixArabic(`${isAr ? 'العميل' : 'Customer'}: ${invoice.customerName}`), isAr ? width - margin : margin, 33, { align: isAr ? 'right' : 'left' });
    
    // Items Table
    const tableData = invoice.items.map(item => [
      fixArabic(item.name),
      item.quantity,
      item.total.toFixed(2)
    ]);

    autoTable(doc, {
      startY: 38,
      margin: { left: margin, right: margin },
      tableWidth: width - (margin * 2),
      head: [[
        fixArabic(isAr ? 'المنتج' : 'Item'), 
        fixArabic(isAr ? 'الكمية' : 'Qty'), 
        fixArabic(isAr ? 'الإجمالي' : 'Total')
      ]],
      body: tableData,
      theme: 'plain',
      styles: { 
        font: 'Cairo', 
        fontSize: 7,
        cellPadding: 1,
        halign: isAr ? 'right' : 'left' 
      },
      headStyles: { 
        fontStyle: 'bold',
        lineWidth: 0.1,
        lineColor: 200
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 60;
    
    // Totals
    doc.setFontSize(8);
    doc.setFont('Cairo', 'bold');
    doc.text(fixArabic(`${isAr ? 'الإجمالي' : 'Total'}:`), isAr ? width - margin : margin, finalY + 10, { align: isAr ? 'right' : 'left' });
    doc.text(`${invoice.total.toFixed(2)} ${currencySymbol}`, isAr ? margin : width - margin, finalY + 10, { align: isAr ? 'left' : 'right' });
    
    // Footer
    doc.setFont('Cairo', 'normal');
    doc.setFontSize(6);
    doc.text(fixArabic(isAr ? 'شكراً لزيارتكم' : 'Thank you for visiting'), centerX, finalY + 20, { align: 'center' });
    
    doc.save(`Receipt-${invoice.number}.pdf`);
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(invoices.map(inv => ({
      Number: inv.number,
      Date: new Date(inv.date).toLocaleDateString(),
      Customer: inv.customerName,
      Total: inv.total,
      Status: inv.status
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Invoices");
    XLSX.writeFile(workbook, "Invoices_Report.xlsx");
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    const matchesCustomer = customerFilter === 'all' || inv.customerId === customerFilter;
    
    const invDate = new Date(inv.date);
    const matchesStartDate = !startDate || invDate >= new Date(startDate);
    const matchesEndDate = !endDate || invDate <= new Date(endDate + 'T23:59:59');

    return matchesSearch && matchesStatus && matchesCustomer && matchesStartDate && matchesEndDate;
  });

  const totalPages = Math.ceil(filteredInvoices.length / pageSize);
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

    const categories = ['all', ...new Set(products.map(p => p.categoryId).filter(Boolean))];
    const filteredProducts = products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(posSearchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(posSearchTerm.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(posSearchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;
      return matchesSearch && matchesCategory;
    });

  return (
    <div className="space-y-10">
      {isScanning && (
        <BarcodeScanner 
          lang={lang}
          onScan={handleBarcodeScan}
          onClose={() => setIsScanning(false)}
        />
      )}
      {/* Printable Invoice (Hidden) */}
      <div id="printable-invoice" className="hidden print:block p-10 bg-white text-black font-sans">
        {viewingInvoice && (
          <div className="max-w-4xl mx-auto border p-10">
            <div className="flex justify-between items-start mb-10">
              <div>
                <h1 className="text-4xl font-black mb-2">{t.storeName}</h1>
                <p className="text-zinc-500">الرياض، المملكة العربية السعودية</p>
                <p className="text-zinc-500">هاتف: 966500000000+</p>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold text-emerald-600 mb-4">{lang === 'ar' ? 'فاتورة ضريبية' : 'Tax Invoice'}</h2>
                <p className="font-bold">{t.invoiceNumber}: {viewingInvoice.number}</p>
                <p>{t.date}: {new Date(viewingInvoice.date).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="mb-10 p-6 bg-zinc-50 rounded-2xl">
              <h3 className="font-bold mb-2">{t.customerName}:</h3>
              <p className="text-xl">{viewingInvoice.customerName}</p>
            </div>

            <table className="w-full mb-10">
              <thead>
                <tr className="border-b-2 border-zinc-200">
                  <th className="py-4 text-left">{t.productName}</th>
                  <th className="py-4 text-center">{t.quantity}</th>
                  <th className="py-4 text-right">{lang === 'ar' ? 'السعر' : 'Price'}</th>
                  <th className="py-4 text-right">{t.total}</th>
                </tr>
              </thead>
              <tbody>
                {viewingInvoice.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-zinc-100">
                    <td className="py-4">{item.name}</td>
                    <td className="py-4 text-center">{item.quantity}</td>
                    <td className="py-4 text-right">{currencySymbol} {item.price.toFixed(2)}</td>
                    <td className="py-4 text-right">{currencySymbol} {item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-80 space-y-3">
                <div className="flex justify-between">
                  <span className="text-zinc-500">{t.subtotal}</span>
                  <span className="font-bold">{currencySymbol} {viewingInvoice.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">{t.discount}</span>
                  <span className="font-bold text-red-500">- {currencySymbol} {viewingInvoice.discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">{t.taxValue} ({viewingInvoice.taxRate}%)</span>
                  <span className="font-bold">{currencySymbol} {viewingInvoice.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-2xl font-black border-t pt-4">
                  <span>{t.finalTotal}</span>
                  <span className="text-emerald-600">{currencySymbol} {viewingInvoice.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-20 text-center text-zinc-400 text-sm">
              شكراً لتعاملكم معنا!
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6 no-print">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative w-full md:w-[450px] group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
              <input 
                type="text" 
                placeholder={lang === 'ar' ? 'بحث عن فاتورة أو عميل...' : 'Search invoices or customers...'}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-14 pr-6 py-4.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none shadow-sm font-medium"
              />
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`p-4.5 rounded-2xl border transition-all shadow-sm flex items-center gap-2 ${
                showFilters 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-800' 
                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <Filter className="w-6 h-6" />
              <span className="hidden md:inline font-bold">{t.filter}</span>
            </button>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              onClick={exportToExcel}
              className="p-4.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl hover:bg-zinc-50 transition-all shadow-sm"
            >
              <Download className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex-1 md:flex-none px-10 py-4.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[1.5rem] font-black flex items-center justify-center gap-3 shadow-2xl shadow-emerald-600/20 transition-all active:scale-95"
            >
              <Plus className="w-6 h-6" />
              {lang === 'ar' ? 'فاتورة جديدة' : 'New Invoice'}
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] grid grid-cols-1 md:grid-cols-4 gap-6 shadow-sm">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{t.status}</label>
                  <select 
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-sm outline-none focus:ring-2 ring-emerald-500/20 font-bold"
                  >
                    <option value="all">{t.all}</option>
                    <option value="paid">{t.paid}</option>
                    <option value="pending">{t.pending}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{t.customerName}</label>
                  <select 
                    value={customerFilter}
                    onChange={(e) => {
                      setCustomerFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-sm outline-none focus:ring-2 ring-emerald-500/20 font-bold"
                  >
                    <option value="all">{t.all}</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{t.startDate}</label>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-sm outline-none focus:ring-2 ring-emerald-500/20 font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{t.endDate}</label>
                  <div className="flex gap-2">
                    <input 
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="flex-1 px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-sm outline-none focus:ring-2 ring-emerald-500/20 font-bold"
                    />
                    <button 
                      onClick={() => {
                        setStatusFilter('all');
                        setCustomerFilter('all');
                        setStartDate('');
                        setEndDate('');
                        setCurrentPage(1);
                      }}
                      className="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl hover:bg-zinc-200 transition-all"
                      title={t.reset}
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden no-print">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left responsive-table">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                <th className="px-10 py-6 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{t.invoiceNumber}</th>
                <th className="px-10 py-6 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{t.customerName}</th>
                <th className="px-10 py-6 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{t.date}</th>
                <th className="px-10 py-6 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{t.total}</th>
                <th className="px-10 py-6 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="px-10 py-6 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {paginatedInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group">
                  <td className="px-10 py-8" data-label={t.invoiceNumber}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-[1rem] bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-all duration-500">
                        <FileText className="w-6 h-6" />
                      </div>
                      <span className="font-black text-zinc-900 dark:text-white group-hover:text-emerald-600 transition-colors">{inv.number}</span>
                    </div>
                  </td>
                  <td className="px-10 py-8 text-sm font-black text-zinc-600 dark:text-zinc-400" data-label={t.customerName}>{inv.customerName}</td>
                  <td className="px-10 py-8 text-sm text-zinc-500 font-medium" data-label={t.date}>{new Date(inv.date).toLocaleDateString()}</td>
                  <td className="px-10 py-8 font-black text-emerald-600" data-label={t.total}>{currencySymbol} {inv.total.toLocaleString()}</td>
                  <td className="px-10 py-8" data-label={lang === 'ar' ? 'الحالة' : 'Status'}>
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      inv.status === 'paid' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20' : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20'
                    }`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-10 py-8 text-right">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <button 
                        onClick={() => setViewingInvoice(inv)}
                        className="p-3 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => exportToPDF(inv)}
                        className="p-3 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all"
                        title={lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
                      >
                        <Download className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => exportReceiptPDF(inv)}
                        className="p-3 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all"
                        title={lang === 'ar' ? 'تصدير إيصال' : 'Export Receipt'}
                      >
                        <Banknote className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => {
                          setViewingInvoice(inv);
                          setTimeout(() => window.print(), 500);
                        }}
                        className="p-3 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all"
                      >
                        <Printer className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => inv.id && handleDelete(inv.id)}
                        className="p-3 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalRecords={filteredInvoices.length}
          pageSize={pageSize}
          lang={lang}
        />
      </div>

      {/* POS Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 no-print">
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
              className="relative m-modal flex flex-col md:flex-row !max-w-[1300px] !overflow-hidden !h-[95vh]"
            >
              {/* LEFT SIDE: Product Selection */}
              <div className="w-full md:w-[60%] flex flex-col h-full overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/50 border-r border-zinc-100 dark:border-zinc-800">
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black">{lang === 'ar' ? 'اختيار المنتجات' : 'Select Products'}</h2>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsScanning(true)}
                        className="p-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-primary transition-all"
                        title={t.scanBarcode}
                      >
                        <ScanBarcode className="w-6 h-6" />
                      </button>
                      <button 
                        onClick={isListening ? stopListening : startListening}
                        className={`p-3 border rounded-xl transition-all ${
                          isListening 
                            ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' 
                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                        }`}
                        title={lang === 'ar' ? 'بحث صوتي' : 'Voice Search'}
                      >
                        {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1 group">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-primary transition-colors" />
                      <input 
                        type="text" 
                        placeholder={t.searchProduct}
                        value={posSearchTerm}
                        onChange={(e) => setPosSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 ring-primary/20 transition-all font-medium"
                      />
                    </div>
                    <form onSubmit={handleBarcodeSubmit} className="relative w-full md:w-48 group">
                      <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-primary transition-colors" />
                      <input 
                        ref={barcodeRef}
                        type="text" 
                        placeholder={t.barcode}
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 ring-primary/20 transition-all font-medium"
                      />
                    </form>
                  </div>

                  {/* Category Tabs */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat || 'all')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                          selectedCategory === cat
                            ? 'bg-primary text-white shadow-lg shadow-primary/20'
                            : 'bg-white dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {cat === 'all' ? t.all : cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 pt-0 custom-scrollbar">
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredProducts.map(product => (
                      <motion.button
                        key={product.id}
                        whileHover={{ y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => addToCart(product)}
                        className="flex flex-col text-right bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-2xl p-4 hover:shadow-xl hover:border-primary/30 transition-all group relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-all" />
                        <div className="flex justify-between items-start mb-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                            product.quantity <= (product.minStock || 5) 
                              ? 'bg-red-100 text-red-600' 
                              : 'bg-emerald-100 text-emerald-600'
                          }`}>
                            {product.quantity} {t.records}
                          </span>
                          <Package className="w-5 h-5 text-zinc-300 group-hover:text-primary transition-colors" />
                        </div>
                        <h4 className="font-bold text-zinc-900 dark:text-white mb-1 line-clamp-1">{product.name}</h4>
                        <p className="text-xs text-zinc-400 mb-3">{product.categoryId}</p>
                        <div className="mt-auto pt-3 border-t border-zinc-50 dark:border-zinc-700 flex items-center justify-between">
                          <span className="text-primary font-black">{currencySymbol} {product.sellingPrice.toLocaleString()}</span>
                          <div className="w-8 h-8 rounded-lg bg-zinc-50 dark:bg-zinc-700 flex items-center justify-center text-zinc-400 group-hover:bg-primary group-hover:text-white transition-all">
                            <PlusIcon className="w-4 h-4" />
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT SIDE: Cart & Checkout */}
              <div className="w-full md:w-[40%] flex flex-col h-full bg-white dark:bg-zinc-950">
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <ShoppingCart className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-black">{t.checkout}</h2>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="p-6 space-y-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{t.date}</label>
                      <input 
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 ring-primary/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
                      <input 
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 ring-primary/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{t.selectCustomer}</label>
                      <select 
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 ring-primary/20"
                      >
                        <option value="">{lang === 'ar' ? 'عميل نقدي' : 'Cash Customer'}</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar invoice-items-scroll">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-4 opacity-50">
                      <ShoppingCart className="w-16 h-16 stroke-[1]" />
                      <p className="font-bold">{t.noProductsSelected}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {cart.map((item, idx) => (
                        <div key={`${item.id}-${item.selectedPriceType}`} className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 group">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h5 className="font-bold text-zinc-900 dark:text-white">{item.name}</h5>
                              <div className="flex items-center gap-2 mt-1">
                                <select
                                  value={item.selectedPriceType}
                                  onChange={(e) => updateCartPriceType(item.id!, e.target.value as any)}
                                  className="text-[10px] font-black bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-1 py-0.5 outline-none"
                                >
                                  <option value="sellingPrice">{t.price1}</option>
                                  <option value="wholesalePrice">{t.price2}</option>
                                  <option value="vipPrice">{t.price3}</option>
                                </select>
                                <span className="text-xs text-zinc-400">{currencySymbol} {item.selectedPrice.toLocaleString()}</span>
                              </div>
                            </div>
                            <button onClick={() => removeFromCart(item.id!)} className="p-2 text-zinc-300 hover:text-red-500 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-1">
                              <button 
                                onClick={() => updateCartQuantity(item.id!, item.cartQuantity - 1)}
                                className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-primary transition-colors"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <input 
                                type="number" 
                                value={item.cartQuantity}
                                onChange={(e) => updateCartQuantity(item.id!, parseInt(e.target.value) || 0)}
                                className="w-12 text-center font-black text-sm bg-transparent outline-none"
                              />
                              <button 
                                onClick={() => updateCartQuantity(item.id!, item.cartQuantity + 1)}
                                className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-primary transition-colors"
                              >
                                <PlusIcon className="w-4 h-4" />
                              </button>
                            </div>
                            <span className="font-black text-primary">{currencySymbol} {(item.selectedPrice * item.cartQuantity).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-6 bg-zinc-50 dark:bg-zinc-900/80 border-t border-zinc-100 dark:border-zinc-800 space-y-4 sticky bottom-0 z-10">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{t.discount}</label>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          value={discount}
                          onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                          className="flex-1 px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold outline-none"
                        />
                        <button 
                          onClick={() => setDiscountType(discountType === 'percentage' ? 'fixed' : 'percentage')}
                          className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-black"
                        >
                          {discountType === 'percentage' ? '%' : currencySymbol}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{t.paymentMethod}</label>
                      <select 
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold outline-none"
                      >
                        <option value="cash">{t.cash}</option>
                        <option value="card">{t.card}</option>
                        <option value="bank_transfer">{t.bankTransfer}</option>
                        <option value="credit">{lang === 'ar' ? 'آجل' : 'Credit'}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{lang === 'ar' ? 'الضريبة (15%)' : 'VAT (15%)'}</label>
                      <button 
                        onClick={() => setIsVatEnabled(!isVatEnabled)}
                        className={`w-full py-2 rounded-xl text-xs font-black transition-all ${
                          isVatEnabled 
                            ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' 
                            : 'bg-zinc-100 text-zinc-400 border border-zinc-200'
                        }`}
                      >
                        {isVatEnabled ? (lang === 'ar' ? 'مفعلة' : 'Enabled') : (lang === 'ar' ? 'معطلة' : 'Disabled')}
                      </button>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-2">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
                      <input 
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={lang === 'ar' ? 'أضف ملاحظة...' : 'Add a note...'}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">{t.subtotal}</span>
                      <span className="font-bold">{currencySymbol} {subtotal.toLocaleString()}</span>
                    </div>
                    {discountValue > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">{t.discount}</span>
                        <span className="font-bold text-red-500">- {currencySymbol} {discountValue.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">{t.taxValue} ({effectiveTaxRate}%)</span>
                      <span className="font-bold">{currencySymbol} {taxValue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xl font-black pt-2">
                      <span>{t.finalTotal}</span>
                      <span className="text-primary">{currencySymbol} {total.toLocaleString()}</span>
                    </div>
                  </div>

                  <button 
                    onClick={handleCheckout}
                    disabled={cart.length === 0}
                    className="w-full py-4 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl shadow-primary/20 transition-all active:scale-[0.98] disabled:bg-zinc-300 disabled:shadow-none"
                  >
                    <ShoppingCart className="w-6 h-6" />
                    {t.checkout}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Invoice Modal */}
      <AnimatePresence>
        {viewingInvoice && !isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingInvoice(null)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative m-modal !max-w-2xl"
            >
              <div className="p-8 md:p-12">
                <div className="flex items-center justify-between mb-10">
                  <h3 className="text-2xl md:text-3xl font-black tracking-tighter">{t.invoiceNumber}: {viewingInvoice.number}</h3>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => generateInvoicePDF(viewingInvoice, lang)}
                      className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
                      title={lang === 'ar' ? 'تحميل PDF' : 'Download PDF'}
                    >
                      <FileDown className="w-6 h-6" />
                    </button>
                    <button onClick={() => setViewingInvoice(null)} className="p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                      <X className="w-7 h-7" />
                    </button>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="p-6 bg-zinc-50 dark:bg-zinc-800 rounded-[1.5rem]">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-2">{t.customerName}</div>
                      <div className="font-black text-lg">{viewingInvoice.customerName}</div>
                    </div>
                    <div className="p-6 bg-zinc-50 dark:bg-zinc-800 rounded-[1.5rem]">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-2">{t.date}</div>
                      <div className="font-black text-lg">{new Date(viewingInvoice.date).toLocaleDateString()}</div>
                    </div>
                  </div>

                  <div className="border border-zinc-100 dark:border-zinc-800 rounded-[2rem] overflow-hidden">
                    <table className="w-full text-sm responsive-table">
                      <thead className="bg-zinc-50 dark:bg-zinc-800">
                        <tr>
                          <th className="px-6 py-4 text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t.productName}</th>
                          <th className="px-6 py-4 text-center text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t.quantity}</th>
                          <th className="px-6 py-4 text-right text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t.total}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {viewingInvoice.items.map((item, i) => (
                          <tr key={i}>
                            <td className="px-6 py-4 font-bold" data-label={t.productName}>{item.name}</td>
                            <td className="px-6 py-4 text-center font-black" data-label={t.quantity}>{item.quantity}</td>
                            <td className="px-6 py-4 text-right font-black text-emerald-600" data-label={t.total}>{currencySymbol} {item.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 pt-6">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-zinc-500">{t.subtotal}</span>
                      <span className="text-zinc-900 dark:text-white">{currencySymbol} {viewingInvoice.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-zinc-500">{t.discount}</span>
                      <span className="text-red-500">- {currencySymbol} {viewingInvoice.discount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-zinc-500">{t.taxValue}</span>
                      <span className="text-zinc-900 dark:text-white">{currencySymbol} {viewingInvoice.tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-2xl md:text-4xl font-black pt-6 border-t border-zinc-100 dark:border-zinc-800 tracking-tighter">
                      <span>{t.total}</span>
                      <span className="text-emerald-600">{currencySymbol} {viewingInvoice.total.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-6 pt-10">
                    <button 
                      onClick={() => exportToPDF(viewingInvoice)}
                      className="flex-1 py-5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-3 hover:bg-zinc-200 transition-all active:scale-95"
                    >
                      <Download className="w-6 h-6" />
                      PDF
                    </button>
                    <button 
                      onClick={() => window.print()}
                      className="flex-1 py-5 bg-emerald-600 text-white rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-3 hover:bg-emerald-700 shadow-2xl shadow-emerald-600/20 transition-all active:scale-95"
                    >
                      <Printer className="w-6 h-6" />
                      {t.printInvoice}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
