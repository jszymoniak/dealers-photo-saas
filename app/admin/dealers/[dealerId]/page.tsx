'use client';

import { useState, useEffect, use } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';

import { Users, UserPlus, Shield, Camera, ArrowLeft, Loader2, LogOut } from 'lucide-react';
import Link from 'next/link';

interface UserData {
  id: string;
  email: string;
  role: string;
  createdAt?: any;
}

export default function DealerAdminPage({ params }: { params: Promise<{ dealerId: string }> }) {
  const resolvedParams = use(params);
  const dealerId = resolvedParams.dealerId;

  const [dealerName, setDealerName] = useState<string>('');
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  // Formularz nowego pracownika
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user'); // 'user' = fotograf/handlowiec, 'admin' = szef salonu
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchDealerData();
    fetchUsers();
  }, [dealerId]);

  const fetchDealerData = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'dealers', dealerId));
      if (docSnap.exists()) {
        setDealerName(docSnap.data().name);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const q = query(collection(db, 'users'), where('dealerId', '==', dealerId));
      const snap = await getDocs(q);
      const list: UserData[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as UserData));
      setUsers(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // 1. Tworzymy konto w Firebase Auth
      const cred = await createUserWithEmailAndPassword(auth, newEmail, newPassword);
      
      // 2. Dodajemy profil pracownika do Firestore z przypisaniem do TEGO dealera
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: newEmail,
        role: newRole,
        dealerId: dealerId,
        createdAt: serverTimestamp(),
      });

      setNewEmail('');
      setNewPassword('');
      await fetchUsers();
      
      // UWAGA: createUserWithEmailAndPassword automatycznie loguje nowego użytkownika.
      // W systemie produkcyjnym używa się do tego Firebase Admin SDK po stronie serwera.
      alert('Konto pracownika zostało utworzone! (Firebase automatycznie przelogował Cię na to konto)');
      
    } catch (err: any) {
      console.error(err);
      alert(`Błąd: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/login';
  };

  if (loading) return <div className="min-h-screen bg-slate-900 flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center border-b border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <Link href="/admin/dealers" className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <div className="text-emerald-400 text-sm font-semibold mb-1">Panel Najemcy (Tenant)</div>
              <h1 className="text-3xl font-bold tracking-tight">{dealerName || dealerId}</h1>
            </div>
          </div>
          
          <button 
            onClick={handleLogout} 
            className="text-sm text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition-colors p-2 bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            <LogOut className="w-4 h-4" /> Wyloguj
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Dodawanie pracownika */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit shadow-xl">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-400" /> Dodaj Pracownika
            </h2>
            <form onSubmit={handleCreateUser} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Email</label>
                <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Hasło</label>
                <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Uprawnienia</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
                  <option value="user">Handlowiec / Fotograf (Aplikacja)</option>
                  <option value="admin">Administrator Salonu</option>
                </select>
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Utwórz konto'}
              </button>
            </form>
          </div>

          {/* Lista pracowników */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" /> Zespół ({users.length})
            </h2>
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-white">{u.email}</div>
                    <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                      {u.role === 'admin' ? <Shield className="w-3.5 h-3.5 text-rose-400" /> : <Camera className="w-3.5 h-3.5 text-emerald-400" />}
                      <span>Rola: {u.role === 'admin' ? 'Admin Salonu' : 'Fotograf'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}