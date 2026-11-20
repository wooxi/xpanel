import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getLogs } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LogItem } from '@/types';
import { fmtDateTime } from '@/utils';

const SOURCE_LABELS: Record<string, string> = {
  auth: '登录',
  sub: '订阅',
  node: '节点',
};

function parseMeta(raw: string | null): string {
  if (!raw) return '';
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    const bits: string[] = [];
    if (m.format) bits.push(String(m.format));
    if (m.nodes != null) bits.push(`${m.nodes} 节点`);
    if (m.type) bits.push(String(m.type));
    return bits.join(' · ');
  } catch {
    return '';
  }
}

export const LogsPage: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [source, setSource] = useState('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [rows, setRows] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 260);
    return () => clearTimeout(t);
  }, [query]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLogs({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        source: source === 'all' ? '' : source,
        q: debouncedQuery,
      });
      setRows(res.rows || []);
      setTotal(res.total || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载日志失败');
    } finally {
      setLoading(false);
    }
  }, [page, source, debouncedQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索日志内容、动作或 IP"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs
            value={source}
            onValueChange={(v) => {
              setSource(v);
              setPage(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="auth">登录</TabsTrigger>
              <TabsTrigger value="sub">订阅</TabsTrigger>
              <TabsTrigger value="node">节点</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {rows.length === 0 && !loading ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">暂无日志记录</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 桌面端表格 */}
          <Card className="hidden md:block overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">时间</TableHead>
                  <TableHead className="w-24">来源</TableHead>
                  <TableHead className="w-24">级别</TableHead>
                  <TableHead>内容</TableHead>
                  <TableHead className="w-40">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const extra = parseMeta(r.meta);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDateTime(r.ts)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{SOURCE_LABELS[r.source] || r.source}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.level === 'error'
                              ? 'destructive'
                              : r.level === 'warn'
                                ? 'warning'
                                : 'outline'
                          }
                        >
                          {r.level.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span>{r.message}</span>
                        {extra && (
                          <span className="text-xs text-muted-foreground ml-2">({extra})</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.ip || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* 移动端卡片列表 */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {rows.map((r) => {
              const extra = parseMeta(r.meta);
              return (
                <Card key={r.id}>
                  <CardContent className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary">{SOURCE_LABELS[r.source] || r.source}</Badge>
                        <Badge
                          variant={
                            r.level === 'error'
                              ? 'destructive'
                              : r.level === 'warn'
                                ? 'warning'
                                : 'outline'
                          }
                        >
                          {r.level.toUpperCase()}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{fmtDateTime(r.ts)}</span>
                    </div>
                    <div className="text-sm">
                      {r.message}
                      {extra && <span className="text-xs text-muted-foreground ml-1">({extra})</span>}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground">IP: {r.ip || '—'}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>共 {total} 条记录（保留最近 30 天）</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                上一页
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
