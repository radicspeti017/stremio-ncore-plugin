![nCore addon](./docs/stremio-ncore-addon-banner.png)

# nCore addon

Saját szerveren futtatható Stremio addon, amellyel közvetlenül az nCore-ról származó tartalmakat nézheted. A szerver kezeli a torrentek letöltését és seedelését, a Stremio pedig lejátssza a kiválasztott fájlt.

> [!WARNING]
> A projekt alpha állapotú: még nem garantált a stabil működés, és jelentős változások is várhatók. Frissítéskor a környezeti változók, a volume-ok és az adatbázis is változhatnak. Telepítés előtt mindig készíts mentést.

> [!IMPORTANT]
> Az eredeti projekt szabadidős, source-available fejlesztés. Az eredeti fejlesztő nem vállal ingyenes munkát, a sértő vagy követelőző issue-kat törölheti, és jelenleg nem fogad külső hozzájárulásokat. A licenc feltételeit a [LICENSE.md](./LICENSE.md) tartalmazza. Ez a repository helyi testreszabásokat is tartalmaz.

## Tartalom

- [Mire van szükség?](#mire-van-szükség)
- [Build és telepítés közvetlenül a szerveren](#build-és-telepítés-közvetlenül-a-szerveren)
- [Meglévő telepítés cseréje és későbbi frissítése](#meglévő-telepítés-cseréje-és-későbbi-frissítése)
- [Build lokális gépen és átvitel a szerverre](#build-lokális-gépen-és-átvitel-a-szerverre)
- [Első beállítás és hozzáadás a Stremióhoz](#első-beállítás-és-hozzáadás-a-stremióhoz)
- [Hálózat és HTTPS](#hálózat-és-https)
- [Üzemeltetés, mentés és rollback](#üzemeltetés-mentés-és-rollback)
- [Hibaelhárítás](#hibaelhárítás)
- [Környezeti változók](#környezeti-változók)
- [Gyakori kérdések és funkciók](#gyakori-kérdések-és-funkciók)

## Mire van szükség?

- Működő nCore-fiók, valamint jogosultság a felhasznált tartalmakhoz.
- Egy lehetőleg folyamatosan bekapcsolt szerver, mini PC vagy NAS, elegendő tárhellyel a letöltésekhez és a seedeléshez.
- Git, Docker Engine és Docker Compose v2 a szerveren. Lokális buildhez Docker Desktop is használható macOS-en vagy Windowson.
- SSH-elérés, ha másik gépről telepítesz.
- Stremio-fiók és támogatott kliens, például Android TV, LG/Samsung TV, telefon vagy számítógép.
- Távoli eléréshez megfelelő HTTPS-végpont, például saját domain és reverse proxy.

Telepítési leírások: [Docker Engine](https://docs.docker.com/engine/install/), [Docker Compose](https://docs.docker.com/compose/install/), [Docker Desktop](https://docs.docker.com/desktop/).

A parancsok feltételezik, hogy a Docker a felhasználóddal, `sudo` nélkül elérhető. Ezt ellenőrizd:

```sh
git --version
docker version
docker compose version
docker info
```

Ha a Docker sockethez nincs jogosultságod, kérd a rendszergazdától a hozzáférés beállítását. A Docker-hozzáférés kiemelt jogosultságot jelent. Az image buildjéhez internetkapcsolat és további szabad lemezterület is kell.

**Szerver**: ahol az addon, a torrentek és a letöltések találhatók. **Kliens**: ahol Stremióban nézed a tartalmat. Dockeres buildhez nem kell külön Node.js-t, pnpm-et vagy Go-t telepítened: ezeket a Dockerfile kezeli.

## Build és telepítés közvetlenül a szerveren

Ez az ajánlott eljárás: a szerver a saját CPU-architektúrájára buildeli az image-et, ezért nincs külön image-átvitel vagy architektúra-egyeztetés.

### 1. A repository klónozása

Jelentkezz be a szerverre SSH-val, majd:

```sh
cd ~
git clone https://github.com/radicspeti017/stremio-ncore-plugin.git stremio-ncore-addon
cd ~/stremio-ncore-addon
git switch main
git log -1 --oneline
```

Privát repository esetén GitHub-hozzáférés is szükséges. Ne írj access tokent a klónozási URL-be; használj Git credential managert vagy beállított SSH-kulcsot.

Ha a könyvtár már létezik, ne klónozz rá újra: kövesd a [frissítési lépéseket](#meglévő-telepítés-cseréje-és-későbbi-frissítése).

### 2. Hitelesítő adatok és helyi Compose beállítások

A jelszavakat a repón és a Docker build contexten kívül tároljuk:

```sh
mkdir -p ~/.config/stremio-ncore-addon
chmod 700 ~/.config/stremio-ncore-addon
nano ~/.config/stremio-ncore-addon/server.env
```

A fájl tartalma, a saját nCore-adataiddal:

```dotenv
NCORE_USERNAME='sajat_ncore_felhasznalonev'
NCORE_PASSWORD='sajat_ncore_jelszo'
```

Az egyszeres idézőjelek megakadályozzák a `$` karakterek Compose-interpolációját. Ha a jelszó maga is tartalmaz egyszeres idézőjelet, az [env-fájl szintaxisa](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/#env-file-syntax) szerint escape-eld.

```sh
chmod 600 ~/.config/stremio-ncore-addon/server.env
nano ~/.config/stremio-ncore-addon/compose.override.yml
```

Az override tartalma:

```yaml
services:
  stremio-radics:
    ports:
      - '3443:3443/tcp'
```

Ez a repository Compose fájljához hozzáadja a LAN-os HTTPS-portot. A többi port és a volume változatlan marad. A további parancsok mindig ezt a két Compose fájlt használják együtt.

> [!IMPORTANT]
> A [deploy/docker-compose.yml](./deploy/docker-compose.yml) alapértelmezett adatkönyvtára `/DATA/AppData/stremio-ncore-addon`. Meglévő telepítésnél annak **tényleges adatkönyvtárát** kell használni. Egy üres, másik könyvtárral az alkalmazás új telepítésnek látszik.

Más adatkönyvtár esetén az override-ba a `ports` mellé ezt is vedd fel, a saját abszolút útvonaladdal:

```yaml
volumes:
  - /sajat/adatkonyvtar:/addon
```

Új telepítésnél hozd létre a választott adatkönyvtárat, például:

```sh
mkdir -p /DATA/AppData/stremio-ncore-addon
```

Ha erre nincs jogosultságod, a rendszergazda hozza létre a könyvtárat, vagy válassz írható helyet és állítsd át az override-ot. Ne töröld a meglévő adatokat, és ne használj `chmod 777`-et.

### 3. A Docker image buildje

A repository gyökeréből:

```sh
cd ~/stremio-ncore-addon
docker build --pull -t stremio-ncore-addon:custom .
docker image inspect stremio-ncore-addon:custom \
  --format '{{.Os}}/{{.Architecture}} {{.Id}}'
```

A build elkészíti a TypeScript backendet, a React klienst és a Go torrent-servert. Az első build hosszabb ideig tarthat; a további buildek használják a Docker cache-t. A `custom` tag egyezik a Compose fájlban megadott image-gel.

### 4. Ellenőrzés és indítás

Először ellenőrizd a konfigurációt, a jelszavak kiírása nélkül:

```sh
docker compose --env-file ~/.config/stremio-ncore-addon/server.env \
  -p stremio-ncore-addon \
  -f deploy/docker-compose.yml \
  -f ~/.config/stremio-ncore-addon/compose.override.yml config --quiet
```

**Új telepítésnél** indíthatod az alkalmazást:

```sh
docker compose --env-file ~/.config/stremio-ncore-addon/server.env \
  -p stremio-ncore-addon \
  -f deploy/docker-compose.yml \
  -f ~/.config/stremio-ncore-addon/compose.override.yml up -d --force-recreate
```

**Meglévő konténer cseréjénél előbb a következő fejezet mentési és leállítási lépéseit végezd el.** Ne indíts két példányt ugyanarra az adatkönyvtárra vagy ugyanazokra a portokra.

### 5. A működés ellenőrzése

```sh
docker compose --env-file ~/.config/stremio-ncore-addon/server.env \
  -p stremio-ncore-addon \
  -f deploy/docker-compose.yml \
  -f ~/.config/stremio-ncore-addon/compose.override.yml ps

docker compose --env-file ~/.config/stremio-ncore-addon/server.env \
  -p stremio-ncore-addon \
  -f deploy/docker-compose.yml \
  -f ~/.config/stremio-ncore-addon/compose.override.yml logs --tail=100

curl -fsS http://127.0.0.1:3001/api/config/is-configured
```

A logban a HTTP- és HTTPS-szerver indulása is megjelenik. Első telepítésnél a konfigurációs állapot lehet hamis: ez önmagában nem hiba. Nyisd meg a böngészőben a `http://SZERVER_IP:3001` címet, majd végezd el az [első beállítást](#első-beállítás-és-hozzáadás-a-stremióhoz).

## Meglévő telepítés cseréje és későbbi frissítése

A konténer újraindítása önmagában **nem** buildeli és nem telepíti az új forráskódot. Frissítéshez új image és konténer-újralétrehozás szükséges.

### Első áttérés a saját buildre, például CasaOS-ról

1. Klónozd a repositoryt, készítsd el a repón kívüli env-fájlt és override-ot, majd buildeld az image-et az előző fejezet szerint. A régi konténer a build alatt még futhat.
2. Keresd meg a régi konténert és az adatkönyvtárát:

```sh
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
docker inspect REGI_KONTENER_NEVE --format '{{json .Mounts}}'
```

3. Ellenőrizd, hogy az override ugyanazt a host könyvtárat csatolja `/addon` alá. A `REGI_KONTENER_NEVE` helyére minden parancsban a tényleges konténernevet írd.
4. Őrizd meg a régi image-et, majd állítsd le a régi konténert:

```sh
docker image tag "$(docker inspect REGI_KONTENER_NEVE --format '{{.Image}}')" \
  stremio-ncore-addon:rollback
docker stop REGI_KONTENER_NEVE
```

5. Készíts [leállított állapotú mentést](#mentés), majd az előző fejezet Compose indítási parancsával indítsd az új példányt. CasaOS-ban se indítsd újra közben a régi appot.
6. Ellenőrizd a web UI-t, a régi felhasználókat és egy lejátszást a TV-n is. A régi konténert csak sikeres ellenőrzés után távolítsd el, és a CasaOS automatikus indítását is kapcsold ki hozzá.

### Későbbi frissítések ugyanebben a Compose projektben

Minden új SSH-munkamenetben a repository gyökeréből dolgozz:

```sh
cd ~/stremio-ncore-addon
git status --short
git pull --ff-only origin main
git log -1 --oneline
```

Ha a `git pull` helyi módosítások miatt megáll, előbb rendezd azokat; ne használj automatikusan `git reset --hard`-ot. A repón kívüli env- és override-fájlokat a pull nem módosítja. Olvasd el az új verzió beállítás- és adatbázis-változásait is.

A jelenleg futó image-et még a build előtt őrizd meg:

```sh
CURRENT_CONTAINER=$(docker compose \
  --env-file ~/.config/stremio-ncore-addon/server.env \
  -p stremio-ncore-addon \
  -f deploy/docker-compose.yml \
  -f ~/.config/stremio-ncore-addon/compose.override.yml ps -q stremio-radics)
docker image tag "$(docker inspect "$CURRENT_CONTAINER" --format '{{.Image}}')" \
  stremio-ncore-addon:rollback

docker build --pull -t stremio-ncore-addon:custom .
```

Ha a build hibázik, ne állítsd le a még működő konténert. Sikeres build után:

```sh
docker compose --env-file ~/.config/stremio-ncore-addon/server.env \
  -p stremio-ncore-addon \
  -f deploy/docker-compose.yml \
  -f ~/.config/stremio-ncore-addon/compose.override.yml stop
```

Készíts [mentést](#mentés), majd:

```sh
docker compose --env-file ~/.config/stremio-ncore-addon/server.env \
  -p stremio-ncore-addon \
  -f deploy/docker-compose.yml \
  -f ~/.config/stremio-ncore-addon/compose.override.yml up -d --force-recreate
```

Futtasd újra a működésellenőrzést, és próbálj ki egy teljes TV-s lejátszást. Ugyanazzal az adatkönyvtárral a felhasználók, a device tokenek és a letöltések megmaradnak. A szerver induláskor alkalmazza az adatbázis-migrációkat, és újra betölti a mentett torrentfájlokat.

## Build lokális gépen és átvitel a szerverre

Ez akkor hasznos, ha a szerveren kevés erőforrás áll rendelkezésre. A lokális gépen buildelsz, a szerverre pedig **egy Docker image tar-fájlt** viszel át. A letöltéseket és az nCore-jelszót nem kell a buildhez mellékelni.

### 1. A célarchitektúra ellenőrzése

A szerveren:

```sh
uname -m
docker info --format '{{.OSType}}/{{.Architecture}}'
```

| Szerver CPU                 | Docker build platform |
| --------------------------- | --------------------- |
| `x86_64`, Intel/AMD mini PC | `linux/amd64`         |
| `aarch64`, ARM64 szerver    | `linux/arm64`         |

Apple Silicon Macről Intel/AMD szerverre mindig `linux/amd64` image-et buildelj. Más architektúra image-e induláskor `exec format error` hibát okozhat. Más architektúrára történő buildhez Buildx és emuláció kell; Docker Desktop ezt általában biztosítja. Az emulált build lényegesen lassabb lehet.

### 2. Build és image export a lokális gépen

Az alábbi parancsok macOS/Linux shellhez valók. Windows alatt használj például WSL-t, vagy igazítsd a parancsokat a saját shelledhez.

```sh
git clone https://github.com/radicspeti017/stremio-ncore-plugin.git stremio-ncore-addon
cd stremio-ncore-addon
git switch main
docker buildx version

docker buildx build --platform linux/amd64 --pull --load \
  -t stremio-ncore-addon:custom .

docker image inspect stremio-ncore-addon:custom \
  --format '{{.Os}}/{{.Architecture}}'
docker save -o ../stremio-ncore-addon-image.tar stremio-ncore-addon:custom
```

ARM64 szervernél a platformot cseréld `linux/arm64`-re. A `--load` szükséges ahhoz, hogy a build eredménye elérhető legyen a helyi Dockerben a `docker save` számára. A tar-fájlt a repositoryn kívül hozzuk létre.

### 3. Másolás és telepítés a szerveren

A lokális gépen, a repository könyvtárából:

```sh
scp ../stremio-ncore-addon-image.tar FELHASZNALO@SZERVER:~/
```

A `FELHASZNALO@SZERVER` helyére az SSH-felhasználódat és a szerver címét írd. A szerveren klónozd vagy frissítsd a repositoryt, és hozd létre az env-/override-fájlokat a szerveres útmutató szerint.

**Meglévő telepítésnél a régi image rollback tagjét a betöltés előtt készítsd el**, mert a betöltés felülírja a `custom` taget. Ezután:

```sh
docker load -i ~/stremio-ncore-addon-image.tar
docker image inspect stremio-ncore-addon:custom \
  --format '{{.Os}}/{{.Architecture}} {{.Id}}'
cd ~/stremio-ncore-addon
```

Innentől az [első telepítés](#build-és-telepítés-közvetlenül-a-szerveren) vagy a [frissítés](#meglévő-telepítés-cseréje-és-későbbi-frissítése) leállítási, mentési és Compose indítási lépéseit kövesd. A szerveres `docker build` parancsot hagyd ki: az image-et már betöltötted.

### Lokális próba Dockerrel

A saját gépeden a saját architektúrájára buildelt image-et így is kipróbálhatod. Ehhez külön tesztadatkönyvtár és a saját, repón kívüli env-fájl kell:

```sh
docker build -t stremio-ncore-addon:local .
mkdir -p ~/stremio-ncore-addon-test-data

docker run -d --name stremio-ncore-addon-test \
  --env-file ~/.config/stremio-ncore-addon/server.env \
  -p 3001:3000 -p 3443:3443 \
  -p 42069:42069/tcp -p 42069:42069/udp \
  -v "$HOME/stremio-ncore-addon-test-data:/addon" \
  stremio-ncore-addon:local
```

Nyisd meg a `http://localhost:3001` címet. Egy gépen ne fusson másik addon ugyanazokon a portokon. Ne indíts külön tesztpéldányt az éles adatkönyvtárra. A tesztkonténer eltávolítása a hoston tárolt adatokat nem törli:

```sh
docker stop stremio-ncore-addon-test
docker rm stremio-ncore-addon-test
```

## Első beállítás és hozzáadás a Stremióhoz

### Web UI és adminfiók

1. Nyisd meg a `http://SZERVER_IP:3001` címet. Meglévő adatbázisnál a korábbi adminfiókkal jelentkezz be; új telepítésnél megjelenik a setup képernyő.
2. Válaszd ki a helyi hálózatos vagy a saját URL-es működést a következő fejezet szerint.
3. Hozz létre egy adminfelhasználót. Ez az addon adminfiókja, **nem az nCore-fiókod**.
4. Válaszd ki a preferált nyelvet és felbontásokat. Ezek alapján rangsorolja a torrenteket az addon.
5. Szükség esetén állítsd be a hit'n'run utáni automatikus törlést. Az alap cron kifejezés `0 2 * * *`, vagyis minden nap 02:00 a konténer időzónája szerint. A seedelési kötelezettséged betartása továbbra is a te felelősséged.
6. Másoknak külön addonfelhasználót hozz létre; az nCore-jelszavadat ne add át nekik.

Az admin a torrenteket, a beállításokat és a felhasználókat kezeli. A normál felhasználó a saját fiókját és device tokenjeit kezeli. A nyelvi/felbontási felismerés a torrent nevére és kategóriájára támaszkodik, ezért mindig ellenőrizd a release nevét is.

### Device token és Stremio telepítés

1. Jelentkezz be a web UI-ba azzal az addonfelhasználóval, aki az adott eszközt használja.
2. Hozz létre egy device tokent, például `Nappali TV` néven.
3. Használd az `Add in the Stremio app` vagy `Add on the Web` gombot, és a Stremióban erősítsd meg az `Install` műveletet.
4. Ha a TV-n nincs addon-hozzáadási lehetőség, telepítsd számítógépen vagy a [Stremio web kliensben](https://web.stremio.com/#/addons), ugyanazzal a Stremio-fiókkal, majd indítsd újra vagy szinkronizáld a TV-s appot.
5. Nyiss meg egy filmet vagy sorozatot, válassz nCore streamet, és ellenőrizd a lejátszást.

A publikus `https://SAJAT_DOMAIN/manifest.json` csak a beállítási belépési pont. A tényleges, személyre szabott addon URL device tokent tartalmaz, például `https://SAJAT_DOMAIN/api/auth/DEVICE_TOKEN/manifest.json`. A web UI által generált URL-t használd; ne találj ki tokent és ne oszd meg nyilvánosan.

Ha egy token kiszivárgott, töröld a web UI-ban, hozz létre újat, és telepítsd újra az addont az érintett kliensben. Az addon URL-jének megváltoztatásakor is szükség lehet a Stremio addon újratelepítésére.

## Hálózat és HTTPS

### Portok és adatkönyvtár

| Funkció                      | Host port az útmutató szerint | Konténer port              |
| ---------------------------- | ----------------------------- | -------------------------- |
| Web UI és HTTP API           | `3001/tcp`                    | `3000/tcp`                 |
| Helyi HTTPS                  | `3443/tcp`                    | `3443/tcp`                 |
| Torrentkapcsolatok, seedelés | `42069/tcp` és `42069/udp`    | `42069/tcp` és `42069/udp` |
| Belső Go torrent-server      | Nincs publikálva              | `8080/tcp`                 |

A `3443`-as portot az útmutató override-ja adja hozzá; az alap Compose fájl önmagában nem publikálja. A `8080` belső szolgáltatás, ne nyisd meg az internet felé.

A konténer `/addon` könyvtárába csatolt host könyvtár tartalma:

- `config/sna.db`: SQLite adatbázis, felhasználók és addonbeállítások.
- `config/`: további futásidejű konfiguráció.
- `torrents/`: mentett `.torrent` fájlok.
- `downloads/`: letöltött tartalom.

A konténer cserélhető, ez a host könyvtár azonban tartós adat. A bejelentkezési env-fájlt és a Compose override-ot külön is őrizd meg.

### Csak helyi hálózaton

- Adj a szervernek stabil LAN IP-címet, például DHCP-foglalással.
- A setupban válaszd a helyi hálózatos módot, és a **szerver LAN IP-címét** add meg, ne a konténer belső címét és ne a `127.0.0.1`-et.
- Engedélyezd a LAN-ról a `3443/tcp` portot. A web UI ilyen HTTPS addon URL-t generál: `https://192-168-1-100.local-ip.medicmobile.org:3443`.
- A TV-n is ellenőrizd, hogy ez a név feloldható és elérhető. A névfeloldáshoz működő DNS szükséges; DNS-rebinding védelem esetén célzott kivétel kellhet erre a domainre.
- A `http://localhost:3001` csak azon a gépen értelmezhető, ahol megnyitod, TV-s addon URL-nek nem megfelelő.

### Távoli elérés saját domainnel

- A domain vagy a tunnel mutasson a szerveredre. Használj érvényes HTTPS-tanúsítványt és például Caddy, Nginx vagy Traefik reverse proxyt.
- A proxy célja hostról `http://127.0.0.1:3001` lehet. Egy másik konténerben a `localhost` magát a proxykonténert jelenti; ott közös Docker hálózat és megfelelő szolgáltatásnév szükséges.
- A setupban a kliens számára elérhető HTTPS URL-t állítsd be, például `https://stremio.sajatdomain.hu`, ne a belső HTTP-címet.
- A proxy továbbítsa a Range kéréseket és a streamet. A túl rövid timeout vagy a stream pufferelése lejátszási hibát okozhat; állítsd ezeket a választott proxy dokumentációja szerint.
- Internet felől lehetőleg csak a HTTPS reverse proxyt tedd elérhetővé. A közvetlen `3001`/`3443` hozzáférést korlátozd tűzfallal a szükséges hálózatokra. A Compose portpublikálása önmagában nem ilyen korlátozás.
- Torrent seedeléshez szükség lehet a `42069/tcp` és `42069/udp` routeres porttovábbítására is. CGNAT esetén a bejövő kapcsolatok nem feltétlenül biztosíthatók.

> [!IMPORTANT]
> Egyes LG/Samsung TV-s és webes Stremio kliensek nem fogadják el a sima HTTP addon URL-t. A web UI HTTP-s működése még nem bizonyítja, hogy a TV-n a lejátszás is működni fog. Mindig a kliens számára elérhető HTTPS URL-lel tesztelj.

## Üzemeltetés, mentés és rollback

### Állapot, logok és újraindítás

A repository gyökeréből, a korábban létrehozott konfigurációval:

```sh
cd ~/stremio-ncore-addon
docker compose --env-file ~/.config/stremio-ncore-addon/server.env \
  -p stremio-ncore-addon \
  -f deploy/docker-compose.yml \
  -f ~/.config/stremio-ncore-addon/compose.override.yml logs -f --tail=100
```

A logkövetésből `Ctrl+C`-vel lépsz ki; ez nem állítja le a szervert. Ideiglenes újraindítás:

```sh
docker compose --env-file ~/.config/stremio-ncore-addon/server.env \
  -p stremio-ncore-addon \
  -f deploy/docker-compose.yml \
  -f ~/.config/stremio-ncore-addon/compose.override.yml restart
```

A `restart` nem alkalmaz új image-et vagy megváltozott env-beállításokat. Ezekhez `up -d --force-recreate` kell. A Compose `restart: unless-stopped` beállítása Docker-/szerverújraindítás után is elindítja a nem kézzel leállított konténert.

### Mentés

**Előbb állítsd le az addont** a fenti Compose `stop` paranccsal, vagy első migrációnál a régi konténert a `docker stop` paranccsal. Folyamatban lévő írás mellett a sima SQLite-fájlmásolat nem garantáltan konzisztens.

Az alapértelmezett adatkönyvtár teljes mentése, bizalmas konfigurációval együtt:

```sh
umask 077
BACKUP_DIR="$HOME/stremio-ncore-addon-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -a /DATA/AppData/stremio-ncore-addon "$BACKUP_DIR/addon"
cp -a "$HOME/.config/stremio-ncore-addon" "$BACKUP_DIR/deploy-config"
printf 'Mentés helye: %s\n' "$BACKUP_DIR"
```

Más volume-útvonal esetén cseréld a másolás forrását. A teljes letöltéskönyvtár nagy lehet: ellenőrizd a szabad helyet. Jogosultsági vagy másolási hiba esetén ne tekintsd késznek a mentést. Ellenőrizd, hogy az adatbázis és a torrentfájlok is szerepelnek benne, majd indítsd újra az addont, ha nem frissítesz.

### Rollback

Ha a frissítés nem működik, állítsd le az új konténert, majd állítsd vissza a korábban megőrzött image taget:

```sh
docker image tag stremio-ncore-addon:rollback stremio-ncore-addon:custom
```

Ezután a szokásos Compose `up -d --force-recreate` paranccsal indítsd újra. **Adatbázis-migráció után a régi image önmagában nem feltétlenül elég**: a frissítés előtti adatkönyvtár-mentés visszaállítása is szükséges lehet.

Leállított konténer mellett, az alapértelmezett volume esetén:

```sh
BACKUP_DIR="$HOME/stremio-ncore-addon-backups/MENTES_IDOPONTJA"
mv /DATA/AppData/stremio-ncore-addon \
  "/DATA/AppData/stremio-ncore-addon.failed-$(date +%Y%m%d-%H%M%S)"
cp -a "$BACKUP_DIR/addon" /DATA/AppData/stremio-ncore-addon
```

A `MENTES_IDOPONTJA` helyére a tényleges mentési könyvtár nevét írd. A hibás állapotot a parancs nem törli, hanem átnevezi. A konfigurációt is állítsd vissza, ha azt megváltoztattad. Első CasaOS-migrációnál alternatíva lehet a régi, még megőrzött konténer indítása, de előtte az új példányt le kell állítani.

### Tárhely és seedelés

```sh
df -h /DATA/AppData/stremio-ncore-addon
docker system df
```

A web UI torrentoldalán figyeld a letöltéseket, és csak a seedelési kötelezettség teljesítése után törölj. Ne töröld kézzel az aktívan használt fájlokat. A rollback image-et és az adatmentést csak a sikeres frissítés ellenőrzése után takarítsd ki; ne futtass válogatás nélkül image-/volume-prune parancsokat.

## Hibaelhárítás

| Tünet                                                       | Ellenőrzés és teendő                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exec format error`                                         | Rossz image-architektúra. Buildelj a szerveren, vagy a cél szerinti `--platform` kapcsolóval.                                                                                                                                                                                                           |
| `port is already allocated`                                 | Egy régi addon vagy más szolgáltatás foglalja a `3001`, `3443` vagy `42069` portot. Ellenőrizd a `docker ps` kimenetét, és állítsd le az ütköző példányt.                                                                                                                                               |
| A frissítés után a régi kód fut                             | A `restart` kevés. Ellenőrizd a buildet/betöltést, a `custom` taget, és használd az `up -d --force-recreate` parancsot.                                                                                                                                                                                 |
| Újra setupot kér, vagy eltűntek a felhasználók              | Másik vagy üres host könyvtár van `/addon` alá csatolva. Ellenőrizd a volume-ot; ne konfigurálj új adatbázist a mentés ellenőrzése előtt.                                                                                                                                                               |
| A web UI elérhető, a TV-n nincs lejátszás                   | A TV-ről is elérhető HTTPS addon URL kell. Ellenőrizd a DNS-t, a tanúsítványt, a tűzfalat és a device tokent.                                                                                                                                                                                           |
| nCore bejelentkezési hiba                                   | Ellenőrizd az env-fájlt, a fiók állapotát és az nCore aktuális domainjét. Env-módosítás után hozd újra létre a konténert.                                                                                                                                                                               |
| Sokáig vár a stream                                         | Kevés peer, nincs seed, lassú kapcsolat, betelt lemez vagy proxy timeout is okozhatja. Próbálj másik torrentet és nézd meg a logokat.                                                                                                                                                                   |
| `Failed to query torrent store ... timeout`, majd `503 30s` | A belső Go torrent-server nem válaszolt két 15 másodperces kérésre. Ellenőrizd a logokat és az erőforrásokat. A repositoryban javítva lett az olvasatlan processz-logpipe miatti lehetséges blokkolás, valamint megszakítható a HTTP-kéréshez kötött torrentolvasás; ehhez új image-et kell telepíteni. |
| `permission denied` az adatkönyvtárnál                      | Ellenőrizd a host könyvtár és a mentési cél jogosultságait; kérj megfelelő hozzáférést, ne adj mindenkinek írási jogot.                                                                                                                                                                                 |

Hibabejelentéshez gyűjtsd össze a commit azonosítóját, az image architektúráját és a releváns logokat. A logokból töröld a jelszavakat, cookie-kat és a `/api/auth/...` URL-ben szereplő device tokeneket. Teljes `docker inspect` vagy nem csendes `docker compose config` kimenetet ne ossz meg ellenőrzés nélkül, mert hitelesítő adatokat tartalmazhat.

## Környezeti változók

| Változó                                                                     | Jelentés / alapérték                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `NCORE_USERNAME`, `NCORE_PASSWORD`                                          | Kötelező nCore-hitelesítő adatok. A Compose a külső env-fájlból olvassa.                            |
| `ADDON_DIR`                                                                 | Kötelező adatkönyvtár; a Docker image és a Compose `/addon` értéket használ.                        |
| `PORT`                                                                      | Konténeren belüli HTTP-port, alapérték `3000`. A host portját külön a Compose portmapping adja meg. |
| `HTTPS_PORT`                                                                | Konténeren belüli HTTPS-port, alapérték `3443`.                                                     |
| `TORRENT_SERVER_PORT`                                                       | Belső Go service portja, alapérték `8080`.                                                          |
| `NCORE_URL`                                                                 | nCore alap URL, alapérték `https://ncore.pro`.                                                      |
| `NCORE_COOKIE`                                                              | Opcionális nCore-cookie. Hitelesítő adatként kezeld.                                                |
| `CINEMETA_URL`                                                              | Metadata API, alapérték `https://v3-cinemeta.strem.io`.                                             |
| `TORRENTS_DIR`                                                              | Opcionális torrentfájl-könyvtár, alapérték `${ADDON_DIR}/torrents`.                                 |
| `DOWNLOADS_DIR`                                                             | Opcionális letöltéskönyvtár, alapérték `${ADDON_DIR}/downloads`.                                    |
| `OPENSUBTITLES_API_KEY`, `OPENSUBTITLES_USERNAME`, `OPENSUBTITLES_PASSWORD` | Opcionális felirat-integráció; bekapcsolásához mindhárom érték kell.                                |

> [!NOTE]
> Egy változó beírása a Compose `--env-file` fájljába **önmagában nem továbbítja azt a konténerbe**. A repository Compose fájlja csak az ott felsorolt változókat adja át. Opcionális vagy felülírt értékhez a saját override `environment` részében is add meg a változót.

Például az override teljes tartalma opcionális OpenSubtitles-integrációval és felülírt nCore URL-lel:

```yaml
services:
  stremio-radics:
    ports:
      - '3443:3443/tcp'
    environment:
      NCORE_URL: ${NCORE_URL:-https://ncore.pro}
      OPENSUBTITLES_API_KEY: ${OPENSUBTITLES_API_KEY:-}
      OPENSUBTITLES_USERNAME: ${OPENSUBTITLES_USERNAME:-}
      OPENSUBTITLES_PASSWORD: ${OPENSUBTITLES_PASSWORD:-}
```

A megfelelő értékeket a külső `server.env` fájlba írd, és a konténert hozd újra létre. A web UI-ban megadott addonbeállítások az adatbázisban tárolódnak, nem ebben az env-fájlban.

## Gyakori kérdések és funkciók

### Mi a Stremio?

A Stremio filmek és sorozatok böngészésére és lejátszására szolgáló alkalmazás TV-re, telefonra és számítógépre. Önmagában nem biztosít minden tartalomhoz lejátszási forrást; ezeket addonok adják. [Stremio weboldal](https://www.stremio.com/), [alkalmazások letöltése](https://www.stremio.com/downloads).

### Mit ad hozzá az nCore addon?

Az nCore-fiókodat kapcsolja össze a Stremióval. A kiválasztott filmhez vagy sorozathoz nCore torrenteket keres, majd a felhasználói preferenciák szerinti sorrendben jeleníti meg a streameket. Az ajánlás nem garantálja, hogy minden torrent elérhető vagy az adott TV kodekjeivel kompatibilis.

### Funkciók

- Saját szerveren futtatható, megfelelő hálózati beállításokkal távolról is elérhető.
- A letöltött torrenteket seedeli, és a fájlokat tartósan megőrzi.
- Hit'n'run ellenőrzés alapján automatikus törlés állítható be.
- Több felhasználó és eszköz kezelhető az nCore-jelszó megosztása nélkül.
- Nyelv és felbontás alapján ajánl és rendez.
- Webes adminfelületet, torrentkezelést és LAN-os HTTPS-elérést biztosít.

### További, képernyőképes útmutatók

Az alábbi részletes leírások jelenleg angol nyelvűek. Telepítési parancsokhoz és a saját image buildjéhez ennek a README-nek a lépéseit kövesd; a régebbi leírások image-nevei vagy portjai eltérhetnek.

- [Stremio kliens beállítása](./docs/client-setup/client-setup.md)
- [Addon setup és beállítások](./docs/installation-guides/addon-settings/addon-settings.md)
- [Csak helyi hálózatos telepítés](./docs/installation-guides/beginners/local-only.md)
- [Távoli elérés saját domainnel](./docs/installation-guides/beginners/remote-with-domain.md)
- [Haladó self-hosting útmutató](./docs/installation-guides/advanced/advanced.md)

### Fejlesztési tervek

- [x] Torrentek webes adminfelülete
- [x] Torrentek rendezése felhasználói preferenciák alapján
- [x] Adatbázis és webes telepítési folyamat a legtöbb env-beállítás helyett
- [x] LAN-os HTTPS a local-ip.medicmobile.org integrációval
- [ ] További backend unit tesztek
- [ ] Frontend unit tesztek
