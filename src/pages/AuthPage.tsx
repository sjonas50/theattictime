import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const AuthPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isProcessingAuthLink, setIsProcessingAuthLink] = useState(true);
  const [setupUserId, setSetupUserId] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let isMounted = true;

    const process = async () => {
      const url = new URL(window.location.href);
      const directSetupUser = searchParams.get('setup_user');
      const directSetupToken = searchParams.get('setup_token');

      if (directSetupUser && directSetupToken) {
        setSetupUserId(directSetupUser);
        setSetupToken(directSetupToken);
        setIsResettingPassword(true);
        window.history.replaceState({}, document.title, '/auth');
        toast.info('Please create your password below.');
        if (isMounted) setIsProcessingAuthLink(false);
        return;
      }

      const linkError = searchParams.get('error_code') || searchParams.get('error');
      if (linkError) {
        toast.error('This setup link is invalid or expired. Please ask an admin for a new setup link.');
        window.history.replaceState({}, document.title, '/auth');
        if (isMounted) setIsProcessingAuthLink(false);
        return;
      }

      // Detect invite/recovery redirects from Supabase (supports both PKCE code flow and hash tokens)
      const hasSetupFlag = searchParams.get('setup') === 'true' || searchParams.get('reset') === 'true';
      const typeParam = searchParams.get('type') || (url.hash.match(/type=([^&]+)/)?.[1] ?? null);
      const authCode = searchParams.get('code');
      const hasCode = !!authCode;
      const hasAccessToken = url.hash.includes('access_token');
      const isPasswordSetupLink = typeParam === 'recovery' || typeParam === 'invite';

      const shouldProcessPasswordSetup = hasSetupFlag || isPasswordSetupLink || hasCode || hasAccessToken;

      if (shouldProcessPasswordSetup) {
        setIsResettingPassword(true);
        try {
          if (authCode) {
            const { error } = await supabase.auth.exchangeCodeForSession(authCode);
            if (error) {
              console.error('exchangeCodeForSession error:', error);
            }
          }

          const { data: sessionData } = await supabase.auth.getSession();
          let session = sessionData.session;

          if (!session && hasAccessToken) {
            const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');

            if (accessToken && refreshToken) {
              const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

              if (error) {
                console.error('setSession error:', error);
              }
              session = data.session;
            }
          }

          if (!session) {
            toast.error('This setup link is invalid or expired. Please ask an admin to resend it.');
            setIsResettingPassword(false);
          } else {
            window.history.replaceState({}, document.title, '/auth');
            toast.info('Please create your password below.');
          }
        } catch (err) {
          console.error('Password setup processing error:', err);
          toast.error('Failed to process setup link. Please try again.');
          setIsResettingPassword(false);
        } finally {
          if (isMounted) setIsProcessingAuthLink(false);
        }
        return; // Skip normal redirect logic during password setup
      }

      // Check if user is already logged in and redirect them
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        console.log('User already logged in, redirecting to home');
        navigate('/');
      }
      if (isMounted) setIsProcessingAuthLink(false);
    };

    process();

    return () => {
      isMounted = false;
    };
  }, [searchParams, navigate]);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long.');
      return;
    }
    
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password created successfully. You can now sign in.');
      await supabase.auth.signOut();
      setIsResettingPassword(false);
      navigate('/auth');
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long.');
      return;
    }

    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain !== 'theattic.ai') {
      toast.error('Sign up is restricted to @theattic.ai email addresses only.');
      return;
    }

    setLoading(true);
    console.log('Attempting signup for:', email);
    
    try {
      const { data, error } = await supabase.functions.invoke('restricted-signup', {
        body: { email, password }
      });

      console.log('Signup response:', { data, error });

      if (error) {
        console.error('Supabase function error:', error);
        toast.error(error.message || 'Failed to create account. Please try again.');
      } else if (data?.error) {
        console.error('Function returned error:', data.error);
        toast.error(data.error);
      } else {
        toast.success('Account created successfully! You can now sign in.');
        // Clear the form and switch to sign in tab
        setEmail('');
        setPassword('');
      }
    } catch (error: unknown) {
      console.error('Signup error:', error);
      toast.error('An unexpected error occurred. Please try again.');
    }
    
    setLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Please fill in all fields.');
      return;
    }

    setLoading(true);
    console.log('Attempting sign in for:', email);
    
    const { error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });
    
    if (error) {
      console.error('Sign in error:', error);
      if (error.message.includes('Invalid login credentials')) {
        toast.error('Invalid email or password. Please check your credentials and try again.');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success('Sign in successful!');
      console.log('Sign in successful, navigating to home');
      navigate('/');
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (!email) {
      toast.error('Please enter your email address.');
      return;
    }

    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain !== 'theattic.ai') {
      toast.error('Password reset is only available for @theattic.ai email addresses.');
      return;
    }

    setForgotPasswordLoading(true);
    console.log('Sending password reset for:', email);
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?reset=true`
    });
    
    if (error) {
      console.error('Password reset error:', error);
      toast.error(error.message);
    } else {
      toast.success('If an account exists for this email, a password reset link has been sent. Please check your email.');
    }
    setForgotPasswordLoading(false);
  };

  if (isProcessingAuthLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-[400px] max-w-full">
          <CardHeader>
            <CardTitle>Checking secure link</CardTitle>
            <CardDescription>Please wait while we prepare your account setup.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show password setup form if user came from invite or reset link
  if (isResettingPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-[400px] max-w-full">
          <CardHeader>
            <CardTitle>Create Password</CardTitle>
            <CardDescription>Set your password to finish account setup.</CardDescription>
          </CardHeader>
          <form onSubmit={handlePasswordUpdate}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input 
                  id="new-password" 
                  type="password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="••••••••" 
                  required 
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input 
                  id="confirm-password" 
                  type="password" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  placeholder="••••••••" 
                  required 
                  minLength={6}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Saving Password...' : 'Save Password'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Tabs defaultValue="signin" className="w-[400px] max-w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign In</TabsTrigger>
          <TabsTrigger value="signup">Sign Up</TabsTrigger>
        </TabsList>
        <TabsContent value="signin">
          <Card>
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>Access your timesheets.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSignIn}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signin">Email</Label>
                  <Input id="email-signin" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="m@example.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signin">Password</Label>
                  <Input id="password-signin" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="text-sm text-right">
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    className="font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={forgotPasswordLoading || loading}
                  >
                    {forgotPasswordLoading ? 'Sending...' : 'Forgot password?'}
                  </button>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={loading || forgotPasswordLoading}>
                  {loading ? 'Signing In...' : 'Sign In'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
        <TabsContent value="signup">
          <Card>
            <CardHeader>
              <CardTitle>Sign Up</CardTitle>
              <CardDescription>Create a new account.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSignUp}>
              <CardContent className="space-y-4">
                 <div className="space-y-2">
                   <Label htmlFor="email-signup">Email (must be @theattic.ai)</Label>
                   <Input id="email-signup" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@theattic.ai" required />
                 </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signup">Password</Label>
                  <Input id="password-signup" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing Up...' : 'Sign Up'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuthPage;