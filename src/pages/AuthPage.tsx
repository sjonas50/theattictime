import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const AuthPage = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [isProcessingAuthLink, setIsProcessingAuthLink] = useState(true);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let isMounted = true;

    const process = async () => {
      const linkError = searchParams.get('error_code') || searchParams.get('error');
      if (linkError) {
        toast.error('That link is invalid or expired. Please request a new code below.');
        window.history.replaceState({}, document.title, '/auth');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate('/');
      }
      if (isMounted) setIsProcessingAuthLink(false);
    };

    process();
    return () => { isMounted = false; };
  }, [searchParams, navigate]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (normalized.split('@')[1] !== 'theattic.ai') {
      toast.error('Sign in is restricted to @theattic.ai email addresses.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: false },
    });

    if (error) {
      console.error('signInWithOtp error:', error);
      toast.error(error.message || 'Failed to send code. Please try again.');
    } else {
      setEmail(normalized);
      setStep('code');
      toast.success('Code sent! Check your email for a 6-digit code.');
    }
    setLoading(false);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.trim();
    if (token.length < 6) {
      toast.error('Please enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) {
      console.error('verifyOtp error:', error);
      toast.error(error.message || 'Invalid or expired code. Please try again.');
    } else {
      toast.success('Signed in!');
      navigate('/');
    }
    setLoading(false);
  };

  if (isProcessingAuthLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-[400px] max-w-full">
          <CardHeader>
            <CardTitle>Loading…</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-[400px] max-w-full">
        <CardHeader>
          <CardTitle>{step === 'email' ? 'Sign In' : 'Enter your code'}</CardTitle>
          <CardDescription>
            {step === 'email'
              ? 'Enter your @theattic.ai email and we\'ll send you a 6-digit code.'
              : `We sent a 6-digit code to ${email}. Enter it below.`}
          </CardDescription>
        </CardHeader>

        {step === 'email' ? (
          <form onSubmit={handleSendCode}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@theattic.ai"
                  required
                  autoFocus
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending code…' : 'Send code'}
              </Button>
            </CardFooter>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                  autoFocus
                />
              </div>
              <div className="text-sm text-right">
                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); }}
                  className="font-medium text-primary hover:underline"
                  disabled={loading}
                >
                  Use a different email
                </button>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Verifying…' : 'Sign in'}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
};

export default AuthPage;
