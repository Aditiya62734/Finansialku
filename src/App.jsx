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
  Clock
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
  }).format(angka || 0);
};

const formatNumberInput = (val) => {
  if (!val) return '';
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
  
  const [settings, setSettingsApp] = useState({
    limits: { weekly: 300000, monthly: 1500000 },
    targets: { tabungan: 5000000, darurat: 2000000 },
    allocations: { kebutuhan: 50, tabungan: 30, darurat: 20 },
    categories: ['Makan & Jajan', 'Transportasi', 'Tagihan Kos', 'Listrik & Air', 'Hiburan', 'Lainnya']
  });

  const [showNotification, setShowNotification] = useState(false);
  const [calcInput, setCalcInput] = useState('');
  
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    category: 'Makan & Jajan',
    sourceWallet: 'Utama',
    destWallet: 'Tabungan', // Default tujuan transfer
    autoAllocate: true,
    cycle: 'weekly',
    person: '', 
    note: '',
    isCredit: false,
    date: new Date().toISOString().split('T')[0]
  });

  // --- Efek & Listener ---
  useEffect(() => {
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
      const localTrans = localStorage.getItem('finansialku_v2_transactions');
      const localDebts = localStorage.getItem('finansialku_v2_debts');
      const localSettings = localStorage.getItem('finansialku_v2_settings');
      
      if (localTrans) setTransactions(JSON.parse(localTrans));
      if (localDebts) setDebts(JSON.parse(localDebts));
      if (localSettings) setSettingsApp(JSON.parse(localSettings));
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
        if (doc.id === 'app_settings') setSettingsApp(doc.data());
      });
    });

    return () => { unsubTransactions(); unsubDebts(); unsubSettings(); };
  }, [user]);

  // --- Logika Kalkulasi Saldo ---
  const balances = useMemo(() => {
    const result = { Utama: 0, Tabungan: 0, Darurat: 0 };
    transactions.forEach(t => {
      const amount = Number(t.amount);
      if (t.type === 'income') {
        if (t.autoAllocate) {
          result.Utama += amount * (Number(settings.allocations.kebutuhan) / 100);
          result.Tabungan += amount * (Number(settings.allocations.tabungan) / 100);
          result.Darurat += amount * (Number(settings.allocations.darurat) / 100);
        } else {
          if (result[t.destWallet] !== undefined) result[t.destWallet] += amount;
        }
      } else if (t.type === 'expense') {
        if (!t.isCredit && result[t.sourceWallet] !== undefined) {
          result[t.sourceWallet] -= amount;
        }
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
  }, [transactions, settings.allocations]);

  const totalSaldo = balances.Utama + balances.Tabungan + balances.Darurat;

  // --- Perhitungan Limit & Grafik ---
  const currentWeek = useMemo(() => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + 1;
    const monday = new Date(curr.setDate(first)).toISOString().split('T')[0];
    const sunday = new Date(curr.setDate(first + 6)).toISOString().split('T')[0];
    return { monday, sunday };
  }, []);

  const currentMonth = new Date().toISOString().substring(0, 7);

  const expenseThisWeek = transactions
    .filter(t => t.type === 'expense' && t.cycle === 'weekly' && t.sourceWallet === 'Utama' && t.date >= currentWeek.monday && t.date <= currentWeek.sunday)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const expenseThisMonth = transactions
    .filter(t => t.type === 'expense' && t.cycle === 'monthly' && t.sourceWallet === 'Utama' && t.date.startsWith(currentMonth))
    .reduce((acc, curr) => acc + curr.amount, 0);

  const chartDataWeekly = useMemo(() => {
    const data = transactions.filter(t => t.type === 'expense' && t.cycle === 'weekly');
    const grouped = data.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
      return acc;
    }, {});
    return Object.keys(grouped).map(key => ({ name: key, value: grouped[key] }));
  }, [transactions]);

  const chartDataMonthly = useMemo(() => {
    const data = transactions.filter(t => t.type === 'expense' && t.cycle === 'monthly');
    const grouped = data.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
      return acc;
    }, {});
    return Object.keys(grouped).map(key => ({ name: key, value: grouped[key] }));
  }, [transactions]);

  // --- Handlers ---
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!formData.amount || isNaN(formData.amount) || !user) return;

    const id = Date.now();
    let finalType = formData.type;
    let finalCategory = formData.category;

    if (formData.type === 'expense' && formData.isCredit) {
      const debtItem = {
        id: id + 1,
        type: 'debt',
        person: formData.person || 'Penjual',
        amount: parseFloat(formData.amount),
        note: `Bon Jajan: ${formData.category} (${formData.note})`,
        date: formData.date,
        status: 'active'
      };
      if (!isFirebaseConfigured) {
        const updatedDebts = [debtItem, ...debts];
        setDebts(updatedDebts);
        localStorage.setItem('finansialku_v2_debts', JSON.stringify(updatedDebts));
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'debts', debtItem.id.toString()), debtItem);
      }
      finalCategory = `Bon: ${formData.category}`;
    }

    if (formData.type === 'income') finalCategory = formData.autoAllocate ? 'Pendapatan (Split)' : 'Pendapatan Langsung';
    if (formData.type === 'transfer') finalCategory = `Transfer ${formData.sourceWallet} ➜ ${formData.destWallet}`;
    
    if (formData.type === 'debt' || formData.type === 'receivable') {
      const debtItem = {
        id,
        type: formData.type,
        person: formData.person || 'Anonim',
        amount: parseFloat(formData.amount),
        note: formData.note,
        date: formData.date,
        status: 'active'
      };
      if (!isFirebaseConfigured) {
        const updatedDebts = [debtItem, ...debts];
        setDebts(updatedDebts);
        localStorage.setItem('finansialku_v2_debts', JSON.stringify(updatedDebts));
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'debts', id.toString()), debtItem);
      }
      finalType = formData.type === 'debt' ? 'debt_receive' : 'receivable_give';
      finalCategory = formData.type === 'debt' ? `Utang dari ${formData.person}` : `Pinjaman ke ${formData.person}`;
    }

    const transaction = {
      id,
      type: finalType,
      amount: parseFloat(formData.amount),
      category: finalCategory,
      sourceWallet: formData.sourceWallet,
      destWallet: (formData.type === 'income' && formData.autoAllocate) ? 'Split' : (formData.type === 'transfer' ? formData.destWallet : (formData.destWallet || formData.sourceWallet)),
      autoAllocate: formData.type === 'income' ? formData.autoAllocate : false,
      cycle: formData.type === 'expense' ? formData.cycle : null,
      isCredit: formData.type === 'expense' ? formData.isCredit : false,
      note: formData.note,
      date: formData.date
    };

    try {
      if (!isFirebaseConfigured) {
        const updatedTrans = [transaction, ...transactions];
        setTransactions(updatedTrans);
        localStorage.setItem('finansialku_v2_transactions', JSON.stringify(updatedTrans));
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
    const isDebt = debt.type === 'debt';
    const transaction = {
      id: settleId,
      type: isDebt ? 'debt_pay' : 'receivable_back',
      amount: debt.amount,
      category: isDebt ? `Lunas Bon: ${debt.person}` : `Pinjaman Balik: ${debt.person}`,
      sourceWallet: 'Utama',
      destWallet: 'Utama',
      date: new Date().toISOString().split('T')[0],
      note: `Pelunasan: ${debt.note || '-'}`
    };
    try {
      if (!isFirebaseConfigured) {
        const updatedDebts = debts.map(d => d.id === debt.id ? {...d, status: 'settled'} : d);
        setDebts(updatedDebts);
        localStorage.setItem('finansialku_v2_debts', JSON.stringify(updatedDebts));
        const updatedTrans = [transaction, ...transactions];
        setTransactions(updatedTrans);
        localStorage.setItem('finansialku_v2_transactions', JSON.stringify(updatedTrans));
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
        localStorage.setItem('finansialku_v2_transactions', JSON.stringify(updatedTrans));
      } else {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id.toString()));
      }
    } catch (err) {}
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    const totalAlloc = Number(settings.allocations.kebutuhan) + Number(settings.allocations.tabungan) + Number(settings.allocations.darurat);
    if (totalAlloc !== 100) {
      alert(`Total alokasi harus 100%. Saat ini: ${totalAlloc}%`);
      return;
    }
    try {
      if (!isFirebaseConfigured) {
        localStorage.setItem('finansialku_v2_settings', JSON.stringify(settings));
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'app_settings'), settings);
      }
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    } catch (err) {}
  };

  const handleCalcClick = (val) => {
    if (val === '=') {
      try { setCalcInput(String(new Function('return ' + calcInput)())); } catch (e) { setCalcInput('Error'); }
    } else if (val === 'C') {
      setCalcInput('');
    } else {
      setCalcInput(prev => prev + val);
    }
  };

  // --- UI Components ---
  const renderDashboard = () => (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="bg-gradient-to-br from-indigo-900 via-blue-900 to-indigo-950 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden border border-white/10">
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-blue-300 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Kekayaan Bersih</h2>
            <p className="text-4xl font-black tracking-tighter">{formatRupiah(totalSaldo)}</p>
          </div>
          <div className="bg-white/10 p-3 rounded-[1.5rem] backdrop-blur-md border border-white/5">
            <TrendingUp size={24} className="text-blue-300" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/5">
          <div><p className="text-[9px] text-blue-400 font-bold uppercase mb-1">Utama</p><p className="font-black text-sm">{formatRupiah(balances.Utama)}</p></div>
          <div><p className="text-[9px] text-blue-400 font-bold uppercase mb-1">Tabungan</p><p className="font-black text-sm">{formatRupiah(balances.Tabungan)}</p></div>
          <div><p className="text-[9px] text-blue-400 font-bold uppercase mb-1">Darurat</p><p className="font-black text-sm">{formatRupiah(balances.Darurat)}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm transition-transform active:scale-95 text-center">
           <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Utang Saya</p>
           <p className="text-lg font-black text-rose-600">{formatRupiah(debts.filter(d => d.type === 'debt' && d.status === 'active').reduce((a,c) => a + c.amount, 0))}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm transition-transform active:scale-95 text-center">
           <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Piutang Saya</p>
           <p className="text-lg font-black text-indigo-600">{formatRupiah(debts.filter(d => d.type === 'receivable' && d.status === 'active').reduce((a,c) => a + c.amount, 0))}</p>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black text-gray-400 px-2 uppercase tracking-widest mb-4 flex items-center gap-2">
          <History size={16} /> Riwayat Terakhir
        </h3>
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-50 divide-y divide-gray-50 overflow-hidden">
          {transactions.length === 0 ? (
            <p className="p-12 text-center text-gray-400 italic font-medium">Data kosong.</p>
          ) : (
            transactions.slice(0, 6).map(t => (
              <div key={t.id} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-all group">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl transition-colors ${t.type.includes('income') || t.type === 'receivable_back' ? 'bg-emerald-50 text-emerald-600' : t.type === 'transfer' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                    {t.type.includes('income') || t.type === 'receivable_back' ? <ArrowDownCircle size={22} /> : t.type === 'transfer' ? <ArrowRightLeft size={22} /> : <ArrowUpCircle size={22} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-800 text-sm tracking-tight">{t.category}</p>
                      {t.isCredit && <Clock size={12} className="text-rose-500" />}
                    </div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">
                      {t.date} • {t.isCredit ? 'BELUM BAYAR (BON)' : `DANA: ${t.sourceWallet || t.destWallet}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-black text-sm ${t.type.includes('income') || t.type === 'receivable_back' ? 'text-emerald-600' : t.type === 'transfer' ? 'text-indigo-600' : 'text-rose-600'}`}>
                    {t.type.includes('income') || t.type === 'receivable_back' ? '+' : ''}{formatRupiah(t.amount)}
                  </span>
                  <button onClick={() => handleDeleteTransaction(t.id)} className="text-gray-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderInputData = () => (
    <div className="max-w-md mx-auto space-y-6 animate-fade-in pb-16">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
        <h2 className="text-2xl font-black text-gray-800 mb-8 text-center uppercase tracking-tighter">Catat Transaksi</h2>
        
        <div className="flex gap-1 mb-8 p-1.5 bg-gray-100 rounded-2xl overflow-x-auto no-scrollbar">
          {['expense', 'income', 'transfer', 'debt', 'receivable'].map(type => (
            <button 
              key={type} 
              onClick={() => setFormData({...formData, type, isCredit: false})} 
              className={`flex-1 py-2.5 px-4 rounded-xl font-black text-[10px] uppercase transition-all whitespace-nowrap ${formData.type === type ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}
            >
              {type === 'debt' ? 'Utang' : type === 'receivable' ? 'Piutang' : type}
            </button>
          ))}
        </div>

        <form onSubmit={handleAddTransaction} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">NOMINAL (RP)</label>
            <input type="text" inputMode="numeric" required value={formatNumberInput(formData.amount)} onChange={(e) => setFormData({...formData, amount: parseNumberInput(e.target.value)})} className="w-full p-5 bg-gray-50 border-0 rounded-3xl text-2xl font-black focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
          </div>

          {(formData.type === 'debt' || formData.type === 'receivable') && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{formData.type === 'debt' ? 'UTANG DARI SIAPA?' : 'PINJAMKAN KE SIAPA?'}</label>
              <input type="text" required value={formData.person} onChange={(e) => setFormData({...formData, person: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold" placeholder="Nama orang..." />
            </div>
          )}

          {formData.type === 'expense' && (
            <>
              <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${formData.isCredit ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 border-gray-100'}`} onClick={() => setFormData({...formData, isCredit: !formData.isCredit})}>
                <input type="checkbox" checked={formData.isCredit} readOnly className="w-5 h-5 rounded-lg accent-rose-600" />
                <div>
                  <p className={`text-sm font-bold ${formData.isCredit ? 'text-rose-800' : 'text-gray-600'}`}>Bon / Bayar Nanti (Utang)</p>
                  <p className="text-[10px] text-gray-400 uppercase font-medium">Potong limit jajan, tapi saldo dompet tetap.</p>
                </div>
              </div>

              {formData.isCredit && (
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">UTANG KE SIAPA? (PENJUAL)</label>
                  <input type="text" required value={formData.person} onChange={(e) => setFormData({...formData, person: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold" placeholder="Contoh: Warung Bu Ijah" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">DARI DOMPET</label>
                  <select value={formData.sourceWallet} onChange={(e) => setFormData({...formData, sourceWallet: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold">
                    <option value="Utama">Utama</option>
                    <option value="Tabungan">Tabungan</option>
                    <option value="Darurat">Darurat</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">LIMIT</label>
                  <select value={formData.cycle} onChange={(e) => setFormData({...formData, cycle: e.target.value})} className={`w-full p-4 border-0 rounded-2xl font-black ${formData.sourceWallet === 'Utama' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                    <option value="weekly">Mingguan</option>
                    <option value="monthly">Bulanan</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {formData.type === 'income' && (
             <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl border border-green-100 cursor-pointer" onClick={() => setFormData({...formData, autoAllocate: !formData.autoAllocate})}>
                  <input type="checkbox" checked={formData.autoAllocate} readOnly className="w-5 h-5 rounded-lg accent-green-600" />
                  <div>
                    <p className="text-sm font-bold text-green-800">Alokasi Otomatis (%)</p>
                    <p className="text-[10px] text-green-600 uppercase font-medium">Bagi ke Utama/Tabungan/Darurat</p>
                  </div>
                </div>
                {!formData.autoAllocate && (
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">MASUK KE DOMPET</label>
                    <select value={formData.sourceWallet} onChange={(e) => setFormData({...formData, sourceWallet: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold">
                      <option value="Utama">Dompet Utama</option>
                      <option value="Tabungan">Tabungan</option>
                      <option value="Darurat">Darurat</option>
                    </select>
                  </div>
                )}
             </div>
          )}

          {formData.type === 'transfer' && (
            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">DARI</label>
                <select value={formData.sourceWallet} onChange={(e) => setFormData({...formData, sourceWallet: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold">
                  <option value="Utama">Utama</option>
                  <option value="Tabungan">Tabungan</option>
                  <option value="Darurat">Darurat</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">KE (TUJUAN)</label>
                <select value={formData.destWallet} onChange={(e) => setFormData({...formData, destWallet: e.target.value})} className="w-full p-4 bg-blue-50 text-blue-600 border-0 rounded-2xl font-bold">
                  <option value="Tabungan">Tabungan</option>
                  <option value="Darurat">Darurat</option>
                  <option value="Utama">Utama</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">TANGGAL</label>
              <input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold" />
            </div>
            {formData.type === 'expense' && (
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">KATEGORI</label>
                <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold">
                  {settings.categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">CATATAN</label>
            <input type="text" value={formData.note} onChange={(e) => setFormData({...formData, note: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold" placeholder="Keterangan..." />
          </div>

          <button type="submit" className={`w-full py-5 rounded-[2rem] text-white font-black text-sm tracking-widest transition-all shadow-xl active:scale-95 uppercase ${formData.type === 'income' ? 'bg-emerald-600 shadow-emerald-100' : (formData.type === 'debt' || formData.type === 'receivable' || formData.type === 'transfer') ? 'bg-indigo-600 shadow-indigo-100' : 'bg-rose-600 shadow-rose-100'}`}>
            SIMPAN AKTIVITAS
          </button>
        </form>
      </div>
    </div>
  );

  const renderLaporan = () => (
    <div className="space-y-6 animate-fade-in pb-16">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
        <h3 className="font-black text-gray-900 mb-8 flex items-center gap-3 uppercase text-sm tracking-tight">
          <ShieldAlert size={20} className="text-blue-600" /> Pantauan Target & Limit
        </h3>
        
        <div className="space-y-10">
          <div>
            <div className="flex justify-between text-[10px] font-black mb-3 uppercase tracking-widest">
              <span className="text-gray-400 flex items-center gap-2"><PiggyBank size={14}/> Target Tabungan</span>
              <span className="text-emerald-600">{formatRupiah(balances.Tabungan)} / {formatRupiah(settings.targets.tabungan)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-5 relative overflow-hidden">
              <div className="h-5 rounded-full bg-emerald-500 transition-all duration-1000 shadow-inner" style={{ width: `${Math.min((balances.Tabungan / settings.targets.tabungan) * 100 || 0, 100)}%` }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px] font-black mb-3 uppercase tracking-widest">
              <span className="text-gray-400 flex items-center gap-2"><ShieldAlert size={14}/> Target Dana Darurat</span>
              <span className="text-amber-600">{formatRupiah(balances.Darurat)} / {formatRupiah(settings.targets.darurat)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-5 relative overflow-hidden">
              <div className="h-5 rounded-full bg-amber-500 transition-all duration-1000 shadow-inner" style={{ width: `${Math.min((balances.Darurat / settings.targets.darurat) * 100 || 0, 100)}%` }}></div>
            </div>
          </div>

          <div className="border-t border-gray-50 pt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <div className="flex justify-between text-[10px] font-black mb-3 uppercase tracking-widest">
                <span className="text-gray-400">Limit Jajan (Mingguan)</span>
                <span className={expenseThisWeek > settings.limits.weekly ? 'text-rose-600' : 'text-indigo-600'}>{formatRupiah(expenseThisWeek)} / {formatRupiah(settings.limits.weekly)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className={`h-3 rounded-full transition-all duration-500 ${expenseThisWeek > settings.limits.weekly ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min((expenseThisWeek / settings.limits.weekly) * 100 || 0, 100)}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-black mb-3 uppercase tracking-widest">
                <span className="text-gray-400">Tagihan Tetap (Bulanan)</span>
                <span className={expenseThisMonth > settings.limits.monthly ? 'text-rose-600' : 'text-orange-600'}>{formatRupiah(expenseThisMonth)} / {formatRupiah(settings.limits.monthly)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className={`h-3 rounded-full transition-all duration-500 ${expenseThisMonth > settings.limits.monthly ? 'bg-rose-500' : 'bg-orange-500'}`} style={{ width: `${Math.min((expenseThisMonth / settings.limits.monthly) * 100 || 0, 100)}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
          <h3 className="font-black text-gray-800 mb-6 uppercase text-[10px] tracking-widest flex items-center gap-2"><CalendarDays size={16} className="text-indigo-400"/> Uang Jajan (Mingguan)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartDataWeekly} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                  {chartDataWeekly.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={8} />)}
                </Pie>
                <Tooltip formatter={(value) => formatRupiah(value)} />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
          <h3 className="font-black text-gray-800 mb-6 uppercase text-[10px] tracking-widest flex items-center gap-2"><Info size={16} className="text-orange-400"/> Tagihan Fix (Bulanan)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartDataMonthly} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                  {chartDataMonthly.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={8} />)}
                </Pie>
                <Tooltip formatter={(value) => formatRupiah(value)} />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDebtSection = () => (
    <div className="space-y-6 animate-fade-in pb-16">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm text-center">
          <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Utang & Bon</p>
          <p className="text-2xl font-black text-rose-500">{formatRupiah(debts.filter(d => d.type === 'debt' && d.status === 'active').reduce((a,c) => a + c.amount, 0))}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm text-center">
          <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Piutang Saya</p>
          <p className="text-2xl font-black text-indigo-500">{formatRupiah(debts.filter(d => d.type === 'receivable' && d.status === 'active').reduce((a,c) => a + c.amount, 0))}</p>
        </div>
      </div>
      <div>
        <h3 className="text-[10px] font-black text-gray-400 px-4 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <HandCoins size={18} className="text-amber-500" /> Tagihan Aktif
        </h3>
        <div className="space-y-3 px-2">
          {debts.filter(d => d.status === 'active').length === 0 ? (
            <div className="bg-white p-12 rounded-[2rem] text-center text-gray-300 italic font-medium">Kosong.</div>
          ) : (
            debts.filter(d => d.status === 'active').map(debt => (
              <div key={debt.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl ${debt.type === 'debt' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="font-black text-gray-800 text-sm uppercase leading-tight">{debt.person}</p>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">
                      {debt.note?.includes('Bon Jajan') ? 'BON JAJAN' : (debt.type === 'debt' ? 'UTANG CASH' : 'PIUTANG')} • {debt.date}
                    </p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <p className={`font-black text-sm ${debt.type === 'debt' ? 'text-rose-500' : 'text-indigo-500'}`}>{formatRupiah(debt.amount)}</p>
                  <button onClick={() => handleSettleDebt(debt)} className="text-[8px] font-black px-4 py-2 bg-gray-900 text-white rounded-full uppercase tracking-widest active:scale-90 transition-transform">
                    LUNAS
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderCalculator = () => {
    const buttons = ['7','8','9','/','4','5','6','*','1','2','3','-','C','0','=','+'];
    return (
      <div className="max-w-xs mx-auto bg-gray-950 p-8 rounded-[3.5rem] shadow-2xl animate-fade-in border-[12px] border-gray-900">
        <div className="bg-gray-900 p-8 rounded-3xl mb-8 text-right overflow-hidden shadow-inner border border-white/5 h-24 flex items-center justify-end">
          <span className="text-4xl font-mono font-bold text-white block truncate tracking-tighter">
            {calcInput ? calcInput.replace(/\d+/g, m => formatNumberInput(m)) : '0'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {buttons.map((btn, idx) => (
            <button key={idx} onClick={() => handleCalcClick(btn)} className={`h-14 w-14 rounded-full text-xl font-black flex items-center justify-center transition-all active:scale-90 ${btn === 'C' ? 'bg-rose-600 text-white' : btn === '=' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : ['/','*','-','+'].includes(btn) ? 'bg-gray-900 text-indigo-400 border border-white/5' : 'bg-gray-900 text-gray-300 border border-white/5'}`}>
              {btn}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="max-w-md mx-auto bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 animate-fade-in pb-20">
      <h2 className="text-2xl font-black text-gray-900 mb-10 flex items-center gap-3 tracking-tighter uppercase leading-none">
        <Settings size={26} className="text-gray-200" /> Sistem
      </h2>
      <div className="space-y-12">
        <section>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-6">Target Dana</h3>
          <div className="space-y-5">
            <div>
              <label className="block text-[9px] font-black text-gray-500 mb-2 uppercase">Tabungan</label>
              <input type="text" inputMode="numeric" value={formatNumberInput(settings.targets.tabungan)} onChange={(e) => setSettingsApp({...settings, targets: {...settings.targets, tabungan: Number(parseNumberInput(e.target.value))}})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl outline-none font-bold text-sm" />
            </div>
            <div>
              <label className="block text-[9px] font-black text-gray-500 mb-2 uppercase">Dana Darurat</label>
              <input type="text" inputMode="numeric" value={formatNumberInput(settings.targets.darurat)} onChange={(e) => setSettingsApp({...settings, targets: {...settings.targets, darurat: Number(parseNumberInput(e.target.value))}})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl outline-none font-bold text-sm" />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-6">Alokasi (%)</h3>
          <div className="grid grid-cols-3 gap-4">
             <div className="text-center">
                <label className="block text-[8px] font-black text-indigo-600 mb-2 uppercase">UTAMA</label>
                <input type="number" value={settings.allocations.kebutuhan} onChange={(e) => setSettingsApp({...settings, allocations: {...settings.allocations, kebutuhan: e.target.value}})} className="w-full p-3 bg-indigo-50 border-0 rounded-2xl text-center font-black text-xs" />
             </div>
             <div className="text-center">
                <label className="block text-[8px] font-black text-emerald-600 mb-2 uppercase">TABUNG</label>
                <input type="number" value={settings.allocations.tabungan} onChange={(e) => setSettingsApp({...settings, allocations: {...settings.allocations, tabungan: e.target.value}})} className="w-full p-3 bg-emerald-50 border-0 rounded-2xl text-center font-black text-xs" />
             </div>
             <div className="text-center">
                <label className="block text-[8px] font-black text-amber-600 mb-2 uppercase">DARURAT</label>
                <input type="number" value={settings.allocations.darurat} onChange={(e) => setSettingsApp({...settings, allocations: {...settings.allocations, darurat: e.target.value}})} className="w-full p-3 bg-amber-50 border-0 rounded-2xl text-center font-black text-xs" />
             </div>
          </div>
          <p className={`text-[9px] font-bold mt-4 uppercase text-center ${Number(settings.allocations.kebutuhan) + Number(settings.allocations.tabungan) + Number(settings.allocations.darurat) === 100 ? 'text-emerald-500' : 'text-rose-500'}`}>
            Status: {Number(settings.allocations.kebutuhan) + Number(settings.allocations.tabungan) + Number(settings.allocations.darurat)}% / 100%
          </p>
        </section>

        {showNotification && (
          <div className="p-4 bg-gray-900 text-white rounded-[2rem] text-center font-black text-[10px] uppercase tracking-widest animate-pulse">OK!</div>
        )}

        <button onClick={handleSaveSettings} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xs tracking-[0.2em] shadow-xl shadow-indigo-100 active:scale-95 transition-all uppercase">
          Simpan
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans selection:bg-indigo-100">
      <aside className="hidden lg:flex w-80 bg-white border-r border-gray-100 fixed h-screen flex-col py-12 z-20 shadow-sm">
        <div className="px-10 flex items-center gap-4 text-2xl font-black text-gray-900 mb-16 tracking-tighter">
          <div className="p-3 bg-indigo-600 text-white rounded-[1.5rem] shadow-xl shadow-indigo-100"><Wallet size={24} /></div> FinansialKu
        </div>
        <div className="flex flex-col gap-2 px-8 w-full">
          <SidebarItem icon={<Home />} label="Beranda" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={<PlusCircle />} label="Input" isActive={activeTab === 'input'} onClick={() => setActiveTab('input')} isAction />
          <SidebarItem icon={<HandCoins />} label="Utang" isActive={activeTab === 'debts'} onClick={() => setActiveTab('debts')} />
          <SidebarItem icon={<PieChartIcon />} label="Laporan" isActive={activeTab === 'laporan'} onClick={() => setActiveTab('laporan')} />
          <SidebarItem icon={<CalcIcon />} label="Kalkulator" isActive={activeTab === 'kalkulator'} onClick={() => setActiveTab('kalkulator')} />
          <SidebarItem icon={<Settings />} label="Sistem" isActive={activeTab === 'pengaturan'} onClick={() => setActiveTab('pengaturan')} />
        </div>
      </aside>

      <div className="flex-1 lg:ml-80 pb-32 lg:pb-10">
        <header className="bg-white/70 backdrop-blur-xl shadow-sm sticky top-0 z-10 px-8 py-6 lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg font-black text-gray-950 tracking-tighter uppercase">
              <Wallet size={22} className="text-indigo-600" /> FINANSIALKU
            </div>
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-black">{user?.uid?.substring(0,2) || 'AD'}</div>
          </div>
        </header>
        <main className="max-w-6xl mx-auto p-6 md:p-12">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'input' && renderInputData()}
          {activeTab === 'debts' && renderDebtSection()}
          {activeTab === 'laporan' && renderLaporan()}
          {activeTab === 'kalkulator' && renderCalculator()}
          {activeTab === 'pengaturan' && renderSettings()}
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-6 left-6 right-6 h-20 bg-gray-950/95 backdrop-blur-2xl rounded-[2.5rem] px-8 flex justify-around items-center z-30 shadow-2xl border border-white/5">
        <NavItem icon={<Home />} isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavItem icon={<PieChartIcon />} isActive={activeTab === 'laporan'} onClick={() => setActiveTab('laporan')} />
        <button onClick={() => setActiveTab('input')} className="bg-indigo-600 text-white p-5 rounded-[2rem] shadow-2xl shadow-indigo-500/30 transform -translate-y-8 hover:scale-110 active:scale-90 transition-all border-4 border-gray-900"><PlusCircle size={22} /></button>
        <NavItem icon={<HandCoins />} isActive={activeTab === 'debts'} onClick={() => setActiveTab('debts')} />
        <NavItem icon={<CalcIcon />} isActive={activeTab === 'kalkulator'} onClick={() => setActiveTab('kalkulator')} />
      </nav>
    </div>
  );
}

function SidebarItem({ icon, label, isActive, onClick, isAction }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-4 px-6 py-4 rounded-[1.8rem] transition-all w-full text-left font-black text-xs uppercase tracking-tighter ${isActive && !isAction ? 'bg-indigo-50 text-indigo-600' : ''} ${!isActive && !isAction ? 'text-gray-400 hover:bg-gray-50 hover:text-gray-500' : ''} ${isAction ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-100 mt-6 mb-6' : ''}`}>
      {React.cloneElement(icon, { size: 18 })} <span>{label}</span>
    </button>
  );
}

function NavItem({ icon, isActive, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all ${isActive ? 'text-white scale-125' : 'text-gray-500'}`}>
      {React.cloneElement(icon, { size: 20 })}
    </button>
  );
}