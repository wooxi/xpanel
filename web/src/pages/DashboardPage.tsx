import React from 'react';
import {
  Activity,
  ArrowRight,
  Database,
  HardDriveUpload,
  Server,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { NodeItem, OverviewData, UserItem } from '@/types';
import { fmtBytes, fmtBytesParts, getNodeProtoLabel, localTodayStr, relTime } from '@/utils';

interface DashboardPageProps {
  overview: OverviewData | null;
  nodes: NodeItem[];
  users: UserItem[];
  onNavigate: (key: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  overview,
  nodes,
  users,
  onNavigate,
}) => {
  const enabledNodes = nodes.filter((n) => n.enabled);
  const onlineNodes = enabledNodes.filter((n) => n.online);
  const todayParts = fmtBytesParts(overview?.traffic_today || 0);
  const totalParts = fmtBytesParts(overview?.traffic_total || 0);

  const topUsers = [...users]
    .filter((u) => u.used > 0)
    .sort((a, b) => b.used - a.used)
    .slice(0, 6);

  const trend = overview?.trend || [];
  const todayStr = localTodayStr();
  const trendTotal = trend.reduce((acc, t) => acc + t.total, 0);
  const trendAvg = trend.length ? trendTotal / trend.length : 0;

  return (
    <div className="space-y-5">
      {/* KPI 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium">可用节点</span>
              <Server className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {enabledNodes.length}
              <span className="text-sm font-normal text-muted-foreground ml-1">个</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className={onlineNodes.length > 0 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                {onlineNodes.length}
              </span>{' '}
              / {overview?.nodes ?? nodes.length} 在线
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium">活跃用户</span>
              <Users className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {overview?.users_active ?? 0}
              <span className="text-sm font-normal text-muted-foreground ml-1">人</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              共 {overview?.users ?? users.length} 个账号
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium">今日流量</span>
              <Activity className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {todayParts.value}
              <span className="text-sm font-normal text-muted-foreground ml-1">{todayParts.unit}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">今日实时累计</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium">累计流量</span>
              <Database className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {totalParts.value}
              <span className="text-sm font-normal text-muted-foreground ml-1">{totalParts.unit}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">历史总消耗</p>
          </CardContent>
        </Card>
      </div>

      {/* 中间区域：节点状态 & 流量消耗排行 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">节点状态</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('nodes')} className="h-8 text-xs">
              管理节点 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {nodes.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <p className="mb-3">还没有节点</p>
                <Button size="sm" onClick={() => onNavigate('nodes')}>
                  去添加节点
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {nodes.map((n) => {
                  const speedText =
                    n.up_mbps || n.down_mbps
                      ? `${n.up_mbps || '∞'}/${n.down_mbps || '∞'} Mbps`
                      : '不限速';
                  return (
                    <div key={n.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{n.name}</span>
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            {getNodeProtoLabel(n)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {n.host}:{n.port}
                          {n.sni ? ` · ${n.sni}` : ''} · {speedText}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {!n.enabled ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            已停用
                          </Badge>
                        ) : n.online ? (
                          <Badge variant="success">在线</Badge>
                        ) : (
                          <Badge variant="warning">待上报</Badge>
                        )}
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {relTime(n.last_report_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">流量消耗排行</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('users')} className="h-8 text-xs">
              全部用户 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {topUsers.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">暂无流量记录</div>
            ) : (
              <div className="space-y-4">
                {topUsers.map((u) => {
                  const hasLimit = u.traffic_limit != null && u.traffic_limit > 0;
                  const pct = hasLimit
                    ? Math.min(100, Math.round((u.used / (u.traffic_limit as number)) * 100))
                    : 0;
                  const indicatorCls =
                    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-zinc-900';
                  return (
                    <div key={u.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate">{u.name || '未命名'}</span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {fmtBytes(u.used)} / {u.traffic_limit != null ? fmtBytes(u.traffic_limit) : '不限量'}
                        </span>
                      </div>
                      {hasLimit && <Progress value={pct} indicatorClassName={indicatorCls} />}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 近 7 天流量趋势 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <HardDriveUpload className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">近 7 天流量趋势</CardTitle>
          </div>
          <Badge variant="secondary">
            {trendTotal > 0 ? `7 日均 ${fmtBytes(trendAvg)}` : '暂无数据'}
          </Badge>
        </CardHeader>
        <CardContent>
          {trendTotal === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">暂无流量记录</div>
          ) : (
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(v: string) => v.slice(5)}
                    tick={{ fontSize: 12, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => fmtBytes(v)}
                    tick={{ fontSize: 12, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    formatter={(value: number) => [fmtBytes(value), '当日流量']}
                    labelFormatter={(label: string) => (label === todayStr ? `${label}（今天）` : label)}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e4e4e7',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={52}>
                    {trend.map((entry) => (
                      <Cell
                        key={entry.day}
                        fill={entry.day === todayStr ? '#18181b' : '#a1a1aa'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
