'use client';

import { useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { KeyRound, Mail, Loader2, ShieldAlert } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Logowanie przez Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Sprawdzenie roli w Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // 3. Sprytny Routing na podstawie uprawnień
        if (userData.role === 'superadmin') {
          window.location.href = '/admin/dealers';
        } else {
          // Dla roli 'admin' (szef salonu) i 'user' (handlowiec)
          window.location.href = '/dashboard';
        }
      } else {
        setError('Nie znaleziono profilu pracownika w systemie.');
        await auth.signOut();
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential') {
        setError('Błędny email lub hasło.');
      } else {
        setError('Wystąpił problem z logowaniem.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        
        {/* Tło i dekoracje */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-blue-500"></div>
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
            <KeyRound className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Portal Pracownika</h1>
          <p className="text-sm text-slate-400 mt-2">Zaloguj się do systemu, aby kontynuować</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5 relative z-10">
          <div>
            <label className="block text-xs uppercase font-bold text-slate-400 mb-1.5 ml-1">
              Adres Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-500" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jan.kowalski@nivette.pl"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase font-bold text-slate-400 mb-1.5 ml-1">
              Hasło
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2 text-rose-400 text-sm">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Zaloguj się'}
          </button>
        </form>
        
        <div className="mt-8 text-center">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
            System Centralny SaaS
          </p>
        </div>
      </div>
    </div>
  );
}