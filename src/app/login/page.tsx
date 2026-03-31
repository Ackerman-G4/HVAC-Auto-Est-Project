'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Zap, Mail, Calendar, LogIn, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const { signInWithGoogle, signInWithEmail, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEmailLogin, setIsEmailLogin] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAuthLoading(true);
    try {
      await signInWithEmail(email, birthday);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google.');
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#f8fafc] px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white p-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center"
      >
        <div className="flex items-center justify-center p-4 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/30 mb-8">
          <Zap size={40} className="text-white" />
        </div>
        
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3 text-center">
          HVAC<span className="text-blue-600">APP</span>
        </h1>
        <p className="text-slate-500 font-medium mb-8 leading-relaxed text-center">
          The next-generation HVAC engineering automation platform.
        </p>

        {error && (
          <div className="w-full mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <div className="w-full space-y-4">
          {!isEmailLogin ? (
            <>
              <button
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="w-full flex items-center justify-center gap-4 bg-white border-2 border-slate-100 hover:border-blue-100 hover:bg-blue-50/30 px-6 py-4 rounded-2xl font-bold text-slate-700 hover:text-blue-700 transition-all duration-300 shadow-sm hover:shadow-md group disabled:opacity-50"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/02/20/google_g_logo.svg" alt="Google" className="w-6 h-6" />
                <span>Sign in with Google</span>
              </button>
              
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-4 text-slate-400 font-bold">Or use your credentials</span>
                </div>
              </div>

              <button
                onClick={() => setIsEmailLogin(true)}
                className="w-full flex items-center justify-center gap-3 bg-slate-50 border border-slate-100 hover:bg-slate-100 px-6 py-4 rounded-2xl font-bold text-slate-600 transition-all"
              >
                <Mail size={20} />
                <span>Sign in with Email</span>
              </button>
            </>
          ) : (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Work Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="email"
                    required
                    placeholder="name@ave-venture.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Birthday (as password)</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="date"
                    required
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
                <p className="text-[10px] text-slate-400 ml-1 mt-1 italic">
                  Format: MM/DD/YYYY. This will be used as your initial password.
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 px-6 py-4 rounded-2xl font-bold text-white shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
                >
                  {authLoading ? (
                    <div className="animate-spin rounded-full h-5 w-12 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <LogIn size={20} />
                      <span>Sign In</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEmailLogin(false)}
                  className="w-full py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Back to Google Login
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="mt-10 text-[10px] text-slate-400 font-bold flex flex-col gap-1 text-center uppercase tracking-widest">
          <p>© 2026 HVAC Engineering Automation</p>
          <p>Restricted to Authorized Personnel Only</p>
        </div>
      </motion.div>
    </div>
  );
}
