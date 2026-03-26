import { Transaction, Account, Product, Customer, Supplier, Invoice, Payment } from '../types';

// Helper to manage local storage collections
export const getCollection = <T>(name: string): T[] => {
  const data = localStorage.getItem(`makhzanak_${name}`);
  return data ? JSON.parse(data) : [];
};

export const saveCollection = (name: string, data: any[]) => {
  localStorage.setItem(`makhzanak_${name}`, JSON.stringify(data));
};

export const addToCollection = <T extends { id?: string }>(name: string, item: T): T => {
  const collection = getCollection<T>(name);
  const newItem = { ...item, id: item.id || Math.random().toString(36).substring(7), createdAt: new Date().toISOString() } as T & { id: string, createdAt: string };
  collection.push(newItem);
  saveCollection(name, collection);
  return newItem;
};

export const updateInCollection = <T extends { id?: string }>(name: string, id: string, updates: Partial<T>): T | null => {
  const collection = getCollection<T>(name);
  const index = collection.findIndex((item: any) => item.id === id);
  if (index !== -1) {
    collection[index] = { ...collection[index], ...updates };
    saveCollection(name, collection);
    return collection[index];
  }
  return null;
};

export const deleteFromCollection = <T extends { id?: string }>(name: string, id: string) => {
  const collection = getCollection<T>(name);
  const filtered = collection.filter((item: any) => item.id !== id);
  saveCollection(name, filtered);
};

export const ensureSystemAccounts = async (companyId: string) => {
  const accounts = getCollection<Account>('accounts');
  const systemAccounts = [
    { code: '1100', name: 'Cash', type: 'Asset' },
    { code: '1200', name: 'Accounts Receivable', type: 'Asset' },
    { code: '1300', name: 'Inventory', type: 'Asset' },
    { code: '2100', name: 'Accounts Payable', type: 'Liability' },
    { code: '4100', name: 'Sales Revenue', type: 'Revenue' },
    { code: '5100', name: 'Cost of Goods Sold', type: 'Expense' },
  ];

  let changed = false;
  for (const acc of systemAccounts) {
    const exists = accounts.find((a: any) => a.companyId === companyId && a.name === acc.name);
    if (!exists) {
      accounts.push({
        ...acc,
        id: Math.random().toString(36).substring(7),
        companyId,
        balance: 0,
        isSystem: true,
        createdAt: new Date().toISOString()
      } as Account);
      changed = true;
    }
  }
  if (changed) saveCollection('accounts', accounts);
};

const findAccount = async (companyId: string, criteria: { name?: string, type?: string }) => {
  const accounts = getCollection<Account>('accounts');
  
  let account = accounts.find((a: any) => 
    a.companyId === companyId && 
    ((criteria.name && a.name === criteria.name) || (criteria.type && a.type === criteria.type))
  );

  if (!account) {
    await ensureSystemAccounts(companyId);
    const updatedAccounts = getCollection<Account>('accounts');
    account = updatedAccounts.find((a: any) => 
      a.companyId === companyId && 
      ((criteria.name && a.name === criteria.name) || (criteria.type && a.type === criteria.type))
    );
  }

  return account;
};

import { logAction } from './actionTrackingService';

export const createAccountingEntry = async (
  companyId: string,
  accountId: string,
  amount: number,
  type: 'debit' | 'credit',
  description: string,
  invoiceId?: string,
  userId?: string
) => {
  const accounts = getCollection<Account>('accounts');
  const accountIndex = accounts.findIndex((a: any) => a.id === accountId);
  
  if (accountIndex === -1) throw new Error("Account does not exist");
  const account = accounts[accountIndex];
  
  const isNaturalDebit = ['Asset', 'Expense'].includes(account.type);
  
  // Record Transaction
  addToCollection<Transaction>('transactions', {
    companyId,
    date: new Date().toISOString(),
    accountId,
    amount,
    type,
    description,
    invoiceId: invoiceId || undefined,
    userId: userId || undefined
  } as any);
  
  let balanceChange = 0;
  if (isNaturalDebit) {
    balanceChange = type === 'debit' ? amount : -amount;
  } else {
    balanceChange = type === 'credit' ? amount : -amount;
  }

  accounts[accountIndex].balance += balanceChange;
  saveCollection('accounts', accounts);

  await logAction({
    userId: userId || 'system',
    companyId,
    userName: 'System',
    action: 'CREATE_ACCOUNTING_ENTRY',
    module: 'Accounting',
    details: `Entry for account ${accountId}: ${type} of SAR ${amount} - ${description}`
  });
};

export const recordTreasuryMovement = async (
  companyId: string,
  type: 'income' | 'expense',
  amount: number,
  description: string,
  accountId: string,
  userId?: string
) => {
  const entryType = type === 'income' ? 'debit' : 'credit';
  await createAccountingEntry(companyId, accountId, amount, entryType, description, undefined, userId);
};

export const recordSupplierPayment = async (
  companyId: string,
  supplierId: string,
  amount: number,
  description: string,
  cashAccountId: string,
  userId?: string
) => {
  const suppliers = getCollection<any>('suppliers');
  const supplierIndex = suppliers.findIndex((s: any) => s.id === supplierId);
  if (supplierIndex === -1) throw new Error("Supplier not found");
  
  suppliers[supplierIndex].balance -= amount;
  saveCollection('suppliers', suppliers);

  addToCollection<Transaction>('transactions', {
    companyId,
    date: new Date().toISOString(),
    accountId: cashAccountId,
    amount,
    type: 'credit',
    description: `Payment to Supplier: ${suppliers[supplierIndex].name}. ${description}`,
    supplierId
  } as any);

  await logAction({
    userId: userId || 'system',
    companyId,
    userName: 'System',
    action: 'RECORD_SUPPLIER_PAYMENT',
    module: 'Treasury',
    details: `Payment of SAR ${amount} to supplier ${supplierId} - ${description}`
  });
};

export const recordSalesInvoice = async (
  companyId: string,
  invoice: any,
  cashAccountId?: string
) => {
  const revenueAccount = await findAccount(companyId, { name: 'Sales Revenue', type: 'Revenue' });
  if (!revenueAccount) throw new Error('Revenue account not found.');

  let debitAccountId = cashAccountId;
  if (!debitAccountId) {
    const arAccount = await findAccount(companyId, { name: 'Accounts Receivable', type: 'Asset' });
    if (!arAccount) throw new Error('Accounts Receivable account not found.');
    debitAccountId = arAccount.id;
  }

  const accounts = getCollection<Account>('accounts');
  const debitAccIndex = accounts.findIndex((a: any) => a.id === debitAccountId);
  const revenueAccIndex = accounts.findIndex((a: any) => a.id === revenueAccount.id);

  if (debitAccIndex === -1 || revenueAccIndex === -1) throw new Error("Accounts not found");

  // Update Balances
  accounts[debitAccIndex].balance += invoice.total;
  accounts[revenueAccIndex].balance += invoice.total;
  saveCollection('accounts', accounts);

  if (!cashAccountId && invoice.customerId) {
    const customers = getCollection<any>('customers');
    const customerIndex = customers.findIndex((c: any) => c.id === invoice.customerId);
    if (customerIndex !== -1) {
      customers[customerIndex].balance += invoice.total;
      customers[customerIndex].totalPurchases += invoice.total;
      saveCollection('customers', customers);
    }
  }

  addToCollection<Transaction>('transactions', {
    companyId,
    date: new Date().toISOString(),
    type: 'Sales Invoice' as any,
    description: `Invoice ${invoice.number}`,
    amount: invoice.total,
    invoiceId: invoice.id
  } as any);

  await logAction({
    userId: 'system',
    companyId,
    userName: 'System',
    action: 'RECORD_SALES_INVOICE',
    module: 'Sales',
    details: `Invoice ${invoice.number} - Total: SAR ${invoice.total}`
  });
};

export const recordPurchaseInvoice = async (
  companyId: string,
  invoice: any,
  cashAccountId?: string
) => {
  const inventoryAccount = await findAccount(companyId, { name: 'Inventory', type: 'Asset' });
  if (!inventoryAccount) throw new Error('Inventory account not found.');

  let creditAccountId = cashAccountId;
  if (!creditAccountId) {
    const apAccount = await findAccount(companyId, { name: 'Accounts Payable', type: 'Liability' });
    if (!apAccount) throw new Error('Accounts Payable account not found.');
    creditAccountId = apAccount.id;
  }

  const accounts = getCollection<Account>('accounts');
  const inventoryAccIndex = accounts.findIndex((a: any) => a.id === inventoryAccount.id);
  const creditAccIndex = accounts.findIndex((a: any) => a.id === creditAccountId);

  if (inventoryAccIndex === -1 || creditAccIndex === -1) throw new Error("Accounts not found");

  accounts[inventoryAccIndex].balance += invoice.total;
  accounts[creditAccIndex].balance += invoice.total;
  saveCollection('accounts', accounts);

  if (!cashAccountId && invoice.supplierId) {
    const suppliers = getCollection<any>('suppliers');
    const supplierIndex = suppliers.findIndex((s: any) => s.id === invoice.supplierId);
    if (supplierIndex !== -1) {
      suppliers[supplierIndex].balance += invoice.total;
      saveCollection('suppliers', suppliers);
    }
  }

  addToCollection<Transaction>('transactions', {
    companyId,
    date: new Date().toISOString(),
    type: 'Purchase Invoice' as any,
    description: `Purchase Invoice ${invoice.number}`,
    amount: invoice.total,
    invoiceId: invoice.id
  } as any);

  await logAction({
    userId: 'system',
    companyId,
    userName: 'System',
    action: 'RECORD_PURCHASE_INVOICE',
    module: 'Purchases',
    details: `Purchase Invoice ${invoice.number} - Total: SAR ${invoice.total}`
  });
};

export const recordExpense = async (
  companyId: string,
  amount: number,
  description: string,
  expenseAccountId: string,
  cashAccountId: string,
  userId?: string
) => {
  const accounts = getCollection<Account>('accounts');
  const expenseIndex = accounts.findIndex((a: any) => a.id === expenseAccountId);
  const cashIndex = accounts.findIndex((a: any) => a.id === cashAccountId);

  if (expenseIndex === -1 || cashIndex === -1) throw new Error("Account not found");

  accounts[expenseIndex].balance += amount;
  accounts[cashIndex].balance -= amount;
  saveCollection('accounts', accounts);

  addToCollection<Transaction>('transactions', {
    companyId,
    date: new Date().toISOString(),
    type: 'Expense' as any,
    description,
    amount,
    accountId: expenseAccountId,
    userId: userId || undefined
  } as any);

  await logAction({
    userId: userId || 'system',
    companyId,
    userName: 'System',
    action: 'RECORD_EXPENSE',
    module: 'Treasury',
    details: `Expense of SAR ${amount} - ${description}`
  });
};

export const recordCashMovement = async (
  companyId: string,
  amount: number,
  description: string,
  type: 'in' | 'out',
  cashAccountId: string,
  userId?: string
) => {
  const accounts = getCollection<Account>('accounts');
  const cashIndex = accounts.findIndex((a: any) => a.id === cashAccountId);
  if (cashIndex === -1) throw new Error("Cash account not found");

  accounts[cashIndex].balance += (type === 'in' ? amount : -amount);
  saveCollection('accounts', accounts);

  addToCollection<Transaction>('transactions', {
    companyId,
    date: new Date().toISOString(),
    type: (type === 'in' ? 'Cash In' : 'Cash Out') as any,
    description,
    amount,
    accountId: cashAccountId,
    userId: userId || undefined
  } as any);

  await logAction({
    userId: userId || 'system',
    companyId,
    userName: 'System',
    action: 'RECORD_CASH_MOVEMENT',
    module: 'Treasury',
    details: `Cash ${type} of SAR ${amount} - ${description}`
  });
};

export const recordCustomerPayment = async (
  companyId: string,
  customerId: string,
  amount: number,
  method: string,
  notes: string,
  cashAccountId: string,
  userId?: string
) => {
  const arAccount = await findAccount(companyId, { name: 'Accounts Receivable', type: 'Asset' });
  if (!arAccount) throw new Error('Accounts Receivable account not found.');

  const customers = getCollection<any>('customers');
  const customerIndex = customers.findIndex((c: any) => c.id === customerId);
  if (customerIndex === -1) throw new Error("Customer not found");

  customers[customerIndex].balance -= amount;
  customers[customerIndex].totalPaid += amount;
  saveCollection('customers', customers);

  addToCollection<Payment>('payments', {
    companyId,
    date: new Date().toISOString(),
    customerId,
    customerName: customers[customerIndex].name,
    amount,
    method,
    notes,
    userId: userId || 'system'
  } as any);

  const accounts = getCollection<Account>('accounts');
  const cashIndex = accounts.findIndex((a: any) => a.id === cashAccountId);
  const arIndex = accounts.findIndex((a: any) => a.id === arAccount.id);

  if (cashIndex !== -1) accounts[cashIndex].balance += amount;
  if (arIndex !== -1) accounts[arIndex].balance -= amount;
  saveCollection('accounts', accounts);

  addToCollection<Transaction>('transactions', {
    companyId,
    date: new Date().toISOString(),
    type: 'Customer Payment' as any,
    description: `Payment from Customer: ${customers[customerIndex].name}. ${notes}`,
    amount,
    customerId
  } as any);

  await logAction({
    userId: userId || 'system',
    companyId,
    userName: 'System',
    action: 'RECORD_CUSTOMER_PAYMENT',
    module: 'Treasury',
    details: `Payment of SAR ${amount} from customer ${customerId} - ${notes}`
  });
};

