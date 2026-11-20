import React, { useMemo, useState } from 'react';
import {
  Info,
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import {
  createUser,
  deleteUser,
  resetUserSub,
  resetUserTraffic,
  resetUserUuid,
  updateUser,
} from '@/api';
import { CopyButton } from '@/components/CopyButton';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { NodeItem, UserItem } from '@/types';
import {
  daysLeft,
  fmtBytes,
  fmtRemain,
  getUserAllowedNodes,
  getUserStatus,
} from '@/utils';

interface UsersPageProps {
  users: UserItem[];
  nodes: NodeItem[];
  baseUrl: string;
  onRefresh: () => Promise<void>;
}

interface UserFormState {
  name: string;
  banned: string;
  expires_date: string;
  traffic_limit_gb: string;
  speed_limit: string;
  device_limit: string;
  node_ids: number[];
}

const DEFAULT_USER_FORM: UserFormState = {
  name: '',
  banned: '0',
  expires_date: '',
  traffic_limit_gb: '',
  speed_limit: '0',
  device_limit: '0',
  node_ids: [],
};

function statusBadgeVariant(st: { color: string }): 'success' | 'warning' | 'destructive' {
  if (st.color === 'success') return 'success';
  if (st.color === 'warning') return 'warning';
  return 'destructive';
}

export const UsersPage: React.FC<UsersPageProps> = ({ users, nodes, baseUrl, onRefresh }) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'abnormal'>('all');

  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [form, setForm] = useState<UserFormState>(DEFAULT_USER_FORM);
  const [saving, setSaving] = useState(false);

  const [subUser, setSubUser] = useState<UserItem | null>(null);
  const [subBusy, setSubBusy] = useState(false);

  const enabledNodes = useMemo(() => nodes.filter((n) => n.enabled), [nodes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      const st = getUserStatus(u);
      if (filter === 'active' && !st.isNormal) return false;
      if (filter === 'abnormal' && st.isNormal) return false;
      if (!q) return true;
      return (
        String(u.name || '').toLowerCase().includes(q) ||
        String(u.uuid || '').toLowerCase().includes(q)
      );
    });
  }, [users, query, filter]);

  const openEdit = (user: UserItem | null) => {
    setEditingUser(user);
    if (user) {
      setForm({
        name: user.name,
        banned: user.banned ? '1' : '0',
        expires_date: user.expires_date || '',
        traffic_limit_gb: user.traffic_limit_gb == null ? '' : String(user.traffic_limit_gb),
        speed_limit: String(user.speed_limit || 0),
        device_limit: String(user.device_limit || 0),
        node_ids: user.node_ids || [],
      });
    } else {
      setForm(DEFAULT_USER_FORM);
    }
    setEditOpen(true);
  };

  const toggleNodeId = (nid: number) => {
    setForm((prev) => {
      const exists = prev.node_ids.includes(nid);
      return {
        ...prev,
        node_ids: exists ? prev.node_ids.filter((id) => id !== nid) : [...prev.node_ids, nid],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('请填写备注名');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        expires_date: form.expires_date,
        traffic_limit_gb: form.traffic_limit_gb === '' ? null : Number(form.traffic_limit_gb),
        speed_limit: Number(form.speed_limit) || 0,
        device_limit: Number(form.device_limit) || 0,
        banned: form.banned === '1',
        node_ids: form.node_ids,
      };
      if (editingUser) {
        await updateUser(editingUser.id, payload);
        toast.success('用户已更新');
      } else {
        await createUser(payload);
        toast.success('用户已创建');
      }
      setEditOpen(false);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: UserItem) => {
    try {
      await deleteUser(user.id);
      toast.success('用户已删除');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleResetTraffic = async () => {
    if (!subUser) return;
    setSubBusy(true);
    try {
      await resetUserTraffic(subUser.id);
      setSubUser({ ...subUser, used: 0, used_gb: 0, over_limit: false });
      toast.success('已用流量已清零');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重置失败');
    } finally {
      setSubBusy(false);
    }
  };

  const handleResetSub = async () => {
    if (!subUser) return;
    setSubBusy(true);
    try {
      const updated = await resetUserSub(subUser.id);
      setSubUser(updated);
      toast.success('订阅令牌已更换');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更换失败');
    } finally {
      setSubBusy(false);
    }
  };

  const handleResetUuid = async () => {
    if (!subUser) return;
    setSubBusy(true);
    try {
      const updated = await resetUserUuid(subUser.id);
      setSubUser(updated);
      toast.success('连接 UUID 已重置');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重置失败');
    } finally {
      setSubBusy(false);
    }
  };

  const cleanBase = baseUrl.replace(/\/$/, '');
  const subUrl = subUser ? subUser.sub_url || `${cleanBase}/sub/${subUser.sub_token}` : '';
  const allowedNodes = subUser ? getUserAllowedNodes(subUser, nodes) : [];

  return (
    <div className="space-y-5">
      {/* 搜索与筛选栏 */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户名或 UUID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'active' | 'abnormal')}>
              <TabsList>
                <TabsTrigger value="all">全部 ({users.length})</TabsTrigger>
                <TabsTrigger value="active">正常</TabsTrigger>
                <TabsTrigger value="abnormal">异常</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Button onClick={() => openEdit(null)} className="w-full md:w-auto">
            <Plus className="h-4 w-4" />
            添加用户
          </Button>
        </CardContent>
      </Card>

      {/* 空状态 */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              {users.length === 0 ? '还没有用户' : '没有匹配的用户'}
            </p>
            {users.length === 0 && (
              <Button onClick={() => openEdit(null)}>
                <Plus className="h-4 w-4" />
                立即添加
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 桌面端 / 平板端表格 */}
          <Card className="hidden md:block overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>流量使用</TableHead>
                  <TableHead>到期时间</TableHead>
                  <TableHead>限制策略</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const hasLimit = u.traffic_limit != null && u.traffic_limit > 0;
                  const pct = hasLimit
                    ? Math.min(100, Math.round((u.used / (u.traffic_limit as number)) * 100))
                    : 0;
                  const indicatorCls =
                    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-zinc-900';
                  const st = getUserStatus(u);
                  const dl = daysLeft(u.expires_date);

                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {(u.name || '?').slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{u.name || '未命名'}</div>
                            <div className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                              {u.uuid}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[190px]">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span>{fmtBytes(u.used)}</span>
                            <span className="text-muted-foreground">
                              {u.traffic_limit != null ? fmtBytes(u.traffic_limit) : '不限量'}
                            </span>
                          </div>
                          {hasLimit && <Progress value={pct} indicatorClassName={indicatorCls} />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{u.expires_date || '不限期'}</div>
                        {u.expires_date && (
                          <div className="text-xs text-muted-foreground">{fmtRemain(dl)}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {u.speed_limit ? `${u.speed_limit} Mbps` : '不限速'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {u.device_limit ? `${u.device_limit} 台设备` : '不限设备'}
                          {u.node_ids?.length ? ` · 限 ${u.node_ids.length} 节点` : ''}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(st)}>{st.text}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setSubUser(u)}>
                            <Link2 className="h-3.5 w-3.5" />
                            订阅
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                            <Pencil className="h-3.5 w-3.5" />
                            编辑
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                删除
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>删除用户「{u.name}」</AlertDialogTitle>
                                <AlertDialogDescription>
                                  删除后其订阅链接会立即失效，已连接的客户端也无法再拉取配置。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction destructive onClick={() => handleDelete(u)}>
                                  确认删除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* 移动端卡片视图 */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filtered.map((u) => {
              const hasLimit = u.traffic_limit != null && u.traffic_limit > 0;
              const pct = hasLimit
                ? Math.min(100, Math.round((u.used / (u.traffic_limit as number)) * 100))
                : 0;
              const indicatorCls =
                pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-zinc-900';
              const st = getUserStatus(u);

              return (
                <Card key={u.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {(u.name || '?').slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{u.name || '未命名'}</div>
                          <div className="text-[11px] font-mono text-muted-foreground truncate">
                            {u.uuid}
                          </div>
                        </div>
                      </div>
                      <Badge variant={statusBadgeVariant(st)} className="shrink-0">
                        {st.text}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>已用 {fmtBytes(u.used)}</span>
                        <span className="text-muted-foreground">
                          {u.traffic_limit != null ? `上限 ${fmtBytes(u.traffic_limit)}` : '不限量'}
                        </span>
                      </div>
                      {hasLimit && <Progress value={pct} indicatorClassName={indicatorCls} />}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                      <span>到期：{u.expires_date || '不限期'}</span>
                      <span>
                        {u.speed_limit ? `${u.speed_limit} Mbps` : '不限速'} ·{' '}
                        {u.device_limit ? `${u.device_limit} 台` : '不限设备'}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-1 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setSubUser(u)}>
                        <Link2 className="h-3.5 w-3.5" />
                        订阅
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除用户「{u.name}」</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后其订阅链接将立即失效。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction destructive onClick={() => handleDelete(u)}>
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* 添加 / 编辑用户弹窗 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUser ? `编辑用户 · ${editingUser.name}` : '添加用户'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>备注名</Label>
                <Input
                  placeholder="朋友 A"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>账号状态</Label>
                <Select
                  value={form.banned}
                  onValueChange={(v) => setForm((p) => ({ ...p, banned: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">正常</SelectItem>
                    <SelectItem value="1">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>到期日期</Label>
                <Input
                  type="date"
                  value={form.expires_date}
                  onChange={(e) => setForm((p) => ({ ...p, expires_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>流量额度 (GB)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  placeholder="留空不限"
                  value={form.traffic_limit_gb}
                  onChange={(e) => setForm((p) => ({ ...p, traffic_limit_gb: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>限速 (Mbps)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.speed_limit}
                  onChange={(e) => setForm((p) => ({ ...p, speed_limit: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>设备数限制</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.device_limit}
                  onChange={(e) => setForm((p) => ({ ...p, device_limit: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>可用节点</Label>
                <span className="text-xs text-muted-foreground">
                  {form.node_ids.length
                    ? `仅限已选 ${form.node_ids.length} 个节点`
                    : '未勾选时可用全部节点'}
                </span>
              </div>
              {enabledNodes.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground text-center">
                  当前暂无启用中的节点
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border p-3 max-h-44 overflow-y-auto">
                  {enabledNodes.map((n) => (
                    <label
                      key={n.id}
                      className="flex items-center gap-2 text-sm cursor-pointer select-none"
                    >
                      <Checkbox
                        checked={form.node_ids.includes(n.id)}
                        onCheckedChange={() => toggleNodeId(n.id)}
                      />
                      <span className="truncate">{n.name}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
                        {n.protocol === 'vless' ? 'VLESS' : 'HY2'}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingUser ? '保存修改' : '创建用户'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 订阅管理弹窗 */}
      <Dialog open={!!subUser} onOpenChange={(o) => !o && setSubUser(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{subUser ? `订阅管理 · ${subUser.name}` : ''}</DialogTitle>
          </DialogHeader>
          {subUser && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>自动识别订阅</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={subUrl} className="font-mono text-xs" />
                    <CopyButton text={subUrl} label="复制" />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm">
                          <QrCode className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="flex flex-col items-center gap-2">
                        <QRCodeSVG value={subUrl} size={160} />
                        <span className="text-xs text-muted-foreground">扫码导入订阅</span>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Clash 专用</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={`${subUrl}?flag=clash`} className="font-mono text-xs" />
                    <CopyButton text={`${subUrl}?flag=clash`} label="复制" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>连接 UUID</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={subUser.uuid} className="font-mono text-xs" />
                    <CopyButton text={subUser.uuid} label="复制" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>单节点直连链接（共 {allowedNodes.length} 个可用节点）</Label>
                <div className="rounded-md border divide-y max-h-44 overflow-y-auto">
                  {allowedNodes.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">暂无可用节点</div>
                  ) : (
                    allowedNodes.map((n) => {
                      const link = `${cleanBase}/link/${subUser.sub_token}/${n.id}`;
                      return (
                        <div key={n.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium">{n.name}</div>
                            <div className="text-[11px] font-mono text-muted-foreground truncate">
                              {link}
                            </div>
                          </div>
                          <CopyButton text={link} variant="ghost" />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={subBusy}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      重置已用流量
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>重置已用流量</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定将「{subUser.name}」的已用流量清零吗？
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={handleResetTraffic}>确认重置</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={subBusy}
                      className="text-destructive hover:text-destructive"
                    >
                      更换订阅令牌
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>更换订阅令牌</AlertDialogTitle>
                      <AlertDialogDescription>
                        旧订阅链接将立即失效，需要重新分发给用户。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction destructive onClick={handleResetSub}>
                        确认更换
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={subBusy}
                      className="text-destructive hover:text-destructive"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      重置 UUID
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>重置连接 UUID</AlertDialogTitle>
                      <AlertDialogDescription>
                        旧 UUID 将立即失效，需提醒用户更新客户端配置。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction destructive onClick={handleResetUuid}>
                        确认重置
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <Alert>
                <Info />
                <span className="text-xs">
                  更换令牌后旧链接立即失效；重置流量不会影响用户的到期时间。
                </span>
              </Alert>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
