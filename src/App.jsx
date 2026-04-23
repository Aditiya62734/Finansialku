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
  Sparkles,
  Bot,
  CheckCircle2
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
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

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

// Fungsi penambah titik otomatis (Formatter)
const formatNumberInput = (val) => {
  if (!val) return '';
  return String(val).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

// Fungsi penghapus titik untuk disimpan ke database (Parser)
const parseNumberInput = (val) => {
  return String(val).replace(/\D/g, '');
};

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // --- State Utama ---
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  
  // State Pengaturan Dinamis
  const [settings, setSettingsApp] = useState({
    limits: { weekly: 300000, monthly: 1500000 },
    allocations: { kebutuhan: 50, tabungan: 30, darurat: 20 },
    categories: ['Makan & Jajan', 'Transportasi', 'Tagihan Kos', 'Listrik & Air', 'Hiburan', 'Lainnya']
  });

  // State UI
  const [showNotification, setShowNotification] = useState(false);
  const [calcInput, setCalcInput] = useState('');
  const [aiInsights, setAiInsights] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // State Form
  const [formData, setFormData] = useState({
    type: 'expense', // expense | income | transfer
    amount: '',
    category: 'Makan & Jajan',
    sourceWallet: 'Utama', // Utama | Tabungan | Darurat
    destWallet: 'Tabungan', // Khusus transfer
    autoAllocate: true, // Khusus income
    cycle: 'weekly', // weekly (Jajan) | monthly (Fix)
    note: '',
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
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    if (!isFirebaseConfigured) {
      const localTrans = localStorage.getItem('finansialku_v2_transactions');
      if (localTrans) setTransactions(JSON.parse(localTrans));
      
      const localSettings = localStorage.getItem('finansialku_v2_settings');
      if (localSettings) setSettingsApp(JSON.parse(localSettings));
      return;
    }

    const transactionsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
    const settingsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'settings');

    const unsubTransactions = onSnapshot(transactionsRef, (snapshot) => {
      const trans = [];
      snapshot.forEach(doc => trans.push({ id: doc.data().id, ...doc.data() }));
      trans.sort((a, b) => b.id - a.id);
      setTransactions(trans);
    });

    const unsubSettings = onSnapshot(settingsRef, (snapshot) => {
      snapshot.forEach(doc => {
        if (doc.id === 'app_settings') setSettingsApp(doc.data());
      });
    });

    return () => { unsubTransactions(); unsubSettings(); };
  }, [user]);

  // --- Perhitungan Saldo Multi-Dompet ---
  const calculateWalletBalance = (walletName) => {
    return transactions.reduce((total, t) => {
      // Logika Pendapatan (Income)
      if (t.type === 'income') {
        if (t.autoAllocate) {
          // Mapping wallet ke key alokasi di settings
          const keyMap = { 'Utama': 'kebutuhan', 'Tabungan': 'tabungan', 'Darurat': 'darurat' };
          const percent = settings.allocations[keyMap[walletName]] || 0;
          return total + (t.amount * (percent / 100));
        } else if (t.destWallet === walletName) {
          return total + t.amount;
        }
      }
      
      // Logika Pengeluaran (Expense)
      if (t.type === 'expense' && t.sourceWallet === walletName) return total - t.amount;
      
      // Logika Transfer
      if (t.type === 'transfer') {
        if (t.sourceWallet === walletName) return total - t.amount;
        if (t.destWallet === walletName) return total + t.amount;
      }
      return total;
    }, 0);
  };

  const balanceUtama = calculateWalletBalance('Utama');
  const balanceTabungan = calculateWalletBalance('Tabungan');
  const balanceDarurat = calculateWalletBalance('Darurat');

  // --- Perhitungan Siklus Limit (Mingguan vs Bulanan) ---
  const getWeekDates = () => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + 1; 
    const last = first + 6;
    const monday = new Date(curr.setDate(first)).toISOString().split('T')[0];
    const sunday = new Date(curr.setDate(last)).toISOString().split('T')[0];
    return { monday, sunday };
  };

  const { monday, sunday } = getWeekDates();
  const currentMonth = new Date().toISOString().substring(0, 7);

  const expenseThisWeek = transactions
    .filter(t => t.type === 'expense' && t.cycle === 'weekly' && t.date >= monday && t.date <= sunday)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const expenseThisMonth = transactions
    .filter(t => t.type === 'expense' && t.cycle === 'monthly' && t.date.startsWith(currentMonth))
    .reduce((acc, curr) => acc + curr.amount, 0);

  const expensesByCategory = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense');
    const grouped = expenses.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
      return acc;
    }, {});
    return Object.keys(grouped).map(key => ({ name: key, value: grouped[key] }));
  }, [transactions]);

  // --- Handlers ---
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!formData.amount || isNaN(formData.amount) || !user) return;

    const newTransactionId = Date.now();
    let finalCategory = formData.category;
    if (formData.type === 'income') finalCategory = formData.autoAllocate ? 'Pendapatan (Alokasi %)' : 'Pendapatan Langsung';
    if (formData.type === 'transfer') finalCategory = `Transfer ke ${formData.destWallet}`;

    const newTransaction = {
      id: newTransactionId,
      type: formData.type,
      amount: parseFloat(formData.amount),
      category: finalCategory,
      sourceWallet: formData.type === 'income' ? null : formData.sourceWallet,
      destWallet: formData.type === 'expense' ? null : (formData.type === 'income' ? (formData.autoAllocate ? 'Split' : formData.sourceWallet) : formData.destWallet),
      autoAllocate: formData.type === 'income' ? formData.autoAllocate : false,
      cycle: formData.type === 'expense' ? formData.cycle : null,
      note: formData.note,
      date: formData.date
    };

    try {
      if (!isFirebaseConfigured) {
        const updatedTrans = [newTransaction, ...transactions];
        setTransactions(updatedTrans);
        localStorage.setItem('finansialku_v2_transactions', JSON.stringify(updatedTrans));
      } else {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', newTransactionId.toString());
        await setDoc(docRef, newTransaction);
      }
      setFormData({ ...formData, amount: '', note: '' });
      setActiveTab('dashboard');
    } catch (err) {
      console.error("Gagal menyimpan data:", err);
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!user) return;
    try {
      if (!isFirebaseConfigured) {
        const updatedTrans = transactions.filter(t => t.id !== id);
        setTransactions(updatedTrans);
        localStorage.setItem('finansialku_v2_transactions', JSON.stringify(updatedTrans));
      } else {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id.toString());
        await deleteDoc(docRef);
      }
    } catch (err) {}
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    const totalAlloc = Number(settings.allocations.kebutuhan) + Number(settings.allocations.tabungan) + Number(settings.allocations.darurat);
    if (totalAlloc !== 100) {
      alert("Total alokasi budget harus tepat 100%!");
      return;
    }

    try {
      if (!isFirebaseConfigured) {
        localStorage.setItem('finansialku_v2_settings', JSON.stringify(settings));
      } else {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'app_settings');
        await setDoc(docRef, settings);
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

  const handleGetInsights = async () => {
    setIsAnalyzing(true);
    setAiInsights('');
    setTimeout(() => {
      setAiInsights(`Saran AI: Saldo Utama kamu saat ini ${formatRupiah(balanceUtama)}. Ingat untuk menjaga limit jajan mingguan di bawah ${formatRupiah(settings.limits.weekly)}. Tabunganmu sudah terisi ${formatRupiah(balanceTabungan)}, pertahankan!`);
      setIsAnalyzing(false);
    }, 1500);
  };

  // --- Komponen Tampilan ---
  const renderDashboard = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Kartu Dompet */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Saldo Dompet</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-5 rounded-2xl shadow-md text-white">
            <div className="flex items-center gap-2 mb-2 text-blue-100">
              <Wallet size={18} /> <span className="font-medium text-sm">Dompet Utama ({settings.allocations.kebutuhan}%)</span>
            </div>
            <p className="text-2xl font-bold">{formatRupiah(balanceUtama)}</p>
          </div>
          <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-5 rounded-2xl shadow-md text-white">
            <div className="flex items-center gap-2 mb-2 text-green-100">
              <PiggyBank size={18} /> <span className="font-medium text-sm">Tabungan ({settings.allocations.tabungan}%)</span>
            </div>
            <p className="text-2xl font-bold">{formatRupiah(balanceTabungan)}</p>
          </div>
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-5 rounded-2xl shadow-md text-white">
            <div className="flex items-center gap-2 mb-2 text-orange-100">
              <ShieldAlert size={18} /> <span className="font-medium text-sm">Dana Darurat ({settings.allocations.darurat}%)</span>
            </div>
            <p className="text-2xl font-bold">{formatRupiah(balanceDarurat)}</p>
          </div>
        </div>
      </div>

      {/* Transaksi Terakhir */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Transaksi Terakhir</h3>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {transactions.length === 0 ? (
            <p className="p-6 text-center text-gray-400">Belum ada transaksi.</p>
          ) : (
            transactions.slice(0, 5).map(t => (
              <div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${t.type === 'income' ? 'bg-green-100 text-green-600' : t.type === 'transfer' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                    {t.type === 'income' ? <ArrowDownCircle size={24} /> : t.type === 'transfer' ? <ArrowRightLeft size={24} /> : <ArrowUpCircle size={24} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800">{t.category}</p>
                      {t.autoAllocate && <CheckCircle2 size={14} className="text-green-500" />}
                    </div>
                    <p className="text-xs text-gray-500">
                      {t.date} • {t.type === 'transfer' ? `${t.sourceWallet} ➔ ${t.destWallet}` : (t.autoAllocate ? 'Alokasi Otomatis' : `Dompet: ${t.sourceWallet || t.destWallet}`)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-bold ${t.type === 'income' ? 'text-green-600' : t.type === 'transfer' ? 'text-blue-600' : 'text-red-600'}`}>
                    {t.type === 'income' ? '+' : t.type === 'transfer' ? '⇄' : '-'}{formatRupiah(t.amount)}
                  </span>
                  <button onClick={() => handleDeleteTransaction(t.id)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={18} />
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
    <div className="max-w-md mx-auto space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Catat Aktivitas</h2>
        
        <div className="flex gap-1 mb-6 p-1 bg-gray-100 rounded-lg overflow-x-auto">
          <button onClick={() => setFormData({...formData, type: 'expense'})} className={`flex-1 py-2 px-3 rounded-md font-medium text-xs md:text-sm transition-all whitespace-nowrap ${formData.type === 'expense' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}>Pengeluaran</button>
          <button onClick={() => setFormData({...formData, type: 'income'})} className={`flex-1 py-2 px-3 rounded-md font-medium text-xs md:text-sm transition-all whitespace-nowrap ${formData.type === 'income' ? 'bg-white shadow text-green-600' : 'text-gray-500'}`}>Pendapatan</button>
          <button onClick={() => setFormData({...formData, type: 'transfer'})} className={`flex-1 py-2 px-3 rounded-md font-medium text-xs md:text-sm transition-all whitespace-nowrap ${formData.type === 'transfer' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Transfer</button>
        </div>

        <form onSubmit={handleAddTransaction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp)</label>
            <input type="text" inputMode="numeric" required value={formatNumberInput(formData.amount)} onChange={(e) => setFormData({...formData, amount: parseNumberInput(e.target.value)})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
          </div>

          {/* Kolom Khusus Pengeluaran */}
          {formData.type === 'expense' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ambil dari Dompet</label>
                  <select value={formData.sourceWallet} onChange={(e) => setFormData({...formData, sourceWallet: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none">
                    <option value="Utama">Utama</option>
                    <option value="Tabungan">Tabungan</option>
                    <option value="Darurat">Dana Darurat</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siklus Potongan</label>
                  <select value={formData.cycle} onChange={(e) => setFormData({...formData, cycle: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none text-red-600 font-medium">
                    <option value="weekly">Mingguan (Jajan)</option>
                    <option value="monthly">Bulanan (Tagihan Fix)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none">
                  {settings.categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Kolom Khusus Pendapatan */}
          {formData.type === 'income' && (
             <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <input 
                    type="checkbox" 
                    id="autoAlloc" 
                    checked={formData.autoAllocate} 
                    onChange={(e) => setFormData({...formData, autoAllocate: e.target.checked})}
                    className="w-5 h-5 rounded accent-blue-600"
                  />
                  <label htmlFor="autoAlloc" className="text-sm font-semibold text-blue-800">
                    Alokasi Otomatis ({settings.allocations.kebutuhan}/{settings.allocations.tabungan}/{settings.allocations.darurat}%)
                  </label>
                </div>

                {!formData.autoAllocate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Masuk ke Dompet</label>
                    <select value={formData.sourceWallet} onChange={(e) => setFormData({...formData, sourceWallet: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none">
                      <option value="Utama">Utama</option>
                      <option value="Tabungan">Tabungan</option>
                      <option value="Darurat">Dana Darurat</option>
                    </select>
                  </div>
                )}
             </div>
          )}

          {/* Kolom Khusus Transfer */}
          {formData.type === 'transfer' && (
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dari Dompet</label>
                <select value={formData.sourceWallet} onChange={(e) => setFormData({...formData, sourceWallet: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none">
                  <option value="Utama">Utama</option>
                  <option value="Tabungan">Tabungan</option>
                  <option value="Darurat">Dana Darurat</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ke Dompet</label>
                <select value={formData.destWallet} onChange={(e) => setFormData({...formData, destWallet: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none">
                  <option value="Tabungan">Tabungan</option>
                  <option value="Utama">Utama</option>
                  <option value="Darurat">Dana Darurat</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
            <input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
            <input type="text" value={formData.note} onChange={(e) => setFormData({...formData, note: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none" placeholder="Opsional..." />
          </div>

          <button type="submit" className={`w-full py-3 rounded-xl text-white font-bold mt-4 transition-colors ${formData.type === 'income' ? 'bg-green-600' : formData.type === 'transfer' ? 'bg-blue-600' : 'bg-red-600'}`}>
            Simpan Aktivitas
          </button>
        </form>
      </div>
    </div>
  );

  const renderLaporan = () => (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-800">Laporan & Evaluasi Limit</h2>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-700 mb-4">Pantauan Siklus Pengeluaran</h3>
        <div className="space-y-6">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-800">Jatah Mingguan (Makan & Jajan)</span>
              <span className="text-gray-500">{formatRupiah(expenseThisWeek)} / {formatRupiah(settings.limits.weekly)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className={`h-3 rounded-full ${expenseThisWeek > settings.limits.weekly ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min((expenseThisWeek / settings.limits.weekly) * 100 || 0, 100)}%` }}></div>
            </div>
            <p className="text-xs text-gray-400 mt-1">Sisa Jajan Minggu Ini: <span className="font-bold text-gray-600">{formatRupiah(settings.limits.weekly - expenseThisWeek)}</span></p>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-800">Tagihan Bulanan (Fix & Kosan)</span>
              <span className="text-gray-500">{formatRupiah(expenseThisMonth)} / {formatRupiah(settings.limits.monthly)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className={`h-3 rounded-full ${expenseThisMonth > settings.limits.monthly ? 'bg-red-500' : 'bg-orange-400'}`} style={{ width: `${Math.min((expenseThisMonth / settings.limits.monthly) * 100 || 0, 100)}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-700 mb-4">Pengeluaran per Kategori</h3>
        {expensesByCategory.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expensesByCategory} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {expensesByCategory.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatRupiah(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-center text-gray-400 py-10">Belum ada data pengeluaran.</p>
        )}
      </div>
    </div>
  );

  const renderCalculator = () => {
    const buttons = ['7','8','9','/','4','5','6','*','1','2','3','-','C','0','=','+'];
    return (
      <div className="max-w-xs mx-auto bg-gray-800 p-6 rounded-3xl shadow-xl animate-fade-in">
        <div className="bg-gray-100 p-4 rounded-xl mb-6 text-right overflow-hidden">
          <span className="text-3xl font-mono font-bold text-gray-800 block truncate">{calcInput ? calcInput.replace(/\d+/g, m => formatNumberInput(m)) : '0'}</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {buttons.map((btn, idx) => (
            <button key={idx} onClick={() => handleCalcClick(btn)} className={`p-4 rounded-xl text-xl font-bold transition-all ${btn === 'C' ? 'bg-red-500 text-white' : btn === '=' ? 'bg-blue-500 text-white' : ['/','*','-','+'].includes(btn) ? 'bg-gray-600 text-white' : 'bg-white text-gray-800'}`}>
              {btn}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="max-w-md mx-auto bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Pengaturan FinansialKu</h2>
      
      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-700 border-b pb-2">Target Limit Pengeluaran</h3>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Limit Jajan Mingguan (Rp)</label>
            <input type="text" inputMode="numeric" value={formatNumberInput(settings.limits.weekly)} onChange={(e) => setSettingsApp({...settings, limits: {...settings.limits, weekly: Number(parseNumberInput(e.target.value))}})} className="w-full p-3 border border-gray-300 rounded-xl outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Limit Tagihan Bulanan (Rp)</label>
            <input type="text" inputMode="numeric" value={formatNumberInput(settings.limits.monthly)} onChange={(e) => setSettingsApp({...settings, limits: {...settings.limits, monthly: Number(parseNumberInput(e.target.value))}})} className="w-full p-3 border border-gray-300 rounded-xl outline-none" />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-gray-700 border-b pb-2">Alokasi Budget (%)</h3>
          <div className="grid grid-cols-3 gap-2">
             <div>
                <label className="block text-xs text-gray-500 mb-1">Utama</label>
                <input type="number" value={settings.allocations.kebutuhan} onChange={(e) => setSettingsApp({...settings, allocations: {...settings.allocations, kebutuhan: Number(e.target.value)}})} className="w-full p-2 border border-gray-300 rounded-lg text-center" />
             </div>
             <div>
                <label className="block text-xs text-gray-500 mb-1">Tabungan</label>
                <input type="number" value={settings.allocations.tabungan} onChange={(e) => setSettingsApp({...settings, allocations: {...settings.allocations, tabungan: Number(e.target.value)}})} className="w-full p-2 border border-gray-300 rounded-lg text-center" />
             </div>
             <div>
                <label className="block text-xs text-gray-500 mb-1">Darurat</label>
                <input type="number" value={settings.allocations.darurat} onChange={(e) => setSettingsApp({...settings, allocations: {...settings.allocations, darurat: Number(e.target.value)}})} className="w-full p-2 border border-gray-300 rounded-lg text-center" />
             </div>
          </div>
          <p className="text-xs text-orange-500">Total harus 100%. Saat ini: {Number(settings.allocations.kebutuhan) + Number(settings.allocations.tabungan) + Number(settings.allocations.darurat)}%</p>
        </div>

        {showNotification && (
          <div className="p-3 mt-4 bg-green-100 text-green-700 rounded-xl text-sm font-medium text-center">Tersimpan!</div>
        )}

        <button onClick={handleSaveSettings} className="w-full py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold mt-4">
          Simpan Pengaturan
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 fixed h-screen flex-col py-8 z-20 shadow-sm">
        <div className="flex items-center justify-center gap-2 text-2xl font-bold text-blue-600 mb-10"><Wallet size={28} /> FinansialKu</div>
        <div className="flex flex-col gap-2 px-4 w-full">
          <SidebarItem icon={<Home />} label="Beranda" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={<PlusCircle />} label="Catat Aktivitas" isActive={activeTab === 'input'} onClick={() => setActiveTab('input')} isAction />
          <SidebarItem icon={<PieChartIcon />} label="Laporan Limit" isActive={activeTab === 'laporan'} onClick={() => setActiveTab('laporan')} />
          <SidebarItem icon={<CalcIcon />} label="Kalkulator" isActive={activeTab === 'kalkulator'} onClick={() => setActiveTab('kalkulator')} />
          <SidebarItem icon={<Settings />} label="Pengaturan" isActive={activeTab === 'pengaturan'} onClick={() => setActiveTab('pengaturan')} />
        </div>
      </aside>

      <div className="flex-1 md:ml-64 pb-24 md:pb-8">
        <header className="bg-white shadow-sm sticky top-0 z-10 px-4 py-4 md:hidden">
          <h1 className="text-xl font-bold text-blue-600 text-center flex items-center justify-center gap-2"><Wallet size={24} /> FinansialKu</h1>
        </header>
        <main className="max-w-4xl mx-auto p-4 md:p-8">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'input' && renderInputData()}
          {activeTab === 'laporan' && renderLaporan()}
          {activeTab === 'kalkulator' && renderCalculator()}
          {activeTab === 'pengaturan' && renderSettings()}
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-200 px-4 py-3 flex justify-around items-center z-20">
        <NavItem icon={<Home />} label="Beranda" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavItem icon={<PieChartIcon />} label="Laporan" isActive={activeTab === 'laporan'} onClick={() => setActiveTab('laporan')} />
        <button onClick={() => setActiveTab('input')} className="bg-blue-600 text-white p-3 rounded-full shadow-lg transform -translate-y-4 hover:bg-blue-700 transition-all focus:outline-none"><PlusCircle size={28} /></button>
        <NavItem icon={<CalcIcon />} label="Kalkulator" isActive={activeTab === 'kalkulator'} onClick={() => setActiveTab('kalkulator')} />
        <NavItem icon={<Settings />} label="Pengaturan" isActive={activeTab === 'pengaturan'} onClick={() => setActiveTab('pengaturan')} />
      </nav>
    </div>
  );
}

function SidebarItem({ icon, label, isActive, onClick, isAction }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full text-left font-medium ${isActive && !isAction ? 'bg-blue-50 text-blue-600' : ''} ${!isActive && !isAction ? 'text-gray-500 hover:bg-gray-50 hover:text-gray-700' : ''} ${isAction ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md mt-2 mb-2' : ''}`}>
      {React.cloneElement(icon, { size: 20 })} <span>{label}</span>
    </button>
  );
}

function NavItem({ icon, label, isActive, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
      <div className={isActive ? 'scale-110 transition-transform' : ''}>{React.cloneElement(icon, { size: 22 })}</div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}