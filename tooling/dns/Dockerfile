# The opt-in development resolver (`bun run dns:start`, ADR-0005). Its config
# is rendered by tooling/worktree/dev-dns.ts and mounted at /etc/dnsmasq.conf.
FROM alpine:3.24
RUN apk add --no-cache dnsmasq
ENTRYPOINT ["dnsmasq", "--keep-in-foreground", "--conf-file=/etc/dnsmasq.conf"]
