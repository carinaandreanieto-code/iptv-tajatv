import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Customer, Ad, UserStatus } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Smartphone, LogIn, ExternalLink, ShieldAlert } from "lucide-react";

interface LoginProps {
  onLoginSuccess: (customer: Customer) => void;
  onGoToAdmin: () => void;
}

export default function Login({ onLoginSuccess, onGoToAdmin }: LoginProps) {
  const [customerNumber, setCustomerNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ads, setAds] = useState<Ad[]>([]);

  useEffect(() => {
    const fetchAds = async () => {
      try {
        const q = query(
          collection(db, "ads"), 
          where("active", "==", true),
          limit(3)
        );
        const snap = await getDocs(q);
        const adsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad));
        setAds(adsData);
      } catch (err) {
        console.error("Error fetching ads", err);
      }
    };
    fetchAds();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const q = query(
        collection(db, "customers"),
        where("customerNumber", "==", customerNumber),
        where("password", "==", password),
        limit(1)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setError("Número de cliente o contraseña incorrectos.");
        setLoading(false);
        return;
      }

      const customerData = { id: snap.docs[0].id, ...snap.docs[0].data() } as Customer;

      // Validate status
      if (customerData.status === UserStatus.INACTIVE) {
        setError("Su servicio se encuentra suspendido. Por favor comuníquese con la empresa.");
        setLoading(false);
        return;
      }

      // Validate expiration
      const expDate = new Date(customerData.expirationDate);
      if (expDate < new Date()) {
        setError("Su servicio ha vencido. Por favor realice su pago para continuar.");
        setLoading(false);
        return;
      }

      onLoginSuccess(customerData);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, "customers");
      setError("Error al conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#1a1a1a] border border-gray-800 rounded-2xl shadow-2xl p-8 space-y-8"
      >
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-400">
            TajaTV
          </h1>
          <p className="text-gray-500 font-medium">Accede a lo mejor del entretenimiento</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-400 px-1">Número de Cliente</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  className="w-full bg-[#242424] border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all font-mono"
                  placeholder="000000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-400 px-1">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#242424] border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-start gap-3"
              >
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                Ingresar
              </>
            )}
          </button>
        </form>

        <button 
          onClick={onGoToAdmin}
          className="w-full text-gray-600 text-xs hover:text-gray-400 transition-colors pt-4"
        >
          TajaTV v1.1
        </button>
      </motion.div>

      {/* Ads Section */}
      {ads.length > 0 && (
        <div className="mt-12 w-full max-w-4xl">
          <h3 className="text-gray-500 text-center uppercase tracking-widest text-xs font-bold mb-6">Promociones y Avisos</h3>
          <div className="flex flex-wrap justify-center gap-6">
            {ads.map((ad) => (
              <motion.div 
                key={ad.id}
                whileHover={{ y: -5 }}
                className="w-full sm:w-[300px] bg-[#1a1a1a] border border-gray-800 rounded-2xl overflow-hidden group cursor-pointer"
                onClick={() => window.open(`https://wa.me/${ad.whatsappNumber}`, '_blank')}
              >
                <div className="aspect-video relative overflow-hidden">
                  <img 
                    src={ad.imageUrl} 
                    alt={ad.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] to-transparent opacity-60" />
                </div>
                <div className="p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-gray-100">{ad.title}</h4>
                    <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-red-500 transition-colors" />
                  </div>
                  <p className="text-gray-400 text-sm line-clamp-2 leading-relaxed">
                    {ad.text}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
