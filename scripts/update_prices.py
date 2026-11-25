import os
import sys
import time
import json
import math
import urllib.request
import urllib.error
import urllib.parse
import gzip
import firebase_admin
from firebase_admin import credentials, firestore

CS2CAP_API_KEY = os.environ.get("CS2CAP_API_KEY")
if not CS2CAP_API_KEY:
    raise SystemExit("Falta la variable de entorno CS2CAP_API_KEY")
CS2CAP_BASE = "https://api.cs2c.app/v1"

FIREBASE_KEY_PATH = os.path.join(os.path.dirname(__file__), '..', 'firebase_key.json')

DEFAULTS = {
    "min_usd": 2.0,
    "max_usd": 1498.0,
    "min_stock": 3,
    "global_multiplier": 1.0,
}

GUARDA_MIN_ITEMS = 200
GUARDA_MAX_SIN_PRECIO = 0.4

UMBRAL_CAMBIO_PRECIO = 0.02
LIMITE_ESCRITURAS_REFRESCO = 300
LIMITE_ESCRITURAS_COMPLETO = 3000

TRAMOS_MAX = 20
TRAMO_HASTA_MAX = 1000000
TRAMO_MULT_MIN = 1
TRAMO_MULT_MAX = 3


def es_numero(v):
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return False
    try:
        return math.isfinite(v)
    except OverflowError:
        return False


def tramos_validos(crudo):
    if crudo is None:
        return []
    if not isinstance(crudo, list) or len(crudo) > TRAMOS_MAX:
        return None
    tramos = []
    for t in crudo:
        if not isinstance(t, dict):
            return None
        hasta = t.get("hasta")
        mult = t.get("multiplicador")
        if not es_numero(hasta) or hasta <= 0 or hasta > TRAMO_HASTA_MAX:
            return None
        if not es_numero(mult) or mult < TRAMO_MULT_MIN or mult > TRAMO_MULT_MAX:
            return None
        tramos.append({"hasta": hasta, "multiplicador": mult})
    tramos.sort(key=lambda t: t["hasta"])
    for a, b in zip(tramos, tramos[1:]):
        if a["hasta"] == b["hasta"]:
            return None
    return tramos


def multiplicador_de(costo, cfg):
    elegido = None
    for t in cfg.get("tramos_precio") or []:
        if costo <= t["hasta"] and (elegido is None or t["hasta"] < elegido["hasta"]):
            elegido = t
    return elegido["multiplicador"] if elegido else cfg["global_multiplier"]


COLLECTIBLE_TYPES = [
    ("Sticker",     None,  "sticker"),
    ("Charm",       None,  "charm"),
    ("Music Kit",   None,  "musickit"),
    ("Collectible", "Pin", "pin"),
    ("Patch",       None,  "patch"),
    ("Graffiti",    None,  "graffiti"),
]

EXCLUDE_WEAPON_TYPES = {"Machinegun"}
EXCLUDE_NAMES = {"Zeus x27"}

SNAPSHOT_VERSION = 2
SNAPSHOT_COLS = ["id", "n", "c", "w", "r", "img", "st", "p", "q", "yp"]
SNAPSHOT_IMG_PREFIX = "https://cdn.cs2c.app/images/econ/"
SNAPSHOT_CHUNK_BUDGET = 700_000

CATEGORY_MAP = {
    "Assault Rifle": "rifle",
    "Sniper Rifle": "sniper",
    "Pistol": "pistol",
    "SMG": "smg",
    "Knife": "knife",
    "Wearable": "gloves",
    "Shotgun": "shotgun",
}

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def http(method, path, body=None, retries=3):
    url = CS2CAP_BASE + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "Authorization": f"Bearer {CS2CAP_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": UA,
    }
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return resp.status, json.loads(raw)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", "10"))
                print(f"  rate limit, esperando {retry_after}s...")
                time.sleep(retry_after)
                continue
            if e.code in (401, 403):
                raise SystemExit(f"Auth error {e.code}: {err_body}")
            last_err = e
            print(f"  http {e.code}, retry {attempt}/{retries}")
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            last_err = e
            print(f"  net error, retry {attempt}/{retries}: {e}")
        time.sleep(2 ** attempt)
    raise SystemExit(f"Falló después de {retries} reintentos: {last_err}")

def init_firebase():
    print("[1/6] firebase")
    if os.path.exists(FIREBASE_KEY_PATH):
        cred = credentials.Certificate(FIREBASE_KEY_PATH)
    elif os.environ.get("FIREBASE_KEY_JSON"):
        cred = credentials.Certificate(json.loads(os.environ["FIREBASE_KEY_JSON"]))
    else:
        raise SystemExit("Sin credenciales Firebase")
    firebase_admin.initialize_app(cred)
    return firestore.client()

def load_settings(db):
    print("[2/6] config")
    cfg = dict(DEFAULTS)
    cfg["tramos_precio"] = []
    try:
        doc = db.collection("config").document("settings").get()
        if doc.exists:
            data = doc.to_dict()
            for k in DEFAULTS:
                if k in data:
                    cfg[k] = data[k]
            tramos = tramos_validos(data.get("tramos_precio"))
            if tramos is None:
                print("  WARN: tramos_precio no es valido, no se usa ningun tramo")
            else:
                cfg["tramos_precio"] = tramos
            print(f"  custom: ${cfg['min_usd']}-${cfg['max_usd']}, stock>={cfg['min_stock']}, tramos: {len(cfg['tramos_precio'])}")
        else:
            print("  defaults")
    except Exception as e:
        print(f"  error leyendo config, defaults: {e}")
    return cfg

def should_full_scan(db, force=False):
    if force:
        return True
    try:
        doc = db.collection("config").document("last_update").get()
        if not doc.exists:
            return True
        data = doc.to_dict()
        last_full = data.get("last_full_scan")
        if not last_full:
            return True
        from datetime import datetime, timezone
        if hasattr(last_full, "timestamp"):
            elapsed_h = (datetime.now(timezone.utc).timestamp() - last_full.timestamp()) / 3600
        else:
            return True
        print(f"  ultimo full scan hace {elapsed_h:.1f}h")
        return elapsed_h >= 23
    except Exception as e:
        print(f"  error: {e}")
        return True

def fetch_full_catalog():
    print("  scaneando catalogo de cs2cap...")
    candidates = {}
    
    print("  weapons...")
    offset = 0
    while True:
        code, data = http("GET", f"/items?item_type=Weapon&limit=500&offset={offset}")
        items = data.get("items", [])
        if not items:
            break
        for it in items:
            if it.get("is_souvenir"):
                continue
            wt = it.get("weapon_type")
            if not wt or wt in EXCLUDE_WEAPON_TYPES:
                continue
            name = it.get("market_hash_name", "")
            if any(ex in name for ex in EXCLUDE_NAMES):
                continue
            if wt == "Knife" and it.get("is_stattrak"):
                continue
            cat = CATEGORY_MAP.get(wt)
            if not cat:
                continue
            candidates[it["item_id"]] = {
                "item_id": it["item_id"],
                "market_hash_name": name,
                "category": cat,
                "wear": it.get("wear_name"),
                "rarity": it.get("rarity_name"),
                "rarity_color": it.get("rarity_color"),
                "image_url": it.get("image_url"),
                "is_stattrak": bool(it.get("is_stattrak")),
                "weapon_type": wt,
                "base_name": it.get("base_name"),
                "skin_name": it.get("skin_name"),
            }
        pag = data.get("pagination", {})
        if not pag.get("has_next"):
            break
        offset += len(items)
        print(f"    {offset} weapons procesados")
    
    print(f"  {len(candidates)} weapons candidatos")
    
    print("  agents...")
    offset = 0
    agent_count = 0
    while True:
        code, data = http("GET", f"/items?item_type=Agent&limit=500&offset={offset}")
        items = data.get("items", [])
        if not items:
            break
        for it in items:
            if it.get("is_souvenir"):
                continue
            candidates[it["item_id"]] = {
                "item_id": it["item_id"],
                "market_hash_name": it.get("market_hash_name", ""),
                "category": "agent",
                "wear": None,
                "rarity": it.get("rarity_name"),
                "rarity_color": it.get("rarity_color"),
                "image_url": it.get("image_url"),
                "is_stattrak": False,
                "weapon_type": None,
                "base_name": it.get("base_name"),
                "skin_name": it.get("skin_name"),
            }
            agent_count += 1
        pag = data.get("pagination", {})
        if not pag.get("has_next"):
            break
        offset += len(items)
    print(f"  {agent_count} agents")

    for api_type, subtipo, cat_name in COLLECTIBLE_TYPES:
        print(f"  {cat_name}s...")
        offset = 0
        count = 0
        while True:
            params = {"item_type": api_type, "limit": 500, "offset": offset}
            if subtipo:
                params["item_subtype"] = subtipo
            code, data = http("GET", "/items?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote))
            items = data.get("items", [])
            if not items:
                break
            for it in items:
                if it.get("is_souvenir"):
                    continue
                candidates[it["item_id"]] = {
                    "item_id": it["item_id"],
                    "market_hash_name": it.get("market_hash_name", ""),
                    "category": cat_name,
                    "wear": None,
                    "rarity": it.get("rarity_name"),
                    "rarity_color": it.get("rarity_color"),
                    "image_url": it.get("image_url"),
                    "is_stattrak": bool(it.get("is_stattrak")),
                    "weapon_type": None,
                    "base_name": it.get("base_name"),
                    "skin_name": it.get("skin_name"),
                }
                count += 1
            pag = data.get("pagination", {})
            if not pag.get("has_next"):
                break
            offset += len(items)
        print(f"  {count} {cat_name}s")

    return candidates

def fetch_existing_from_snapshot(db):
    meta = db.collection("catalog").document("meta").get()
    if not meta.exists:
        return None
    m = meta.to_dict() or {}
    chunks = int(m.get("chunks") or 0)
    if not chunks:
        return None
    prefix = m.get("img_prefix") or SNAPSHOT_IMG_PREFIX
    items = {}
    for i in range(chunks):
        d = db.collection("catalog").document(f"chunk_{i}").get()
        if not d.exists:
            return None
        for r in json.loads(d.to_dict().get("data") or "[]"):
            items[r[0]] = {
                "item_id": r[0],
                "market_hash_name": r[1],
                "category": r[2],
                "wear": r[3] or None,
                "rarity": r[4] or None,
                "image_url": (prefix + r[5]) if r[5] else None,
                "is_stattrak": bool(r[6]),
                "final_price_usdt": r[7],
                "youpin_quantity": r[8],
                "youpin_price_usd": r[9] if len(r) > 9 else None,
            }
    print(f"  {len(items)} items leidos del snapshot ({chunks + 1} lecturas)")
    return items


def fetch_existing_catalog(db):
    print("  leyendo catalogo actual de firestore...")
    items = {}
    for d in db.collection("prices").stream():
        data = d.to_dict()
        if "item_id" in data:
            items[data["item_id"]] = data
    print(f"  {len(items)} items en firestore")
    return items

def fetch_youpin_prices(item_ids):
    print(f"  pidiendo precios buff para {len(item_ids)} items...")
    prices = {}
    batch_size = 100
    total_batches = (len(item_ids) + batch_size - 1) // batch_size
    
    for i in range(0, len(item_ids), batch_size):
        batch = item_ids[i:i + batch_size]
        batch_num = i // batch_size + 1
        code, data = http("POST", "/prices/batch", {
            "item_ids": batch,
            "providers": ["buff163"],
            "currency": "USD",
        })
        for it in data.get("items", []):
            quotes = it.get("quotes", [])
            yp = next((q for q in quotes if q.get("provider") == "buff163"), None)
            if yp:
                prices[str(it["item_id"])] = {
                    "lowest_ask": yp.get("lowest_ask"),
                    "quantity": yp.get("quantity"),
                    "last_updated": yp.get("last_updated"),
                }
        if batch_num % 10 == 0 or batch_num == total_batches:
            print(f"    batch {batch_num}/{total_batches}, items con precio: {len(prices)}")
        time.sleep(1.5)
    
    return prices

def faltan_demasiados(existing, prices):
    previos = [str(k) for k, v in (existing or {}).items() if (v or {}).get("final_price_usdt")]
    if len(previos) < GUARDA_MIN_ITEMS:
        return False
    con_precio = {str(k) for k, v in (prices or {}).items() if (v or {}).get("lowest_ask") is not None}
    sin = sum(1 for k in previos if k not in con_precio)
    return sin > len(previos) * GUARDA_MAX_SIN_PRECIO


def filter_and_price(candidates, prices, cfg):
    print("[5/6] filtrando y aplicando markups...")
    final_items = []
    by_cat = {}
    excluded = {"sin_precio": 0, "stock": 0, "price_low": 0, "price_high": 0}
    excluded_by_cat = {"sin_precio": {}, "stock": {}, "price_low": {}, "price_high": {}}

    def bump(reason, cat):
        excluded[reason] += 1
        d = excluded_by_cat[reason]
        d[cat] = d.get(cat, 0) + 1

    min_cents = int(cfg["min_usd"] * 100)
    max_cents = int(cfg["max_usd"] * 100)

    for item_id, info in candidates.items():
        cat = info["category"]
        p = prices.get(str(item_id))
        if not p:
            bump("sin_precio", cat)
            continue
        ask = p.get("lowest_ask")
        qty = p.get("quantity") or 0
        if ask is None:
            bump("sin_precio", cat)
            continue
        if qty < cfg["min_stock"]:
            bump("stock", cat)
            continue
        if ask < min_cents:
            bump("price_low", cat)
            continue
        if ask > max_cents:
            bump("price_high", cat)
            continue

        ask_usd = ask / 100.0
        mult = multiplicador_de(ask_usd, cfg)
        final_usdt = round(ask_usd * mult, 2)
        
        final_items.append({
            **info,
            "youpin_price_usd": round(ask_usd, 2),
            "youpin_price_cents": ask,
            "youpin_quantity": qty,
            "youpin_last_updated": p.get("last_updated"),
            "markup_applied": round(mult, 4),
            "final_price_usdt": final_usdt,
            "updated_at": firestore.SERVER_TIMESTAMP,
        })
        by_cat[cat] = by_cat.get(cat, 0) + 1
    
    print(f"  validos: {len(final_items)}")
    for cat, n in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"    {cat}: {n}")
    print(f"  excluidos:")
    for k, v in excluded.items():
        if v:
            print(f"    {k}: {v}")
    for reason in ("sin_precio", "price_low", "stock"):
        d = excluded_by_cat[reason]
        if d:
            top = ", ".join(f"{c}:{n}" for c, n in sorted(d.items(), key=lambda x: -x[1]))
            print(f"  excluidos[{reason}] por categoria: {top}")

    return final_items, by_cat

def build_snapshot_rows(items):
    rows = []
    for it in items:
        img = it.get("image_url") or ""
        if img.startswith(SNAPSHOT_IMG_PREFIX):
            img = img[len(SNAPSHOT_IMG_PREFIX):]
        rows.append([
            str(it["item_id"]),
            it.get("market_hash_name") or "",
            it.get("category") or "",
            it.get("wear") or "",
            it.get("rarity") or "",
            img,
            1 if it.get("is_stattrak") else 0,
            it.get("final_price_usdt"),
            it.get("youpin_quantity") or 0,
            it.get("youpin_price_usd"),
        ])
    return rows


def chunk_rows(rows):
    chunks = []
    current = []
    size = 2
    for row in rows:
        row_len = len(json.dumps(row, separators=(",", ":"), ensure_ascii=False)) + 1
        if current and size + row_len > SNAPSHOT_CHUNK_BUDGET:
            chunks.append(current)
            current = []
            size = 2
        current.append(row)
        size += row_len
    if current:
        chunks.append(current)
    return chunks


def write_catalog_snapshot(db, items):
    print("  publicando snapshot del catalogo...")
    coll = db.collection("catalog")
    rows = build_snapshot_rows(items)
    chunks = chunk_rows(rows)

    total_bytes = 0
    for i, chunk in enumerate(chunks):
        payload = json.dumps(chunk, separators=(",", ":"), ensure_ascii=False)
        total_bytes += len(payload.encode("utf-8"))
        coll.document(f"chunk_{i}").set({"data": payload})

    coll.document("meta").set({
        "version": SNAPSHOT_VERSION,
        "chunks": len(chunks),
        "total_items": len(rows),
        "cols": SNAPSHOT_COLS,
        "img_prefix": SNAPSHOT_IMG_PREFIX,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })

    for d in coll.stream():
        if not d.id.startswith("chunk_"):
            continue
        try:
            idx = int(d.id.split("_", 1)[1])
        except ValueError:
            continue
        if idx >= len(chunks):
            d.reference.delete()

    avg = total_bytes / len(rows) if rows else 0
    print(f"    {len(rows)} items en {len(chunks)} chunks, {total_bytes/1024/1024:.2f} MB ({avg:.0f} B/item)")
    return len(chunks)


def cambio_de(antes, item, completo):
    if not antes:
        return math.inf
    precio_antes = float(antes.get("final_price_usdt") or 0)
    if precio_antes <= 0:
        return math.inf
    misma_meta = (
        (antes.get("market_hash_name") or "") == (item.get("market_hash_name") or "")
        and (antes.get("category") or "") == (item.get("category") or "")
        and (antes.get("wear") or None) == (item.get("wear") or None)
        and (antes.get("image_url") or "") == (item.get("image_url") or "")
        and bool(antes.get("is_stattrak")) == bool(item.get("is_stattrak"))
    )
    if not misma_meta:
        return math.inf
    diferencia = abs(float(item["final_price_usdt"]) - precio_antes)
    if diferencia < 0.005:
        return None
    relativo = diferencia / precio_antes
    if not completo and relativo < UMBRAL_CAMBIO_PRECIO:
        return None
    return relativo


def conservado(item, antes):
    return {
        **item,
        "final_price_usdt": antes.get("final_price_usdt"),
        "youpin_price_usd": antes.get("youpin_price_usd"),
    }


def huella_precios(cfg):
    return json.dumps({"global": cfg["global_multiplier"], "tramos": cfg.get("tramos_precio") or []}, sort_keys=True)


def huella_rango(cfg):
    return json.dumps({"min": float(cfg["min_usd"]), "max": float(cfg["max_usd"])}, sort_keys=True)


def leer_ultima_actualizacion(db):
    try:
        doc = db.collection("config").document("last_update").get()
        return (doc.to_dict() or {}) if doc.exists else {}
    except Exception as e:
        print(f"  error leyendo la configuracion anterior: {e}")
        return None


def write_to_firestore(db, items, is_full_scan, by_cat, previo=None, completo=False, huella=None, rango=None):
    print("[6/6] guardando en firestore...")
    coll = db.collection("prices")
    previo = previo or {}

    if is_full_scan:
        vivos = {str(it["item_id"]) for it in items}
        muertos = [k for k in previo.keys() if str(k) not in vivos]
        if muertos:
            print(f"  borrando {len(muertos)} items que salieron del catalogo...")
            batch = db.batch()
            n = 0
            for k in muertos:
                batch.delete(coll.document(str(k)))
                n += 1
                if n >= 500:
                    batch.commit(); batch = db.batch(); n = 0
            if n:
                batch.commit()
        else:
            print("  no salio ningun item del catalogo")

    print("  escribiendo solo lo que cambio...")
    pendientes = []
    publicados = []
    igual = 0
    for item in items:
        doc_id = str(item["item_id"])
        antes = previo.get(doc_id) or previo.get(item["item_id"])
        cambio = cambio_de(antes, item, completo)
        if cambio is None:
            igual += 1
            publicados.append(conservado(item, antes))
        else:
            pendientes.append((cambio, doc_id, item, antes))

    pendientes.sort(key=lambda p: -p[0])
    limite = LIMITE_ESCRITURAS_COMPLETO if is_full_scan else LIMITE_ESCRITURAS_REFRESCO
    if not completo and len(pendientes) > limite:
        print(f"  {len(pendientes) - limite} cambios quedan para la proxima vuelta")
        for _, _, item, antes in pendientes[limite:]:
            if antes:
                publicados.append(conservado(item, antes))
        pendientes = pendientes[:limite]

    batch = db.batch()
    n = 0
    written = 0
    for _, doc_id, item, _ in pendientes:
        batch.set(coll.document(doc_id), {k: v for k, v in item.items() if v is not None}, merge=True)
        publicados.append(item)
        n += 1
        if n >= 500:
            batch.commit()
            written += n
            print(f"    {written} escritos")
            batch = db.batch()
            n = 0
    if n > 0:
        batch.commit()
        written += n
    print(f"  escritos: {written} · sin cambios (no se tocaron): {igual}")

    write_catalog_snapshot(db, publicados)

    update_data = {
        "timestamp": firestore.SERVER_TIMESTAMP,
        "total_items": len(items),
        "by_category": by_cat,
        "source": os.environ.get("GITHUB_ACTIONS_RUN", "manual"),
    }
    if is_full_scan:
        update_data["last_full_scan"] = firestore.SERVER_TIMESTAMP
    if huella:
        update_data["huella_precios"] = huella
    if rango:
        update_data["rango_precios"] = rango
    
    db.collection("config").document("last_update").set(update_data, merge=True)
    
    db.collection("config").document("heartbeat").set({
        "last_run": firestore.SERVER_TIMESTAMP,
        "status": "ok",
        "items_written": written,
        "mode": "full_scan" if is_full_scan else "refresh",
        "source": os.environ.get("GITHUB_ACTIONS_RUN", "manual"),
    })
    
    return written

def main():
    force_full = "--full" in sys.argv
    snapshot_only = "--snapshot-only" in sys.argv

    db = init_firebase()

    if snapshot_only:
        print("modo SNAPSHOT-ONLY (no toca precios ni 'prices')")
        existing = fetch_existing_catalog(db)
        items = [v for v in existing.values() if v.get("final_price_usdt")]
        if not items:
            print("WARN: no hay items con precio, no publico nada.")
            sys.exit(1)
        write_catalog_snapshot(db, items)
        print(f"\nlisto: snapshot publicado con {len(items)} items")
        return

    cfg = load_settings(db)
    ultima = leer_ultima_actualizacion(db)
    huella = huella_precios(cfg)
    rango = huella_rango(cfg)
    completo = ultima is not None and ultima.get("huella_precios") != huella
    cambio_rango = bool(ultima) and ultima.get("rango_precios") not in (None, rango)

    print("[3/6] modo")
    is_full = should_full_scan(db, force_full)
    if not is_full and cambio_rango:
        print("  cambio el rango de precios: se revisa el catalogo completo")
        is_full = True
    print(f"  modo: {'FULL SCAN' if is_full else 'REFRESH'}")
    
    print("[4/6] candidatos + precios")
    existing = {}
    if is_full:
        candidates = fetch_full_catalog()
        existing = fetch_existing_from_snapshot(db) or {}
    else:
        existing = fetch_existing_from_snapshot(db)
        if existing is None:
            print("  sin snapshot todavia, leyendo la coleccion completa")
            existing = fetch_existing_catalog(db)
        candidates = {}
        for item_id, data in existing.items():
            if isinstance(item_id, str) and item_id.isdigit():
                item_id = int(item_id)
            candidates[item_id] = {
                "item_id": item_id,
                "market_hash_name": data.get("market_hash_name", ""),
                "category": data.get("category"),
                "wear": data.get("wear"),
                "rarity": data.get("rarity"),
                "rarity_color": data.get("rarity_color"),
                "image_url": data.get("image_url"),
                "is_stattrak": data.get("is_stattrak", False),
                "weapon_type": data.get("weapon_type"),
                "base_name": data.get("base_name"),
                "skin_name": data.get("skin_name"),
            }
        if not candidates:
            print("  sin items en firestore, forzando full scan")
            candidates = fetch_full_catalog()
            is_full = True

    item_ids = sorted(candidates.keys())
    prices = fetch_youpin_prices(item_ids)

    if not force_full and faltan_demasiados(existing, prices):
        print("\nWARN: faltan precios de demasiados items del catalogo actual. No se escribe nada.")
        db.collection("config").document("heartbeat").set({
            "last_run": firestore.SERVER_TIMESTAMP,
            "status": "warning",
            "items_written": 0,
            "mode": "full_scan" if is_full else "refresh",
            "note": "Too many items without price",
        })
        sys.exit(1)
    
    final_items, by_cat = filter_and_price(candidates, prices, cfg)
    
    if not final_items:
        print("\nWARN: 0 items finales. No escribiendo en firestore para no borrar todo.")
        db.collection("config").document("heartbeat").set({
            "last_run": firestore.SERVER_TIMESTAMP,
            "status": "warning",
            "items_written": 0,
            "mode": "full_scan" if is_full else "refresh",
            "note": "Zero items after filtering",
        })
        sys.exit(1)
    
    if completo:
        print("  cambio la configuracion de precios: se actualizan todos los precios")
    written = write_to_firestore(db, final_items, is_full, by_cat, previo=existing, completo=completo, huella=huella, rango=rango)
    print(f"\nlisto: {written} items en firestore")

if __name__ == "__main__":
    main()
