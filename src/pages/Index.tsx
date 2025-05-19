
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const Index = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      {user && (
        <Card>
          <CardHeader>
            <CardTitle>Welcome, {user.email}!</CardTitle>
            <CardDescription>This is your TimeTrack dashboard. More features coming soon!</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Your user ID: {user.id}</p>
            <p className="mt-4">From here, you will be able to manage your time entries, view reports, and more.</p>
          </CardContent>
        </Card>
      )}
      {!user && (
         <p>Loading user information or you are not logged in.</p>
      )}
    </div>
  );
};

export default Index;
