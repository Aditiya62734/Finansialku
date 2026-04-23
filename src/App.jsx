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
  PiggyBank,
  ShieldAlert,
  Trash2,
  Sparkles,
  Bot
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
  }).format(angka);
};

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // State Utama
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [limits, setLimits] = useState({
    daily: 100000,
    weekly: 700000,
    monthly: 3000000
  });

  // State Notifikasi & Form
  const [showNotification, setShowNotification] = useState(false);
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    category: 'Makan',
    note: '',
    date: new Date().toISOString().split('T')[0]
  });

  // State Kalkulator & AI
  const [calcInput, setCalcInput] = useState('');
  const [aiInsights, setAiInsights] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [smartInputText, setSmartInputText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  // --- Efek & Listener Database ---
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
      // Load data dari Local Storage jika tidak pakai Firebase
      const localTrans = localStorage.getItem('finansialku_transactions');
      if (localTrans) setTransactions(JSON.parse(localTrans));
      
      const localLimits = localStorage.getItem('finansialku_limits');
      if (localLimits) setLimits(JSON.parse(localLimits));
      return;
    }

    const transactionsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
    const settingsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'settings');

    const unsubTransactions = onSnapshot(transactionsRef, (snapshot) => {
      const trans = [];
      snapshot.forEach(doc => {
        trans.push({ id: doc.data().id, ...doc.data() });
      });
      trans.sort((a, b) => b.id - a.id);
      setTransactions(trans);
    }, (err) => console.error("Error fetching transactions:", err));

    const unsubSettings = onSnapshot(settingsRef, (snapshot) => {
      snapshot.forEach(doc => {
        if (doc.id === 'limits') {
          setLimits(doc.data());
        }
      });
    }, (err) => console.error("Error fetching settings:", err));

    return () => {
      unsubTransactions();
      unsubSettings();
    };
  }, [user]);

  // --- Perhitungan Data ---
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
  
  const budgetPengeluaran = totalIncome * 0.50;
  const budgetTabungan = totalIncome * 0.30;
  const budgetDarurat = totalIncome * 0.20;
  
  const sisaPengeluaran = budgetPengeluaran - totalExpense;

  const today = new Date().toISOString().split('T')[0];
  const expenseToday = transactions
    .filter(t => t.type === 'expense' && t.date === today)
    .reduce((acc, curr) => acc + curr.amount, 0);

  const currentMonth = today.substring(0, 7);
  const expenseThisMonth = transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(currentMonth))
    .reduce((acc, curr) => acc + curr.amount, 0);

  const expensesByCategory = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense');
    const grouped = expenses.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
      return acc;
    }, {});
    
    return Object.keys(grouped).map(key => ({
      name: key,
      value: grouped[key]
    }));
  }, [transactions]);

  // --- AI API ---
  const apiKey = "AIzaSyAk-eyYMVxBql6rjytSZn0ROpTXJL2JQRo"; 

  const callGeminiAPI = async (prompt, isJson = false) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    if (isJson) {
      payload.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            type: { type: "STRING" },
            amount: { type: "NUMBER" },
            category: { type: "STRING" },
            note: { type: "STRING" }
          }
        }
      };
    }

    const retries = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i <= retries.length; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } catch (error) {
        if (i === retries.length) throw error;
        await new Promise(r => setTimeout(r, retries[i]));
      }
    }
  };

  const handleGetInsights = async () => {
    setIsAnalyzing(true);
    setAiInsights('');
    
    const highestCategory = expensesByCategory.sort((a,b) => b.value - a.value)[0]?.name || 'Belum ada';
    const prompt = `Anda adalah penasihat keuangan pribadi. 
    Data bulan ini:
    - Pendapatan total: Rp${totalIncome}
    - Pengeluaran total: Rp${totalExpense}
    - Limit pengeluaran bulanan: Rp${limits.monthly}
    - Sisa limit bulanan: Rp${limits.monthly - expenseThisMonth}
    - Kategori pengeluaran tertinggi: ${highestCategory}

    Berikan analisis singkat (maksimal 3 kalimat) tentang kondisi keuangan saya saat ini, dan berikan 1 saran praktis. Gunakan bahasa Indonesia yang ramah dan profesional.`;

    try {
      const responseText = await callGeminiAPI(prompt, false);
      setAiInsights(responseText);
    } catch (error) {
      console.error(error);
      setAiInsights("Maaf, sistem AI sedang sibuk atau API key belum diatur.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSmartExtract = async () => {
    if (!smartInputText) return;
    setIsExtracting(true);

    const prompt = `Ekstrak informasi transaksi dari teks berikut: "${smartInputText}". 
    Kategori pengeluaran yang valid HANYA: "Makan", "Jajan", "Transport", "Tagihan", "Hiburan", "Lainnya". 
    Jika teks mengindikasikan pemasukan/pendapatan, gunakan type "income". Jika pengeluaran, gunakan "expense".
    Note harus berupa ringkasan singkat. Amount harus berupa angka bulat numerik tanpa titik.`;

    try {
      const responseText = await callGeminiAPI(prompt, true);
      const data = JSON.parse(responseText);
      
      setFormData({
        type: data.type || 'expense',
        amount: data.amount ? data.amount.toString() : '',
        category: data.category || 'Lainnya',
        note: data.note || smartInputText,
        date: new Date().toISOString().split('T')[0]
      });
      setSmartInputText('');
    } catch (error) {
      console.error(error);
      setSmartInputText("Maaf, gagal membaca data.");
    } finally {
      setIsExtracting(false);
    }
  };

  // --- Handlers Interaksi ---
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!formData.amount || isNaN(formData.amount) || !user) return;

    const newTransactionId = Date.now();
    const newTransaction = {
      id: newTransactionId,
      type: formData.type,
      amount: parseFloat(formData.amount),
      category: formData.type === 'income' ? 'Pendapatan' : formData.category,
      note: formData.note,
      date: formData.date
    };

    try {
      if (!isFirebaseConfigured) {
        const updatedTrans = [newTransaction, ...transactions];
        setTransactions(updatedTrans);
        localStorage.setItem('finansialku_transactions', JSON.stringify(updatedTrans));
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
        localStorage.setItem('finansialku_transactions', JSON.stringify(updatedTrans));
      } else {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id.toString());
        await deleteDoc(docRef);
      }
    } catch (err) {
      console.error("Gagal menghapus data:", err);
    }
  };

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

  // --- Tampilan ---
  const renderDashboard = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
        <h2 className="text-blue-100 text-sm font-medium">Total Pendapatan</h2>
        <p className="text-3xl font-bold mt-1">{formatRupiah(totalIncome)}</p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Distribusi Keuangan (50/30/20)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 font-medium flex items-center gap-2">
                <Wallet size={18} className="text-blue-500"/> Kebutuhan (50%)
              </span>
            </div>
            <p className="text-xl font-bold text-gray-800">{formatRupiah(budgetPengeluaran)}</p>
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1 text-gray-500">
                <span>Terpakai: {formatRupiah(totalExpense)}</span>
                <span>Sisa: {formatRupiah(sisaPengeluaran)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${sisaPengeluaran < 0 ? 'bg-red-500' : 'bg-blue-500'}`} 
                  style={{ width: `${Math.min((totalExpense / budgetPengeluaran) * 100 || 0, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
             <div className="flex items-center mb-2">
              <span className="text-gray-500 font-medium flex items-center gap-2">
                <PiggyBank size={18} className="text-green-500"/> Tabungan (30%)
              </span>
            </div>
            <p className="text-xl font-bold text-gray-800">{formatRupiah(budgetTabungan)}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
             <div className="flex items-center mb-2">
              <span className="text-gray-500 font-medium flex items-center gap-2">
                <ShieldAlert size={18} className="text-yellow-500"/> Dana Darurat (20%)
              </span>
            </div>
            <p className="text-xl font-bold text-gray-800">{formatRupiah(budgetDarurat)}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Transaksi Terakhir</h3>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {transactions.length === 0 ? (
            <p className="p-6 text-center text-gray-400">Belum ada transaksi.</p>
          ) : (
            transactions.slice(0, 5).map(t => (
              <div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${t.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {t.type === 'income' ? <ArrowDownCircle size={24} /> : <ArrowUpCircle size={24} />}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{t.category}</p>
                    <p className="text-xs text-gray-500">{t.date} • {t.note}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-bold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatRupiah(t.amount)}
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
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-2xl shadow-sm border border-indigo-100">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="text-purple-500" size={20} />
          <h2 className="text-lg font-bold text-indigo-900">Pencatatan Pintar AI</h2>
        </div>
        <p className="text-xs text-indigo-700 mb-3">Ceritakan transaksi kamu, biar AI yang isi form di bawah secara otomatis.</p>
        <div className="flex flex-col gap-3">
          <textarea 
            value={smartInputText}
            onChange={(e) => setSmartInputText(e.target.value)}
            placeholder="Contoh: Beli tiket nonton bioskop 50 ribu pakai uang jajan..."
            className="w-full p-3 text-sm border border-indigo-200 rounded-xl focus:ring-2 focus:ring-purple-400 outline-none resize-none h-20"
            disabled={isExtracting}
          />
          <button 
            onClick={handleSmartExtract}
            disabled={isExtracting || !smartInputText}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
          >
            {isExtracting ? 'Menganalisis teks...' : 'Isi Form Otomatis ✨'}
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Catat Transaksi Manual</h2>
        <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg">
          <button 
            onClick={() => setFormData({...formData, type: 'expense'})}
            className={`flex-1 py-2 rounded-md font-medium text-sm transition-all ${formData.type === 'expense' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}
          >
            Pengeluaran
          </button>
          <button 
            onClick={() => setFormData({...formData, type: 'income'})}
            className={`flex-1 py-2 rounded-md font-medium text-sm transition-all ${formData.type === 'income' ? 'bg-white shadow text-green-600' : 'text-gray-500'}`}
          >
            Pendapatan
          </button>
        </div>

        <form onSubmit={handleAddTransaction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp)</label>
            <input 
              type="number" 
              required
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: e.target.value})}
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="0"
            />
          </div>

          {formData.type === 'expense' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
              <select 
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="Makan">Uang Makan</option>
                <option value="Jajan">Uang Jajan</option>
                <option value="Transport">Transportasi</option>
                <option value="Tagihan">Tagihan & Cicilan</option>
                <option value="Hiburan">Hiburan</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
            <input 
              type="date" 
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
            <input 
              type="text" 
              value={formData.note}
              onChange={(e) => setFormData({...formData, note: e.target.value})}
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Makan siang..."
            />
          </div>

          <button 
            type="submit" 
            className={`w-full py-3 rounded-xl text-white font-bold mt-4 transition-colors ${formData.type === 'income' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            Simpan Data
          </button>
        </form>
      </div>
    </div>
  );

  const renderLaporan = () => (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-800">Laporan & Limit</h2>

      <div className="bg-gradient-to-r from-purple-600 to-indigo-700 p-6 rounded-2xl shadow-sm text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-white/20 rounded-full">
            <Bot size={24} className="text-white" />
          </div>
          <h3 className="font-semibold text-lg">Asisten Keuangan AI</h3>
        </div>
        
        {aiInsights ? (
          <div className="bg-white/10 p-4 rounded-xl border border-white/20 text-sm leading-relaxed">
            {aiInsights}
          </div>
        ) : (
          <p className="text-purple-100 text-sm mb-4">Dapatkan ringkasan kondisi keuangan dan saran hemat dari AI khusus untukmu berdasarkan data bulan ini.</p>
        )}

        <button 
          onClick={handleGetInsights}
          disabled={isAnalyzing}
          className="mt-4 bg-white text-purple-700 hover:bg-gray-100 disabled:bg-purple-300 disabled:text-purple-500 px-4 py-2 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
        >
          {isAnalyzing ? 'Sedang Menganalisis...' : 'Analisis Keuangan Saya ✨'}
        </button>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-700 mb-4">Pemantauan Limit Pengeluaran</h3>
        
        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-700">Hari Ini</span>
              <span className="text-gray-500">{formatRupiah(expenseToday)} / {formatRupiah(limits.daily)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className={`h-2.5 rounded-full ${expenseToday > limits.daily ? 'bg-red-500' : 'bg-blue-500'}`} 
                style={{ width: `${Math.min((expenseToday / limits.daily) * 100 || 0, 100)}%` }}
              ></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-700">Bulan Ini</span>
              <span className="text-gray-500">{formatRupiah(expenseThisMonth)} / {formatRupiah(limits.monthly)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className={`h-2.5 rounded-full ${expenseThisMonth > limits.monthly ? 'bg-red-500' : 'bg-blue-500'}`} 
                style={{ width: `${Math.min((expenseThisMonth / limits.monthly) * 100 || 0, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-700 mb-4">Grafik Pengeluaran per Kategori</h3>
        {expensesByCategory.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expensesByCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expensesByCategory.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
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
    const buttons = [
      '7', '8', '9', '/',
      '4', '5', '6', '*',
      '1', '2', '3', '-',
      'C', '0', '=', '+'
    ];

    return (
      <div className="max-w-xs mx-auto bg-gray-800 p-6 rounded-3xl shadow-xl animate-fade-in">
        <div className="bg-gray-100 p-4 rounded-xl mb-6 text-right overflow-hidden">
          <span className="text-3xl font-mono font-bold text-gray-800 block truncate">
            {calcInput || '0'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {buttons.map((btn, idx) => (
            <button
              key={idx}
              onClick={() => handleCalcClick(btn)}
              className={`p-4 rounded-xl text-xl font-bold transition-all
                ${btn === 'C' ? 'bg-red-500 text-white hover:bg-red-600' : 
                  btn === '=' ? 'bg-blue-500 text-white hover:bg-blue-600' : 
                  ['/','*','-','+'].includes(btn) ? 'bg-gray-600 text-white hover:bg-gray-700' : 
                  'bg-white text-gray-800 hover:bg-gray-200'}
              `}
            >
              {btn}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="max-w-md mx-auto bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Pengaturan Limit</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Batas Harian (Rp)</label>
          <input 
            type="number" 
            value={limits.daily}
            onChange={(e) => setLimits({...limits, daily: parseFloat(e.target.value) || 0})}
            className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Batas Mingguan (Rp)</label>
          <input 
            type="number" 
            value={limits.weekly}
            onChange={(e) => setLimits({...limits, weekly: parseFloat(e.target.value) || 0})}
            className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Batas Bulanan (Rp)</label>
          <input 
            type="number" 
            value={limits.monthly}
            onChange={(e) => setLimits({...limits, monthly: parseFloat(e.target.value) || 0})}
            className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {showNotification && (
          <div className="p-3 mt-4 bg-green-100 text-green-700 rounded-xl text-sm font-medium text-center animate-fade-in">
            Pengaturan Limit Tersimpan!
          </div>
        )}

        <button 
          onClick={async () => {
            if (!user) return;
            try {
              if (!isFirebaseConfigured) {
                localStorage.setItem('finansialku_limits', JSON.stringify(limits));
              } else {
                const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'limits');
                await setDoc(docRef, limits);
              }
              setShowNotification(true);
              setTimeout(() => setShowNotification(false), 3000);
            } catch (err) {
              console.error("Gagal simpan limit:", err);
            }
          }} 
          className="w-full py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold mt-4"
        >
          Simpan Pengaturan
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      {/* Sidebar Desktop (Disembunyikan di Mobile) */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 fixed h-screen flex-col py-8 z-20 shadow-sm">
        <div className="flex items-center justify-center gap-2 text-2xl font-bold text-blue-600 mb-10">
          <Wallet size={28} /> FinansialKu
        </div>
        <div className="flex flex-col gap-2 px-4 w-full">
          <SidebarItem icon={<Home />} label="Beranda" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={<PlusCircle />} label="Catat Transaksi" isActive={activeTab === 'input'} onClick={() => setActiveTab('input')} isAction />
          <SidebarItem icon={<PieChartIcon />} label="Laporan & AI" isActive={activeTab === 'laporan'} onClick={() => setActiveTab('laporan')} />
          <SidebarItem icon={<CalcIcon />} label="Kalkulator" isActive={activeTab === 'kalkulator'} onClick={() => setActiveTab('kalkulator')} />
          <SidebarItem icon={<Settings />} label="Pengaturan Limit" isActive={activeTab === 'pengaturan'} onClick={() => setActiveTab('pengaturan')} />
        </div>
      </aside>

      {/* Konten Utama */}
      <div className="flex-1 md:ml-64 pb-24 md:pb-8">
        {/* Header Mobile (Disembunyikan di Desktop) */}
        <header className="bg-white shadow-sm sticky top-0 z-10 px-4 py-4 md:hidden">
          <h1 className="text-xl font-bold text-blue-600 text-center flex items-center justify-center gap-2">
            <Wallet size={24} /> FinansialKu
          </h1>
        </header>

        <main className="max-w-4xl mx-auto p-4 md:p-8">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'input' && renderInputData()}
          {activeTab === 'laporan' && renderLaporan()}
          {activeTab === 'kalkulator' && renderCalculator()}
          {activeTab === 'pengaturan' && renderSettings()}
        </main>
      </div>

      {/* Navigasi Bawah Mobile (Disembunyikan di Desktop) */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-200 px-4 py-3 flex justify-around items-center z-20">
        <NavItem icon={<Home />} label="Beranda" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavItem icon={<PieChartIcon />} label="Laporan" isActive={activeTab === 'laporan'} onClick={() => setActiveTab('laporan')} />
        
        <button 
          onClick={() => setActiveTab('input')}
          className="bg-blue-600 text-white p-3 rounded-full shadow-lg transform -translate-y-4 hover:bg-blue-700 transition-all focus:outline-none"
        >
          <PlusCircle size={28} />
        </button>
        
        <NavItem icon={<CalcIcon />} label="Kalkulator" isActive={activeTab === 'kalkulator'} onClick={() => setActiveTab('kalkulator')} />
        <NavItem icon={<Settings />} label="Limit" isActive={activeTab === 'pengaturan'} onClick={() => setActiveTab('pengaturan')} />
      </nav>
    </div>
  );
}

// Sub-component untuk Sidebar Desktop
function SidebarItem({ icon, label, isActive, onClick, isAction }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full text-left font-medium
        ${isActive && !isAction ? 'bg-blue-50 text-blue-600' : ''}
        ${!isActive && !isAction ? 'text-gray-500 hover:bg-gray-50 hover:text-gray-700' : ''}
        ${isAction ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md mt-2 mb-2' : ''}
      `}
    >
      {React.cloneElement(icon, { size: 20 })}
      <span>{label}</span>
    </button>
  );
}

// Sub-component untuk Bottom Nav Item Mobile
function NavItem({ icon, label, isActive, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
    >
      <div className={isActive ? 'scale-110 transition-transform' : ''}>
        {React.cloneElement(icon, { size: 22 })}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}