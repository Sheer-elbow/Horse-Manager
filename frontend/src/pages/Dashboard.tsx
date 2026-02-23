import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Horse, User } from '../types';

export default function Dashboard() {
  const { user } = useAuth();
  const [horses, setHorses] = useState<Horse[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const h = await api<Horse[]>('/horses');
        setHorses(h);
        if (user?.role === 'ADMIN') {
          const u = await api<User[]>('/users');
          setUsers(u);
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-6">
          <div className="text-3xl font-bold text-brand-600">{horses.length}</div>
          <div className="text-sm text-gray-500 mt-1">Horses</div>
          <Link to="/horses" className="text-sm text-brand-600 hover:underline mt-2 inline-block">View all</Link>
        </div>
        {user?.role === 'ADMIN' && (
          <div className="bg-white rounded-xl border p-6">
            <div className="text-3xl font-bold text-brand-600">{users.length}</div>
            <div className="text-sm text-gray-500 mt-1">Users</div>
            <Link to="/admin/users" className="text-sm text-brand-600 hover:underline mt-2 inline-block">Manage</Link>
          </div>
        )}
        <div className="bg-white rounded-xl border p-6">
          <div className="text-3xl font-bold text-brand-600">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
          <div className="text-sm text-gray-500 mt-1">Today</div>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-3">Your horses</h3>
      {horses.length === 0 ? (
        <p className="text-gray-500">No horses yet. {user?.role === 'ADMIN' && <Link to="/horses" className="text-brand-600 hover:underline">Add one</Link>}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {horses.map((h) => (
            <Link key={h.id} to={`/horses/${h.id}`} className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow flex items-center gap-4">
              {h.photoUrl ? (
                <img src={h.photoUrl} alt={h.name} className="w-14 h-14 rounded-lg object-cover border shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-gray-100 border flex items-center justify-center text-gray-300 text-xl shrink-0">&#x1f40e;</div>
              )}
              <div>
                <div className="font-semibold text-gray-900">{h.name}</div>
                {h.breed && <div className="text-sm text-gray-500">{h.breed}</div>}
                {h.stableLocation && <div className="text-sm text-gray-400 mt-1">{h.stableLocation}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
