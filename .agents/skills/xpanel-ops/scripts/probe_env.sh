#!/bin/sh
set -u

echo "=== System ==="
uname -srm
if [ -f /etc/openwrt_release ]; then
  echo "DeviceType: OpenWrt Router"
  grep -E 'DISTRIB_ID|DISTRIB_RELEASE|DISTRIB_TARGET|DISTRIB_ARCH' /etc/openwrt_release 2>/dev/null || true
elif [ -f /etc/os-release ]; then
  echo "DeviceType: Linux Server / Container"
  grep -E '^(ID|VERSION_ID|PRETTY_NAME)=' /etc/os-release 2>/dev/null || true
fi

echo ""
echo "=== Runtimes & Tools ==="
for cmd in docker node npm systemctl opkg curl wget xray hysteria nodex; do
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "  [OK] $cmd -> $(command -v "$cmd")"
  else
    echo "  [--] $cmd"
  fi
done

echo ""
echo "=== Ports (7002: XPanel, 8888: NodeX) ==="
if command -v ss >/dev/null 2>&1; then
  ss -tulnp 2>/dev/null | grep -E ':(7002|8888)\b' || echo "  7002 / 8888 free"
elif command -v netstat >/dev/null 2>&1; then
  netstat -tulnp 2>/dev/null | grep -E ':(7002|8888)\b' || echo "  7002 / 8888 free"
fi

echo ""
echo "=== Disk & Memory ==="
df -h / /overlay 2>/dev/null | awk 'NR==1 || !seen[$1]++' || df -h /
free -m 2>/dev/null || true
