import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export function PasswordSettings() {
  const [step, setStep] = useState<'idle' | 'verify'>('idle');
  const [nonce, setNonce] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    setLoading(true);
    const { error } = await supabase.auth.reauthenticate();
    if (error) {
      toast.error(error.message || 'Could not send verification code.');
    } else {
      toast.success('We sent a 6-digit code to your email.');
      setStep('verify');
    }
    setLoading(false);
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    if (nonce.trim().length < 6) {
      toast.error('Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password, nonce: nonce.trim() });
    if (error) {
      toast.error(error.message || 'Could not update password.');
    } else {
      toast.success('Password updated!');
      setStep('idle');
      setNonce(''); setPassword(''); setConfirm('');
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Set or change your password. We'll email you a 6-digit code to confirm — no old password needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'idle' ? (
          <Button onClick={sendCode} disabled={loading}>
            {loading ? 'Sending…' : 'Send verification code'}
          </Button>
        ) : (
          <form onSubmit={updatePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nonce">6-digit code</Label>
              <Input id="nonce" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={nonce} onChange={(e) => setNonce(e.target.value.replace(/\D/g, ''))}
                placeholder="123456" required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type="password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Updating…' : 'Update password'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setStep('idle'); setNonce(''); setPassword(''); setConfirm(''); }} disabled={loading}>
                Cancel
              </Button>
              <Button type="button" variant="link" onClick={sendCode} disabled={loading}>
                Resend code
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
