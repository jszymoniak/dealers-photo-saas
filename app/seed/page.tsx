'use client';

import { useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldCheck, Database, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function SeedDatabasePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const log = (msg: string) => {
    setStatus((prev) => [...prev, msg]);
  };

  const runSeeder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatus([]);

    try {
      log('1. Tworzenie / weryfikacja konta SuperAdmina w Auth...');
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        log(`✓ Utworzono nowe konto użytkownika (UID: ${userCredential.user.uid})`);
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          log('Konto już istnieje w Auth, logowanie w celu aktualizacji profilu...');
          userCredential = await signInWithEmailAndPassword(auth, email, password);
          log(`✓ Zalogowano pomyślnie (UID: ${userCredential.user.uid})`);
        } else {
          throw authErr;
        }
      }

      const uid = userCredential.user.uid;

      log('2. Nadawanie uprawnień SuperAdmina w kolekcji /users...');
      await setDoc(
        doc(db, 'users', uid),
        {
          email: email,
          role: 'superadmin',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      log('✓ Dokument /users z rolą "superadmin" został zapisany.');

      log('3. Inicjalizacja pierwszego Dealera w kolekcji /dealers...');
      await setDoc(
        doc(db, 'dealers', 'nivette'),
        {
          dealerId: 'nivette',
          name: 'Grupa Nivette',
          domain: 'nivette.saas.local',
          isActive: true,
          settings: {
            requiredSteps: 8,
            watermarkEnabled: false,
          },
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      log('✓ Dokument /dealers/nivette utworzony pomyślnie.');

      setIsDone(true);
      log('🎉 SEEDING ZAKOŃCZONY SUKCESEM! Baza jest gotowa.');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Wystąpił nieoczekiwany błąd podczas seedowania.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-6 border-b border-slate-700 pb-4">
          <Database className="w-8 h-8 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold">Inicjalizator SaaS (Seeder)</h1>
            <p className="text-xs text-slate-400">Pierwsza konfiguracja ról i tenantów</p>
          </div>
        </div>

        <form onSubmit={runSeeder} className="space-y-4">
          <div>
            <label className="block text-xs uppercase font-bold text-slate-400 mb-1">
              Email SuperAdmina
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@twojadomena.pl"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold text-slate-400 mb-1">
              Hasło (min. 6 znaków)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading || isDone}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Inicjalizowanie...
              </>
            ) : isDone ? (
              <>
                <CheckCircle2 className="w-5 h-5" /> Gotowe
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" /> Utwórz SuperAdmina i Dealera
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-start gap-2 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {status.length > 0 && (
          <div className="mt-4 p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
            {status.map((item, idx) => (
              <div
                key={idx}
                className={item.startsWith('✓') || item.startsWith('🎉') ? 'text-emerald-400' : 'text-slate-300'}
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}