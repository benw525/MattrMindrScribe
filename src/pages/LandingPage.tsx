import React from 'react';
import { Link } from 'react-router-dom';
import { 
  FileAudioIcon, ShieldCheckIcon, ZapIcon, UsersIcon, 
  CheckIcon, ArrowRightIcon, MicIcon, FolderOpenIcon,
  PlayCircleIcon
} from 'lucide-react';
import { Logo } from '../components/brand/Logo';

const features = [
  {
    icon: MicIcon,
    title: 'AI-Powered Transcription',
    description: 'Upload audio or video files and get accurate transcriptions powered by advanced AI models.',
  },
  {
    icon: FolderOpenIcon,
    title: 'Case Management',
    description: 'Organize transcripts by case with folders, tags, and smart search for effortless retrieval.',
  },
  {
    icon: PlayCircleIcon,
    title: 'Synced Playback',
    description: 'Follow along with synchronized audio playback. Click any text to jump to that moment.',
  },
  {
    icon: UsersIcon,
    title: 'Speaker Identification',
    description: 'Automatically detect and label speakers. Rename and manage speakers across transcripts.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Version History',
    description: 'Track every edit with full version control. Restore any previous version instantly.',
  },
  {
    icon: ZapIcon,
    title: 'Present Mode',
    description: 'Display transcripts during depositions and hearings with a clean, focused presentation view.',
  },
];

const tiers = [
  {
    name: 'Starter',
    price: '29',
    description: 'For solo practitioners getting started.',
    features: [
      '5 hours of transcription per month',
      'Basic speaker identification',
      'Case folder organization',
      'Email support',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
  },
  {
    name: 'Professional',
    price: '79',
    description: 'For busy attorneys and law firms.',
    features: [
      '25 hours of transcription per month',
      'Advanced AI speaker detection',
      'Version history & audit trail',
      'Present mode for hearings',
      'Priority support',
      'Team collaboration',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '199',
    description: 'For large firms with high volume needs.',
    features: [
      'Unlimited transcription hours',
      'Custom AI model training',
      'SSO & advanced security',
      'Dedicated account manager',
      'API access',
      'Custom integrations',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <nav className="fixed top-0 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Logo variant="mark" size={32} className="dark:hidden" />
              <Logo variant="mark" size={32} inverted className="hidden dark:block" />
              <span className="font-semibold uppercase tracking-[0.15em] text-slate-900 dark:text-white text-sm">
                MattrMindr<span className="opacity-60 ml-0.5">Scribe</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                Sign In
              </Link>
              <Link
                to="/login"
                className="text-sm font-medium px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl" />
          <div className="absolute top-20 -left-40 w-[400px] h-[400px] bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white leading-tight">
            Legal Transcription,{' '}
            <span className="text-indigo-600 dark:text-indigo-400">Reimagined</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            AI-powered transcription built for legal professionals. Turn depositions, hearings, 
            and client meetings into accurate, searchable transcripts in minutes.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/25">
              Start Free Trial
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              See How It Works
            </a>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 px-4 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Everything You Need for Legal Transcription
            </h2>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Purpose-built tools for attorneys, paralegals, and legal teams to streamline transcript management.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 hover:shadow-lg transition-shadow">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Choose the plan that fits your practice. All plans include a 14-day free trial.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl p-8 ${
                  tier.highlighted
                    ? 'bg-indigo-600 text-white ring-2 ring-indigo-600 shadow-xl shadow-indigo-500/25'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                }`}>
                {tier.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-500 text-white text-xs font-medium rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className={`text-lg font-semibold ${tier.highlighted ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  {tier.name}
                </h3>
                <p className={`mt-1 text-sm ${tier.highlighted ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}>
                  {tier.description}
                </p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className={`text-4xl font-bold ${tier.highlighted ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                    ${tier.price}
                  </span>
                  <span className={`text-sm ${tier.highlighted ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}>
                    /month
                  </span>
                </div>
                <ul className="mt-6 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        tier.highlighted ? 'text-indigo-200' : 'text-indigo-600 dark:text-indigo-400'
                      }`} />
                      <span className={`text-sm ${tier.highlighted ? 'text-indigo-100' : 'text-slate-600 dark:text-slate-400'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/login"
                  className={`mt-8 block w-full text-center py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
                    tier.highlighted
                      ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}>
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 px-4 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Logo variant="mark" size={24} className="dark:hidden" />
            <Logo variant="mark" size={24} inverted className="hidden dark:block" />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              MattrMindrScribe
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            &copy; {new Date().getFullYear()} MattrMindr. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
