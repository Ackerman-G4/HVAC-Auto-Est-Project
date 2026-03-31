'use client';

import { useState, useEffect } from 'react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { showToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth/AuthContext';
import { 
  Save, RotateCcw, Thermometer, Building2, PhilippinePeso, Snowflake, 
  Plus, Trash2, UserPlus, Users, Mail, Calendar, ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState({
    defaultIndoorDB: 24,
    defaultIndoorRH: 50,
    defaultSafetyFactor: 1.1,
    defaultDiversityFactor: 1.0,
    defaultCeilingHeight: 2.7,
    defaultLightingDensity: 15,
    defaultEquipmentLoad: 500,
    laborMultiplier: 0.35,
    overheadPercent: 0.15,
    vatRate: 0.12,
    contingencyPercent: 0.05,
    defaultBudgetLevel: 'mid-range',
    temperatureUnit: 'celsius',
    areaUnit: 'sqm',
    lengthUnit: 'meters',
    currencySymbol: '₱',
    autoCalculate: true,
    autoSaveInterval: 30,
  });

  const [placementRules, setPlacementRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // User Management State
  const [registerForm, setRegisterForm] = useState({
    email: '',
    fullName: '',
    birthday: '',
    role: 'engineer' as 'admin' | 'engineer' | 'viewer',
  });
  const [registering, setRegisterLoading] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          setSettings((prev) => ({ ...prev, ...data.settings }));
          if (data.settings.placementRules) {
            setPlacementRules(data.settings.placementRules);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterLoading(true);
    try {
      const res = await fetch('/api/admin/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await (window as any).firebaseAuth?.currentUser?.getIdToken()}`
        },
        body: JSON.stringify(registerForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.description || 'Registration failed');

      showToast('success', `Account created for ${registerForm.fullName}`);
      setRegisterForm({ email: '', fullName: '', birthday: '', role: 'engineer' });
    } catch (error: any) {
      showToast('error', error.message);
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleSave = async () => {
    const payload = { ...settings, placementRules };
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('success', 'Settings saved');
    } catch {
      showToast('error', 'Failed to save settings');
    }
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Settings"
        description="Configure default values and system preferences"
      />

      <div className="flex flex-col gap-8">
        {/* Admin Section: User Management */}
        {isAdmin && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight">User Management</h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Account Creation Form */}
              <Card className="lg:col-span-2 border-blue-100 shadow-md shadow-blue-600/5">
                <CardHeader className="border-b border-slate-50 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-blue-600" />
                    <CardTitle className="text-base">Register New Workspace Account</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <form id="register-form" onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-4">
                      <Input
                        label="Full Name"
                        placeholder="John Doe"
                        required
                        value={registerForm.fullName}
                        onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
                      />
                      <Input
                        label="Work Email"
                        type="email"
                        placeholder="user@ave-venture.com"
                        required
                        value={registerForm.email}
                        onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      />
                      <Select
                        label="System Role"
                        value={registerForm.role}
                        onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value as any })}
                        options={[
                          { value: 'engineer', label: 'Engineer (Default)' },
                          { value: 'admin', label: 'Administrator' },
                          { value: 'viewer', label: 'Read-only Viewer' },
                        ]}
                      />
                    </div>
                    
                    <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 mb-2 text-slate-600">
                        <Calendar className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Birthday Password</span>
                      </div>
                      <Input
                        type="date"
                        required
                        value={registerForm.birthday}
                        onChange={(e) => setRegisterForm({ ...registerForm, birthday: e.target.value })}
                        hint="This will be the user's initial password (format: YYYYMMDD)."
                      />
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-800 leading-tight">
                          Ensure the email is a valid <strong>AVE Venture</strong> Workspace account. 
                          The user will log in with their email and the birthday specified here.
                        </p>
                      </div>
                    </div>
                  </form>
                </CardContent>
                <CardFooter className="bg-slate-50/50 border-t border-slate-50 flex justify-end">
                  <Button 
                    form="register-form"
                    type="submit" 
                    variant="accent" 
                    disabled={registering}
                    className="px-8"
                  >
                    {registering ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Creating...</span>
                      </div>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Create Account
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>

              {/* Status/Info Card */}
              <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white border-none shadow-lg shadow-blue-600/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" />
                    RBAC Policy
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-blue-50/80 leading-relaxed">
                    You are currently logged in as an <strong>Administrator</strong>. You have the authority to:
                  </p>
                  <ul className="text-xs space-y-2.5">
                    <li className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-300 mt-1.5" />
                      <span>Provision new engineering accounts</span>
                    </li>
                    <li className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-300 mt-1.5" />
                      <span>Assign system-wide roles and permissions</span>
                    </li>
                    <li className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-300 mt-1.5" />
                      <span>Update global material and supplier metadata</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        <div className="h-px bg-slate-200 w-full" />

        {/* Standard Settings Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Building2 className="w-5 h-5 text-slate-600" />
            <h2 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight">System Preferences</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Design Defaults */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-muted-foreground" />
                  <CardTitle>Design Defaults</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Indoor Dry Bulb (°C)"
                    type="number"
                    value={settings.defaultIndoorDB}
                    onChange={(e) => setSettings({ ...settings, defaultIndoorDB: parseFloat(e.target.value) })}
                  />
                  <Input
                    label="Indoor RH (%)"
                    type="number"
                    value={settings.defaultIndoorRH}
                    onChange={(e) => setSettings({ ...settings, defaultIndoorRH: parseInt(e.target.value) })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Safety Factor"
                    type="number"
                    step={0.05}
                    value={settings.defaultSafetyFactor}
                    onChange={(e) => setSettings({ ...settings, defaultSafetyFactor: parseFloat(e.target.value) })}
                  />
                  <Input
                    label="Diversity Factor"
                    type="number"
                    step={0.05}
                    value={settings.defaultDiversityFactor}
                    onChange={(e) => setSettings({ ...settings, defaultDiversityFactor: parseFloat(e.target.value) })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Cost Defaults */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PhilippinePeso className="w-4 h-4 text-muted-foreground" />
                  <CardTitle>Cost Defaults</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  label="Labor Multiplier"
                  type="number"
                  step={0.05}
                  value={settings.laborMultiplier}
                  onChange={(e) => setSettings({ ...settings, laborMultiplier: parseFloat(e.target.value) })}
                />
                <Input
                  label="VAT Rate"
                  type="number"
                  step={0.01}
                  value={settings.vatRate}
                  onChange={(e) => setSettings({ ...settings, vatRate: parseFloat(e.target.value) })}
                />
              </CardContent>
            </Card>
          </div>
          
          <div className="flex justify-end pt-4">
            <Button variant="accent" size="lg" onClick={handleSave} className="px-10">
              <Save className="w-4 h-4 mr-2" />
              Save System Preferences
            </Button>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
