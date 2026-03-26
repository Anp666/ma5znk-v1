import { getCollection, addToCollection } from './accountingService';

export interface UserAction {
  id: string;
  action: string;
  details: string;
  userId: string;
  companyId: string;
  userName?: string;
  module?: string;
  timestamp: any;
}

export const logAction = async (data: Omit<UserAction, 'id' | 'timestamp'>) => {
  try {
    addToCollection<UserAction>('logs', {
      ...data,
      timestamp: new Date().toISOString()
    } as any);
  } catch (error) {
    console.error("Error logging action:", error);
  }
};

export const getActions = (companyId: string, callback: (actions: UserAction[]) => void, max: number = 50) => {
  if (!companyId) return () => {};
  
  const loadActions = () => {
    const logs = getCollection<UserAction>('logs')
      .filter((log: UserAction) => log.companyId === companyId)
      .sort((a: UserAction, b: UserAction) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, max);
    callback(logs);
  };

  loadActions();
  window.addEventListener('storage', loadActions);
  return () => window.removeEventListener('storage', loadActions);
};
