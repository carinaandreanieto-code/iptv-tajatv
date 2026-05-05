/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./lib/firebase";
import Login from "./components/Login";
import Player from "./components/Player";
import Admin from "./components/Admin";
import { Customer } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [view, setView] = useState<"login" | "player" | "admin">("login");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u?.email === "carinaandreanieto@gmail.com") {
        // Automatically show admin if tech user logs in? 
        // Or just let them switch.
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleLoginSuccess = (loggedInCustomer: Customer) => {
    setCustomer(loggedInCustomer);
    setView("player");
  };

  const handleLogout = () => {
    setCustomer(null);
    setView("login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 selection:bg-red-500/30 selection:text-red-200">
      {view === "login" && (
        <Login 
          onLoginSuccess={handleLoginSuccess} 
          onGoToAdmin={() => setView("admin")} 
        />
      )}
      {view === "player" && customer && (
        <Player customer={customer} onLogout={handleLogout} />
      )}
      {view === "admin" && (
        <Admin onBack={() => setView("login")} />
      )}
    </div>
  );
}

