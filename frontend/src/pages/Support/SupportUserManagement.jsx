import { useEffect, useMemo, useState } from 'react';
import {
  listSupportUsers,
  createSupportUser,
  updateSupportUser,
  deleteSupportUser,
  getSeatAllocation,
  updateSeatAllocation,
} from '../../services/supportUserService';
import { useAuth } from '../../hooks/useAuth';

function SupportUserManagement() {
  const { user } = useAuth();
  const [supportUsers, setSupportUsers] = useState([]);
  const [seatAllocation, setSeatAllocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newUser, setNewUser] = useState({ name: '', email: '', phone: '', password: '' });
  const [quotaDraft, setQuotaDraft] = useState({ totalSeats: '', maxMonitoringSeats: '' });
  const [adminOverride, setAdminOverride] = useState('');

  const isSuperAdmin = useMemo(() => user?.role === 'super_admin', [user]);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const adminId = isSuperAdmin && adminOverride ? adminOverride : undefined;
        const [users, allocation] = await Promise.all([
          listSupportUsers(adminId),
          getSeatAllocation(adminId),
        ]);
        setSupportUsers(users);
        setSeatAllocation(allocation);
        setQuotaDraft({
          totalSeats: allocation?.totalSeats ?? '',
          maxMonitoringSeats: allocation?.maxMonitoringSeats ?? '',
        });
        setError('');
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Failed to load support users');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [isSuperAdmin, adminOverride]);

  const handleCreate = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...newUser };
      if (isSuperAdmin && adminOverride) {
        payload.adminId = adminOverride;
      }
      const created = await createSupportUser(payload);
      setSupportUsers((prev) => [...prev, created]);
      setNewUser({ name: '', email: '', phone: '', password: '' });
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to create support user');
    }
  };

  const handleStatusToggle = async (userId, currentStatus) => {
    try {
      const payload = { status: currentStatus === 'active' ? 'suspended' : 'active' };
      if (isSuperAdmin && adminOverride) {
        payload.adminId = adminOverride;
      }
      const updated = await updateSupportUser(userId, payload);
      setSupportUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to update support user');
    }
  };

  const handleDelete = async (userId) => {
    try {
      const params = isSuperAdmin && adminOverride ? { adminId: adminOverride } : undefined;
      await deleteSupportUser(userId, params);
      setSupportUsers((prev) => prev.filter((u) => u.id !== userId));
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to delete support user');
    }
  };

  const handleQuotaSave = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin) return;

    try {
      const payload = {
        adminId: adminOverride,
        totalSeats: Number(quotaDraft.totalSeats),
        maxMonitoringSeats: Number(quotaDraft.maxMonitoringSeats),
      };
      const updated = await updateSeatAllocation(payload);
      setSeatAllocation(updated);
      setQuotaDraft({
        totalSeats: updated.totalSeats,
        maxMonitoringSeats: updated.maxMonitoringSeats,
      });
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to update seat allocation');
    }
  };

  if (loading) {
    return <div className="p-6">Loading support users…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Support Seat Management</h1>
        <p className="text-sm text-gray-600">
          Invite support agents, manage seat limits, and control monitoring access.
        </p>
      </header>

      {isSuperAdmin && (
        <div className="bg-white shadow rounded p-4 space-y-3">
          <h2 className="text-lg font-medium">Super Admin Controls</h2>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Target Admin ID</span>
            <input
              value={adminOverride}
              onChange={(event) => setAdminOverride(event.target.value)}
              placeholder="Enter tenant admin UUID"
              className="border rounded px-3 py-2"
            />
          </label>

          <form className="flex gap-3 items-end" onSubmit={handleQuotaSave}>
            <label className="flex flex-col">
              <span className="text-sm text-gray-600">Total Seats</span>
              <input
                type="number"
                value={quotaDraft.totalSeats}
                onChange={(event) => setQuotaDraft((prev) => ({ ...prev, totalSeats: event.target.value }))}
                className="border rounded px-3 py-2"
                min={0}
              />
            </label>
            <label className="flex flex-col">
              <span className="text-sm text-gray-600">Monitoring Seats</span>
              <input
                type="number"
                value={quotaDraft.maxMonitoringSeats}
                onChange={(event) => setQuotaDraft((prev) => ({ ...prev, maxMonitoringSeats: event.target.value }))}
                className="border rounded px-3 py-2"
                min={0}
              />
            </label>
            <button
              type="submit"
              className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
              disabled={!adminOverride}
            >
              Update Allocation
            </button>
          </form>
        </div>
      )}

      {error && <div className="bg-red-100 text-red-700 px-4 py-2 rounded">{error}</div>}

      <section className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <article className="bg-white shadow rounded p-4 space-y-4">
          <h2 className="text-lg font-medium">Invite Support Agent</h2>
          <form className="space-y-3" onSubmit={handleCreate}>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-600">Name</span>
              <input
                value={newUser.name}
                onChange={(event) => setNewUser((prev) => ({ ...prev, name: event.target.value }))}
                className="border rounded px-3 py-2"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-600">Email</span>
              <input
                type="email"
                value={newUser.email}
                onChange={(event) => setNewUser((prev) => ({ ...prev, email: event.target.value }))}
                className="border rounded px-3 py-2"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-600">Phone</span>
              <input
                value={newUser.phone}
                onChange={(event) => setNewUser((prev) => ({ ...prev, phone: event.target.value }))}
                className="border rounded px-3 py-2"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-600">Temporary Password</span>
              <input
                type="password"
                value={newUser.password}
                onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))}
                className="border rounded px-3 py-2"
                required
                minLength={8}
              />
            </label>

            <button type="submit" className="bg-green-600 text-white rounded px-4 py-2">
              Invite Agent
            </button>
          </form>
        </article>

        <article className="bg-white shadow rounded p-4 space-y-3">
          <h2 className="text-lg font-medium">Seat Allocation</h2>
          {seatAllocation ? (
            <ul className="space-y-2 text-sm">
              <li>Total Seats: {seatAllocation.totalSeats}</li>
              <li>Used Seats: {seatAllocation.usedSeats}</li>
              <li>Monitoring Seats: {seatAllocation.maxMonitoringSeats}</li>
            </ul>
          ) : (
            <p className="text-sm text-gray-600">No allocation found. Super admins can assign seats.</p>
          )}
        </article>
      </section>

      <section className="bg-white shadow rounded">
        <header className="flex justify-between items-center px-4 py-3 border-b">
          <h2 className="text-lg font-medium">Support Users</h2>
          <span className="text-sm text-gray-600">{supportUsers.length} total</span>
        </header>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Seat</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Monitoring</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {supportUsers.map((supportUser) => (
              <tr key={supportUser.id} className="border-t">
                <td className="px-4 py-2">{supportUser.name}</td>
                <td className="px-4 py-2">{supportUser.email}</td>
                <td className="px-4 py-2">{supportUser.seatNumber ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={supportUser.status === 'active' ? 'text-green-700' : 'text-yellow-700'}>
                    {supportUser.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {supportUser.monitoringAccess ? 'Enabled' : 'Not enabled'}
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <button
                    onClick={() => handleStatusToggle(supportUser.id, supportUser.status)}
                    className="text-blue-600 hover:underline"
                  >
                    {supportUser.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(supportUser.id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {supportUsers.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-gray-500" colSpan={6}>
                  No support users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default SupportUserManagement;

