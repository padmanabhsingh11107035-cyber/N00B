import React, { useState } from 'react';
import {
  X,
  Lock,
  Sparkles,
  Ticket,
  Coins,
  Crown,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Check
} from 'lucide-react';
import { User } from '../../types';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { safeJsonStringify } from '../../utils/safeJson';
import confetti from 'canvas-confetti';

interface GetVerifiedModalProps {
  isOpen: boolean;
  currentUser: User;
  onClose: () => void;
  onVerificationSuccess: (updatedUser: User) => void;
}

type VerificationOption = 'coupon' | 'points_perm' | 'points_month';

export const GetVerifiedModal: React.FC<GetVerifiedModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onVerificationSuccess
}) => {
  // Step 1: 'select_plan' -> Step 2: 'payment' -> Step 3: 'success_animation'
  const [step, setStep] = useState<'select_plan' | 'payment' | 'success_animation'>('select_plan');
  const [selectedOption, setSelectedOption] = useState<VerificationOption>('coupon');
  
  const [password, setPassword] = useState('');
  const [couponCode, setCouponCode] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [verifiedUserResult, setVerifiedUserResult] = useState<User | null>(null);

  if (!isOpen) return null;

  // Handle proceed to Authorization / Verification Step
  const handleProceedToPayment = () => {
    setErrorMsg('');
    setStep('payment');
  };

  // Submit verification & password authentication
  const handleCompleteVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!password.trim()) {
      setErrorMsg('Please enter your account password to authorize verification.');
      return;
    }

    if (selectedOption === 'coupon' && !couponCode.trim()) {
      setErrorMsg('Please enter your VIP verification coupon code.');
      return;
    }

    try {
      setLoading(true);

      const serverMethod =
        selectedOption === 'coupon'
          ? 'coupon'
          : selectedOption === 'points_perm'
          ? 'points_permanent'
          : 'points_monthly';

      const res = await fetch('/api/users/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: safeJsonStringify({
          password: password.trim(),
          method: serverMethod,
          couponCode: couponCode.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Verification failed. Please check your credentials.');
      }

      const updatedUser = data.user || {
        ...currentUser,
        isVerified: true,
        verificationTier: 'premium'
      };

      setVerifiedUserResult(updatedUser);
      setStep('success_animation');

      // Trigger celebratory confetti
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.4 }
      });

      // Auto return to profile page after 2.5 seconds
      setTimeout(() => {
        onVerificationSuccess(updatedUser);
        onClose();
        setStep('select_plan');
        setPassword('');
        setCouponCode('');
      }, 2500);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl space-y-5 overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div className="absolute -top-12 -left-12 w-44 h-44 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-44 h-44 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center shadow-md">
              <VerifiedBadge size="lg" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight flex items-center gap-1.5">
                <span>Get Verified on NOOB</span>
                <VerifiedBadge size="sm" />
              </h2>
              <p className="text-xs text-zinc-400">Unlock your official Verified Badge</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl bg-zinc-900/80 border border-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SUCCESS COMPLETION ANIMATION */}
        {step === 'success_animation' && (
          <div className="py-8 px-4 flex flex-col items-center text-center space-y-4 relative z-10 animate-in zoom-in-95 duration-300">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-white to-zinc-400 p-1 flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.4)] animate-pulse">
                <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                  <VerifiedBadge size="xl" />
                </div>
              </div>
              <span className="absolute -bottom-1 -right-1 p-1.5 bg-[#00FF66] text-black rounded-full shadow-lg">
                <Check className="w-4 h-4 stroke-[3]" />
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-white">Verification Successful!</h3>
              <p className="text-xs text-zinc-300 max-w-xs mx-auto">
                Official Verified Badge has been activated for <strong className="text-white font-bold">@{currentUser.username}</strong>.
              </p>
            </div>

            <div className="w-full max-w-xs bg-zinc-900 rounded-full h-1.5 overflow-hidden mt-3">
              <div className="bg-gradient-to-r from-white to-[#00FF66] h-full w-full animate-[progress_2.5s_ease-in-out]" />
            </div>
            <span className="text-[11px] text-zinc-500 font-medium">Returning to profile...</span>
          </div>
        )}

        {/* STEP 1: SELECT VERIFICATION PLAN */}
        {step === 'select_plan' && (
          <div className="space-y-4 relative z-10">
            {currentUser.isVerified ? (
              <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-700 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-white font-bold">
                  <span>Account Already Verified</span>
                  <VerifiedBadge size="md" />
                </div>
                <p className="text-xs text-zinc-300">
                  Your account @{currentUser.username} enjoys full verified prestige across all feeds, explore directories, and leaderboard standings!
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-300 block">
                    Choose Verification Option
                  </label>

                  <div className="grid grid-cols-1 gap-2.5">
                    {/* Method 1: Coupon Code */}
                    <div
                      onClick={() => setSelectedOption('coupon')}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedOption === 'coupon'
                          ? 'bg-zinc-900 border-white/80 shadow-md shadow-white/5'
                          : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                          <Ticket className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">Apply Hidden Coupon</span>
                          <span className="text-[10px] text-zinc-400 block">Instant VIP Activation Code</span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                        VIP Code
                      </span>
                    </div>

                    {/* Method 2: 100M NOOB Points */}
                    <div
                      onClick={() => setSelectedOption('points_perm')}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedOption === 'points_perm'
                          ? 'bg-zinc-900 border-white/80 shadow-md shadow-white/5'
                          : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                          <Crown className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">100M NOOB Points (Permanent)</span>
                          <span className="text-[10px] text-zinc-400 block">Lifetime permanent verified checkmark</span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        Lifetime
                      </span>
                    </div>

                    {/* Method 3: 50k NOOB Points / Month */}
                    <div
                      onClick={() => setSelectedOption('points_month')}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedOption === 'points_month'
                          ? 'bg-zinc-900 border-white/80 shadow-md shadow-white/5'
                          : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                          <Coins className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">50,000 NOOB Points / Month</span>
                          <span className="text-[10px] text-zinc-400 block">Monthly badge subscription</span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        50k / mo
                      </span>
                    </div>
                  </div>
                </div>

                {/* Prominent "Verify Account Now" Button */}
                <button
                  type="button"
                  onClick={handleProceedToPayment}
                  className="w-full py-3.5 px-4 rounded-2xl bg-[#00FF66] hover:bg-[#00e65c] text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#00FF66]/20 transition-all cursor-pointer"
                >
                  <VerifiedBadge size="sm" />
                  <span>Verify Account Now</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>
              </>
            )}
          </div>
        )}

        {/* STEP 2: AUTHORIZATION PAGE */}
        {step === 'payment' && (
          <form onSubmit={handleCompleteVerification} className="space-y-4 relative z-10">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <button
                type="button"
                onClick={() => setStep('select_plan')}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <span className="text-xs font-bold text-zinc-300">Account Authorization</span>
            </div>

            {/* Selected Plan Summary Banner */}
            <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                  <VerifiedBadge size="sm" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">
                    {selectedOption === 'coupon'
                      ? 'Hidden VIP Coupon Activation'
                      : selectedOption === 'points_perm'
                      ? '100M Permanent Points Plan'
                      : '50,000 Monthly Points Plan'}
                  </span>
                  <span className="text-[10px] text-zinc-400 block">Verified Badge for @{currentUser.username}</span>
                </div>
              </div>
              <span className="text-xs font-black text-[#00FF66]">
                FREE
              </span>
            </div>

            {/* Coupon Code Input if coupon selected */}
            {selectedOption === 'coupon' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300 block">Enter Verification Coupon Code</label>
                <div className="relative">
                  <Ticket className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Enter VIP coupon code..."
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white font-mono"
                  />
                </div>
              </div>
            )}

            {/* PASSWORD INPUT */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-zinc-300 block flex items-center justify-between">
                <span>Confirm Account Password</span>
                <span className="text-[10px] text-zinc-500 font-normal">Required for security</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="Enter your account password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white"
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                Security confirmation is required to activate verified status for @{currentUser.username}.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Final Authorize Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#00FF66] hover:bg-[#00e65c] text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#00FF66]/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authorizing Verification...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authorize &amp; Complete Verification</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
