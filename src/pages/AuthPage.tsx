import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MailIcon, LockIcon, UserIcon, ArrowRightIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '../components/brand/Logo';
type AuthMode = 'login' | 'register' | 'forgot_password';
export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'register' && password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      if (mode === 'forgot_password') {
        toast.success('Password reset link sent to your email');
        setMode('login');
      } else {
        toast.success(
          mode === 'login' ? 'Welcome back!' : 'Account created successfully'
        );
        navigate('/');
      }
    }, 1000);
  };
  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl" />
        <div className="absolute top-40 -left-40 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <Logo variant="mark" size={52} className="dark:hidden" />
          <Logo
            variant="mark"
            size={52}
            inverted
            className="hidden dark:block" />

        </div>
        <h2
          className="mt-5 text-center font-semibold uppercase tracking-[0.2em] text-slate-900 dark:text-white"
          style={{
            fontSize: '0.8rem'
          }}>

          MattrMindr<span className="opacity-60 ml-0.5">Scribe</span>
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400">
          {mode === 'login' && 'Sign in to your account'}
          {mode === 'register' && 'Create a new account'}
          {mode === 'forgot_password' && 'Reset your password'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white dark:bg-slate-900 py-8 px-4 shadow-xl shadow-slate-200/50 dark:shadow-none sm:rounded-2xl sm:px-10 border border-slate-100 dark:border-slate-800">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <AnimatePresence mode="wait">
              {mode === 'register' &&
              <motion.div
                initial={{
                  opacity: 0,
                  height: 0,
                  overflow: 'hidden'
                }}
                animate={{
                  opacity: 1,
                  height: 'auto',
                  overflow: 'visible'
                }}
                exit={{
                  opacity: 0,
                  height: 0,
                  overflow: 'hidden'
                }}
                transition={{
                  duration: 0.2
                }}>

                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                    type="text"
                    required={mode === 'register'}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow sm:text-sm"
                    placeholder="Jane Doe" />

                  </div>
                </motion.div>
              }
            </AnimatePresence>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MailIcon className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow sm:text-sm"
                  placeholder="you@example.com" />

              </div>
            </div>

            <AnimatePresence mode="wait">
              {mode !== 'forgot_password' &&
              <motion.div
                initial={{
                  opacity: 0,
                  height: 0,
                  overflow: 'hidden'
                }}
                animate={{
                  opacity: 1,
                  height: 'auto',
                  overflow: 'visible'
                }}
                exit={{
                  opacity: 0,
                  height: 0,
                  overflow: 'hidden'
                }}
                transition={{
                  duration: 0.2
                }}
                className="space-y-5">

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Password
                      </label>
                      {mode === 'login' &&
                    <button
                      type="button"
                      onClick={() => setMode('forgot_password')}
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">

                          Forgot password?
                        </button>
                    }
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <LockIcon className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                      type="password"
                      required={mode !== 'forgot_password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow sm:text-sm"
                      placeholder="••••••••" />

                    </div>
                  </div>

                  {mode === 'register' &&
                <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <LockIcon className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                      type="password"
                      required={mode === 'register'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow sm:text-sm"
                      placeholder="••••••••" />

                      </div>
                    </div>
                }
                </motion.div>
              }
            </AnimatePresence>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all">

                {isLoading ?
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> :

                <>
                    {mode === 'login' && 'Sign in'}
                    {mode === 'register' && 'Create account'}
                    {mode === 'forgot_password' && 'Send reset link'}
                    <ArrowRightIcon className="h-4 w-4" />
                  </>
                }
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                  {mode === 'login' ?
                  'New to MattrMindrScribe?' :
                  'Already have an account?'}
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="w-full flex justify-center py-2.5 px-4 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors">

                {mode === 'login' ? 'Create an account' : 'Sign in instead'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>);

}