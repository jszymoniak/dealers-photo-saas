'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { Users, UserPlus, Shield, Camera, ArrowLeft, Loader2, Lock } from 'lucide-react';
import Link from 'next/link';

interface UserData {
  id: string;
  email: string;
  role: string;
}

export default function DealerTeamPage() {
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Formularz nowego pracownika
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          if (userSnap.exists() && userSnap.data().role === 'admin') {
            setIsAdmin(true);
            setDealerId(userSnap.data().dealerId);
            fetchUsers(userSnap.data().dealerId);
          } else {
            setIsAdmin(false);
            setLoading(false);
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        window.location.href = '/login';
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchUsers = async (dId: string) => {
    try {
      const q = query(collection(db, 'users'), where('dealerId', '==', dId));
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
    if (!dealerId) return;
    setIsSubmitting(true);
    
    try {
      const cred = await createUserWithEmailAndPassword(auth, newEmail, newPassword);
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: newEmail,
        role: newRole,
        dealerId: dealerId,
        createdAt: serverTimestamp(),
      });

      setNewEmail('');
      setNewPassword('');
      alert('Konto pracownika zostało utworzone! (Firebase testowo przelogował Cię na nowe konto)');
      window.location.href = '/login'; // Wymuszamy ponowne logowanie po utworzeniu testowym
    } catch (err: any) {
      alert(`Błąd: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center">
        <Lock className="w-16 h-16 text-rose-500 mb-4" />
        <h1 className="text-2xl font-bold">Brak uprawnień</h1>
        <p className="text-slate-400 mt-2">Ta strona jest dostępna tylko dla Administratorów Salonu.</p>
        <Link href="/dashboard" className="mt-6 px-6 py-2 bg-emerald-600 rounded-lg">Wróć do Dashboardu</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <div className="flex items-center gap-4 border-b border-slate-800 pb-6">
          <Link href="/dashboard" className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <div className="text-blue-400 text-sm font-semibold mb-1">Zarządzanie Zespołem</div>
            <h1 className="text-3xl font-bold tracking-tight">Konta pracowników ({dealerId})</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Formularz dodawania */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit shadow-xl">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-400" /> Dodaj Pracownika
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
                  <option value="admin">Drugi Administrator Salonu</option>
                </select>
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Utwórz konto'}
              </button>
            </form>
          </div>

          {/* Lista pracowników */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" /> Aktywny Zespół ({users.length})
            </h2>
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-white text-lg">{u.email}</div>
                    <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                      {u.role === 'admin' ? <Shield className="w-3.5 h-3.5 text-rose-400" /> : <Camera className="w-3.5 h-3.5 text-emerald-400" />}
                      <span>Rola: {u.role === 'admin' ? 'Admin Salonu' : 'Fotograf / Handlowiec'}</span>
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