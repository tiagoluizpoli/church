#!/bin/sh
# Throwaway benchmark, run INSIDE a container (cgroup v2) so memory.peak covers every render process.
# usage: bench.sh <concurrency> <total jobs> <command with {} for the job number>
# prints: wall seconds, throughput, p50/max job latency, container memory.peak
N=$1; TOTAL=$2; CMD=$3; mkdir -p /tmp/b; rm -f /tmp/b/*
t0=$(date +%s%N)
seq 1 "$TOTAL" | xargs -P "$N" -I{} sh -c "s=\$(date +%s%N); $CMD >/dev/null 2>&1 || echo fail >> /tmp/b/fail; e=\$(date +%s%N); echo \$(( (e-s)/1000000 )) >> /tmp/b/lat"
t1=$(date +%s%N)
wall=$(( (t1-t0)/1000000 ))
sort -n /tmp/b/lat > /tmp/b/s; cnt=$(wc -l < /tmp/b/s)
p50=$(sed -n "$(( (cnt+1)/2 ))p" /tmp/b/s); mx=$(tail -1 /tmp/b/s)
peak=$(( $(cat /sys/fs/cgroup/memory.peak) / 1048576 ))
echo "conc=$N jobs=$TOTAL wall_ms=$wall pdf_per_s=$(awk "BEGIN{printf \"%.1f\", $TOTAL*1000/$wall}") p50_ms=$p50 max_ms=$mx fails=$(cat /tmp/b/fail 2>/dev/null | wc -l) mem_peak_mb=$peak"
