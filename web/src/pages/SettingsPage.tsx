import React, { useCallback, useEffect, useRef, useState } from 'react';
import { yaml } from '@codemirror/lang-yaml';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { AlertTriangle, Check, Eye, Info, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getSettings, getTemplate, previewTemplate, saveSettings, saveTemplate } from '@/api';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { NodeItem, TemplatePreviewData, UserItem } from '@/types';
import { getUserStatus } from '@/utils';

const SECTION_PATTERNS: Record<string, RegExp> = {
  dns: /^dns:/m,
  'proxy-groups': /^proxy-groups:/m,
  rules: /^rules:/m,
};

interface SettingsPageProps {
  baseUrl: string;
  nodes: NodeItem[];
  users: UserItem[];
  refreshKey: number;
  onBaseRefresh: () => Promise<void>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  baseUrl,
  nodes,
  users,
  refreshKey,
  onBaseRefresh,
}) => {
  const [panelUrl, setPanelUrl] = useState('');
  const [subName, setSubName] = useState('');
  const [pullInterval, setPullInterval] = useState('60');
  const [pushInterval, setPushInterval] = useState('60');
  const [savingSettings, setSavingSettings] = useState(false);

  const [tplContent, setTplContent] = useState('');
  const [isDefaultTpl, setIsDefaultTpl] = useState(true);
  const [savingTpl, setSavingTpl] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<TemplatePreviewData | null>(null);
  const [sectionTab, setSectionTab] = useState('all');

  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const loadAll = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([getSettings(), getTemplate()]);
      setPanelUrl(s.panel_url || '');
      setSubName(s.sub_name || '');
      setPullInterval(s.pull_interval || '60');
      setPushInterval(s.push_interval || '60');
      setTplContent(t.content || '');
      setIsDefaultTpl(t.isDefault);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载设置失败');
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshKey]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await saveSettings({
        panel_url: panelUrl.trim(),
        sub_name: subName.trim(),
        pull_interval: pullInterval || '60',
        push_interval: pushInterval || '60',
      });
      await onBaseRefresh();
      toast.success('基础设置已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!tplContent.includes('{{PROXIES}}')) {
      toast.error('模板必须包含 {{PROXIES}} 占位符');
      return;
    }
    setSavingTpl(true);
    try {
      await saveTemplate(tplContent);
      setIsDefaultTpl(false);
      toast.success('Clash 模板已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存模板失败');
    } finally {
      setSavingTpl(false);
    }
  };

  const handleResetTemplate = async () => {
    setSavingTpl(true);
    try {
      await saveTemplate('');
      const fresh = await getTemplate();
      setTplContent(fresh.content || '');
      setIsDefaultTpl(true);
      toast.success('已恢复内置默认模板');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '恢复失败');
    } finally {
      setSavingTpl(false);
    }
  };

  const handleFormat = () => {
    const formatted =
      tplContent
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd() + '\n';
    setTplContent(formatted);
    toast.success('已格式化');
  };

  const handlePreview = async () => {
    if (!tplContent.trim()) {
      toast.error('模板为空');
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await previewTemplate(tplContent);
      setPreviewData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleJumpSection = (sec: string) => {
    setSectionTab(sec);
    const view = editorRef.current?.view;
    if (!view) return;
    if (sec === 'all') {
      view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
      view.focus();
      return;
    }
    const pat = SECTION_PATTERNS[sec];
    const m = pat?.exec(tplContent);
    if (!m) {
      toast.warning(`当前模板中未找到 ${sec} 区块`);
      return;
    }
    view.dispatch({
      selection: { anchor: m.index, head: m.index + m[0].length },
      scrollIntoView: true,
    });
    view.focus();
  };

  const insertVariable = (token: string) => {
    const view = editorRef.current?.view;
    if (!view) {
      setTplContent((prev) => `${prev}${token}`);
      return;
    }
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: token },
      selection: { anchor: from + token.length },
    });
    view.focus();
  };

  const cleanBase = baseUrl.replace(/\/$/, '');
  const enabledNodes = nodes.filter((n) => n.enabled).length;
  const activeUsers = users.filter((u) => getUserStatus(u).isNormal).length;
  const lineCount = tplContent ? tplContent.split('\n').length : 0;
  const missingProxies = !tplContent.includes('{{PROXIES}}');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 基础设置 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">基础设置</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="space-y-1.5">
                <Label>面板公开地址</Label>
                <Input
                  placeholder="https://sub.example.com"
                  value={panelUrl}
                  onChange={(e) => setPanelUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>订阅显示名</Label>
                <Input
                  placeholder="我的节点"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>节点拉取间隔（秒）</Label>
                  <Input
                    type="number"
                    min={10}
                    value={pullInterval}
                    onChange={(e) => setPullInterval(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>流量上报间隔（秒）</Label>
                  <Input
                    type="number"
                    min={10}
                    value={pushInterval}
                    onChange={(e) => setPushInterval(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" disabled={savingSettings}>
                {savingSettings && <Loader2 className="h-4 w-4 animate-spin" />}
                保存设置
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 订阅对接概览 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">订阅对接概览</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">订阅入口</dt>
                <dd className="font-mono text-xs truncate">{`${cleanBase}/sub/{token}`}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">自动识别</dt>
                <dd className="font-mono text-xs">User-Agent</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">强制格式</dt>
                <dd className="font-mono text-xs">?flag=clash · rocket · general</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">心跳上报</dt>
                <dd className="font-mono text-xs">POST /api/v1/server/UniProxy</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">已启用节点</dt>
                <dd className="font-medium">
                  {enabledNodes} / {nodes.length}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">有效用户</dt>
                <dd className="font-medium">
                  {activeUsers} / {users.length}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4 items-center">
                <dt className="text-muted-foreground shrink-0">当前模板</dt>
                <dd>
                  <Badge variant={isDefaultTpl ? 'outline' : 'default'}>
                    {isDefaultTpl ? '内置默认' : '已自定义'}
                  </Badge>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Clash 模板编辑器 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Clash 订阅模板</CardTitle>
            <Badge variant={isDefaultTpl ? 'outline' : 'default'}>
              {isDefaultTpl ? '内置默认' : '已自定义'}
            </Badge>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <RotateCcw className="h-3.5 w-3.5" />
                恢复默认
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>恢复默认模板</AlertDialogTitle>
                <AlertDialogDescription>
                  当前自定义模板内容将被内置默认模板覆盖，确定恢复吗？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction destructive onClick={handleResetTemplate}>
                  恢复默认
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <Tabs value={sectionTab} onValueChange={handleJumpSection}>
              <TabsList>
                <TabsTrigger value="all">完整模板</TabsTrigger>
                <TabsTrigger value="dns">DNS</TabsTrigger>
                <TabsTrigger value="proxy-groups">策略组</TabsTrigger>
                <TabsTrigger value="rules">规则</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">
                {lineCount} 行 · {tplContent.length} 字符
              </span>
              <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewLoading}>
                {previewLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                预览
              </Button>
              <Button variant="outline" size="sm" onClick={handleFormat}>
                <Sparkles className="h-3.5 w-3.5" />
                格式化
              </Button>
              <Button size="sm" onClick={handleSaveTemplate} disabled={savingTpl}>
                {savingTpl ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                保存模板
              </Button>
            </div>
          </div>

          {missingProxies && (
            <Alert variant="warning">
              <AlertTriangle />
              <span className="text-xs">缺少 {'{{PROXIES}}'} 占位符，节点将无法注入</span>
            </Alert>
          )}

          <div
            className="rounded-lg border overflow-hidden"
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSaveTemplate();
              }
            }}
          >
            <CodeMirror
              ref={editorRef}
              value={tplContent}
              height="440px"
              extensions={[yaml()]}
              onChange={(val) => setTplContent(val)}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                foldGutter: true,
                indentOnInput: true,
                tabSize: 2,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">点击插入变量：</span>
            {['{{PROXIES}}', '{{APP_NAME}}', '{{GROUP_MEMBERS}}'].map((v) => (
              <Button
                key={v}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs font-mono"
                onClick={() => insertVariable(v)}
              >
                {v}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 模板预览弹窗 */}
      <Dialog open={!!previewData} onOpenChange={(o) => !o && setPreviewData(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Clash 模板渲染预览</DialogTitle>
          </DialogHeader>
          {previewData && (
            <div className="space-y-3">
              <Alert>
                <Info />
                <span className="text-xs">
                  以用户「{previewData.user}」身份渲染，共 {previewData.lines} 行、注入{' '}
                  {previewData.nodes} 个节点（与实际下发完全一致）
                </span>
              </Alert>
              <div className="rounded-lg border overflow-hidden">
                <CodeMirror
                  value={previewData.content}
                  height="440px"
                  extensions={[yaml()]}
                  editable={false}
                  readOnly
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setPreviewData(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
