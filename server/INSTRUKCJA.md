# Siftcraft Official Server – wdrożenie na Cloudflare BEZ KOMEND (za darmo)

1. Na GitHubie wejdź do repo **Siftcraft-textures** → „Add file” → „Upload files”.
   Przeciągnij 4 pliki z tej paczki (`worker.js`, `wrangler.toml`, `package.json`, `INSTRUKCJA.md`)
   i w polu nazwy na górze dopisz folder `server/` (albo najpierw utwórz folder `server` i wrzuć je do środka).
   Kliknij „Commit changes”.
2. Otwórz link:
   https://deploy.workers.cloudflare.com/?url=https://github.com/piesiulko/Siftcraft-textures/tree/main/server
3. Załóż / zaloguj się na darmowe konto Cloudflare, połącz z GitHubem (przycisk „Connect GitHub”),
   zostaw nazwę `siftcraft-server` i kliknij **Deploy**. Cloudflare sam utworzy kopię repo z serwerem,
   zbuduje go i uruchomi (razem z Durable Objects).
4. Po minucie zobaczysz adres w stylu `https://siftcraft-server.TWOJANAZWA.workers.dev`.
   Sprawdź w przeglądarce `…workers.dev/status` – powinno być `"online":0,"max":8`.
5. **Wyślij ten adres** – wpiszę go w grę.

Zmiana nazwy / opisu / limitu graczy: w Cloudflare → Workers & Pages → siftcraft-server → Settings → Variables
(SERVER_NAME, MOTD, MAX_PLAYERS) albo edycja `wrangler.toml` w repo, które Cloudflare utworzył (wdroży się samo).

Opcjonalnie sprawdzanie kont: Settings → Variables and Secrets → Add → typ „Secret”, nazwa `GH_TOKEN`,
wartość = token GitHub (fine-grained, tylko repo Siftcraft-server, Contents: Read). Ten token nie trafia do gry.

Darmowy limit: ok. 100 godzin wspólnej gry dziennie; po przekroczeniu gra sama przechodzi na tryb zapasowy (GitHub).
