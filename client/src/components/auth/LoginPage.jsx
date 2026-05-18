import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import { getCurrentUser, getToken, isTokenExpired, saveAuth } from '../../services/authService.js';

const ROLE_ROUTE_MAP = {
  SUPER_USER: '/super',
  SUPER_ADMIN: '/super',
  ENGINEER: '/engineer',
  MANAGER: '/engineer',
  JUNIOR_ENGINEER: '/junior-engineer',
  EMPLOYEE: '/junior-engineer',
  INTERN: '/intern',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {

    const token = getToken();
    const user = getCurrentUser();
    if (token && user && !isTokenExpired(token)) {
      const path = ROLE_ROUTE_MAP[user.role] || '/';
      navigate(path, { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { employeeId, password });
      const { token, user } = res.data;
      saveAuth(token, user);
      const path = ROLE_ROUTE_MAP[user.role] || '/';
      navigate(path, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#ECF1FF] text-[#002045] font-display antialiased min-h-screen flex flex-col relative overflow-x-hidden">
      {/* Animated Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] rounded-full bg-primary/20 blur-[100px] animate-pulse" style={{ animationDuration: '4s' }}></div>
        <div className="absolute top-[20%] right-[-10%] w-[35vw] h-[35vw] rounded-full bg-purple-600/10 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] left-[20%] w-[45vw] h-[45vw] rounded-full bg-teal-600/10 blur-[100px]"></div>
      </div>

      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 md:px-10 lg:px-20 w-full max-w-[1440px] mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-lg bg-[#002045]/10 text-[#002045] ring-1 ring-[#002045]/20">
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>hub</span>
          </div>
          <div className="flex flex-col">
            <h2 className="text-[#002045] text-lg font-bold leading-tight tracking-tight">IPMS</h2>
            <span className="text-xs text-[#002045]/60 font-medium tracking-wide">INTERNAL SYSTEM</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-grow flex items-center justify-center p-4">
        <div className="flex items-center justify-center w-full">
          {/* Centered Login Form */}
          <div className="w-full max-w-[480px] bg-white rounded-2xl p-8 shadow-[0_20px_50px_rgba(0,32,69,0.1)] border border-[#002045]/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#002045]"></div>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2 mb-2">
                <h1 className="text-[#002045] text-3xl font-black leading-tight tracking-tight">Welcome Back</h1>
                <p className="text-[#002045]/60 text-base font-normal">Please sign in to your IPMS account</p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <div className="flex flex-col gap-2">
                  <label className="text-[#002045] text-sm font-semibold tracking-wide flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>id_card</span>
                    Employee ID
                  </label>
                  <input
                    className="form-input w-full rounded-lg border border-[#002045]/10 bg-[#f8fafc] focus:bg-white h-12 px-4 text-[#002045] placeholder:text-[#002045]/30 text-base focus:border-[#002045] focus:ring-1 focus:ring-[#002045] transition-all outline-none"
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[#002045] text-sm font-semibold tracking-wide flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>lock</span>
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      className="form-input w-full rounded-lg border border-[#002045]/10 bg-[#f8fafc] focus:bg-white h-12 px-4 pr-12 text-[#002045] placeholder:text-[#002045]/30 text-base focus:border-[#002045] focus:ring-1 focus:ring-[#002045] transition-all outline-none"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center px-4 text-[#002045]/40 hover:text-[#002045] cursor-pointer transition-colors focus:outline-none"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                        {showPassword ? 'visibility' : 'visibility_off'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input
                        className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-[#002045]/20 bg-white checked:border-[#002045] checked:bg-[#002045] transition-all"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span className="material-symbols-outlined absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] text-white opacity-0 peer-checked:opacity-100 pointer-events-none">check</span>
                    </div>
                    <span className="text-sm text-[#002045]/60 group-hover:text-[#002045] transition-colors">Remember me</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 h-12 rounded-lg bg-[#002045] hover:bg-[#001a38] text-white font-bold text-base tracking-wide shadow-lg shadow-[#002045]/20 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                >
                  <span>{loading ? 'Signing in...' : 'Sign In to Dashboard'}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>login</span>
                </button>
              </form>


              <div className="mt-8 pt-6 border-t border-[#002045]/5 flex items-center justify-between text-xs text-[#002045]/40">

              </div>
            </div>
          </div>
        </div >
      </main >
    </div >
  );
}
