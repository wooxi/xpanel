import React, { useState } from 'react';
import {
  AlertTriangle,
  Info,
  Loader2,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { createNode, deleteNode, resetNodeToken, updateNode } from '@/api';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { NodeItem } from '@/types';
import { getNodeProtoLabel, isPrivateBaseUrl, relTime } from '@/utils';

interface NodesPageProps {
  nodes: NodeItem[];
  baseUrl: string;
  onRefresh: () => Promise<void>;
}

interface NodeFormState {
  name: string;
  protocol: string;
  enabled: string;
  host: string;
  port: string;
  sort: string;
  sni: string;
  insecure: string;
  up_mbps: string;
  down_mbps: string;
  obfs: string;
  obfs_password: string;
  port_hopping: string;
  network: string;
  tls_mode: string;
  flow: string;
  ws_path: string;
  ws_host: string;
  cert_path: string;
  key_path: string;
  reality_dest: string;
  reality_server_names: string;
  reality_short_ids: string;
  reality_private_key: string;
  reality_public_key: string;
}

const DEFAULT_FORM: NodeFormState = {
  name: '',
  protocol: 'hysteria2',
  enabled: '1',
  host: '',
  port: '443',
  sort: '0',
  sni: '',
  insecure: '0',
  up_mbps: '0',
  down_mbps: '0',
  obfs: '',
  obfs_password: '',
  port_hopping: '',
  network: 'tcp',
  tls_mode: '2',
  flow: '',
  ws_path: '/',
  ws_host: '',
  cert_path: '',
  key_path: '',
  reality_dest: '',
  reality_server_names: '',
  reality_short_ids: '',
  reality_private_key: '',
  reality_public_key: '',
};

export const NodesPage: React.FC<NodesPageProps> = ({ nodes, baseUrl, onRefresh }) => {
  const [editOpen, setEditOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<NodeItem | null>(null);
  const [form, setForm] = useState<NodeFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const [connectNode, setConnectNode] = useState<NodeItem | null>(null);
  const [resettingToken, setResettingToken] = useState(false);

  const total = nodes.length;
  const onlineCount = nodes.filter((n) => n.enabled && n.online).length;
  const pendingCount = nodes.filter((n) => n.enabled && !n.online).length;
  const disabledCount = nodes.filter((n) => !n.enabled).length;

  const openEdit = (node: NodeItem | null) => {
    setEditingNode(node);
    if (node) {
      setForm({
        name: node.name,
        protocol: (node.protocol || 'hysteria2').toLowerCase(),
        enabled: node.enabled ? '1' : '0',
        host: node.host,
        port: String(node.port || 443),
        sort: String(node.sort || 0),
        sni: node.sni || '',
        insecure: node.insecure ? '1' : '0',
        up_mbps: String(node.up_mbps || 0),
        down_mbps: String(node.down_mbps || 0),
        obfs: node.obfs ? 'salamander' : '',
        obfs_password: node.obfs_password || '',
        port_hopping: node.port_hopping || '',
        network: node.network === 'ws' ? 'ws' : 'tcp',
        tls_mode: String(node.tls_mode ?? 2),
        flow: node.flow || '',
        ws_path: node.ws_path || '/',
        ws_host: node.ws_host || '',
        cert_path: node.cert_path || '',
        key_path: node.key_path || '',
        reality_dest: node.reality_dest || '',
        reality_server_names: node.reality_server_names || '',
        reality_short_ids: node.reality_short_ids || '',
        reality_private_key: node.reality_private_key || '',
        reality_public_key: node.reality_public_key || '',
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setEditOpen(true);
  };

  const setField = <K extends keyof NodeFormState>(k: K, v: NodeFormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [k]: v };
      if (next.protocol === 'vless' && next.network === 'ws' && next.tls_mode === '2') {
        next.tls_mode = '1';
        toast.warning('WebSocket 模式下 Reality 不可用，已自动切换为 TLS');
      }
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim()) {
      toast.error('节点名称与服务器地址不能为空');
      return;
    }
    setSaving(true);
    try {
      const isVless = form.protocol === 'vless';
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port) || 443,
        sni: form.sni.trim(),
        insecure: form.insecure === '1',
        enabled: form.enabled === '1',
        protocol: form.protocol,
        sort: Number(form.sort) || 0,
      };
      if (isVless) {
        Object.assign(payload, {
          network: form.network,
          tls_mode: Number(form.tls_mode),
          flow: form.flow.trim(),
          ws_path: form.ws_path.trim() || '/',
          ws_host: form.ws_host.trim(),
          cert_path: form.cert_path.trim(),
          key_path: form.key_path.trim(),
          reality_dest: form.reality_dest.trim(),
          reality_server_names: form.reality_server_names.trim(),
          reality_private_key: form.reality_private_key.trim(),
          reality_public_key: form.reality_public_key.trim(),
          reality_short_ids: form.reality_short_ids.trim(),
          up_mbps: 0,
          down_mbps: 0,
        });
      } else {
        Object.assign(payload, {
          up_mbps: Number(form.up_mbps) || 0,
          down_mbps: Number(form.down_mbps) || 0,
          obfs: form.obfs === 'salamander',
          obfs_password: form.obfs_password.trim(),
          port_hopping: form.port_hopping.trim(),
        });
      }

      if (editingNode) {
        await updateNode(editingNode.id, payload);
        toast.success('节点已更新');
      } else {
        await createNode(payload);
        toast.success('节点已添加');
      }
      setEditOpen(false);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (node: NodeItem) => {
    try {
      await deleteNode(node.id);
      toast.success('节点已删除');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleResetToken = async () => {
    if (!connectNode) return;
    setResettingToken(true);
    try {
      const res = await resetNodeToken(connectNode.id);
      setConnectNode({ ...connectNode, token: res.token });
      toast.success('对接密钥已重置，请更新节点端配置');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重置失败');
    } finally {
      setResettingToken(false);
    }
  };

  const cleanBase = baseUrl.replace(/\/$/, '');

  return (
    <div className="space-y-5">
      {/* 顶部统计与操作栏 */}
      <Card>
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="grid grid-cols-4 gap-4 sm:gap-8">
            <div>
              <div className="text-xs text-muted-foreground">节点总数</div>
              <div className="text-xl font-bold mt-0.5">{total}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">在线</div>
              <div className={`text-xl font-bold mt-0.5 ${onlineCount > 0 ? 'text-emerald-600' : ''}`}>
                {onlineCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">待上报</div>
              <div className={`text-xl font-bold mt-0.5 ${pendingCount > 0 ? 'text-amber-600' : ''}`}>
                {pendingCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">已停用</div>
              <div className="text-xl font-bold mt-0.5 text-muted-foreground">{disabledCount}</div>
            </div>
          </div>

          <Button onClick={() => openEdit(null)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            添加节点
          </Button>
        </CardContent>
      </Card>

      {/* 节点卡片网格（自适应多列，铺满宽屏） */}
      {nodes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Server className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">还没有接入节点</p>
            <Button onClick={() => openEdit(null)}>
              <Plus className="h-4 w-4" />
              立即添加
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {nodes.map((n) => {
            const rate =
              n.up_mbps || n.down_mbps ? `${n.up_mbps || 0} / ${n.down_mbps || 0} Mbps` : '不限速';
            return (
              <Card
                key={n.id}
                className={`flex flex-col justify-between transition-shadow hover:shadow-sm ${
                  !n.enabled ? 'opacity-70' : ''
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="font-semibold text-sm truncate" title={n.name}>
                        {n.name}
                      </div>
                      <Badge variant="secondary" className="text-[11px] font-normal">
                        {getNodeProtoLabel(n)}
                      </Badge>
                    </div>
                    {!n.enabled ? (
                      <Badge variant="outline" className="shrink-0 text-muted-foreground">
                        已停用
                      </Badge>
                    ) : n.online ? (
                      <Badge variant="success" className="shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        在线
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        待上报
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pb-4 space-y-2.5 text-xs">
                  <div className="rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs truncate">
                    {n.host}:{n.port}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1">
                    <div>
                      <span className="text-muted-foreground block">SNI</span>
                      <span className="font-medium truncate block" title={n.sni || ''}>
                        {n.sni || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">最后上报</span>
                      <span className="font-medium block">
                        {n.last_report_at ? relTime(n.last_report_at) : '从未'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">上 / 下行</span>
                      <span className="font-medium block">{rate}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">
                        {n.protocol === 'vless' ? '传输' : '混淆'}
                      </span>
                      <span className="font-medium block">
                        {n.protocol === 'vless'
                          ? n.network === 'ws'
                            ? 'WebSocket'
                            : 'TCP'
                          : n.obfs
                            ? 'salamander'
                            : '关闭'}
                      </span>
                    </div>
                  </div>
                </CardContent>

                <div>
                  <Separator />
                  <CardFooter className="p-2 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-muted-foreground pl-2">#{n.id}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setConnectNode(n)} className="h-8 px-2.5 text-xs">
                        <Plug className="h-3.5 w-3.5" />
                        对接
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(n)} className="h-8 px-2.5 text-xs">
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除节点「{n.name}」</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后订阅配置会立即移除该节点，NodeX 侧也将停止上报。此操作不可撤销。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction destructive onClick={() => handleDelete(n)}>
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardFooter>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 添加 / 编辑节点弹窗 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingNode ? `编辑节点 · ${editingNode.name}` : '添加节点'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>节点名称</Label>
                <Input
                  placeholder="日本 · 大阪 01"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>协议</Label>
                <Select value={form.protocol} onValueChange={(v) => setField('protocol', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hysteria2">Hysteria2</SelectItem>
                    <SelectItem value="vless">VLESS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>状态</Label>
                <Select value={form.enabled} onValueChange={(v) => setField('enabled', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">启用</SelectItem>
                    <SelectItem value="0">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>服务器地址</Label>
                <Input
                  placeholder="1.2.3.4 或 node.example.com"
                  value={form.host}
                  onChange={(e) => setField('host', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>端口</Label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(e) => setField('port', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>排序</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sort}
                  onChange={(e) => setField('sort', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>SNI / 域名</Label>
                <Input
                  placeholder="browser.yourdomain.com"
                  value={form.sni}
                  onChange={(e) => setField('sni', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>跳过证书校验</Label>
                <Select value={form.insecure} onValueChange={(v) => setField('insecure', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">否</SelectItem>
                    <SelectItem value="1">是</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.protocol !== 'vless' ? (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>上行带宽 (Mbps)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.up_mbps}
                      onChange={(e) => setField('up_mbps', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>下行带宽 (Mbps)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.down_mbps}
                      onChange={(e) => setField('down_mbps', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>混淆</Label>
                    <Select
                      value={form.obfs || 'none'}
                      onValueChange={(v) => setField('obfs', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">关闭</SelectItem>
                        <SelectItem value="salamander">salamander</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>混淆密码</Label>
                    <Input
                      placeholder="开启后留空可自动生成"
                      value={form.obfs_password}
                      onChange={(e) => setField('obfs_password', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>端口跳跃 (mport)</Label>
                  <Input
                    placeholder="如 20000-50000（需服务端配合 UDP 重定向）"
                    value={form.port_hopping}
                    onChange={(e) => setField('port_hopping', e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>传输方式</Label>
                    <Select value={form.network} onValueChange={(v) => setField('network', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tcp">TCP</SelectItem>
                        <SelectItem value="ws">WebSocket</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>加密模式</Label>
                    <Select value={form.tls_mode} onValueChange={(v) => setField('tls_mode', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">Reality</SelectItem>
                        <SelectItem value="1">TLS</SelectItem>
                        <SelectItem value="0">不加密</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Flow</Label>
                  <Input
                    placeholder="xtls-rprx-vision（仅 Reality+TCP 使用）"
                    value={form.flow}
                    onChange={(e) => setField('flow', e.target.value)}
                  />
                </div>

                {form.network === 'ws' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>WS 路径</Label>
                      <Input
                        value={form.ws_path}
                        onChange={(e) => setField('ws_path', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>WS Host</Label>
                      <Input
                        placeholder="cdn.example.com"
                        value={form.ws_host}
                        onChange={(e) => setField('ws_host', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>证书路径（节点端）</Label>
                      <Input
                        placeholder="/etc/nodex/fullchain.pem"
                        value={form.cert_path}
                        onChange={(e) => setField('cert_path', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>私钥路径（节点端）</Label>
                      <Input
                        placeholder="/etc/nodex/privkey.pem"
                        value={form.key_path}
                        onChange={(e) => setField('key_path', e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {form.tls_mode === '2' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>伪装目标 dest</Label>
                      <Input
                        placeholder="www.microsoft.com:443"
                        value={form.reality_dest}
                        onChange={(e) => setField('reality_dest', e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>serverNames</Label>
                        <Input
                          placeholder="逗号分隔"
                          value={form.reality_server_names}
                          onChange={(e) => setField('reality_server_names', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>shortIds</Label>
                        <Input
                          placeholder="留空自动生成"
                          value={form.reality_short_ids}
                          onChange={(e) => setField('reality_short_ids', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>私钥</Label>
                        <Input
                          placeholder="留空自动生成"
                          value={form.reality_private_key}
                          onChange={(e) => setField('reality_private_key', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>公钥</Label>
                        <Input
                          placeholder="留空自动生成"
                          value={form.reality_public_key}
                          onChange={(e) => setField('reality_public_key', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingNode ? '保存修改' : '添加节点'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 对接 NodeX 弹窗 */}
      <Dialog open={!!connectNode} onOpenChange={(o) => !o && setConnectNode(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{connectNode ? `对接 NodeX · ${connectNode.name}` : ''}</DialogTitle>
          </DialogHeader>
          {connectNode && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                在 NodeX 的节点配置中填入以下三项，保存后节点会自动拉取用户与配置。
              </p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>面板地址</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${cleanBase}/api/v1/server/UniProxy`}
                      className="font-mono text-xs"
                    />
                    <CopyButton text={`${cleanBase}/api/v1/server/UniProxy`} label="复制" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>对接密钥</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={connectNode.token} className="font-mono text-xs" />
                    <CopyButton text={connectNode.token} label="复制" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>节点 ID</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={String(connectNode.id)} className="font-mono text-xs" />
                    <CopyButton text={String(connectNode.id)} label="复制" />
                  </div>
                </div>
              </div>

              {isPrivateBaseUrl(cleanBase) && (
                <Alert variant="warning">
                  <AlertTriangle />
                  <div className="text-xs leading-relaxed">
                    当前面板地址为内网 IP。若节点部署在公网，请先前往「设置 → 面板公开地址」修改为节点可访问的域名或公网地址。
                  </div>
                </Alert>
              )}

              <Alert>
                <Info />
                <div className="text-xs leading-relaxed">
                  NodeX 的「节点类型」留空即可；拉取与上报间隔由面板统一下发（默认 60 秒）。
                </div>
              </Alert>

              <DialogFooter className="sm:justify-between">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" disabled={resettingToken}>
                      <RefreshCw className={`h-3.5 w-3.5 ${resettingToken ? 'animate-spin' : ''}`} />
                      重置密钥
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>重置对接密钥</AlertDialogTitle>
                      <AlertDialogDescription>
                        重置后旧 Token 立即失效，节点端需同步更新配置。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={handleResetToken}>确认重置</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button type="button" onClick={() => setConnectNode(null)}>
                  关闭
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
