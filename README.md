![nCore addon](./docs/stremio-ncore-addon-banner.png)

# nCore addon

Saját szerveren futtatható Stremio addon nCore-letöltéshez és seedeléshez. [Licenc](./LICENSE.md).

> [!WARNING]
> Alpha verzió. Frissítés előtt ajánlott mentést készíteni; hiba esetén ne folytasd a következő lépéssel.

## CasaOS: csak a meglévő konténer frissítése

**A működő `stremio-radics` apphoz.** A konfiguráció, portok, volume-ok és letöltések megmaradnak. A parancsokat ugyanabban az SSH-munkamenetben futtasd.

### Egyszeri klónozás

```sh
mkdir -p ~/projects
git clone https://github.com/radicspeti017/stremio-ncore-plugin.git ~/projects/stremio-ncore-addon
```

### 1. Frissítés és build

```sh
cd /var/lib/casaos/apps/stremio-radics &&
CONTAINER=$(sudo docker compose -p stremio-radics -f docker-compose.yml ps -q stremio-radics) &&
IMAGE=$(sudo docker inspect "$CONTAINER" --format '{{.Config.Image}}') &&
cd ~/projects/stremio-ncore-addon &&
git pull --ff-only origin main &&
sudo docker build -t "$IMAGE" .
```

A régi konténer a build alatt még fut. A Git parancsokat saját felhasználóval futtasd; a Docker-parancsokhoz `sudo` kell.

### 2. Leállítás

```sh
cd /var/lib/casaos/apps/stremio-radics &&
sudo docker compose -p stremio-radics -f docker-compose.yml stop stremio-radics
```

### 3. Konténercsere

```sh
cd /var/lib/casaos/apps/stremio-radics &&
sudo docker compose -p stremio-radics -f docker-compose.yml up -d \
  --no-deps --force-recreate --pull never stremio-radics
```

### Ellenőrzés

```sh
sudo docker compose -p stremio-radics -f docker-compose.yml ps
sudo docker compose -p stremio-radics -f docker-compose.yml logs --tail=100 stremio-radics
```

Nyisd meg a megszokott web UI-t, majd próbálj lejátszást a TV-n. Ne töröld az appot vagy a volume-okat, és ne használd a CasaOS registryből frissítő Update műveletét a saját buildhez.

## Lokális build és átvitel

A lokális gépen, Intel/AMD szerverhez. A taget cseréld a szerveren kiolvasott `$IMAGE` értékére, ha eltér:

```sh
cd ~/projects/stremio-ncore-addon &&
git pull --ff-only origin main &&
sudo docker buildx build --platform linux/amd64 --load \
  -t stremio-ncore-addon:custom . &&
sudo docker save -o ../stremio-ncore-addon-image.tar stremio-ncore-addon:custom &&
scp ../stremio-ncore-addon-image.tar xedamin@radics-minipc:~/
```

A szerveren:

```sh
sudo docker load -i ~/stremio-ncore-addon-image.tar
```

Ezután a fenti **2–3. lépés** következik. Szerveren buildelve nincs szükség `save` / `load` parancsra. A `load` vagy a sima restart nem cseréli le a konténert.

## További útmutatók

- [Első telepítés és részletes üzemeltetés](./deploy/README.md)
- [Stremio kliens beállítása](./docs/client-setup/client-setup.md)
