'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';;
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Building2, Plus, CheckCircle2, XCircle, ShieldCheck, Loader2, ExternalLink, LogOut, Users } from 'lucide-react';
import Link from 'next/link';

interface Dealer {
  dealerId: string;
  name: string;
  domain: string;
  isActive: boolean;
  settings?: {
    requiredSteps?: number;
    watermarkEnabled?: boolean;
  };
}

export default function AdminDealersPage() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Formularz dodawania nowego dealera
  const [dealerName, setDealerName] = useState('');
  const [dealerSlug, setDealerSlug] = useState('');
  const [dealerDomain, setDealerDomain] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      // Weryfikacja czy użytkownik to SuperAdmin
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await (await import('firebase/firestore')).getDoc(userDocRef);
        if (userSnap.exists() && userSnap.data()?.role === 'superadmin') {
          setIsSuperAdmin(true);
          await fetchDealers();
        } else {
          setIsSuperAdmin(false);
        }
      } catch (err) {
        console.error('Błąd autoryzacji:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchDealers = async () => {
    try {
      const snap = await getDocs(collection(db, 'dealers'));
      const list: Dealer[] = [];
      snap.forEach((doc) => {
        list.push(doc.data() as Dealer);
      });
      setDealers(list);
    } catch (err) {
      console.error('Błąd pobierania dealerów:', err);
    }
  };

  const handleCreateDealer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealerSlug || !dealerName) return;

    setIsSubmitting(true);
    try {
      const formattedSlug = dealerSlug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
      const newDealer: Dealer = {
        dealerId: formattedSlug,
        name: dealerName,
        domain: dealerDomain || `${formattedSlug}.twojsaas.pl`,
        isActive: true,
        settings: {
          requiredSteps: 8,
          watermarkEnabled: false,
        },
      };

      await setDoc(doc(db, 'dealers', formattedSlug), {
        ...newDealer,
        createdAt: serverTimestamp(),
      });

      setDealerName('');
      setDealerSlug('');
      setDealerDomain('');
      await fetchDealers();
    } catch (err) {
      console.error('Błąd tworzenia dealera:', err);
      alert('Nie udało się utworzyć profilu dealera.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
        <XCircle className="w-16 h-16 text-rose-500 mb-4" />
        <h1 className="text-2xl font-bold">Brak dostępu</h1>
        <p className="text-slate-400 mt-2">Musisz być zalogowany jako SuperAdmin.</p>
        <Link href="/login" className="mt-4 px-4 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-sm">
          Przejdź do logowania
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold mb-1">
              <ShieldCheck className="w-5 h-5" /> SaaS SuperAdmin Console
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Zarządzanie Dealerami (Tenants)</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-slate-400">
              Zalogowano: <span className="text-slate-200">{auth.currentUser?.email}</span>
            </div>
            <button 
              onClick={handleLogout} 
              className="text-sm text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition-colors p-2 rounded-lg hover:bg-slate-900"
            >
              <LogOut className="w-4 h-4" /> Wyloguj
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Formularz dodawania nowego dealera */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit shadow-xl">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" /> Dodaj nowego Dealera
            </h2>

            <form onSubmit={handleCreateDealer} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs uppercase font-bold text-slate-400 mb-1">
                  Nazwa Grupy / Dealera
                </label>
                <input
                  type="text"
                  required
                  placeholder="np. Nivette Warszawa"
                  value={dealerName}
                  onChange={(e) => {
                    setDealerName(e.target.value);
                    if (!dealerSlug) {
                      setDealerSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-bold text-slate-400 mb-1">
                  Identyfikator (Slug / ID katalogu)
                </label>
                <input
                  type="text"
                  required
                  placeholder="np. nivette-warszawa"
                  value={dealerSlug}
                  onChange={(e) => setDealerSlug(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">Używany jako nazwa folderu w Firebase Storage.</p>
              </div>

              <div>
                <label className="block text-xs uppercase font-bold text-slate-400 mb-1">
                  Domena / Subdomena
                </label>
                <input
                  type="text"
                  placeholder="np. foto.nivette.pl"
                  value={dealerDomain}
                  onChange={(e) => setDealerDomain(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aktywuj Salon w SaaS'}
              </button>
            </form>
          </div>

          {/* Lista aktywnych dealerów */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-400" /> Aktywne Grupy ({dealers.length})
            </h2>

            <div className="space-y-3">
{dealers.map((dealer) => (
                <div
                  key={dealer.dealerId}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between hover:border-slate-700 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-white">{dealer.name}</span>
                      {dealer.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Aktywny
                        </span>
                      ) : (
                        <span className="text-[11px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full font-medium">
                          Zablokowany
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 font-mono">
                      <span>ID: <strong className="text-slate-200">{dealer.dealerId}</strong></span>
                      <span>Domena: <strong className="text-slate-200">{dealer.domain}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/dealers/${dealer.dealerId}`}
                      className="p-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Zarządzaj zespołem tego dealera"
                    >
                      <Users className="w-3.5 h-3.5" /> Zespół
                    </Link>
                    <Link
                      href={`/session/DEMO-${dealer.dealerId.toUpperCase()}`}
                      className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Otwórz testową sesję aparatu dla tego dealera"
                    >
                      Aparat <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
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