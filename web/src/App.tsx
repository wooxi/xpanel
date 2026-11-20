import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  FileText,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
  Server,
  Settings,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  changePassword,
  getNodes,
  getOverview,
  getSession,
  getUsers,
  logout,
  setUnauthorizedHandler,
} from '@/api';
import { BrandLogo } from '@/components/BrandLogo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { LogsPage } from '@/pages/LogsPage';
import { NodesPage } from '@/pages/NodesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { UsersPage } from '@/pages/UsersPage';
import type { NodeItem, OverviewData, UserItem } from '@/types';

const NAV_ITEMS = [
  { key: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { key: 'nodes', label: '节点管理', icon: Server },
  { key: 'users', label: '用户管理', icon: Users },
  { key: 'logs', label: '运行日志', icon: FileText },
  { key: 'settings', label: '系统设置', icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  dashboard: '仪表盘',
  nodes: '节点管理',
  users: '用户管理',
  logs: '运行日志',
  settings: '系统设置',
};

export const App: React.FC = () => {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [adminUser, setAdminUser] = useState('admin');
  const [baseUrl, setBaseUrl] = useState('');

  const [activeKey, setActiveKey] = useState('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);
  const [settingsRefreshKey, setSettingsRefreshKey] = useState(0);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwCur, setPwCur] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const loadCoreData = useCallback(async () => {
    const [ov, nd, us] = await Promise.all([getOverview(), getNodes(), getUsers()]);
    setOverview(ov);
    setNodes(nd.nodes || []);
    setUsers(us.users || []);
  }, []);

  const refreshSession = useCallback(async () => {
    const s = await getSession();
    setAdminUser(s.user);
    setBaseUrl(s.base);
  }, []);

  const boot = useCallback(async () => {
    setBooting(true);
    try {
      await refreshSession();
      await loadCoreData();
      setAuthed(true);
    } catch {
      setAuthed(false);
    } finally {
      setBooting(false);
    }
  }, [loadCoreData, refreshSession]);

  useEffect(() => {
    document.title = authed ? 'xpanel · 控制台' : '控制台';
  }, [authed]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthed(false);
    });
    boot();
  }, [boot]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await loadCoreData();
      if (activeKey === 'logs') setLogsRefreshKey((k) => k + 1);
      if (activeKey === 'settings') setSettingsRefreshKey((k) => k + 1);
      toast.success('数据已刷新');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout().catch(() => {});
    setAuthed(false);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwCur) return toast.error('请输入当前密码');
    if (pwNext.length < 8) return toast.error('新密码至少 8 位字符');
    if (pwNext !== pwConfirm) return toast.error('两次输入的新密码不一致');
    setPwSaving(true);
    try {
      await changePassword(pwCur, pwNext);
      toast.success('密码已修改');
      setPwOpen(false);
      setPwCur('');
      setPwNext('');
      setPwConfirm('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改失败');
    } finally {
      setPwSaving(false);
    }
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onSuccess={boot} />;
  }

  const sidebarNav = (
    <div className="flex flex-col h-full bg-card">
      <div className="h-14 px-5 flex items-center gap-3 border-b shrink-0">
        <BrandLogo size={28} />
        <div className="leading-tight">
          <div className="font-semibold text-sm">xpanel</div>
          <div className="text-[11px] text-muted-foreground">NodeX 控制面板</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeKey === item.key;
          const count =
            item.key === 'nodes' ? nodes.length : item.key === 'users' ? users.length : null;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActiveKey(item.key);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {count != null && (
                <Badge
                  variant={active ? 'secondary' : 'outline'}
                  className="text-[11px] px-1.5 py-0"
                >
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t text-xs text-muted-foreground flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span>面板运行中</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* 桌面端左侧栏 */}
      <aside className="hidden lg:block w-60 shrink-0 border-r sticky top-0 h-screen">
        {sidebarNav}
      </aside>

      {/* 移动端抽屉栏 */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          {sidebarNav}
        </SheetContent>
      </Sheet>

      {/* 右侧主工作区（铺满可用宽度） */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b bg-card/95 backdrop-blur sticky top-0 z-20 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="打开菜单"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-semibold tracking-tight">
              {PAGE_TITLES[activeKey] || '控制台'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleManualRefresh}
              title="刷新数据"
              aria-label="刷新数据"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 px-2 gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback>{adminUser.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-medium">{adminUser}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setPwOpen(true)}>
                  <KeyRound className="h-4 w-4" />
                  修改密码
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 w-full p-4 sm:p-6">
          {activeKey === 'dashboard' && (
            <DashboardPage
              overview={overview}
              nodes={nodes}
              users={users}
              onNavigate={setActiveKey}
            />
          )}
          {activeKey === 'nodes' && (
            <NodesPage nodes={nodes} baseUrl={baseUrl} onRefresh={loadCoreData} />
          )}
          {activeKey === 'users' && (
            <UsersPage users={users} nodes={nodes} baseUrl={baseUrl} onRefresh={loadCoreData} />
          )}
          {activeKey === 'logs' && <LogsPage refreshKey={logsRefreshKey} />}
          {activeKey === 'settings' && (
            <SettingsPage
              baseUrl={baseUrl}
              nodes={nodes}
              users={users}
              refreshKey={settingsRefreshKey}
              onBaseRefresh={refreshSession}
            />
          )}
        </main>
      </div>

      {/* 修改密码弹窗 */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>修改管理员密码</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>当前密码</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={pwCur}
                onChange={(e) => setPwCur(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>新密码</Label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="至少 8 位字符"
                value={pwNext}
                onChange={(e) => setPwNext(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>确认新密码</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pwSaving}>
                {pwSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
