import React, { useState, useEffect, useMemo } from 'react';
import { 
  Home, 
  PlusCircle, 
  PieChart as PieChartIcon, 
  Calculator as CalcIcon, 
  Settings, 
  Wallet, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  ArrowRightLeft, 
  PiggyBank, 
  ShieldAlert, 
  Trash2, 
  TrendingUp, 
  CheckCircle2, 
  Users, 
  HandCoins, 
  History, 
  Info, 
  CalendarDays, 
  Clock, 
  ChevronRight, 
  AlertCircle 
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend 
} from 'recharts';

import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

// --- Firebase Setup ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const isFirebaseConfigured = Object.keys(firebaseConfig).length > 0;

let app, auth, db;
if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Utils ---
const formatRupiah = (angka) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(Number(angka) || 0);
};

const formatNumberInput = (val) => {
  if (!val && val !== 0) return '';
  return String(val).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const parseNumberInput = (val) => {
  return String(val).replace(/\D/g, '');
};

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // --- State Utama ---
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts] = useState([]); 
  
  const defaultSettings = {
    limits: { daily: 50000, weekly: 300000, monthly: 1500000 },
    targets: { tabungan: 5000000, darurat: 2000000 },
    allocations: { kebutuhan: 50, tabungan: 30, darurat: 20 },
    categories: ['Makan & Jajan', 'Transportasi', 'Tagihan Kos', 'Listrik & Air', 'Hiburan', 'Lainnya']
  };

  const [settings, setSettingsApp] = useState(defaultSettings);
  const [showNotification, setShowNotification] = useState(false);
  const [calcInput, setCalcInput] = useState('');
  
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    category: 'Makan & Jajan',
    sourceWallet: 'Utama',
    destWallet: 'Tabungan',
    autoAllocate: true,
    cycle: 'weekly',
    person: '', 
    note: '',
    isCredit: false,
    date: new Date().toISOString().split('T')[0]
  });

  // --- Efek Zoom Lock & Auth ---
  useEffect(() => {
    // Force Viewport Lock Anti-Zoom
    const meta = document.querySelector('meta[name="viewport"]') || document.createElement('meta');
    meta.name = "viewport";
    meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
    document.getElementsByTagName('head')[0].appendChild(meta);

    if (!isFirebaseConfigured) {
      setUser({ uid: 'local-user' });
      return;
    }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {}
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!isFirebaseConfigured) {
      const localTrans = localStorage.getItem('finansialku_v3_transactions');
      const localDebts = localStorage.getItem('finansialku_v3_debts');
      const localSettings = localStorage.getItem('finansialku_v3_settings');
      if (localTrans) setTransactions(JSON.parse(localTrans));
      if (localDebts) setDebts(JSON.parse(localDebts));
      if (localSettings) {
        const saved = JSON.parse(localSettings);
        setSettingsApp({
          ...defaultSettings,
          ...saved,
          targets: { ...defaultSettings.targets, ...(saved.targets || {}) },
          limits: { ...defaultSettings.limits, ...(saved.limits || {}) },
          allocations: { ...defaultSettings.allocations, ...(saved.allocations || {}) }
        });
      }
      return;
    }
    const transactionsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
    const debtsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'debts');
    const settingsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'settings');

    const unsubTransactions = onSnapshot(transactionsRef, (snapshot) => {
      const trans = [];
      snapshot.forEach(doc => trans.push({ id: doc.data().id, ...doc.data() }));
      trans.sort((a, b) => b.id - a.id);
      setTransactions(trans);
    });

    const unsubDebts = onSnapshot(debtsRef, (snapshot) => {
      const dbts = [];
      snapshot.forEach(doc => dbts.push({ id: doc.data().id, ...doc.data() }));
      dbts.sort((a, b) => b.id - a.id);
      setDebts(dbts);
    });

    const unsubSettings = onSnapshot(settingsRef, (snapshot) => {
      snapshot.forEach(doc => {
        if (doc.id === 'app_settings') {
          const cloudData = doc.data();
          setSettingsApp({
            ...defaultSettings,
            ...cloudData,
            targets: { ...defaultSettings.targets, ...(cloudData.targets || {}) },
            limits: { ...defaultSettings.limits, ...(cloudData.limits || {}) },
            allocations: { ...defaultSettings.allocations, ...(cloudData.allocations || {}) }
          });
        }
      });
    });
    return () => { unsubTransactions(); unsubDebts(); unsubSettings(); };
  }, [user]);

  // --- Logika Kalkulasi ---
  const balances = useMemo(() => {
    const result = { Utama: 0, Tabungan: 0, Darurat: 0 };
    transactions.forEach(t => {
      const amount = Number(t.amount) || 0;
      if (t.type === 'income') {
        if (t.autoAllocate) {
          result.Utama += amount * (Number(settings?.allocations?.kebutuhan || 50) / 100);
          result.Tabungan += amount * (Number(settings?.allocations?.tabungan || 30) / 100);
          result.Darurat += amount * (Number(settings?.allocations?.darurat || 20) / 100);
        } else {
          if (result[t.destWallet] !== undefined) result[t.destWallet] += amount;
        }
      } else if (t.type === 'expense') {
        if (!t.isCredit && result[t.sourceWallet] !== undefined) result[t.sourceWallet] -= amount;
      } else if (t.type === 'transfer') {
        if (result[t.sourceWallet] !== undefined) result[t.sourceWallet] -= amount;
        if (result[t.destWallet] !== undefined) result[t.destWallet] += amount;
      } else if (t.type === 'debt_receive' || t.type === 'receivable_back') {
        result.Utama += amount;
      } else if (t.type === 'receivable_give' || t.type === 'debt_pay') {
        result.Utama -= amount;
      }
    });
    return result;
  }, [transactions, settings]);

  const totalSaldo = balances.Utama + balances.Tabungan + balances.Darurat;

  const limitsData = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const curr = new Date();
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(curr.setDate(diff)).toISOString().split('T')[0];
    const month = new Date().toISOString().substring(0, 7);

    const expensesUtama = transactions.filter(t => t.type === 'expense' && t.sourceWallet === 'Utama');
    const spentToday = expensesUtama.filter(t => t.date === today).reduce((a,c) => a + (Number(c.amount) || 0), 0);
    const spentWeek = expensesUtama.filter(t => t.cycle === 'weekly' && t.date >= monday).reduce((a,c) => a + (Number(c.amount) || 0), 0);
    const spentMonth = expensesUtama.filter(t => t.cycle === 'monthly' && t.date.startsWith(month)).reduce((a,c) => a + (Number(c.amount) || 0), 0);

    return { spentToday, spentWeek, spentMonth };
  }, [transactions]);

  // --- Handlers ---
  const handleCalcClick = (val) => {
    if (val === '=') {
      try { 
        const result = new Function('return ' + calcInput)();
        setCalcInput(String(result)); 
      } catch (e) { 
        setCalcInput('Error'); 
      }
    } else if (val === 'C') {
      setCalcInput('');
    } else {
      setCalcInput(prev => prev + val);
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!formData.amount || isNaN(formData.amount) || !user) return;
    const id = Date.now();
    let finalType = formData.type;
    let finalCategory = formData.category;

    if (formData.type === 'expense' && formData.isCredit) {
      const debtItem = { id: id + 1, type: 'debt', person: formData.person || 'Penjual', amount: parseFloat(formData.amount), note: `Bon: ${formData.category}`, date: formData.date, status: 'active' };
      if (!isFirebaseConfigured) {
        const dbtList = JSON.parse(localStorage.getItem('finansialku_v3_debts') || '[]');
        localStorage.setItem('finansialku_v3_debts', JSON.stringify([debtItem, ...dbtList]));
        setDebts([debtItem, ...debts]);
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'debts', debtItem.id.toString()), debtItem);
      }
      finalCategory = `Bon: ${formData.category}`;
    }

    if (formData.type === 'income') finalCategory = formData.autoAllocate ? 'Pendapatan (Split)' : 'Pendapatan Langsung';
    if (formData.type === 'transfer') finalCategory = `Transfer ${formData.sourceWallet} ➜ ${formData.destWallet}`;
    
    if (formData.type === 'debt' || formData.type === 'receivable') {
      const debtItem = { id, type: formData.type, person: formData.person || 'Anonim', amount: parseFloat(formData.amount), note: formData.note, date: formData.date, status: 'active' };
      if (!isFirebaseConfigured) {
        const dbtList = JSON.parse(localStorage.getItem('finansialku_v3_debts') || '[]');
        localStorage.setItem('finansialku_v3_debts', JSON.stringify([debtItem, ...dbtList]));
        setDebts([debtItem, ...debts]);
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'debts', id.toString()), debtItem);
      }
      finalType = formData.type === 'debt' ? 'debt_receive' : 'receivable_give';
      finalCategory = formData.type === 'debt' ? `Utang dari ${formData.person}` : `Pinjaman ke ${formData.person}`;
    }

    const transaction = { id, type: finalType, amount: parseFloat(formData.amount), category: finalCategory, sourceWallet: formData.sourceWallet, destWallet: (formData.type === 'income' && formData.autoAllocate) ? 'Split' : (formData.type === 'transfer' ? formData.destWallet : (formData.destWallet || formData.sourceWallet)), autoAllocate: formData.type === 'income' ? formData.autoAllocate : false, cycle: formData.type === 'expense' ? formData.cycle : null, isCredit: formData.type === 'expense' ? formData.isCredit : false, note: formData.note, date: formData.date };

    try {
      if (!isFirebaseConfigured) {
        const updatedTrans = [transaction, ...transactions];
        setTransactions(updatedTrans);
        localStorage.setItem('finansialku_v3_transactions', JSON.stringify(updatedTrans));
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id.toString()), transaction);
      }
      setFormData({ ...formData, amount: '', note: '', person: '', isCredit: false });
      setActiveTab('dashboard');
    } catch (err) {}
  };

  const handleSettleDebt = async (debt) => {
    if (!user) return;
    const settleId = Date.now();
    const transaction = { id: settleId, type: debt.type === 'debt' ? 'debt_pay' : 'receivable_back', amount: debt.amount, category: debt.type === 'debt' ? `Lunas Bon: ${debt.person}` : `Pinjaman Kembali: ${debt.person}`, sourceWallet: 'Utama', destWallet: 'Utama', date: new Date().toISOString().split('T')[0], note: `Pelunasan: ${debt.note || '-'}` };
    try {
      if (!isFirebaseConfigured) {
        const updatedDebts = debts.map(d => d.id === debt.id ? {...d, status: 'settled'} : d);
        setDebts(updatedDebts);
        localStorage.setItem('finansialku_v3_debts', JSON.stringify(updatedDebts));
        const updatedTrans = [transaction, ...transactions];
        setTransactions(updatedTrans);
        localStorage.setItem('finansialku_v3_transactions', JSON.stringify(updatedTrans));
      } else {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'debts', debt.id.toString()), { status: 'settled' });
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', settleId.toString()), transaction);
      }
    } catch (err) {}
  };

  const handleDeleteTransaction = async (id) => {
    if (!user) return;
    try {
      if (!isFirebaseConfigured) {
        const updatedTrans = transactions.filter(t => t.id !== id);
        setTransactions(updatedTrans);
        localStorage.setItem('finansialku_v3_transactions', JSON.stringify(updatedTrans));
      } else {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id.toString()));
      }
    } catch (err) {}
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    const totalAlloc = Number(settings.allocations.kebutuhan) + Number(settings.allocations.tabungan) + Number(settings.allocations.darurat);
    if (totalAlloc !== 100) { alert(`Total alokasi harus 100%. Saat ini: ${totalAlloc}%`); return; }
    try {
      if (!isFirebaseConfigured) { localStorage.setItem('finansialku_v2_settings', JSON.stringify(settings)); }
      else { await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'app_settings'), settings); }
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    } catch (err) {}
  };

  // --- Sub-Renders ---
  const renderDashboard = () => (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Saldo Section */}
      <div className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-blue-900 rounded-[2.5rem] p-7 text-white shadow-2xl relative overflow-hidden border border-white/10">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/20 rounded-full -mr-10 -mt-10 blur-3xl"></div>
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <h2 className="text-blue-200 text-[10px] font-black uppercase tracking-[0.2em]">Kekayaan Bersih</h2>
            <p className="text-4xl font-black tracking-tighter leading-tight">{formatRupiah(totalSaldo)}</p>
          </div>
          <div className="bg-white/10 p-2.5 rounded-2xl backdrop-blur-md border border-white/5">
            <TrendingUp size={22} className="text-blue-300" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-5 border-t border-white/10 text-center">
          <div><p className="text-[9px] text-blue-300 font-bold uppercase mb-0.5">Utama</p><p className="font-black text-xs sm:text-sm">{formatRupiah(balances.Utama)}</p></div>
          <div><p className="text-[9px] text-blue-300 font-bold uppercase mb-0.5">Tabung</p><p className="font-black text-xs sm:text-sm">{formatRupiah(balances.Tabungan)}</p></div>
          <div><p className="text-[9px] text-blue-300 font-bold uppercase mb-0.5">Darurat</p><p className="font-black text-xs sm:text-sm">{formatRupiah(balances.Darurat)}</p></div>
        </div>
      </div>

      {/* Monitoring Limit Cepat */}
      <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 space-y-4">
         <div className="flex items-center gap-2 px-1">
           <AlertCircle size={14} className="text-indigo-500" />
           <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Saran Limit Jajan (Utama)</h3>
         </div>
         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50/50 p-3 rounded-2xl space-y-2 border border-gray-100">
               <div className="flex justify-between text-[9px] font-black uppercase text-gray-500">
                  <span>Hari Ini</span>
                  <span className={limitsData.spentToday > (settings?.limits?.daily || 0) ? 'text-rose-600' : 'text-indigo-600'}>{formatRupiah(limitsData.spentToday)} / {formatRupiah(settings?.limits?.daily || 0)}</span>
               </div>
               <div className="w-full bg-gray-200/50 rounded-full h-2 overflow-hidden shadow-inner"><div className={`h-full transition-all duration-700 ${limitsData.spentToday > (settings?.limits?.daily || 0) ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min((limitsData.spentToday / (settings?.limits?.daily || 1)) * 100, 100)}%` }}></div></div>
            </div>
            <div className="bg-gray-50/50 p-3 rounded-2xl space-y-2 border border-gray-100">
               <div className="flex justify-between text-[9px] font-black uppercase text-gray-500">
                  <span>Minggu</span>
                  <span className={limitsData.spentWeek > (settings?.limits?.weekly || 0) ? 'text-rose-600' : 'text-indigo-600'}>{formatRupiah(limitsData.spentWeek)} / {formatRupiah(settings?.limits?.weekly || 0)}</span>
               </div>
               <div className="w-full bg-gray-200/50 rounded-full h-2 overflow-hidden shadow-inner"><div className={`h-full transition-all duration-700 ${limitsData.spentWeek > settings?.limits?.weekly ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${Math.min((limitsData.spentWeek / (settings?.limits?.weekly || 1)) * 100, 100)}%` }}></div></div>
            </div>
            <div className="bg-gray-50/50 p-3 rounded-2xl space-y-2 border border-gray-100">
               <div className="flex justify-between text-[9px] font-black uppercase text-gray-500">
                  <span>Bulan (Fix)</span>
                  <span className={limitsData.spentMonth > (settings?.limits?.monthly || 0) ? 'text-rose-600' : 'text-orange-600'}>{formatRupiah(limitsData.spentMonth)} / {formatRupiah(settings?.limits?.monthly || 0)}</span>
               </div>
               <div className="w-full bg-gray-200/50 rounded-full h-2 overflow-hidden shadow-inner"><div className={`h-full transition-all duration-700 ${limitsData.spentMonth > settings?.limits?.monthly ? 'bg-rose-500' : 'bg-orange-500'}`} style={{ width: `${Math.min((limitsData.spentMonth / (settings?.limits?.monthly || 1)) * 100, 100)}%` }}></div></div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-1">
        <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm active:scale-95 transition-transform text-center" onClick={() => setActiveTab('debts')}>
           <p className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-2 justify-center"><ArrowUpCircle size={14} className="text-rose-400"/> Utang & Bon</p>
           <p className="text-lg font-black text-rose-600">{formatRupiah(debts.filter(d => d.type === 'debt' && d.status === 'active').reduce((a,c) => a + (Number(c.amount) || 0), 0))}</p>
        </div>
        <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm active:scale-95 transition-transform text-center" onClick={() => setActiveTab('debts')}>
           <p className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center gap-2 justify-center"><ArrowDownCircle size={14} className="text-indigo-400"/> Piutang</p>
           <p className="text-lg font-black text-indigo-600">{formatRupiah(debts.filter(d => d.type === 'receivable' && d.status === 'active').reduce((a,c) => a + (Number(c.amount) || 0), 0))}</p>
        </div>
      </div>

      <div className="px-1">
        <div className="flex justify-between items-center mb-4 px-2">
          <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <History size={14} /> Riwayat Terakhir
          </h3>
          <button className="text-[10px] font-bold text-indigo-600 uppercase" onClick={() => setActiveTab('laporan')}>Laporan <ChevronRight size={10}/></button>
        </div>
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-50 divide-y divide-gray-50 overflow-hidden">
          {transactions.slice(0, 5).map(t => (
            <div key={t.id} className="p-5 flex items-center justify-between active:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl ${t.type.includes('income') || t.type === 'receivable_back' ? 'bg-emerald-50 text-emerald-600' : t.type === 'transfer' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                  {t.type.includes('income') || t.type === 'receivable_back' ? <ArrowDownCircle size={22} /> : t.type === 'transfer' ? <ArrowRightLeft size={22} /> : <ArrowUpCircle size={22} />}
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{t.category}</p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">{t.date} • {t.isCredit ? 'BON (UTANG)' : `DANA: ${t.sourceWallet || t.destWallet}`}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-black text-sm ${t.type.includes('income') || t.type === 'receivable_back' ? 'text-emerald-600' : t.type === 'transfer' ? 'text-indigo-600' : 'text-rose-600'}`}>{t.type.includes('income') || t.type === 'receivable_back' ? '+' : ''}{formatRupiah(t.amount)}</span>
                <button onClick={() => handleDeleteTransaction(t.id)} className="text-gray-200 active:text-rose-500"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          {transactions.length === 0 && <p className="p-10 text-center text-gray-400 italic">Belum ada data.</p>}
        </div>
      </div>
    </div>
  );

  const renderLaporan = () => {
    // Perbaikan: Pastikan grafik terhitung dan ter-render
    const chartWeekly = transactions.filter(t => t.type === 'expense' && t.cycle === 'weekly').reduce((acc, curr) => { acc[curr.category] = (acc[curr.category] || 0) + curr.amount; return acc; }, {});
    const chartMonthly = transactions.filter(t => t.type === 'expense' && t.cycle === 'monthly').reduce((acc, curr) => { acc[curr.category] = (acc[curr.category] || 0) + curr.amount; return acc; }, {});
    const dataW = Object.keys(chartWeekly).map(key => ({ name: key, value: chartWeekly[key] }));
    const dataM = Object.keys(chartMonthly).map(key => ({ name: key, value: chartMonthly[key] }));

    return (
      <div className="space-y-6 animate-fade-in pb-24">
        {/* Card 1: Target Dana */}
        <div className="bg-white p-7 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-8">
           <h3 className="font-black text-gray-900 uppercase text-sm tracking-tighter flex items-center gap-2">
             <PieChartIcon size={20} className="text-blue-600" /> Analisis Target & Progres
           </h3>
           <div className="space-y-10 px-1">
              <div className="space-y-3">
                 <div className="flex justify-between text-[10px] font-black uppercase text-gray-400"><span className="flex items-center gap-2"><PiggyBank size={14}/> Target Tabungan</span><span>{formatRupiah(balances.Tabungan)} / {formatRupiah(settings?.targets?.tabungan || 0)}</span></div>
                 <div className="w-full bg-gray-100 rounded-full h-5 relative overflow-hidden shadow-inner"><div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${Math.min((balances.Tabungan / (settings?.targets?.tabungan || 1)) * 100, 100)}%` }}></div><span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white uppercase">{Math.round((balances.Tabungan / (settings?.targets?.tabungan || 1)) * 100)}%</span></div>
              </div>
              <div className="space-y-3">
                 <div className="flex justify-between text-[10px] font-black uppercase text-gray-400"><span className="flex items-center gap-2"><ShieldAlert size={14}/> Target Darurat</span><span>{formatRupiah(balances.Darurat)} / {formatRupiah(settings?.targets?.darurat || 0)}</span></div>
                 <div className="w-full bg-gray-100 rounded-full h-5 relative overflow-hidden shadow-inner"><div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${Math.min((balances.Darurat / (settings?.targets?.darurat || 1)) * 100, 100)}%` }}></div><span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white uppercase">{Math.round((balances.Darurat / (settings?.targets?.darurat || 1)) * 100)}%</span></div>
              </div>
           </div>
        </div>

        {/* Card 2 & 3: Pie Charts (YANG SEBELUMNYA GADA) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-7 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h3 className="font-black text-gray-800 mb-6 uppercase text-[10px] tracking-widest flex items-center gap-2"><CalendarDays size={16} className="text-indigo-400"/> Jajan Mingguan</h3>
            <div className="h-64">
              {dataW.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dataW} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                      {dataW.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={10} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatRupiah(value)} />
                    <Legend iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="h-full flex items-center justify-center text-xs text-gray-400 italic">Data mingguan kosong.</p>}
            </div>
          </div>

          <div className="bg-white p-7 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h3 className="font-black text-gray-800 mb-6 uppercase text-[10px] tracking-widest flex items-center gap-2"><Info size={16} className="text-orange-400"/> Tagihan Bulanan</h3>
            <div className="h-64">
              {dataM.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dataM} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                      {dataM.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={10} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatRupiah(value)} />
                    <Legend iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="h-full flex items-center justify-center text-xs text-gray-400 italic">Data bulanan kosong.</p>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderInputData = () => (
    <div className="max-w-md mx-auto space-y-6 animate-fade-in pb-24 px-1">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
        <h2 className="text-2xl font-black text-gray-800 mb-8 text-center uppercase tracking-tighter">Tambah Transaksi</h2>
        <div className="flex gap-1 mb-8 p-1.5 bg-gray-100 rounded-2xl overflow-x-auto no-scrollbar">
          {['expense', 'income', 'transfer', 'debt', 'receivable'].map(type => (
            <button key={type} onClick={() => setFormData({...formData, type, isCredit: false})} className={`flex-1 py-2.5 px-4 rounded-xl font-black text-[10px] uppercase transition-all whitespace-nowrap ${formData.type === type ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}>
              {type === 'debt' ? 'Utang' : type === 'receivable' ? 'Piutang' : type}
            </button>
          ))}
        </div>
        <form onSubmit={handleAddTransaction} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 text-center sm:text-left">NOMINAL (RP)</label>
            <input type="text" inputMode="numeric" required value={formatNumberInput(formData.amount)} onChange={(e) => setFormData({...formData, amount: parseNumberInput(e.target.value)})} className="w-full p-5 bg-gray-50 border-0 rounded-3xl text-3xl font-black text-center sm:text-left focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" placeholder="0" />
          </div>
          {formData.type === 'expense' && (
            <div className={`flex items-center gap-3 p-5 rounded-3xl border-2 transition-all cursor-pointer ${formData.isCredit ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 border-transparent'}`} onClick={() => setFormData({...formData, isCredit: !formData.isCredit})}>
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${formData.isCredit ? 'bg-rose-600 border-rose-600' : 'bg-white border-gray-200'}`}>{formData.isCredit && <CheckCircle2 size={14} className="text-white"/>}</div>
              <div className="flex-1"><p className={`text-sm font-black ${formData.isCredit ? 'text-rose-800' : 'text-gray-600'}`}>Bon / Ngutang Jajan</p><p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight leading-none">Limit potong, saldo tetap.</p></div>
            </div>
          )}
          {formData.isCredit && <input type="text" required value={formData.person} onChange={(e) => setFormData({...formData, person: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-sm" placeholder="Pinjam/Utang ke siapa?" />}
          <div className="grid grid-cols-2 gap-3">
             {(formData.type === 'expense' || formData.type === 'income' || formData.type === 'transfer') && (
                <div className="space-y-1">
                   <label className="text-[8px] font-black text-gray-400 uppercase ml-1">Dari Dana</label>
                   <select value={formData.sourceWallet} onChange={(e) => setFormData({...formData, sourceWallet: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-black text-xs">
                     <option value="Utama">Utama</option>
                     <option value="Tabungan">Tabungan</option>
                     <option value="Darurat">Darurat</option>
                   </select>
                </div>
             )}
             {formData.type === 'expense' && (
                <div className="space-y-1">
                   <label className="text-[8px] font-black text-gray-400 uppercase ml-1">Jenis Limit</label>
                   <select value={formData.cycle} onChange={(e) => setFormData({...formData, cycle: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-black text-xs text-indigo-600">
                     <option value="weekly">Mingguan</option>
                     <option value="monthly">Bulanan</option>
                   </select>
                </div>
             )}
             {formData.type === 'transfer' && (
                <div className="space-y-1">
                   <label className="text-[8px] font-black text-gray-400 uppercase ml-1">Kirim Ke</label>
                   <select value={formData.destWallet} onChange={(e) => setFormData({...formData, destWallet: e.target.value})} className="w-full p-4 bg-blue-50 text-blue-600 border-0 rounded-2xl font-bold text-xs">
                     <option value="Tabungan">Tabungan</option>
                     <option value="Darurat">Darurat</option>
                     <option value="Utama">Utama</option>
                   </select>
                </div>
             )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
               <label className="text-[8px] font-black text-gray-400 uppercase ml-1">Tanggal</label>
               <input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs" />
            </div>
            {formData.type === 'expense' && (
              <div className="space-y-1">
                <label className="text-[8px] font-black text-gray-400 uppercase ml-1">Kategori</label>
                <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs">
                  {settings.categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
          <button type="submit" className={`w-full py-5 rounded-[2rem] text-white font-black text-sm tracking-[0.2em] transition-all shadow-xl active:scale-95 uppercase ${formData.type === 'income' ? 'bg-emerald-600 shadow-emerald-200' : (formData.type === 'debt' || formData.type === 'receivable' || formData.type === 'transfer') ? 'bg-indigo-600 shadow-indigo-200' : 'bg-rose-600 shadow-rose-200'}`}>SIMPAN DATA</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-indigo-100">
      {/* Header Ramping untuk Mobile */}
      <header className="bg-white/90 backdrop-blur-xl sticky top-0 z-40 px-6 py-3.5 lg:hidden border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5"><div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-100"><Wallet size={16} className="text-white" /></div><h1 className="text-sm font-black text-gray-900 tracking-tighter uppercase">FinansialKu</h1></div>
          <div className="flex items-center gap-2"><div className="text-right hidden sm:block"><p className="text-[10px] font-black text-indigo-600 leading-none">{formatRupiah(totalSaldo)}</p></div><button onClick={() => setActiveTab('pengaturan')} className={`p-2 rounded-xl transition-colors ${activeTab === 'pengaturan' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}><Settings size={18} /></button></div>
        </div>
      </header>

      {/* Sidebar untuk Desktop */}
      <aside className="hidden lg:flex w-80 bg-white border-r border-gray-100 fixed h-screen flex-col py-12 z-20">
        <div className="px-10 flex items-center gap-4 text-2xl font-black text-gray-900 mb-16 tracking-tighter"><div className="p-3 bg-indigo-600 text-white rounded-3xl shadow-xl shadow-indigo-100"><Wallet size={24} /></div> FinansialKu</div>
        <div className="flex flex-col gap-2 px-8 w-full overflow-y-auto">
          <SidebarItem icon={<Home />} label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={<PlusCircle />} label="Catat Transaksi" isActive={activeTab === 'input'} onClick={() => setActiveTab('input')} isAction />
          <SidebarItem icon={<HandCoins />} label="Utang & Bon" isActive={activeTab === 'debts'} onClick={() => setActiveTab('debts')} />
          <SidebarItem icon={<PieChartIcon />} label="Laporan Detail" isActive={activeTab === 'laporan'} onClick={() => setActiveTab('laporan')} />
          <SidebarItem icon={<CalcIcon />} label="Kalkulator" isActive={activeTab === 'kalkulator'} onClick={() => setActiveTab('kalkulator')} />
          <SidebarItem icon={<Settings />} label="Sistem Pengaturan" isActive={activeTab === 'pengaturan'} onClick={() => setActiveTab('pengaturan')} />
        </div>
      </aside>

      {/* Konten Utama */}
      <main className="flex-1 lg:ml-80 p-4 sm:p-6 md:p-12 max-w-5xl mx-auto w-full">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'input' && renderInputData()}
          {activeTab === 'debts' && <div className="animate-fade-in"><DebtList debts={debts} onSettle={handleSettleDebt} /></div>}
          {activeTab === 'laporan' && renderLaporan()}
          {activeTab === 'kalkulator' && <div className="flex items-center justify-center pt-4 sm:pt-8"><Calculator input={calcInput} onKey={handleCalcClick} /></div>}
          {activeTab === 'pengaturan' && <SettingsPage settings={settings} onSave={handleSaveSettings} setSettings={setSettingsApp} showNotif={showNotification} />}
      </main>

      {/* NAVIGATION BAWAH - DIPASTIKAN LENGKAP UNTUK HP */}
      <nav className="lg:hidden fixed bottom-4 left-4 right-4 h-18 bg-gray-950/98 backdrop-blur-3xl rounded-[2.2rem] px-2 flex justify-between items-center z-50 shadow-2xl border border-white/5">
        <NavItem icon={<Home />} label="Home" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavItem icon={<PieChartIcon />} label="Report" isActive={activeTab === 'laporan'} onClick={() => setActiveTab('laporan')} />
        
        {/* Tombol Plus di Tengah */}
        <button onClick={() => setActiveTab('input')} className="bg-indigo-600 text-white p-4 rounded-full shadow-2xl transform -translate-y-7 active:scale-90 transition-all border-[6px] border-gray-900 ring-4 ring-indigo-500/10">
          <PlusCircle size={22} />
        </button>

        <NavItem icon={<HandCoins />} label="Debt" isActive={activeTab === 'debts'} onClick={() => setActiveTab('debts')} />
        <NavItem icon={<CalcIcon />} label="Calc" isActive={activeTab === 'kalkulator'} onClick={() => setActiveTab('kalkulator')} />
        <NavItem icon={<Settings />} label="Set" isActive={activeTab === 'pengaturan'} onClick={() => setActiveTab('pengaturan')} />
      </nav>
    </div>
  );
}

// --- Komponen Penunjang ---
function SidebarItem({ icon, label, isActive, onClick, isAction }) {
  return (<button onClick={onClick} className={`flex items-center gap-4 px-6 py-4 rounded-[1.8rem] transition-all w-full text-left font-black text-xs uppercase tracking-tighter ${isActive && !isAction ? 'bg-indigo-50 text-indigo-600' : ''} ${!isActive && !isAction ? 'text-gray-400 hover:bg-gray-50 hover:text-gray-600' : ''} ${isAction ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 mt-6 mb-6' : ''}`}>{React.cloneElement(icon, { size: 18 })} <span>{label}</span></button>);
}

function NavItem({ icon, label, isActive, onClick }) {
  return (<button onClick={onClick} className={`flex flex-col items-center gap-1.5 transition-all flex-1 py-3 ${isActive ? 'text-white scale-110' : 'text-gray-500 opacity-60'}`}>{React.cloneElement(icon, { size: 18 })}<span className="text-[7px] font-black uppercase tracking-widest leading-none">{label}</span></button>);
}

function DebtList({ debts, onSettle }) {
  const activeDebts = debts.filter(d => d.status === 'active');
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm"><p className="text-[10px] font-black text-gray-400 uppercase mb-1">Total Utang</p><p className="text-xl font-black text-rose-500">{formatRupiah(activeDebts.filter(d => d.type === 'debt').reduce((a,c)=>a+(Number(c.amount)||0),0))}</p></div>
        <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm"><p className="text-[10px] font-black text-gray-400 uppercase mb-1">Total Piutang</p><p className="text-xl font-black text-indigo-500">{formatRupiah(activeDebts.filter(d => d.type === 'receivable').reduce((a,c)=>a+(Number(c.amount)||0),0))}</p></div>
      </div>
      <h3 className="text-[10px] font-black text-gray-400 px-4 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><HandCoins size={16} className="text-amber-500" /> Daftar Tagihan Aktif</h3>
      <div className="space-y-3 px-1">
        {activeDebts.map(d => (
          <div key={d.id} className="bg-white p-5 rounded-3xl border border-gray-50 shadow-sm flex items-center justify-between active:bg-gray-50 transition-colors">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${d.type === 'debt' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}><Users size={18} /></div>
              <div><p className="font-black text-gray-800 text-xs uppercase leading-tight">{d.person}</p><p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{d.date}</p></div>
            </div>
            <div className="text-right space-y-2">
              <p className={`font-black text-sm ${d.type === 'debt' ? 'text-rose-500' : 'text-indigo-500'}`}>{formatRupiah(d.amount)}</p>
              <button onClick={() => onSettle(d)} className="text-[8px] font-black px-4 py-1.5 bg-gray-900 text-white rounded-full uppercase tracking-widest shadow-md active:scale-90 transition-transform">LUNAS</button>
            </div>
          </div>
        ))}
        {activeDebts.length === 0 && <div className="p-16 text-center text-gray-300 font-bold uppercase text-[10px] tracking-[0.2em]">Dompet Kamu Bersih!</div>}
      </div>
    </div>
  );
}

function Calculator({ input, onKey }) {
  const buttons = ['7','8','9','/','4','5','6','*','1','2','3','-','C','0','=','+'];
  return (
    <div className="bg-gray-950 p-6 sm:p-8 rounded-[3.5rem] shadow-2xl border-[10px] border-gray-900 max-w-xs w-full">
      <div className="bg-gray-900 p-6 rounded-2xl mb-8 text-right h-18 flex items-center justify-end overflow-hidden border border-white/5 shadow-inner"><span className="text-3xl font-mono font-bold text-white truncate tracking-tighter">{input || '0'}</span></div>
      <div className="grid grid-cols-4 gap-3.5">
        {buttons.map((btn, idx) => (
          <button key={idx} onClick={() => onKey(btn)} className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full text-xl font-black flex items-center justify-center transition-all active:scale-90 ${btn === 'C' ? 'bg-rose-600 text-white' : btn === '=' ? 'bg-indigo-600 text-white' : isNaN(btn) ? 'bg-gray-900 text-indigo-400 border border-white/5' : 'bg-gray-900 text-gray-300 border border-white/5'}`}>{btn}</button>
        ))}
      </div>
    </div>
  );
}

function SettingsPage({ settings, onSave, setSettings, showNotif }) {
  return (
    <div className="max-w-md mx-auto bg-white p-8 md:p-10 rounded-[3rem] shadow-sm border border-gray-100 pb-24">
      <h2 className="text-xl font-black text-gray-900 mb-10 flex items-center gap-3 uppercase tracking-tighter"><Settings size={22} className="text-gray-300" /> Sistem</h2>
      <div className="space-y-10">
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b pb-2">Limit Jajan (Per Siklus)</h3>
          <div><label className="text-[9px] font-black text-gray-500 uppercase ml-1">Jatah Harian</label><input type="text" value={formatNumberInput(settings?.limits?.daily)} onChange={(e) => setSettings({...settings, limits: {...settings.limits, daily: Number(parseNumberInput(e.target.value))}})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-sm" /></div>
          <div><label className="text-[9px] font-black text-gray-500 uppercase ml-1">Target Mingguan</label><input type="text" value={formatNumberInput(settings?.limits?.weekly)} onChange={(e) => setSettings({...settings, limits: {...settings.limits, weekly: Number(parseNumberInput(e.target.value))}})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-sm" /></div>
          <div><label className="text-[9px] font-black text-gray-500 uppercase ml-1">Tagihan Bulanan</label><input type="text" value={formatNumberInput(settings?.limits?.monthly)} onChange={(e) => setSettings({...settings, limits: {...settings.limits, monthly: Number(parseNumberInput(e.target.value))}})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-sm" /></div>
        </section>
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b pb-2">Target Dana Utama</h3>
          <div><label className="text-[9px] font-black text-gray-500 uppercase ml-1">Goal Tabungan</label><input type="text" value={formatNumberInput(settings?.targets?.tabungan)} onChange={(e) => setSettings({...settings, targets: {...settings.targets, tabungan: Number(parseNumberInput(e.target.value))}})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-sm" /></div>
          <div><label className="text-[9px] font-black text-gray-500 uppercase ml-1">Goal Darurat</label><input type="text" value={formatNumberInput(settings?.targets?.darurat)} onChange={(e) => setSettings({...settings, targets: {...settings.targets, darurat: Number(parseNumberInput(e.target.value))}})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-sm" /></div>
        </section>
        {showNotif && <div className="p-4 bg-gray-900 text-white rounded-2xl text-center font-black text-[10px] uppercase animate-pulse">Update Berhasil!</div>}
        <button onClick={onSave} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xs tracking-widest active:scale-95 transition-all uppercase">Simpan Perubahan</button>
      </div>
    </div>
  );
}