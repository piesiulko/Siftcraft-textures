// =====================================================================
//  Siftcraft Official Server – Cloudflare Worker + Durable Object
//  - /status        → { name, motd, online, max, players }  (lista serwerów w grze)
//  - /ws?k=&n=&h=   → WebSocket: gracze dostają na żywo ruchy, bloki, czat, zegar
//  Świat, konta i ekwipunki zostają w repozytorium GitHub (jak dotąd);
//  serwer przekazuje wiadomości między graczami, pilnuje limitu graczy i sprawdza konta.
// =====================================================================
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' };
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, CORS) });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const room = url.searchParams.get('room') || 'official';
    if (!/^[a-z0-9_-]{1,32}$/.test(room)) return json({ error: 'bad room' }, 400);
    if (url.pathname === '/status' || url.pathname === '/ws') return env.ROOM.get(env.ROOM.idFromName(room)).fetch(req);
    if (url.pathname === '/') return json({ ok: true, name: env.SERVER_NAME || 'Siftcraft Official Server' });
    return json({ error: 'not found' }, 404);
  }
};

export class SiftRoom {
  constructor(state, env) { this.state = state; this.env = env; this.acc = new Map(); }
  max() { return Math.max(1, parseInt(this.env.MAX_PLAYERS || '8', 10) || 8); }
  sockets(except) { return this.state.getWebSockets().filter((w) => w !== except && w.readyState === 1 && w.deserializeAttachment()); }
  players(except) {
    const seen = new Map();
    for (const w of this.sockets(except)) { const a = w.deserializeAttachment(); if (a && a.k) seen.set(a.k, { k: a.k, n: a.n }); }
    return [...seen.values()];
  }
  send(w, o) { try { w.send(typeof o === 'string' ? o : JSON.stringify(o)); } catch (e) {} }
  broadcast(o, except) { const s = typeof o === 'string' ? o : JSON.stringify(o); for (const w of this.sockets(except)) this.send(w, s); }

  // konto: players/<nick>/account.json w repozytorium serwera musi mieć ten sam hash (gdy ustawiono sekret GH_TOKEN)
  async checkAccount(k, h) {
    if (!this.env.GH_TOKEN) return true;
    const c = this.acc.get(k);
    if (c && Date.now() - c.at < 300000) return c.hash === h;
    const r = await fetch('https://api.github.com/repos/' + (this.env.GH_REPO || 'piesiulko/Siftcraft-server') + '/contents/players/' + encodeURIComponent(k) + '/account.json', {
      headers: { 'Authorization': 'Bearer ' + this.env.GH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'siftcraft-server' } });
    if (r.status === 404) return false;
    if (!r.ok) return true;                    // GitHub nie odpowiada – nie blokujemy graczy
    const j = await r.json();
    let hash = '';
    try { hash = JSON.parse(atob((j.content || '').replace(/\s/g, ''))).hash || ''; } catch (e) {}
    this.acc.set(k, { hash, at: Date.now() });
    return hash === h;
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/status') {
      const ps = this.players();
      return json({ name: this.env.SERVER_NAME || 'Siftcraft Official Server', motd: this.env.MOTD || '', online: ps.length, max: this.max(), players: ps.map((p) => p.n), version: 1 });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
    const k = (url.searchParams.get('k') || '').toLowerCase();
    const n = (url.searchParams.get('n') || k).slice(0, 16);
    const h = url.searchParams.get('h') || '';
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [k || '_']);
    let deny = null;
    if (!/^[a-z0-9_]{3,16}$/.test(k)) deny = 'bad nick';
    else if (!(await this.checkAccount(k, h))) deny = 'denied';
    else if (this.players().filter((p) => p.k !== k).length >= this.max()) deny = 'full';
    if (deny) { this.send(server, { t: deny === 'full' ? 'full' : 'denied', why: deny }); server.close(4000, deny); return new Response(null, { status: 101, webSocket: client }); }
    for (const w of this.state.getWebSockets(k)) if (w !== server) { this.send(w, { t: 'replaced' }); try { w.serializeAttachment(null); w.close(4001, 'replaced'); } catch (e) {} }
    server.serializeAttachment({ k, n, at: Date.now() });
    this.send(server, { t: 'hello', you: k, players: this.players(server), max: this.max() });
    this.broadcast({ t: 'join', k, n }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    const a = ws.deserializeAttachment();
    if (!a || typeof msg !== 'string' || msg.length > 200000) return;
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    if (m.ping) { this.send(ws, { pong: m.ping }); return; }
    const out = JSON.stringify({ from: a.k, d: m.d });
    if (m.to) { for (const w of this.state.getWebSockets(String(m.to))) if (w.readyState === 1 && w.deserializeAttachment()) this.send(w, out); }
    else this.broadcast(out, ws);
  }
  gone(ws) {
    const a = ws.deserializeAttachment();
    try { ws.serializeAttachment(null); } catch (e) {}
    try { ws.close(1000, 'bye'); } catch (e) {}
    if (a && a.k && !this.players(ws).some((p) => p.k === a.k)) this.broadcast({ t: 'leave', k: a.k }, ws);
  }
  async webSocketClose(ws) { this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }
}
